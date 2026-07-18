const API_URL = "/api/gateway.json";
const START_URL = "/start";
const MAX_POLL = 30;
const POLL_INTERVAL = 5000;

const state = { gateway: null, timer: null, pollingTimer: null, attempts: 0, expired: false };
const $ = id => document.getElementById(id);
const timerLabel = document.querySelector('.timer span:first-child');
const countdownEl = $("countdown");
const qrBox = $("qrcode");

function updateUI() {
    const isReady = !!state.gateway && !state.expired;
    const isWaiting = !!state.pollingTimer;
    const btn = $("actionButton");

    if (isReady) {
        $("statusIcon").textContent = "🟢";
        $("statusText").textContent = "Active";
    } else if (isWaiting) {
        $("statusIcon").textContent = "🟡";
        $("statusText").textContent = `Waiting... (${state.attempts}/${MAX_POLL})`;
    } else {
        $("statusIcon").textContent = "🔴";
        $("statusText").textContent = state.expired ? "Expired" : "Unavailable";
    }

    if (isReady) {
        btn.textContent = "Copy Config";
        btn.onclick = copyConfig;
        btn.disabled = false;
    } else if (isWaiting) {
        btn.textContent = "Starting...";
        btn.disabled = true;
    } else {
        btn.textContent = "Connect";
        btn.onclick = start;
        btn.disabled = false;
    }

    const data = state.gateway || {};
    ["user", "password", "path"].forEach(k => $(k).textContent = data[k] || "-");

    if (isReady) {
        timerLabel.textContent = "Expires in:";
        countdownEl.style.color = "#60a5fa";
    } else {
        timerLabel.textContent = "Status:";
        countdownEl.textContent = state.expired ? "Expired" : "--";
        countdownEl.style.color = state.expired ? "#ef4444" : "#94a3b8";
    }

    renderQR();
}

function renderQR() {
    const isReady = !!state.gateway && !state.expired;

    if (isReady) {
        if (!qrBox.querySelector('canvas')) {
            qrBox.innerHTML = "";
            new QRCode(qrBox, { text: state.gateway.link, width: 220, height: 220 });
        }
        qrBox.classList.add('active');
    } else {
        qrBox.classList.remove('active');
    }
}

async function loadGateway() {
    try {
        const res = await fetch(API_URL, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (data.expire_timestamp * 1000 <= Date.now()) throw new Error();
        state.gateway = data;
        state.expired = false;
        startTimer(data.expire_timestamp);
        updateUI();
        toast("✅ Gateway ready");
        return true;
    } catch {
        state.gateway = null;
        state.expired = false;
        clearInterval(state.timer);
        state.timer = null;
        countdownEl.textContent = "--";
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
            state.expired = true;
            updateUI();
            toast("⏳ Gateway expired");
            return;
        }
        const m = Math.floor(remain / 60000);
        const s = Math.floor((remain % 60000) / 1000);
        const text = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
        countdownEl.textContent = text;
    }, 1000);
}

async function copyConfig() {
    if (!state.gateway || state.expired) return;
    try {
        await navigator.clipboard.writeText(state.gateway.link);
        toast("✅ Copied");
    } catch {
        toast("❌ Copy failed");
    }
}

async function start() {
    if (state.pollingTimer) return;
    clearInterval(state.timer);
    state.timer = null;
    clearTimeout(state.pollingTimer);
    state.pollingTimer = null;

    state.attempts = 0;
    state.gateway = null;
    state.expired = false;
    updateUI();
    toast("⏳ Starting gateway...");

    try {
        const res = await fetch(START_URL, { method: "POST" });
        if (!res.ok) throw new Error();
        startPolling();
    } catch {
        toast("❌ Start failed");
        $("statusText").textContent = "❌ Start failed";
        setTimeout(() => updateUI(), 3000);
    }
}

function startPolling() {
    clearTimeout(state.pollingTimer);
    state.pollingTimer = null;
    poll();
}

async function poll() {
    state.attempts++;
    if (state.attempts > MAX_POLL) {
        state.pollingTimer = null;
        toast("❌ Timeout");
        $("statusText").textContent = "❌ Timeout";
        setTimeout(() => updateUI(), 3000);
        return;
    }
    const ok = await loadGateway();
    if (ok) {
        state.pollingTimer = null;
        toast("✅ Gateway started successfully");
        return;
    }
    state.pollingTimer = setTimeout(poll, POLL_INTERVAL);
    updateUI();
}

function toast(msg) {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    const div = document.createElement("div");
    div.className = "toast";
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

function cleanup() {
    clearInterval(state.timer);
    clearTimeout(state.pollingTimer);
}

loadGateway();
window.addEventListener('beforeunload', cleanup);