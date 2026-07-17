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
    gateway: null,           // 网关配置数据
    timer: null,             // 倒计时定时器
    polling: null,           // 轮询定时器
    attempts: 0,             // 轮询尝试次数
    countdownText: "--",     // 倒计时显示文本（统一由updateUI更新）
    expired: false           // 是否已过期（用于显示"Expired"）
};

const $ = id => document.getElementById(id);

// ============================================
// 统一更新所有界面
// ============================================
function updateUI() {
    const isReady = !!state.gateway;
    const isWaiting = !!state.polling;
    const btn = $("actionButton");

    // 1. 状态图标和文字
    if (isReady) {
        $("statusIcon").textContent = "🟢";
        $("statusText").textContent = "Active";
    } else if (isWaiting) {
        $("statusIcon").textContent = "🟡";
        $("statusText").textContent = `Waiting... (${state.attempts}/${MAX_POLL})`;
    } else {
        $("statusIcon").textContent = "🔴";
        $("statusText").textContent = "Unavailable";
    }

    // 2. 按钮
    if (isReady) {
        btn.textContent = "Copy";
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

    // 3. 信息栏（统一根据 gateway 更新）
    if (state.gateway) {
        $("user").textContent = state.gateway.user || "-";
        $("password").textContent = state.gateway.password || "-";
        $("path").textContent = state.gateway.path || "-";
    } else {
        $("user").textContent = "-";
        $("password").textContent = "-";
        $("path").textContent = "-";
    }

    // 4. 倒计时显示（统一由这里控制）
    if (state.expired) {
        state.countdownText = "Expired";
    } else if (!state.gateway) {
        state.countdownText = "--";
    }
    $("countdown").textContent = state.countdownText;

    // 5. 二维码
    renderQR(isReady ? state.gateway.link : null);
}

// ============================================
// 渲染二维码
// ============================================
function renderQR(link) {
    const box = $("qrcode");
    box.innerHTML = "";
    if (!link) {
        new QRCode(box, { text: "unavailable", width: 220, height: 220 });
        const el = box.querySelector('img') || box.querySelector('canvas');
        if (el) { el.style.filter = 'blur(6px)'; el.style.opacity = '0.7'; }
        return;
    }
    new QRCode(box, { text: link, width: 220, height: 220 });
}

// ============================================
// 加载网关配置
// ============================================
async function loadGateway() {
    try {
        const res = await fetch(API_URL, { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        if (data.expire_timestamp * 1000 <= Date.now()) throw new Error("Expired");

        state.gateway = data;
        state.expired = false;
        startTimer(data.expire_timestamp);
        updateUI();
        return true;
    } catch (err) {
        console.warn("Load gateway failed:", err.message);
        state.gateway = null;
        state.expired = false;
        updateUI();
        return false;
    }
}

// ============================================
// 倒计时（更新 countdownText + 调用 updateUI）
// ============================================
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
            setTimeout(loadGateway, 5000);
            return;
        }
        // 正常更新倒计时文本
        const m = Math.floor(remain / 60000);
        const s = Math.floor((remain % 60000) / 1000);
        state.countdownText = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
        $("countdown").textContent = state.countdownText; // 仅更新倒计时，不触发整体重绘
    }, 1000);
}

// ============================================
// 复制配置
// ============================================
async function copyConfig() {
    if (!state.gateway) {
        toast("No configuration");
        return;
    }
    try {
        await navigator.clipboard.writeText(state.gateway.link);
        toast("✅ Copied");
    } catch {
        toast("❌ Copy failed");
    }
}

// ============================================
// 启动网关
// ============================================
async function start() {
    if (state.polling) return;
    state.attempts = 0;
    state.gateway = null;
    state.expired = false;
    updateUI();

    try {
        const res = await fetch(START_URL, { method: "POST" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        toast("⏳ Starting...");
        startPolling();
    } catch (err) {
        console.warn("Start failed:", err.message);
        toast("❌ Start failed");
        updateUI();
    }
}

// ============================================
// 轮询等待网关就绪
// ============================================
function startPolling() {
    clearInterval(state.polling);
    state.polling = setInterval(async () => {
        state.attempts++;
        if (state.attempts > MAX_POLL) {
            clearInterval(state.polling);
            state.polling = null;
            toast("❌ Timeout");
            updateUI();
            return;
        }
        const ok = await loadGateway();
        if (ok) {
            clearInterval(state.polling);
            state.polling = null;
            toast("✅ Ready");
            updateUI();
            return;
        }
        updateUI(); // 更新等待进度
    }, POLL_INTERVAL);
}

// ============================================
// Toast 提示
// ============================================
function toast(msg) {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    const div = document.createElement("div");
    div.className = "toast";
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

// ============================================
// 清理
// ============================================
function cleanup() {
    clearInterval(state.timer);
    clearInterval(state.polling);
}

// ============================================
// 初始化
// ============================================
loadGateway();
window.addEventListener('beforeunload', cleanup);