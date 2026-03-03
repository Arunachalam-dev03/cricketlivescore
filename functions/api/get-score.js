import { json } from "./_utils.js";

const KV_KEY = "score:state";

export async function onRequestGet(context) {
  const { env, request } = context;
  const cached = await env.SCORE_KV.get(KV_KEY, "json");
  if (cached) return json(cached, 200);

  try {
    const fallback = await env.ASSETS.fetch(new URL("/data.json", request.url));
    if (fallback.ok) {
      const data = await fallback.json();
      return json(data, 200);
    }
  } catch {
    // ignore and fallback to default
  }

  return json({ activeMatchId: null, matches: {}, history: [], updatedAt: new Date().toISOString() }, 200);
}
