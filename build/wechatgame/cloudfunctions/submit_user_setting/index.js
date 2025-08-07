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
        
        // 验证参数
        const { nickname, sound, music, motor } = event
        
        if (!nickname || nickname.trim() === '') {
            return {
                success: false,
                error: 'nickname不能为空'
            }
        }
        
        // 验证设置参数
        if (sound !== 0 && sound !== 1) {
            return {
                success: false,
                error: 'sound参数必须为0或1'
            }
        }
        
        if (music !== 0 && music !== 1) {
            return {
                success: false,
                error: 'music参数必须为0或1'
            }
        }
        
        if (motor !== 0 && motor !== 1) {
            return {
                success: false,
                error: 'motor参数必须为0或1'
            }
        }
        
        // 查询用户信息
        const userResult = await db.collection('user').where({
            open_id: openid,
            app_id: appid
        }).get()
        
        let userData = null
        let user_id = ''
        
        // 如果用户存在，获取用户数据
        if (userResult.data.length > 0) {
            userData = userResult.data[0]
            user_id = userData._id
            
            // 更新user表的nickname
            await db.collection('user').doc(user_id).update({
                data: {
                    nicknamem: nickname.trim(),
                    utime: Math.floor(Date.now() / 1000)
                }
            })
            
            // 查询用户设置是否存在
            const settingResult = await db.collection('user_setting').where({
                user_id: user_id
            }).get()
            
            if (settingResult.data.length > 0) {
                // 更新现有设置
                const settingData = settingResult.data[0]
                await db.collection('user_setting').doc(settingData._id).update({
                    data: {
                        sound: sound,
                        music: music,
                        motor: motor
                    }
                })
            } else {
                // 创建新设置记录
                await db.collection('user_setting').add({
                    data: {
                        user_id: user_id,
                        sound: sound,
                        music: music,
                        motor: motor
                    }
                })
            }
            
            // 新人礼检查逻辑
            try {
                // 查询user_newgift表中该用户的newgift_id=2的记录
                const newgiftResult = await db.collection('user_newgift').where({
                    user_id: openid,
                    newgift_id: 2
                }).get()
                
                if (newgiftResult.data.length > 0) {
                    // 记录存在，检查is_achieved是否为1
                    const newgiftData = newgiftResult.data[0]
                    if (newgiftData.is_achieved !== 1) {
                        // 如果不是1，则更新为1
                        await db.collection('user_newgift').doc(newgiftData._id).update({
                            data: {
                                is_achieved: 1
                            }
                        })
                    }
                } else {
                    // 记录不存在，创建新记录
                    await db.collection('user_newgift').add({
                        data: {
                            user_id: openid,
                            newgift_id: 2,
                            is_achieved: 1,
                            is_collected: 0
                        }
                    })
                }
            } catch (newgiftError) {
                console.error('新人礼检查失败:', newgiftError)
                // 新人礼检查失败不影响设置保存的成功返回
            }
            
            return {
                success: true,
                message: '设置保存成功'
            }
            
        } else {
            // 用户不存在，返回错误
            return {
                success: false,
                error: '用户不存在，请先登录'
            }
        }
        
    } catch (error) {
        console.error('保存用户设置失败:', error)
        return {
            success: false,
            error: error.message
        }
    }
}
