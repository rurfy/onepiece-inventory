"use client";

import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { summaryDoc } from "@/lib/firestore";
import { CollectionSummary } from "@/types/card";
import { useAuth } from "@/lib/auth-context";

export function useCollectionSummary() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<CollectionSummary | null>(null);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(summaryDoc(user.uid), (snap) => {
      if (snap.exists()) {
        setSummary(snap.data() as CollectionSummary);
      }
    });

    return () => unsubscribe();
  }, [user]);

  return summary;
}
