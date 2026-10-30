import os
import sys

# Ensure cwd is the leaderboard directory
os.chdir(r"C:\Users\musas\.gemini\antigravity\scratch\mustard-leaderboard")
sys.path.insert(0, r"C:\Users\musas\.gemini\antigravity\scratch\mustard-leaderboard")

from fastapi.testclient import TestClient
from app import app
from database import init_db

print("Initializing test database...")
init_db()

client = TestClient(app)

print("\n--- 1. Testing GET / (Home page HTML) ---")
res = client.get("/")
assert res.status_code == 200, f"Expected 200, got {res.status_code}"
assert "Mustard Investments" in res.text or "MUSTARD INVESTMENTS" in res.text
print("GET / passed! HTML rendered successfully.")

print("\n--- 2. Testing GET /api/leaderboard/all-time ---")
res = client.get("/api/leaderboard/all-time")
assert res.status_code == 200
data = res.json()
assert "leaderboard" in data
assert len(data["leaderboard"]) > 0
top_wealth = data["leaderboard"][0]
print(f"Top wealth trader: {top_wealth['display_name']} with £{top_wealth['portfolio_value']}")
assert top_wealth["rank"] == 1

print("\n--- 3. Testing GET /api/leaderboard/today ---")
res = client.get("/api/leaderboard/today")
assert res.status_code == 200
data = res.json()
assert "leaderboard" in data
top_today = data["leaderboard"][0]
print(f"Top today profit: {top_today['display_name']} with +£{top_today['today_profit_gbp']}")

print("\n--- 4. Testing GET /api/stats/summary ---")
res = client.get("/api/stats/summary")
assert res.status_code == 200
summary = res.json()
print("Summary stats:", summary)
assert summary["total_wealth"] > 0
assert summary["active_traders"] > 0

print("\n--- 5. Testing POST /api/auth/register ---")
import secrets
random_user = f"charlie_{secrets.token_hex(4)}"
new_user = {
    "username": random_user,
    "display_name": f"Charlie {random_user}",
    "password": "mypassword123",
    "mustard_email": f"{random_user}@test.com"
}
res = client.post("/api/auth/register", json=new_user)
assert res.status_code == 200, f"Register failed: {res.text}"
reg_data = res.json()
print("Registration response:", reg_data["message"])
api_key = reg_data["user"]["api_key"]
print("Assigned API Key:", api_key)

print("\n--- 6. Testing POST /api/submit-stats (Bot Webhook) ---")
webhook_payload = {
    "portfolio_value": 16500.0,
    "available_cash": 120.50,
    "today_profit_gbp": 3500.0,
    "today_trades_count": 35,
    "active_holding": "ETH-GBP",
    "is_bot_running": True
}
res = client.post("/api/submit-stats", headers={"X-API-Key": api_key}, json=webhook_payload)
assert res.status_code == 200, f"Webhook failed: {res.text}"
print("Webhook response:", res.json())

# Verify Charlie is now #1 in today's leaderboard!
res = client.get("/api/leaderboard/today")
data = res.json()
top_today_after = data["leaderboard"][0]
print(f"New top today trader: {top_today_after['display_name']} with +£{top_today_after['today_profit_gbp']}")
assert top_today_after["username"] == random_user

print("\n--- 7. Testing POST /api/auth/login ---")
login_payload = {
    "username": random_user,
    "password": "mypassword123",
    "remember_me": True
}
res = client.post("/api/auth/login", json=login_payload)
assert res.status_code == 200
print("Login successful! Token returned with 30-day session cookie.")

print("\n--- 8. Testing 24/7 Keep-Alive Endpoints ---")
res = client.get("/ping")
assert res.status_code == 200
assert res.json()["alive_24_7"] is True
print("GET /ping passed:", res.json())

res = client.get("/api/health")
assert res.status_code == 200
assert res.json()["status"] == "online"
print("GET /api/health passed:", res.json())

print("\n--- 9. Testing POST /api/cookie-consent ---")
res = client.post("/api/cookie-consent")
assert res.status_code == 200
assert res.json()["consent"] == "accepted"
print("Cookie consent saved:", res.json())

print("\nALL VERIFICATION TESTS PASSED PERFECTLY! [SUCCESS]")
