"use client";

import { useDecks } from "@/hooks/use-decks";
import { useCollection } from "@/hooks/use-collection";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UserMenu } from "@/components/auth/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

export default function DecksPage() {
  const { decks, loading, removeDeck } = useDecks();
  const { cards } = useCollection();

  // Calculate completion for each deck
  const deckStats = decks.map((deck) => {
    const totalNeeded = deck.cards.reduce((sum, c) => sum + c.quantity, 0);
    const totalOwned = deck.cards.reduce((sum, c) => {
      const owned = cards.find((inv) => inv.base_code === c.card_code);
      return sum + Math.min(owned?.quantity ?? 0, c.quantity);
    }, 0);
    const pct = totalNeeded > 0 ? Math.round((totalOwned / totalNeeded) * 100) : 0;
    return { ...deck, totalNeeded, totalOwned, pct };
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/collection">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-lg font-semibold tracking-tight">Decks</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/decks/import">
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Import Deck
              </Button>
            </Link>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))
        ) : decks.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg">No decks yet</p>
            <p className="text-sm mt-1">Import a decklist to check which cards you own</p>
            <Link href="/decks/import">
              <Button className="mt-4 gap-2">
                <Plus className="h-4 w-4" />
                Import Deck
              </Button>
            </Link>
          </div>
        ) : (
          deckStats.map((deck) => (
            <motion.div
              key={deck.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Link href={`/decks/${deck.id}`}>
                <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="font-semibold">{deck.name}</h3>
                      {deck.description && (
                        <p className="text-sm text-muted-foreground">{deck.description}</p>
                      )}
                      <p className="text-sm">
                        <span className="font-medium">{deck.pct}%</span>
                        <span className="text-muted-foreground ml-1">
                          complete ({deck.totalOwned}/{deck.totalNeeded} cards)
                        </span>
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (confirm("Delete this deck?")) removeDeck(deck.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${deck.pct}%` }}
                    />
                  </div>
                </Card>
              </Link>
            </motion.div>
          ))
        )}
      </main>
    </div>
  );
}
