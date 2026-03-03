export async function signToken(payload, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const payloadJson = JSON.stringify(payload);
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadJson));
  const sig = base64Url(sigBuffer);
  return `${btoa(payloadJson)}.${sig}`;
}

export async function verifyToken(token, secret) {
  try {
    const [payloadB64, sig] = (token || "").split(".");
    if (!payloadB64 || !sig) return null;

    const payloadJson = atob(payloadB64);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToArrayBuffer(sig),
      new TextEncoder().encode(payloadJson)
    );

    if (!ok) return null;
    const payload = JSON.parse(payloadJson);
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

export async function checkRateLimit(env, keyPrefix, limit = 30, windowSec = 60) {
  const nowBucket = Math.floor(Date.now() / (windowSec * 1000));
  const key = `${keyPrefix}:${nowBucket}`;
  const countRaw = await env.SCORE_KV.get(key);
  const count = Number(countRaw || 0) + 1;
  await env.SCORE_KV.put(key, String(count), { expirationTtl: windowSec + 2 });
  return count <= limit;
}

function base64Url(buffer) {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToArrayBuffer(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((base64url.length + 3) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
