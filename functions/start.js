export async function onRequestPost(context) {
    const { env, request } = context;

    try {
        // 验证环境变量
        const required = ['GITHUB_OWNER', 'GITHUB_REPO', 'WORKFLOW_FILE', 'GITHUB_TOKEN'];
        const missing = required.filter(key => !env[key]);
        if (missing.length > 0) {
            return json({ ok: false, error: "Service unavailable" }, 503);
        }

        // 检查网关是否已在线
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

        // 检查是否有正在运行的工作流
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