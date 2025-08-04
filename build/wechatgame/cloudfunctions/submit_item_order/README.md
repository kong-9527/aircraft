# submit_item_order 云函数

## 功能描述
记录用户的每一种item道具的增减记录日志。

## 参数说明

### 输入参数
- `item_id`: 本次要处理的item的id
- `item_num`: 本次要处理的item的数量
  - 对于使用、购买道具，一般是1
  - 对于现金购买勋章，这里是购买的勋章数量
  - 对于合成，对于碎片item_id这里是具体消耗的碎片数量
  - 对合成后的道具item_id，这里是合成后的数量为1
- `type`: 记录本次是什么操作
  - 1: 购买
  - 2: 兑换
  - 3: 领取奖励
  - 4: 合成
  - 11: 使用
- `currency`: 货币类型
  - 1: rmb购买勋章
  - 2: 美金购买勋章
  - 9: 用勋章购买道具
- `cost`: 消耗的货币数量
- `fragment_item_id`: (仅合成时) 消耗的碎片ID
- `fragment_num`: (仅合成时) 消耗的碎片数量

### 返回结果
```json
{
  "success": true/false,
  "message": "操作结果描述",
  "openid": "用户openid",
  "appid": "应用appid",
  "unionid": "用户unionid"
}
```

## 数据库表结构
```sql
CREATE TABLE `user_item_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `item_id` int(11) DEFAULT NULL,
  `item_num` int(11) DEFAULT NULL COMMENT '代表本次提交买/奖励/使用/合成/合成消耗了几个、一般都会是1或5',
  `type` int(11) DEFAULT NULL COMMENT '1增加2减少',
  `type_content` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '1现金购买勋章2勋章购买道具3领取奖励4合成道具11使用道具',
  `cost` int(11) DEFAULT NULL COMMENT '当type类型是现金购买勋章或勋章购买道具时，这里记录当时消耗的现金数量或勋章数量',
  `ctime` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

## 使用示例

### 购买道具
```javascript
wx.cloud.callFunction({
  name: 'submit_item_order',
  data: {
    item_id: 1001,
    item_num: 1,
    type: 1,
    currency: 1,
    cost: 100
  }
})
```

### 合成道具
```javascript
wx.cloud.callFunction({
  name: 'submit_item_order',
  data: {
    item_id: 2001, // 合成后的道具ID
    item_num: 1,
    type: 4,
    fragment_item_id: 1001, // 消耗的碎片ID
    fragment_num: 5 // 消耗的碎片数量
  }
})
```

### 使用道具
```javascript
wx.cloud.callFunction({
  name: 'submit_item_order',
  data: {
    item_id: 1001,
    item_num: 1,
    type: 11
  }
})
```

## 注意事项
1. 合成操作(type=4)会自动生成两条记录：碎片消耗记录和道具增加记录
2. 用户信息通过微信云函数自动获取，无需手动传递
3. 所有时间戳使用Unix时间戳格式 