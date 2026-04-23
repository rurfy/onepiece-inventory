import { initializeApp, getApps, cert, App } from "firebase-admin/app";

/**
 * Parse a Firebase service-account JSON string that may have had its
 * `\n` escape sequences decoded into raw newlines by a dotenv loader
 * (Next dev does this; Vercel prod does not). We rewrite raw newlines
 * back into `\n` escapes, but only inside JSON string literals, so the
 * result is valid JSON regardless of how the env var was provided.
 */
function parseServiceAccount(raw: string): Record<string, unknown> {
  // Fast path — strict JSON works (production).
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // fall through to the forgiving parser
  }

  let inString = false;
  let escaped = false;
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (escaped) {
      out += c;
      escaped = false;
      continue;
    }
    if (c === "\\" && inString) {
      out += c;
      escaped = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      out += c;
      continue;
    }
    if (inString && (c === "\n" || c === "\r")) {
      out += "\\n";
      continue;
    }
    out += c;
  }
  return JSON.parse(out) as Record<string, unknown>;
}

export function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    return initializeApp({ credential: cert(parseServiceAccount(raw)) });
  }
  // Last resort — Google ADC (works on GCP, not on Vercel without a key).
  return initializeApp();
}
