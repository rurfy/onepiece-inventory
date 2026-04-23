/**
 * tcgcsv.com source — a free, daily-refreshed mirror of TCGplayer's catalog
 * and market-price data. Covers 89+ TCGs including One Piece (cat 68) and
 * Riftbound (cat 89), so the same source plugs into future games.
 *
 * Etiquette: the service explicitly asks for ≤10k requests/24h, 100ms
 * between requests, and a descriptive User-Agent.
 */

export const TCGCSV_USER_AGENT =
  "onepiece-inventory/0.2 (contact chrissy.richter2710@gmail.com)";

const TCGCSV_BASE = "https://tcgcsv.com/tcgplayer";

export interface TcgcsvGroup {
  groupId: number;
  name: string;
  abbreviation: string;
  publishedOn: string;
  modifiedOn: string;
  categoryId: number;
}

export interface TcgcsvProduct {
  productId: number;
  name: string;
  cleanName: string;
  imageUrl: string;
  categoryId: number;
  groupId: number;
  extendedData: { name: string; displayName: string; value: string }[];
}

export interface TcgcsvPrice {
  productId: number;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  marketPrice: number | null;
  directLowPrice: number | null;
  subTypeName: string;
}

export interface MergedPrice {
  productId: number;
  base_code: string; // Bandai-style print code pulled from extendedData.Number (empty if absent)
  name: string;
  rarity: string;
  subtype: string;
  low: number | null;
  mid: number | null;
  high: number | null;
  market: number | null;
  groupAbbrev: string;
  groupName: string;
}

interface TcgcsvEnvelope<T> {
  totalItems?: number;
  success: boolean;
  errors: unknown[];
  results: T[];
}

async function fetchJson<T>(url: string): Promise<TcgcsvEnvelope<T>> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": TCGCSV_USER_AGENT,
      Accept: "application/json",
    },
  });
  if (res.status === 429 || res.status === 503) {
    throw new Error(`tcgcsv throttled (${res.status}); abort run`);
  }
  if (!res.ok) {
    throw new Error(`tcgcsv fetch failed: ${res.status} ${res.statusText} ${url}`);
  }
  return (await res.json()) as TcgcsvEnvelope<T>;
}

function extValue(product: TcgcsvProduct, name: string): string {
  return product.extendedData.find((e) => e.name === name)?.value?.trim() ?? "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TcgcsvSource {
  constructor(public readonly categoryId: number) {}

  async listGroups(): Promise<TcgcsvGroup[]> {
    const env = await fetchJson<TcgcsvGroup>(`${TCGCSV_BASE}/${this.categoryId}/groups`);
    return env.results;
  }

  async fetchGroup(group: Pick<TcgcsvGroup, "groupId" | "abbreviation" | "name">): Promise<MergedPrice[]> {
    const [productsEnv, pricesEnv] = await Promise.all([
      fetchJson<TcgcsvProduct>(`${TCGCSV_BASE}/${this.categoryId}/${group.groupId}/products`),
      fetchJson<TcgcsvPrice>(`${TCGCSV_BASE}/${this.categoryId}/${group.groupId}/prices`),
    ]);

    const productsById = new Map<number, TcgcsvProduct>();
    for (const p of productsEnv.results) productsById.set(p.productId, p);

    const merged: MergedPrice[] = [];
    for (const price of pricesEnv.results) {
      const product = productsById.get(price.productId);
      if (!product) continue;

      merged.push({
        productId: price.productId,
        base_code: extValue(product, "Number"),
        name: product.name,
        rarity: extValue(product, "Rarity"),
        subtype: price.subTypeName,
        low: price.lowPrice,
        mid: price.midPrice,
        high: price.highPrice,
        market: price.marketPrice,
        groupAbbrev: group.abbreviation ?? "",
        groupName: group.name ?? "",
      });
    }
    return merged;
  }

  async fetchAll(opts: { groupIds?: number[]; delayMs?: number } = {}): Promise<{
    prices: MergedPrice[];
    groupsAttempted: number[];
    errors: { groupId: number; error: string }[];
  }> {
    const { groupIds, delayMs = 150 } = opts;
    const groups = await this.listGroups();
    const selected = groupIds ? groups.filter((g) => groupIds.includes(g.groupId)) : groups;

    const prices: MergedPrice[] = [];
    const errors: { groupId: number; error: string }[] = [];
    const groupsAttempted: number[] = [];

    for (const g of selected) {
      groupsAttempted.push(g.groupId);
      try {
        const rows = await this.fetchGroup(g);
        prices.push(...rows);
      } catch (err) {
        errors.push({
          groupId: g.groupId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      // two requests per group (products + prices, run in parallel) = ≤2
      // per group; sleep enforces the "≥100ms between sequential requests"
      // recommendation from tcgcsv docs.
      await sleep(delayMs);
    }

    return { prices, groupsAttempted, errors };
  }
}
