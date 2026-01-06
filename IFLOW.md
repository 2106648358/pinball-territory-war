# Pinball Territory War 项目文档

## 项目概述

Pinball Territory War 是一个基于 React + TypeScript + Vite 构建的交互式策略战争游戏。游戏结合了弹球机制与领土争夺玩法，玩家通过捕获弹球获得奖励来生成军队单位，进而在中央地图上进行领土扩张。

### 核心特性

- **弹球机制**：每个玩家拥有独立的弹球面板，通过自动移动的接球器捕获弹球获得奖励
- **领土争夺**：捕获弹球后生成军队单位，自动向地图中心扩张并占领领土
- **动态平衡**：领土占有率影响单位数量、生命值和接球器宽度，形成"富者愈富"的滚雪球机制
- **地形系统**：地图包含高地（防御加成）、障碍（减速）、补给点（恢复生命）等地形特征
- **单位类型**：轻型和重型两种单位类型，具有不同的属性和战斗特性
- **连胜系统**：连续捕获弹球可获得奖励倍率，连续失误会受到惩罚
- **多玩家支持**：支持 2-8 名玩家对战
- **实时渲染**：使用 Canvas API 进行高性能游戏渲染

### 技术栈

- **前端框架**：React 19.2.3
- **语言**：TypeScript 5.8.2
- **构建工具**：Vite 6.2.0
- **渲染**：原生 Canvas API
- **样式**：Tailwind CSS（通过 CDN 引入）

### 项目结构

```
pinball-territory-war/
├── App.tsx              # 主应用组件，包含游戏 UI 和渲染逻辑
├── index.tsx            # 应用入口文件
├── index.html           # HTML 模板
├── types.ts             # TypeScript 类型定义
├── vite.config.ts       # Vite 配置文件
├── tsconfig.json        # TypeScript 配置文件
├── package.json         # 项目依赖和脚本
├── .env.local           # 环境变量（GEMINI_API_KEY）
├── README.md            # 项目说明文档
├── IFLOW.md             # iFlow CLI 项目文档
├── metadata.json        # 项目元数据
├── package-game.ps1     # 打包脚本
└── services/
    └── engine.ts        # 游戏引擎核心逻辑
```

## 构建和运行

### 环境要求

- Node.js（建议 18+）

### 安装依赖

```bash
npm install
```

### 配置 API 密钥

在 `.env.local` 文件中设置 `GEMINI_API_KEY`：

```
GEMINI_API_KEY=your_api_key_here
```

### 运行开发服务器

```bash
npm run dev
```

开发服务器将在 `http://localhost:3000` 启动（host: 0.0.0.0）。

### 构建生产版本

```bash
npm run build
```

### 预览生产构建

```bash
npm run preview
```

## 开发约定

### 代码风格

- **TypeScript 严格模式**：启用了严格类型检查，目标 ES2022
- **函数式组件**：使用 React Hooks（useState, useEffect, useCallback）
- **模块导入**：使用 ES 模块导入（`import/export`）
- **路径别名**：使用 `@/` 作为项目根目录的别名
- **装饰器支持**：启用了实验性装饰器（`experimentalDecorators: true`）

### 游戏引擎设计

游戏引擎位于 `services/engine.ts`，采用面向对象设计：

- **GameEngine 类**：管理全局游戏状态、地形生成、胜负判定
- **Ball 类**：处理弹球的物理运动、碰撞检测、奖励判定
- **Unit 类**：处理军队单位的移动、领土占领、战斗逻辑

### 关键常量（services/engine.ts）

```typescript
const GRAVITY = 0.25;                    // 重力加速度
const FRICTION = 0.99;                   // 摩擦系数
const BOUNCE_DAMPING = 0.75;             // 弹跳衰减
const MAP_GRID_SIZE = 100;               // 地图网格大小
const JACKPOT_UNITS_BASE = 4;            // 大奖奖励单位数（战争模拟模式）
const MISS_UNITS_BASE = 2;               // 未捕获奖励单位数（战争模拟模式）
const CATCHER_Y = 135;                   // 接球器 Y 坐标
const CATCHER_WIDTH_BASE = 28;           // 接球器基础宽度
const CATCHER_WIDTH_MAX_BONUS = 12;      // 接球器最大奖励宽度
```

### 游戏机制说明

#### 1. 弹球系统

- 每个玩家拥有独立的弹球面板（100x150 像素）
- 弹球受重力影响，与钉子碰撞反弹（增加随机性）
- 接球器按正弦波自动移动，玩家无法直接控制
- 捕获弹球获得奖励（JACKPOT 或 MISS）
- **连胜机制**：连续捕获弹球增加奖励倍率（最高 3.0 倍）
- **失误惩罚**：连续失误会减少接球器宽度
- **钉子奖励**：弹球击中钉子次数越多，奖励倍率越高

