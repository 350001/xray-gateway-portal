// functions/api/gateway.json.js
// 提供网关配置，可从环境变量或 KV 读取

export async function onRequestGet(context) {
    const { env } = context;

    // 从环境变量获取配置（也可改为从 KV 读取）
    const user = env.GATEWAY_USER || "default-user";
    const password = env.GATEWAY_PASSWORD || "default-pass";
    const path = env.GATEWAY_PATH || "/default-path";
    const link = env.GATEWAY_LINK || "vmess://default";
    const expireOffset = parseInt(env.GATEWAY_EXPIRE_OFFSET) || 3600;
    const expire_timestamp = Math.floor(0 / 1000) + expireOffset;

    const config = {
        user,
        password,
        path,
        link,
        expire_timestamp
    };

    return new Response(JSON.stringify(config), {
        headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "access-control-allow-origin": "*"
        }
    });
}
