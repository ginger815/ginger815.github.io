/**
 * SQLite 数据库层（sql.js — 纯 JS，无需编译）
 */
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// 数据库文件路径：优先使用 DATA_DIR 环境变量（Railway 持久卷），否则使用当前目录
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DB_PATH = path.join(DATA_DIR, 'matchgame.db');

let db;
let ready = false;

// ========== 初始化 ==========
async function initDB() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  // 确保数据目录存在
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // 从文件加载数据库或创建新的
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // 创建表结构
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    nickname TEXT DEFAULT '',
    avatar TEXT DEFAULT '😊',
    level INTEGER DEFAULT 1,
    exp INTEGER DEFAULT 0,
    coins INTEGER DEFAULT 500,
    diamonds INTEGER DEFAULT 50,
    high_score INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS cleared_levels (
    user_id INTEGER NOT NULL,
    level_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, level_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS game_saves (
    user_id INTEGER PRIMARY KEY,
    board TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    moves_left INTEGER DEFAULT 30,
    target_score INTEGER DEFAULT 0,
    current_level INTEGER DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS user_items (
    user_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    count INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, item_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS checkins (
    user_id INTEGER PRIMARY KEY,
    checkin_day INTEGER DEFAULT 1,
    last_date TEXT DEFAULT '',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  saveToDisk();
  ready = true;
  console.log('  📦 SQLite 数据库就绪');
}

function saveToDisk() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// 执行读操作
function query(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// 执行写操作
function run(sql, params = []) {
  db.run(sql, params);
  saveToDisk();
}

// ========== 导出 API ==========
const DB = {
  async ensureReady() {
    if (!ready) await initDB();
  },

  // --- 认证 ---
  async register(username, password, nickname) {
    await this.ensureReady();
    const existing = query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) return { error: '用户名已被注册' };
    const hash = await bcrypt.hash(password, 10);
    run('INSERT INTO users (username, password, nickname, avatar, level, exp, coins, diamonds) VALUES (?, ?, ?, ?, 1, 0, 500, 50)',
      [username, hash, nickname || username, '😊']);
    const user = query('SELECT id FROM users WHERE username = ?', [username])[0];
    return { userId: user.id };
  },

  async login(username, password) {
    await this.ensureReady();
    const users = query('SELECT * FROM users WHERE username = ?', [username]);
    if (users.length === 0) return { error: '用户不存在' };
    const user = users[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return { error: '密码错误' };
    return { userId: user.id };
  },

  // --- 用户资料 ---
  async getUserProfile(userId) {
    await this.ensureReady();
    const users = query(
      'SELECT id, username, nickname, avatar, level, exp, coins, diamonds, high_score FROM users WHERE id = ?',
      [userId]
    );
    if (users.length === 0) return null;
    return users[0];
  },

  async updateProfile(userId, nickname, avatar) {
    await this.ensureReady();
    if (nickname !== undefined && nickname !== null) {
      run('UPDATE users SET nickname = ? WHERE id = ?', [nickname, userId]);
    }
    if (avatar !== undefined && avatar !== null) {
      run('UPDATE users SET avatar = ? WHERE id = ?', [avatar, userId]);
    }
    return { success: true };
  },

  async updateStats(userId, level, exp, coins, diamonds, highScore) {
    await this.ensureReady();
    run(
      'UPDATE users SET level = ?, exp = ?, coins = ?, diamonds = ?, high_score = MAX(high_score, ?) WHERE id = ?',
      [level ?? 1, exp ?? 0, coins ?? 500, diamonds ?? 50, highScore ?? 0, userId]
    );
  },

  // --- 关卡 ---
  async unlockLevel(userId, levelId) {
    await this.ensureReady();
    const has = query('SELECT 1 FROM cleared_levels WHERE user_id = ? AND level_id = ?', [userId, levelId]);
    if (has.length === 0) {
      run('INSERT INTO cleared_levels (user_id, level_id) VALUES (?, ?)', [userId, levelId]);
    }
  },

  async getClearedLevels(userId) {
    await this.ensureReady();
    return query('SELECT level_id FROM cleared_levels WHERE user_id = ?', [userId]).map(r => r.level_id);
  },

  // --- 存档 ---
  async saveGame(userId, board, score, movesLeft, targetScore, currentLevel) {
    await this.ensureReady();
    const boardJson = typeof board === 'string' ? board : JSON.stringify(board);
    const existing = query('SELECT 1 FROM game_saves WHERE user_id = ?', [userId]);
    if (existing.length > 0) {
      run('UPDATE game_saves SET board=?, score=?, moves_left=?, target_score=?, current_level=? WHERE user_id=?',
        [boardJson, score, movesLeft, targetScore, currentLevel, userId]);
    } else {
      run('INSERT INTO game_saves (user_id, board, score, moves_left, target_score, current_level) VALUES (?,?,?,?,?,?)',
        [userId, boardJson, score, movesLeft, targetScore, currentLevel]);
    }
  },

  async loadGame(userId) {
    await this.ensureReady();
    const rows = query('SELECT * FROM game_saves WHERE user_id = ?', [userId]);
    if (rows.length === 0) return null;
    const row = rows[0];
    try { row.board = JSON.parse(row.board); } catch (e) { row.board = null; }
    return row;
  },

  // --- 道具 ---
  async addItem(userId, itemId, count) {
    await this.ensureReady();
    const existing = query('SELECT count FROM user_items WHERE user_id = ? AND item_id = ?', [userId, itemId]);
    if (existing.length > 0) {
      run('UPDATE user_items SET count = count + ? WHERE user_id = ? AND item_id = ?', [count, userId, itemId]);
    } else {
      run('INSERT INTO user_items (user_id, item_id, count) VALUES (?, ?, ?)', [userId, itemId, count]);
    }
  },

  async getItems(userId) {
    await this.ensureReady();
    const rows = query('SELECT item_id, count FROM user_items WHERE user_id = ?', [userId]);
    const map = {};
    rows.forEach(r => { map[r.item_id] = r.count; });
    return map;
  },

  // --- 签到 ---
  async getCheckin(userId) {
    await this.ensureReady();
    const rows = query('SELECT * FROM checkins WHERE user_id = ?', [userId]);
    return rows.length > 0 ? rows[0] : { checkin_day: 1, last_date: '' };
  },

  async updateCheckin(userId, day, date) {
    await this.ensureReady();
    const existing = query('SELECT 1 FROM checkins WHERE user_id = ?', [userId]);
    if (existing.length > 0) {
      run('UPDATE checkins SET checkin_day = ?, last_date = ? WHERE user_id = ?', [day, date, userId]);
    } else {
      run('INSERT INTO checkins (user_id, checkin_day, last_date) VALUES (?, ?, ?)', [userId, day, date]);
    }
  },

  // --- 排行榜 ---
  async getAllRanked(sortBy) {
    await this.ensureReady();
    const users = query(
      'SELECT u.id, u.username, u.nickname, u.avatar, u.level, u.high_score FROM users u'
    );
    // 获取每个用户的通关数
    for (const u of users) {
      const levels = query('SELECT COUNT(*) as cnt FROM cleared_levels WHERE user_id = ?', [u.id]);
      u.stars = levels[0]?.cnt || 0;
    }
    const ranked = users.map(u => ({
      ...u,
      sortVal: sortBy === 'stars' ? u.stars : sortBy === 'level' ? u.level : u.high_score
    }));
    ranked.sort((a, b) => b.sortVal - a.sortVal);
    return ranked.slice(0, 50).map((r, i) => ({
      rank: i + 1,
      username: r.username,
      nickname: r.nickname,
      avatar: r.avatar,
      score: r.high_score,
      level: r.level,
      stars: r.stars,
      maxCombo: 0
    }));
  }
};

module.exports = DB;
