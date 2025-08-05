// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const db = cloud.database()
    
    try {
        // 获取参数
        const { item_id, room_id, square, direction } = event
        
        if (!item_id || ![2, 4, 5].includes(item_id)) {
            return {
                success: false,
                message: 'item_id参数错误，必须是2、4或5'
            }
        }
        
        if (!room_id) {
            return {
                success: false,
                message: 'room_id参数不能为空'
            }
        }
        
        if (item_id === 4 && !square) {
            return {
                success: false,
                message: 'item_id=4时，square参数不能为空'
            }
        }
        
        if (item_id === 4 && ![1, 3].includes(direction)) {
            return {
                success: false,
                message: 'item_id=4时，direction必须是1或3'
            }
        }
        
        if (item_id === 5 && ![1, 2, 3, 4].includes(direction)) {
            return {
                success: false,
                message: 'item_id=5时，direction必须是1、2、3或4'
            }
        }
        
        // 1. 首先判断room_id里的mode=2
        const roomResult = await db.collection('battle_rooms').doc(room_id).get()
        
        if (!roomResult.data) {
            return {
                success: false,
                message: '房间不存在'
            }
        }
        
        const room = roomResult.data
        
        if (room.mode !== 2) {
            return {
                success: false,
                message: '只有在1v1排位赛中才能使用道具'
            }
        }
        
        // 2. 判断当前用户是否已经使用了本次提交的道具
        const currentPlayer = room.players.find(player => player.openid === wxContext.OPENID)
        
        if (!currentPlayer) {
            return {
                success: false,
                message: '您不是该房间的玩家'
            }
        }
        
        // 检查是否已经使用过该道具
        if (currentPlayer.items && currentPlayer.items.some(item => item.item_id === item_id.toString())) {
            return {
                success: false,
                message: '一种科技在一句战斗中只能使用一次'
            }
        }
        
        // 3. 处理不同道具的逻辑
        if (item_id === 2) {
            // 处理item_id=2
            return await handleItem2(db, room_id, wxContext.OPENID)
        } else if (item_id === 4) {
            // 处理item_id=4
            return await handleItem4(db, room_id, wxContext.OPENID, square, direction)
        } else if (item_id === 5) {
            // 处理item_id=5
            return await handleItem5(db, room_id, wxContext.OPENID, direction)
        }
        
    } catch (error) {
        console.error('get_item_result云函数执行错误:', error)
        return {
            success: false,
            message: '系统异常，请稍后重试'
        }
    }
}

// 处理item_id=2
async function handleItem2(db, roomId, openId) {
    try {
        // 获取玩家索引
        const playerIndex = await getPlayerIndex(db, roomId, openId)
        
        // 在当前room中players中该玩家的items数组中新增一个记录
        const updateData = {
            [`players.${playerIndex}.items`]: db.command.push({
                item_id: "2",
                item_status: "0"
            })
        }
        
        await db.collection('battle_rooms').doc(roomId).update({
            data: updateData
        })
        
        return {
            success: true,
            message: '道具使用成功',
            data: {
                result: 200
            }
        }
        
    } catch (error) {
        console.error('处理item_id=2时出错:', error)
        return {
            success: false,
            message: '道具使用失败'
        }
    }
}

// 处理item_id=4
async function handleItem4(db, roomId, openId, square, direction) {
    try {
        // 获取房间信息
        const roomResult = await db.collection('battle_rooms').doc(roomId).get()
        const room = roomResult.data
        
        // 找到对手
        const opponent = room.players.find(player => player.openid !== openId)
        
        if (!opponent) {
            return {
                success: false,
                message: '找不到对手信息'
            }
        }
        
        // 获取12个格子编号
        const targetSquares = getTargetSquaresForItem4(square, direction)
        
        // 通过对方的group_id在ai_basic_plane_groups_12x12_3表中找到他的a_num，b_num，c_num
        const groupResult = await db.collection('ai_basic_plane_groups_12x12_3').where({
            id: parseInt(opponent.group_id)
        }).get()
        
        if (groupResult.data.length === 0) {
            return {
                success: false,
                message: '找不到对手的飞机组合信息'
            }
        }
        
        const group = groupResult.data[0]
        
        // 用这3个数去ai_basic_plane_12x12表中匹配plane_num字段
        const planeResult = await db.collection('ai_basic_plane_12x12').where({
            plane_num: db.command.in([group.a_num, group.b_num, group.c_num])
        }).get()
        
        // 统计命中数量
        let hitCount = 0
        const planeSquares = new Set()
        
        planeResult.data.forEach(plane => {
            planeSquares.add(plane.square)
        })
        
        targetSquares.forEach(squareNum => {
            if (planeSquares.has(squareNum)) {
                hitCount++
            }
        })
        
        // 获取玩家索引
        const playerIndex = await getPlayerIndex(db, roomId, openId)
        
        // 在当前room中players中该玩家的items数组中新增一个记录
        const updateData = {
            [`players.${playerIndex}.items`]: db.command.push({
                item_id: "4",
                item_status: "1"
            })
        }
        
        await db.collection('battle_rooms').doc(roomId).update({
            data: updateData
        })
        
        return {
            success: true,
            message: '道具使用成功',
            data: {
                result: hitCount
            }
        }
        
    } catch (error) {
        console.error('处理item_id=4时出错:', error)
        return {
            success: false,
            message: '道具使用失败'
        }
    }
}

