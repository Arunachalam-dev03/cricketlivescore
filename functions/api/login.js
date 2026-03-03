import { json, signToken, checkRateLimit } from "./_utils.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";

  if (!env.ADMIN_PASSWORD || !env.ADMIN_TOKEN_SECRET) {
    return json({ error: "Server auth variables missing" }, 500);
  }

  const rateOk = await checkRateLimit(env, `login:${ip}`, 20, 60);
  if (!rateOk) return json({ error: "Rate limit exceeded" }, 429);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const password = body?.password;
  if (!password || password !== env.ADMIN_PASSWORD) {
    return json({ error: "Unauthorized" }, 401);
  }

  const payload = {
    role: "admin",
    exp: Date.now() + (8 * 60 * 60 * 1000)
  };

  const token = await signToken(payload, env.ADMIN_TOKEN_SECRET);
  return json({ token, expiresInHours: 8 }, 200);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}
