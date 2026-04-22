import * as cheerio from "cheerio";

const BASE_URL = "https://www.cardmarket.com/en/OnePiece";
const USER_AGENT =
  "Mozilla/5.0 (compatible; onepiece-inventory/0.1; +https://onepiece-inventory.vercel.app; contact chrissy.richter2710@gmail.com)";

export interface ScrapedPrice {
  print_id: string;
  market_price: number | null;
  currency: string;
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!res.ok) {
    throw new Error(`CardMarket fetch failed: ${res.status} ${res.statusText} for ${url}`);
  }

  return res.text();
}

/**
 * Scrape the trend price for a single card by searching CardMarket.
 * Uses the card code (e.g., "OP01-001") as search query.
 */
export async function scrapeCardPrice(cardCode: string): Promise<number | null> {
  const searchUrl = `${BASE_URL}/Cards?searchString=${encodeURIComponent(cardCode)}`;
  const html = await fetchPage(searchUrl);
  const $ = cheerio.load(html);

  // CardMarket search results show cards in a table with trend prices.
  // Look for the exact card code match and extract its trend price.
  let trendPrice: number | null = null;

  $(".table-body .row, table tbody tr, .card-search-result").each((_, row) => {
    const rowText = $(row).text();

    // Check if this row contains our exact card code
    if (!rowText.includes(cardCode)) return;

    // Look for trend price - CardMarket shows it in various formats
    // Try the dedicated trend price element first
    const trendEl =
      $(row).find('[data-trend], .trend-price, .price-container .trend').first();

    if (trendEl.length) {
      const priceText = trendEl.text().trim();
      const parsed = parsePriceText(priceText);
      if (parsed !== null) {
        trendPrice = parsed;
        return false; // break
      }
    }

    // Fallback: find any price-like text in the row
    const priceMatch = rowText.match(/(\d+[.,]\d{2})\s*€/);
    if (priceMatch) {
      trendPrice = parseFloat(priceMatch[1].replace(",", "."));
      return false; // break
    }
  });

  // If search results didn't work, try finding price on the page more broadly
  if (trendPrice === null) {
    // Some CardMarket pages show a single result directly
    const trendElements = $('[class*="trend"], [class*="price"]');
    trendElements.each((_, el) => {
      const text = $(el).text().trim();
      const parsed = parsePriceText(text);
      if (parsed !== null && trendPrice === null) {
        trendPrice = parsed;
        return false;
      }
    });
  }

  return trendPrice;
}

/**
 * Scrape prices for all cards in a set by fetching the set's singles page.
 * Returns a map of card_code -> trend_price.
 */
export async function scrapeSetPrices(
  setSlug: string
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${BASE_URL}/Products/Singles/${setSlug}?sortBy=name&sortDir=asc&site=${page}`;
    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    let foundCards = 0;

    // CardMarket lists singles in rows with card info and prices
    $(".table-body .row, table tbody tr").each((_, row) => {
      const $row = $(row);
      const rowText = $row.text();

      // Extract card code (e.g., OP01-001, ST01-001, P-001)
      const codeMatch = rowText.match(/((?:OP|ST|EB|PRB|P)\d*-\d{3})/);
      if (!codeMatch) return;

      const cardCode = codeMatch[1];

      // Extract trend price
      const priceMatch = rowText.match(/(\d+[.,]\d{2})\s*€/);
      if (priceMatch) {
        const price = parseFloat(priceMatch[1].replace(",", "."));
        if (!isNaN(price)) {
          prices.set(cardCode, price);
          foundCards++;
        }
      }
    });

    // Check if there's a next page
    const hasNextPage = $('a[rel="next"], .pagination .next:not(.disabled)').length > 0;
    hasMore = hasNextPage && foundCards > 0;
    page++;

    // Rate limiting between pages
    if (hasMore) {
      await sleep(1500);
    }
  }

  return prices;
}

function parsePriceText(text: string): number | null {
  // Handle formats like "1,50 €", "0.25 €", "12,00€", "€1.50"
  const match = text.match(/€?\s*(\d+[.,]\d{2})\s*€?/);
  if (!match) return null;
  const price = parseFloat(match[1].replace(",", "."));
  return isNaN(price) ? null : price;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Known CardMarket set slugs for One Piece TCG.
 * Add new sets here as they release.
 */
export const SET_SLUGS: Record<string, string> = {
  OP01: "Romance-Dawn",
  OP02: "Paramount-War",
  OP03: "Pillars-of-Strength",
  OP04: "Kingdoms-of-Intrigue",
  OP05: "Awakening-of-the-New-Era",
  OP06: "Wings-of-the-Captain",
  OP07: "500-Years-in-the-Future",
  OP08: "Two-Legends",
  OP09: "Emperors-in-the-New-World",
  OP10: "Royal-Blood",
  ST01: "Straw-Hat-Crew",
  ST02: "Worst-Generation",
  ST03: "The-Seven-Warlords-of-the-Sea",
  ST04: "Animal-Kingdom-Pirates",
  ST05: "ONE-PIECE-FILM-edition",
  ST06: "Navy",
  ST07: "Big-Mom-Pirates",
  ST08: "Monkey-D-Luffy",
  ST09: "Yamato",
  ST10: "The-Three-Captains",
  ST11: "Uta",
  ST12: "Zoro-and-Sanji",
  ST13: "The-Three-Brothers",
  ST14: "3D2Y",
  ST15: "RED-Edward-Newgate",
  ST16: "GREEN-Uta",
  ST17: "BLUE-Donquixote-Doflamingo",
  ST18: "PURPLE-Monkey-D-Luffy",
  EB01: "Memorial-Collection",
  PRB01: "Premium-Booster-ONE-PIECE-CARD-THE-BEST",
};
