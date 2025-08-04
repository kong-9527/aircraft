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
        
        // 查询用户邮件：未读邮件(is_read=0) 或 有未领取奖励的邮件(is_collect=0)
        const userMailsResult = await db.collection('user_mail')
            .where({
                user_id: openid,
                $or: [
                    { is_read: 0 },  // 未读邮件
                    { is_collect: 0 } // 有未领取奖励的邮件
                ]
            })
            .get()
        
        if (userMailsResult.data.length === 0) {
            return {
                success: true,
                data: []
            }
        }
        
        // 获取所有邮件ID
        const mailIds = [...new Set(userMailsResult.data.map(item => item.mail_id))]
        
        // 查询邮件基础信息
        const basicMailsResult = await db.collection('basic_mails')
            .where({
                id: db.command.in(mailIds)
            })
            .get()
        
        // 查询邮件奖励信息
        const mailRewardsResult = await db.collection('basic_mail_rewardlist')
            .where({
                mail_id: db.command.in(mailIds)
            })
            .get()
        
        // 构建邮件ID到奖励的映射
        const rewardsMap = {}
        mailRewardsResult.data.forEach(reward => {
            if (!rewardsMap[reward.mail_id]) {
                rewardsMap[reward.mail_id] = []
            }
            rewardsMap[reward.mail_id].push({
                item_id: reward.item_id,
                item_name: reward.item_name || `物品${reward.item_id}`, // 如果没有item_name字段，使用默认名称
                item_num: reward.item_num,
                item_icon: reward.item_icon || '' // 如果没有item_icon字段，使用空字符串
            })
        })
        
        // 构建邮件ID到基础信息的映射
        const basicMailsMap = {}
        basicMailsResult.data.forEach(mail => {
            basicMailsMap[mail.id] = mail
        })
        
        // 构建邮件ID到用户邮件状态的映射
        const userMailsMap = {}
        userMailsResult.data.forEach(userMail => {
            userMailsMap[userMail.mail_id] = userMail
        })
        
        // 组装最终结果
        const result = []
        const processedMailIds = new Set()
        
        userMailsResult.data.forEach(userMail => {
            const mailId = userMail.mail_id
            
            // 去重处理
            if (processedMailIds.has(mailId)) {
                return
            }
            processedMailIds.add(mailId)
            
            const basicMail = basicMailsMap[mailId]
            if (!basicMail) {
                return // 跳过没有基础信息的邮件
            }
            
            // 格式化时间
            const mailTime = new Date(basicMail.ctime * 1000)
            const formattedTime = `${mailTime.getFullYear()}-${String(mailTime.getMonth() + 1).padStart(2, '0')}-${String(mailTime.getDate()).padStart(2, '0')} ${String(mailTime.getHours()).padStart(2, '0')}:${String(mailTime.getMinutes()).padStart(2, '0')}:${String(mailTime.getSeconds()).padStart(2, '0')}`
            
            result.push({
                mail_id: mailId,
                mail_title: basicMail.title || '',
                mail_text: basicMail.text || '',
                mail_time: formattedTime,
                is_read: userMail.is_read || 0,
                is_collected: userMail.is_collect || 0,
                rewards: rewardsMap[mailId] || []
            })
        })
        
        // 按邮件ID倒序排序
        result.sort((a, b) => b.mail_id - a.mail_id)
        
        return {
            success: true,
            data: result
        }
        
    } catch (error) {
        console.error('获取用户邮件失败:', error)
        return {
            success: false,
            error: error.message,
            data: []
        }
    }
}