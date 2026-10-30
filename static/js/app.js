// --- Global State ---
let currentTab = "all-time"; // 'all-time' or 'today'
let currentUser = null;
let leaderboardData = [];
let refreshCountdown = 10;
let refreshInterval = null;

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    initClock();
    checkAuth();
    fetchLeaderboardData();
    startCountdownTimer();
    initCookieNotice();

    // Close modals on backdrop click or ESC
    document.querySelectorAll(".modal-backdrop").forEach(modal => {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal(modal.id);
        });
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            document.querySelectorAll(".modal-backdrop.open").forEach(modal => closeModal(modal.id));
        }
    });
});

// --- Cookie Notice & Consent Handlers ---
function initCookieNotice() {
    const hasConsent = localStorage.getItem("mustard_cookie_consent") || document.cookie.includes("mustard_cookie_consent");
    if (!hasConsent) {
        setTimeout(() => {
            const banner = document.getElementById("cookie-consent-banner");
            if (banner) banner.style.display = "flex";
        }, 800);
    }
}

async function acceptCookies(level = "all") {
    localStorage.setItem("mustard_cookie_consent", level);
    const banner = document.getElementById("cookie-consent-banner");
    if (banner) {
        banner.style.animation = "slideDown 0.3s forwards";
        setTimeout(() => {
            banner.style.display = "none";
        }, 300);
    }

    try {
        await fetch("/api/cookie-consent", { method: "POST" });
    } catch (e) {
        // Silently succeed with localStorage
    }
}

// --- Real-Time Clock ---
function initClock() {
    function update() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString("en-GB", {
            timeZone: "Europe/London",
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
        const el = document.getElementById("live-clock");
        if (el) el.textContent = `${timeStr} LSE`;
    }
    update();
    setInterval(update, 1000);
}

// --- Auto-Refresh Countdown ---
function startCountdownTimer() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshCountdown = 10;
    
    refreshInterval = setInterval(() => {
        refreshCountdown--;
        const badge = document.getElementById("refresh-timer");
        if (badge) badge.textContent = `${refreshCountdown}s`;
        
        if (refreshCountdown <= 0) {
            refreshCountdown = 10;
            fetchLeaderboardData(false);
        }
    }, 1000);
}

// --- Fetch Leaderboard Data ---
async function fetchLeaderboardData(isManual = false) {
    const btn = document.getElementById("manual-refresh-btn");
    if (isManual && btn) btn.style.transform = "rotate(180deg)";

    try {
        const endpoint = currentTab === "all-time" 
            ? "/api/leaderboard/all-time" 
            : "/api/leaderboard/today";
        
        const [lbRes, summaryRes] = await Promise.all([
            fetch(endpoint),
            fetch("/api/stats/summary")
        ]);

        if (lbRes.ok) {
            const data = await lbRes.json();
            leaderboardData = data.leaderboard || [];
            renderTable(leaderboardData);
        }

        if (summaryRes.ok) {
            const summary = await summaryRes.json();
            renderKPIs(summary);
        }
    } catch (err) {
        console.error("Failed to fetch live leaderboard:", err);
    } finally {
        if (isManual && btn) {
            setTimeout(() => { btn.style.transform = "none"; }, 300);
            refreshCountdown = 10;
        }
    }
}

