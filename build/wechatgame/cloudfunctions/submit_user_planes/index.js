// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const db = cloud.database()
    
    try {
        // 获取参数
        const { plane_type, data, mode, difficulty } = event
        
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
        
        // 当mode=1时，验证difficulty参数
        if (mode === 1) {
            if (!difficulty || ![1, 2, 3].includes(difficulty)) {
                return {
                    success: false,
                    message: 'difficulty参数错误，必须是1、2或3'
                }
            }
        }
        
        // 当前逻辑只支持mode=1和mode=2
        if (mode === 3) {
            return {
                success: false,
                message: '当前只支持mode=1和mode=2的游戏模式'
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
        
        // 根据mode进行不同的处理
        if (mode === 1) {
            // 人机对战模式
            return await handleAIMode(db, wxContext.OPENID, groupId, chessBoard, difficulty, userType)
        } else if (mode === 2) {
            // 人人对战模式
            return await handlePlayerMode(db, wxContext.OPENID, groupId, chessBoard, userType)
        }
        
    } catch (error) {
        console.error('submit_user_planes云函数执行错误:', error)
        return {
            success: false,
            message: '系统异常，请稍后重试'
        }
    }
}

// 处理人机对战模式
async function handleAIMode(db, openId, groupId, chessBoard, difficulty, userType) {
    try {
        // 结束玩家之前的未完成房间
        await endPreviousRooms(db, openId)
        
        // 获取AI对手
        const aiOpponent = await getAIOpponent(db)
        if (!aiOpponent) {
            return {
                success: false,
                message: '无法获取AI对手'
            }
        }
        
        // 随机选择AI飞机布局
        const aiGroupId = await getRandomAIGroupId(db)
        if (!aiGroupId) {
            return {
                success: false,
                message: '无法获取AI飞机布局'
            }
        }
        
        // 生成AI的棋盘数据
        const aiChessBoard = buildChessBoard()
        
        // 创建人机对战房间
        const createResult = await createAIBattleRoom(db, openId, groupId, chessBoard, aiOpponent, aiGroupId, aiChessBoard, difficulty, userType)
        
        if (createResult.success) {
            return {
                success: true,
                message: '人机对战房间创建成功',
                data: {
                    room_code: createResult.room_code,
                    group_id: groupId,
                    room_id: createResult.room_id,
                    status: 'playing',
                    difficulty: difficulty
                }
            }
        } else {
            return {
                success: false,
                message: createResult.message
            }
        }
        
    } catch (error) {
        console.error('处理人机对战模式时出错:', error)
        return {
            success: false,
            message: '创建人机对战房间失败'
        }
    }
}

// 处理人人对战模式
async function handlePlayerMode(db, openId, groupId, chessBoard, userType) {
    try {
        // 检查用户是否有item_id=1的道具
        const userItemResult = await db.collection('user_item').where({
            openid: openId,
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
            const joinResult = await joinExistingRoom(db, existingRoom, openId, groupId, chessBoard, userType, playerItems)
            
            if (joinResult.success) {
                return {
                    success: true,
                    message: '成功加入房间，游戏开始',
                    data: {
                        room_code: existingRoom.room_code,
                        group_id: groupId,
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
            const createResult = await createNewRoom(db, openId, groupId, chessBoard, 2, userType, playerItems)
            
            if (createResult.success) {
                return {
                    success: true,
                    message: '房间创建成功，等待其他玩家加入',
                    data: {
                        room_code: createResult.room_code,
                        group_id: groupId,
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
        console.error('处理人人对战模式时出错:', error)
        return {
            success: false,
            message: '处理人人对战模式失败'
        }
    }
}

// 结束玩家之前的未完成房间
async function endPreviousRooms(db, openId) {
    try {
        await db.collection('battle_rooms').where({
            mode: 1,
            'players.openid': openId,
            status: db.command.neq('ended')
        }).update({
            data: {
                status: 'ended'
            }
        })
    } catch (error) {
        console.error('结束玩家之前房间时出错:', error)
    }
}

// 获取AI对手（type=9的用户）
async function getAIOpponent(db) {
    try {
        const result = await db.collection('user').where({
            type: 9
        }).limit(1).get()
        
        if (result.data.length > 0) {
            return result.data[0]
        }
        
        return null
    } catch (error) {
        console.error('获取AI对手时出错:', error)
        return null
    }
}

// 随机选择AI飞机布局
async function getRandomAIGroupId(db) {
    try {
        // 获取所有可用的group_id
        const result = await db.collection('ai_basic_plane_groups_12x12_3').aggregate()
            .sample({
                size: 1
            })
            .end()
        
        if (result.list.length > 0) {
            return result.list[0].id
        }
        
        return null
    } catch (error) {
        console.error('随机选择AI飞机布局时出错:', error)
        return null
    }
}

// 创建人机对战房间
async function createAIBattleRoom(db, openId, groupId, chessBoard, aiOpponent, aiGroupId, aiChessBoard, difficulty, userType) {
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
                    type: userType.toString(),
                    group_id: groupId.toString(),
                    chess_board: chessBoard
                },
                {
                    openid: aiOpponent.openid,
                    role: "second",
                    type: "9",
                    group_id: aiGroupId.toString(),
                    chess_board: aiChessBoard
                }
            ],
            status: 'playing',
            ctime: currentTime,
            current_player: openId,
            winner: '',
            timeout: 30,
            last_move_time: currentTime,
            mode: 1,
            difficulty: difficulty,
            attack_num: 0
        }
        
        const result = await db.collection('battle_rooms').add({
            data: roomData
        })
        
        // 创建battle_ai_decision表记录
        await createAIDecisionRecord(db, result._id, difficulty, aiOpponent.openid)
        
        return {
            success: true,
            room_code: roomCode,
            room_id: result._id
        }
        
    } catch (error) {
        console.error('创建人机对战房间时出错:', error)
        return {
            success: false,
            message: '创建人机对战房间失败'
        }
    }
}

// 创建AI决策记录
async function createAIDecisionRecord(db, roomId, difficulty, aiOpenId) {
    try {
        // 从ai_factor表中获取factor_1~144的数据
        const aiFactorResult = await db.collection('ai_factor').where({
            difficulty: difficulty
        }).get()
        
        if (aiFactorResult.data.length === 0) {
            console.error('在ai_factor表中没有找到对应难度的数据')
            return
        }
        
        const aiFactor = aiFactorResult.data[0]
        
        // 构建weight_1~144的数据
        const weightData = {}
        for (let i = 1; i <= 144; i++) {
            const factorKey = `factor_${i}`
            if (aiFactor[factorKey] !== undefined) {
                weightData[`weight_${i}`] = aiFactor[factorKey]
            } else {
                weightData[`weight_${i}`] = 0 // 默认值
            }
        }
        
        // 创建battle_ai_decision记录
        const decisionData = {
            room_id: roomId,
            plane_type: 1,
            mode: 1,
            difficulty: difficulty,
            ai_open_id: aiOpenId,
            round: 0,
            ...weightData
        }
        
        await db.collection('battle_ai_decision').add({
            data: decisionData
        })
        
        console.log('成功创建AI决策记录，room_id:', roomId)
        
    } catch (error) {
        console.error('创建AI决策记录时出错:', error)
        // 不抛出错误，避免影响房间创建
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