// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const db = cloud.database()
    
    try {
        // 1. 验证输入参数
        const { plane_type, data, room_id } = event
        
        if (!plane_type || !data || !room_id) {
            return {
                success: false,
                message: '参数不完整',
                data: null
            }
        }
        
        if (!Array.isArray(data) || data.length === 0) {
            return {
                success: false,
                message: '攻击数据格式错误',
                data: null
            }
        }
        
        // 2. 查询房间信息
        const roomResult = await db.collection('rooms').doc(room_id).get()
        if (!roomResult.data) {
            return {
                success: false,
                message: '房间不存在',
                data: null
            }
        }
        
        const room = roomResult.data
        const currentPlayerOpenid = wxContext.OPENID
        
        // 3. 检查格子状态
        const chessBoard = room.chess_board || {}
        const attackedSquares = data.map(item => item.square)
        
        // 检查是否有已被攻击的格子
        for (const square of attackedSquares) {
            const squareStatus = chessBoard[`chess_${square}`] || '0'
            if (['1', '2', '3'].includes(squareStatus)) {
                return {
                    success: false,
                    message: '已被攻击的格子不需要再次攻击',
                    data: null
                }
            }
        }
        
        // 4. 查询飞机组合信息
        const groupResult = await db.collection('ai_basic_plane_groups_12x12_3').doc(room.group_id).get()
        if (!groupResult.data) {
            return {
                success: false,
                message: '飞机组合信息不存在',
                data: null
            }
        }
        
        const group = groupResult.data
        
        // 解析机头格子
        const headSquares = [
            group.h_a,
            group.h_b,
            group.h_c
        ].filter(Boolean)
        
        // 解析机身格子
        const bodySquares = []
        const bodyFields = [group.bs_a, group.bs_b, group.bs_c]
        for (const field of bodyFields) {
            if (field) {
                const squares = field.split(',').map(s => s.trim()).filter(Boolean)
                bodySquares.push(...squares)
            }
        }
        
        // 5. 处理攻击逻辑（包含道具功能和奖励事件记录）
        let hasHeadHit = false
        const updatedChessBoard = { ...chessBoard }
        
        // 获取被攻击玩家的信息
        const attackedPlayer = players.find(p => p.openid !== currentPlayerOpenid)
        const attackerPlayer = players.find(p => p.openid === currentPlayerOpenid)
        
        // 检查是否是被攻击方首次被击中
        let isFirstHit = false
        let hasHitInThisAttack = false
        const squaresToMarkAsHit = []
        
        // 先检查本次攻击是否有击中
        for (const square of attackedSquares) {
            const squareKey = `chess_${square}`
            const currentStatus = updatedChessBoard[squareKey] || '0'
            
            if (currentStatus === '0') {
                if (headSquares.includes(square.toString()) || bodySquares.includes(square.toString())) {
                    hasHitInThisAttack = true
                    squaresToMarkAsHit.push(square)
                }
            }
        }
        
        // 检查是否是被攻击方首次被击中
        if (hasHitInThisAttack && attackedPlayer) {
            let hasAnyPreviousHit = false
            for (let i = 1; i <= 144; i++) {
                const squareKey = `chess_${i}`
                const status = updatedChessBoard[squareKey] || '0'
                if (status === '1' || status === '2') {
                    hasAnyPreviousHit = true
                    break
                }
            }
            isFirstHit = !hasAnyPreviousHit
        }
        
        // 检查是否攻击了已标记为9的格子
        let hasAttackedMarkedNine = false
        for (const square of attackedSquares) {
            const squareKey = `chess_${square}`
            const currentStatus = updatedChessBoard[squareKey] || '0'
            if (currentStatus === '9') {
                hasAttackedMarkedNine = true
                break
            }
        }
        
        // 处理道具逻辑
        let usedItem = false
        let headDodgeEvent = false // 记录机头闪避事件
        if (attackedPlayer && attackedPlayer.items && hasHitInThisAttack && !hasAttackedMarkedNine) {
            const availableItems = attackedPlayer.items.filter(item => item.item_status === '0')
            const item1 = availableItems.find(item => item.item_id === '1')
            const item2 = availableItems.find(item => item.item_id === '2')
            
            // 优先使用item_id=1的道具（首次被击中时）
            if (isFirstHit && item1) {
                usedItem = true
                // 标记道具为已使用
                await markItemAsUsed(db, room_id, attackedPlayer.openid, '1')
                // 将所有应该被标记为1或2的格子标记为9
                for (const square of squaresToMarkAsHit) {
                    const squareKey = `chess_${square}`
                    updatedChessBoard[squareKey] = '9'
                    // 检查是否是机头闪避
                    if (headSquares.includes(square.toString())) {
                        headDodgeEvent = true
                    }
                }
            } else if (item2) {
                usedItem = true
                // 标记道具为已使用
                await markItemAsUsed(db, room_id, attackedPlayer.openid, '2')
                // 将所有应该被标记为1或2的格子标记为9
                for (const square of squaresToMarkAsHit) {
                    const squareKey = `chess_${square}`
                    updatedChessBoard[squareKey] = '9'
                    // 检查是否是机头闪避
                    if (headSquares.includes(square.toString())) {
                        headDodgeEvent = true
                    }
                }
            }
        }
        
        // 记录机头闪避事件
        if (headDodgeEvent && attackedPlayer && attackedPlayer.type === 1) {
            await recordHeadDodgeEvent(db, room_id, attackedPlayer.openid)
        }
        
        // 如果没有使用道具，按正常逻辑处理攻击
        if (!usedItem) {
            for (const square of attackedSquares) {
                const squareKey = `chess_${square}`
                const currentStatus = updatedChessBoard[squareKey] || '0'
                
                // 如果之前是9（闪避），本次视为击中
                if (currentStatus === '9') {
                    if (headSquares.includes(square.toString())) {
                        updatedChessBoard[squareKey] = '1'
                        hasHeadHit = true
                        // 检查是否是一击必杀
                        await checkOneHitKill(db, room_id, currentPlayerOpenid, square, group)
                    } else if (bodySquares.includes(square.toString())) {
                        updatedChessBoard[squareKey] = '2'
                    }
                } else {
                    // 正常攻击
                    if (headSquares.includes(square.toString())) {
                        updatedChessBoard[squareKey] = '1'
                        hasHeadHit = true
                        // 检查是否是一击必杀
                        await checkOneHitKill(db, room_id, currentPlayerOpenid, square, group)
                    } else if (bodySquares.includes(square.toString())) {
                        updatedChessBoard[squareKey] = '2'
                    } else {
                        updatedChessBoard[squareKey] = '3' // 打空了
                    }
                }
            }
        }
        
        // 6. 统计机头数量
        let headCount = 0
        for (let i = 1; i <= 144; i++) {
            const squareKey = `chess_${i}`
            if (updatedChessBoard[squareKey] === '1') {
                headCount++
            }
        }
        
        // 7. 判断胜负和更新游戏状态
        const currentTime = Date.now()
        let winner = null
        let gameEnded = false
        
        if (headCount >= 3) {
            // 游戏结束，当前玩家获胜
            winner = currentPlayerOpenid
            gameEnded = true
        }
        
        // 8. 更新房间状态
        const updateData = {
            chess_board: updatedChessBoard,
            last_move_time: currentTime
        }
        
        if (gameEnded) {
            updateData.winner = winner
            updateData.status = 'ended'
        } else {
            // 切换玩家
            const players = room.players || []
            const currentPlayerIndex = players.findIndex(p => p.openid === currentPlayerOpenid)
            const nextPlayerIndex = (currentPlayerIndex + 1) % players.length
            const nextPlayer = players[nextPlayerIndex]
            updateData.current_player = nextPlayer.openid
        }
        
        await db.collection('rooms').doc(room_id).update({
            data: updateData
        })
        
        // 9. 处理AI攻击
        if (!gameEnded) {
            const nextPlayer = room.players.find(p => p.openid === updateData.current_player)
            if (nextPlayer && nextPlayer.type === 2) {
                // 延迟1-5秒后调用AI攻击
                const delay = Math.floor(Math.random() * 4000) + 1000 // 1-5秒
                
                setTimeout(async () => {
                    try {
                        await cloud.callFunction({
                            name: 'submit_ai_attack',
                            data: {
                                plane_type: 1,
                                data: [], // AI会生成自己的攻击数据
                                room_id: room_id
                            }
                        })
                    } catch (error) {
                        console.error('AI攻击调用失败:', error)
                    }
                }, delay)
            }
        }
        
        // 10. 结算奖励
        if (gameEnded && winner) {
            const winnerPlayer = room.players.find(p => p.openid === winner)
            const loserPlayer = room.players.find(p => p.openid !== winner)
            
            // 基础获胜奖励
            if (winnerPlayer && winnerPlayer.type === 1) {
                await db.collection('users').doc(winner).update({
                    data: {
                        score: db.command.inc(100)
                    }
                })
            }
            
            // 11. 计算额外奖励
            await calculateExtraRewards(db, room, winner, loserPlayer)
            
            // 12. 计算用户成就
            await calculateUserAchievements(db, room, winner, currentPlayerOpenid)
        }
        
        return {
            success: true,
            message: gameEnded ? '游戏结束' : '攻击成功',
            data: {
                gameEnded,
                winner,
                headCount
            }
        }
        
    } catch (error) {
        console.error('submit_user_attack 错误:', error)
        return {
            success: false,
            message: '服务器错误',
            data: null
        }
    }
}

