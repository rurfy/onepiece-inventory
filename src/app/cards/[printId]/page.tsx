"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getDoc, query, where, getDocs, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { usePrice } from "@/hooks/use-price";
import { printsDoc, inventoryDoc } from "@/lib/firestore";
import { Card as CardType, CollectionEntry } from "@/types/card";
import { Button } from "@/components/ui/button";

import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Minus, Plus } from "lucide-react";
import { runTransaction, increment } from "firebase/firestore";
import Image from "next/image";
import { motion } from "framer-motion";

export default function CardDetailPage() {
  const { printId } = useParams<{ printId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [card, setCard] = useState<CardType | null>(null);
  const [entry, setEntry] = useState<CollectionEntry | null>(null);
  const [variants, setVariants] = useState<{ id: string; label: string; image_url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const { price } = usePrice(printId);

  useEffect(() => {
    async function load() {
      const printSnap = await getDoc(printsDoc(printId));
      if (printSnap.exists()) {
        setCard(printSnap.data() as CardType);

        // Load variants
        const baseCode = printSnap.data().base_code;
        if (baseCode) {
          const printsRef = collection(db, "prints");
          const q = query(printsRef, where("base_code", "==", baseCode));
          const variantSnaps = await getDocs(q);
          setVariants(
            variantSnaps.docs.map((d) => ({
              id: d.id,
              label: d.data().variant_label || d.id,
              image_url: d.data().image_url || "",
            }))
          );
        }
      }

      if (user) {
        const invSnap = await getDoc(inventoryDoc(user.uid, printId));
        if (invSnap.exists()) {
          setEntry({ print_id: invSnap.id, ...invSnap.data() } as CollectionEntry);
        }
      }

      setLoading(false);
    }
    load();
  }, [printId, user]);

  const handleQuantityChange = async (delta: number) => {
    if (!user) return;
    const ref = inventoryDoc(user.uid, printId);

    if (delta < 0) {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const qty = snap.data()?.quantity ?? 0;
        if (qty + delta <= 0) {
          tx.delete(ref);
          setEntry(null);
        } else {
          tx.update(ref, { quantity: increment(delta) });
          setEntry((prev) => prev ? { ...prev, quantity: prev.quantity + delta } : null);
        }
      });
    } else {
      const { updateDoc } = await import("firebase/firestore");
      await updateDoc(ref, { quantity: increment(delta) });
      setEntry((prev) => prev ? { ...prev, quantity: prev.quantity + delta } : null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <Skeleton className="h-8 w-24 mb-6" />
        <Skeleton className="aspect-[63/88] max-w-sm mx-auto rounded-2xl" />
      </div>
    );
  }

  if (!card) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Card not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold truncate">{card.name}</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          {/* Card image */}
          <div className="relative aspect-[63/88] max-w-sm mx-auto rounded-2xl overflow-hidden shadow-lg">
            {card.image_url ? (
              <Image src={card.image_url} alt={card.name} fill className="object-cover" sizes="384px" />
            ) : (
              <div className="flex items-center justify-center h-full bg-muted text-muted-foreground">
                No image available
              </div>
            )}
          </div>

          {/* Variant strip */}
          {variants.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => router.push(`/cards/${v.id}`)}
                  className={`relative w-16 h-22 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-all ${
                    v.id === printId ? "border-primary shadow-md" : "border-transparent opacity-60 hover:opacity-100"
                  }`}
                >
                  {v.image_url ? (
                    <Image src={v.image_url} alt={v.label} fill className="object-cover" sizes="64px" />
                  ) : (
                    <div className="w-full h-full bg-muted" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="Code" value={card.base_code} />
            <InfoRow label="Set" value={card.set_id} />
            <InfoRow label="Rarity" value={card.rarity} />
            <InfoRow label="Color" value={card.color} />
            <InfoRow label="Type" value={card.type} />
            <InfoRow label="Cost" value={card.cost} />
            <InfoRow label="Power" value={card.power} />
            <InfoRow
              label="Price"
              value={price?.market_price != null ? `$${price.market_price.toFixed(2)}` : "—"}
            />
          </div>

          {/* Card text */}
          {card.card_text && (
            <div className="bg-muted/50 rounded-xl p-4">
              <p className="text-sm leading-relaxed">{card.card_text}</p>
            </div>
          )}

          {/* Quantity controls */}
          <div className="flex items-center justify-center gap-4 py-4">
            <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => handleQuantityChange(-1)}>
              <Minus className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <p className="text-3xl font-bold">{entry?.quantity ?? 0}</p>
              <p className="text-xs text-muted-foreground">in collection</p>
            </div>
            <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => handleQuantityChange(1)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Price timestamp */}
          {price?.fetchedAt && (
            <p className="text-center text-xs text-muted-foreground">
              Price updated {new Date(price.fetchedAt * 1000).toLocaleString()}
            </p>
          )}
        </motion.div>
      </main>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/30 rounded-lg px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  );
}
