// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const db = cloud.database()
    
    try {
        // 获取参数
        const { item_id, item_num, type } = event
        
        console.log('submit_item_union 参数:', {
            item_id,
            item_num,
            type,
            openid: wxContext.OPENID
        })
        
        // 参数验证
        if (!item_id || item_num === undefined || !type) {
            return {
                success: false,
                message: '参数不完整：item_id、item_num、type为必填参数'
            }
        }
        
        // 验证合成参数
        if (item_id !== 6 || item_num !== 5 || type !== 4) {
            return {
                success: false,
                message: '无效的合成参数：item_id必须为6，item_num必须为5，type必须为4'
            }
        }
        
        // 获取用户ID
        const userResult = await db.collection('users').where({
            openid: wxContext.OPENID
        }).get()
        
        if (userResult.data.length === 0) {
            return {
                success: false,
                message: '用户不存在'
            }
        }
        
        const userId = userResult.data[0].id
        const currentTime = Math.floor(Date.now() / 1000)
        
        // 检查用户是否拥有足够的碎片
        const fragmentResult = await db.collection('user_item').where({
            user_id: userId,
            item_id: 6
        }).get()
        
        if (fragmentResult.data.length === 0) {
            return {
                success: false,
                message: '完成合成需要5个碎片'
            }
        }
        
        const userFragment = fragmentResult.data[0]
        if (userFragment.num < 5) {
            return {
                success: false,
                message: '完成合成需要5个碎片'
            }
        }
        
        // 开始数据库事务处理
        const transaction = await db.startTransaction()
        
        try {
            // 1. 减少碎片数量（item_id=6，num减5）
            await transaction.collection('user_item').where({
                user_id: userId,
                item_id: 6
            }).update({
                data: {
                    num: db.command.inc(-5)
                }
            })
            
            // 2. 增加道具数量（item_id=5，num加1）
            const targetItemResult = await transaction.collection('user_item').where({
                user_id: userId,
                item_id: 5
            }).get()
            
            if (targetItemResult.data.length > 0) {
                // 如果记录存在，增加数量
                await transaction.collection('user_item').where({
                    user_id: userId,
                    item_id: 5
                }).update({
                    data: {
                        num: db.command.inc(1)
                    }
                })
            } else {
                // 如果记录不存在，创建新记录
                await transaction.collection('user_item').add({
                    data: {
                        user_id: userId,
                        item_id: 5,
                        num: 1,
                        ctime: currentTime
                    }
                })
            }
            
            // 3. 记录碎片消耗日志
            await transaction.collection('user_item_log').add({
                data: {
                    user_id: userId,
                    item_id: 6,
                    item_num: 5,
                    type: 2, // 减少
                    type_content: '合成道具',
                    cost: 0,
                    ctime: currentTime
                }
            })
            
            // 4. 记录道具获得日志
            await transaction.collection('user_item_log').add({
                data: {
                    user_id: userId,
                    item_id: 5,
                    item_num: 1,
                    type: 1, // 增加
                    type_content: '合成道具',
                    cost: 0,
                    ctime: currentTime
                }
            })
            
            // 提交事务
            await transaction.commit()
            
            console.log('submit_item_union 合成成功:', {
                user_id: userId,
                fragment_consumed: 5,
                item_gained: 1
            })
            
            // 新增：处理合成道具的成就逻辑
            try {
                await updateUnionAchievements(db, userId)
            } catch (error) {
                console.error('更新合成成就失败:', error)
                // 这里不返回错误，因为主要功能已经完成
            }
            
            return {
                success: true,
                message: '碎片合成成功',
                openid: wxContext.OPENID,
                appid: wxContext.APPID,
                unionid: wxContext.UNIONID,
            }
            
        } catch (transactionError) {
            // 回滚事务
            await transaction.rollback()
            console.error('submit_item_union 事务失败:', transactionError)
            throw transactionError
        }
        
    } catch (error) {
        console.error('submit_item_union error:', error)
        return {
            success: false,
            message: '合成失败：' + error.message
        }
    }
}

// 更新合成道具相关成就
async function updateUnionAchievements(db, userId) {
    try {
        const achievementIds = [46, 47, 48, 49]
        
        // 首先检查是否所有成就都已经达成
        const allAchievementsResult = await db.collection('user_achievement')
            .where({
                user_id: userId,
                achievement_id: db.command.in(achievementIds)
            })
            .get()
        
        // 如果所有成就都已经达成，直接返回
        if (allAchievementsResult.data.length === achievementIds.length) {
            const allAchieved = allAchievementsResult.data.every(achievement => achievement.is_achieved === 1)
            if (allAchieved) {
                console.log('所有合成成就都已达成，跳过更新')
                return
            }
        }
        
        for (const achievementId of achievementIds) {
            // 获取用户成就记录
            const userAchievementResult = await db.collection('user_achievement')
                .where({
                    user_id: userId,
                    achievement_id: achievementId
                })
                .get()
            
            if (userAchievementResult.data.length > 0) {
                const userAchievement = userAchievementResult.data[0]
                
                // 如果已经达成，跳过
                if (userAchievement.is_achieved === 1) {
                    continue
                }
                
                // 更新num值
                const newNum = (userAchievement.num || 0) + 1
                
                // 获取成就配置
                const basicAchievementResult = await db.collection('basic_achievements')
                    .where({
                        id: achievementId
                    })
                    .get()
                
                if (basicAchievementResult.data.length > 0) {
                    const basicAchievement = basicAchievementResult.data[0]
                    const needValue = basicAchievement.need || 0
                    
                    // 检查是否达成
                    const isAchieved = newNum >= needValue ? 1 : 0
                    
                    // 更新用户成就记录
                    await db.collection('user_achievement')
                        .where({
                            user_id: userId,
                            achievement_id: achievementId
                        })
                        .update({
                            data: {
                                num: newNum,
                                is_achieved: isAchieved
                            }
                        })
                    
                    console.log(`合成成就${achievementId}更新成功: num=${newNum}, is_achieved=${isAchieved}`)
                }
            } else {
                // 创建新的用户成就记录
                const basicAchievementResult = await db.collection('basic_achievements')
                    .where({
                        id: achievementId
                    })
                    .get()
                
                if (basicAchievementResult.data.length > 0) {
                    const basicAchievement = basicAchievementResult.data[0]
                    const needValue = basicAchievement.need || 0
                    const isAchieved = 1 >= needValue ? 1 : 0
                    
                    await db.collection('user_achievement').add({
                        data: {
                            user_id: userId,
                            achievement_id: achievementId,
                            num: 1,
                            is_achieved: isAchieved
                        }
                    })
                    
                    console.log(`合成成就${achievementId}创建成功: num=1, is_achieved=${isAchieved}`)
                }
            }
        }
        
        console.log('合成道具成就更新完成')
    } catch (error) {
        console.error('更新合成道具成就失败:', error)
    }
}
