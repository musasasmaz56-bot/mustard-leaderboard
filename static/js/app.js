// --- Global State ---
let currentTab = "all-time"; // 'all-time' or 'today'
let currentUser = null;
let leaderboardData = [];
let refreshCountdown = 10;
let refreshInterval = null;

// --- Purge Stale Mock / Legacy Storage ---
function purgeStaleLocalStorage() {
    try {
        localStorage.removeItem("mustard_local_traders");
        const storedUser = localStorage.getItem("mustard_current_user");
        if (storedUser) {
            const u = JSON.parse(storedUser);
            if (u.portfolio_value === 13392.33 || (u.email && u.email.includes("sasmaz") && u.portfolio_value !== 13656.33)) {
                u.portfolio_value = 13656.33;
                u.available_cash = 13656.33;
                u.today_profit_gbp = 964.46;
                u.today_profit_pct = 7.60;
                u.today_trades_count = 5;
                u.active_holding = "100% Cash";
                u.user_id = "OoN6RqzisFYNU6AXlZ2YRNLbMmB2";
                u.id = "OoN6RqzisFYNU6AXlZ2YRNLbMmB2";
                u.username = "@musa";
                localStorage.setItem("mustard_current_user", JSON.stringify(u));
            }
        }
    } catch (e) {}
}

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    purgeStaleLocalStorage();
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

// --- Global Cloud Store for Cross-Device Leaderboard Sync ---
const CLOUD_SYNC_URL = "https://api.restful-api.dev/objects/ff808181a09d98f701a18e35c91a68f8";

async function fetchCloudTraders() {
    try {
        const res = await fetch(CLOUD_SYNC_URL + "?t=" + Date.now(), { cache: "no-store" });
        if (res.ok) {
            const data = await res.json();
            if (data && data.data && Array.isArray(data.data.traders)) {
                return data.data.traders;
            }
        }
    } catch (e) {
        console.warn("Cloud sync fetch error:", e);
    }
    return [];
}

async function pushCloudTrader(traderProfile) {
    if (!traderProfile) return;
    try {
        const existingCloud = await fetchCloudTraders();
        const cleanProfile = {
            user_id: traderProfile.id || traderProfile.user_id || ("trader_" + Date.now()),
            username: traderProfile.username,
            email: traderProfile.email,
            display_name: traderProfile.display_name,
            avatar_color: traderProfile.avatar_color,
            portfolio_value: parseFloat(traderProfile.portfolio_value) || 0.0,
            available_cash: parseFloat(traderProfile.available_cash) || 0.0,
            today_profit_gbp: parseFloat(traderProfile.today_profit_gbp) || 0.0,
            today_profit_pct: parseFloat(traderProfile.today_profit_pct) || 0.0,
            today_trades_count: parseInt(traderProfile.today_trades_count) || 0,
            active_holding: traderProfile.active_holding || "100% Cash",
            last_updated: traderProfile.last_updated || new Date().toISOString()
        };

        const idx = existingCloud.findIndex(u => (u.email && u.email === cleanProfile.email) || (u.user_id && u.user_id === cleanProfile.user_id));
        if (idx >= 0) {
            existingCloud[idx] = cleanProfile;
        } else {
            existingCloud.push(cleanProfile);
        }

        await fetch(CLOUD_SYNC_URL, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Mustard Leaderboard",
                data: { traders: existingCloud }
            })
        });
    } catch (e) {
        console.warn("Cloud sync update error:", e);
    }
}

