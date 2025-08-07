# submit_item_union 云函数

## 功能描述
实现碎片合成道具功能，将5个碎片（item_id=6）合成为1个道具（item_id=5）。

## 接口参数

### 必需参数
- `item_id`: 必须为6（碎片ID）
- `item_num`: 必须为5（碎片数量）
- `type`: 必须为4（操作类型）

### 用户信息
用户信息通过微信小游戏官方API自动获取，无需手动传递。

## 接口校验

1. **参数完整性校验**: 检查item_id、item_num、type是否完整
2. **参数有效性校验**: 验证item_id=6、item_num=5、type=4
3. **用户存在性校验**: 检查用户是否在users表中存在
4. **碎片数量校验**: 检查用户是否拥有足够的碎片（>=5个）

## 处理逻辑

### 1. 碎片消耗
- 在user_item表中，将用户item_id=6的记录num减5

### 2. 道具获得
- 在user_item表中，将用户item_id=5的记录num加1
- 如果用户没有item_id=5的记录，则创建新记录

### 3. 日志记录
记录两条日志到user_item_log表：

**碎片消耗日志**:
- user_id: 当前用户
- item_id: 6
- item_num: 5
- type: 2（减少）
- type_content: "合成道具"
- cost: 0

**道具获得日志**:
- user_id: 当前用户
- item_id: 5
- item_num: 1
- type: 1（增加）
- type_content: "合成道具"
- cost: 0

## 返回结果

### 成功响应
```json
{
  "success": true,
  "message": "碎片合成成功",
  "openid": "用户openid",
  "appid": "应用appid",
  "unionid": "用户unionid"
}
```

### 失败响应
```json
{
  "success": false,
  "message": "错误信息"
}
```

## 错误处理

1. **参数不完整**: "参数不完整：item_id、item_num、type为必填参数"
2. **参数无效**: "无效的合成参数：item_id必须为6，item_num必须为5，type必须为4"
3. **用户不存在**: "用户不存在"
4. **碎片不足**: "完成合成需要5个碎片"
5. **数据库错误**: "合成失败：具体错误信息"

## 技术特点

1. **事务处理**: 使用数据库事务确保数据一致性
2. **原子操作**: 所有数据库操作要么全部成功，要么全部回滚
3. **日志记录**: 完整记录操作日志，便于追踪和审计
4. **错误处理**: 完善的错误处理和回滚机制

## 使用示例

```javascript
// 调用云函数
wx.cloud.callFunction({
  name: 'submit_item_union',
  data: {
    item_id: 6,
    item_num: 5,
    type: 4
  }
}).then(res => {
  if (res.result.success) {
    console.log('合成成功');
  } else {
    console.log('合成失败:', res.result.message);
  }
}).catch(err => {
  console.error('调用失败:', err);
});
```
