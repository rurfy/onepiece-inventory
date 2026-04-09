"use client";

import { CollectionEntry } from "@/types/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Image from "next/image";
import Link from "next/link";
import { Minus, Plus } from "lucide-react";
import { motion } from "framer-motion";

interface CardTileProps {
  card: CollectionEntry;
  price: number | null;
  onQuantityChange: (printId: string, delta: number) => void;
}

export function CardTile({ card, price, onQuantityChange }: CardTileProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Link href={`/cards/${card.print_id}`}>
        <Card className="group overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
          <div className="relative aspect-[63/88] bg-muted">
            {card.image_url ? (
              <Image
                src={card.image_url}
                alt={card.name}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                No image
              </div>
            )}
            <Badge className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm text-foreground">
              x{card.quantity}
            </Badge>
          </div>
          <div className="p-3 space-y-1">
            <p className="text-xs text-muted-foreground font-mono">{card.base_code}</p>
            <p className="text-sm font-medium truncate">{card.name}</p>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-primary">
                {price != null ? `$${price.toFixed(2)}` : "—"}
              </span>
              <div className="flex gap-1" onClick={(e) => e.preventDefault()}>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.preventDefault();
                    onQuantityChange(card.print_id, -1);
                  }}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.preventDefault();
                    onQuantityChange(card.print_id, 1);
                  }}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}
