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
        const isStaticHost = window.location.hostname.includes("github.io") || window.location.protocol === "file:";
        
        if (!isStaticHost) {
            const endpoint = currentTab === "all-time" 
                ? "/api/leaderboard/all-time" 
                : "/api/leaderboard/today";
            
            const [lbRes, summaryRes] = await Promise.all([
                fetch(endpoint),
                fetch("/api/stats/summary")
            ]);

            if (lbRes.ok && summaryRes.ok) {
                const data = await lbRes.json();
                leaderboardData = data.leaderboard || [];
                renderTable(leaderboardData);
                const summary = await summaryRes.json();
                renderKPIs(summary);
                return;
            }
        }
        
        // Static GitHub Pages / JSON Fallback
        await fetchStaticLeaderboard();
    } catch (err) {
        console.warn("API unavailable, using static/local leaderboard:", err);
        await fetchStaticLeaderboard();
    } finally {
        if (isManual && btn) {
            setTimeout(() => { btn.style.transform = "none"; }, 300);
            refreshCountdown = 10;
        }
    }
}

async function fetchStaticLeaderboard() {
    try {
        let list = [];
        try {
            const res = await fetch("data/leaderboard.json");
            if (res.ok) {
                const data = await res.json();
                if (data && data.leaderboard && data.leaderboard.length > 0) {
                    list = data.leaderboard;
                }
            }
        } catch (e) {}
        
        // Only show users who have actually registered / logged in
        const localTraders = JSON.parse(localStorage.getItem("mustard_local_traders") || "[]");
        if (localTraders.length > 0) {
            localTraders.forEach(trader => {
                const existingIdx = list.findIndex(x => x.username === trader.username);
                if (existingIdx >= 0) {
                    list[existingIdx] = { ...list[existingIdx], ...trader };
                } else {
                    list.push(trader);
                }
            });
        }

        // Also merge current user if logged in
        if (currentUser) {
            const myIdx = list.findIndex(x => x.username === currentUser.username);
            if (myIdx >= 0) {
                list[myIdx] = { ...list[myIdx], ...currentUser };
            } else {
                list.push({
                    user_id: currentUser.id || Date.now(),
                    username: currentUser.username,
                    display_name: currentUser.display_name,
                    avatar_color: currentUser.avatar_color || "#FFC107",
                    portfolio_value: currentUser.portfolio_value || 10000.0,
                    available_cash: currentUser.available_cash || 0.0,
                    today_profit_gbp: currentUser.today_profit_gbp || 0.0,
                    today_profit_pct: currentUser.today_profit_pct || 0.0,
                    today_trades_count: currentUser.today_trades_count || 0,
                    active_holding: currentUser.active_holding || "100% Cash",
                    last_updated: currentUser.last_updated || new Date().toISOString()
                });
            }
        }

        // Sort based on current tab
        if (currentTab === "all-time") {
            list.sort((a, b) => (b.portfolio_value || 0) - (a.portfolio_value || 0));
        } else {
            list.sort((a, b) => (b.today_profit_gbp || 0) - (a.today_profit_gbp || 0));
        }

        leaderboardData = list;
        renderTable(leaderboardData);

        // Compute summary metrics
        const totalWealth = list.reduce((acc, curr) => acc + (curr.portfolio_value || 0), 0);
        const totalProfit = list.reduce((acc, curr) => acc + (curr.today_profit_gbp || 0), 0);
        const totalTrades = list.reduce((acc, curr) => acc + (curr.today_trades_count || 0), 0);
        
        const sortedWealth = [...list].sort((a, b) => (b.portfolio_value || 0) - (a.portfolio_value || 0));
        const sortedToday = [...list].sort((a, b) => (b.today_profit_gbp || 0) - (a.today_profit_gbp || 0));

        renderKPIs({
            total_wealth: totalWealth,
            total_today_profit: totalProfit,
            total_trades: totalTrades,
            active_traders: list.length,
            top_wealth: sortedWealth[0],
            top_today: sortedToday[0]
        });
    } catch (e) {
        console.error("Static leaderboard failed to load:", e);
    }
}