// --- Render KPI Summary Cards ---
function renderKPIs(summary) {
    if (!summary) return;

    // 1. All-time leader
    if (summary.top_wealth) {
        document.getElementById("kpi-leader-val").textContent = formatGBP(summary.top_wealth.portfolio_value);
        document.getElementById("kpi-leader-name").textContent = `${summary.top_wealth.display_name}`;
    }

    // 2. Today's top earner
    if (summary.top_today) {
        const prof = summary.top_today.today_profit_gbp;
        const sign = prof >= 0 ? "+" : "-";
        document.getElementById("kpi-today-val").textContent = `${sign}£${Math.abs(prof).toLocaleString('en-GB', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        document.getElementById("kpi-today-name").textContent = `${summary.top_today.display_name} (${summary.top_today.today_profit_pct.toFixed(2)}%)`;
    }

    // 3. Group wealth
    document.getElementById("kpi-group-wealth").textContent = formatGBP(summary.total_wealth || 0);
    document.getElementById("kpi-trader-count").textContent = `${summary.active_traders || 0} traders in arena`;

    // 4. Active bots
    document.getElementById("kpi-active-bots").textContent = `${summary.active_bots || 0} Live`;
    document.getElementById("kpi-total-trades").textContent = `${summary.total_trades || 0} trades executed today`;
}

// --- Render Table ---
function renderTable(data) {
    const tbody = document.getElementById("leaderboard-body");
    const thPrimary = document.getElementById("th-primary-metric");
    
    if (currentTab === "all-time") {
        thPrimary.textContent = "TOTAL WEALTH";
    } else {
        thPrimary.textContent = "TODAY'S PROFIT";
    }

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">No traders registered yet. Be the first to join!</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map((item, index) => {
        const rank = index + 1;
        const isCurrent = currentUser && currentUser.id === item.user_id;
        
        let rankHtml = `<span class="rank-badge rank-other">#${rank}</span>`;
        if (rank === 1) rankHtml = `<span class="rank-badge rank-1">👑 1</span>`;
        else if (rank === 2) rankHtml = `<span class="rank-badge rank-2">🥈 2</span>`;
        else if (rank === 3) rankHtml = `<span class="rank-badge rank-3">🥉 3</span>`;

        const profitGbp = item.today_profit_gbp || 0;
        const profitPct = item.today_profit_pct || 0;
        const profitClass = profitGbp >= 0 ? "text-green" : "text-red";
        const profitSign = profitGbp >= 0 ? "+" : "-";
        const profitStr = `${profitSign}£${Math.abs(profitGbp).toLocaleString('en-GB', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

        // Primary highlight metric depending on tab
        const primaryMetricHtml = currentTab === "all-time"
            ? `<div class="mono-val val-large text-gold">${formatGBP(item.portfolio_value)}</div>`
            : `<div class="mono-val val-large ${profitClass}">${profitStr} <span class="sub-pct">(${profitPct.toFixed(2)}%)</span></div>`;

        const secondaryMetricHtml = currentTab === "all-time"
            ? `<span class="mono-val ${profitClass}">${profitStr}</span> <span class="sub-pct ${profitClass}">(${profitPct.toFixed(2)}%)</span>`
            : `<span class="mono-val text-gold">${formatGBP(item.portfolio_value)}</span>`;

        const isRunning = item.is_bot_running === 1 || item.is_bot_running === true;
        const botStatusHtml = isRunning
            ? `<span class="bot-status-tag bot-active"><span class="status-dot green"></span>RUNNING</span>`
            : `<span class="bot-status-tag bot-idle"><span class="status-dot gray"></span>IDLE</span>`;

        const avatarColor = item.avatar_color || "#00E676";
        const initials = item.display_name ? item.display_name.charAt(0).toUpperCase() : "T";
        const syncTimeStr = formatTimeAgo(item.last_updated);

        return `
            <tr class="${isCurrent ? 'user-row' : ''}" id="trader-row-${item.user_id}">
                <td>${rankHtml}</td>
                <td>
                    <div class="trader-cell">
                        <div class="trader-avatar" style="background-color: ${avatarColor};">
                            ${initials}
                        </div>
                        <div class="trader-info">
                            <span class="trader-name">
                                ${escapeHtml(item.display_name)}
                                ${isCurrent ? '<span class="you-tag">YOU</span>' : ''}
                            </span>
                            <span class="trader-username">@${escapeHtml(item.username)}</span>
                        </div>
                    </div>
                </td>
                <td class="text-right">${primaryMetricHtml}</td>
                <td class="text-right">${secondaryMetricHtml}</td>
                <td class="text-center">
                    <span class="tag-quota">${item.today_trades_count || 0} / 50</span>
                </td>
                <td>
                    <span class="tag-holding">${escapeHtml(item.active_holding || '100% Cash')}</span>
                </td>
                <td class="text-center">${botStatusHtml}</td>
                <td class="text-right">
                    <span class="sync-time">${syncTimeStr}</span>
                </td>
            </tr>
        `;
    }).join("");
}

// --- Tab Switching ---
function switchTab(tab) {
    if (currentTab === tab) return;
    currentTab = tab;
    
    document.getElementById("tab-all-time").classList.toggle("active", tab === "all-time");
    document.getElementById("tab-today").classList.toggle("active", tab === "today");
    
    fetchLeaderboardData(true);
}

// --- Search Filter ---
function filterTable() {
    const query = document.getElementById("trader-search").value.toLowerCase().trim();
    if (!query) {
        renderTable(leaderboardData);
        return;
    }
    const filtered = leaderboardData.filter(item => 
        (item.display_name && item.display_name.toLowerCase().includes(query)) ||
        (item.username && item.username.toLowerCase().includes(query)) ||
        (item.active_holding && item.active_holding.toLowerCase().includes(query))
    );
    renderTable(filtered);
}

// --- Auth State ---
async function checkAuth() {
    try {
        const res = await fetch("/api/user/me");
        if (res.ok) {
            const data = await res.json();
            if (data.authenticated && data.user) {
                currentUser = data.user;
                renderNavLoggedIn(currentUser);
                return;
            }
        }
    } catch (e) {
        console.error("Auth check failed:", e);
    }
    currentUser = null;
    renderNavLoggedOut();
}

function renderNavLoggedIn(user) {
    const container = document.getElementById("nav-auth-container");
    const initials = user.display_name ? user.display_name.charAt(0).toUpperCase() : "U";
    
    container.innerHTML = `
        <div class="user-profile-badge">
            <div class="avatar-circle" style="background-color: ${user.avatar_color || '#00E676'};">
                ${initials}
            </div>
            <div class="user-details">
                <span class="user-name">${escapeHtml(user.display_name)}</span>
                <span class="user-val">${formatGBP(user.portfolio_value)}</span>
            </div>
        </div>
        <button class="btn btn-secondary" onclick="openUpdateModal()">Update Balance</button>
        <button class="btn btn-outline" onclick="openApiDocsModal()">API Key</button>
        <button class="btn btn-icon" title="Log Out" onclick="handleLogout()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
        </button>
    `;
}

function renderNavLoggedOut() {
    const container = document.getElementById("nav-auth-container");
    container.innerHTML = `
        <button class="btn btn-secondary" onclick="openModal('login-modal')">Log In</button>
        <button class="btn btn-primary" onclick="openModal('register-modal')">Join Arena</button>
    `;
}

// --- Login / Register Handlers ---
async function handleLogin(e) {
    e.preventDefault();
    const errorEl = document.getElementById("login-error");
    errorEl.style.display = "none";

    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    const rememberMe = document.getElementById("login-remember") ? document.getElementById("login-remember").checked : true;

    try {
        const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password, remember_me: rememberMe })
        });
        const data = await res.json();
        if (!res.ok) {
            errorEl.textContent = data.detail || "Login failed.";
            errorEl.style.display = "block";
            return;
        }

        closeModal("login-modal");
        await checkAuth();
        fetchLeaderboardData(true);
    } catch (err) {
        errorEl.textContent = "Network error. Please try again.";
        errorEl.style.display = "block";
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const errorEl = document.getElementById("register-error");
    errorEl.style.display = "none";

    const display_name = document.getElementById("reg-name").value.trim();
    const username = document.getElementById("reg-username").value.trim();
    const password = document.getElementById("reg-password").value;
    const mustard_email = document.getElementById("reg-email").value.trim();

    try {
        const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ display_name, username, password, mustard_email })
        });
        const data = await res.json();
        if (!res.ok) {
            errorEl.textContent = data.detail || "Registration failed.";
            errorEl.style.display = "block";
            return;
        }

        closeModal("register-modal");
        await checkAuth();
        fetchLeaderboardData(true);
    } catch (err) {
        errorEl.textContent = "Network error. Please try again.";
        errorEl.style.display = "block";
    }
}

async function handleLogout() {
    try {
        await fetch("/api/auth/logout", { method: "POST" });
        currentUser = null;
        renderNavLoggedOut();
        fetchLeaderboardData(true);
    } catch (e) {
        console.error("Logout failed:", e);
    }
}

// --- Update Stats Modal Handlers ---
function openUpdateModal() {
    if (!currentUser) {
        openModal("login-modal");
        return;
    }
    document.getElementById("upd-portfolio").value = currentUser.portfolio_value || "";
    document.getElementById("upd-cash").value = currentUser.available_cash || "";
    document.getElementById("upd-today-profit").value = currentUser.today_profit_gbp || "";
    document.getElementById("upd-trades").value = currentUser.today_trades_count || 0;
    document.getElementById("upd-holding").value = currentUser.active_holding || "100% Cash";
    document.getElementById("upd-bot-running").checked = currentUser.is_bot_running === 1;
    
    openModal("update-balance-modal");
}

async function handleUpdateStats(e) {
    e.preventDefault();
    const errorEl = document.getElementById("update-error");
    errorEl.style.display = "none";

    const payload = {
        portfolio_value: parseFloat(document.getElementById("upd-portfolio").value) || 0.0,
        available_cash: parseFloat(document.getElementById("upd-cash").value) || 0.0,
        today_profit_gbp: parseFloat(document.getElementById("upd-today-profit").value) || 0.0,
        today_trades_count: parseInt(document.getElementById("upd-trades").value) || 0,
        active_holding: document.getElementById("upd-holding").value.trim() || "100% Cash",
        is_bot_running: document.getElementById("upd-bot-running").checked
    };

    try {
        const res = await fetch("/api/user/update-stats", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
            errorEl.textContent = data.detail || "Failed to update stats.";
            errorEl.style.display = "block";
            return;
        }

        closeModal("update-balance-modal");
        await checkAuth();
        fetchLeaderboardData(true);
    } catch (err) {
        errorEl.textContent = "Network error. Please try again.";
        errorEl.style.display = "block";
    }
}

// --- API Key & Webhook Guide Modal ---
function openApiDocsModal() {
    const keySection = document.getElementById("api-key-section");
    const snippetCode = document.getElementById("python-snippet");
    const origin = window.location.origin;

    if (currentUser && currentUser.api_key) {
        keySection.innerHTML = `
            <label style="font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; display: block;">Your Secret Bot API Key</label>
            <div class="api-key-box">
                <span class="api-key-text" id="live-api-key">${currentUser.api_key}</span>
                <button class="btn btn-secondary" onclick="copyApiKey()" style="padding: 6px 12px; font-size: 12px;">Copy Key</button>
            </div>
        `;
        snippetCode.textContent = `import requests

ARENA_URL = "${origin}/api/submit-stats"
API_KEY = "${currentUser.api_key}"

def report_stats(portfolio_val, cash, today_profit, trades_count, holding, is_running):
    try:
        requests.post(
            f"{ARENA_URL}",
            headers={"X-API-Key": API_KEY},
            json={
                "portfolio_value": portfolio_val,
                "available_cash": cash,
                "today_profit_gbp": today_profit,
                "today_trades_count": trades_count,
                "active_holding": holding,
                "is_bot_running": is_running
            },
            timeout=5
        )
    except Exception as e:
        print("Arena sync error:", e)`;
    } else {
        keySection.innerHTML = `
            <div style="background: rgba(255, 193, 7, 0.08); border: 1px solid rgba(255, 193, 7, 0.25); padding: 14px; border-radius: 8px; margin-bottom: 18px; text-align: center;">
                <p style="color: var(--mustard-gold); font-size: 13px; font-weight: 600;">
                    Please <a href="#" onclick="switchModal('api-modal', 'login-modal')" style="color: #fff; text-decoration: underline;">log in</a> or <a href="#" onclick="switchModal('api-modal', 'register-modal')" style="color: #fff; text-decoration: underline;">register</a> to view your personal bot API key.
                </p>
            </div>
        `;
        snippetCode.textContent = `import requests

ARENA_URL = "${origin}/api/submit-stats"
API_KEY = "LOG_IN_TO_VIEW_YOUR_KEY"

def report_stats(portfolio_val, cash, today_profit, trades_count, holding, is_running):
    try:
        requests.post(
            f"{ARENA_URL}",
            headers={"X-API-Key": API_KEY},
            json={
                "portfolio_value": portfolio_val,
                "available_cash": cash,
                "today_profit_gbp": today_profit,
                "today_trades_count": trades_count,
                "active_holding": holding,
                "is_bot_running": is_running
            },
            timeout=5
        )
    except Exception as e:
        print("Arena sync error:", e)`;
    }

    openModal("api-modal");
}

function copyApiKey() {
    const key = document.getElementById("live-api-key").textContent;
    navigator.clipboard.writeText(key).then(() => {
        alert("API Key copied to clipboard!");
    });
}

function copySnippet() {
    const text = document.getElementById("python-snippet").textContent;
    navigator.clipboard.writeText(text).then(() => {
        alert("Python snippet copied to clipboard!");
    });
}

// --- Modal Utilities ---
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add("open");
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove("open");
}

function switchModal(fromId, toId) {
    closeModal(fromId);
    setTimeout(() => openModal(toId), 150);
}

// --- Formatters & Sanitizers ---
function formatGBP(val) {
    const num = parseFloat(val) || 0;
    return `£${num.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTimeAgo(dateString) {
    if (!dateString) return "just now";
    try {
        const date = new Date(dateString.replace(" ", "T") + "Z");
        const now = new Date();
        const diffSec = Math.floor((now - date) / 1000);
        
        if (diffSec < 15) return "just now";
        if (diffSec < 60) return `${diffSec}s ago`;
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHour = Math.floor(diffMin / 60);
        if (diffHour < 24) return `${diffHour}h ago`;
        return `${Math.floor(diffHour / 24)}d ago`;
    } catch {
        return "recently";
    }
}

function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
