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
        
        // 获取请求参数
        const { type } = event
        
        if (!type || ![1, 2].includes(type)) {
            return {
                success: false,
                errorCode: 'INVALID_PARAM',
                message: '参数错误：type必须为1或2'
            }
        }
        
        // 获取当前日期
        const currentDate = new Date()
        const currentDateStr = currentDate.toISOString().split('T')[0] // 格式：2025-01-01
        
        // 查询stats_ranking_ids表，获取当前周赛信息
        const rankingIdsResult = await db.collection('stats_ranking_ids')
            .where({
                type: 1, // 周赛
                start_date: db.command.lte(currentDateStr),
                end_date: db.command.gte(currentDateStr)
            })
            .orderBy('start_date', 'desc')
            .limit(1)
            .get()
        
        if (rankingIdsResult.data.length === 0) {
            return {
                success: false,
                errorCode: 'NO_CURRENT_WEEK',
                message: '未找到当前周赛信息'
            }
        }
        
        const currentWeek = rankingIdsResult.data[0]
        let targetWeek
        
        if (type === 1) {
            // 查询本周赛
            targetWeek = currentWeek
        } else {
            // 查询上个周赛
            const lastWeekResult = await db.collection('stats_ranking_ids')
                .where({
                    type: 1,
                    _id: db.command.lt(currentWeek._id) // 使用_id而不是id
                })
                .orderBy('_id', 'desc')
                .limit(1)
                .get()
            
            if (lastWeekResult.data.length === 0) {
                return {
                    success: false,
                    errorCode: 'NO_PREVIOUS_WEEK',
                    message: '未找到上个周赛信息，当前为第一个周赛'
                }
            }
            targetWeek = lastWeekResult.data[0]
        }
        
        // 查询用户信息
        const userResult = await db.collection('user')
            .where({
                openid: openid
            })
            .get()
        
        if (userResult.data.length === 0) {
            return {
                success: false,
                errorCode: 'USER_NOT_FOUND',
                message: '用户信息不存在，请先授权登录'
            }
        }
        
        const user = userResult.data[0]
        
        // 查询榜单数据（前100名）
        const rankingData = await db.collection('stats_ranking_week')
            .where({
                ranking_id: targetWeek._id // 使用_id
            })
            .orderBy('user_ranking', 'asc')
            .limit(100)
            .get()
        
        // 查询当前用户在该榜单的排名
        const selfRankingResult = await db.collection('stats_ranking_week')
            .where({
                ranking_id: targetWeek._id, // 使用_id
                user_id: user._id // 使用_id
            })
            .get()
        
        let selfUserData = null
        if (selfRankingResult.data.length > 0) {
            selfUserData = selfRankingResult.data[0]
        }
        
        // 获取榜单中用户的详细信息
        const userIds = rankingData.data.map(item => item.user_id)
        const userInfos = await db.collection('user')
            .where({
                _id: db.command.in(userIds) // 使用_id
            })
            .get()
        
        const userInfoMap = {}
        userInfos.data.forEach(userInfo => {
            userInfoMap[userInfo._id] = userInfo // 使用_id作为key
        })
        
        // 组装返回数据
        const result = {
            success: true,
            ranking_id: targetWeek._id, // 使用_id
            ranking_start_date: targetWeek.start_date,
            ranking_end_date: targetWeek.end_date,
            self_user_id: user._id, // 使用_id
            self_user_nickname: user.nickname || '',
            self_user_headurl: user.headurl || '',
            self_user_score: selfUserData ? selfUserData.user_score : 0,
            self_user_ranking: selfUserData ? selfUserData.user_ranking : 0,
            data: rankingData.data.map(item => {
                const userInfo = userInfoMap[item.user_id] || {}
                return {
                    user_id: item.user_id,
                    user_nickname: userInfo.nickname || '',
                    user_headurl: userInfo.headurl || '',
                    user_score: item.user_score,
                    user_ranking: item.user_ranking
                }
            })
        }
        
        return result
        
    } catch (error) {
        console.error('周赛榜单查询失败:', error)
        return {
            success: false,
            errorCode: 'SYSTEM_ERROR',
            message: '查询失败，请稍后重试',
            error: error.message
        }
    }
}