// FCM HTTP v1 sender — pure Web Crypto (Cloudflare Workers compatible).
// Uses the service account JSON to mint a short-lived OAuth2 access token
// via the JWT bearer flow, then POSTs to fcm.googleapis.com/v1/.../messages:send.

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
};

let cachedToken: { token: string; expiresAt: number } | null = null;
let cachedSa: ServiceAccount | null = null;

function loadServiceAccount(): ServiceAccount {
  if (cachedSa) return cachedSa;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON not set");
  const sa = JSON.parse(raw) as ServiceAccount;
  cachedSa = sa;
  return sa;
}

function b64url(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") bytes = new TextEncoder().encode(input);
  else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
  else bytes = input;
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.token;

  const sa = loadServiceAccount();
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: sa.token_uri ?? "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const toSign = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(toSign));
  const jwt = `${toSign}.${b64url(sig)}`;

  const res = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FCM token exchange failed [${res.status}]: ${text}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: now + data.expires_in };
  return data.access_token;
}

export type PushPayload = {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  url?: string;
};

export type PushSendResult = { ok: true; messageId: string } | { ok: false; error: string; status?: number };

export async function sendFcmMessage(payload: PushPayload): Promise<PushSendResult> {
  const sa = loadServiceAccount();
  const accessToken = await getAccessToken();

  const message = {
    message: {
      token: payload.token,
      notification: { title: payload.title, body: payload.body },
      data: {
        ...(payload.data ?? {}),
        ...(payload.url ? { url: payload.url } : {}),
      },
      webpush: {
        fcm_options: payload.url ? { link: payload.url } : undefined,
        notification: { icon: "/favicon.ico" },
      },
    },
  };

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text, status: res.status };
  }
  const data = (await res.json()) as { name?: string };
  return { ok: true, messageId: data.name ?? "" };
}
