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
        
        // 5. 处理攻击逻辑
        let hasHeadHit = false
        const updatedChessBoard = { ...chessBoard }
        
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
            if (winnerPlayer && winnerPlayer.type === 1) {
                // 给获胜玩家加分
                await db.collection('users').doc(winner).update({
                    data: {
                        score: db.command.inc(100)
                    }
                })
            }
            
            // 11. 计算用户成就
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