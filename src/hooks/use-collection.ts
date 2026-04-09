"use client";

import { useEffect, useState } from "react";
import { onSnapshot, query, orderBy } from "firebase/firestore";
import { inventoryCol } from "@/lib/firestore";
import { CollectionEntry } from "@/types/card";
import { useAuth } from "@/lib/auth-context";

export function useCollection() {
  const { user } = useAuth();
  const [cards, setCards] = useState<CollectionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const q = query(inventoryCol(user.uid), orderBy("base_code"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const entries: CollectionEntry[] = snapshot.docs.map((doc) => ({
          print_id: doc.id,
          ...doc.data(),
        } as CollectionEntry));
        setCards(entries);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("Collection listener error:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  return { cards, loading, error };
}
