import { NextRequest, NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "@/lib/firebase-admin";
import { TcgcsvSource, TCGCSV_USER_AGENT } from "@/lib/tcgcsv-source";
import { dhash, hamming, fetchImageBuffer } from "@/lib/phash";

export const maxDuration = 300;

getAdminApp();
const adminDb = getFirestore();

const PHASH_INDEX_PATH = "indexes/phash";
const MAPPING_DOC_PATH = "indexes/tcg-mapping";

// Distances above this mean "no reasonable Bandai card matches" — probably
// a sealed product or a set we haven't ingested. Tuning guideline: in
// practice same-card-different-renderer distances land 20–80; 120 is a
// safe ceiling that still rejects unrelated content.
const DISTANCE_CAP = 120;

const CATEGORY_MAP: Record<string, number> = {
  onepiece: 68,
  riftbound: 89,
};

function groupCodesFromAbbrev(abbr: string): string[] {
  const parts = abbr.split(/[-\s_]/).filter(Boolean);
  const codes: string[] = [];
  for (const part of parts) {
    if (/^\d+$/.test(part) && codes.length > 0) {
      codes[codes.length - 1] += part;
    } else {
      codes.push(part);
    }
  }
  return codes.map((c) => c.toUpperCase());
}

async function assertAuthorized(request: NextRequest): Promise<NextResponse | null> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

interface Mapping {
  print_id: string;
  distance: number;
  mappedAt: number;
}

export async function POST(request: NextRequest) {
  const unauth = await assertAuthorized(request);
  if (unauth) return unauth;

  const body = await request.json().catch(() => ({}));
  const limit: number = typeof body.limit === "number" ? body.limit : 300;
  const force: boolean = body.force === true;
  const games: string[] = Array.isArray(body.games) ? body.games : ["onepiece"];
  const categoryIds = games
    .map((g) => CATEGORY_MAP[g.toLowerCase()])
    .filter((n): n is number => typeof n === "number");
  const concurrency: number = typeof body.concurrency === "number" ? body.concurrency : 4;

  const started = Date.now();
  const now = Math.floor(started / 1000);

  // Load Bandai phash index once.
  const phashSnap = await adminDb.doc(PHASH_INDEX_PATH).get();
  const bandaiEntries = (phashSnap.data()?.entries ?? {}) as Record<string, string>;
  const bandaiArr = Object.entries(bandaiEntries);
  if (bandaiArr.length === 0) {
    return NextResponse.json({ error: "phash index empty" }, { status: 503 });
  }

  // Load existing product→print mapping so we can skip work we've done.
  const mappingSnap = await adminDb.doc(MAPPING_DOC_PATH).get();
  const existing = (mappingSnap.data()?.mappings ?? {}) as Record<string, Mapping>;

  const newMappings = new Map<string, Mapping>();
  const rejected: number[] = [];
  let productsSeen = 0;
  let productsMapped = 0;

  for (const categoryId of categoryIds) {
    const source = new TcgcsvSource(categoryId);
    const groups = await source.listGroups();

    for (const group of groups) {
      if (newMappings.size >= limit) break;

      const rows = await source.fetchGroup(group);
      const codes = groupCodesFromAbbrev(group.abbreviation ?? "");

      // Pick only products whose number prefix corresponds to this group's
      // Bandai set(s); skip sealed items (base_code empty).
      const candidates = rows.filter((r) => {
        if (!r.base_code) return false;
        const prefix = r.base_code.split("-")[0].toUpperCase();
        return codes.includes(prefix);
      });

      // Need the imageUrl — refetch raw products so we have it.
      const productsEnvRes = await fetch(
        `https://tcgcsv.com/tcgplayer/${categoryId}/${group.groupId}/products`,
        { headers: { "User-Agent": TCGCSV_USER_AGENT, Accept: "application/json" } }
      );
      const productsEnv = (await productsEnvRes.json()) as {
        results: { productId: number; imageUrl: string }[];
      };
      const imageByProduct = new Map<number, string>();
      for (const p of productsEnv.results) imageByProduct.set(p.productId, p.imageUrl);

      // Work queue — only products we haven't mapped yet.
      const work = candidates.filter(
        (r) => force || !existing[String(r.productId)]
      );

      // Process in small parallel batches.
      for (let i = 0; i < work.length; i += concurrency) {
        if (newMappings.size >= limit) break;
        const batch = work.slice(i, i + concurrency);
        await Promise.all(
          batch.map(async (product) => {
            if (newMappings.size >= limit) return;
            productsSeen++;

            const imgUrl = imageByProduct.get(product.productId);
            if (!imgUrl) return;

            try {
              const buf = await fetchImageBuffer(imgUrl, TCGCSV_USER_AGENT);
              const h = await dhash(buf);

              let bestId = "";
              let bestDist = Number.POSITIVE_INFINITY;
              for (const [printId, bh] of bandaiArr) {
                const d = hamming(h, bh);
                if (d < bestDist) {
                  bestDist = d;
                  bestId = printId;
                }
              }

              if (bestDist > DISTANCE_CAP) {
                rejected.push(product.productId);
                return;
              }

              newMappings.set(String(product.productId), {
                print_id: bestId,
                distance: bestDist,
                mappedAt: now,
              });
              productsMapped++;
            } catch {
              rejected.push(product.productId);
            }
          })
        );
      }
    }
  }

  // Commit new mappings into the mapping doc.
  if (newMappings.size > 0) {
    if (!mappingSnap.exists) {
      await adminDb.doc(MAPPING_DOC_PATH).set({
        mappings: Object.fromEntries(newMappings),
        updatedAt: now,
      });
    } else {
      const updates: Record<string, unknown> = { updatedAt: now };
      for (const [pid, m] of newMappings) updates[`mappings.${pid}`] = m;
      await adminDb.doc(MAPPING_DOC_PATH).update(updates);
    }
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - started,
    products_seen: productsSeen,
    products_mapped: productsMapped,
    products_rejected: rejected.length,
    products_rejected_sample: rejected.slice(0, 10),
    running_mapping_size: Object.keys(existing).length + newMappings.size,
    complete: productsSeen === 0,
  });
}

export async function GET(request: NextRequest) {
  const unauth = await assertAuthorized(request);
  if (unauth) return unauth;

  const snap = await adminDb.doc(MAPPING_DOC_PATH).get();
  const mappings = (snap.data()?.mappings ?? {}) as Record<string, Mapping>;
  return NextResponse.json({
    status: "ok",
    total_mappings: Object.keys(mappings).length,
    updatedAt: snap.data()?.updatedAt ?? null,
    usage:
      "POST with { limit: 300, concurrency: 4, force: false, games: ['onepiece'] } to continue mapping.",
  });
}
