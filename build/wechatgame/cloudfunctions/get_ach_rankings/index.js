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
        
        // 查询用户信息
        const userResult = await db.collection('user')
            .where({
                openid: openid
            })
            .get()
        
        if (userResult.data.length === 0) {
            return {
                success: false,
                errorCode: 'USER_NOT_AUTHORIZED',
                message: '用户未授权，请先授权登录'
            }
        }
        
        const user = userResult.data[0]
        
        // 查询所有用户已达成的成就数量
        const allUserAchievements = await db.collection('user_achievement')
            .aggregate()
            .match({
                is_achieved: 1
            })
            .lookup({
                from: 'basic_achievements',
                localField: 'achievement_id',
                foreignField: '_id',
                as: 'achievement_info'
            })
            .addFields({
                level: { $arrayElemAt: ['$achievement_info.level', 0] }
            })
            .group({
                _id: '$user_id',
                achievement_count: { $sum: 1 },
                level_1_count: { 
                    $sum: { 
                        $cond: [{ $eq: ['$level', 1] }, 1, 0] 
                    } 
                },
                level_2_count: { 
                    $sum: { 
                        $cond: [{ $eq: ['$level', 2] }, 1, 0] 
                    } 
                },
                level_3_count: { 
                    $sum: { 
                        $cond: [{ $eq: ['$level', 3] }, 1, 0] 
                    } 
                },
                level_4_count: { 
                    $sum: { 
                        $cond: [{ $eq: ['$level', 4] }, 1, 0] 
                    } 
                }
            })
            .sort({
                achievement_count: -1
            })
            .end()
        
        // 查询当前用户的成就数据
        const currentUserAchievements = allUserAchievements.list.find(item => item._id === user._id)
        
        // 计算当前用户排名
        let selfUserRanking = 0
        if (currentUserAchievements) {
            selfUserRanking = allUserAchievements.list.findIndex(item => item._id === user._id) + 1
        }
        
        // 获取前100名用户信息
        const top100UserIds = allUserAchievements.list.slice(0, 100).map(item => item._id)
        const top100UserInfos = await db.collection('user')
            .where({
                _id: db.command.in(top100UserIds)
            })
            .get()
        
        // 创建用户信息映射
        const userInfoMap = {}
        top100UserInfos.data.forEach(userInfo => {
            userInfoMap[userInfo._id] = userInfo
        })
        
        // 组装返回数据
        const result = {
            success: true,
            self_user_id: user._id,
            self_user_nickname: user.nickname || '',
            self_user_headurl: user.headurl || '',
            self_user_achievement_num: currentUserAchievements ? currentUserAchievements.achievement_count : 0,
            self_user_ranking: selfUserRanking,
            self_level_1_num: currentUserAchievements ? currentUserAchievements.level_1_count : 0,
            self_level_2_num: currentUserAchievements ? currentUserAchievements.level_2_count : 0,
            self_level_3_num: currentUserAchievements ? currentUserAchievements.level_3_count : 0,
            self_level_4_num: currentUserAchievements ? currentUserAchievements.level_4_count : 0,
            data: allUserAchievements.list.slice(0, 100).map((userAchievement, index) => {
                const userInfo = userInfoMap[userAchievement._id] || {}
                return {
                    user_id: userAchievement._id,
                    user_nickname: userInfo.nickname || '',
                    user_headurl: userInfo.headurl || '',
                    user_achievement_num: userAchievement.achievement_count,
                    user_ranking: index + 1,
                    level_1_num: userAchievement.level_1_count,
                    level_2_num: userAchievement.level_2_count,
                    level_3_num: userAchievement.level_3_count,
                    level_4_num: userAchievement.level_4_count
                }
            })
        }
        
        return result
        
    } catch (error) {
        console.error('成就排行榜查询失败:', error)
        return {
            success: false,
            errorCode: 'SYSTEM_ERROR',
            message: '查询失败，请稍后重试',
            error: error.message
        }
    }
}