// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const db = cloud.database()
    
    try {
        // 获取参数
        const { mode, plane_type, data } = event
        
        // 参数验证
        if (!mode || ![1, 2, 3].includes(mode)) {
            return {
                success: false,
                message: 'mode参数错误，必须是1、2或3'
            }
        }
        
        if (!plane_type || plane_type !== 1) {
            return {
                success: false,
                message: 'plane_type参数错误，必须是1'
            }
        }
        
        if (!data || !Array.isArray(data) || data.length !== 3) {
            return {
                success: false,
                message: 'data参数错误，必须是包含3架飞机信息的数组'
            }
        }
        
        // 验证每架飞机的数据
        for (let i = 0; i < data.length; i++) {
            const plane = data[i]
            if (!plane.plane_temp_id || !plane.direction || !plane.group || !Array.isArray(plane.group) || plane.group.length !== 10) {
                return {
                    success: false,
                    message: `第${i + 1}架飞机数据格式错误`
                }
            }
            
            // 验证direction
            if (![1, 2, 3, 4].includes(plane.direction)) {
                return {
                    success: false,
                    message: `第${i + 1}架飞机方向参数错误，必须是1、2、3或4`
                }
            }
            
            // 验证group中的每个点
            for (let j = 0; j < plane.group.length; j++) {
                const point = plane.group[j]
                if (!point.detail || !Array.isArray(point.detail)) {
                    return {
                        success: false,
                        message: `第${i + 1}架飞机第${j + 1}个点的detail数据格式错误`
                    }
                }
                
                for (let k = 0; k < point.detail.length; k++) {
                    const detail = point.detail[k]
                    if (typeof detail.complex_x !== 'number' || 
                        typeof detail.complex_y !== 'number' || 
                        typeof detail.number !== 'number' || 
                        typeof detail.is_head !== 'number') {
                        return {
                            success: false,
                            message: `第${i + 1}架飞机第${j + 1}个点第${k + 1}个detail数据格式错误`
                        }
                    }
                }
            }
        }
        
        // 处理每架飞机，确定plane_num
        const planeNums = []
        
        for (let i = 0; i < data.length; i++) {
            const plane = data[i]
            const planeNum = await determinePlaneNum(db, plane)
            
            if (!planeNum) {
                return {
                    success: false,
                    message: `第${i + 1}架飞机无法确定plane_num`
                }
            }
            
            planeNums.push(planeNum)
        }
        
        // 排序plane_num
        planeNums.sort((a, b) => a - b)
        
        // 查找group_id
        const groupId = await findGroupId(db, planeNums)
        
        if (!groupId) {
            return {
                success: false,
                message: '无法找到匹配的飞机组合'
            }
        }
        
        // 获取用户ID（如果需要的话）
        let userId = null
        try {
            const userResult = await db.collection('users').where({
                open_id: wxContext.OPENID
            }).get()
            
            if (userResult.data.length > 0) {
                userId = userResult.data[0].id
            }
        } catch (error) {
            console.log('获取用户ID失败，使用open_id作为标识')
        }
        
        // 插入到匹配池
        const matchPoolData = {
            user_id: userId,
            open_id: wxContext.OPENID,
            join_time: Date.now(),
            type: 1,
            level: '0', // 默认全段位随机匹配
            group_id: groupId,
            mode: mode
        }
        
        const insertResult = await db.collection('battle_matchpool').add({
            data: matchPoolData
        })
        
        return {
            success: true,
            message: '飞机布局提交成功，已加入匹配池',
            data: {
                group_id: groupId,
                plane_nums: planeNums,
                match_id: insertResult._id
            }
        }
        
    } catch (error) {
        console.error('submit_user_planes云函数执行错误:', error)
        return {
            success: false,
            message: '系统异常，请稍后重试'
        }
    }
}

// 根据飞机数据确定plane_num
async function determinePlaneNum(db, plane) {
    try {
        // 第一步：收集所有is_head=1的点的坐标信息
        const headPoints = []
        
        for (let i = 0; i < plane.group.length; i++) {
            const point = plane.group[i]
            for (let j = 0; j < point.detail.length; j++) {
                const detail = point.detail[j]
                if (detail.is_head === 1) {
                    headPoints.push({
                        real_part: detail.complex_x,
                        imag_part: detail.complex_y,
                        square: detail.number
                    })
                }
            }
        }
        
        if (headPoints.length === 0) {
            console.error('没有找到is_head=1的点')
            return null
        }
        
        // 第二步：用is_head=1的点在ai_basic_plane_12x12表中查询，获得可能的plane_num
        const possiblePlaneNums = new Set()
        
        for (const headPoint of headPoints) {
            const result = await db.collection('ai_basic_plane_12x12').where({
                real_part: headPoint.real_part,
                imag_part: headPoint.imag_part,
                square: headPoint.square,
                is_head: 1
            }).get()
            
            // 将查询到的plane_num添加到集合中
            result.data.forEach(item => {
                possiblePlaneNums.add(item.plane_num)
            })
        }
        
        if (possiblePlaneNums.size === 0) {
            console.error('在ai_basic_plane_12x12表中没有找到匹配的plane_num')
            return null
        }
        
        // 第三步：在ai_basic_plane_num表中用direction条件确定最终的plane_num
        const planeNumArray = Array.from(possiblePlaneNums)
        
        for (const planeNum of planeNumArray) {
            const result = await db.collection('ai_basic_plane_num').where({
                plane_num: planeNum,
                direction: plane.direction
            }).get()
            
            if (result.data.length > 0) {
                // 找到匹配的plane_num和direction组合
                return planeNum
            }
        }
        
        console.error('在ai_basic_plane_num表中没有找到匹配的plane_num和direction组合')
        return null
        
    } catch (error) {
        console.error('确定plane_num时出错:', error)
        return null
    }
}

// 查找group_id
async function findGroupId(db, planeNums) {
    try {
        if (planeNums.length !== 3) {
            return null
        }
        
        const [aNum, bNum, cNum] = planeNums
        
        const result = await db.collection('ai_basic_plane_groups_12x12_3').where({
            a_num: aNum,
            b_num: bNum,
            c_num: cNum
        }).get()
        
        if (result.data.length > 0) {
            return result.data[0].id
        }
        
        return null
        
    } catch (error) {
        console.error('查找group_id时出错:', error)
        return null
    }
}