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
        
        // 获取要更新的用户信息
        const { nickName, avatarUrl } = event
        
        if (!nickName && !avatarUrl) {
            return {
                success: false,
                error: '缺少要更新的用户信息'
            }
        }
        
        // 查找用户
        const userQuery = await db.collection('user').where({
            open_id: openid,
            app_id: appid
        }).get()
        
        if (userQuery.data.length === 0) {
            return {
                success: false,
                error: '用户不存在'
            }
        }
        
        const user = userQuery.data[0]
        
        // 构建更新数据
        const updateData = {
            utime: Math.floor(Date.now() / 1000)
        }
        
        if (nickName) {
            updateData.nicknamem = nickName
        }
        
        if (avatarUrl) {
            updateData.head_url = avatarUrl
        }
        
        // 更新数据库
        await db.collection('user').doc(user._id).update({
            data: updateData
        })
        
        // 返回更新后的用户信息
        const updatedUser = { ...user, ...updateData }
        
        return {
            success: true,
            user: {
                id: updatedUser._id,
                openId: updatedUser.open_id,
                unionId: updatedUser.union_id,
                nickname: updatedUser.nicknamem,
                headUrl: updatedUser.head_url,
                score: updatedUser.score,
                medalNum: updatedUser.medal_num,
                phoneNumber: updatedUser.phone_number,
                purePhoneNumber: updatedUser.pure_phone_number,
                countryCode: updatedUser.country_code
            }
        }
        
    } catch (error) {
        console.error('更新用户信息失败:', error)
        return {
            success: false,
            error: error.message
        }
    }
}