// 计算用户成就的辅助函数
async function calculateUserAchievements(db, room, winner, currentPlayerOpenid) {
    try {
        const players = room.players || []
        const winnerPlayer = players.find(p => p.openid === winner)
        const loserPlayer = players.find(p => p.openid !== winner)
        
        // 获取winner的chess_board中被标记为1的格子数量
        const winnerHeadCount = countHeadSquares(room.chess_board)
        
        // 获取失败方的chess_board中被标记为1的格子数量
        const loserHeadCount = countHeadSquares(room.chess_board)
        
        // 计算游戏时长（秒）
        const gameDuration = Math.floor((room.last_move_time - room.ctime) / 1000)
        
        // 1. 累积得胜成就 (achievement_id: 1,2,3,4) - 仅对type=1的玩家
        if (winnerPlayer && winnerPlayer.type === 1) {
            await updateAchievement(db, winner, [1, 2, 3, 4], 1)
        }
        
        // 2. 累积得分成就 (achievement_id: 5,6,7) - 仅对type=1的玩家
        if (winnerPlayer && winnerPlayer.type === 1) {
            await updateAchievement(db, winner, [5, 6, 7], 100) // 本次得胜得分100
        }
        
        // 3. 累积击毁的成就 (achievement_id: 8,9,10,11) - 仅对type=1的玩家，双方都计算
        if (winnerPlayer && winnerPlayer.type === 1) {
            await updateAchievement(db, winner, [8, 9, 10, 11], 3) // winner一定是3
        }
        if (loserPlayer && loserPlayer.type === 1) {
            await updateAchievement(db, loserPlayer.openid, [8, 9, 10, 11], winnerHeadCount)
        }
        
        // 4. 累积损失战机成就 (achievement_id: 12,13,14,15) - 仅对type=1的玩家，双方都计算
        if (loserPlayer && loserPlayer.type === 1) {
            await updateAchievement(db, loserPlayer.openid, [12, 13, 14, 15], 3) // 失败方一定+3
        }
        if (winnerPlayer && winnerPlayer.type === 1) {
            await updateAchievement(db, winner, [12, 13, 14, 15], winnerHeadCount)
        }
        
        // 5. 累积总游戏时长 (achievement_id: 16,17,18,19) - 仅对type=1的玩家，双方都计算
        if (winnerPlayer && winnerPlayer.type === 1) {
            await updateAchievement(db, winner, [16, 17, 18, 19], gameDuration)
        }
        if (loserPlayer && loserPlayer.type === 1) {
            await updateAchievement(db, loserPlayer.openid, [16, 17, 18, 19], gameDuration)
        }
        
        // 6. 累积参与1v1对战的场数 (achievement_id: 27,28,29) - 仅对type=1的玩家，双方都计算
        if (winnerPlayer && winnerPlayer.type === 1) {
            await updateAchievement(db, winner, [27, 28, 29], 1)
        }
        if (loserPlayer && loserPlayer.type === 1) {
            await updateAchievement(db, loserPlayer.openid, [27, 28, 29], 1)
        }
        
        // 7. 计算连胜局成就 (achievement_id: 78,79,80) - 仅对type=1的玩家，仅计算winner
        if (winnerPlayer && winnerPlayer.type === 1) {
            await calculateWinStreakAchievements(db, winner)
        }
        
        // 8. 累积0阵亡的成就 (achievement_id: 72,73,74) - 仅对type=1的玩家，仅计算winner
        if (winnerPlayer && winnerPlayer.type === 1) {
            const hasNoHeadLoss = !hasAnyHeadLoss(room.chess_board)
            if (hasNoHeadLoss) {
                await updateAchievement(db, winner, [72, 73, 74], 1)
            }
        }
        
        // 9. 计算百发百中成就 (achievement_id: 70) - 仅对type=1的玩家，仅计算winner
        if (winnerPlayer && winnerPlayer.type === 1) {
            const hasNoMiss = !hasAnyMiss(room.chess_board)
            if (hasNoMiss) {
                await updateAchievement(db, winner, [70], 1)
            }
        }
        
        // 10. 计算反者道之动成就 (achievement_id: 71) - 仅对type=1的玩家，仅计算失败方
        if (loserPlayer && loserPlayer.type === 1) {
            const hasNoHit = !hasAnyHit(room.chess_board)
            if (hasNoHit) {
                await updateAchievement(db, loserPlayer.openid, [71], 1)
            }
        }
        
    } catch (error) {
        console.error('计算用户成就时出错:', error)
    }
}

