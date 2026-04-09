"use client";

import { useCollectionSummary } from "@/hooks/use-collection-summary";
import { Skeleton } from "@/components/ui/skeleton";

export function CollectionValue() {
  const summary = useCollectionSummary();

  if (!summary) {
    return (
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <div>
        <p className="text-2xl font-bold tracking-tight">
          ${summary.totalValue.toFixed(2)}
        </p>
        <p className="text-xs text-muted-foreground">Collection Value</p>
      </div>
      <div className="h-8 w-px bg-border" />
      <div>
        <p className="text-2xl font-bold tracking-tight">{summary.totalCards}</p>
        <p className="text-xs text-muted-foreground">Cards</p>
      </div>
    </div>
  );
}
