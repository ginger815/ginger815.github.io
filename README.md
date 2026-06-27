# 🍬 开心消消乐 MatchGame

全栈三消游戏 — 前端纯 HTML/CSS/JS（零依赖）+ 后端 Node.js + SQLite

## 🚀 快速开始

### 前端（无需后端即可运行）

```bash
# 直接用浏览器打开 index.html
# 或使用本地服务器
npx serve .
```

### 后端

```bash
cd server
npm install
npm start
# → http://localhost:3000
```

前端会**自动检测**后端是否在线，首页右上角显示 `🟢 在线` 或 `⚫ 离线`。

## 📂 项目结构

```
MatchGame-web/
├── index.html          # 前端 SPA（6 页面、8x8 三消、商城/签到/排行）
├── server/
│   ├── index.js        # Express API 服务（端口 3000）
│   ├── db.js           # SQLite 数据库层（sql.js 纯 JS 实现）
│   └── package.json    # 后端依赖
└── README.md
```

## 🔌 API 接口

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|:----:|
| POST | `/api/auth/register` | 注册 | - |
| POST | `/api/auth/login` | 登录 | - |
| GET | `/api/user/profile` | 个人资料+存档+道具+关卡 | ✅ |
| PUT | `/api/user/profile` | 更新昵称/头像 | ✅ |
| POST | `/api/user/stats` | 同步游戏状态 | ✅ |
| POST | `/api/user/unlock` | 解锁关卡 | ✅ |
| POST | `/api/game/save` | 保存游戏进度 | ✅ |
| GET | `/api/game/load` | 加载游戏进度 | ✅ |
| GET | `/api/leaderboard` | 排行榜（?sort=stars/score/combo） | - |
| POST | `/api/shop/buy` | 购买道具 | ✅ |
| GET | `/api/shop/items` | 道具库存 | ✅ |
| GET | `/api/checkin/status` | 签到状态 | ✅ |
| POST | `/api/checkin` | 签到 | ✅ |
| GET | `/api/health` | 健康检查 | - |

## 🗄️ 数据库

SQLite 单文件 `server/matchgame.db`，5 张表：

```
users              — 用户（账号/密码/等级/金币/钻石）
cleared_levels     — 通关记录
game_saves         — 游戏进度云存档
user_items         — 道具库存
checkins           — 签到状态
```

密码使用 bcrypt 哈希存储。

## ☁️ 免费部署

### 后端部署到 Railway

1. 在 [Railway](https://railway.app) 注册（GitHub 登录）
2. 点击 **New Project → Deploy from GitHub repo**
3. 选择仓库，Railway 自动检测 Node.js
4. 设置启动命令：`cd server && npm start`
5. 部署完成后获得 `https://xxx.up.railway.app` 地址
6. 将前端 `API_URL` 改为你的 Railway 地址

### 后端部署到 Render

1. 在 [Render](https://render.com) 注册
2. 创建 **Web Service**，连接仓库
3. 设置：
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
4. 获得 `https://xxx.onrender.com` 地址

### 前端部署到 GitHub Pages（已完成）

你的前端已经部署在 GitHub Pages，只需在 `index.html` 中将 `API_URL` 改为你后端的 Railway/Render 地址即可：

```javascript
// 在 index.html 中找到这一行：
const API_URL=localStorage.getItem('mg_api_url')||'http://localhost:3000';
// 改为：
const API_URL='https://your-app.railway.app';
```

## 🎮 功能总览

- ✅ 登录/注册（用户名即昵称）
- ✅ 8×8 三消游戏（点击+拖动）
- ✅ 6 色棋子 + 💣炸弹 + ⚡闪电道具
- ✅ 10 关关卡系统（递增目标分）
- ✅ 5 种可购买道具（锤子/炸弹/闪电/十字/+5步）
- ✅ 每日签到（7 天循环奖励）
- ✅ 排行榜（星级/积分/连击）
- ✅ 道具商城（金币区+钻石区）
- ✅ 个人中心（头像/昵称/数据统计）
- ✅ 关卡选择（锁定/解锁/已通关）
- ✅ 游戏暂停/重开/返回
- ✅ 链式消除（连击倍率系统）
- ✅ localStorage 本地持久化
- ✅ 后端云端存储（可选，自动检测）
- ✅ 服务端排行榜（多人在线）
- ✅ 跨设备游戏存档同步
