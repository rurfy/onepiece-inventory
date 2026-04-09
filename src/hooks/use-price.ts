"use client";

import { useEffect, useMemo, useState } from "react";
import { getDoc } from "firebase/firestore";
import { pricesDoc } from "@/lib/firestore";
import { Price } from "@/types/card";

const priceCache = new Map<string, { price: Price; fetchedAt: number }>();
const inFlight = new Set<string>();

function getCached(printId: string): Price | null {
  const cached = priceCache.get(printId);
  if (cached && Date.now() - cached.fetchedAt < 3600000) {
    return cached.price;
  }
  return null;
}

export function usePrice(printId: string | null) {
  const cached = printId ? getCached(printId) : null;
  const [price, setPrice] = useState<Price | null>(cached);

  useEffect(() => {
    if (!printId) return;

    // Already have fresh cache
    if (getCached(printId)) return;

    // Deduplicate in-flight requests
    if (inFlight.has(printId)) return;

    inFlight.add(printId);

    const fetchPrice = async () => {
      try {
        const snap = await getDoc(pricesDoc(printId));
        if (snap.exists()) {
          const data = snap.data() as Price;
          priceCache.set(printId, { price: data, fetchedAt: Date.now() });
          setPrice(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        inFlight.delete(printId);
      }
    };

    fetchPrice();
  }, [printId]);

  return { price };
}

export function usePrices(printIds: string[]) {
  const key = useMemo(() => printIds.join(","), [printIds]);
  const [prices, setPrices] = useState<Map<string, Price>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (printIds.length === 0) return;

    const uncached = printIds.filter((id) => !getCached(id));

    // Set cached prices immediately
    const initial = new Map<string, Price>();
    printIds.forEach((id) => {
      const c = getCached(id);
      if (c) initial.set(id, c);
    });

    if (uncached.length === 0) {
      setPrices(initial);
      return;
    }

    setLoading(true);

    Promise.all(
      uncached.map(async (id) => {
        if (inFlight.has(id)) return null;
        inFlight.add(id);
        try {
          const snap = await getDoc(pricesDoc(id));
          if (snap.exists()) {
            const data = snap.data() as Price;
            priceCache.set(id, { price: data, fetchedAt: Date.now() });
            return [id, data] as const;
          }
        } finally {
          inFlight.delete(id);
        }
        return null;
      })
    ).then((results) => {
      const next = new Map(initial);
      results.forEach((r) => {
        if (r) next.set(r[0], r[1]);
      });
      setPrices(next);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { prices, loading };
}
