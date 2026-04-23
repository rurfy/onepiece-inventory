import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { CATALOG_USER_AGENT } from "@/lib/catalog-source";

export const maxDuration = 30;

if (getApps().length === 0) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccount) {
    initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
  } else {
    initializeApp();
  }
}

const adminDb = getFirestore();

/**
 * Proxy for card images. Bandai sends `Cross-Origin-Resource-Policy: same-site`
 * which blocks embedding on our domain. By fetching server-side and streaming
 * the bytes back as a same-origin response, browsers render them normally.
 *
 * Public endpoint — any authenticated or unauthenticated client can request
 * a card image the catalog knows about. Same trust level as the image URLs
 * themselves.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ printId: string }> }
) {
  const { printId } = await params;
  if (!/^[A-Za-z0-9_-]+$/.test(printId)) {
    return NextResponse.json({ error: "bad printId" }, { status: 400 });
  }

  const snap = await adminDb.collection("prints").doc(printId).get();
  const url = snap.data()?.image_url as string | undefined;
  if (!url) {
    return NextResponse.json({ error: "unknown card or no image" }, { status: 404 });
  }

  const upstream = await fetch(url, {
    headers: { "User-Agent": CATALOG_USER_AGENT, Accept: "image/*" },
  });
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `upstream ${upstream.status}`, url },
      { status: 502 }
    );
  }

  const body = await upstream.arrayBuffer();
  const contentType = upstream.headers.get("content-type") ?? "image/png";

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      // Card images are versioned in the source URL (?YYMMDD) so we can
      // cache aggressively. Browser: 1 day; CDN: 30 days.
      "Cache-Control": "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800",
    },
  });
}
