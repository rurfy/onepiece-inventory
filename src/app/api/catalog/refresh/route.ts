import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { BandaiOnePieceSource, fetchCatalog, CatalogCard } from "@/lib/catalog-source";

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
const BATCH_LIMIT = 400;

function buildPrintDoc(card: CatalogCard, now: number) {
  return {
    base_code: card.base_code,
    name: card.name,
    set_id: card.set_id,
    rarity: card.rarity,
    color: card.color,
    type: card.type,
    cost: card.cost,
    power: card.power,
    counter: card.counter,
    attribute: card.attribute,
    feature: card.feature,
    card_text: card.card_text,
    card_set_name: card.card_set_name,
    image_url: card.image_url,
    variant_key: card.variant_key,
    variant_label: card.variant_label,
    source: "bandai-onepiece",
    updatedAt: now,
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

export async function POST(request: NextRequest) {
  const unauth = await assertAuthorized(request);
  if (unauth) return unauth;

  const body = await request.json().catch(() => ({}));
  const seriesIds: string[] | undefined = Array.isArray(body.series) ? body.series : undefined;
  const delayMs: number = typeof body.delayMs === "number" ? body.delayMs : 1500;

  const source = new BandaiOnePieceSource();
  const started = Date.now();
  const now = Math.floor(started / 1000);

  const { cards, seriesAttempted, errors } = await fetchCatalog(source, { seriesIds, delayMs });

  let written = 0;
  for (let i = 0; i < cards.length; i += BATCH_LIMIT) {
    const chunk = cards.slice(i, i + BATCH_LIMIT);
    const batch = adminDb.batch();
    for (const card of chunk) {
      if (!card.print_id) continue;
      batch.set(adminDb.collection("prints").doc(card.print_id), buildPrintDoc(card, now), {
        merge: true,
      });
      written++;
    }
    await batch.commit();
  }

  return NextResponse.json({
    success: true,
    source: source.name,
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - started,
    series_attempted: seriesAttempted.length,
    cards_written: written,
    errors,
  });
}

export async function GET(request: NextRequest) {
  const unauth = await assertAuthorized(request);
  if (unauth) return unauth;

  const source = new BandaiOnePieceSource();
  const series = await source.listSeries();
  return NextResponse.json({
    status: "ok",
    source: source.name,
    series_count: series.length,
    series,
    usage:
      "POST with optional { series: ['569115', ...], delayMs: 1500 } to refresh a subset. Omit to refresh everything.",
  });
}
