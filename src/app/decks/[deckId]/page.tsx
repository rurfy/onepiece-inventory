"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getDoc } from "firebase/firestore";
import { deckDoc } from "@/lib/firestore";
import { useAuth } from "@/lib/auth-context";
import { useCollection } from "@/hooks/use-collection";
import { usePrices } from "@/hooks/use-price";
import { Deck, DeckEntry } from "@/types/card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Check, X } from "lucide-react";
import Link from "next/link";

export default function DeckDetailPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const { user } = useAuth();
  const { cards: inventory } = useCollection();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getDoc(deckDoc(user.uid, deckId)).then((snap) => {
      if (snap.exists()) {
        setDeck({ id: snap.id, ...snap.data() } as Deck);
      }
      setLoading(false);
    });
  }, [user, deckId]);

  // Build coverage entries
  const entries: DeckEntry[] = (deck?.cards ?? []).map((dc) => {
    const owned = inventory.find((c) => c.base_code === dc.card_code);
    return {
      card_code: dc.card_code,
      quantity_needed: dc.quantity,
      quantity_owned: Math.min(owned?.quantity ?? 0, dc.quantity),
      is_owned: (owned?.quantity ?? 0) >= dc.quantity,
      price: null,
      name: owned?.name ?? dc.card_code,
      image_url: owned?.image_url ?? "",
    };
  });

  // Get prices for all deck cards
  const printIds = inventory
    .filter((c) => entries.some((e) => e.card_code === c.base_code))
    .map((c) => c.print_id);
  const { prices } = usePrices(printIds);

  const ownedEntries = entries.filter((e) => e.is_owned);
  const missingEntries = entries.filter((e) => !e.is_owned);
  const totalNeeded = entries.reduce((s, e) => s + e.quantity_needed, 0);
  const totalOwned = entries.reduce((s, e) => s + e.quantity_owned, 0);
  const pct = totalNeeded > 0 ? Math.round((totalOwned / totalNeeded) * 100) : 0;

  // Tradeable extras: cards where inventory quantity > deck requirement
  const extras = inventory
    .filter((c) => {
      const deckCard = deck?.cards.find((dc) => dc.card_code === c.base_code);
      return deckCard && c.quantity > deckCard.quantity;
    })
    .map((c) => {
      const deckCard = deck!.cards.find((dc) => dc.card_code === c.base_code)!;
      return {
        ...c,
        surplus: c.quantity - deckCard.quantity,
      };
    });

  // Calculate cost to complete (using available price data)
  const costToComplete = missingEntries.reduce((total, entry) => {
    const invCard = inventory.find((c) => c.base_code === entry.card_code);
    if (!invCard) return total;
    const price = prices.get(invCard.print_id);
    const missing = entry.quantity_needed - entry.quantity_owned;
    return total + (price?.market_price ?? 0) * missing;
  }, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Deck not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/decks">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold truncate">{deck.name}</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-6">
        {/* Summary */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold">{pct}%</p>
              <p className="text-sm text-muted-foreground">
                {totalOwned}/{totalNeeded} cards owned
              </p>
            </div>
            {costToComplete > 0 && (
              <div className="text-right">
                <p className="text-xl font-bold text-primary">${costToComplete.toFixed(2)}</p>
                <p className="text-sm text-muted-foreground">to complete</p>
              </div>
            )}
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </Card>

        {/* Missing Cards */}
        {missingEntries.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <X className="h-4 w-4 text-destructive" />
              Missing ({missingEntries.length})
            </h2>
            {missingEntries.map((entry) => (
              <Card key={entry.card_code} className="p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{entry.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{entry.card_code}</p>
                </div>
                <div className="text-right">
                  <Badge variant="destructive" className="text-xs">
                    {entry.quantity_owned}/{entry.quantity_needed}
                  </Badge>
                </div>
              </Card>
            ))}
          </section>
        )}

        {/* Owned Cards */}
        {ownedEntries.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500" />
              Owned ({ownedEntries.length})
            </h2>
            {ownedEntries.map((entry) => (
              <Card key={entry.card_code} className="p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{entry.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{entry.card_code}</p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {entry.quantity_owned}/{entry.quantity_needed}
                </Badge>
              </Card>
            ))}
          </section>
        )}

        {/* Tradeable Extras */}
        {extras.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Tradeable Extras ({extras.length})
            </h2>
            {extras.map((card) => (
              <Card key={card.print_id} className="p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{card.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{card.base_code}</p>
                </div>
                <Badge variant="outline" className="text-xs">
                  +{card.surplus} extra
                </Badge>
              </Card>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
