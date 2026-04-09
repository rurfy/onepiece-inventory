"use client";

import { CollectionEntry } from "@/types/card";
import { CardTile } from "./card-tile";

interface CardGridProps {
  cards: CollectionEntry[];
  prices: Map<string, { market_price: number | null }>;
  onQuantityChange: (printId: string, delta: number) => void;
}

export function CardGrid({ cards, prices, onQuantityChange }: CardGridProps) {
  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <p className="text-lg">No cards in your collection</p>
        <p className="text-sm mt-1">Cards scanned by project-o will appear here automatically</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {cards.map((card) => (
        <CardTile
          key={card.print_id}
          card={card}
          price={prices.get(card.print_id)?.market_price ?? null}
          onQuantityChange={onQuantityChange}
        />
      ))}
    </div>
  );
}
