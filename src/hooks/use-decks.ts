"use client";

import { useEffect, useState, useCallback } from "react";
import { onSnapshot, addDoc, deleteDoc } from "firebase/firestore";
import { decksCol, deckDoc } from "@/lib/firestore";
import { useAuth } from "@/lib/auth-context";
import { Deck, DeckCard } from "@/types/card";

export function useDecks() {
  const { user } = useAuth();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(decksCol(user.uid), (snapshot) => {
      const items: Deck[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as Deck));
      setDecks(items.sort((a, b) => (b.created_at || 0) - (a.created_at || 0)));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const createDeck = useCallback(async (name: string, description: string, cards: DeckCard[]) => {
    if (!user) return;
    await addDoc(decksCol(user.uid), {
      name,
      description,
      cards,
      created_at: Date.now(),
    });
  }, [user]);

  const removeDeck = useCallback(async (deckId: string) => {
    if (!user) return;
    await deleteDoc(deckDoc(user.uid, deckId));
  }, [user]);

  return { decks, loading, createDeck, removeDeck };
}
