"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown } from "lucide-react";

export type SortBy = "name" | "base_code" | "quantity" | "price" | "rarity" | "set_id";
export type SortDir = "asc" | "desc";

interface SortControlsProps {
  sortBy: SortBy;
  sortDir: SortDir;
  onSortByChange: (sortBy: SortBy) => void;
  onSortDirChange: (sortDir: SortDir) => void;
}

const sortOptions: { value: SortBy; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "base_code", label: "Code" },
  { value: "quantity", label: "Quantity" },
  { value: "price", label: "Price" },
  { value: "rarity", label: "Rarity" },
  { value: "set_id", label: "Set" },
];

export function SortControls({ sortBy, sortDir, onSortByChange, onSortDirChange }: SortControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <Select value={sortBy} onValueChange={(v) => onSortByChange(v as SortBy)}>
        <SelectTrigger className="w-[130px] h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sortOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9"
        onClick={() => onSortDirChange(sortDir === "asc" ? "desc" : "asc")}
      >
        {sortDir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
      </Button>
    </div>
  );
}
