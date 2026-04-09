import { Skeleton } from "@/components/ui/skeleton";

interface PriceBadgeProps {
  price: number | null;
  loading?: boolean;
}

export function PriceBadge({ price, loading }: PriceBadgeProps) {
  if (loading) {
    return <Skeleton className="h-4 w-12" />;
  }

  if (price == null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <span className="text-sm font-semibold text-primary">
      ${price.toFixed(2)}
    </span>
  );
}
