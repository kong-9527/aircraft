// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
    try {
        const wxContext = cloud.getWXContext()
        const db = cloud.database()
        
        // 获取用户openid和参数
        const openid = wxContext.OPENID
        const { newgift_id } = event
        
        // 参数验证
        if (!newgift_id) {
            return {
                success: false,
                message: '缺少必要参数：newgift_id'
            }
        }
        
        // 1. 查询该新人礼任务是否存在
        const newgiftResult = await db.collection('basic_newgifts')
            .where({
                id: newgift_id
            })
            .get()
        
        if (newgiftResult.data.length === 0) {
            return {
                success: false,
                message: '新人礼任务不存在'
            }
        }
        
        // 2. 查询该任务的奖励物品列表
        const rewardListResult = await db.collection('basic_newgift_rewardlist')
            .where({
                newgift_id: newgift_id
            })
            .get()
        
        if (rewardListResult.data.length === 0) {
            return {
                success: false,
                message: '该新人礼任务没有奖励物品'
            }
        }
        
        // 3. 检查用户是否已经领取过该奖励
        const userNewgiftResult = await db.collection('user_newgift')
            .where({
                user_id: openid,
                newgift_id: newgift_id
            })
            .get()
        
        if (userNewgiftResult.data.length > 0) {
            const userNewgift = userNewgiftResult.data[0]
            if (userNewgift.is_collected === 1) {
                return {
                    success: false,
                    message: '该新人礼奖励已经领取过了'
                }
            }
        }
        
        // 4. 更新或创建user_newgift记录
        if (userNewgiftResult.data.length === 0) {
            // 创建新记录
            await db.collection('user_newgift').add({
                data: {
                    user_id: openid,
                    newgift_id: newgift_id,
                    is_achieved: 1, // 假设用户能领取说明已经达成了
                    is_collected: 1
                }
            })
        } else {
            // 更新现有记录
            await db.collection('user_newgift')
                .where({
                    user_id: openid,
                    newgift_id: newgift_id
                })
                .update({
                    data: {
                        is_collected: 1
                    }
                })
        }
        
        // 5. 为每个奖励物品更新用户物品数量
        const updatedItems = []
        for (const reward of rewardListResult.data) {
            const { item_id, item_num } = reward
            
            // 查询用户是否已有该物品
            const userItemResult = await db.collection('user_item')
                .where({
                    user_id: openid,
                    item_id: item_id
                })
                .get()
            
            if (userItemResult.data.length === 0) {
                // 创建新记录
                await db.collection('user_item').add({
                    data: {
                        user_id: openid,
                        item_id: item_id,
                        item_num: item_num
                    }
                })
            } else {
                // 更新现有记录
                const currentItem = userItemResult.data[0]
                const newItemNum = (currentItem.item_num || 0) + item_num
                
                await db.collection('user_item')
                    .where({
                        user_id: openid,
                        item_id: item_id
                    })
                    .update({
                        data: {
                            item_num: newItemNum
                        }
                    })
            }
            
            updatedItems.push({
                item_id: item_id,
                item_num: item_num
            })
        }
        
        // 6. 直接记录日志到user_item_log表
        try {
            // 获取用户ID
            const userResult = await db.collection('users').where({
                openid: openid
            }).get()
            
            if (userResult.data.length > 0) {
                const userId = userResult.data[0].id
                const currentTime = Math.floor(Date.now() / 1000)
                
                // 为每个奖励物品记录日志
                for (const item of updatedItems) {
                    await db.collection('user_item_log').add({
                        data: {
                            user_id: userId,
                            item_id: item.item_id,
                            item_num: item.item_num,
                            type: 1, // 增加
                            type_content: '3领取奖励',
                            ctime: currentTime
                        }
                    })
                }
                
                console.log('新人礼奖励日志记录成功')
            }
        } catch (error) {
            console.error('记录新人礼奖励日志失败:', error)
            // 这里不返回错误，因为主要功能已经完成
        }
        
        // 7. 新增：处理邀请人的新人礼和成就逻辑
        if (newgift_id === 1) {
            try {
                // 查询当前用户信息，检查是否有邀请人
                const currentUserResult = await db.collection('users')
                    .where({
                        openid: openid
                    })
                    .get()
                
                if (currentUserResult.data.length > 0) {
                    const currentUser = currentUserResult.data[0]
                    
                    // 检查是否有邀请码且不是自己邀请自己
                    if (currentUser.invited_code && currentUser.invited_code !== openid) {
                        const inviterOpenid = currentUser.invited_code
                        
                        // 7.1 为邀请人完成新人礼任务 id=9
                        const inviterNewgiftResult = await db.collection('user_newgift')
                            .where({
                                user_id: inviterOpenid,
                                newgift_id: 9
                            })
                            .get()
                        
                        if (inviterNewgiftResult.data.length === 0) {
                            // 创建邀请人的新人礼记录
                            await db.collection('user_newgift').add({
                                data: {
                                    user_id: inviterOpenid,
                                    newgift_id: 9,
                                    is_achieved: 1,
                                    is_collected: 0
                                }
                            })
                        } else {
                            // 更新邀请人的新人礼记录
                            await db.collection('user_newgift')
                                .where({
                                    user_id: inviterOpenid,
                                    newgift_id: 9
                                })
                                .update({
                                    data: {
                                        is_achieved: 1
                                    }
                                })
                        }
                        
                        // 7.2 为邀请人更新成就进度
                        const achievementIds = [56, 57, 58]
                        
                        for (const achievementId of achievementIds) {
                            // 查询邀请人的成就记录
                            const inviterAchievementResult = await db.collection('user_achievement')
                                .where({
                                    user_id: inviterOpenid,
                                    achievement_id: achievementId
                                })
                                .get()
                            
                            if (inviterAchievementResult.data.length === 0) {
                                // 创建邀请人的成就记录
                                await db.collection('user_achievement').add({
                                    data: {
                                        user_id: inviterOpenid,
                                        achievement_id: achievementId,
                                        num: 1,
                                        is_achieved: 0
                                    }
                                })
                            } else {
                                // 更新邀请人的成就记录
                                const currentAchievement = inviterAchievementResult.data[0]
                                const newNum = (currentAchievement.num || 0) + 1
                                
                                // 查询成就配置，判断是否达到完成条件
                                const basicAchievementResult = await db.collection('basic_achievements')
                                    .where({
                                        id: achievementId
                                    })
                                    .get()
                                
                                let isAchieved = 0
                                if (basicAchievementResult.data.length > 0) {
                                    const needValue = basicAchievementResult.data[0].need || 0
                                    if (newNum >= needValue) {
                                        isAchieved = 1
                                    }
                                }
                                
                                await db.collection('user_achievement')
                                    .where({
                                        user_id: inviterOpenid,
                                        achievement_id: achievementId
                                    })
                                    .update({
                                        data: {
                                            num: newNum,
                                            is_achieved: isAchieved
                                        }
                                    })
                            }
                        }
                        
                        console.log('邀请人新人礼和成就更新成功')
                    }
                }
            } catch (error) {
                console.error('处理邀请人新人礼和成就失败:', error)
                // 这里不返回错误，因为主要功能已经完成
            }
        }
        
        return {
            success: true,
            message: '新人礼奖励领取成功',
            data: {
                newgift_id: newgift_id,
                rewards: updatedItems
            },
            openid: openid,
            appid: wxContext.APPID,
            unionid: wxContext.UNIONID
        }
        
    } catch (error) {
        console.error('领取新人礼奖励失败:', error)
        return {
            success: false,
            message: '领取新人礼奖励失败: ' + error.message,
            error: error.message
        }
    }
}