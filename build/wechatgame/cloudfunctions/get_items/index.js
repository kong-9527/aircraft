// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    // 查询basic_items表中type=1且is_forsale=1的道具
    const result = await db.collection('basic_items')
      .where({
        type: 1,        // 1道具
        is_forsale: 1   // 1可售
      })
      .get()
    
    // 转换数据格式以匹配接口协议
    const itemsList = result.data.map(item => {
      // 处理icon_url，确保返回正确的图片路径
      let iconUrl = item.icon_url || ''
      
      // 如果icon_url不为空且不是以http开头，则确保路径格式正确
      if (iconUrl && !iconUrl.startsWith('http')) {
        // 如果路径不是以images/开头，则添加images/前缀
        if (!iconUrl.startsWith('images/')) {
          iconUrl = `images/${iconUrl}`
        }
      }
      
      return {
        id: item.id || item._id, // 兼容微信云数据库的_id字段
        name: item.name || '',
        description: item.description || '',
        cost: item.cost ? parseFloat(item.cost).toFixed(2) : '0.00', // 确保金额格式为两位小数
        currency: item.currency || 9, // 默认为人民币
        num: item.num || 1, // 默认为1
        icon_url: iconUrl
      }
    })
    
    // 按照cost从小到大排序，cost相同时按id正序
    itemsList.sort((a, b) => {
      const costA = parseFloat(a.cost)
      const costB = parseFloat(b.cost)
      
      if (costA !== costB) {
        return costA - costB // cost从小到大排序
      } else {
        return a.id - b.id // cost相同时按id正序
      }
    })
    
    return {
      success: true,
      data: itemsList,
      message: '获取道具列表成功',
      total: itemsList.length
    }
    
  } catch (error) {
    console.error('获取道具列表失败:', error)
    return {
      success: false,
      data: [],
      message: '获取道具列表失败',
      error: error.message
    }
  }
} 