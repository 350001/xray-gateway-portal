// ============================================
// 配置
// ============================================
const API_URL = "/api/gateway.json";
const START_URL = "/start";
const MAX_POLL = 30;
const POLL_INTERVAL = 5000;

// ============================================
// 状态
// ============================================
const state = {
    gateway: null,
    timer: null,
    polling: false,
    pollTimer: null,
    attempts: 0,
    expired: false
};

const $ = id => document.getElementById(id);

const ui = {
    statusIcon: $("statusIcon"),
    statusText: $("statusText"),
    actionButton: $("actionButton"),
    user: $("user"),
    password: $("password"),
    path: $("path"),
    countdown: $("countdown"),
    qrcode: $("qrcode"),
    timerLabel: document.querySelector(".timer span:first-child")
};

// ============================================
// UI
// ============================================
function updateUI() {
    const ready = !!state.gateway;
    const waiting = state.polling;
    const btn = ui.actionButton;

    if (ready) {
        ui.statusIcon.textContent = "🟢";
    } else if (waiting) {
        ui.statusIcon.textContent = "🟡";
        ui.statusText.textContent = `Waiting... (${state.attempts}/${MAX_POLL})`;
    } else {
        ui.statusIcon.textContent = "🔴";
        ui.statusText.textContent = state.expired ? "Expired" : "Unavailable";
    }

    if (ready) {
        btn.textContent = "Copy Config";
        btn.onclick = copyConfig;
        btn.disabled = false;
    } else if (waiting) {
        btn.textContent = "Starting...";
        btn.disabled = true;
    } else {
        btn.textContent = "Connect";
        btn.onclick = start;
        btn.disabled = false;
    }

    const d = state.gateway || {};
    ui.user.textContent = d.user || "-";
    ui.password.textContent = d.password || "-";
    ui.path.textContent = d.path || "-";

    if (ready) {
        ui.timerLabel.textContent = "Expires in:";
        ui.countdown.style.color = "#60a5fa";
    } else {
        ui.timerLabel.textContent = "Status:";
        ui.countdown.textContent = "--";
        ui.countdown.style.color = "#94a3b8";
    }

    renderQR(ready ? d.link : null);
}

// ============================================
// QR
// ============================================
let placeholderHTML = null;
let currentQR = null;

function renderQR(link) {
    if (currentQR === link) return;
    currentQR = link;

    if (!link) {
        if (placeholderHTML) {
            ui.qrcode.innerHTML = placeholderHTML;
            return;
        }

        ui.qrcode.innerHTML = "";
        new QRCode(ui.qrcode, { text: "unavailable", width: 220, height: 220 });

        const el = ui.qrcode.querySelector("img") || ui.qrcode.querySelector("canvas");
        if (el) {
            el.style.filter = "blur(6px)";
            el.style.opacity = "0.7";
        }

        placeholderHTML = ui.qrcode.innerHTML;
        return;
    }

    ui.qrcode.innerHTML = "";
    new QRCode(ui.qrcode, { text: link, width: 220, height: 220 });
}

// ============================================
// Gateway
// ============================================
async function loadGateway() {
    try {
        const res = await fetch(API_URL, { cache: "no-store" });
        if (!res.ok) throw new Error();

        const data = await res.json();

        if (!data.link || !Number.isFinite(Number(data.expire_timestamp)))
            throw new Error();

        if (Number(data.expire_timestamp) * 1000 <= Date.now())
            throw new Error();

        state.gateway = data;
        state.expired = false;

        startTimer(Number(data.expire_timestamp));
        updateUI();
        return true;

    } catch {
        state.gateway = null;
        state.expired = false;

        clearInterval(state.timer);
        state.timer = null;

        ui.countdown.textContent = "--";
        updateUI();
        return false;
    }
}

function startTimer(expireTimestamp) {
    clearInterval(state.timer);
    const expire = expireTimestamp * 1000;

    state.timer = setInterval(() => {
        const remain = expire - Date.now();

        if (remain <= 0) {
            clearInterval(state.timer);
            state.timer = null;
            state.gateway = null;
            state.expired = true;
            updateUI();
            ui.countdown.textContent = "Expired";
            ui.countdown.style.color = "#ef4444";
            ui.statusText.textContent = "Expired";
            return;
        }

        const m = Math.floor(remain / 60000);
        const s = Math.floor((remain % 60000) / 1000);
        const text = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;

        ui.countdown.textContent = text;
        ui.statusText.textContent = text;
    }, 1000);
}

async function copyConfig() {
    if (!state.gateway) return;

    try {
        await navigator.clipboard.writeText(state.gateway.link);
        ui.statusText.textContent = "✅ Copied!";
    } catch {
        ui.statusText.textContent = "❌ Copy failed";
    }

    setTimeout(updateUI, 2000);
}

async function start() {
    if (state.polling) return;

    state.gateway = null;
    state.expired = false;
    state.attempts = 0;
    updateUI();

    try {
        const res = await fetch(START_URL, { method: "POST" });
        if (!res.ok) throw new Error();

        state.polling = true;
        poll();

    } catch {
        ui.statusText.textContent = "❌ Start failed";
        setTimeout(updateUI, 3000);
    }
}

async function poll() {
    state.attempts++;
    updateUI();

    if (state.attempts > MAX_POLL) {
        state.polling = false;
        state.pollTimer = null;
        ui.statusText.textContent = "❌ Timeout";
        setTimeout(updateUI, 3000);
        return;
    }

    if (await loadGateway()) {
        state.polling = false;
        state.pollTimer = null;
        updateUI();
        return;
    }

    state.pollTimer = setTimeout(poll, POLL_INTERVAL);
}

loadGateway();