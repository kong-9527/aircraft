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
