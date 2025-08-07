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
        const roomResult = await db.collection('battle_rooms').doc(room_id).get()
        if (!roomResult.data) {
            return {
                success: false,
                message: '房间不存在',
                data: null
            }
        }
        
        const room = roomResult.data
        const currentPlayerOpenid = wxContext.OPENID
        
        // 检查房间模式，支持mode=1、mode=2和mode=3
        if (![1, 2, 3].includes(room.mode)) {
            return {
                success: false,
                message: '不支持的房间模式',
                data: null
            }
        }
        
        // 3. 根据mode进行不同的处理
        if (room.mode === 1) {
            return await handleAIAttackMode(db, room, data, currentPlayerOpenid, room_id)
        } else if (room.mode === 2) {
            return await handlePlayerAttackMode(db, room, data, currentPlayerOpenid, room_id)
        } else if (room.mode === 3) {
            return await handleFriendInviteAttackMode(db, room, data, currentPlayerOpenid, room_id)
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

// 处理人机对战模式的攻击
async function handleAIAttackMode(db, room, data, currentPlayerOpenid, room_id) {
    try {
        // 检查格子数量，人机对战只能攻击1个格子
        if (data.length > 1) {
            return {
                success: false,
                message: '人机对战不可以使用道具',
                data: null
            }
        }
        
        // 获取被攻击的玩家（AI玩家）
        const players = room.players || []
        const attackedPlayer = players.find(p => p.openid !== currentPlayerOpenid)
        const attackerPlayer = players.find(p => p.openid === currentPlayerOpenid)
        
        if (!attackedPlayer || !attackerPlayer) {
            return {
                success: false,
                message: '玩家信息错误',
                data: null
            }
        }
        
        // 检查格子状态
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
        
        // 查询飞机组合信息
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
        
        // 处理攻击逻辑（人机对战简化版）
        let hasHeadHit = false
        const updatedChessBoard = { ...chessBoard }
        
        // 直接处理攻击，不需要道具逻辑
        for (const square of attackedSquares) {
            const squareKey = `chess_${square}`
            const currentStatus = updatedChessBoard[squareKey] || '0'
            
            if (currentStatus === '0') {
                if (headSquares.includes(square.toString())) {
                    updatedChessBoard[squareKey] = '1'
                    hasHeadHit = true
                } else if (bodySquares.includes(square.toString())) {
                    updatedChessBoard[squareKey] = '2'
                } else {
                    updatedChessBoard[squareKey] = '3' // 打空了
                }
            }
        }
        
        // 统计机头数量
        let headCount = 0
        for (let i = 1; i <= 144; i++) {
            const squareKey = `chess_${i}`
            if (updatedChessBoard[squareKey] === '1') {
                headCount++
            }
        }
        
        // 判断胜负和更新游戏状态
        const currentTime = Date.now()
        let winner = null
        let gameEnded = false
        
        if (headCount >= 3) {
            // 游戏结束，当前玩家获胜
            winner = currentPlayerOpenid
            gameEnded = true
        }
        
        // 更新房间状态
        const updateData = {
            chess_board: updatedChessBoard,
            last_move_time: currentTime,
            attack_num: db.command.inc(1)
        }
        
        if (gameEnded) {
            updateData.winner = winner
            updateData.status = 'ended'
        } else {
            // 切换玩家（AI玩家）
            const nextPlayer = players.find(p => p.openid !== currentPlayerOpenid)
            updateData.current_player = nextPlayer.openid
        }
        
        await db.collection('battle_rooms').doc(room_id).update({
            data: updateData
        })
        
        // 如果游戏未结束，直接调用AI攻击
        if (!gameEnded) {
            try {
                await cloud.callFunction({
                    name: 'submit_ai_attack',
                    data: {
                        plane_type: 1,
                        mode: 1,
                        room_id: room_id
                    }
                })
            } catch (error) {
                console.error('AI攻击调用失败:', error)
            }
        } else {
            // 游戏结束，处理勋章奖励
            // 只有真实玩家获胜时才给奖励，AI获胜时不给任何奖励
            if (winner && attackerPlayer.type === 1) {
                // 真实玩家获胜，给勋章奖励
                await handleAIVictoryReward(db, room, winner)
            }
            // AI获胜时不做任何奖励处理
            
            // 处理人机对战的成就和新人礼奖励
            await handleAIAchievementsAndNewGifts(db, room, winner, currentPlayerOpenid)
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
        console.error('处理人机对战攻击时出错:', error)
        return {
            success: false,
            message: '处理人机对战攻击失败',
            data: null
        }
    }
}

// 处理人人对战模式的攻击
async function handlePlayerAttackMode(db, room, data, currentPlayerOpenid, room_id) {
    try {
        // 检查格子状态
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
        
        // 检查item_id=3道具使用逻辑
        if (attackedSquares.length >= 2) {
            const currentPlayer = room.players.find(p => p.openid === currentPlayerOpenid)
            if (currentPlayer && currentPlayer.items) {
                // 检查是否已经使用了item_id=3的道具
                const hasItem3 = currentPlayer.items.some(item => item.item_id === '3')
                if (hasItem3) {
                    return {
                        success: false,
                        message: '一种科技在一句战斗中只能使用一次',
                        data: null
                    }
                }
                
                // 如果没有使用过item_id=3，则添加该道具记录
                await addItem3ToPlayer(db, room_id, currentPlayerOpenid)
            }
        }
        
        // 查询飞机组合信息
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
        
        // 处理攻击逻辑（包含道具功能和奖励事件记录）
        let hasHeadHit = false
        const updatedChessBoard = { ...chessBoard }
        
        // 获取被攻击玩家的信息
        const players = room.players || []
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
        
        // 统计机头数量
        let headCount = 0
        for (let i = 1; i <= 144; i++) {
            const squareKey = `chess_${i}`
            if (updatedChessBoard[squareKey] === '1') {
                headCount++
            }
        }
        
        // 判断胜负和更新游戏状态
        const currentTime = Date.now()
        let winner = null
        let gameEnded = false
        
        if (headCount >= 3) {
            // 游戏结束，当前玩家获胜
            winner = currentPlayerOpenid
            gameEnded = true
        }
        
        // 更新房间状态
        const updateData = {
            chess_board: updatedChessBoard,
            last_move_time: currentTime,
            attack_num: db.command.inc(1)
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
        
        await db.collection('battle_rooms').doc(room_id).update({
            data: updateData
        })
        
        // 处理AI攻击
        if (!gameEnded) {
            const nextPlayer = room.players.find(p => p.openid === updateData.current_player)
            if (nextPlayer && nextPlayer.type === 2) {
                // 延迟1-5秒后调用AI攻击
                const delay = Math.floor(Math.random() * 4000) + 2000 // 1-5秒
                
                setTimeout(async () => {
                    try {
                        await cloud.callFunction({
                            name: 'submit_ai_attack',
                            data: {
                                plane_type: 1,
                                mode: 2,
                                room_id: room_id
                            }
                        })
                    } catch (error) {
                        console.error('AI攻击调用失败:', error)
                    }
                }, delay)
            }
        }
        
        // 结算奖励
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
            
            // 计算额外奖励
            await calculateExtraRewards(db, room, winner, loserPlayer)
            
            // 计算用户成就
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
        console.error('处理人人对战攻击时出错:', error)
        return {
            success: false,
            message: '处理人人对战攻击失败',
            data: null
        }
    }
}

// 处理AI胜利奖励（勋章奖励）
async function handleAIVictoryReward(db, room, winner) {
    try {
        const difficulty = room.difficulty || 1
        let medalReward = 0
        
        // 根据难度决定勋章奖励
        switch (difficulty) {
            case 1:
                medalReward = 10
                break
            case 2:
                medalReward = 20
                break
            case 3:
                medalReward = 30
                break
            default:
                medalReward = 10
        }
        
        // 查找用户的item_id=7记录
        const userItemResult = await db.collection('user_item').where({
            openid: winner,
            item_id: 7
        }).get()
        
        if (userItemResult.data.length > 0) {
            // 更新现有记录
            await db.collection('user_item').doc(userItemResult.data[0]._id).update({
                data: {
                    item_num: db.command.inc(medalReward)
                }
            })
        } else {
            // 创建新记录
            await db.collection('user_item').add({
                data: {
                    openid: winner,
                    item_id: 7,
                    item_num: medalReward
                }
            })
        }
        
        console.log(`AI胜利奖励：用户${winner}获得${medalReward}勋章`)
        
    } catch (error) {
        console.error('处理AI胜利奖励时出错:', error)
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
        
        // 11. 累积使用道具的成就 (achievement_id: 40,41,42) - 仅对type=1的玩家，双方都计算
        if (winnerPlayer && winnerPlayer.type === 1) {
            const usedItemsCount = countUsedItems(winnerPlayer.items || [])
            await updateAchievement(db, winner, [40, 41, 42], usedItemsCount)
        }
        if (loserPlayer && loserPlayer.type === 1) {
            const usedItemsCount = countUsedItems(loserPlayer.items || [])
            await updateAchievement(db, loserPlayer.openid, [40, 41, 42], usedItemsCount)
        }
        
        // 12. 闪避时是机头闪避的成就 (achievement_id: 64,65,66) - 仅对type=1的玩家，双方都计算
        if (winnerPlayer && winnerPlayer.type === 1) {
            const headDodgeCount = countPlayerEvents(room.head_dodge_events || [], winner)
            await updateAchievement(db, winner, [64, 65, 66], headDodgeCount)
        }
        if (loserPlayer && loserPlayer.type === 1) {
            const headDodgeCount = countPlayerEvents(room.head_dodge_events || [], loserPlayer.openid)
            await updateAchievement(db, loserPlayer.openid, [64, 65, 66], headDodgeCount)
        }
        
        // 13. 一击必杀成就 (achievement_id: 67,68,69) - 仅对type=1的玩家，双方都计算
        if (winnerPlayer && winnerPlayer.type === 1) {
            const oneHitKillCount = countPlayerEvents(room.one_hit_kill_events || [], winner)
            await updateAchievement(db, winner, [67, 68, 69], oneHitKillCount)
        }
        if (loserPlayer && loserPlayer.type === 1) {
            const oneHitKillCount = countPlayerEvents(room.one_hit_kill_events || [], loserPlayer.openid)
            await updateAchievement(db, loserPlayer.openid, [67, 68, 69], oneHitKillCount)
        }
        
        // 14. 不使用任何道具得胜的成就 (achievement_id: 75,76,77) - 仅对type=1的玩家，仅计算winner
        if (winnerPlayer && winnerPlayer.type === 1) {
            const hasNoItems = !winnerPlayer.items || winnerPlayer.items.length === 0
            if (hasNoItems) {
                await updateAchievement(db, winner, [75, 76, 77], 1)
            }
        }
        
        // 15. 计算新人礼成就
        await calculateNewGiftAchievements(db, room, winner, currentPlayerOpenid)
        
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
        const roomResult = await db.collection('battle_rooms').doc(roomId).get()
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
        await db.collection('battle_rooms').doc(roomId).update({
            data: {
                players: players
            }
        })
        
    } catch (error) {
        console.error('标记道具为已使用时出错:', error)
    }
}

// 为玩家添加item_id=3道具的辅助函数
async function addItem3ToPlayer(db, roomId, playerOpenid) {
    try {
        // 更新房间中指定玩家，添加item_id=3的道具
        const roomResult = await db.collection('battle_rooms').doc(roomId).get()
        if (!roomResult.data) {
            console.error('房间不存在')
            return
        }
        
        const room = roomResult.data
        const players = room.players || []
        
        // 找到指定玩家并添加item_id=3道具
        for (let i = 0; i < players.length; i++) {
            if (players[i].openid === playerOpenid) {
                if (!players[i].items) {
                    players[i].items = []
                }
                
                // 添加item_id=3道具，状态为已使用
                players[i].items.push({
                    item_id: "3",
                    item_status: "1"
                })
                break
            }
        }
        
        // 更新房间数据
        await db.collection('battle_rooms').doc(roomId).update({
            data: {
                players: players
            }
        })
        
    } catch (error) {
        console.error('添加item_id=3道具时出错:', error)
    }
}

// 记录机头闪避事件
async function recordHeadDodgeEvent(db, roomId, playerOpenid) {
    try {
        // 在房间中记录机头闪避事件
        await db.collection('battle_rooms').doc(roomId).update({
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
            const roomResult = await db.collection('battle_rooms').doc(roomId).get()
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
                    await db.collection('battle_rooms').doc(roomId).update({
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
        
        // 4. 使用道具奖励（双方type=1的玩家，每个已使用道具奖励10分）
        await calculateUsedItemsReward(db, room)
        
    } catch (error) {
        console.error('计算额外奖励时出错:', error)
    }
}

// 计算使用道具奖励
async function calculateUsedItemsReward(db, room) {
    try {
        const players = room.players || []
        
        // 遍历所有玩家
        for (const player of players) {
            // 只对type=1的玩家进行奖励
            if (player.type === 1 && player.items && Array.isArray(player.items)) {
                // 统计已使用的道具数量（item_status为'1'）
                const usedItemsCount = player.items.filter(item => item.item_status === '1').length
                
                // 每个已使用道具奖励10分
                if (usedItemsCount > 0) {
                    await db.collection('users').doc(player.openid).update({
                        data: {
                            score: db.command.inc(usedItemsCount * 20)
                        }
                    })
                }
            }
        }
    } catch (error) {
        console.error('计算使用道具奖励时出错:', error)
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

// 统计已使用的道具数量
function countUsedItems(items) {
    if (!items || !Array.isArray(items)) return 0
    
    return items.filter(item => item.item_status === '1').length
}

// 统计玩家在事件数组中的出现次数
function countPlayerEvents(events, playerOpenid) {
    if (!events || !Array.isArray(events)) return 0
    
    return events.filter(event => {
        // 检查head_dodge_events
        if (event.player_openid === playerOpenid) {
            return true
        }
        // 检查one_hit_kill_events
        if (event.attacker_openid === playerOpenid) {
            return true
        }
        return false
    }).length
}

// 计算新人礼成就
async function calculateNewGiftAchievements(db, room, winner, currentPlayerOpenid) {
    try {
        const players = room.players || []
        const winnerPlayer = players.find(p => p.openid === winner)
        const loserPlayer = players.find(p => p.openid !== winner)
        
        // 1. 参与一局1v1对战：仅对type=1的玩家做计算，对战双方都要计算
        // 检查winner
        if (winnerPlayer && winnerPlayer.type === 1) {
            await updateNewGift(db, winner, 5)
        }
        
        // 检查loser
        if (loserPlayer && loserPlayer.type === 1) {
            await updateNewGift(db, loserPlayer.openid, 5)
        }
        
        // 2. 在1v1对战中获胜10局：仅对type=1的玩家做计算，只判断winner
        if (winnerPlayer && winnerPlayer.type === 1) {
            await checkWin10GamesNewGift(db, winner)
        }
        
    } catch (error) {
        console.error('计算新人礼成就时出错:', error)
    }
}

// 更新新人礼状态
async function updateNewGift(db, userId, newGiftId) {
    try {
        // 获取或创建用户新人礼记录
        const userNewGiftResult = await db.collection('user_newgift')
            .where({
                user_id: userId,
                newgift_id: newGiftId
            })
            .get()
        
        if (userNewGiftResult.data.length === 0) {
            // 创建新记录
            await db.collection('user_newgift').add({
                data: {
                    user_id: userId,
                    newgift_id: newGiftId,
                    is_achieved: 1,
                    is_collected: 0
                }
            })
        } else {
            const userNewGift = userNewGiftResult.data[0]
            // 如果is_achieved为0，则更新为1
            if (userNewGift.is_achieved === 0) {
                await db.collection('user_newgift').doc(userNewGift._id).update({
                    data: {
                        is_achieved: 1
                    }
                })
            }
        }
    } catch (error) {
        console.error('更新新人礼状态时出错:', error)
    }
}

// 检查获胜10局新人礼
async function checkWin10GamesNewGift(db, winner) {
    try {
        // 获取或创建用户新人礼记录
        const userNewGiftResult = await db.collection('user_newgift')
            .where({
                user_id: winner,
                newgift_id: 6
            })
            .get()
        
        if (userNewGiftResult.data.length === 0) {
            // 创建新记录
            await db.collection('user_newgift').add({
                data: {
                    user_id: winner,
                    newgift_id: 6,
                    is_achieved: 0,
                    is_collected: 0
                }
            })
        } else {
            const userNewGift = userNewGiftResult.data[0]
            // 如果is_achieved为1，则忽略本次处理
            if (userNewGift.is_achieved === 1) {
                return
            }
            
            // 查询battle_rooms表中mode=2且winner是当前winner的记录数量
            const battleRoomsResult = await db.collection('battle_rooms')
                .where({
                    mode: 2,
                    winner: winner
                })
                .get()
            
            // 如果获胜记录>=10，则更新is_achieved为1
            if (battleRoomsResult.data.length >= 10) {
                await db.collection('user_newgift').doc(userNewGift._id).update({
                    data: {
                        is_achieved: 1
                    }
                })
            }
        }
    } catch (error) {
        console.error('检查获胜10局新人礼时出错:', error)
    }
}

// 处理人机对战的成就和新人礼奖励
async function handleAIAchievementsAndNewGifts(db, room, winner, currentPlayerOpenid) {
    try {
        const players = room.players || []
        const winnerPlayer = players.find(p => p.openid === winner)
        const difficulty = room.difficulty || 1
        
        // 1. 处理新人礼的达成情况
        await handleAINewGifts(db, room, winner, winnerPlayer)
        
        // 2. 处理成就的达成情况
        await handleAIAchievements(db, room, winner, winnerPlayer, difficulty)
        
    } catch (error) {
        console.error('处理人机对战的成就和新人礼奖励时出错:', error)
    }
}

// 处理好友邀请对战模式的攻击
async function handleFriendInviteAttackMode(db, room, data, currentPlayerOpenid, room_id) {
    try {
        // 验证只有type=1的玩家可以参与好友邀请对战
        const players = room.players || []
        const currentPlayer = players.find(p => p.openid === currentPlayerOpenid)
        if (!currentPlayer || currentPlayer.type !== '1') {
            return {
                success: false,
                message: '好友邀请对战只允许真人玩家参与',
                data: null
            }
        }
        
        // 检查格子状态
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
        
        // 检查item_id=3道具使用逻辑
        if (attackedSquares.length >= 2) {
            if (currentPlayer && currentPlayer.items) {
                // 检查是否已经使用了item_id=3的道具
                const hasItem3 = currentPlayer.items.some(item => item.item_id === '3')
                if (hasItem3) {
                    return {
                        success: false,
                        message: '一种科技在一句战斗中只能使用一次',
                        data: null
                    }
                }
                
                // 如果没有使用过item_id=3，则添加该道具记录
                await addItem3ToPlayer(db, room_id, currentPlayerOpenid)
            }
        }
        
        // 查询飞机组合信息
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
        
        // 处理攻击逻辑（包含道具功能）
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
                }
            } else if (item2) {
                usedItem = true
                // 标记道具为已使用
                await markItemAsUsed(db, room_id, attackedPlayer.openid, '2')
                // 将所有应该被标记为1或2的格子标记为9
                for (const square of squaresToMarkAsHit) {
                    const squareKey = `chess_${square}`
                    updatedChessBoard[squareKey] = '9'
                }
            }
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
                    } else if (bodySquares.includes(square.toString())) {
                        updatedChessBoard[squareKey] = '2'
                    }
                } else {
                    // 正常攻击
                    if (headSquares.includes(square.toString())) {
                        updatedChessBoard[squareKey] = '1'
                        hasHeadHit = true
                    } else if (bodySquares.includes(square.toString())) {
                        updatedChessBoard[squareKey] = '2'
                    } else {
                        updatedChessBoard[squareKey] = '3' // 打空了
                    }
                }
            }
        }
        
        // 统计机头数量
        let headCount = 0
        for (let i = 1; i <= 144; i++) {
            const squareKey = `chess_${i}`
            if (updatedChessBoard[squareKey] === '1') {
                headCount++
            }
        }
        
        // 判断胜负和更新游戏状态
        const currentTime = Date.now()
        let winner = null
        let gameEnded = false
        
        if (headCount >= 3) {
            // 游戏结束，当前玩家获胜
            winner = currentPlayerOpenid
            gameEnded = true
        }
        
        // 更新房间状态
        const updateData = {
            chess_board: updatedChessBoard,
            last_move_time: currentTime,
            attack_num: db.command.inc(1)
        }
        
        if (gameEnded) {
            updateData.winner = winner
            updateData.status = 'ended'
        } else {
            // 切换玩家
            const currentPlayerIndex = players.findIndex(p => p.openid === currentPlayerOpenid)
            const nextPlayerIndex = (currentPlayerIndex + 1) % players.length
            const nextPlayer = players[nextPlayerIndex]
            updateData.current_player = nextPlayer.openid
        }
        
        await db.collection('battle_rooms').doc(room_id).update({
            data: updateData
        })
        
        // 处理好友邀请对战的成就和新人礼
        if (gameEnded) {
            await handleFriendInviteAchievementsAndNewGifts(db, room, winner, currentPlayerOpenid)
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
        console.error('处理好友邀请对战攻击时出错:', error)
        return {
            success: false,
            message: '处理好友邀请对战攻击失败',
            data: null
        }
    }
}

// 处理人机对战的新人礼
async function handleAINewGifts(db, room, winner, winnerPlayer) {
    try {
        // 只有真实玩家获胜时才处理新人礼
        if (winnerPlayer && winnerPlayer.type === 1) {
            // 1. 完成首次人机挑战：id=3
            await updateNewGift(db, winner, 3)
            
            // 2. 高难度人机挑战第一次获胜：id=4
            const difficulty = room.difficulty || 1
            if (difficulty === 3) {
                await updateNewGift(db, winner, 4)
            }
        }
    } catch (error) {
        console.error('处理人机对战新人礼时出错:', error)
    }
}

// 处理人机对战的成就
async function handleAIAchievements(db, room, winner, winnerPlayer, difficulty) {
    try {
        // 只有真实玩家获胜时才处理成就
        if (winnerPlayer && winnerPlayer.type === 1) {
            // 1. 人机挑战累积赢得勋章：achievement_id为20、21、22、23
            let medalIncrement = 0
            switch (difficulty) {
                case 1:
                    medalIncrement = 10
                    break
                case 2:
                    medalIncrement = 20
                    break
                case 3:
                    medalIncrement = 30
                    break
                default:
                    medalIncrement = 10
            }
            await updateAchievement(db, winner, [20, 21, 22, 23], medalIncrement)
        }
        
        // 2. 人机挑战地狱难度的次数：achievement_id为24、25、26
        // 无论胜负，只要difficulty=3，真实玩家都计算
        const realPlayer = room.players.find(p => p.type === 1)
        if (realPlayer && difficulty === 3) {
            await updateAchievement(db, realPlayer.openid, [24, 25, 26], 1)
        }
        
        // 3. 人机挑战对战的次数：achievement_id为37、38、39
        // 无论胜负，不限difficulty，真实玩家都计算
        if (realPlayer) {
            await updateAchievement(db, realPlayer.openid, [37, 38, 39], 1)
        }
        
    } catch (error) {
        console.error('处理人机对战成就时出错:', error)
    }
}

// 处理好友邀请对战的成就和新人礼
async function handleFriendInviteAchievementsAndNewGifts(db, room, winner, currentPlayerOpenid) {
    try {
        const players = room.players || []
        const winnerPlayer = players.find(p => p.openid === winner)
        const firstPlayer = players.find(p => p.role === 'first')
        const secondPlayer = players.find(p => p.role === 'second')
        
        // 1. 处理新人礼id=8：扫码邀请一名新用户对战
        if (firstPlayer && secondPlayer) {
            await handleFriendInviteNewGift(db, room, firstPlayer, secondPlayer)
        }
        
        // 2. 处理成就id=59：扫码邀好友对战达到10次
        if (firstPlayer) {
            await handleFriendInviteAchievement(db, firstPlayer.openid)
        }
        
    } catch (error) {
        console.error('处理好友邀请对战的成就和新人礼时出错:', error)
    }
}

// 处理好友邀请对战的新人礼
async function handleFriendInviteNewGift(db, room, firstPlayer, secondPlayer) {
    try {
        // 检查role=first的玩家是否已经达成过这个新人礼
        const userNewGiftResult = await db.collection('user_newgift')
            .where({
                user_id: firstPlayer.openid,
                newgift_id: 8
            })
            .get()
        
        if (userNewGiftResult.data.length > 0) {
            const userNewGift = userNewGiftResult.data[0]
            if (userNewGift.is_achieved === 1) {
                // 已经达成过，无需再计算
                return
            }
        }
        
        // 获取role=second的玩家在user表中的ctime
        const secondUserResult = await db.collection('user')
            .where({
                openid: secondPlayer.openid
            })
            .get()
        
        if (secondUserResult.data.length === 0) {
            return
        }
        
        const secondUserCtime = secondUserResult.data[0].ctime
        const timeThreshold = secondUserCtime - 86400 // 24小时前
        
        // 查询role=second的玩家在battle_rooms表中的记录数量
        const battleRoomsResult = await db.collection('battle_rooms')
            .where({
                ctime: db.command.gte(timeThreshold),
                'players.openid': secondPlayer.openid
            })
            .get()
        
        // 如果只有1条记录，说明这是role=second的玩家的第一场战斗
        if (battleRoomsResult.data.length === 1) {
            // 标记role=first的玩家的新人礼为已达成
            if (userNewGiftResult.data.length > 0) {
                await db.collection('user_newgift').doc(userNewGiftResult.data[0]._id).update({
                    data: {
                        is_achieved: 1
                    }
                })
            } else {
                // 创建新记录
                await db.collection('user_newgift').add({
                    data: {
                        user_id: firstPlayer.openid,
                        newgift_id: 8,
                        is_achieved: 1,
                        is_collected: 0
                    }
                })
            }
        }
        
    } catch (error) {
        console.error('处理好友邀请对战新人礼时出错:', error)
    }
}

// 处理好友邀请对战的成就
async function handleFriendInviteAchievement(db, firstPlayerOpenid) {
    try {
        // 检查用户是否已经达成过这个成就
        const userAchievementResult = await db.collection('user_achievement')
            .where({
                user_id: firstPlayerOpenid,
                achievement_id: 59
            })
            .get()
        
        if (userAchievementResult.data.length > 0) {
            const userAchievement = userAchievementResult.data[0]
            if (userAchievement.is_achieved === 1) {
                // 已经达成过，无需再计算
                return
            }
        }
        
        // 查询role=first的玩家在历史所有mode=3的房间中，作为role=first且有role=second玩家的记录数量
        const battleRoomsResult = await db.collection('battle_rooms')
            .where({
                mode: 3,
                'players': db.command.elemMatch({
                    role: 'first',
                    openid: firstPlayerOpenid
                })
            })
            .get()
        
        let validRoomCount = 0
        
        for (const room of battleRoomsResult.data) {
            const players = room.players || []
            const hasSecondPlayer = players.some(p => p.role === 'second')
            if (hasSecondPlayer) {
                validRoomCount++
            }
        }
        
        // 如果达到10次，标记成就为已达成
        if (validRoomCount >= 10) {
            if (userAchievementResult.data.length > 0) {
                await db.collection('user_achievement').doc(userAchievementResult.data[0]._id).update({
                    data: {
                        is_achieved: 1
                    }
                })
            } else {
                // 创建新记录
                await db.collection('user_achievement').add({
                    data: {
                        user_id: firstPlayerOpenid,
                        achievement_id: 59,
                        num: validRoomCount,
                        is_achieved: 1,
                        is_collected: 0
                    }
                })
            }
        } else {
            // 更新或创建记录，但未达成
            if (userAchievementResult.data.length > 0) {
                await db.collection('user_achievement').doc(userAchievementResult.data[0]._id).update({
                    data: {
                        num: validRoomCount
                    }
                })
            } else {
                await db.collection('user_achievement').add({
                    data: {
                        user_id: firstPlayerOpenid,
                        achievement_id: 59,
                        num: validRoomCount,
                        is_achieved: 0,
                        is_collected: 0
                    }
                })
            }
        }
        
    } catch (error) {
        console.error('处理好友邀请对战成就时出错:', error)
    }
}