// 处理item_id=5
async function handleItem5(db, roomId, openId, direction) {
    try {
        // 获取房间信息
        const roomResult = await db.collection('battle_rooms').doc(roomId).get()
        const room = roomResult.data
        
        // 找到对手
        const opponent = room.players.find(player => player.openid !== openId)
        
        if (!opponent) {
            return {
                success: false,
                message: '找不到对手信息'
            }
        }
        
        // 获取72个格子编号
        const targetSquares = getTargetSquaresForItem5(direction)
        
        // 通过对方的group_id在ai_basic_plane_groups_12x12_3表中找到他的a_num，b_num，c_num
        const groupResult = await db.collection('ai_basic_plane_groups_12x12_3').where({
            id: parseInt(opponent.group_id)
        }).get()
        
        if (groupResult.data.length === 0) {
            return {
                success: false,
                message: '找不到对手的飞机组合信息'
            }
        }
        
        const group = groupResult.data[0]
        
        // 用这3个数去ai_basic_plane_12x12表中匹配plane_num字段
        const planeResult = await db.collection('ai_basic_plane_12x12').where({
            plane_num: db.command.in([group.a_num, group.b_num, group.c_num])
        }).get()
        
        // 统计命中数量
        let hitCount = 0
        const planeSquares = new Set()
        
        planeResult.data.forEach(plane => {
            planeSquares.add(plane.square)
        })
        
        targetSquares.forEach(squareNum => {
            if (planeSquares.has(squareNum)) {
                hitCount++
            }
        })
        
        // 获取玩家索引
        const playerIndex = await getPlayerIndex(db, roomId, openId)
        
        // 在当前room中players中该玩家的items数组中新增一个记录
        const updateData = {
            [`players.${playerIndex}.items`]: db.command.push({
                item_id: "5",
                item_status: "1"
            })
        }
        
        await db.collection('battle_rooms').doc(roomId).update({
            data: updateData
        })
        
        return {
            success: true,
            message: '道具使用成功',
            data: {
                result: hitCount
            }
        }
        
    } catch (error) {
        console.error('处理item_id=5时出错:', error)
        return {
            success: false,
            message: '道具使用失败'
        }
    }
}

// 获取玩家在房间中的索引
async function getPlayerIndex(db, roomId, openId) {
    const roomResult = await db.collection('battle_rooms').doc(roomId).get()
    const room = roomResult.data
    
    for (let i = 0; i < room.players.length; i++) {
        if (room.players[i].openid === openId) {
            return i
        }
    }
    
    return 0 // 默认返回0
}

// 获取item_id=4的目标格子编号
function getTargetSquaresForItem4(square, direction) {
    if (direction === 1) {
        // 竖向12个格子，根据square确定是哪一列
        const column = Math.ceil(square / 12)
        const squares = []
        for (let i = 1; i <= 12; i++) {
            squares.push((i - 1) * 12 + column)
        }
        return squares
    } else if (direction === 3) {
        // 横向12个格子，根据square确定是哪一行
        const row = Math.ceil(square / 12)
        const squares = []
        for (let i = 1; i <= 12; i++) {
            squares.push((row - 1) * 12 + i)
        }
        return squares
    }
    
    return []
}

// 获取item_id=5的目标格子编号
function getTargetSquaresForItem5(direction) {
    const quadrantSquares = {
        1: [84,96,108,120,132,144,83,95,107,119,131,143,82,94,106,118,130,142,81,93,105,117,129,141,80,92,104,116,128,140,79,91,103,115,127,139],
        2: [12,24,36,48,60,72,11,23,35,47,59,71,10,22,34,46,58,70,9,21,33,45,57,69,8,20,32,44,56,68,7,19,31,43,55,67],
        3: [6,18,30,42,54,66,5,17,29,41,53,65,4,16,28,40,52,64,3,15,27,39,51,63,2,14,26,38,50,62,1,13,25,37,49,61],
        4: [78,90,102,114,126,138,77,89,101,113,125,137,76,88,100,112,124,136,75,87,99,111,123,135,74,86,98,110,122,134,73,85,97,109,121,133]
    }
    
    return quadrantSquares[direction] || []
}