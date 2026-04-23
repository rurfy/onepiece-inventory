import { NextRequest, NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "@/lib/firebase-admin";
import { TcgcsvSource, MergedPrice } from "@/lib/tcgcsv-source";

export const maxDuration = 300;

getAdminApp();
const adminDb = getFirestore();
const BATCH_LIMIT = 400;

// TCGplayer category IDs. Extend this map as new games are added.
const CATEGORY_MAP: Record<string, number> = {
  onepiece: 68,
  riftbound: 89,
};

function buildPriceDoc(row: MergedPrice, categoryId: number, now: number) {
  return {
    market_price: row.market,
    low_price: row.low,
    mid_price: row.mid,
    high_price: row.high,
    currency: "USD",
    source: "tcgcsv",
    source_category_id: categoryId,
    source_product_id: row.productId,
    subtype: row.subtype,
    name: row.name,
    rarity: row.rarity,
    fetchedAt: now,
  };
}

async function assertAuthorized(request: NextRequest): Promise<NextResponse | null> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function resolveCategories(body: {
  games?: string[];
  categoryIds?: number[];
}): number[] {
  if (body.categoryIds?.length) return body.categoryIds;
  if (body.games?.length) {
    return body.games
      .map((g) => CATEGORY_MAP[g.toLowerCase()])
      .filter((n): n is number => typeof n === "number");
  }
  return [CATEGORY_MAP.onepiece];
}

export async function POST(request: NextRequest) {
  const unauth = await assertAuthorized(request);
  if (unauth) return unauth;

  const body = await request.json().catch(() => ({}));
  const categoryIds = resolveCategories(body);
  const groupIds: number[] | undefined = Array.isArray(body.groupIds) ? body.groupIds : undefined;
  const delayMs: number = typeof body.delayMs === "number" ? body.delayMs : 150;

  const started = Date.now();
  const now = Math.floor(started / 1000);

  const perCategory: {
    categoryId: number;
    prices_merged: number;
    prices_written: number;
    unmatched: number;
    groups_attempted: number;
    errors: { groupId: number; error: string }[];
  }[] = [];

  for (const categoryId of categoryIds) {
    const source = new TcgcsvSource(categoryId);
    const { prices, groupsAttempted, errors } = await source.fetchAll({ groupIds, delayMs });

    const writable = prices.filter((p) => p.base_code);
    const unmatched = prices.length - writable.length;

    let written = 0;
    for (let i = 0; i < writable.length; i += BATCH_LIMIT) {
      const chunk = writable.slice(i, i + BATCH_LIMIT);
      const batch = adminDb.batch();
      for (const row of chunk) {
        batch.set(
          adminDb.collection("prices").doc(row.base_code),
          buildPriceDoc(row, categoryId, now),
          { merge: true }
        );
        written++;
      }
      await batch.commit();
    }

    perCategory.push({
      categoryId,
      prices_merged: prices.length,
      prices_written: written,
      unmatched,
      groups_attempted: groupsAttempted.length,
      errors,
    });
  }

  return NextResponse.json({
    success: true,
    source: "tcgcsv",
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - started,
    categories: perCategory,
  });
}

export async function GET(request: NextRequest) {
  const unauth = await assertAuthorized(request);
  if (unauth) return unauth;

  return NextResponse.json({
    status: "ok",
    source: "tcgcsv",
    available_games: Object.keys(CATEGORY_MAP),
    category_map: CATEGORY_MAP,
    usage:
      "POST with optional { games: ['onepiece'], groupIds: [24637, ...], delayMs: 150 }. " +
      "Omit everything to refresh all of One Piece.",
  });
}
