// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const db = cloud.database()
    
    try {
        // 获取参数
        const { plane_type, data, mode } = event
        
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
        
        if (!mode || ![1, 2, 3].includes(mode)) {
            return {
                success: false,
                message: 'mode参数错误，必须是1、2或3'
            }
        }
        
        // 当前逻辑只支持mode=2
        if (mode !== 2) {
            return {
                success: false,
                message: '当前只支持mode=2的游戏模式'
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
        
        // 构建玩家的棋盘数据
        const chessBoard = buildChessBoard()
        
        // 获取用户信息以确定type
        const userResult = await db.collection('user').where({
            openid: wxContext.OPENID
        }).get()
        
        const userType = userResult.data.length > 0 ? userResult.data[0].type : 1 // 默认为1
        
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
        
        // 检查是否有可加入的房间
        const existingRoom = await findAvailableRoom(db)
        
        if (existingRoom) {
            // 加入现有房间
            const joinResult = await joinExistingRoom(db, existingRoom, wxContext.OPENID, groupId, chessBoard, userType, playerItems)
            
            if (joinResult.success) {
                return {
                    success: true,
                    message: '成功加入房间，游戏开始',
                    data: {
                        room_code: existingRoom.room_code,
                        group_id: groupId,
                        plane_nums: planeNums,
                        room_id: existingRoom._id,
                        status: 'playing'
                    }
                }
            } else {
                return {
                    success: false,
                    message: joinResult.message
                }
            }
        } else {
            // 创建新房间
            const createResult = await createNewRoom(db, wxContext.OPENID, groupId, chessBoard, mode, userType, playerItems)
            
            if (createResult.success) {
                return {
                    success: true,
                    message: '房间创建成功，等待其他玩家加入',
                    data: {
                        room_code: createResult.room_code,
                        group_id: groupId,
                        plane_nums: planeNums,
                        room_id: createResult.room_id,
                        status: 'waiting'
                    }
                }
            } else {
                return {
                    success: false,
                    message: createResult.message
                }
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

// 构建棋盘数据（1-144个格子，初始状态为"0"）
function buildChessBoard() {
    const chessBoard = {}
    for (let i = 1; i <= 144; i++) {
        chessBoard[`chess_${i}`] = "0"
    }
    return chessBoard
}

// 生成唯一的6位数字room_code
async function generateUniqueRoomCode(db) {
    let attempts = 0
    const maxAttempts = 10
    
    while (attempts < maxAttempts) {
        // 生成6位随机数字
        const roomCode = Math.floor(100000 + Math.random() * 900000).toString()
        
        // 检查是否已存在
        const result = await db.collection('battle_rooms').where({
            room_code: roomCode,
            status: db.command.in(['waiting', 'playing'])
        }).get()
        
        if (result.data.length === 0) {
            return roomCode
        }
        
        attempts++
    }
    
    throw new Error('无法生成唯一的room_code')
}

// 查找可加入的房间
async function findAvailableRoom(db) {
    try {
        const result = await db.collection('battle_rooms').where({
            mode: 2,
            status: 'waiting'
        }).limit(1).get()
        
        if (result.data.length > 0) {
            const room = result.data[0]
            // 检查房间是否已经有2个玩家
            if (room.players && room.players.length >= 2) {
                return null
            }
            return room
        }
        
        return null
    } catch (error) {
        console.error('查找可加入房间时出错:', error)
        return null
    }
}

// 创建新房间
async function createNewRoom(db, openId, groupId, chessBoard, mode, userType, playerItems) {
    try {
        const roomCode = await generateUniqueRoomCode(db)
        const currentTime = Date.now()
        
        const roomData = {
            room_code: roomCode,
            plane_type: 1,
            players: [
                {
                    openid: openId,
                    role: "first",
                    type: userType.toString(), // 添加type属性
                    group_id: groupId.toString(),
                    items: playerItems, // 添加道具信息
                    chess_board: chessBoard
                }
            ],
            status: 'waiting',
            ctime: currentTime,
            current_player: openId,
            winner: '',
            timeout: 30,
            last_move_time: currentTime,
            mode: mode,
            attack_num: 0
        }
        
        const result = await db.collection('battle_rooms').add({
            data: roomData
        })
        
        return {
            success: true,
            room_code: roomCode,
            room_id: result._id
        }
        
    } catch (error) {
        console.error('创建新房间时出错:', error)
        return {
            success: false,
            message: '创建房间失败'
        }
    }
}

// 加入现有房间
async function joinExistingRoom(db, room, openId, groupId, chessBoard, userType, playerItems) {
    try {
        // 检查房间是否已经有2个玩家
        if (room.players && room.players.length >= 2) {
            return {
                success: false,
                message: '房间已满'
            }
        }
        
        // 检查玩家是否已经在房间中
        if (room.players && room.players.some(player => player.openid === openId)) {
            return {
                success: false,
                message: '您已经在房间中'
            }
        }
        
        // 添加新玩家
        const newPlayer = {
            openid: openId,
            role: "second",
            type: userType.toString(), // 添加type属性
            group_id: groupId.toString(),
            items: playerItems, // 添加道具信息
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
            success: true
        }
        
    } catch (error) {
        console.error('加入房间时出错:', error)
        return {
            success: false,
            message: '加入房间失败'
        }
    }
}