import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { scrapeSetPrices, SET_SLUGS } from "@/lib/cardmarket-scraper";

// Initialize Firebase Admin (server-side only)
if (getApps().length === 0) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccount) {
    initializeApp({
      credential: cert(JSON.parse(serviceAccount)),
    });
  } else {
    // Fallback for environments where default credentials are available
    initializeApp();
  }
}

const adminDb = getFirestore();

export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optional: only refresh specific sets
  const body = await request.json().catch(() => ({}));
  const requestedSets: string[] | undefined = body.sets;

  const setsToScrape = requestedSets
    ? Object.entries(SET_SLUGS).filter(([id]) => requestedSets.includes(id))
    : Object.entries(SET_SLUGS);

  const results: { set: string; cards: number; errors: string[] }[] = [];
  const now = Math.floor(Date.now() / 1000);

  for (const [setId, slug] of setsToScrape) {
    try {
      const prices = await scrapeSetPrices(slug);

      // Batch write to Firestore
      const batch = adminDb.batch();
      let count = 0;

      for (const [cardCode, marketPrice] of prices) {
        // Find matching print_ids for this card code
        const printsSnap = await adminDb
          .collection("prints")
          .where("base_code", "==", cardCode)
          .get();

        for (const printDoc of printsSnap.docs) {
          batch.set(
            adminDb.collection("prices").doc(printDoc.id),
            {
              market_price: marketPrice,
              currency: "EUR",
              fetchedAt: now,
            },
            { merge: true }
          );
          count++;
        }
      }

      if (count > 0) {
        await batch.commit();
      }

      results.push({ set: setId, cards: count, errors: [] });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      results.push({ set: setId, cards: 0, errors: [msg] });
    }

    // Rate limit between sets
    await new Promise((r) => setTimeout(r, 2000));
  }

  const totalCards = results.reduce((sum, r) => sum + r.cards, 0);
  const totalErrors = results.filter((r) => r.errors.length > 0).length;

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    summary: {
      sets_scraped: results.length,
      total_cards_updated: totalCards,
      sets_with_errors: totalErrors,
    },
    results,
  });
}

// Also support GET for easy testing (still requires auth)
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    status: "ok",
    available_sets: Object.keys(SET_SLUGS),
    usage: "POST with optional { sets: ['OP01', 'OP02'] } to refresh specific sets",
  });
}
