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