// --- Render KPI Summary Cards ---
function renderKPIs(summary) {
    if (!summary) return;

    // 1. All-time leader
    if (summary.top_wealth) {
        document.getElementById("kpi-leader-val").textContent = formatGBP(summary.top_wealth.portfolio_value);
        document.getElementById("kpi-leader-name").textContent = `${summary.top_wealth.display_name}`;
    } else {
        document.getElementById("kpi-leader-val").textContent = "£0.00";
        document.getElementById("kpi-leader-name").textContent = "No leader yet";
    }

    // 2. Today's top earner
    if (summary.top_today) {
        const prof = summary.top_today.today_profit_gbp;
        const sign = prof >= 0 ? "+" : "-";
        document.getElementById("kpi-today-val").textContent = `${sign}£${Math.abs(prof).toLocaleString('en-GB', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        document.getElementById("kpi-today-name").textContent = `${summary.top_today.display_name} (${(summary.top_today.today_profit_pct || 0).toFixed(2)}%)`;
    } else {
        document.getElementById("kpi-today-val").textContent = "£0.00";
        document.getElementById("kpi-today-name").textContent = "No profits yet";
    }

    // 3. Group wealth
    document.getElementById("kpi-group-wealth").textContent = formatGBP(summary.total_wealth || 0);
    document.getElementById("kpi-trader-count").textContent = `${summary.active_traders || 0} registered traders`;

    // 4. Total trades
    const tradesValEl = document.getElementById("kpi-total-trades-val");
    if (tradesValEl) tradesValEl.textContent = `${summary.total_trades || 0}`;
}

// --- Dedicated Ranking & Sorting Helper ---
function sortLeaderboardList(list) {
    if (!list || !Array.isArray(list)) return;
    if (currentTab === "all-time") {
        // Sort strictly in order of who has the MOST TOTAL MONEY
        list.sort((a, b) => (parseFloat(b.portfolio_value) || 0) - (parseFloat(a.portfolio_value) || 0));
    } else {
        // Sort strictly in order of who MADE THE MOST MONEY TODAY
        list.sort((a, b) => (parseFloat(b.today_profit_gbp) || 0) - (parseFloat(a.today_profit_gbp) || 0));
    }
}

// --- Render Table ---
function renderTable(data) {
    const tbody = document.getElementById("leaderboard-body");
    
    // Header visual cues
    const thWealth = document.getElementById("th-wealth");
    const thProfit = document.getElementById("th-profit");
    if (thWealth && thProfit) {
        if (currentTab === "all-time") {
            thWealth.style.color = "var(--mustard-gold)";
            thWealth.style.borderBottom = "2px solid var(--mustard-gold)";
            thProfit.style.color = "var(--text-muted)";
            thProfit.style.borderBottom = "none";
        } else {
            thWealth.style.color = "var(--text-muted)";
            thWealth.style.borderBottom = "none";
            thProfit.style.color = "var(--neon-green)";
            thProfit.style.borderBottom = "2px solid var(--neon-green)";
        }
    }

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading-cell" style="text-align: center; padding: 48px 20px;">
            <div style="font-size: 32px; margin-bottom: 8px;">👑</div>
            <div style="font-weight: 700; color: #fff; margin-bottom: 4px;">No traders registered yet!</div>
            <div style="color: var(--text-secondary); font-size: 13px;">Click <strong>"Join Arena"</strong> above to register your account and appear on the leaderboard.</div>
        </td></tr>`;
        return;
    }

    // Always ensure the data is properly sorted for the active tab
    sortLeaderboardList(data);

    tbody.innerHTML = data.map((item, index) => {
        const rank = index + 1;
        const isCurrent = currentUser && (currentUser.id === item.user_id || currentUser.email === item.email || currentUser.username === item.username);
        
        let rankHtml = `<span class="rank-badge rank-other">#${rank}</span>`;
        if (rank === 1) rankHtml = `<span class="rank-badge rank-1">👑 1</span>`;
        else if (rank === 2) rankHtml = `<span class="rank-badge rank-2">🥈 2</span>`;
        else if (rank === 3) rankHtml = `<span class="rank-badge rank-3">🥉 3</span>`;

        const profitGbp = parseFloat(item.today_profit_gbp) || 0;
        const profitPct = parseFloat(item.today_profit_pct) || 0;
        const profitClass = profitGbp >= 0 ? "text-green" : "text-red";
        const profitSign = profitGbp >= 0 ? "+" : "-";
        const profitStr = `${profitSign}£${Math.abs(profitGbp).toLocaleString('en-GB', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

        // Column 3 is ALWAYS Total Wealth
        const totalWealthHtml = `<div class="mono-val val-large ${currentTab === 'all-time' ? 'text-gold' : ''}" style="${currentTab === 'all-time' ? 'font-weight: 800;' : 'opacity: 0.85;'}">${formatGBP(item.portfolio_value)}</div>`;

        // Column 4 is ALWAYS Today's Profit
        const todayProfitHtml = `<div class="mono-val val-large ${profitClass}" style="${currentTab === 'today' ? 'font-weight: 800;' : ''}">${profitStr} <span class="sub-pct">(${profitPct.toFixed(2)}%)</span></div>`;

        const avatarColor = item.avatar_color || "#00E676";
        const initials = item.display_name ? item.display_name.charAt(0).toUpperCase() : "M";
        const syncTimeStr = formatTimeAgo(item.last_updated);

        return `
            <tr class="${isCurrent ? 'user-row' : ''}" id="trader-row-${item.user_id}">
                <td class="text-center">${rankHtml}</td>
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
                            <span class="trader-username">${escapeHtml(item.email || item.username || '')}</span>
                        </div>
                    </div>
                </td>
                <td class="text-right">${totalWealthHtml}</td>
                <td class="text-right">${todayProfitHtml}</td>
                <td class="text-center">
                    <span class="tag-quota">${item.today_trades_count || 0} / 50</span>
                </td>
                <td>
                    <span class="tag-holding">${escapeHtml(item.active_holding || '100% Cash')}</span>
                </td>
                <td class="text-right">
                    <span class="sync-time">${syncTimeStr}</span>
                </td>
            </tr>
        `;
    }).join("");
}

// --- Tab Switching (Instantaneous Re-ranking) ---
function switchTab(tab) {
    if (currentTab === tab) return;
    currentTab = tab;
    
    document.getElementById("tab-all-time").classList.toggle("active", tab === "all-time");
    document.getElementById("tab-today").classList.toggle("active", tab === "today");
    
    // Instantly sort rows in order of the chosen tab!
    sortLeaderboardList(leaderboardData);
    renderTable(leaderboardData);

    const isStaticHost = window.location.hostname.includes("github.io") || window.location.protocol === "file:";
    if (!isStaticHost) {
        fetchLeaderboardData(true);
    }
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
        const isStaticHost = window.location.hostname.includes("github.io") || window.location.protocol === "file:";
        if (!isStaticHost) {
            const res = await fetch("/api/user/me");
            if (res.ok) {
                const data = await res.json();
                if (data.authenticated && data.user) {
                    currentUser = data.user;
                    renderNavLoggedIn(currentUser);
                    return;
                }
            }
        }
    } catch (e) {
        // Fall back to local cookie / storage
    }

    // Check localStorage / cookie for session
    const storedUser = localStorage.getItem("mustard_current_user");
    if (storedUser) {
        try {
            currentUser = JSON.parse(storedUser);
            renderNavLoggedIn(currentUser);
            return;
        } catch {}
    }

    currentUser = null;
    renderNavLoggedOut();
}

function renderNavLoggedIn(user) {
    const container = document.getElementById("nav-auth-container");
    const initials = user.display_name ? user.display_name.charAt(0).toUpperCase() : "M";
    
    container.innerHTML = `
        <div class="user-profile-badge" onclick="openEditNameModal()" style="cursor: pointer;" title="Click to change your display name">
            <div class="avatar-circle" style="background-color: ${user.avatar_color || '#00E676'};">
                ${initials}
            </div>
            <div class="user-details">
                <span class="user-name">${escapeHtml(user.display_name)} ✏️</span>
                <span class="user-val">${formatGBP(user.portfolio_value)}</span>
            </div>
        </div>
        <button class="btn btn-secondary" onclick="openUpdateModal()">Update Balance</button>
        <button class="btn btn-outline" onclick="openEditNameModal()">Edit Name</button>
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

// --- Login / Register Handlers (Mustard Email & Password) ---
async function handleLogin(e) {
    e.preventDefault();
    const errorEl = document.getElementById("login-error");
    errorEl.style.display = "none";

    const email = document.getElementById("login-email").value.trim().toLowerCase();
    const password = document.getElementById("login-password").value;
    const rememberMe = document.getElementById("login-remember") ? document.getElementById("login-remember").checked : true;

    try {
        const isStaticHost = window.location.hostname.includes("github.io") || window.location.protocol === "file:";
        if (!isStaticHost) {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: email, password, remember_me: rememberMe })
            });
            const data = await res.json();
            if (res.ok) {
                closeModal("login-modal");
                await checkAuth();
                fetchLeaderboardData(true);
                return;
            }
        }
    } catch (err) {
        // Fallback to client-side auth for GitHub Pages
    }

    // Client-side authentication fallback for GitHub Pages
    const localTraders = JSON.parse(localStorage.getItem("mustard_local_traders") || "[]");
    let found = localTraders.find(u => u.email === email || u.username === email);
    
    if (!found) {
        errorEl.textContent = "Account not found with this email. Click 'Set up your display name' below to get started!";
        errorEl.style.display = "block";
        return;
    }

    currentUser = found;
    localStorage.setItem("mustard_current_user", JSON.stringify(currentUser));
    if (rememberMe) {
        document.cookie = `session_user=${encodeURIComponent(email)}; max-age=${30 * 86400}; path=/; SameSite=Lax`;
    }

    closeModal("login-modal");
    renderNavLoggedIn(currentUser);
    fetchLeaderboardData(true);
}