// 更新成就的通用函数
async function updateAchievement(db, userId, achievementIds, increment) {
    try {
        for (const achievementId of achievementIds) {
            // 获取或创建用户成就记录
            const userAchievementResult = await db.collection('user_achievement')
                .where({
                    user_id: userId,
                    achievement_id: achievementId
                })
                .get()
            
            let userAchievement
            if (userAchievementResult.data.length === 0) {
                // 创建新记录
                const insertResult = await db.collection('user_achievement').add({
                    data: {
                        user_id: userId,
                        achievement_id: achievementId,
                        num: increment,
                        is_achieved: 0,
                        is_collected: 0
                    }
                })
                userAchievement = {
                    id: insertResult._id,
                    user_id: userId,
                    achievement_id: achievementId,
                    num: increment,
                    is_achieved: 0,
                    is_collected: 0
                }
            } else {
                userAchievement = userAchievementResult.data[0]
                // 更新num值
                await db.collection('user_achievement').doc(userAchievement._id).update({
                    data: {
                        num: db.command.inc(increment)
                    }
                })
                userAchievement.num += increment
            }
            
            // 获取基础成就信息并检查是否达到成就条件
            const basicAchievementResult = await db.collection('basic_achievements')
                .where({
                    id: achievementId
                })
                .get()
            
            if (basicAchievementResult.data.length > 0) {
                const basicAchievement = basicAchievementResult.data[0]
                if (userAchievement.num >= basicAchievement.need) {
                    await db.collection('user_achievement').doc(userAchievement._id).update({
                        data: {
                            is_achieved: 1
                        }
                    })
                }
            }
        }
    } catch (error) {
        console.error('更新成就时出错:', error)
    }
}

