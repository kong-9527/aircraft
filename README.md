# 飞机拖拽和位置识别系统

这是一个基于Cocos Creator的飞机拖拽和位置识别系统，支持12x12棋盘的飞机位置管理。

## 功能特性

### 1. 坐标系统
- **12x12网格**：总共144个格子
- **格子编号**：1-144的连续编号
- **复数编号**：如"2+3i"格式的复数表示
- **网格坐标**：(x, y)格式，x和y范围都是1-12

### 2. 飞机系统
- **飞机结构**：每架飞机有10个点
  - 1个黑色圆点（机头）
  - 9个白色圆点（机身）
- **拖拽功能**：支持手动拖拽飞机
- **位置识别**：自动识别飞机在棋盘上的位置

### 3. 位置转换
- 网格坐标 ↔ 格子编号
- 网格坐标 ↔ 复数编号
- 屏幕坐标 ↔ 网格坐标

## 文件结构

```
assets/scripts/
├── GridCoordinateSystem.ts    # 坐标转换工具类
├── AircraftController.ts      # 飞机控制器
├── GameBoard.ts              # 游戏棋盘管理
└── GameExample.ts            # 使用示例
```

## 使用方法

### 1. 基本设置

在场景中创建以下节点结构：

```
Canvas
├── GameBoard (添加 GameBoard 组件)
│   ├── GridGraphics (Graphics 组件)
│   └── AircraftContainer
├── UI
│   ├── InfoLabel (Label 组件)
│   ├── CellNumberInput (EditBox 组件)
│   ├── ComplexNumberInput (EditBox 组件)
│   └── SetPositionButton (Button 组件)
└── GameExample (添加 GameExample 组件)
```

### 2. 组件配置

#### GameBoard 组件
- `gridGraphics`: 网格绘制组件
- `aircraftContainer`: 飞机容器节点
- `infoLabel`: 信息显示标签
- `cellNumberInput`: 格子编号输入框
- `complexNumberInput`: 复数编号输入框
- `setPositionButton`: 设置位置按钮

#### AircraftController 组件
- `boardNode`: 棋盘节点
- `aircraftNode`: 飞机节点
- `positionLabel`: 位置显示标签

### 3. 坐标转换示例

```typescript
// 网格坐标转格子编号
const cellNumber = GridCoordinateSystem.gridToCellNumber(3, 4); // 返回 40

// 格子编号转网格坐标
const gridPos = GridCoordinateSystem.cellNumberToGrid(50); // 返回 {x: 2, y: 5}

// 网格坐标转复数编号
const complexNumber = GridCoordinateSystem.gridToComplexNumber(6, 8); // 返回 "6+8i"

// 复数编号转网格坐标
const gridPos = GridCoordinateSystem.complexNumberToGrid("6+8i"); // 返回 {x: 6, y: 8}
```

### 4. 飞机操作

```typescript
// 获取飞机控制器
const aircraftController = node.getComponent(AircraftController);

// 设置飞机位置（网格坐标）
aircraftController.setAircraftPosition(5, 7);

// 通过格子编号设置位置
aircraftController.setPositionByCellNumber(50);

// 通过复数编号设置位置
aircraftController.setPositionByComplexNumber("6+8i");

// 获取当前位置信息
const position = aircraftController.getCurrentPosition();
console.log(position.gridX, position.gridY, position.cellNumber, position.complexNumber);
```

### 5. 游戏棋盘操作

```typescript
// 获取游戏棋盘组件
const gameBoard = node.getComponent(GameBoard);

// 获取所有飞机位置
const positions = gameBoard.getAllAircraftPositions();

// 根据格子编号查找飞机
const aircraft = gameBoard.findAircraftByCellNumber(50);

// 根据复数编号查找飞机
const aircraft = gameBoard.findAircraftByComplexNumber("6+8i");

// 更新信息显示
gameBoard.updateInfoDisplay();
```

## 坐标编号规则

### 格子编号 (1-144)
```
 1  2  3  4  5  6  7  8  9 10 11 12
13 14 15 16 17 18 19 20 21 22 23 24
25 26 27 28 29 30 31 32 33 34 35 36
...
133 134 135 136 137 138 139 140 141 142 143 144
```

### 复数编号
- 格式：`X+Yi`
- X：网格X坐标 (1-12)
- Y：网格Y坐标 (1-12)
- 示例：(3, 4) → "3+4i"

### 网格坐标
- X轴：从左到右，1-12
- Y轴：从下到上，1-12
- 原点：(1, 1) 在左下角

## 交互功能

1. **拖拽飞机**：点击并拖拽飞机到任意位置
2. **位置识别**：系统自动识别飞机在网格中的位置
3. **信息显示**：实时显示当前位置的格子编号和复数编号
4. **位置设置**：通过输入格子编号或复数编号设置飞机位置

## 注意事项

1. 确保棋盘节点有正确的尺寸设置
2. 飞机节点需要有UITransform组件
3. 拖拽时会自动对齐到网格中心
4. 位置识别基于飞机中心点计算

## 扩展功能

可以根据需要扩展以下功能：
- 飞机碰撞检测
- 多飞机同时拖拽
- 飞机旋转功能
- 保存/加载飞机位置
- 网络同步功能 