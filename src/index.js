export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // 因为配置已限定只有 /start 会进入，此处可不再判断路径，但保留双重保险
    if (url.pathname === '/start' && request.method === 'POST') {
      return handleStart(request, env);
    }
    // 其他路径按理不会进入，但为了安全，返回 404
    return new Response('Not Found', { status: 404 });
  }
};

async function handleStart(request, env) {
  try {
    const required = ['GITHUB_OWNER', 'GITHUB_REPO', 'WORKFLOW_FILE', 'GITHUB_TOKEN'];
    const missing = required.filter(key => !env[key]);
    if (missing.length > 0) {
      return json({ ok: false, error: "Service unavailable" }, 503);
    }

    // 检查网关是否已在线（读取同域静态文件）
    const origin = new URL(request.url).origin;
    let gatewayOnline = false;
    try {
      const res = await fetch(`${origin}/api/gateway.json`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data?.expire_timestamp > Math.floor(Date.now() / 1000)) {
          gatewayOnline = true;
        }
      }
    } catch {}

    if (gatewayOnline) {
      return json({ ok: false, error: "Service already running" }, 409);
    }

    // 检查 GitHub Actions 工作流状态
    const runsUrl =
      `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/${env.WORKFLOW_FILE}/runs?event=workflow_dispatch&per_page=1`;
    const runsRes = await fetch(runsUrl, {
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
        "User-Agent": "xray-gateway"
      }
    });
    if (!runsRes.ok) {
      return json({ ok: false, error: "Service unavailable" }, 503);
    }
    const runs = await runsRes.json();
    const latest = runs.workflow_runs?.[0];
    if (latest && (latest.status === "queued" || latest.status === "in_progress")) {
      return json({ ok: false, error: "Service is starting" }, 409);
    }

    // 触发工作流
    const dispatchRes = await fetch(
      `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/${env.WORKFLOW_FILE}/dispatches`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
          "Accept": "application/vnd.github+json",
          "User-Agent": "xray-gateway"
        },
        body: JSON.stringify({ ref: env.GITHUB_BRANCH || "main" })
      }
    );
    if (!dispatchRes.ok) {
      return json({ ok: false, error: "Service unavailable" }, 500);
    }

    return json({ ok: true, status: "starting", message: "Service is starting" });

  } catch (e) {
    console.error("Start error:", e);
    return json({ ok: false, error: "Service unavailable" }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*"
    }
  });
}