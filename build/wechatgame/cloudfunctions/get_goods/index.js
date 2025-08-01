// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    // 查询basic_goods表中的所有商品
    const result = await db.collection('basic_goods')
      .where({
        // 可以添加查询条件，比如只查询有效的商品
        // status: 1
      })
      .get()
    
    // 转换数据格式以匹配接口协议
    const goodsList = result.data.map(item => {
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
        currency: item.currency || 1, // 默认为人民币
        num: item.num || 1, // 默认为1
        extra_reward_type: item.extra_item_id || 0, // 映射额外奖励类型
        extra_reward_num: item.extra_item_num || 0, // 映射额外奖励数量
        icon_url: iconUrl
      }
    })
    
    // 按照cost从小到大排序，cost相同时按id正序
    goodsList.sort((a, b) => {
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
      data: goodsList,
      message: '获取商品列表成功',
      total: goodsList.length
    }
    
  } catch (error) {
    console.error('获取商品列表失败:', error)
    return {
      success: false,
      data: [],
      message: '获取商品列表失败',
      error: error.message
    }
  }
}
