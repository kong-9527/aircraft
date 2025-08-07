# 用户设置云函数说明

## 概述
本项目包含两个用户设置相关的云函数：
- `get_user_setting`: 获取用户设置信息
- `submit_user_setting`: 保存用户设置信息

## 数据库结构

### user表
存储用户基本信息，包含以下字段：
- `_id`: 用户ID（MongoDB自动生成）
- `open_id`: 微信openid
- `app_id`: 微信appid
- `nicknamem`: 用户昵称
- 其他用户信息字段...

### user_setting表
存储用户设置信息，包含以下字段：
- `_id`: 设置记录ID（MongoDB自动生成）
- `user_id`: 用户ID（关联user表）
- `sound`: 音效设置（0关闭，1开启）
- `music`: 音乐设置（0关闭，1开启）
- `motor`: 震动设置（0关闭，1开启）

## get_user_setting 云函数

### 功能
获取用户的设置信息，包括昵称和各项设置开关状态。

### 调用方式
```javascript
wx.cloud.callFunction({
  name: 'get_user_setting',
  success: function(res) {
    console.log('获取设置成功:', res.result)
  },
  fail: function(err) {
    console.error('获取设置失败:', err)
  }
})
```

### 返回数据
```javascript
{
  success: true,
  user_id: "用户ID",        // 未找到设置时为空字符串
  nickname: "用户昵称",     // user表中的nicknamem值
  sound: 1,                // 0关闭，1开启
  music: 1,                // 0关闭，1开启
  motor: 1                 // 0关闭，1开启
}
```

### 说明
- 如果用户不存在设置记录，所有设置项默认为1（开启）
- 前端可以按开启状态来加载，一旦设置过会全量提交保存

## submit_user_setting 云函数

### 功能
保存用户的设置信息，包括昵称和各项设置开关状态。

### 调用方式
```javascript
wx.cloud.callFunction({
  name: 'submit_user_setting',
  data: {
    nickname: "用户昵称",   // 必填，不能为空
    sound: 1,              // 必填，0关闭，1开启
    music: 1,              // 必填，0关闭，1开启
    motor: 1               // 必填，0关闭，1开启
  },
  success: function(res) {
    console.log('保存设置成功:', res.result)
  },
  fail: function(err) {
    console.error('保存设置失败:', err)
  }
})
```

### 参数说明
- `nickname`: 用户昵称，字符串类型，不能为空
- `sound`: 音效设置，整数类型，必须为0或1
- `music`: 音乐设置，整数类型，必须为0或1
- `motor`: 震动设置，整数类型，必须为0或1

### 返回数据
```javascript
{
  success: true,
  message: "设置保存成功"
}
```

### 错误返回
```javascript
{
  success: false,
  error: "错误信息"
}
```

### 处理逻辑
1. 验证参数完整性（nickname不能为空）
2. 验证设置参数有效性（sound、music、motor必须为0或1）
3. 根据用户openid查找用户记录
4. 更新user表的nicknamem字段
5. 更新或创建user_setting表的设置记录

## 注意事项

1. **用户认证**: 两个云函数都依赖微信小游戏的用户认证机制，会自动获取用户的openid和appid
2. **数据库**: 使用微信云开发的MongoDB数据库，不是MySQL
3. **默认值**: 新用户或未设置过的用户，所有设置项默认为1（开启）
4. **错误处理**: 云函数包含完整的错误处理机制，会返回详细的错误信息
5. **参数验证**: submit_user_setting包含严格的参数验证，确保数据完整性

## 部署说明

1. 确保云函数目录包含以下文件：
   - `index.js`: 云函数主文件
   - `package.json`: 依赖配置文件
   - `config.json`: 云函数配置文件（可选）

2. 在微信开发者工具中右键点击云函数目录，选择"上传并部署：云端安装依赖"

3. 确保云开发环境已正确配置，数据库集合已创建

## 使用示例

### 前端调用示例
```javascript
// 获取用户设置
async function getUserSettings() {
  try {
    const result = await wx.cloud.callFunction({
      name: 'get_user_setting'
    })
    
    if (result.result.success) {
      const { nickname, sound, music, motor } = result.result
      // 处理设置数据
      console.log('用户昵称:', nickname)
      console.log('音效设置:', sound ? '开启' : '关闭')
      console.log('音乐设置:', music ? '开启' : '关闭')
      console.log('震动设置:', motor ? '开启' : '关闭')
    }
  } catch (error) {
    console.error('获取设置失败:', error)
  }
}

// 保存用户设置
async function saveUserSettings(nickname, sound, music, motor) {
  try {
    const result = await wx.cloud.callFunction({
      name: 'submit_user_setting',
      data: {
        nickname: nickname,
        sound: sound ? 1 : 0,
        music: music ? 1 : 0,
        motor: motor ? 1 : 0
      }
    })
    
    if (result.result.success) {
      console.log('设置保存成功')
    } else {
      console.error('设置保存失败:', result.result.error)
    }
  } catch (error) {
    console.error('保存设置失败:', error)
  }
}
```
