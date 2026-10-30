import os
import datetime
from typing import Optional
from fastapi import FastAPI, Request, Response, HTTPException, Depends, Header, status
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from database import (
    init_db,
    get_user_by_username,
    get_user_by_id,
    get_user_by_api_key,
    create_user,
    create_session,
    get_user_from_session,
    delete_session,
    update_user_stats,
    get_leaderboard_all_time,
    get_leaderboard_today,
    get_user_stats,
)
from auth import hash_password, verify_password

app = FastAPI(
    title="Mustard Trading Arena — Live Leaderboard",
    description="Real-time multi-trader leaderboard & profit tracker for Mustard Investments",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static & Templates
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
static_dir = os.path.join(BASE_DIR, "static")
templates_dir = os.path.join(BASE_DIR, "templates")

if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

templates = Jinja2Templates(directory=templates_dir)

@app.on_event("startup")
def on_startup():
    init_db()

# --- Helpers ---

AVATAR_PALETTE = [
    "#00E676", "#FFC107", "#00D2FF", "#FF5252", "#E040FB", 
    "#FF9100", "#7C4DFF", "#1DE9B6", "#FF4081", "#64FFDA"
]

def get_current_user_optional(request: Request) -> Optional[dict]:
    token = request.cookies.get("session_token")
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
    if token:
        user = get_user_from_session(token)
        if user:
            return dict(user)
    return None

def get_current_user_required(request: Request) -> dict:
    user = get_current_user_optional(request)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not logged in")
    return user

# --- Pydantic Schemas ---

class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=30)
    display_name: str = Field(..., min_length=2, max_length=40)
    password: str = Field(..., min_length=4, max_length=100)
    mustard_email: Optional[str] = ""

class LoginRequest(BaseModel):
    username: str
    password: str
    remember_me: Optional[bool] = True

class UpdateStatsRequest(BaseModel):
    portfolio_value: float
    available_cash: Optional[float] = 0.0
    today_profit_gbp: Optional[float] = 0.0
    today_trades_count: Optional[int] = 0
    active_holding: Optional[str] = "100% Cash"
    is_bot_running: Optional[bool] = False
    starting_balance: Optional[float] = None

class WebhookStatsRequest(BaseModel):
    api_key: Optional[str] = None
    portfolio_value: float
    available_cash: Optional[float] = 0.0
    today_profit_gbp: Optional[float] = 0.0
    today_trades_count: Optional[int] = 0
    active_holding: Optional[str] = "100% Cash"
    is_bot_running: Optional[bool] = False

# --- Health & 24/7 Keep-Alive Endpoints ---

@app.get("/ping")
@app.get("/api/health")
def health_ping():
    """Ultra-lightweight endpoint for 24/7 uptime monitoring & keep-alive pings."""
    return {
        "status": "online",
        "alive_24_7": True,
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "service": "Mustard Trading Arena"
    }

@app.post("/api/cookie-consent")
def set_cookie_consent(response: Response):
    response.set_cookie(
        key="mustard_cookie_consent",
        value="accepted",
        max_age=365 * 86400,
        httponly=False,
        samesite="lax",
    )
    return {"status": "success", "consent": "accepted"}

# --- Web UI Routes ---

@app.get("/")
def home(request: Request):
    user = get_current_user_optional(request)
    all_time = get_leaderboard_all_time()
    today = get_leaderboard_today()
    
    # Calculate top summary stats
    top_wealth = all_time[0] if all_time else None
    top_today = today[0] if today else None
    total_market_val = sum(r["portfolio_value"] for r in all_time)
    total_traders = len(all_time)
    active_bots = sum(1 for r in all_time if r.get("is_bot_running"))
    
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "user": user,
            "all_time": all_time,
            "today": today,
            "top_wealth": top_wealth,
            "top_today": top_today,
            "total_market_val": total_market_val,
            "total_traders": total_traders,
            "active_bots": active_bots,
        }
    )

# --- Auth Endpoints ---

@app.post("/api/auth/register")
def register(req: RegisterRequest, response: Response):
    clean_username = req.username.strip().lower()
    existing = get_user_by_username(clean_username)
    if existing:
        raise HTTPException(status_code=400, detail="Username is already taken. Please pick another.")
    
    # Choose avatar color
    idx = abs(hash(clean_username)) % len(AVATAR_PALETTE)
    avatar_color = AVATAR_PALETTE[idx]
    
    pwd_hash, salt = hash_password(req.password)
    user_id, api_key = create_user(
        clean_username, req.display_name, pwd_hash, salt, avatar_color, req.mustard_email or ""
    )
    
    session_token = create_session(user_id)
    response.set_cookie(
        key="session_token",
        value=session_token,
        max_age=30 * 86400,
        httponly=True,
        samesite="lax",
    )
    
    user_data = get_user_stats(user_id)
    return {
        "status": "success",
        "message": f"Welcome, {req.display_name}!",
        "token": session_token,
        "user": {
            "id": user_id,
            "username": user_data["username"],
            "display_name": user_data["display_name"],
            "avatar_color": user_data["avatar_color"],
            "api_key": user_data["api_key"],
            "portfolio_value": user_data["portfolio_value"],
            "today_profit_gbp": user_data["today_profit_gbp"],
        }
    }

