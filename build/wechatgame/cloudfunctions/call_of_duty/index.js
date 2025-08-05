// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const db = cloud.database()
    
    // 重试机制
    let retryCount = 0
    const maxRetries = 3
    
    while (retryCount < maxRetries) {
        try {
            const result = await processCallOfDuty(db, event.room_id, wxContext.OPENID)
            return result
        } catch (error) {
            console.error(`第${retryCount + 1}次尝试失败:`, error)
            retryCount++
            
            if (retryCount >= maxRetries) {
                // 最终失败，更新房间状态为ended
                await handleFinalFailure(db, event.room_id)
                return {
                    code: 500,
                    message: "玩家匹配失败，请重新发起对战"
                }
            }
        }
    }
}

// 主要业务逻辑处理
async function processCallOfDuty(db, roomId, currentOpenid) {
    // 1. 检查房间状态
    const roomResult = await db.collection('battle_rooms').doc(roomId).get()
    if (!roomResult.data) {
        throw new Error('房间不存在')
    }
    
    const room = roomResult.data
    
    // 如果房间已满2人或状态不是waiting，直接返回成功
    if (room.players && room.players.length >= 2 || room.status !== 'waiting') {
        return {
            code: 200,
            message: "房间状态已改变"
        }
    }
    
    // 2. 查找可用的AI用户（带重试机制）
    let aiUser = null
    let retryCount = 0
    const maxRetries = 3
    
    while (retryCount < maxRetries && !aiUser) {
        aiUser = await findAvailableAIUser(db, roomId)
        if (!aiUser) {
            retryCount++
            if (retryCount < maxRetries) {
                // 等待一小段时间后重试
                await new Promise(resolve => setTimeout(resolve, 1000))
            }
        }
    }
    
    // 如果重试后仍未找到AI用户，再次检查房间状态避免并发冲突
    if (!aiUser) {
        // 再次检查房间状态
        const finalRoomResult = await db.collection('battle_rooms').doc(roomId).get()
        const finalRoom = finalRoomResult.data
        
        // 如果房间已满2人或状态不是waiting，说明有其他玩家或AI已经加入，返回成功
        if (finalRoom.players && finalRoom.players.length >= 2 || finalRoom.status !== 'waiting') {
            return {
                code: 200,
                message: "房间状态已改变"
            }
        }
        
        // 如果房间仍然只有1人且状态为waiting，则结束房间并返回错误
        if (finalRoom.players && finalRoom.players.length === 1 && finalRoom.status === 'waiting') {
            await db.collection('battle_rooms').doc(roomId).update({
                data: {
                    status: 'ended',
                    end_reason: 'no_ai_available'
                }
            })
            
            return {
                code: 500,
                message: "玩家匹配失败，请重新发起对战"
            }
        }
        
        // 其他情况返回成功
        return {
            code: 200,
            message: "房间状态已改变"
        }
    }
    
    // 3. 生成随机group_id
    const groupId = generateRandomGroupId()
    
    // 4. 在更新数据库前再次检查房间状态
    const currentRoomResult = await db.collection('battle_rooms').doc(roomId).get()
    const currentRoom = currentRoomResult.data
    
    // 如果房间状态已改变（不再是waiting或人数不再是1人），返回成功
    if (currentRoom.status !== 'waiting' || 
        (currentRoom.players && currentRoom.players.length !== 1)) {
        return {
            code: 200,
            message: "房间状态已改变"
        }
    }
    
    // 5. 构建AI玩家数据
    const aiPlayer = {
        openid: aiUser.openid,
        role: "second", // AI玩家默认为second角色
        type: aiUser.type.toString(), // 对应user表中的type值
        group_id: groupId,
        chess_board: generateChessBoard() // 生成棋盘数据，格式为chess_1到chess_144
    }
    
    // 6. 更新房间信息（使用事务确保数据一致性）
    const transaction = await db.startTransaction()
    
    try {
        // 先更新players字段
        await transaction.collection('battle_rooms').doc(roomId).update({
            data: {
                players: db.command.push(aiPlayer)
            }
        })
        
        // 确保players更新完毕后再更新status和last_move_time
        await transaction.collection('battle_rooms').doc(roomId).update({
            data: {
                status: 'playing',
                last_move_time: Date.now()
            }
        })
        
        await transaction.commit()
        
        return {
            code: 200,
            message: "AI玩家匹配成功"
        }
        
    } catch (error) {
        await transaction.rollback()
        throw error
    }
}

// 查找可用的AI用户
async function findAvailableAIUser(db, roomId) {
    // 获取当前房间信息
    const roomResult = await db.collection('battle_rooms').doc(roomId).get()
    const room = roomResult.data
    
    // 获取所有type=2的用户
    const usersResult = await db.collection('user').where({
        type: 2
    }).get()
    
    const aiUsers = usersResult.data
    
    // 获取所有正在等待或对战的房间
    const activeRoomsResult = await db.collection('battle_rooms').where({
        status: db.command.in(['waiting', 'playing'])
    }).get()
    
    const activeRooms = activeRoomsResult.data
    
    // 收集所有已参与对战的用户openid
    const busyOpenids = new Set()
    activeRooms.forEach(room => {
        if (room.players) {
            room.players.forEach(player => {
                busyOpenids.add(player.openid)
            })
        }
    })
    
    // 过滤出可用的AI用户
    const availableAIUsers = aiUsers.filter(user => !busyOpenids.has(user.openid))
    
    if (availableAIUsers.length === 0) {
        return null
    }
    
    // 随机选择一个AI用户
    const randomIndex = Math.floor(Math.random() * availableAIUsers.length)
    return availableAIUsers[randomIndex]
}

// 生成随机group_id
function generateRandomGroupId() {
    return Math.floor(Math.random() * 1000000).toString()
}

// 生成棋盘数据（chess_1到chess_144格式）
function generateChessBoard() {
    const chessBoard = {}
    
    for (let i = 1; i <= 144; i++) {
        chessBoard[`chess_${i}`] = Math.random() > 0.8 ? "1" : "0" // 随机生成一些初始状态，值为字符串
    }
    
    return chessBoard
}

// 处理最终失败情况
async function handleFinalFailure(db, roomId) {
    try {
        // 检查房间当前状态
        const roomResult = await db.collection('battle_rooms').doc(roomId).get()
        const room = roomResult.data
        
        if (!room) {
            return
        }
        
        // 检查是否超时
        const currentTime = Date.now()
        const waitStartTime = room.wait_start_time || room.create_time || currentTime
        const waitDuration = currentTime - waitStartTime
        
        // 如果房间只有1人且状态为waiting，或者已经超时，则更新为ended
        if ((room.players && room.players.length === 1 && room.status === 'waiting') || 
            (room.status === 'waiting' && waitDuration > 30000)) {
            await db.collection('battle_rooms').doc(roomId).update({
                data: {
                    status: 'ended',
                    end_reason: room.status === 'waiting' && waitDuration > 30000 ? 'timeout' : 'match_failed'
                }
            })
        }
    } catch (error) {
        console.error('处理最终失败时出错:', error)
    }
}