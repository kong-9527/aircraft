// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const db = cloud.database()
    
    try {
        // 获取参数
        const { room_code, plane_type, data } = event
        
        if (!room_code) {
            return {
                success: false,
                message: '房间码不能为空'
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
        
        // 查找房间 - 先查找waiting状态的房间
        let roomResult = await db.collection('battle_rooms').where({
            room_code: room_code,
            mode: 3,
            status: 'waiting'
        }).get()
        
        let room = null
        let isPlayingRoom = false
        
        if (roomResult.data.length === 1) {
            // 找到waiting状态的房间，视为有效房间
            room = roomResult.data[0]
            
            // 检查房间是否已经有2个玩家
            if (room.players && room.players.length >= 2) {
                return {
                    success: false,
                    message: '对战已满'
                }
            }
            
            // 检查玩家是否已经在房间中
            if (room.players && room.players.some(player => player.openid === wxContext.OPENID)) {
                return {
                    success: false,
                    message: '您已经在对战中'
                }
            }
        } else if (roomResult.data.length === 0) {
            // 没找到waiting状态的房间，查找playing状态的房间
            roomResult = await db.collection('battle_rooms').where({
                room_code: room_code,
                mode: 3,
                status: 'playing'
            }).get()
            
            if (roomResult.data.length === 1) {
                // 找到playing状态的房间
                room = roomResult.data[0]
                isPlayingRoom = true
                
                // 检查role=second的玩家是否是自己
                const secondPlayer = room.players ? room.players.find(player => player.role === 'second') : null
                
                if (secondPlayer && secondPlayer.openid === wxContext.OPENID) {
                    // 是自己，提示已在对战中，抛弃本次提交的数据
                    return {
                        success: true,
                        message: '您已经在对战中',
                        data: {
                            room_code: room.room_code,
                            group_id: secondPlayer.group_id,
                            room_id: room._id,
                            status: 'playing',
                            is_existing_player: true
                        }
                    }
                } else {
                    // 不是自己，提示对战已满员
                    return {
                        success: false,
                        message: '对战已满员'
                    }
                }
            } else if (roomResult.data.length === 0) {
                // 都没找到，提示对战已结束
                return {
                    success: false,
                    message: '对战已结束'
                }
            }
        }
        
        // 如果是playing状态的房间，不需要继续处理，因为已经在上面返回了
        if (isPlayingRoom) {
            return {
                success: false,
                message: '对战已满员'
            }
        }
        
        // 验证只有type=1的玩家可以参与好友邀请对战
        const userResult = await db.collection('user').where({
            openid: wxContext.OPENID
        }).get()
        
        const userType = userResult.data.length > 0 ? userResult.data[0].type : 1
        if (userType !== 1) {
            return {
                success: false,
                message: '加入对战失败'
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
        
        // 构建玩家的棋盘数据
        const chessBoard = buildChessBoard()
        
        // 检查用户是否有item_id=1的道具
        const userItemResult = await db.collection('user_item').where({
            openid: wxContext.OPENID,
            item_id: 1
        }).get()
        
        const hasItem1 = userItemResult.data.length > 0 && userItemResult.data[0].item_num > 0
        
        // 构建玩家的items数组
        const playerItems = []
        if (hasItem1) {
            playerItems.push({
                item_id: "1",
                item_status: "0"
            })
        }
        
        // 添加新玩家
        const newPlayer = {
            openid: wxContext.OPENID,
            role: "second",
            type: userType.toString(),
            group_id: groupId.toString(),
            items: playerItems,
            chess_board: chessBoard
        }
        
        const updateData = {
            players: db.command.push(newPlayer),
            status: 'playing',
            last_move_time: Date.now()
        }
        
        await db.collection('battle_rooms').doc(room._id).update({
            data: updateData
        })
        
        return {
            success: true,
            message: '成功加入好友邀请房间',
            data: {
                room_code: room.room_code,
                group_id: groupId,
                room_id: room._id,
                status: 'playing'
            }
        }
        
    } catch (error) {
        console.error('join_friend_invite云函数执行错误:', error)
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

// 构建棋盘数据（1-144个格子，初始状态为"0"）
function buildChessBoard() {
    const chessBoard = {}
    for (let i = 1; i <= 144; i++) {
        chessBoard[`chess_${i}`] = "0"
    }
    return chessBoard
} 