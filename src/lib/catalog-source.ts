import * as cheerio from "cheerio";
import type { Element } from "domhandler";

export const CATALOG_USER_AGENT =
  "onepiece-inventory-catalog/0.1 (personal hobby tracker; contact chrissy.richter2710@gmail.com)";

export interface CatalogCard {
  print_id: string;
  base_code: string;
  name: string;
  set_id: string;
  rarity: string;
  color: string;
  type: string;
  cost: string;
  power: string;
  counter: string;
  attribute: string;
  feature: string;
  card_text: string;
  card_set_name: string;
  image_url: string;
  variant_key: string;
  variant_label: string;
}

export interface CatalogSource {
  readonly name: string;
  listSeries(): Promise<SeriesRef[]>;
  fetchSeries(seriesId: string): Promise<CatalogCard[]>;
}

export interface SeriesRef {
  id: string;
  label: string;
  set_code: string;
}

const BANDAI_BASE = "https://en.onepiece-cardgame.com";

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": CATALOG_USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });

  if (res.status === 429 || res.status === 503) {
    throw new Error(`Throttled by upstream (${res.status}); abort this run`);
  }
  if (!res.ok) {
    throw new Error(`Bandai fetch failed: ${res.status} ${res.statusText} for ${url}`);
  }
  return res.text();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSetCode(rawLabel: string): string {
  // Labels end with "[OP-15]", "[ST-29]", "[EB-02]", "[PRB-01]", "[OP15-EB04]" etc.
  // Also some have "[P-###]" style.
  const match = rawLabel.match(/\[([^\]]+)\]\s*$/);
  if (!match) return "UNKNOWN";
  // Normalise: "OP-15" -> "OP15", "ST-29" -> "ST29", "EB-02" -> "EB02", "PRB-01" -> "PRB01".
  // Keep compound like "OP15-EB04" as-is since it's informational.
  return match[1].replace(/^([A-Z]+)-(\d+)$/, "$1$2");
}

function derivePrintParts(printId: string): {
  base_code: string;
  set_id: string;
  variant_key: string;
  variant_label: string;
} {
  const variantMatch = printId.match(/^(.+?)(?:_([a-z0-9]+))?$/i);
  const base_code = variantMatch?.[1] ?? printId;
  const variant_key = variantMatch?.[2] ?? "";
  // Set id is the prefix before the hyphen: "OP15-001" -> "OP15", "P-120" -> "P".
  const setMatch = base_code.match(/^([A-Z]+\d*)-/);
  const set_id = setMatch?.[1] ?? base_code;
  const variant_label = variant_key ? `Alt art (${variant_key})` : "";
  return { base_code, set_id, variant_key, variant_label };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function textAfterHeading($card: cheerio.Cheerio<Element>, selector: string): string {
  const $el = $card.find(selector);
  if (!$el.length) return "";
  return $el.clone().children("h3").remove().end().text().trim();
}

export class BandaiOnePieceSource implements CatalogSource {
  readonly name = "bandai-onepiece";

  async listSeries(): Promise<SeriesRef[]> {
    const html = await fetchHtml(`${BANDAI_BASE}/cardlist/`);
    const $ = cheerio.load(html);
    const refs: SeriesRef[] = [];

    $('select#series option').each((_, el) => {
      const id = $(el).attr("value") ?? "";
      if (!id) return;
      const labelRaw = decodeEntities($(el).html() ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!labelRaw) return;
      refs.push({ id, label: labelRaw, set_code: parseSetCode(labelRaw) });
    });

    return refs;
  }

  async fetchSeries(seriesId: string): Promise<CatalogCard[]> {
    const html = await fetchHtml(`${BANDAI_BASE}/cardlist/?series=${encodeURIComponent(seriesId)}`);
    const $ = cheerio.load(html);
    const cards: CatalogCard[] = [];

    // The currently-selected option tells us the set name.
    const selectedLabel = decodeEntities($('select#series option[selected]').html() ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const card_set_name = selectedLabel;

    $('dl.modalCol').each((_, el) => {
      const $card = $(el);
      const print_id = $card.attr("id") ?? "";
      if (!print_id) return;

      const infoSpans = $card.find("dt .infoCol span").map((_, s) => $(s).text().trim()).get();
      // Expected: [code, rarity, type]
      const codeFromInfo = infoSpans[0] ?? "";
      const rarity = infoSpans[1] ?? "";
      const cardType = infoSpans[2] ?? "";

      const name = $card.find("dt .cardName").text().trim();

      const imgSrc = $card.find("dd .frontCol img").attr("data-src") ?? "";
      const image_url = imgSrc
        ? new URL(imgSrc.replace(/^\.\.\//, "/"), BANDAI_BASE).toString()
        : "";

      const cost = textAfterHeading($card, "dd .cost");
      const power = textAfterHeading($card, "dd .power");
      const counter = textAfterHeading($card, "dd .counter");
      const color = textAfterHeading($card, "dd .color");
      const feature = textAfterHeading($card, "dd .feature");
      const effectText = textAfterHeading($card, "dd .text");

      // Attribute is in a nested <i> tag after the icon.
      const attribute = $card.find("dd .attribute i").text().trim();

      const parts = derivePrintParts(print_id);

      cards.push({
        print_id,
        base_code: codeFromInfo || parts.base_code,
        name,
        set_id: parts.set_id,
        rarity,
        color,
        type: cardType,
        cost,
        power,
        counter,
        attribute,
        feature,
        card_text: effectText,
        card_set_name,
        image_url,
        variant_key: parts.variant_key,
        variant_label: parts.variant_label,
      });
    });

    return cards;
  }
}

/**
 * Fetch the full catalog. Series filtering is supported so callers can slice
 * the work across invocations if Vercel function timeouts become a concern.
 */
export async function fetchCatalog(
  source: CatalogSource,
  opts: { seriesIds?: string[]; delayMs?: number } = {}
): Promise<{ cards: CatalogCard[]; seriesAttempted: string[]; errors: { series: string; error: string }[] }> {
  const { seriesIds, delayMs = 1500 } = opts;
  const allSeries = await source.listSeries();
  const selected = seriesIds ? allSeries.filter((s) => seriesIds.includes(s.id)) : allSeries;

  const cards: CatalogCard[] = [];
  const errors: { series: string; error: string }[] = [];
  const seriesAttempted: string[] = [];

  for (const series of selected) {
    seriesAttempted.push(series.id);
    try {
      const seriesCards = await source.fetchSeries(series.id);
      cards.push(...seriesCards);
    } catch (err) {
      errors.push({
        series: series.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    await sleep(delayMs);
  }

  return { cards, seriesAttempted, errors };
}
