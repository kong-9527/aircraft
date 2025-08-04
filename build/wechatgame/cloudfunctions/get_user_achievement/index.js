// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const db = cloud.database()
    
    try {
        // 获取用户ID（这里假设用户ID存储在某个地方，实际需要根据您的用户系统调整）
        const openid = wxContext.OPENID
        
        // 1. 查询所有生效的成就数据
        const achievementsResult = await db.collection('basic_achievements')
            .where({
                status: 1
            })
            .get()
        
        const achievements = achievementsResult.data
        
        // 2. 查询用户成就记录
        const userAchievementsResult = await db.collection('user_achievement')
            .where({
                user_id: openid // 这里需要根据实际的用户ID字段调整
            })
            .get()
        
        const userAchievements = userAchievementsResult.data
        
        // 3. 按group_id分组成就
        const groupMap = new Map()
        
        achievements.forEach(achievement => {
            const groupId = achievement.group_id
            if (!groupMap.has(groupId)) {
                groupMap.set(groupId, [])
            }
            groupMap.get(groupId).push(achievement)
        })
        
        // 4. 处理每个group，选择要展示的成就
        const result = []
        
        for (const [groupId, groupAchievements] of groupMap) {
            // 按level排序
            groupAchievements.sort((a, b) => a.level - b.level)
            
            // 找到用户在该group下的成就记录
            const userGroupAchievements = userAchievements.filter(ua => {
                return groupAchievements.some(achievement => achievement.id === ua.achievement_id)
            })
            
            // 选择要展示的成就
            let displayAchievement = null
            let userAchievement = null
            
            // 查找第一个未领取奖励的成就
            for (const achievement of groupAchievements) {
                const ua = userGroupAchievements.find(ua => ua.achievement_id === achievement.id)
                if (!ua || ua.is_collected === 0) {
                    displayAchievement = achievement
                    userAchievement = ua
                    break
                }
            }
            
            // 如果所有成就都已领取，选择level最高的
            if (!displayAchievement) {
                displayAchievement = groupAchievements[groupAchievements.length - 1]
                userAchievement = userGroupAchievements.find(ua => ua.achievement_id === displayAchievement.id)
            }
            
            // 计算当前用户达到的数量
            let achievementNum = 0
            if (userAchievement) {
                achievementNum = userAchievement.is_achieved === 1 ? displayAchievement.need : 0
            }
            
            // 如果该group下所有成就都已领取，修正achievement_num
            const allCollected = groupAchievements.every(achievement => {
                const ua = userGroupAchievements.find(ua => ua.achievement_id === achievement.id)
                return ua && ua.is_collected === 1
            })
            
            if (allCollected) {
                achievementNum = displayAchievement.need
            }
            
            // 构建返回数据
            const groupData = {
                    achievement_group_id: groupId,
                achievement_id: displayAchievement.id,
                achievement_name: displayAchievement.name,
                achievement_description: displayAchievement.description,
                achievement_need: displayAchievement.need,
                achievement_num: achievementNum,
                achievement_icon_url: displayAchievement.icon_url,
                achievement_level: displayAchievement.level,
                is_achieved: userAchievement ? userAchievement.is_achieved : 0,
                is_collected: userAchievement ? userAchievement.is_collected : 0
            }
            
            result.push(groupData)
        }
            
            return {
                success: true,
                data: result,
                openid: wxContext.OPENID,
                appid: wxContext.APPID,
                unionid: wxContext.UNIONID,
        }
        
    } catch (error) {
        console.error('获取用户成就失败:', error)
        return {
            success: false,
            error: error.message,
            openid: wxContext.OPENID,
            appid: wxContext.APPID,
            unionid: wxContext.UNIONID,
        }
    }
}