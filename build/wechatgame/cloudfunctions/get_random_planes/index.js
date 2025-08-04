// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const db = cloud.database()
    
    try {
        // 获取传入的参数
        const { plane_type } = event
        
        // 生成1~200万之间的随机数
        const randomNum = Math.floor(Math.random() * 2000000) + 1
        // 除以942032取余数作为id
        const targetId = randomNum % 942032
        
        // 查询ai_basic_plane_groups_12x12_3表获取3架飞机的编号
        const groupResult = await db.collection('ai_basic_plane_groups_12x12_3')
            .where({
                id: targetId
            })
            .get()
        
        if (groupResult.data.length === 0) {
            throw new Error('未找到对应的飞机组信息')
        }
        
        const groupData = groupResult.data[0]
        const planeIds = [groupData.a_num, groupData.b_num, groupData.c_num]
        
        // 获取每架飞机的详细信息
        const planesData = []
        
        for (let i = 0; i < planeIds.length; i++) {
            const planeId = planeIds[i]
            
            // 查询飞机方向
            const directionResult = await db.collection('ai_basic_plane_num')
                .where({
                    plane_num: planeId
                })
                .get()
            
            if (directionResult.data.length === 0) {
                throw new Error(`未找到飞机编号${planeId}的方向信息`)
            }
            
            const direction = directionResult.data[0].direction
            
            // 查询飞机的10个点信息
            const pointsResult = await db.collection('ai_basic_plane_12x12')
                .where({
                    plane_num: planeId
                })
                .get()
            
            if (pointsResult.data.length === 0) {
                throw new Error(`未找到飞机编号${planeId}的点信息`)
            }
            
            // 组装每个点的详细信息
            const group = pointsResult.data.map(point => ({
                detail: {
                    complex_x: point.real_part,
                    complex_y: point.imag_part,
                    number: point.square,
                    is_head: point.is_head
                }
            }))
            
            // 组装飞机信息
            planesData.push({
                plane_id: planeId,
                direction: direction,
                group: group
            })
        }
        
        return {
            event,
            openid: wxContext.OPENID,
            appid: wxContext.APPID,
            unionid: wxContext.UNIONID,
            plane_type: plane_type,
            data: planesData
        }
        
    } catch (error) {
        console.error('云函数执行错误:', error)
        return {
            event,
            openid: wxContext.OPENID,
            appid: wxContext.APPID,
            unionid: wxContext.UNIONID,
            error: error.message
        }
    }
}