"use client";

import { useMemo } from "react";
import { useCollection } from "./use-collection";
import { usePrices } from "./use-price";
import { CollectionSummary } from "@/types/card";

export function useCollectionSummary() {
  const { cards, loading: cardsLoading } = useCollection();
  const printIds = useMemo(() => cards.map((c) => c.print_id), [cards]);
  const { prices, loading: pricesLoading } = usePrices(printIds);

  return useMemo<CollectionSummary | null>(() => {
    if (cardsLoading) return null;
    if (cards.length > 0 && pricesLoading) return null;

    const totalCards = cards.reduce((sum, c) => sum + c.quantity, 0);
    const totalValue = cards.reduce((sum, c) => {
      const p = prices.get(c.print_id);
      const unit = p?.market_price ?? p?.inventory_price ?? 0;
      return sum + unit * c.quantity;
    }, 0);

    return { totalCards, totalValue, lastUpdated: Date.now() };
  }, [cards, cardsLoading, prices, pricesLoading]);
}