async function handleRegister(e) {
    e.preventDefault();
    const errorEl = document.getElementById("register-error");
    errorEl.style.display = "none";

    const email = document.getElementById("reg-email").value.trim().toLowerCase();
    const display_name = document.getElementById("reg-name").value.trim();
    const password = document.getElementById("reg-password").value;

    try {
        const isStaticHost = window.location.hostname.includes("github.io") || window.location.protocol === "file:";
        if (!isStaticHost) {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ display_name, username: email, password, mustard_email: email })
            });
            const data = await res.json();
            if (res.ok) {
                closeModal("register-modal");
                await checkAuth();
                fetchLeaderboardData(true);
                return;
            }
        }
    } catch (err) {
        // Fallback to client-side registration for GitHub Pages
    }

    // Client-side registration for GitHub Pages
    const palette = ["#00E676", "#FFC107", "#00D2FF", "#FF5252", "#E040FB", "#FF9100", "#7C4DFF"];
    const avatarColor = palette[Math.floor(Math.random() * palette.length)];
    
    const newUser = {
        id: Date.now(),
        email: email,
        username: email,
        display_name: display_name,
        avatar_color: avatarColor,
        portfolio_value: 10000.0,
        available_cash: 10000.0,
        today_profit_gbp: 0.0,
        today_profit_pct: 0.0,
        today_trades_count: 0,
        active_holding: "100% Cash",
        last_updated: new Date().toISOString()
    };

    const localTraders = JSON.parse(localStorage.getItem("mustard_local_traders") || "[]");
    const existingIdx = localTraders.findIndex(u => u.email === email);
    if (existingIdx >= 0) {
        localTraders[existingIdx] = { ...localTraders[existingIdx], ...newUser };
    } else {
        localTraders.push(newUser);
    }
    localStorage.setItem("mustard_local_traders", JSON.stringify(localTraders));
    
    currentUser = newUser;
    localStorage.setItem("mustard_current_user", JSON.stringify(currentUser));
    document.cookie = `session_user=${encodeURIComponent(email)}; max-age=${30 * 86400}; path=/; SameSite=Lax`;

    closeModal("register-modal");
    renderNavLoggedIn(currentUser);
    fetchLeaderboardData(true);
}