// 计算连胜局成就
async function calculateWinStreakAchievements(db, winner) {
    try {
        // 获取用户最近的房间记录，按ctime倒序排序
        const battleRoomsResult = await db.collection('battle_rooms')
            .where({
                winner: winner
            })
            .orderBy('ctime', 'desc')
            .limit(10)
            .get()
        
        const recentRooms = battleRoomsResult.data
        
        // 检查前3条记录
        if (recentRooms.length >= 3) {
            const first3Wins = recentRooms.slice(0, 3).every(room => room.winner === winner)
            if (first3Wins) {
                await updateAchievement(db, winner, [78], 1)
            }
        }
        
        // 检查前5条记录
        if (recentRooms.length >= 5) {
            const first5Wins = recentRooms.slice(0, 5).every(room => room.winner === winner)
            if (first5Wins) {
                await updateAchievement(db, winner, [79], 1)
            }
        }
        
        // 检查前10条记录
        if (recentRooms.length >= 10) {
            const first10Wins = recentRooms.slice(0, 10).every(room => room.winner === winner)
            if (first10Wins) {
                await updateAchievement(db, winner, [80], 1)
            }
        }
    } catch (error) {
        console.error('计算连胜局成就时出错:', error)
    }
}

// 统计机头格子数量
function countHeadSquares(chessBoard) {
    let count = 0
    for (let i = 1; i <= 144; i++) {
        const squareKey = `chess_${i}`
        if (chessBoard[squareKey] === '1') {
            count++
        }
    }
    return count
}

