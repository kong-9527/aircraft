// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

// 获取当前月份字符串，格式如：2025-01
function getCurrentMonth() {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
}

// 获取昨天的日期字符串，格式如：2025-01-15
function getYesterdayDate() {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const year = yesterday.getFullYear()
    const month = String(yesterday.getMonth() + 1).padStart(2, '0')
    const day = String(yesterday.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

// 获取指定日期的星期几，1-7代表周一到周日
function getWeekDay(dateStr) {
    const date = new Date(dateStr)
    const weekDay = date.getDay()
    return weekDay === 0 ? 7 : weekDay // 周日返回7，其他返回1-6
}

// 获取签到配置数据
async function getCheckinConfig(month) {
    const db = cloud.database()
    
    // 查询月份配置
    const monthResult = await db.collection('basic_checkin_monthids')
        .where({
            month: month
        })
        .get()
    
    if (monthResult.data.length === 0) {
        return []
    }
    
    const monthId = monthResult.data[0].id
    
    // 查询当月所有签到配置
    const checkinResult = await db.collection('basic_checkins')
        .where({
            month_id: monthId
        })
        .orderBy('date', 'asc')
        .get()
    
    return checkinResult.data
}

// 获取用户签到记录
async function getUserCheckinRecords(userId, checkinIds) {
    if (checkinIds.length === 0) {
        return []
    }
    
    const db = cloud.database()
    const userCheckinResult = await db.collection('user_checkin')
        .where({
            user_id: userId,
            checkin_id: db.command.in(checkinIds)
        })
        .get()
    
    return userCheckinResult.data
}

// 获取物品信息（包括图标URL）
async function getItemInfo(itemIds) {
    if (itemIds.length === 0) {
        return {}
    }
    
    const db = cloud.database()
    const itemResult = await db.collection('base_items')
        .where({
            id: db.command.in(itemIds)
        })
        .get()
    
    // 创建物品信息映射
    const itemMap = {}
    itemResult.data.forEach(item => {
        itemMap[item.id] = item
    })
    
    return itemMap
}

// 判断是否允许补签
function canRecheckin(dateStr, isCollected, yesterdayDate) {
    // 如果已经签到，不能补签
    if (isCollected) {
        return false
    }
    
    // 如果是昨天的日期且昨天未签到，允许补签
    return dateStr === yesterdayDate
}

// 云函数入口函数
exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    
    try {
        // 获取当前月份
        const currentMonth = getCurrentMonth()
        const yesterdayDate = getYesterdayDate()
        
        // 获取签到配置
        const checkinConfigs = await getCheckinConfig(currentMonth)
        
        if (checkinConfigs.length === 0) {
            return {
                success: true,
                data: [],
                message: '本月暂无签到配置'
            }
        }
        
        // 获取用户ID（这里假设通过openid查询用户表获取用户ID）
        const db = cloud.database()
        const userResult = await db.collection('users')
            .where({
                openid: openid
            })
            .get()
        
        if (userResult.data.length === 0) {
            return {
                success: false,
                message: '用户不存在'
            }
        }
        
        const userId = userResult.data[0].id
        const checkinIds = checkinConfigs.map(config => config.id)
        
        // 获取用户签到记录
        const userCheckinRecords = await getUserCheckinRecords(userId, checkinIds)
        
        // 创建签到记录映射
        const checkinRecordMap = {}
        userCheckinRecords.forEach(record => {
            checkinRecordMap[record.checkin_id] = record
        })
        
        // 获取所有物品ID
        const itemIds = [...new Set(checkinConfigs.map(config => config.reward_item_id))]
        
        // 获取物品信息（包括图标URL）
        const itemMap = await getItemInfo(itemIds)
        
        // 组装返回数据
        const resultData = checkinConfigs.map(config => {
            const date = new Date(config.date)
            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
            const week = getWeekDay(dateStr)
            
            const userRecord = checkinRecordMap[config.id]
            const isCollected = userRecord ? userRecord.is_collected === 1 : false
            const isRecheckin = canRecheckin(dateStr, isCollected, yesterdayDate)
            
            // 获取物品信息
            const itemInfo = itemMap[config.reward_item_id] || {}
            
            return {
                date: dateStr,
                week: week,
                item_id: config.reward_item_id,
                item_name: itemInfo.name || config.reward_item_name || `物品${config.reward_item_id}`,
                item_num: config.reward_item_num,
                icon_url: itemInfo.icon_url || '', // 添加图标URL
                is_collected: isCollected,
                is_recheckin: isRecheckin
            }
        })
        
        return {
            success: true,
            data: resultData,
            openid: openid,
            appid: wxContext.APPID,
            unionid: wxContext.UNIONID,
        }
        
    } catch (error) {
        console.error('签到查询失败:', error)
        return {
            success: false,
            message: '查询失败',
            error: error.message
        }
    }
}