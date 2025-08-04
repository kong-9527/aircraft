// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const db = cloud.database()
    
    try {
        // 获取用户ID（这里假设用户ID存储在用户表中，需要根据实际情况调整）
        const userResult = await db.collection('users').where({
            openid: wxContext.OPENID
        }).get()
        
        if (userResult.data.length === 0) {
            return {
                success: false,
                message: '用户不存在',
                data: {
                    newgift_num: 0,
                    ach_num: 0,
                    checkin_num: 0,
                    mail_num: 0
                }
            }
        }
        
        const userId = userResult.data[0].id
        
        // 1. 查询新人礼未领取数量
        const newgiftResult = await db.collection('user_newgift').where({
            user_id: userId,
            is_achieved: 1,
            is_collected: 0
        }).count()
        
        // 2. 查询成就未领取数量
        const achievementResult = await db.collection('user_achievement').where({
            user_id: userId,
            is_achieved: 1,
            is_collected: 0
        }).count()
        
        // 3. 查询签到状态
        let checkin_num = 0
        const today = new Date()
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
        
        // 如果今天是自然月的1日，返回0
        if (today.getDate() === 1) {
            checkin_num = 0
        } else {
            // 查询昨日是否有签到记录
            const yesterdayStr = yesterday.toISOString().split('T')[0]
            const basicCheckinResult = await db.collection('basic_checkins').where({
                date: yesterdayStr
            }).get()
            
            if (basicCheckinResult.data.length > 0) {
                const checkinId = basicCheckinResult.data[0].id
                const userCheckinResult = await db.collection('user_checkin').where({
                    user_id: userId,
                    checkin_id: checkinId,
                    is_collected: 0
                }).count()
                
                checkin_num = userCheckinResult.total > 0 ? 1 : 0
            }
        }
        
        // 4. 查询邮件未读/未领取数量
        const mailResult = await db.collection('user_mail').where({
            user_id: userId,
            $or: [
                { is_read: 0 },
                { is_collect: 0 }
            ]
        }).count()
        
        return {
            success: true,
            data: {
                newgift_num: newgiftResult.total,
                ach_num: achievementResult.total,
                checkin_num: checkin_num,
                mail_num: mailResult.total
            }
        }
        
    } catch (error) {
        console.error('get_user_unread error:', error)
        return {
            success: false,
            message: '查询失败',
            error: error.message,
            data: {
                newgift_num: 0,
                ach_num: 0,
                checkin_num: 0,
                mail_num: 0
            }
        }
    }
}