#### 2. 领土争夺系统

- 地图为 100x100 网格，包含动态生成的地形特征
- 单位从玩家基地出发，向地图中心移动
- 单位在敌方领土上会消耗生命值，占领速度受阻力影响
- 占领敌方基地核心可消灭玩家
- **距离限制**：单位离开领土后只能移动有限距离（轻型 1 格，重型 1.5 格）

#### 3. 地形系统

- **高地（highground）**：黄色区域，提供 1.2 倍防御加成，速度降低 10%
- **障碍（obstacle）**：灰色区域，速度降低 30%
- **补给点（supply）**：绿色区域，单位可恢复生命值
- **普通地形（normal）**：无特殊效果

#### 4. 单位类型

**轻型单位（light）**
- 生命值：40
- 移动速度：0.2
- 占领半径：1.0 格
- 攻击力：0.8
- 防御加成：0.8
- 距离限制：1.0 格
- 特性：显示移动轨迹，适合快速突击

**重型单位（heavy）**
- 生命值：80
- 移动速度：0.15
- 占领半径：2.0 格
- 攻击力：1.8
- 防御加成：2.0
- 距离限制：1.5 格
- 特性：可反弹边界，恢复部分生命值，适合持久战

#### 5. 动态平衡机制

- **数量奖励**：领土占有率越高，生成单位越多（最多 +3）
- **质量奖励**：领土占有率越高，单位生命值越高（最多 +30%）
- **瞄准扩散**：劣势玩家瞄准更集中，优势玩家瞄准更分散
- **接球器宽度**：劣势玩家接球器更宽（最多 +15），优势玩家更窄（-5）
- **追击机制**：领土占有率低于 20% 时获得额外单位奖励

#### 6. 游戏阶段

游戏分为三个阶段，影响单位属性：
- **早期（early）**：最高领土占有率 < 25%，无额外加成
- **中期（mid）**：最高领土占有率 25-50%，单位属性提升 20%
- **后期（late）**：最高领土占有率 > 50%，单位属性提升 40%

### 渲染流程

1. **物理更新**：根据速度设置多次调用 `gameEngine.update()`
2. **地形绘制**：绘制高地、障碍、补给点等地形特征
3. **领土绘制**：绘制各玩家已占领的领土
4. **基地核心绘制**：绘制玩家基地核心和生命值
5. **单位绘制**：绘制移动中的军队单位（轻型显示轨迹）
6. **弹球面板绘制**：为每个玩家绘制独立的弹球面板

### 性能优化

- 使用 `requestAnimationFrame` 进行流畅渲染
- Canvas 渲染替代 DOM 操作
- 单位状态管理避免不必要的计算
- 领土计数缓存减少重复计算
- 钉子碰撞检测优化

## 扩展开发

### 添加新游戏机制

1. 在 `types.ts` 中定义相关类型
2. 在 `services/engine.ts` 中实现逻辑
3. 在 `App.tsx` 中添加 UI 和渲染

### 修改游戏平衡

调整 `services/engine.ts` 中的常量：

- `JACKPOT_UNITS_BASE`：大奖奖励单位数
- `MISS_UNITS_BASE`：未捕获奖励单位数
- `CATCHER_WIDTH_BASE`：接球器基础宽度
- `CATCHER_WIDTH_MAX_BONUS`：接球器最大奖励宽度
- `UNIT_STATS`：单位类型属性配置

### 自定义地形生成

修改 `GameEngine.generateTerrain()` 方法：
- 调整高地、障碍、补给点的数量和分布
- 修改地形效果参数

### 自定义玩家颜色

修改 `GameEngine.setup()` 方法中的颜色生成逻辑：

```typescript
color: `hsl(${Math.floor(360 * i / playerCount)}, 70%, 50%)`
```

### 调整游戏节奏

修改以下参数：
- 单位移动速度（`UNIT_STATS` 中的 `speed`）
- 领土占领阻力（`resistanceMult`）
- 单位距离限制（`maxDistance`）

## 注意事项

- `.env.local` 文件包含敏感信息，不应提交到版本控制
- 游戏使用 Canvas API，确保浏览器支持
- 性能可能受玩家数量和单位数量影响
- 接球器移动是自动的，玩家无法直接控制
- 游戏采用"战争模拟"平衡模式，单位生成较慢，游戏节奏较慢
- 重型单位可以反弹边界，但需要考虑距离限制

## 相关链接

- AI Studio 应用：https://ai.studio/apps/drive/1Z543Z_LxQrkxgQAW2ibyb7YR89uqm5SY
- Vite 文档：https://vitejs.dev/
- React 文档：https://react.dev/