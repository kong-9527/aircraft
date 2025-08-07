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
        const { reward_item_id, reward_item_num, month_id } = checkinConfig
        
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
        
        // 7. 直接记录日志到user_item_log表
        try {
            // 获取用户ID
            const userResult = await db.collection('users').where({
                openid: openid
            }).get()
            
            if (userResult.data.length > 0) {
                const userId = userResult.data[0].id
                const currentTime = Math.floor(Date.now() / 1000)
                
                // 直接插入日志记录
                await db.collection('user_item_log').add({
                    data: {
                        user_id: userId,
                        item_id: reward_item_id,
                        item_num: reward_item_num,
                        type: 1, // 增加
                        type_content: '3领取奖励',
                        ctime: currentTime
                    }
                })
                
                console.log('签到奖励日志记录成功')
            }
        } catch (error) {
            console.error('记录签到奖励日志失败:', error)
            // 这里不返回错误，因为主要功能已经完成
        }
        
        // 8. 检查是否需要计算满签成就
        try {
            // 获取当前月份信息
            const monthInfoResult = await db.collection('basic_checkin_monthids')
                .where({
                    id: month_id
                })
                .get()
            
            if (monthInfoResult.data.length > 0) {
                const monthInfo = monthInfoResult.data[0]
                const endDate = new Date(monthInfo.end_date)
                const endDateOnly = new Date(endDate)
                endDateOnly.setHours(0, 0, 0, 0)
                
                // 计算倒数第二天
                const secondLastDate = new Date(endDateOnly)
                secondLastDate.setDate(secondLastDate.getDate() - 1)
                
                // 检查是否是本月最后一天或倒数第二天
                if (submitDateOnly.getTime() === endDateOnly.getTime() || 
                    submitDateOnly.getTime() === secondLastDate.getTime()) {
                    
                    // 检查本月是否满签
                    const isFullCheckin = await checkFullCheckin(db, openid, month_id)
                    
                    if (isFullCheckin) {
                        // 更新满签相关成就
                        await updateFullCheckinAchievements(db, openid)
                    }
                }
            }
        } catch (error) {
            console.error('检查满签成就失败:', error)
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

// 检查是否满签
async function checkFullCheckin(db, openid, month_id) {
    try {
        // 获取该月份的所有签到配置
        const checkinsResult = await db.collection('basic_checkins')
            .where({
                month_id: month_id
            })
            .get()
        
        if (checkinsResult.data.length === 0) {
            return false
        }
        
        // 获取用户在该月份的所有签到记录
        const userCheckinsResult = await db.collection('user_checkin')
            .where({
                user_id: openid
            })
            .get()
        
        // 检查是否该月份的每一天都已签到
        for (const checkin of checkinsResult.data) {
            const hasCheckin = userCheckinsResult.data.find(userCheckin => 
                userCheckin.checkin_id === checkin.id && userCheckin.is_achieved === 1
            )
            
            if (!hasCheckin) {
                return false
            }
        }
        
        return true
    } catch (error) {
        console.error('检查满签失败:', error)
        return false
    }
}

// 更新满签相关成就
async function updateFullCheckinAchievements(db, openid) {
    try {
        const achievementIds = [60, 61, 62, 63]
        
        for (const achievementId of achievementIds) {
            // 获取用户成就记录
            const userAchievementResult = await db.collection('user_achievement')
                .where({
                    user_id: openid,
                    achievement_id: achievementId
                })
                .get()
            
            if (userAchievementResult.data.length > 0) {
                const userAchievement = userAchievementResult.data[0]
                
                // 如果已经达成，跳过
                if (userAchievement.is_achieved === 1) {
                    continue
                }
                
                // 更新num值
                const newNum = (userAchievement.num || 0) + 1
                
                // 获取成就配置
                const basicAchievementResult = await db.collection('basic_achievements')
                    .where({
                        id: achievementId
                    })
                    .get()
                
                if (basicAchievementResult.data.length > 0) {
                    const basicAchievement = basicAchievementResult.data[0]
                    const needValue = basicAchievement.need || 0
                    
                    // 检查是否达成
                    const isAchieved = newNum >= needValue ? 1 : 0
                    
                    // 更新用户成就记录
                    await db.collection('user_achievement')
                        .where({
                            user_id: openid,
                            achievement_id: achievementId
                        })
                        .update({
                            data: {
                                num: newNum,
                                is_achieved: isAchieved
                            }
                        })
                    
                    console.log(`成就${achievementId}更新成功: num=${newNum}, is_achieved=${isAchieved}`)
                }
            } else {
                // 创建新的用户成就记录
                const basicAchievementResult = await db.collection('basic_achievements')
                    .where({
                        id: achievementId
                    })
                    .get()
                
                if (basicAchievementResult.data.length > 0) {
                    const basicAchievement = basicAchievementResult.data[0]
                    const needValue = basicAchievement.need || 0
                    const isAchieved = 1 >= needValue ? 1 : 0
                    
                    await db.collection('user_achievement').add({
                        data: {
                            user_id: openid,
                            achievement_id: achievementId,
                            num: 1,
                            is_achieved: isAchieved
                        }
                    })
                    
                    console.log(`成就${achievementId}创建成功: num=1, is_achieved=${isAchieved}`)
                }
            }
        }
        
        console.log('满签成就更新完成')
    } catch (error) {
        console.error('更新满签成就失败:', error)
    }
}