// 检查是否有阵亡（格子标记为1）
function hasAnyHeadLoss(chessBoard) {
    for (let i = 1; i <= 144; i++) {
        const squareKey = `chess_${i}`
        if (chessBoard[squareKey] === '1') {
            return true
        }
    }
    return false
}

// 检查是否有打空（格子标记为3）
function hasAnyMiss(chessBoard) {
    for (let i = 1; i <= 144; i++) {
        const squareKey = `chess_${i}`
        if (chessBoard[squareKey] === '3') {
            return true
        }
    }
    return false
}

// 检查是否有击中（格子标记为1或2或9）
function hasAnyHit(chessBoard) {
    for (let i = 1; i <= 144; i++) {
        const squareKey = `chess_${i}`
        const status = chessBoard[squareKey]
        if (status === '1' || status === '2' || status === '9') {
            return true
        }
    }
    return false
}

// 标记道具为已使用的辅助函数
async function markItemAsUsed(db, roomId, playerOpenid, itemId) {
    try {
        // 更新房间中指定玩家的指定道具状态
        const roomResult = await db.collection('rooms').doc(roomId).get()
        if (!roomResult.data) {
            console.error('房间不存在')
            return
        }
        
        const room = roomResult.data
        const players = room.players || []
        
        // 找到指定玩家并更新其道具状态
        for (let i = 0; i < players.length; i++) {
            if (players[i].openid === playerOpenid && players[i].items) {
                for (let j = 0; j < players[i].items.length; j++) {
                    if (players[i].items[j].item_id === itemId) {
                        players[i].items[j].item_status = '1'
                        break
                    }
                }
                break
            }
        }
        
        // 更新房间数据
        await db.collection('rooms').doc(roomId).update({
            data: {
                players: players
            }
        })
        
    } catch (error) {
        console.error('标记道具为已使用时出错:', error)
    }
}

// 记录机头闪避事件
async function recordHeadDodgeEvent(db, roomId, playerOpenid) {
    try {
        // 在房间中记录机头闪避事件
        await db.collection('rooms').doc(roomId).update({
            data: {
                head_dodge_events: db.command.push({
                    player_openid: playerOpenid,
                    timestamp: Date.now()
                })
            }
        })
    } catch (error) {
        console.error('记录机头闪避事件时出错:', error)
    }
}

// 检查一击必杀事件
async function checkOneHitKill(db, roomId, attackerOpenid, headSquare, group) {
    try {
        // 确定击中的是哪个机头
        let headType = null
        let bodySquares = []
        
        if (group.h_a === headSquare.toString()) {
            headType = 'h_a'
            bodySquares = group.bs_a ? group.bs_a.split(',').map(s => s.trim()) : []
        } else if (group.h_b === headSquare.toString()) {
            headType = 'h_b'
            bodySquares = group.bs_b ? group.bs_b.split(',').map(s => s.trim()) : []
        } else if (group.h_c === headSquare.toString()) {
            headType = 'h_c'
            bodySquares = group.bs_c ? group.bs_c.split(',').map(s => s.trim()) : []
        }
        
        if (headType && bodySquares.length > 0) {
            // 检查对应的机身格子是否都是0（未被攻击过）
            const roomResult = await db.collection('rooms').doc(roomId).get()
            if (roomResult.data) {
                const room = roomResult.data
                const attackedPlayer = room.players.find(p => p.openid !== attackerOpenid)
                const attackedChessBoard = attackedPlayer ? attackedPlayer.chess_board : {}
                
                let allBodySquaresUntouched = true
                for (const bodySquare of bodySquares) {
                    const squareKey = `chess_${bodySquare}`
                    const status = attackedChessBoard[squareKey] || '0'
                    if (status !== '0') {
                        allBodySquaresUntouched = false
                        break
                    }
                }
                
                // 如果所有机身格子都是0，记录一击必杀事件
                if (allBodySquaresUntouched) {
                    await db.collection('rooms').doc(roomId).update({
                        data: {
                            one_hit_kill_events: db.command.push({
                                attacker_openid: attackerOpenid,
                                head_square: headSquare,
                                head_type: headType,
                                timestamp: Date.now()
                            })
                        }
                    })
                }
            }
        }
    } catch (error) {
        console.error('检查一击必杀事件时出错:', error)
    }
}

