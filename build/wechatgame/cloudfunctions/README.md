# 微信小游戏云函数说明

## 云函数列表

### 1. get_season_rankings - 季赛榜单查询

**功能**: 查询季赛榜单信息，包括当前用户排名

**调用方式**:
```javascript
wx.cloud.callFunction({
  name: 'get_season_rankings',
  data: {
    type: 1  // 1=当前赛季，2=上个赛季
  }
})
```

**参数说明**:
- `type`: 必填，数字类型
  - `1`: 查询当前赛季榜单（实时排名）
  - `2`: 查询上个赛季榜单（历史排名）

**返回数据**:
```javascript
{
  success: true,
  ranking_id: "123",
  ranking_start_date: "2025-01-01",
  ranking_end_date: "2025-01-07",
  self_user_id: "456",
  self_user_nickname: "用户昵称",
  self_user_headurl: "头像URL",
  self_user_score: 1000,
  self_user_ranking: 15,
  data: [
    {
      user_id: "789",
      user_nickname: "第一名",
      user_headurl: "头像URL",
      user_score: 2000,
      user_ranking: 1
    }
    // ... 前100名数据
  ]
}
```

### 2. get_week_rankings - 周赛榜单查询

**功能**: 查询周赛榜单信息，包括当前用户排名

**调用方式**:
```javascript
wx.cloud.callFunction({
  name: 'get_week_rankings',
  data: {
    type: 1  // 1=当前周赛，2=上个周赛
  }
})
```

**参数说明**:
- `type`: 必填，数字类型
  - `1`: 查询当前周赛榜单（实时排名）
  - `2`: 查询上个周赛榜单（历史排名）

**返回数据**: 与季赛榜单格式相同

## 排名逻辑说明

### type=1 (当前赛季/周赛) - 实时排名
- 从 `user` 表获取所有用户的 `score` 字段
- 按 `score` 倒序排序，计算实时排名
- 取前100名作为榜单数据
- 计算当前用户在全表中的排名（可能在100名以内或以外）
- 返回实时排名数据

### type=2 (上个赛季/周赛) - 历史排名
- 从 `stats_ranking_season` 或 `stats_ranking_week` 表获取历史排名数据
- 查询指定赛季/周赛的榜单记录
- 返回历史排名数据

## 错误代码说明

当 `success: false` 时，会返回以下错误代码：

### 通用错误代码
- `INVALID_PARAM`: 参数错误，type必须为1或2
- `USER_NOT_FOUND`: 用户信息不存在，请先授权登录
- `SYSTEM_ERROR`: 系统错误，请稍后重试

### 季赛榜单错误代码
- `NO_CURRENT_SEASON`: 未找到当前赛季信息
- `NO_PREVIOUS_SEASON`: 未找到上个赛季信息，当前为第一个赛季

### 周赛榜单错误代码
- `NO_CURRENT_WEEK`: 未找到当前周赛信息
- `NO_PREVIOUS_WEEK`: 未找到上个周赛信息，当前为第一个周赛

**前端错误处理示例**:
```javascript
wx.cloud.callFunction({
  name: 'get_season_rankings',
  data: { type: 2 }
}).then(res => {
  if (res.result.success) {
    // 处理成功数据
    console.log(res.result.data)
  } else {
    // 处理错误
    switch(res.result.errorCode) {
      case 'NO_PREVIOUS_SEASON':
        console.log('这是第一个赛季，没有上个赛季数据')
        break
      case 'USER_NOT_FOUND':
        console.log('用户未授权，需要引导用户授权')
        break
      default:
        console.log('其他错误:', res.result.message)
    }
  }
})
```

## 数据库表结构

### stats_ranking_ids (赛季ID表)
- `_id`: MongoDB主键
- `type`: 类型 (1=周赛, 2=季赛)
- `start_date`: 开始日期
- `end_date`: 结束日期

### stats_ranking_season (季赛榜单表)
- `_id`: MongoDB主键
- `ranking_id`: 关联stats_ranking_ids的_id
- `ranking_start_date`: 开始日期
- `ranking_end_date`: 结束日期
- `user_id`: 用户ID (关联user表的_id)
- `user_score`: 用户得分
- `user_ranking`: 用户排名
- `ctime`: 创建时间
- `utime`: 更新时间

### stats_ranking_week (周赛榜单表)
- 结构与stats_ranking_season相同

### user (用户表)
- `_id`: MongoDB主键
- `openid`: 微信openid
- `nickname`: 用户昵称
- `headurl`: 头像URL
- `score`: 用户当前得分（用于实时排名）

## 注意事项

1. **数据库格式**: 使用MongoDB格式，主键为`_id`而不是`id`
2. **调用云函数前需要确保用户已授权登录**
3. **云函数会自动获取用户的openid**
4. **如果用户未在user表中注册，会返回USER_NOT_FOUND错误**
5. **type=1时使用实时排名，type=2时使用历史排名**
6. **实时排名基于user表的score字段计算**
7. **当前用户不一定在前100名中，但会单独返回其排名信息**
8. **当查询上个赛季/周赛但不存在时，会返回明确的错误代码** 