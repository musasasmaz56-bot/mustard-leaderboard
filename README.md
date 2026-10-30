# 🏆 Mustard Trading Arena — Live Leaderboard

A sleek, real-time multi-trader leaderboard and profit tracker built for **Mustard Investments** arbitrageurs.

Deployable in 2 minutes to **Render (Render.com)** on the Free tier.

---

## ⚡ Features

- 👑 **Rank by Most Money (Net Worth):** Real-time standings sorted by all-time Total Portfolio Value (£).
- 📈 **Rank by Most Money Today:** Standings sorted by Today's Net Profit (£) and % ROI.
- ⏱️ **Real-Time Auto Sync:** Live countdown and polling every 10 seconds; keeps all friends in sync.
- 🔐 **Friend Authentication:** Fast sign-up and login with PBKDF2 HMAC SHA-256 secure password hashing.
- ✍️ **Manual Balance Updates:** Friends can easily update their portfolio value, available cash, today's profit, trade count, and active holding directly from the web interface.
- 🍪 **Cookies & Persistent Sessions:** Built-in "Remember Me" session cookies (30-day auto-login) plus an interactive Cookie Consent banner.
- ⏰ **24/7 Keep-Alive Automation:** Includes a GitHub Actions automated workflow (`.github/workflows/keep_alive.yml`) that pings your app every 10 minutes so it never goes to sleep!
- 🤖 **Automated Bot Webhook API:** Every user gets a private API key (`mb_live_...`). Any automated Mustard bot can push live stats automatically on every trade!
- 🎨 **High-Tech Aesthetic:** High-frequency trading terminal look with dark glassmorphism, Mustard Gold (`#FFC107`), Neon Emerald Green (`#00E676`), and live market status.

---

## 🚀 How to Deploy to Render in 2 Minutes (Free)

### Method 1: Push to GitHub & Deploy via Render Dashboard (Recommended)

1. **Push this directory to your GitHub:**
   ```bash
   cd mustard-leaderboard
   git init
   git add .
   git commit -m "Initial commit of Mustard Leaderboard"
   git branch -M main
   git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/mustard-leaderboard.git
   git push -u origin main
   ```

2. **Deploy on Render:**
   - Log into [Render.com](https://render.com).
   - Click **New +** > **Web Service**.
   - Select your `mustard-leaderboard` repository.
   - Render will auto-detect the configuration, or enter:
     - **Name:** `mustard-arena` (or whatever you prefer)
     - **Runtime:** `Python 3`
     - **Build Command:** `pip install -r requirements.txt`
     - **Start Command:** `uvicorn app:app --host 0.0.0.0 --port $PORT`
     - **Instance Type:** `Free`
   - Click **Create Web Service**.

3. **Done!**
   In about 60 seconds, Render will build and launch your live leaderboard URL (e.g., `https://mustard-arena.onrender.com`). Send the link to your friends!

---

### Method 2: Render Blueprint (Infrastructure as Code)

Because this repository already contains `render.yaml` and `Procfile`:
1. In Render, click **New +** > **Blueprint**.
2. Connect your GitHub repository.
3. Render reads `render.yaml` and deploys automatically with zero manual configuration.

---

## ⏰ How to Keep It Running 24/7 (Never Sleep)

Render's free tier spins down after 15 minutes of zero traffic. We have built in two simple ways to keep it online **24 hours a day, 7 days a week, 365 days a year for free**:

### Option 1: Automatic 24/7 Ping via GitHub Actions (Built-in!)
This repository includes `.github/workflows/keep_alive.yml`.
1. Once your code is on GitHub, go to your repository on GitHub.com.
2. Click **Settings** > **Secrets and variables** > **Actions**.
3. Add a repository secret named `ARENA_URL` with your Render URL (e.g. `https://mustard-arena.onrender.com`).
4. GitHub Actions will automatically wake and ping your web server every 10 minutes around the clock. Your leaderboard will **never** spin down or go to sleep!

### Option 2: Deploy to Koyeb (Free 24/7 Native Hosting)
If you prefer a hosting platform that never sleeps by default:
- [Koyeb.com](https://www.koyeb.com) offers 1 free web service running **24/7 continuously** without spinning down.
- Simply connect your GitHub repository, select Python, and deploy.

---

## 🍪 Cookie Support

- **Remember Me Cookie:** Checking "Remember me" on login issues a secure 30-day `session_token` cookie so you stay logged in even after closing your browser.
- **Cookie Consent Banner:** A floating notice appears at the bottom allowing visitors to accept cookies or keep only essential authentication cookies.
- **Keep-Alive Endpoint:** `/ping` and `/api/health` are available for 24/7 monitoring services.

---

## 💻 Running Locally

To test the application on your local machine:

1. Open PowerShell or Terminal in this folder:
   ```bash
   cd C:\Users\musas\.gemini\antigravity\scratch\mustard-leaderboard
   ```

2. Install dependencies (if not already installed):
   ```bash
   pip install -r requirements.txt
   ```

3. Start the server:
   ```bash
   uvicorn app:app --host 127.0.0.1 --port 8000 --reload
   ```

4. Open your browser at:
   ```
   http://127.0.0.1:8000
   ```

---

## 🤖 Connecting an Automated Bot (Webhook API)

If you or your friends run an automated Mustard trading bot, you can stream stats directly into the leaderboard without touching the website:

### Endpoint:
`POST https://<your-render-app>.onrender.com/api/submit-stats`

### Headers:
`X-API-Key: mb_live_your_key_here`

### Python Example:
```python
import requests

ARENA_URL = "https://your-app.onrender.com/api/submit-stats"
API_KEY = "mb_live_xxxxxxxxxxxxxxxx"

def sync_to_arena(portfolio_value, cash, today_profit, trades_today, holding, is_running=True):
    try:
        response = requests.post(
            ARENA_URL,
            headers={"X-API-Key": API_KEY},
            json={
                "portfolio_value": portfolio_value,      # e.g. 13392.33
                "available_cash": cash,                  # e.g. 0.21
                "today_profit_gbp": today_profit,        # e.g. 1392.33
                "today_trades_count": trades_today,      # e.g. 29
                "active_holding": holding,               # e.g. "OCDO.L" or "LINK"
                "is_bot_running": is_running             # True or False
            },
            timeout=5
        )
        print("Leaderboard synced:", response.json())
    except Exception as e:
        print("Failed to sync leaderboard:", e)
```

---

## 🔒 Security & Architecture

- **Zero heavy external database dependencies:** Uses SQLite with WAL-compatible queries; cloud-ready and lightweight.
- **PBKDF2 Password Hashing:** 100,000 iterations with unique 16-byte random salts.
- **Cookie & Token Sessions:** HttpOnly cookies for web browsers and Bearer/Header tokens for automated bots.
- **Completely isolated:** Independent standalone web service with zero coupling to local desktop files.