// 计算额外奖励
async function calculateExtraRewards(db, room, winner, loserPlayer) {
    try {
        const winnerPlayer = room.players.find(p => p.openid === winner)
        
        // 1. 机头闪避奖励（无论胜负，真实玩家都奖励50分）
        const headDodgeEvents = room.head_dodge_events || []
        for (const event of headDodgeEvents) {
            const player = room.players.find(p => p.openid === event.player_openid)
            if (player && player.type === 1) {
                await db.collection('users').doc(event.player_openid).update({
                    data: {
                        score: db.command.inc(50)
                    }
                })
            }
        }
        
        // 2. 一击必杀奖励（无论胜负，真实玩家都奖励50分）
        const oneHitKillEvents = room.one_hit_kill_events || []
        for (const event of oneHitKillEvents) {
            const player = room.players.find(p => p.openid === event.attacker_openid)
            if (player && player.type === 1) {
                await db.collection('users').doc(event.attacker_openid).update({
                    data: {
                        score: db.command.inc(50)
                    }
                })
            }
        }
        
        // 3. 完美防御奖励（获胜玩家，每架完整飞机奖励20分）
        if (winnerPlayer && winnerPlayer.type === 1) {
            const winnerChessBoard = winnerPlayer.chess_board || {}
            let perfectDefenseCount = 0
            
            // 检查三架飞机是否完整
            const group = room.group_id ? await getGroupInfo(db, room.group_id) : null
            if (group) {
                // 检查h_a和bs_a对应的飞机
                if (isPlaneIntact(winnerChessBoard, group.h_a, group.bs_a)) {
                    perfectDefenseCount++
                }
                // 检查h_b和bs_b对应的飞机
                if (isPlaneIntact(winnerChessBoard, group.h_b, group.bs_b)) {
                    perfectDefenseCount++
                }
                // 检查h_c和bs_c对应的飞机
                if (isPlaneIntact(winnerChessBoard, group.h_c, group.bs_c)) {
                    perfectDefenseCount++
                }
            }
            
            // 给获胜玩家奖励
            if (perfectDefenseCount > 0) {
                await db.collection('users').doc(winner).update({
                    data: {
                        score: db.command.inc(perfectDefenseCount * 20)
                    }
                })
            }
        }
        
    } catch (error) {
        console.error('计算额外奖励时出错:', error)
    }
}

// 获取飞机组合信息
async function getGroupInfo(db, groupId) {
    try {
        const groupResult = await db.collection('ai_basic_plane_groups_12x12_3').doc(groupId).get()
        return groupResult.data
    } catch (error) {
        console.error('获取飞机组合信息时出错:', error)
        return null
    }
}

// 检查飞机是否完整（所有格子都是0）
function isPlaneIntact(chessBoard, headSquare, bodySquaresStr) {
    if (!headSquare || !bodySquaresStr) return false
    
    const bodySquares = bodySquaresStr.split(',').map(s => s.trim())
    const allSquares = [headSquare, ...bodySquares]
    
    for (const square of allSquares) {
        const squareKey = `chess_${square}`
        const status = chessBoard[squareKey] || '0'
        if (status !== '0') {
            return false
        }
    }
    
    return true
}