@app.post("/api/auth/login")
def login(req: LoginRequest, response: Response):
    user = get_user_by_username(req.username.strip().lower())
    if not user:
        raise HTTPException(status_code=400, detail="Invalid username or password")
    
    if not verify_password(req.password, user["password_hash"], user["salt"]):
        raise HTTPException(status_code=400, detail="Invalid username or password")
    
    session_token = create_session(user["id"])
    cookie_max_age = (30 * 86400) if req.remember_me else None
    response.set_cookie(
        key="session_token",
        value=session_token,
        max_age=cookie_max_age,
        httponly=True,
        samesite="lax",
    )
    
    user_data = get_user_stats(user["id"])
    return {
        "status": "success",
        "message": f"Welcome back, {user['display_name']}!",
        "token": session_token,
        "user": {
            "id": user["id"],
            "username": user_data["username"],
            "display_name": user_data["display_name"],
            "avatar_color": user_data["avatar_color"],
            "api_key": user_data["api_key"],
            "portfolio_value": user_data["portfolio_value"],
            "today_profit_gbp": user_data["today_profit_gbp"],
        }
    }

@app.post("/api/auth/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        delete_session(token)
    response.delete_cookie("session_token")
    return {"status": "success", "message": "Logged out successfully"}

@app.get("/api/user/me")
def get_me(request: Request):
    user = get_current_user_optional(request)
    if not user:
        return {"authenticated": False, "user": None}
    
    stats = get_user_stats(user["id"])
    return {
        "authenticated": True,
        "user": stats
    }

# --- Leaderboard Data Endpoints ---

@app.get("/api/leaderboard/all-time")
def api_leaderboard_all_time():
    rows = get_leaderboard_all_time()
    for idx, r in enumerate(rows, 1):
        r["rank"] = idx
    return {"leaderboard": rows}

@app.get("/api/leaderboard/today")
def api_leaderboard_today():
    rows = get_leaderboard_today()
    for idx, r in enumerate(rows, 1):
        r["rank"] = idx
    return {"leaderboard": rows}

@app.get("/api/stats/summary")
def api_stats_summary():
    all_time = get_leaderboard_all_time()
    today = get_leaderboard_today()
    
    total_wealth = sum(r["portfolio_value"] for r in all_time)
    total_today_profit = sum(r["today_profit_gbp"] for r in all_time)
    total_trades = sum(r["today_trades_count"] for r in all_time)
    active_traders = len(all_time)
    active_bots = sum(1 for r in all_time if r["is_bot_running"])
    
    top_wealth = all_time[0] if all_time else None
    top_today = today[0] if today else None
    
    return {
        "total_wealth": total_wealth,
        "total_today_profit": total_today_profit,
        "total_trades": total_trades,
        "active_traders": active_traders,
        "active_bots": active_bots,
        "top_wealth": top_wealth,
        "top_today": top_today,
    }

# --- Stats Update Endpoints ---

@app.post("/api/user/update-stats")
def user_update_stats(req: UpdateStatsRequest, user: dict = Depends(get_current_user_required)):
    update_user_stats(
        user_id=user["id"],
        portfolio_value=req.portfolio_value,
        available_cash=req.available_cash or 0.0,
        today_profit_gbp=req.today_profit_gbp or 0.0,
        today_trades_count=req.today_trades_count or 0,
        active_holding=req.active_holding or "100% Cash",
        is_bot_running=req.is_bot_running or False,
        starting_balance=req.starting_balance
    )
    return {
        "status": "success",
        "message": "Stats updated successfully!",
        "stats": get_user_stats(user["id"])
    }

@app.post("/api/submit-stats")
def webhook_submit_stats(
    req: WebhookStatsRequest,
    x_api_key: Optional[str] = Header(None)
):
    """
    Webhook for trading bots to automatically push live stats.
    Send X-API-Key in header OR api_key in JSON body.
    """
    key = x_api_key or req.api_key
    if not key:
        raise HTTPException(status_code=401, detail="Missing API key. Provide 'X-API-Key' header or 'api_key' in body.")
    
    user = get_user_by_api_key(key)
    if not user:
        raise HTTPException(status_code=403, detail="Invalid API Key.")
    
    update_user_stats(
        user_id=user["id"],
        portfolio_value=req.portfolio_value,
        available_cash=req.available_cash or 0.0,
        today_profit_gbp=req.today_profit_gbp or 0.0,
        today_trades_count=req.today_trades_count or 0,
        active_holding=req.active_holding or "100% Cash",
        is_bot_running=req.is_bot_running or False
    )
    
    return {
        "status": "success",
        "message": f"Live stats updated for {user['display_name']}",
        "portfolio_value": req.portfolio_value,
        "today_profit_gbp": req.today_profit_gbp
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