// --- Change Display Name Handlers ---
function openEditNameModal() {
    if (!currentUser) {
        openModal("login-modal");
        return;
    }
    const input = document.getElementById("edit-new-name");
    if (input) input.value = currentUser.display_name || "";
    const errorEl = document.getElementById("edit-name-error");
    if (errorEl) errorEl.style.display = "none";
    openModal("edit-name-modal");
}

async function handleSaveDisplayName(e) {
    e.preventDefault();
    const errorEl = document.getElementById("edit-name-error");
    if (errorEl) errorEl.style.display = "none";

    const newName = document.getElementById("edit-new-name").value.trim();
    if (!newName) {
        if (errorEl) {
            errorEl.textContent = "Please enter a valid display name.";
            errorEl.style.display = "block";
        }
        return;
    }

    if (currentUser) {
        currentUser.display_name = newName;
        localStorage.setItem("mustard_current_user", JSON.stringify(currentUser));

        const localTraders = JSON.parse(localStorage.getItem("mustard_local_traders") || "[]");
        const idx = localTraders.findIndex(u => u.email === currentUser.email || u.username === currentUser.username);
        if (idx >= 0) {
            localTraders[idx].display_name = newName;
            localStorage.setItem("mustard_local_traders", JSON.stringify(localTraders));
        }
    }

    closeModal("edit-name-modal");
    if (currentUser) renderNavLoggedIn(currentUser);
    fetchLeaderboardData(true);
}

