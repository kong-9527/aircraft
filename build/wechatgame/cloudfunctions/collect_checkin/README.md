# collect_checkin 云函数

## 功能描述
用户每日签到环节领取每日奖励的云函数。

## 传参
- `date`: 用户选择的签到日期（必填）

## 返回格式
```javascript
{
    success: true/false,
    message: "提示信息",
    data: {
        date: "签到日期",
        reward_item_id: "奖励物品ID",
        reward_item_num: "奖励物品数量"
    },
    openid: "用户openid",
    appid: "应用appid",
    unionid: "用户unionid"
}
```

## 处理逻辑

### 1. 日期验证
- 用户选择昨天的日期：视为补签
- 用户选择今天的日期：视为正常签到
- 其他日期：拒绝签到，返回"只可以当天签到或补签昨天"

### 2. 重复领取检查
- 如果用户提交的日期（昨天或今天）的奖励已经领取过，返回"您已领取过奖励"

### 3. 奖励发放流程
1. 查询 `basic_checkins` 表获取该日期的奖励配置
2. 更新 `user_item` 表：为该用户增加奖励物品数量
3. 更新 `user_checkin` 表：标记该日期的奖励已领取（`is_achieved=1`, `is_collected=1`）
4. 调用 `submit_item_order` 接口记录奖励领取日志

## 涉及的数据表

### basic_checkins
签到奖励配置表
- `id`: 主键
- `month_id`: 月份ID
- `date`: 日期
- `week`: 星期几
- `reward_item_id`: 奖励物品ID
- `reward_item_num`: 奖励物品数量

### user_checkin
用户签到记录表
- `id`: 主键
- `user_id`: 用户ID
- `checkin_id`: 签到配置ID
- `is_achieved`: 是否达成（签到任务中与is_collected保持一致）
- `is_collected`: 是否已领取

### user_item
用户物品表
- `id`: 主键
- `user_id`: 用户ID
- `item_id`: 物品ID
- `item_num`: 物品数量

### user_item_log
物品变更日志表（通过submit_item_order接口记录）
- `id`: 主键
- `user_id`: 用户ID
- `item_id`: 物品ID
- `item_num`: 变更数量
- `type`: 操作类型（1增加/2减少）
- `type_content`: 操作描述
- `cost`: 消耗（签到操作为空）
- `ctime`: 创建时间

## 使用示例

### 前端调用
```javascript
wx.cloud.callFunction({
    name: 'collect_checkin',
    data: {
        date: '2024-01-15' // 用户选择的签到日期
    }
}).then(res => {
    if (res.result.success) {
        console.log('签到成功:', res.result.data)
    } else {
        console.log('签到失败:', res.result.message)
    }
}).catch(err => {
    console.error('调用失败:', err)
})
```

## 错误处理
- 参数缺失：返回"缺少必要参数：date"
- 日期格式错误：返回"日期格式不正确"
- 日期不在允许范围：返回"只可以当天签到或补签昨天"
- 无签到配置：返回"该日期没有签到奖励配置"
- 已领取过：返回"您已领取过奖励"
- 系统错误：返回"签到奖励领取失败: [错误信息]"

## 注意事项
1. 签到任务中，`is_achieved` 和 `is_collected` 始终保持一致
2. 签到操作会自动调用 `submit_item_order` 接口记录日志
3. 用户信息通过微信云函数的 `getWXContext()` 获取
4. 日期比较时会将时间部分清零，只比较日期部分 