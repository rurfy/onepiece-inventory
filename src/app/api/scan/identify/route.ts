import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "@/lib/firebase-admin";
import { dhash, hamming, confidence } from "@/lib/phash";

export const maxDuration = 60;

getAdminApp();
const adminDb = getFirestore();
const INDEX_DOC_PATH = "indexes/phash";
const TOP_K = 5;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

async function verifyUser(request: NextRequest): Promise<string | NextResponse> {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }
  const idToken = authHeader.slice("Bearer ".length);
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    return decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  const uidOrResponse = await verifyUser(request);
  if (typeof uidOrResponse !== "string") return uidOrResponse;

  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Expected multipart form field 'image'" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Empty image" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());

  let queryHash: string;
  try {
    queryHash = await dhash(buf);
  } catch (err) {
    return NextResponse.json(
      { error: "Hashing failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }

  const indexSnap = await adminDb.doc(INDEX_DOC_PATH).get();
  const entries = (indexSnap.data()?.entries ?? {}) as Record<string, string>;
  const entryCount = Object.keys(entries).length;
  if (entryCount === 0) {
    return NextResponse.json(
      { error: "Hash index empty — run /api/catalog/hash-backfill first" },
      { status: 503 }
    );
  }

  // Linear scan — fast enough: 3–4k entries × 32-byte xor ≈ sub-millisecond.
  const scored: { printId: string; distance: number }[] = [];
  for (const [printId, h] of Object.entries(entries)) {
    scored.push({ printId, distance: hamming(queryHash, h) });
  }
  scored.sort((a, b) => a.distance - b.distance);
  const topIds = scored.slice(0, TOP_K);

  // Hydrate the top matches with card metadata.
  const docs = await Promise.all(
    topIds.map(({ printId }) => adminDb.collection("prints").doc(printId).get())
  );

  const matches = topIds.map(({ printId, distance }, i) => {
    const data = docs[i].data() ?? {};
    return {
      print_id: printId,
      base_code: data.base_code ?? printId,
      name: data.name ?? "",
      rarity: data.rarity ?? "",
      color: data.color ?? "",
      image_url: data.image_url ?? "",
      variant_label: data.variant_label ?? "",
      distance,
      confidence: Number(confidence(distance).toFixed(3)),
    };
  });

  return NextResponse.json({
    success: true,
    query_hash: queryHash,
    index_size: entryCount,
    matches,
  });
}
