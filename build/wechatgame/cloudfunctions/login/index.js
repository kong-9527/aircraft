// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
    try {
        const wxContext = cloud.getWXContext()
        const db = cloud.database()
        
        // 获取基础信息
        const openid = wxContext.OPENID
        const appid = wxContext.APPID
        const unionid = wxContext.UNIONID
        
        // 检查用户是否已存在
        const userQuery = await db.collection('user').where({
            open_id: openid,
            app_id: appid
        }).get()
        
        let user = null
        let isNewUser = false
        
        if (userQuery.data.length === 0) {
            // 新用户，需要创建用户记录
            isNewUser = true
            
            // 获取用户信息（如果前端传入了用户信息）
            const userInfo = event.userInfo || {}
            
            // 创建用户记录
            const userData = {
                app_id: appid,
                open_id: openid,
                union_id: unionid,
                session_key: event.sessionKey || '',
                nicknamem: userInfo.nickName || '',
                head_url: userInfo.avatarUrl || '',
                phone_number: '',
                pure_phone_number: '',
                country_code: '',
                score: 0,
                medal_num: 0,
                week_double_checkin_to: null,
                season_double_checkin_to: null,
                ctime: Math.floor(Date.now() / 1000),
                utime: Math.floor(Date.now() / 1000)
            }
            
            // 保存到数据库
            const insertResult = await db.collection('user').add({
                data: userData
            })
            
            user = {
                ...userData,
                _id: insertResult._id
            }
            
            console.log('新用户创建成功:', openid)
        } else {
            // 老用户，更新登录时间
            user = userQuery.data[0]
            isNewUser = false
            
            // 更新用户信息（如果前端传入了新的用户信息）
            const updateData = {
                utime: Math.floor(Date.now() / 1000)
            }
            
            if (event.userInfo) {
                updateData.nicknamem = event.userInfo.nickName || user.nicknamem
                updateData.head_url = event.userInfo.avatarUrl || user.head_url
            }
            
            // 更新数据库
            await db.collection('user').doc(user._id).update({
                data: updateData
            })
            
            // 更新本地用户对象
            user = { ...user, ...updateData }
            
            console.log('老用户登录成功:', user.open_id)
        }
        
        // 返回登录结果
        return {
            success: true,
            isNewUser: isNewUser,
            user: {
                id: user._id,
                openId: user.open_id,
                unionId: user.union_id,
                nickname: user.nicknamem,
                headUrl: user.head_url,
                score: user.score,
                medalNum: user.medal_num,
                phoneNumber: user.phone_number,
                purePhoneNumber: user.pure_phone_number,
                countryCode: user.country_code
            },
            openid: openid,
            appid: appid,
            unionid: unionid
        }
        
    } catch (error) {
        console.error('登录云函数执行失败:', error)
        return {
            success: false,
            error: error.message,
            openid: wxContext.OPENID,
            appid: wxContext.APPID,
            unionid: wxContext.UNIONID
        }
    }
}