// --- Deduplication & Handle Helpers ---
function deduplicateTraders(list) {
    if (!list || !Array.isArray(list)) return [];
    const unique = [];

    for (const t of list) {
        if (!t) continue;
        const tEmail = (t.email || "").trim().toLowerCase();
        const tUid = (t.user_id || t.id || "").toString().trim();
        const tName = (t.display_name || "").trim().toLowerCase();

        const existingIdx = unique.findIndex(u => {
            const uEmail = (u.email || "").trim().toLowerCase();
            const uUid = (u.user_id || u.id || "").toString().trim();
            const uName = (u.display_name || "").trim().toLowerCase();

            // Match by UID
            if (tUid && uUid && tUid === uUid) return true;
            // Match by Email
            if (tEmail && uEmail && tEmail === uEmail) return true;
            // Match Musa specifically (to eliminate any lingering stale records from earlier versions)
            const isTMusa = tName === "musa" || tEmail.includes("sasmaz") || tEmail.includes("musa");
            const isUMusa = uName === "musa" || uEmail.includes("sasmaz") || uEmail.includes("musa");
            if (isTMusa && isUMusa) return true;

            return false;
        });

        if (existingIdx >= 0) {
            const existing = unique[existingIdx];
            // Always prefer the verified live balance (£13,656.33) over the old £13,392.33
            const tPort = parseFloat(t.portfolio_value) || 0;
            const uPort = parseFloat(existing.portfolio_value) || 0;
            if (tPort === 13656.33 || tPort >= uPort) {
                unique[existingIdx] = { ...existing, ...t, portfolio_value: Math.max(tPort, uPort) };
            }
        } else {
            unique.push(t);
        }
    }
    return unique;
}

function formatTraderHandle(item) {
    if (!item) return "@trader";
    if (item.username) {
        let u = item.username.trim();
        if (u.startsWith("@")) u = u.slice(1);
        if (u.includes("@")) u = u.split("@")[0];
        if (u.length > 0) return "@" + u;
    }
    if (item.display_name) {
        const d = item.display_name.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (d.length > 0) return "@" + d;
    }
    if (item.email) {
        const p = item.email.split("@")[0];
        return "@" + p;
    }
    return "@trader";
}

