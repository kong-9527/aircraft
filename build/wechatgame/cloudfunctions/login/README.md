# 登录云函数

## 功能描述
微信小游戏用户登录云函数，用于处理用户登录、获取用户信息、创建新用户等功能。

## 主要功能
1. **获取微信用户信息**：自动获取用户的openid、appid、unionid
2. **新用户注册**：自动检测新用户并创建用户记录
3. **老用户登录**：更新用户登录时间和信息
4. **用户ID生成**：为新用户生成全局唯一的用户ID（格式：wxxyx_时间戳_随机数）
5. **数据库操作**：自动保存用户信息到微信云数据库的user表

## 数据库表结构
用户信息保存在微信云数据库的`user`表中，包含以下字段：
- `id`: 自增主键
- `app_id`: 小程序appid
- `open_id`: 微信openid
- `union_id`: 微信unionid
- `session_key`: 会话密钥
- `nicknamem`: 用户昵称
- `head_url`: 头像URL
- `phone_number`: 手机号
- `pure_phone_number`: 纯手机号
- `country_code`: 国家代码
- `score`: 游戏分数
- `medal_num`: 勋章数量
- `week_double_checkin_to`: 周双倍签到截止日期
- `season_double_checkin_to`: 赛季双倍签到截止日期
- `ctime`: 创建时间
- `utime`: 更新时间

## 调用方式

### 前端调用示例
```javascript
// 调用登录云函数
wx.cloud.callFunction({
  name: 'login',
  data: {
    userInfo: {
      nickName: '用户昵称',
      avatarUrl: '头像URL'
    },
    sessionKey: '会话密钥' // 可选
  }
}).then(res => {
  if (res.result.success) {
    console.log('登录成功', res.result)
    // 处理登录成功逻辑
  } else {
    console.error('登录失败', res.result.error)
  }
}).catch(err => {
  console.error('云函数调用失败', err)
})
```

## 返回数据格式

### 成功返回
```javascript
{
  success: true,
  isNewUser: true/false, // 是否为新用户
  user: {
    id: "数据库记录ID",
    userId: "wxxyx_xxx", // 全局唯一用户ID
    openId: "微信openid",
    unionId: "微信unionid",
    nickname: "用户昵称",
    headUrl: "头像URL",
    score: 0,
    medalNum: 0,
    phoneNumber: "",
    purePhoneNumber: "",
    countryCode: ""
  },
  openid: "微信openid",
  appid: "小程序appid",
  unionid: "微信unionid"
}
```

### 失败返回
```javascript
{
  success: false,
  error: "错误信息",
  openid: "微信openid",
  appid: "小程序appid",
  unionid: "微信unionid"
}
```

## 注意事项
1. 确保微信云开发环境已正确配置
2. 确保云数据库已创建user表
3. 前端需要先获取用户授权才能调用此云函数
4. 用户ID格式为：wxxyx_时间戳_随机数，确保全局唯一性
5. 新用户默认分数和勋章数量为0 