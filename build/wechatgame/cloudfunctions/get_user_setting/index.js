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
        const appid = wxContext.APPID
        
        // 查询用户信息
        const userResult = await db.collection('user').where({
            open_id: openid,
            app_id: appid
        }).get()
        
        let userData = null
        let user_id = ''
        let nickname = ''
        
        // 如果用户存在，获取用户数据
        if (userResult.data.length > 0) {
            userData = userResult.data[0]
            user_id = userData._id
            nickname = userData.nicknamem || ''
            
            // 查询用户设置
            const settingResult = await db.collection('user_setting').where({
                user_id: user_id
            }).get()
            
            let sound = 1  // 默认开启
            let music = 1  // 默认开启
            let motor = 1  // 默认开启
            
            // 如果找到设置记录，使用数据库中的值
            if (settingResult.data.length > 0) {
                const settingData = settingResult.data[0]
                sound = settingData.sound !== undefined ? settingData.sound : 1
                music = settingData.music !== undefined ? settingData.music : 1
                motor = settingData.motor !== undefined ? settingData.motor : 1
            }
            
            return {
                success: true,
                user_id: user_id,
                nickname: nickname,
                sound: sound,
                music: music,
                motor: motor
            }
        } else {
            // 用户不存在，返回默认值
            return {
                success: true,
                user_id: '',
                nickname: '',
                sound: 1,  // 默认开启
                music: 1,  // 默认开启
                motor: 1   // 默认开启
            }
        }
        
    } catch (error) {
        console.error('获取用户设置失败:', error)
        return {
            success: false,
            error: error.message,
            user_id: '',
            nickname: '',
            sound: 1,
            music: 1,
            motor: 1
        }
    }
}