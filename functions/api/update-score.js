import { json, verifyToken, checkRateLimit } from "./_utils.js";

const KV_KEY = "score:state";

function validState(body) {
  return body && typeof body === "object" && typeof body.matches === "object" && Array.isArray(body.history);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.ADMIN_TOKEN_SECRET) {
    return json({ error: "Missing ADMIN_TOKEN_SECRET" }, 500);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rateOk = await checkRateLimit(env, `update:${ip}`, 120, 60);
  if (!rateOk) return json({ error: "Rate limit exceeded" }, 429);

  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const payload = await verifyToken(token, env.ADMIN_TOKEN_SECRET);
  if (!payload || payload.role !== "admin") {
    return json({ error: "Unauthorized" }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!validState(body)) {
    return json({ error: "Invalid score payload" }, 400);
  }

  body.updatedAt = new Date().toISOString();
  await env.SCORE_KV.put(KV_KEY, JSON.stringify(body));
  return json({ success: true, updatedAt: body.updatedAt }, 200);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}
