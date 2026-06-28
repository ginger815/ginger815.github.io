/**
 * 消消乐后端 API 服务
 * 部署: node index.js  端口: 3000
 */
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const DB = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'matchgame_secret_change_in_production';
const TOKEN_EXPIRE = '7d';

// ========== 中间件 ==========
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// 请求日志
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString().slice(0,19)}  ${req.method} ${req.path}`);
  next();
});

// JWT 鉴权中间件
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (e) {
    return res.status(401).json({ error: '登录已过期' });
  }
}

// ========== 认证路由 ==========

// 注册
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  if (username.length < 2) return res.status(400).json({ error: '用户名至少2个字符' });
  if (password.length < 6) return res.status(400).json({ error: '密码长度至少6位' });

  const result = await DB.register(username, password, username);
  if (result.error) return res.status(400).json({ error: result.error });

  const token = jwt.sign({ userId: result.userId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRE });
  const profile = DB.getUserProfile(result.userId);
  res.json({ token, user: profile });
});

// 登录
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });

  const result = await DB.login(username, password);
  if (result.error) return res.status(401).json({ error: result.error });

  const token = jwt.sign({ userId: result.userId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRE });
  const profile = DB.getUserProfile(result.userId);
  res.json({ token, user: profile });
});

// ========== 用户路由 ==========

// 获取个人资料
app.get('/api/user/profile', auth, (req, res) => {
  const user = DB.getUserProfile(req.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const cleared = DB.getClearedLevels(req.userId);
  const items = DB.getItems(req.userId);
  const saved = DB.loadGame(req.userId);
  res.json({ user: { ...user, clearedLevels: cleared, totalCleared: cleared.length }, items, saved });
});

// 更新个人资料（昵称/头像）
app.put('/api/user/profile', auth, (req, res) => {
  const { nickname, avatar } = req.body;
  if (nickname && nickname.trim().length === 0) return res.status(400).json({ error: '昵称不能为空' });
  DB.updateProfile(req.userId, nickname, avatar);
  res.json({ success: true });
});

// 更新游戏状态（通关后调用）
app.post('/api/user/stats', auth, (req, res) => {
  const { level, exp, coins, diamonds, highScore } = req.body;
  DB.updateStats(req.userId, level ?? 1, exp ?? 0, coins ?? 500, diamonds ?? 50, highScore ?? 0);
  res.json({ success: true });
});

// 解锁关卡
app.post('/api/user/unlock', auth, (req, res) => {
  const { levelId } = req.body;
  if (!levelId) return res.status(400).json({ error: '缺少 levelId' });
  DB.unlockLevel(req.userId, levelId);
  res.json({ success: true });
});

// ========== 游戏存档路由 ==========

// 保存游戏进度
app.post('/api/game/save', auth, (req, res) => {
  const { board, score, movesLeft, targetScore, currentLevel } = req.body;
  DB.saveGame(req.userId, board, score, movesLeft, targetScore, currentLevel);
  res.json({ success: true });
});

// 加载游戏进度
app.get('/api/game/load', auth, (req, res) => {
  const saved = DB.loadGame(req.userId);
  res.json({ saved: saved || null });
});

// ========== 排行榜路由 ==========

// GET /api/leaderboard?sort=stars|score|combo
app.get('/api/leaderboard', (req, res) => {
  const sortBy = req.query.sort || 'stars';
  if (!['stars', 'score', 'combo'].includes(sortBy)) {
    return res.status(400).json({ error: '排序字段无效' });
  }
  const data = DB.getAllRanked(sortBy === 'combo' ? 'level' : sortBy);
  res.json({ leaderboard: data });
});

// 获取排行榜 + 当前用户排名
app.get('/api/leaderboard/my-rank', auth, (req, res) => {
  const all = DB.getAllRanked('stars');
  const myIdx = all.findIndex(e => e.username === (DB.getUserProfile(req.userId)?.username));
  res.json({
    rank: myIdx >= 0 ? myIdx + 1 : null,
    total: all.length,
    leaderboard: all.slice(0, 20)
  });
});

// ========== 商城路由 ==========

// 获取道具库存
app.get('/api/shop/items', auth, (req, res) => {
  const items = DB.getItems(req.userId);
  res.json({ items });
});

// 购买道具
app.post('/api/shop/buy', auth, (req, res) => {
  const { itemId } = req.body;
  if (!itemId) return res.status(400).json({ error: '缺少 itemId' });

  const ALL_ITEMS = {
    1: { price: 100, currency: 'coin' },
    2: { price: 200, currency: 'coin' },
    3: { price: 150, currency: 'coin' },
    4: { price: 15, currency: 'diamond' },
    5: { price: 12, currency: 'diamond' },
    6: { price: 20, currency: 'diamond' },
    7: { price: 25, currency: 'diamond' },
    8: { price: 30, currency: 'diamond' }
  };

  const item = ALL_ITEMS[itemId];
  if (!item) return res.status(404).json({ error: '道具不存在' });

  const user = DB.getUserProfile(req.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const balance = item.currency === 'coin' ? user.coins : user.diamonds;
  if (balance < item.price) {
    return res.status(400).json({ error: `${item.currency === 'coin' ? '金币' : '钻石'}不足` });
  }

  const newCoins = item.currency === 'coin' ? user.coins - item.price : user.coins;
  const newDiamonds = item.currency === 'diamond' ? user.diamonds - item.price : user.diamonds;
  DB.updateStats(req.userId, user.level, user.exp, newCoins, newDiamonds, user.high_score);
  DB.addItem(req.userId, itemId, 1);

  res.json({ success: true, coins: newCoins, diamonds: newDiamonds });
});

// ========== 签到路由 ==========

// 获取签到状态
app.get('/api/checkin/status', auth, async (req, res) => {
  const ci = await DB.getCheckin(req.userId);
  const today = new Date().toDateString();
  res.json({
    checkinDay: ci.checkin_day,
    checkedInToday: ci.last_date === today
  });
});

// 签到
app.post('/api/checkin', auth, async (req, res) => {
  const ci = await DB.getCheckin(req.userId);
  const today = new Date().toDateString();
  if (ci.last_date === today) {
    return res.status(400).json({ error: '今日已签到' });
  }

  const REWARDS = [
    { coins: 50, diamonds: 2 }, { coins: 80, diamonds: 3 },
    { coins: 100, diamonds: 5 }, { coins: 120, diamonds: 5 },
    { coins: 150, diamonds: 8 }, { coins: 200, diamonds: 10 },
    { coins: 500, diamonds: 20 }
  ];
  const idx = ci.checkin_day - 1;
  const reward = REWARDS[idx] || REWARDS[0];

  const user = DB.getUserProfile(req.userId);
  const newDay = ci.checkin_day >= 7 ? 1 : ci.checkin_day + 1;
  DB.updateCheckin(req.userId, newDay, today);

  DB.updateStats(
    req.userId,
    user.level,
    user.exp + 10,
    user.coins + reward.coins,
    user.diamonds + reward.diamonds,
    user.high_score
  );

  res.json({ success: true, reward, checkinDay: newDay });
});

// ========== 健康检查 ==========
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ========== 启动服务 ==========
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://0.0.0.0:${PORT}/api/health`);
});
