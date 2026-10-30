import os
import sqlite3
import datetime
import secrets

DB_PATH = os.environ.get("DATABASE_PATH", "leaderboard.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # 1. Users Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        api_key TEXT UNIQUE NOT NULL,
        avatar_color TEXT DEFAULT '#00E676',
        mustard_email TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 2. Sessions Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # 3. Live Stats Table (One active record per user)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS stats (
        user_id INTEGER PRIMARY KEY,
        portfolio_value REAL DEFAULT 10000.0,
        available_cash REAL DEFAULT 10000.0,
        today_starting_balance REAL DEFAULT 10000.0,
        today_profit_gbp REAL DEFAULT 0.0,
        today_profit_pct REAL DEFAULT 0.0,
        today_trades_count INTEGER DEFAULT 0,
        active_holding TEXT DEFAULT '100% Cash',
        is_bot_running INTEGER DEFAULT 0,
        stat_date TEXT NOT NULL,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    conn.commit()
    
    # Seed default sample traders if empty so the leaderboard is lively immediately
    cursor.execute("SELECT COUNT(*) as cnt FROM users")
    if cursor.fetchone()["cnt"] == 0:
        seed_sample_data(conn)
        
    conn.close()

def seed_sample_data(conn):
    from auth import hash_password
    today_str = datetime.date.today().isoformat()
    
    samples = [
        ("musa", "Musa (Admin)", "mustard123", "#FFC107", 13392.33, 0.21, 12000.0, 1392.33, 11.60, 29, "OCDO.L", 1),
        ("alex_t", "Alex Turner", "trader123", "#00E676", 12450.80, 520.10, 11500.0, 950.80, 8.27, 21, "LINK", 1),
        ("sarah_k", "Sarah Khan", "trader123", "#00D2FF", 11820.00, 11820.00, 11200.0, 620.00, 5.54, 18, "100% Cash", 0),
        ("david_b", "David Beckett", "trader123", "#FF5252", 10980.50, 45.20, 10700.0, 280.50, 2.62, 14, "BA.L", 1),
        ("oliver_w", "Oliver Wright", "trader123", "#E040FB", 10150.00, 10150.00, 10000.0, 150.00, 1.50, 7, "100% Cash", 0),
    ]
    
    cursor = conn.cursor()
    for u, name, pwd, color, port, cash, start_b, prof, prof_pct, trades, holding, running in samples:
        h, s = hash_password(pwd)
        k = f"mb_live_{secrets.token_hex(12)}"
        cursor.execute("""
            INSERT INTO users (username, display_name, password_hash, salt, api_key, avatar_color)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (u, name, h, s, k, color))
        u_id = cursor.lastrowid
        cursor.execute("""
            INSERT INTO stats (user_id, portfolio_value, available_cash, today_starting_balance, today_profit_gbp, today_profit_pct, today_trades_count, active_holding, is_bot_running, stat_date, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (u_id, port, cash, start_b, prof, prof_pct, trades, holding, running, today_str, datetime.datetime.utcnow().isoformat()))
    conn.commit()

# --- User & Session Operations ---

def get_user_by_username(username: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", (username.strip(),))
    user = cursor.fetchone()
    conn.close()
    return user

def get_user_by_id(user_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    conn.close()
    return user

def get_user_by_api_key(api_key: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE api_key = ?", (api_key.strip(),))
    user = cursor.fetchone()
    conn.close()
    return user

def create_user(username: str, display_name: str, password_hash: str, salt: str, avatar_color: str = "#00E676", mustard_email: str = ""):
    conn = get_db()
    cursor = conn.cursor()
    api_key = f"mb_live_{secrets.token_hex(16)}"
    cursor.execute("""
        INSERT INTO users (username, display_name, password_hash, salt, api_key, avatar_color, mustard_email)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (username.strip().lower(), display_name.strip(), password_hash, salt, api_key, avatar_color, mustard_email.strip()))
    user_id = cursor.lastrowid
    
    # Initialize zero stats for today
    today_str = datetime.date.today().isoformat()
    cursor.execute("""
        INSERT INTO stats (user_id, portfolio_value, available_cash, today_starting_balance, today_profit_gbp, today_profit_pct, today_trades_count, active_holding, is_bot_running, stat_date)
        VALUES (?, 10000.0, 10000.0, 10000.0, 0.0, 0.0, 0, '100% Cash', 0, ?)
    """, (user_id, today_str))
    
    conn.commit()
    conn.close()
    return user_id, api_key

def create_session(user_id: int, days: int = 30) -> str:
    conn = get_db()
    cursor = conn.cursor()
    token = secrets.token_urlsafe(32)
    expires = (datetime.datetime.utcnow() + datetime.timedelta(days=days)).isoformat()
    cursor.execute("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", (token, user_id, expires))
    conn.commit()
    conn.close()
    return token

def get_user_from_session(token: str):
    if not token:
        return None
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.datetime.utcnow().isoformat()
    cursor.execute("""
        SELECT u.* FROM sessions s 
        JOIN users u ON s.user_id = u.id 
        WHERE s.token = ? AND s.expires_at > ?
    """, (token, now))
    user = cursor.fetchone()
    conn.close()
    return user

def delete_session(token: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()

# --- Stats & Leaderboard Queries ---

def update_user_stats(user_id: int, portfolio_value: float, available_cash: float, today_profit_gbp: float, today_trades_count: int, active_holding: str = "100% Cash", is_bot_running: bool = False, starting_balance: float = None):
    conn = get_db()
    cursor = conn.cursor()
    today_str = datetime.date.today().isoformat()
    now_ts = datetime.datetime.utcnow().isoformat()
    
    cursor.execute("SELECT * FROM stats WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    
    if row:
        stored_date = row["stat_date"]
        # If new day, reset today's starting balance to previous day's closing portfolio
        if stored_date != today_str:
            today_start = row["portfolio_value"]
            today_profit_gbp = portfolio_value - today_start
            today_trades_count = 0
        else:
            today_start = starting_balance if starting_balance is not None else row["today_starting_balance"]
            
        today_pct = ((today_profit_gbp / today_start) * 100.0) if today_start > 0 else 0.0
        
        cursor.execute("""
            UPDATE stats SET 
                portfolio_value = ?,
                available_cash = ?,
                today_starting_balance = ?,
                today_profit_gbp = ?,
                today_profit_pct = ?,
                today_trades_count = ?,
                active_holding = ?,
                is_bot_running = ?,
                stat_date = ?,
                last_updated = ?
            WHERE user_id = ?
        """, (portfolio_value, available_cash, today_start, today_profit_gbp, today_pct, today_trades_count, active_holding, 1 if is_bot_running else 0, today_str, now_ts, user_id))
    else:
        start_b = starting_balance or 10000.0
        today_pct = ((today_profit_gbp / start_b) * 100.0) if start_b > 0 else 0.0
        cursor.execute("""
            INSERT INTO stats (user_id, portfolio_value, available_cash, today_starting_balance, today_profit_gbp, today_profit_pct, today_trades_count, active_holding, is_bot_running, stat_date, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (user_id, portfolio_value, available_cash, start_b, today_profit_gbp, today_pct, today_trades_count, active_holding, 1 if is_bot_running else 0, today_str, now_ts))
        
    conn.commit()
    conn.close()

def get_leaderboard_all_time():
    """Ranked by who has the most total money (Portfolio Value)."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT 
            u.id as user_id,
            u.username,
            u.display_name,
            u.avatar_color,
            s.portfolio_value,
            s.available_cash,
            s.today_profit_gbp,
            s.today_profit_pct,
            s.today_trades_count,
            s.active_holding,
            s.is_bot_running,
            s.last_updated,
            ((s.portfolio_value - 10000.0) / 10000.0 * 100.0) as all_time_roi_pct
        FROM users u
        JOIN stats s ON u.id = s.user_id
        ORDER BY s.portfolio_value DESC
    """)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def get_leaderboard_today():
    """Ranked by who has made the most money today (Today's Profit)."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT 
            u.id as user_id,
            u.username,
            u.display_name,
            u.avatar_color,
            s.portfolio_value,
            s.available_cash,
            s.today_profit_gbp,
            s.today_profit_pct,
            s.today_trades_count,
            s.active_holding,
            s.is_bot_running,
            s.last_updated
        FROM users u
        JOIN stats s ON u.id = s.user_id
        ORDER BY s.today_profit_gbp DESC
    """)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def get_user_stats(user_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT u.username, u.display_name, u.avatar_color, u.api_key, u.mustard_email, s.*
        FROM users u
        JOIN stats s ON u.id = s.user_id
        WHERE u.id = ?
    """, (user_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None