async function handleLogout() {
    try {
        await fetch("/api/auth/logout", { method: "POST" });
    } catch (e) {}
    currentUser = null;
    localStorage.removeItem("mustard_current_user");
    document.cookie = "session_user=; max-age=0; path=/;";
    renderNavLoggedOut();
    fetchLeaderboardData(true);
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
        active_holding: document.getElementById("upd-holding").value.trim() || "100% Cash"
    };

    try {
        const isStaticHost = window.location.hostname.includes("github.io") || window.location.protocol === "file:";
        if (!isStaticHost) {
            const res = await fetch("/api/user/update-stats", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                closeModal("update-balance-modal");
                await checkAuth();
                fetchLeaderboardData(true);
                return;
            }
        }
    } catch (err) {}

    // Update in memory & localStorage for GitHub Pages
    if (currentUser) {
        currentUser = {
            ...currentUser,
            ...payload,
            today_profit_pct: ((payload.today_profit_gbp / 10000.0) * 100.0),
            last_updated: new Date().toISOString()
        };
        localStorage.setItem("mustard_current_user", JSON.stringify(currentUser));

        const localTraders = JSON.parse(localStorage.getItem("mustard_local_traders") || "[]");
        const idx = localTraders.findIndex(u => u.email === currentUser.email || u.username === currentUser.username);
        if (idx >= 0) {
            localTraders[idx] = currentUser;
        } else {
            localTraders.push(currentUser);
        }
        localStorage.setItem("mustard_local_traders", JSON.stringify(localTraders));
    }

    closeModal("update-balance-modal");
    renderNavLoggedIn(currentUser);
    fetchLeaderboardData(true);
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
        let date = new Date(dateString);
        if (isNaN(date.getTime())) {
            date = new Date(dateString.replace(" ", "T"));
        }
        if (isNaN(date.getTime())) return "just now";
        
        const now = new Date();
        const diffSec = Math.floor((now - date) / 1000);
        
        if (diffSec < 15 || isNaN(diffSec) || diffSec < 0) return "just now";
        if (diffSec < 60) return `${diffSec}s ago`;
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHour = Math.floor(diffMin / 60);
        if (diffHour < 24) return `${diffHour}h ago`;
        return `${Math.floor(diffHour / 24)}d ago`;
    } catch {
        return "just now";
    }
}

function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
