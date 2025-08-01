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
        
        if (type === 1) {
            // 查询当前周赛 - 从user表做实时排名
            const currentDate = new Date()
            const currentDateStr = currentDate.toISOString().split('T')[0]
            
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
            
            // 获取所有用户的score，按score倒序排序
            const allUsersResult = await db.collection('user')
                .orderBy('score', 'desc')
                .get()
            
            // 计算当前用户的排名
            let selfUserRanking = 0
            for (let i = 0; i < allUsersResult.data.length; i++) {
                if (allUsersResult.data[i]._id === user._id) {
                    selfUserRanking = i + 1
                    break
                }
            }
            
            // 取前100名作为榜单
            const top100Users = allUsersResult.data.slice(0, 100)
            
            // 组装返回数据
            const result = {
                success: true,
                ranking_id: currentWeek._id,
                ranking_start_date: currentWeek.start_date,
                ranking_end_date: currentWeek.end_date,
                self_user_id: user._id,
                self_user_nickname: user.nickname || '',
                self_user_headurl: user.headurl || '',
                self_user_score: user.score || 0,
                self_user_ranking: selfUserRanking,
                data: top100Users.map((userInfo, index) => ({
                    user_id: userInfo._id,
                    user_nickname: userInfo.nickname || '',
                    user_headurl: userInfo.headurl || '',
                    user_score: userInfo.score || 0,
                    user_ranking: index + 1
                }))
            }
            
            return result
            
        } else {
            // 查询上个周赛 - 从stats_ranking_week表获取历史排名
            const currentDate = new Date()
            const currentDateStr = currentDate.toISOString().split('T')[0]
            
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
            
            // 查询上个周赛
            const lastWeekResult = await db.collection('stats_ranking_ids')
                .where({
                    type: 1,
                    _id: db.command.lt(currentWeek._id)
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
            
            const targetWeek = lastWeekResult.data[0]
            
            // 查询榜单数据（前100名）
            const rankingData = await db.collection('stats_ranking_week')
                .where({
                    ranking_id: targetWeek._id
                })
                .orderBy('user_ranking', 'asc')
                .limit(100)
                .get()
            
            // 查询当前用户在该榜单的排名
            const selfRankingResult = await db.collection('stats_ranking_week')
                .where({
                    ranking_id: targetWeek._id,
                    user_id: user._id
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
                    _id: db.command.in(userIds)
                })
                .get()
            
            const userInfoMap = {}
            userInfos.data.forEach(userInfo => {
                userInfoMap[userInfo._id] = userInfo
            })
            
            // 组装返回数据
            const result = {
                success: true,
                ranking_id: targetWeek._id,
                ranking_start_date: targetWeek.start_date,
                ranking_end_date: targetWeek.end_date,
                self_user_id: user._id,
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
        }
        
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