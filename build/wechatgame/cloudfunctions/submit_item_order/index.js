// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const db = cloud.database()
    
    try {
        // 获取参数
        const { item_id, item_num, type, currency, cost } = event
        
        console.log('submit_item_order 参数:', {
            item_id,
            item_num,
            type,
            currency,
            cost,
            openid: wxContext.OPENID
        })
        
        // 参数验证
        if (!item_id || item_num === undefined || !type) {
            return {
                success: false,
                message: '参数不完整：item_id、item_num、type为必填参数'
            }
        }
        
        // 验证type参数
        const validTypes = [1, 2, 3, 4, 11]
        if (!validTypes.includes(type)) {
            return {
                success: false,
                message: '无效的操作类型，type必须是1、2、3、4或11'
            }
        }
        
        // 验证item_num
        if (item_num <= 0) {
            return {
                success: false,
                message: 'item_num必须大于0'
            }
        }
        
        // 获取用户ID（这里假设通过openid获取用户ID）
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
        
        // 根据type确定操作类型和记录方式
        let typeContent = ''
        let logType = 1 // 1增加 2减少
        
        switch (type) {
            case 1: // 购买
                typeContent = '1现金购买勋章'
                logType = 1
                break
            case 2: // 兑换
                typeContent = '2勋章购买道具'
                logType = 1
                break
            case 3: // 领取奖励
                typeContent = '3领取奖励'
                logType = 1
                break
            case 4: // 合成
                typeContent = '4合成道具'
                logType = 1
                break
            case 11: // 使用
                typeContent = '11使用道具'
                logType = 2
                break
            default:
                return {
                    success: false,
                    message: '无效的操作类型'
                }
        }
        
        // 如果是合成操作，需要记录两条日志
        if (type === 4) {
            const fragmentItemId = event.fragment_item_id // 消耗的碎片ID
            const fragmentNum = event.fragment_num // 消耗的碎片数量
            
            // 合成操作必须提供碎片信息
            if (!fragmentItemId || !fragmentNum || fragmentNum <= 0) {
                return {
                    success: false,
                    message: '合成操作必须提供有效的fragment_item_id和fragment_num参数'
                }
            }
            
            // 记录碎片消耗日志
            await db.collection('user_item_log').add({
                data: {
                    user_id: userId,
                    item_id: fragmentItemId,
                    item_num: fragmentNum,
                    type: 2, // 减少
                    type_content: '4合成道具',
                    cost: fragmentNum,
                    ctime: currentTime
                }
            })
        }
        
        // 记录主要操作日志
        const logData = {
            user_id: userId,
            item_id: item_id,
            item_num: item_num,
            type: logType,
            type_content: typeContent,
            ctime: currentTime
        }
        
        // 如果是购买操作，记录cost
        if (type === 1 || type === 2) {
            if (cost === undefined || cost < 0) {
                return {
                    success: false,
                    message: '购买操作必须提供有效的cost参数'
                }
            }
            logData.cost = cost
        }
        
        await db.collection('user_item_log').add({
            data: logData
        })
        
        console.log('submit_item_order 成功记录日志:', logData)
        
        // 新增：处理勋章购买道具的成就逻辑
        if (type === 2 && currency === 2 && item_id >= 1 && item_id <= 4) {
            try {
                await updatePurchaseAchievements(db, wxContext.OPENID)
            } catch (error) {
                console.error('更新购买成就失败:', error)
                // 这里不返回错误，因为主要功能已经完成
            }
        }
        
        return {
            success: true,
            message: '操作记录成功',
            openid: wxContext.OPENID,
            appid: wxContext.APPID,
            unionid: wxContext.UNIONID,
        }
        
    } catch (error) {
        console.error('submit_item_order error:', error)
        return {
            success: false,
            message: '操作失败：' + error.message
        }
    }
}

// 更新购买道具相关成就
async function updatePurchaseAchievements(db, openid) {
    try {
        const achievementIds = [43, 44, 45]
        
        for (const achievementId of achievementIds) {
            // 获取用户成就记录
            const userAchievementResult = await db.collection('user_achievement')
                .where({
                    user_id: openid,
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
                            user_id: openid,
                            achievement_id: achievementId
                        })
                        .update({
                            data: {
                                num: newNum,
                                is_achieved: isAchieved
                            }
                        })
                    
                    console.log(`购买成就${achievementId}更新成功: num=${newNum}, is_achieved=${isAchieved}`)
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
                            user_id: openid,
                            achievement_id: achievementId,
                            num: 1,
                            is_achieved: isAchieved
                        }
                    })
                    
                    console.log(`购买成就${achievementId}创建成功: num=1, is_achieved=${isAchieved}`)
                }
            }
        }
        
        console.log('购买道具成就更新完成')
    } catch (error) {
        console.error('更新购买道具成就失败:', error)
    }
}