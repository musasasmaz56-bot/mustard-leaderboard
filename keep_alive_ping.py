"""
Mustard Trading Arena — 24/7 Keep-Alive Daemon
Pings your live Render / cloud deployment every 5 minutes so it never spins down or sleeps.
"""

import time
import datetime
import requests

# Put your Render URL here (e.g. "https://mustard-arena.onrender.com")
ARENA_URL = "https://mustard-arena.onrender.com"
PING_INTERVAL_SECONDS = 300  # 5 minutes

def ping_server():
    endpoint = f"{ARENA_URL.rstrip('/')}/ping"
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        res = requests.get(endpoint, timeout=10)
        if res.status_code == 200:
            print(f"[{now_str}] 24/7 KEEP-ALIVE OK: HTTP {res.status_code} - Server is awake & active.")
        else:
            print(f"[{now_str}] Warning: Server returned status {res.status_code}")
    except Exception as e:
        print(f"[{now_str}] Ping failed (server may be warming up): {e}")

if __name__ == "__main__":
    print(f"Starting 24/7 Keep-Alive for: {ARENA_URL}")
    print(f"Pinging every {PING_INTERVAL_SECONDS // 60} minutes...")
    while True:
        ping_server()
        time.sleep(PING_INTERVAL_SECONDS)
