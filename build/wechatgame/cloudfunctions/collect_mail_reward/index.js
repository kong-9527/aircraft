// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const db = cloud.database()
    
    try {
        // 获取用户openid
        const openid = wxContext.OPENID
        
        // 获取参数
        const { mail_id } = event
        
        // 参数验证
        if (!mail_id) {
            return {
                success: false,
                error: '缺少必要参数：mail_id'
            }
        }
        
        // 验证mail_id是否为有效数字
        if (isNaN(parseInt(mail_id)) || parseInt(mail_id) <= 0) {
            return {
                success: false,
                error: 'mail_id参数无效'
            }
        }
        
        // 查询该用户是否存在该邮件记录
        const userMailResult = await db.collection('user_mail')
            .where({
                user_id: openid,
                mail_id: parseInt(mail_id)
            })
            .get()
        
        if (userMailResult.data.length === 0) {
            return {
                success: false,
                error: '该邮件不存在或不属于当前用户'
            }
        }
        
        // 检查邮件是否已经领取过奖励
        const userMail = userMailResult.data[0]
        if (userMail.is_collect === 1) {
            return {
                success: false,
                error: '该邮件的奖励已经领取过了'
            }
        }
        
        // 检查邮件是否有奖励可以领取
        const mailRewardsResult = await db.collection('basic_mail_rewardlist')
            .where({
                mail_id: parseInt(mail_id)
            })
            .get()
        
        if (mailRewardsResult.data.length === 0) {
            return {
                success: false,
                error: '该邮件没有奖励可以领取'
            }
        }
        
        // 更新邮件状态：标记为已读和已领取
        const currentTime = Math.floor(Date.now() / 1000)
        const updateResult = await db.collection('user_mail')
            .where({
                user_id: openid,
                mail_id: parseInt(mail_id)
            })
            .update({
                data: {
                    is_read: 1,
                    is_collect: 1,
                    collect_time: currentTime,
                    utime: currentTime
                }
            })
        
        if (updateResult.stats.updated === 0) {
            return {
                success: false,
                error: '更新失败，邮件可能已被删除'
            }
        }
        
        return {
            success: true,
            message: '邮件奖励领取成功',
            rewards: mailRewardsResult.data
        }
        
    } catch (error) {
        console.error('领取邮件奖励失败:', error)
        return {
            success: false,
            error: error.message
        }
    }
}