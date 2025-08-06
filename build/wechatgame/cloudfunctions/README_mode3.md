# Mode=3 好友邀请对战功能说明

## 功能概述

Mode=3是好友邀请对战模式，允许玩家创建房间并生成邀请链接和二维码，邀请其他微信用户参与对战。

## 主要特点

1. **房间机制**：使用battle_rooms表管理房间，mode=3
2. **邀请系统**：创建房间后生成邀请链接和二维码
3. **真人玩家**：只允许type=1的真人玩家参与，不允许AI参与
4. **无超时限制**：不设置玩家匹配超时时间和战斗等待超时时间
5. **道具支持**：支持item_id=1、2、3道具的使用
6. **无奖励系统**：战斗结束后胜败方无奖励

## 云函数说明

### 1. submit_user_planes (mode=3分支)

**功能**：创建好友邀请对战房间

**参数**：
- `plane_type`: 必须为1
- `data`: 3架飞机信息的数组
- `mode`: 必须为3
- `difficulty`: 不需要（mode=3不使用）

**返回**：
```json
{
    "success": true,
    "message": "好友邀请房间创建成功",
    "data": {
        "room_code": "123456",
        "group_id": 123,
        "room_id": "room_id_string",
        "status": "waiting",
        "invite_link": "pages/battle/invite?room_code=123456",
        "invite_qrcode": "cloud_file_id"
    }
}
```

### 2. join_friend_invite

**功能**：通过邀请链接加入好友邀请房间

**参数**：
- `room_code`: 房间码
- `plane_type`: 必须为1
- `data`: 3架飞机信息的数组

**返回**：
```json
{
    "success": true,
    "message": "成功加入好友邀请房间",
    "data": {
        "room_code": "123456",
        "group_id": 123,
        "room_id": "room_id_string",
        "status": "playing"
    }
}
```

### 3. submit_user_attack (mode=3分支)

**功能**：处理好友邀请对战模式的攻击

**参数**：
- `plane_type`: 必须为1
- `data`: 攻击数据数组
- `room_id`: 房间ID

**返回**：
```json
{
    "success": true,
    "message": "攻击成功",
    "data": {
        "gameEnded": false,
        "winner": null,
        "headCount": 1
    }
}
```

## 成就和新人礼系统

### 新人礼 (id=8)
- **条件**：扫码邀请一名新用户对战，并完成战斗
- **规则**：role=first的玩家邀请role=second的玩家，且role=second的玩家是第一场战斗
- **判断逻辑**：以role=second玩家的user表ctime为基准，查询battle_rooms表中该玩家只出现在1条记录里

### 成就 (id=59)
- **条件**：扫码邀好友对战达到10次
- **规则**：role=first的玩家在历史所有mode=3的房间中，作为role=first且有role=second玩家的记录数量>=10

## 道具系统

### 支持的道具
- **item_id=1**: 闪避道具（首次被击中时使用）
- **item_id=2**: 闪避道具（非首次被击中时使用）
- **item_id=3**: 多格攻击道具（一次战斗中只能使用一次）

### 格子状态
- **0**: 未攻击
- **1**: 击中机头
- **2**: 击中机身
- **3**: 打空
- **9**: 闪避状态（下次攻击时变为1或2）

## 数据库表结构

### battle_rooms表 (mode=3)
```json
{
    "room_code": "123456",
    "plane_type": 1,
    "players": [
        {
            "openid": "player1_openid",
            "role": "first",
            "type": "1",
            "group_id": "123",
            "items": [
                {
                    "item_id": "1",
                    "item_status": "0"
                }
            ],
            "chess_board": {}
        },
        {
            "openid": "player2_openid",
            "role": "second",
            "type": "1",
            "group_id": "456",
            "items": [],
            "chess_board": {}
        }
    ],
    "status": "playing",
    "ctime": 1234567890,
    "current_player": "player1_openid",
    "winner": "",
    "timeout": 0,
    "last_move_time": 1234567890,
    "mode": 3,
    "attack_num": 5,
    "invite_link": "pages/battle/invite?room_code=123456",
    "invite_qrcode": "cloud_file_id"
}
```

## 使用流程

1. **创建房间**：调用submit_user_planes云函数，mode=3
2. **分享邀请**：获取返回的invite_link和invite_qrcode进行分享
3. **加入房间**：被邀请者通过join_friend_invite云函数加入房间
4. **开始对战**：双方通过submit_user_attack云函数进行攻击
5. **结算成就**：战斗结束后自动计算成就和新人礼

## 注意事项

1. 只有type=1的真人玩家可以参与好友邀请对战
2. 房间创建后状态为waiting，等待第二个玩家加入
3. 第二个玩家加入后状态变为playing
4. 战斗结束后无任何奖励，只计算成就和新人礼
5. 支持道具使用，但不会记录特殊战斗事件
6. 邀请链接和二维码会自动生成并存储在房间记录中 