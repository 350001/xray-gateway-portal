const API_URL = "/api/gateway.json";
const START_URL = "/start";
const MAX_POLL = 30;
const POLL_INTERVAL = 5000;

const state = { gateway: null, timer: null, pollingTimer: null, attempts: 0 };
const $ = id => document.getElementById(id);
const countdownEl = $("countdown");
const qrBox = $("qrcode");

function initQR() {
    new QRCode(qrBox, { text: "unavailable", width: 220, height: 220 });
}

function updateUI() {
    const isReady = !!state.gateway;
    const isWaiting = !!state.pollingTimer;
    const sticon = $("statusIcon");
    const sttext = $("statusText");
    const timerLabel = $("timerLabel");
    const btn = $("actionButton");
    const link = state.gateway?.link || "N/A";

    $("config-link").textContent = link;

    if (isReady) {
        sticon.textContent = "🟢";
        sttext.textContent = "Active";
        qrBox.classList.add("active");
        timerLabel.textContent = "Expires in:";
        countdownEl.style.color = "#60a5fa";
        btn.textContent = "Copy Config";
        btn.onclick = copyConfig;
        btn.disabled = false;
        return;
    }

    qrBox.classList.remove("active");
    timerLabel.textContent = "Status:";
    countdownEl.textContent = "--";
    countdownEl.style.color = "#94a3b8";

    if (isWaiting) {
        sticon.textContent = "🟡";
        sttext.textContent = `Waiting... (${state.attempts}/${MAX_POLL})`;
        btn.textContent = "Starting...";
        btn.disabled = true;
    } else {
        sticon.textContent = "🔴";
        sttext.textContent = "Unavailable";
        btn.textContent = "Connect";
        btn.onclick = start;
        btn.disabled = false;
    }
}

async function loadGateway() {
    try {
        const res = await fetch(API_URL, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (data.expire_timestamp * 1000 <= Date.now()) throw new Error();
				if (data.link) {data.link = atob(data.link);}
        state.gateway = data;
        qrBox.innerHTML = "";
        new QRCode(qrBox, { text: data.link, width: 220, height: 220 });
        startTimer(data.expire_timestamp);
        updateUI();
        toast("✅ Gateway ready");
        return true;
    } catch {
        state.gateway = null;
        clearInterval(state.timer);
        state.timer = null;
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
            updateUI();
            toast("⏳ Gateway expired");
            return;
        }
        const m = Math.floor(remain / 60000);
        const s = Math.floor((remain % 60000) / 1000);
        const text = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
        countdownEl.textContent = text;
        if (state.gateway) {
            countdownEl.style.color = "#60a5fa";
        }
    }, 1000);
}

async function copyConfig() {
    if (!state.gateway) return;
    try {
        await navigator.clipboard.writeText(state.gateway.link);
        toast("✅ Copied");
    } catch {
        toast("❌ Copy failed");
    }
}

async function start() {
    if (state.pollingTimer || btn.disabled) return;
    btn.disabled = true;
    clearInterval(state.timer);
    state.timer = null;
    clearTimeout(state.pollingTimer);
    state.pollingTimer = null;

    state.attempts = 0;
    state.gateway = null;
    updateUI();
    toast("⏳ Starting gateway...");

    try {
        const res = await fetch(START_URL, { method: "POST" });
        if (res.status === 200 || res.status === 409) {
            startPolling();
        } else {
            throw new Error(`HTTP ${res.status}`);
        }
    } catch {
			  btn.disabled = false;
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
    const old = document.querySelector(".toast");
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

initQR();
loadGateway();
window.addEventListener("beforeunload", cleanup);