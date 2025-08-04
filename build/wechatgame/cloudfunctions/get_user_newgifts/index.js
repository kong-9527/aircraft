// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
    try {
        const wxContext = cloud.getWXContext()
        const db = cloud.database()
        
        // 获取用户openid
        const openid = wxContext.OPENID
        
        // 1. 查询所有新人礼任务
        const newgiftsResult = await db.collection('basic_newgifts').get()
        const allNewgifts = newgiftsResult.data
        
        // 2. 查询当前用户的完成情况
        const userNewgiftsResult = await db.collection('user_newgift')
            .where({
                user_id: openid
            })
            .get()
        const userNewgifts = userNewgiftsResult.data
        
        // 创建用户完成情况的映射
        const userNewgiftMap = {}
        userNewgifts.forEach(item => {
            userNewgiftMap[item.newgift_id] = {
                is_achieved: item.is_achieved || 0,
                is_collected: item.is_collected || 0
            }
        })
        
        // 3. 查询所有奖励物品信息
        const rewardListResult = await db.collection('basic_newgift_rewardlist').get()
        const rewardList = rewardListResult.data
        
        // 创建奖励映射
        const rewardMap = {}
        rewardList.forEach(item => {
            if (!rewardMap[item.newgift_id]) {
                rewardMap[item.newgift_id] = []
            }
            rewardMap[item.newgift_id].push({
                item_id: item.item_id,
                item_num: item.item_num
            })
        })
        
        // 4. 构建返回数据
        const resultData = []
        
        for (const newgift of allNewgifts) {
            const userStatus = userNewgiftMap[newgift.id] || {
                is_achieved: 0,
                is_collected: 0
            }
            
            // 获取该任务的奖励物品
            const rewards = rewardMap[newgift.id] || []
            
            // 为每个奖励物品添加详细信息（这里需要根据你的物品表结构来查询）
            const detailedRewards = []
            for (const reward of rewards) {
                // 这里需要根据你的物品表来查询物品详细信息
                // 假设你有一个basic_items表存储物品信息
                try {
                    const itemResult = await db.collection('basic_items')
                        .where({
                            id: reward.item_id
                        })
                        .get()
                    
                    if (itemResult.data.length > 0) {
                        const item = itemResult.data[0]
                        detailedRewards.push({
                            item_id: reward.item_id,
                            item_name: item.name || '未知物品',
                            item_num: reward.item_num,
                            item_icon: item.icon || ''
                        })
                    } else {
                        // 如果找不到物品信息，使用默认值
                        detailedRewards.push({
                            item_id: reward.item_id,
                            item_name: '未知物品',
                            item_num: reward.item_num,
                            item_icon: ''
                        })
                    }
                } catch (error) {
                    // 如果查询物品信息失败，使用默认值
                    detailedRewards.push({
                        item_id: reward.item_id,
                        item_name: '未知物品',
                        item_num: reward.item_num,
                        item_icon: ''
                    })
                }
            }
            
            resultData.push({
                newgift_id: newgift.id,
                newgift_name: newgift.name,
                newgift_description: newgift.description,
                is_achieved: userStatus.is_achieved,
                is_collected: userStatus.is_collected,
                rewards: detailedRewards
            })
        }
        
        return {
            success: true,
            message: '获取新人礼任务成功',
            data: resultData,
            openid: openid,
            appid: wxContext.APPID,
            unionid: wxContext.UNIONID
        }
        
    } catch (error) {
        console.error('获取新人礼任务失败:', error)
        return {
            success: false,
            message: '获取新人礼任务失败: ' + error.message,
            data: [],
            error: error.message
        }
    }
}