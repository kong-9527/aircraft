// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const db = cloud.database()
    
    try {
        // 获取用户ID（这里假设用户ID就是openid，实际项目中可能需要另外的用户表）
        const userId = wxContext.OPENID
        
        // 查询用户拥有的物品
        const userItemsResult = await db.collection('user_item').where({
            user_id: userId
        }).get()
        
        if (userItemsResult.data.length === 0) {
            return {
                success: true,
                data: []
            }
        }
        
        // 获取所有物品ID
        const itemIds = userItemsResult.data.map(item => item.item_id)
        
        // 查询物品基础信息
        const basicItemsResult = await db.collection('basic_items').where({
            _id: db.command.in(itemIds)
        }).get()
        
        // 创建物品ID到基础信息的映射
        const itemInfoMap = {}
        basicItemsResult.data.forEach(item => {
            itemInfoMap[item._id] = item
        })
        
        // 组装返回数据
        const resultData = userItemsResult.data.map(userItem => {
            const basicInfo = itemInfoMap[userItem.item_id] || {}
            return {
                item_id: userItem.item_id,
                item_num: userItem.item_num,
                item_name: basicInfo.name || '',
                item_description: basicInfo.description || '',
                item_icon_url: basicInfo.icon_url || '',
                item_type: basicInfo.type || 0
            }
        })
        
        return {
            success: true,
            data: resultData
        }
        
    } catch (error) {
        console.error('获取用户物品失败:', error)
        return {
            success: false,
            error: error.message,
            data: []
        }
    }
}