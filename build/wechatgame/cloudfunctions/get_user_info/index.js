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
        
        // 如果用户不存在，创建新用户
        if (userResult.data.length === 0) {
            // 创建新用户记录
            const newUser = {
                app_id: appid,
                open_id: openid,
                union_id: wxContext.UNIONID,
                session_key: '',
                nicknamem: '玩家' + openid.substring(0, 8), // 默认昵称
                head_url: '', // 默认头像
                phone_number: '',
                pure_phone_number: '',
                country_code: '',
                score: 0, // 初始得分
                medal_num: 0, // 初始勋章数量
                week_double_checkin_to: null, // 周签到双倍状态到期时间
                season_double_checkin_to: null, // 赛季签到双倍状态到期时间
                ctime: Math.floor(Date.now() / 1000),
                utime: Math.floor(Date.now() / 1000)
            }
            
            const insertResult = await db.collection('user').add({
                data: newUser
            })
            
            userData = {
                ...newUser,
                _id: insertResult._id
            }
        } else {
            // 用户存在，获取用户数据
            userData = userResult.data[0]
            
            // 更新最后访问时间
            await db.collection('user').doc(userData._id).update({
                data: {
                    utime: Math.floor(Date.now() / 1000)
                }
            })
        }
        
        // 计算签到状态
        const now = Math.floor(Date.now() / 1000)
        const week_checkin_status = userData.week_double_checkin_to && userData.week_double_checkin_to > now ? 1 : 0
        const season_checkin_status = userData.season_double_checkin_to && userData.season_double_checkin_to > now ? 1 : 0
        
        // 返回用户信息
        return {
            success: true,
            user_id: userData._id,
            user_nickname: userData.nicknamem,
            user_headurl: userData.head_url,
            score: userData.score || 0,
            medal_num: userData.medal_num || 0,
            week_checkin_status: week_checkin_status,
            season_checkin_status: season_checkin_status,
            user_type: 1 // 默认用户类型，可根据需要扩展
        }
        
    } catch (error) {
        console.error('获取用户信息失败:', error)
        return {
            success: false,
            error: error.message,
            user_id: '',
            user_nickname: '',
            user_headurl: '',
            score: 0,
            medal_num: 0,
            week_checkin_status: 0,
            season_checkin_status: 0,
            user_type: 1
        }
    }
}