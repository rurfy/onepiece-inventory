import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { dhash, fetchImageBuffer } from "@/lib/phash";
import { CATALOG_USER_AGENT } from "@/lib/catalog-source";

export const maxDuration = 300;

if (getApps().length === 0) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccount) {
    initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
  } else {
    initializeApp();
  }
}

const adminDb = getFirestore();
const INDEX_DOC_PATH = "indexes/phash";

async function assertAuthorized(request: NextRequest): Promise<NextResponse | null> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  const unauth = await assertAuthorized(request);
  if (unauth) return unauth;

  const body = await request.json().catch(() => ({}));
  const limit: number = typeof body.limit === "number" ? body.limit : 500;
  const force: boolean = body.force === true;
  const delayMs: number = typeof body.delayMs === "number" ? body.delayMs : 100;

  const started = Date.now();
  const now = Math.floor(started / 1000);

  const snap = await adminDb.collection("prints").get();

  const targets: { printId: string; imageUrl: string }[] = [];
  for (const doc of snap.docs) {
    if (targets.length >= limit) break;
    const data = doc.data();
    if (!data.image_url) continue;
    if (!force && typeof data.phash === "string" && data.phash.length === 64) continue;
    targets.push({ printId: doc.id, imageUrl: data.image_url });
  }

  const hashes = new Map<string, string>();
  const errors: { printId: string; error: string }[] = [];

  for (const { printId, imageUrl } of targets) {
    try {
      const img = await fetchImageBuffer(imageUrl, CATALOG_USER_AGENT);
      const h = await dhash(img);
      hashes.set(printId, h);
    } catch (err) {
      errors.push({ printId, error: err instanceof Error ? err.message : String(err) });
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  // Write computed hashes back to each print doc (batched).
  const BATCH_LIMIT = 400;
  const entries = [...hashes.entries()];
  for (let i = 0; i < entries.length; i += BATCH_LIMIT) {
    const chunk = entries.slice(i, i + BATCH_LIMIT);
    const batch = adminDb.batch();
    for (const [printId, h] of chunk) {
      batch.set(
        adminDb.collection("prints").doc(printId),
        { phash: h, phashAt: now },
        { merge: true }
      );
    }
    await batch.commit();
  }

  // Maintain the consolidated lookup index used at scan time. Merge new
  // entries into whatever's already there so partial backfill runs
  // accumulate into a complete index.
  if (hashes.size > 0) {
    const patch: Record<string, unknown> = { updatedAt: now };
    for (const [printId, h] of hashes) {
      patch[`entries.${printId}`] = h;
    }
    await adminDb.doc(INDEX_DOC_PATH).set(patch, { merge: true });
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - started,
    scanned: snap.size,
    targeted: targets.length,
    hashed: hashes.size,
    errors,
    remaining_estimate: snap.docs.filter((d) => {
      const v = d.data();
      return v.image_url && (force || typeof v.phash !== "string");
    }).length - hashes.size,
  });
}

export async function GET(request: NextRequest) {
  const unauth = await assertAuthorized(request);
  if (unauth) return unauth;

  const snap = await adminDb.collection("prints").get();
  let total = 0;
  let hashed = 0;
  for (const d of snap.docs) {
    total++;
    if (typeof d.data().phash === "string") hashed++;
  }

  return NextResponse.json({
    status: "ok",
    total_prints: total,
    hashed,
    unhashed: total - hashed,
    usage: "POST with optional { limit: 500, force: false, delayMs: 100 } to hash a slice of prints.",
  });
}

// Suppress unused-import warning if FieldValue isn't referenced.
void FieldValue;
