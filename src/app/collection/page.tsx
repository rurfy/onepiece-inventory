"use client";

import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCollection } from "@/hooks/use-collection";
import { usePrices } from "@/hooks/use-price";
import { CollectionValue } from "@/components/collection-value";
import { CardGrid } from "@/components/collection/card-grid";
import { SearchBar } from "@/components/collection/search-bar";
import { SortControls, SortBy, SortDir } from "@/components/collection/sort-controls";
import { UserMenu } from "@/components/auth/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { runTransaction, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { inventoryDoc } from "@/lib/firestore";
import Link from "next/link";

export default function CollectionPage() {
  const { user } = useAuth();
  const { cards, loading, error } = useCollection();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("sortBy") as SortBy) || "base_code";
    }
    return "base_code";
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("sortDir") as SortDir) || "asc";
    }
    return "asc";
  });

  const printIds = useMemo(() => cards.map((c) => c.print_id), [cards]);
  const { prices } = usePrices(printIds);

  const handleSortByChange = useCallback((value: SortBy) => {
    setSortBy(value);
    localStorage.setItem("sortBy", value);
  }, []);

  const handleSortDirChange = useCallback((value: SortDir) => {
    setSortDir(value);
    localStorage.setItem("sortDir", value);
  }, []);

  const filteredAndSorted = useMemo(() => {
    let result = cards;

    // Filter
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.base_code.toLowerCase().startsWith(q)
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "base_code":
          cmp = a.base_code.localeCompare(b.base_code);
          break;
        case "quantity":
          cmp = a.quantity - b.quantity;
          break;
        case "price": {
          const pa = prices.get(a.print_id)?.market_price ?? 0;
          const pb = prices.get(b.print_id)?.market_price ?? 0;
          cmp = pa - pb;
          break;
        }
        case "rarity":
          cmp = a.rarity.localeCompare(b.rarity);
          break;
        case "set_id":
          cmp = a.set_id.localeCompare(b.set_id);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [cards, search, sortBy, sortDir, prices]);

  const handleQuantityChange = useCallback(
    async (printId: string, delta: number) => {
      if (!user) return;
      const ref = inventoryDoc(user.uid, printId);

      if (delta < 0) {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          const qty = snap.data()?.quantity ?? 0;
          if (qty + delta <= 0) {
            tx.delete(ref);
          } else {
            tx.update(ref, { quantity: increment(delta) });
          }
        });
      } else {
        const { updateDoc } = await import("firebase/firestore");
        await updateDoc(ref, { quantity: increment(delta) });
      }
    },
    [user]
  );

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-semibold tracking-tight">Collection</h1>
            <CollectionValue />
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/decks"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Decks
            </Link>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Controls */}
      <div className="container mx-auto px-4 py-4 flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <SearchBar onSearch={setSearch} />
        </div>
        <SortControls
          sortBy={sortBy}
          sortDir={sortDir}
          onSortByChange={handleSortByChange}
          onSortDirChange={handleSortDirChange}
        />
      </div>

      {/* Content */}
      <main className="container mx-auto px-4 pb-8">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[63/88] rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20 text-destructive">
            <p>Error loading collection</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        ) : (
          <CardGrid
            cards={filteredAndSorted}
            prices={prices}
            onQuantityChange={handleQuantityChange}
          />
        )}
      </main>
    </div>
  );
}
