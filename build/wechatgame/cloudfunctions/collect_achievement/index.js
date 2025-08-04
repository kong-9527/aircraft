// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const db = cloud.database()
    
    try {
        // 获取参数
        const { achievement_id } = event
        const openid = wxContext.OPENID
        
        if (!achievement_id) {
            return {
                success: false,
                message: '缺少成就ID参数'
            }
        }
        
        // 1. 根据openid获取用户ID
        const userResult = await db.collection('users').where({
            openid: openid
        }).get()
        
        if (userResult.data.length === 0) {
            return {
                success: false,
                message: '用户不存在'
            }
        }
        
        const userId = userResult.data[0].id
        
        // 2. 检查成就是否已完成且未领取
        const userAchievementResult = await db.collection('user_achievement').where({
            user_id: userId,
            achievement_id: achievement_id
        }).get()
        
        if (userAchievementResult.data.length === 0) {
            return {
                success: false,
                message: '成就记录不存在'
            }
        }
        
        const userAchievement = userAchievementResult.data[0]
        
        if (userAchievement.is_achieved !== 1) {
            return {
                success: false,
                message: '成就尚未完成'
            }
        }
        
        if (userAchievement.is_collected === 1) {
            return {
                success: false,
                message: '成就奖励已领取'
            }
        }
        
        // 3. 获取成就奖励列表
        const rewardListResult = await db.collection('basic_achievement_rewardlist').where({
            achievement_id: achievement_id
        }).get()
        
        if (rewardListResult.data.length === 0) {
            return {
                success: false,
                message: '成就奖励配置不存在'
            }
        }
        
        const rewardList = rewardListResult.data
        
        // 4. 开始事务处理
        const transaction = await db.startTransaction()
        
        try {
            // 5. 为每个奖励物品更新用户物品数量
            for (const reward of rewardList) {
                const { item_id, item_num } = reward
                
                // 查找用户是否已有该物品
                const userItemResult = await transaction.collection('user_item').where({
                    user_id: userId,
                    item_id: item_id
                }).get()
                
                if (userItemResult.data.length > 0) {
                    // 更新现有物品数量
                    await transaction.collection('user_item').where({
                        user_id: userId,
                        item_id: item_id
                    }).update({
                        data: {
                            item_num: db.command.inc(item_num)
                        }
                    })
                } else {
                    // 创建新的用户物品记录
                    await transaction.collection('user_item').add({
                        data: {
                            user_id: userId,
                            item_id: item_id,
                            item_num: item_num
                        }
                    })
                }
                
                // 6. 记录物品变更日志
                await transaction.collection('user_item_log').add({
                    data: {
                        user_id: userId,
                        item_id: item_id,
                        item_num: item_num,
                        type: 1, // 1表示增加
                        type_content: '3领取奖励', // 3表示领取奖励
                        cost: null,
                        ctime: Math.floor(Date.now() / 1000)
                    }
                })
            }
            
            // 7. 标记成就为已领取
            await transaction.collection('user_achievement').where({
                user_id: userId,
                achievement_id: achievement_id
            }).update({
                data: {
                    is_collected: 1
                }
            })
            
            // 提交事务
            await transaction.commit()
            
            return {
                success: true,
                message: '成就奖励领取成功',
                data: {
                    achievement_id: achievement_id,
                    rewards: rewardList
                }
            }
            
        } catch (error) {
            // 回滚事务
            await transaction.rollback()
            throw error
        }
        
    } catch (error) {
        console.error('collect_achievement error:', error)
        return {
            success: false,
            message: '领取成就奖励失败',
            error: error.message
        }
    }
}