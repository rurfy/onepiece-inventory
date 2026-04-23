import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldPath } from "firebase-admin/firestore";
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

interface IndexDoc {
  entries?: Record<string, string>;
  cursor?: string | null;
  complete?: boolean;
  updatedAt?: number;
}

/**
 * Paginated backfill — each call reads only `limit` prints starting from the
 * cursor stored in the index doc, hashes those that don't yet have a `phash`,
 * writes both the per-print field and the consolidated lookup index.
 *
 * On reaching the end of the collection the cursor is cleared and `complete`
 * is set to true, so subsequent calls are no-ops until `{reset: true}` is
 * passed (e.g. after new prints are added).
 */
export async function POST(request: NextRequest) {
  const unauth = await assertAuthorized(request);
  if (unauth) return unauth;

  const body = await request.json().catch(() => ({}));
  const limit: number = typeof body.limit === "number" ? body.limit : 500;
  const force: boolean = body.force === true;
  const reset: boolean = body.reset === true;
  const delayMs: number = typeof body.delayMs === "number" ? body.delayMs : 100;

  const started = Date.now();
  const now = Math.floor(started / 1000);

  const indexRef = adminDb.doc(INDEX_DOC_PATH);
  const indexSnap = await indexRef.get();
  const index: IndexDoc = (indexSnap.data() ?? {}) as IndexDoc;

  const cursor = reset ? undefined : index.cursor ?? undefined;
  const alreadyComplete = !reset && index.complete === true && !force;
  if (alreadyComplete) {
    return NextResponse.json({
      success: true,
      message: "Backfill already complete. Pass { reset: true } to re-scan.",
      index_size: Object.keys(index.entries ?? {}).length,
    });
  }

  let query = adminDb
    .collection("prints")
    .orderBy(FieldPath.documentId())
    .limit(limit);
  if (cursor) query = query.startAfter(cursor);

  const snap = await query.get();

  const hashes = new Map<string, string>();
  const errors: { printId: string; error: string }[] = [];
  let skippedAlreadyHashed = 0;
  let skippedNoImage = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (!data.image_url) {
      skippedNoImage++;
      continue;
    }
    if (!force && typeof data.phash === "string" && data.phash.length === 64) {
      skippedAlreadyHashed++;
      continue;
    }
    try {
      const img = await fetchImageBuffer(data.image_url, CATALOG_USER_AGENT);
      const h = await dhash(img);
      hashes.set(doc.id, h);
    } catch (err) {
      errors.push({ printId: doc.id, error: err instanceof Error ? err.message : String(err) });
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  // Write per-print phash fields in batches.
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

  const lastDocId = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1].id : cursor ?? null;
  const pageComplete = snap.size < limit;
  const nextCursor = pageComplete ? null : lastDocId;

  // Update consolidated lookup index + cursor state. Admin SDK `set({merge:true})`
  // treats dot-in-key as a literal field name, NOT a field path, so we have to
  // reach for update() to land entries inside the nested `entries` map.
  if (!indexSnap.exists) {
    await indexRef.set({
      entries: Object.fromEntries(hashes),
      cursor: nextCursor,
      complete: pageComplete,
      updatedAt: now,
    });
  } else {
    const updates: Record<string, unknown> = {
      updatedAt: now,
      cursor: nextCursor,
      complete: pageComplete,
    };
    for (const [printId, h] of hashes) {
      updates[`entries.${printId}`] = h;
    }
    await indexRef.update(updates);
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - started,
    page_size: snap.size,
    hashed: hashes.size,
    skipped_already_hashed: skippedAlreadyHashed,
    skipped_no_image: skippedNoImage,
    errors,
    cursor: nextCursor,
    complete: pageComplete,
  });
}

export async function GET(request: NextRequest) {
  const unauth = await assertAuthorized(request);
  if (unauth) return unauth;

  const indexRef = adminDb.doc(INDEX_DOC_PATH);
  const indexSnap = await indexRef.get();
  const index: IndexDoc = (indexSnap.data() ?? {}) as IndexDoc;

  return NextResponse.json({
    status: "ok",
    index_size: Object.keys(index.entries ?? {}).length,
    cursor: index.cursor ?? null,
    complete: index.complete === true,
    updatedAt: index.updatedAt ?? null,
    usage: "POST with optional { limit: 500, delayMs: 100, force: false, reset: false } to continue backfill.",
  });
}