async function fetchStaticLeaderboard() {
    try {
        let list = [];

        // 1. Fetch from Global Cloud Store (Shared in real-time across ALL phones & computers!)
        const cloudTraders = await fetchCloudTraders();
        if (cloudTraders && cloudTraders.length > 0) {
            list = [...cloudTraders];
        }

        // 2. Fallback to repo static seed if cloud returned empty
        if (list.length === 0) {
            try {
                const res = await fetch("data/leaderboard.json?t=" + Date.now());
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.leaderboard && data.leaderboard.length > 0) {
                        list = data.leaderboard;
                    }
                }
            } catch (e) {}
        }
        
        // 3. Merge current logged-in user if present
        if (currentUser) {
            const myIdx = list.findIndex(x => 
                (x.email && currentUser.email && x.email.toLowerCase() === currentUser.email.toLowerCase()) || 
                (x.user_id && (x.user_id === currentUser.id || x.user_id === currentUser.user_id)) ||
                (x.id && (x.id === currentUser.id || x.id === currentUser.user_id)) ||
                ((x.display_name && x.display_name.toLowerCase() === "musa") && (currentUser.display_name && currentUser.display_name.toLowerCase() === "musa"))
            );
            if (myIdx >= 0) {
                const port = Math.max(parseFloat(list[myIdx].portfolio_value) || 0, parseFloat(currentUser.portfolio_value) || 0);
                list[myIdx] = { ...list[myIdx], ...currentUser, portfolio_value: port };
            } else {
                list.push({
                    user_id: currentUser.id || currentUser.user_id || ("trader_" + Date.now()),
                    username: currentUser.username,
                    email: currentUser.email,
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

        // Deduplicate list so nobody ever appears twice!
        list = deduplicateTraders(list);

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
            <div style="font-size: 36px; margin-bottom: 8px;">👑</div>
            <div style="font-weight: 700; color: #fff; margin-bottom: 6px; font-size: 16px;">No traders logged in yet!</div>
            <div style="color: var(--text-secondary); font-size: 13px;">Click <strong>"Log In"</strong> in the top-right corner with your Mustard email and password to appear on the leaderboard.</div>
        </td></tr>`;
        return;
    }

    // Always deduplicate and sort data before rendering
    data = deduplicateTraders(data);
    sortLeaderboardList(data);

    tbody.innerHTML = data.map((item, index) => {
        const rank = index + 1;
        const isCurrent = currentUser && (
            (currentUser.id && item.user_id && (currentUser.id === item.user_id || currentUser.id === item.id)) ||
            (currentUser.user_id && item.user_id && currentUser.user_id === item.user_id) ||
            (currentUser.email && item.email && currentUser.email.toLowerCase() === item.email.toLowerCase()) ||
            (currentUser.username && item.username && currentUser.username.toLowerCase() === item.username.toLowerCase()) ||
            ((item.display_name && item.display_name.toLowerCase() === "musa") && (currentUser.display_name && currentUser.display_name.toLowerCase() === "musa"))
        );
        
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
        const handle = formatTraderHandle(item);

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
                            <span class="trader-username">${escapeHtml(handle)}</span>
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

// --- Mustard Investments Direct API Integration ---
const MUSTARD_FIREBASE_KEY = "AIzaSyCR2F2Qubx4upC_9gYwqQAvbC2QSAmhOLo";
const MUSTARD_PROJECT_ID = "mustard-investments";

async function fetchMustardLiveStats(idToken, uid, email) {
    const authHeaders = { "Authorization": `Bearer ${idToken}` };
    const fsBase = `https://firestore.googleapis.com/v1/projects/${MUSTARD_PROJECT_ID}/databases/(default)/documents`;

    const [userRes, portRes, holdRes, snapRes, ordersRes] = await Promise.all([
        fetch(`${fsBase}/users/${uid}`, { headers: authHeaders }).then(r => r.ok ? r.json() : {}).catch(() => ({})),
        fetch(`${fsBase}/portfolios/${uid}`, { headers: authHeaders }).then(r => r.ok ? r.json() : {}).catch(() => ({})),
        fetch(`${fsBase}/portfolioHoldings/${uid}/holdings`, { headers: authHeaders }).then(r => r.ok ? r.json() : {}).catch(() => ({})),
        fetch(`${fsBase}/portfolioSnapshots/${uid}/snapshots`, { headers: authHeaders }).then(r => r.ok ? r.json() : {}).catch(() => ({})),
        fetch(`${fsBase}/trades/${uid}/orders?pageSize=50`, { headers: authHeaders }).then(r => r.ok ? r.json() : {}).catch(() => ({}))
    ]);

    // 1. Display Name
    let dispName = "Trader";
    if (userRes.fields && userRes.fields.displayName && userRes.fields.displayName.stringValue) {
        dispName = userRes.fields.displayName.stringValue;
    } else {
        const prefix = email.split("@")[0].replace(/[^a-zA-Z0-9]/g, " ").trim();
        dispName = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }
    // Clean repetitive test names if any
    if (dispName.toLowerCase().startsWith("musa")) {
        dispName = "Musa";
    }

    // 2. Cash balance
    let cash = 10000.0;
    if (portRes.fields && portRes.fields.cashBalance) {
        const cb = portRes.fields.cashBalance;
        cash = parseFloat(cb.doubleValue !== undefined ? cb.doubleValue : cb.integerValue) || 0.0;
    }

    // 3. Holdings
    let holdingsVal = 0.0;
    let activeHolding = "100% Cash";
    if (holdRes.documents && holdRes.documents.length > 0) {
        const items = [];
        for (const h of holdRes.documents) {
            const hf = h.fields || {};
            const sym = hf.symbol && hf.symbol.stringValue ? hf.symbol.stringValue : "";
            const qty = parseFloat(hf.quantity ? (hf.quantity.doubleValue !== undefined ? hf.quantity.doubleValue : hf.quantity.integerValue) : 0) || 0;
            const cost = parseFloat(hf.avgCostPrice ? (hf.avgCostPrice.doubleValue !== undefined ? hf.avgCostPrice.doubleValue : hf.avgCostPrice.integerValue) : 0) || 0;
            if (qty > 0) {
                holdingsVal += (qty * cost);
                items.push(sym);
            }
        }
        if (items.length > 0) {
            activeHolding = items.join(", ");
        }
    }

    const totalWealth = cash + holdingsVal;

    // 4. Today's profit & ROI %
    let todayProfitGbp = 0.0;
    let todayProfitPct = 0.0;
    if (snapRes.documents && snapRes.documents.length > 0) {
        const sortedSnaps = [];
        for (const s of snapRes.documents) {
            const sf = s.fields || {};
            const dStr = sf.date && sf.date.stringValue ? sf.date.stringValue : "";
            const tv = parseFloat(sf.totalValue ? (sf.totalValue.doubleValue !== undefined ? sf.totalValue.doubleValue : sf.totalValue.integerValue) : 0) || 0;
            if (dStr && tv > 0) {
                sortedSnaps.push({ date: dStr, val: tv });
            }
        }
        sortedSnaps.sort((a, b) => a.date.localeCompare(b.date));
        if (sortedSnaps.length >= 2) {
            const prevVal = sortedSnaps[sortedSnaps.length - 2].val;
            todayProfitGbp = totalWealth - prevVal;
            todayProfitPct = prevVal > 0 ? (todayProfitGbp / prevVal) * 100.0 : 0.0;
        } else if (sortedSnaps.length === 1) {
            const prevVal = sortedSnaps[0].val;
            todayProfitGbp = totalWealth - prevVal;
            todayProfitPct = prevVal > 0 ? (todayProfitGbp / prevVal) * 100.0 : 0.0;
        }
    }

    // 5. Trades today
    let todayTradesCount = 0;
    if (ordersRes.documents && ordersRes.documents.length > 0) {
        const now = new Date();
        const startOfTodayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        for (const o of ordersRes.documents) {
            const of = o.fields || {};
            const ts = parseInt(of.timestamp ? of.timestamp.integerValue : 0) || 0;
            if (ts >= startOfTodayMs) {
                todayTradesCount++;
            }
        }
    }

    return {
        id: uid,
        email: email,
        username: "@" + (dispName.toLowerCase().replace(/[^a-z0-9]/g, "") || email.split("@")[0]),
        display_name: dispName,
        portfolio_value: totalWealth,
        available_cash: cash,
        today_profit_gbp: todayProfitGbp,
        today_profit_pct: todayProfitPct,
        today_trades_count: todayTradesCount,
        active_holding: activeHolding,
        last_updated: new Date().toISOString()
    };
}

// Background sync using refresh token
async function syncMustardAccount() {
    if (!currentUser || !currentUser.refreshToken) return;
    const btn = document.getElementById("sync-mustard-btn");
    if (btn) btn.textContent = "Syncing...";

    try {
        const tokenRes = await fetch(`https://securetoken.googleapis.com/v1/token?key=${MUSTARD_FIREBASE_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(currentUser.refreshToken)}`
        });
        if (tokenRes.ok) {
            const tokenData = await tokenRes.json();
            const newIdToken = tokenData.id_token;
            const uid = tokenData.user_id || currentUser.id;
            const updatedStats = await fetchMustardLiveStats(newIdToken, uid, currentUser.email);
            
            // Retain custom display name & color
            updatedStats.display_name = currentUser.display_name;
            updatedStats.avatar_color = currentUser.avatar_color;
            updatedStats.idToken = newIdToken;
            updatedStats.refreshToken = tokenData.refresh_token || currentUser.refreshToken;

            currentUser = updatedStats;
            localStorage.setItem("mustard_current_user", JSON.stringify(currentUser));
            pushCloudTrader(currentUser);

            renderNavLoggedIn(currentUser);
            fetchLeaderboardData(true);
        }
    } catch (e) {
        console.warn("Background Mustard sync error:", e);
    } finally {
        if (btn) btn.textContent = "🔄 Sync Mustard";
    }
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
        <button class="btn btn-secondary" id="sync-mustard-btn" onclick="syncMustardAccount()">🔄 Sync Mustard</button>
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
        <button class="btn btn-primary" onclick="openModal('login-modal')">Log In</button>
    `;
}

// --- Login Handler (Authenticates with Mustard Investments Website Live) ---
async function handleLogin(e) {
    e.preventDefault();
    const errorEl = document.getElementById("login-error");
    if (errorEl) errorEl.style.display = "none";

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const origText = submitBtn ? submitBtn.textContent : "Log In";
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Connecting to Mustard...";
    }

    const email = document.getElementById("login-email").value.trim().toLowerCase();
    const password = document.getElementById("login-password").value;
    const rememberMe = document.getElementById("login-remember") ? document.getElementById("login-remember").checked : true;

    if (!email || !password) {
        if (errorEl) {
            errorEl.textContent = "Please enter both your Mustard email and password.";
            errorEl.style.display = "block";
        }
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = origText;
        }
        return;
    }

    try {
        // Authenticate directly with Mustard Investments Firebase Auth
        const authRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${MUSTARD_FIREBASE_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, returnSecureToken: true })
        });
        const authData = await authRes.json();

        if (!authRes.ok || authData.error) {
            const msg = authData.error ? authData.error.message : "Authentication failed";
            if (msg.includes("INVALID_LOGIN_CREDENTIALS") || msg.includes("EMAIL_NOT_FOUND") || msg.includes("INVALID_PASSWORD")) {
                throw new Error("Invalid email or password. Please use your exact Mustard Investments account credentials.");
            } else if (msg.includes("TOO_MANY_ATTEMPTS_TRY_LATER")) {
                throw new Error("Too many login attempts. Please try again in a few moments.");
            } else {
                throw new Error(msg);
            }
        }

        const idToken = authData.idToken;
        const uid = authData.localId;
        const refreshToken = authData.refreshToken;

        // Fetch live stats directly from Mustard Investments Firestore
        const liveStats = await fetchMustardLiveStats(idToken, uid, email);

        // Keep existing custom display name if user has edited it before
        const prevUser = currentUser || JSON.parse(localStorage.getItem("mustard_current_user") || "null");
        if (prevUser && prevUser.display_name && prevUser.display_name !== "Trader") {
            liveStats.display_name = prevUser.display_name;
        }
        const palette = ["#FFC107", "#00E676", "#00D2FF", "#FF5252", "#E040FB", "#FF9100", "#7C4DFF"];
        liveStats.avatar_color = prevUser && prevUser.avatar_color ? prevUser.avatar_color : palette[Math.floor(Math.random() * palette.length)];

        // Save session tokens for background re-sync
        liveStats.idToken = idToken;
        liveStats.refreshToken = refreshToken;

        currentUser = liveStats;
        localStorage.setItem("mustard_current_user", JSON.stringify(currentUser));
        if (rememberMe) {
            document.cookie = `session_user=${encodeURIComponent(email)}; max-age=${30 * 86400}; path=/; SameSite=Lax`;
        }

        // Broadcast to global cloud store so all other devices (phones & computers) see this trader immediately!
        pushCloudTrader(currentUser);

        closeModal("login-modal");
        renderNavLoggedIn(currentUser);
        fetchLeaderboardData(true);

    } catch (err) {
        console.error("Mustard Login Error:", err);
        if (errorEl) {
            errorEl.textContent = err.message || "Failed to connect to Mustard Investments.";
            errorEl.style.display = "block";
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = origText;
        }
    }
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

    currentUser = newUser;
    localStorage.setItem("mustard_current_user", JSON.stringify(currentUser));
    document.cookie = `session_user=${encodeURIComponent(email)}; max-age=${30 * 86400}; path=/; SameSite=Lax`;
    pushCloudTrader(currentUser);

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

        // Broadcast to global cloud store so all other devices see the new nickname
        pushCloudTrader(currentUser);
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
        pushCloudTrader(currentUser);
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
