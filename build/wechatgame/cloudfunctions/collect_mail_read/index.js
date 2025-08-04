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
        
        // 更新邮件状态为已读
        const updateResult = await db.collection('user_mail')
            .where({
                user_id: openid,
                mail_id: parseInt(mail_id)
            })
            .update({
                data: {
                    is_read: 1,
                    utime: Math.floor(Date.now() / 1000) // 更新时间戳
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
            message: '邮件已标记为已读'
        }
        
    } catch (error) {
        console.error('标记邮件已读失败:', error)
        return {
            success: false,
            error: error.message
        }
    }
}