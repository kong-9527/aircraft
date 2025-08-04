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
        const { date } = event
        
        // 参数验证
        if (!date) {
            return {
                success: false,
                message: '缺少必要参数：date'
            }
        }
        
        // 验证日期格式
        const submitDate = new Date(date)
        if (isNaN(submitDate.getTime())) {
            return {
                success: false,
                message: '日期格式不正确'
            }
        }
        
        // 获取今天的日期和昨天的日期
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        
        const submitDateOnly = new Date(submitDate)
        submitDateOnly.setHours(0, 0, 0, 0)
        
        // 1. 验证日期：只允许今天签到或昨天补签
        if (submitDateOnly.getTime() !== today.getTime() && 
            submitDateOnly.getTime() !== yesterday.getTime()) {
            return {
                success: false,
                message: '只可以当天签到或补签昨天'
            }
        }
        
        // 2. 检查是否是补签，如果是补签则验证是否允许
        if (submitDateOnly.getTime() === yesterday.getTime()) {
            // 检查今天是否是某月第一天
            const todayMonth = today.getMonth() + 1 // getMonth()返回0-11，所以+1
            const todayDate = today.getDate()
            
            if (todayDate === 1) {
                return {
                    success: false,
                    message: '无法补签上个月的签到'
                }
            }
        }
        
        // 3. 查询该日期的签到奖励配置
        const checkinResult = await db.collection('basic_checkins')
            .where({
                date: submitDateOnly
            })
            .get()
        
        if (checkinResult.data.length === 0) {
            return {
                success: false,
                message: '该日期没有签到奖励配置'
            }
        }
        
        const checkinConfig = checkinResult.data[0]
        const { reward_item_id, reward_item_num } = checkinConfig
        
        // 4. 检查用户是否已经领取过该日期的奖励
        const userCheckinResult = await db.collection('user_checkin')
            .where({
                user_id: openid,
                checkin_id: checkinConfig.id
            })
            .get()
        
        if (userCheckinResult.data.length > 0) {
            const userCheckin = userCheckinResult.data[0]
            if (userCheckin.is_collected === 1) {
                return {
                    success: false,
                    message: '您已领取过奖励'
                }
            }
        }
        
        // 5. 更新用户物品数量
        const userItemResult = await db.collection('user_item')
            .where({
                user_id: openid,
                item_id: reward_item_id
            })
            .get()
        
        if (userItemResult.data.length === 0) {
            // 创建新记录
            await db.collection('user_item').add({
                data: {
                    user_id: openid,
                    item_id: reward_item_id,
                    item_num: reward_item_num
                }
            })
        } else {
            // 更新现有记录
            const currentItem = userItemResult.data[0]
            const newItemNum = (currentItem.item_num || 0) + reward_item_num
            
            await db.collection('user_item')
                .where({
                    user_id: openid,
                    item_id: reward_item_id
                })
                .update({
                    data: {
                        item_num: newItemNum
                    }
                })
        }
        
        // 6. 标记该日期的奖励已领取
        if (userCheckinResult.data.length === 0) {
            // 创建新记录
            await db.collection('user_checkin').add({
                data: {
                    user_id: openid,
                    checkin_id: checkinConfig.id,
                    is_achieved: 1,
                    is_collected: 1
                }
            })
        } else {
            // 更新现有记录
            await db.collection('user_checkin')
                .where({
                    user_id: openid,
                    checkin_id: checkinConfig.id
                })
                .update({
                    data: {
                        is_achieved: 1,
                        is_collected: 1
                    }
                })
        }
        
        // 7. 调用submit_item_order接口记录日志
        try {
            const result = await cloud.callFunction({
                name: 'submit_item_order',
                data: {
                    item_id: reward_item_id,
                    item_num: reward_item_num,
                    type: 3,
                    currency: '',
                    cost: ''
                }
            })
            
            console.log('submit_item_order调用结果:', result)
        } catch (error) {
            console.error('调用submit_item_order失败:', error)
            // 这里不返回错误，因为主要功能已经完成
        }
        
        return {
            success: true,
            message: '签到奖励领取成功',
            data: {
                date: date,
                reward_item_id: reward_item_id,
                reward_item_num: reward_item_num
            },
            openid: openid,
            appid: wxContext.APPID,
            unionid: wxContext.UNIONID
        }
        
    } catch (error) {
        console.error('签到奖励领取失败:', error)
        return {
            success: false,
            message: '签到奖励领取失败: ' + error.message,
            error: error.message
        }
    }
}