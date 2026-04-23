"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { auth } from "@/lib/firebase";
import { setDoc, increment, serverTimestamp } from "firebase/firestore";
import { inventoryDoc } from "@/lib/firestore";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserMenu } from "@/components/auth/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";

interface Match {
  print_id: string;
  base_code: string;
  name: string;
  rarity: string;
  color: string;
  image_url: string;
  variant_label: string;
  distance: number;
  confidence: number;
}

interface IdentifyResponse {
  success: boolean;
  query_hash?: string;
  index_size?: number;
  matches: Match[];
  error?: string;
}

export default function ScanPage() {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const handleFile = async (file: File) => {
    setError(null);
    setMatches(null);
    setPreview(URL.createObjectURL(file));
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setError("Not signed in.");
        return;
      }
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/scan/identify", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data: IdentifyResponse = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? `Identify failed (${res.status})`);
        return;
      }
      setMatches(data.matches);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (match: Match) => {
    if (!user) return;
    const ref = inventoryDoc(user.uid, match.print_id);
    await setDoc(
      ref,
      {
        print_id: match.print_id,
        base_code: match.base_code,
        name: match.name,
        set_id: match.base_code.split("-")[0] ?? "",
        rarity: match.rarity,
        color: match.color,
        image_url: match.image_url,
        quantity: increment(1),
        lastUpdated: serverTimestamp(),
      },
      { merge: true }
    );
    setAddedIds((prev) => new Set(prev).add(match.print_id));
  };

  const reset = () => {
    setPreview(null);
    setMatches(null);
    setError(null);
    setAddedIds(new Set());
    if (inputRef.current) inputRef.current.value = "";
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/collection" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              ← Collection
            </Link>
            <h1 className="text-lg font-semibold tracking-tight">Scan</h1>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-6">
        <div className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button
            size="lg"
            className="w-full h-14 text-base"
            onClick={() => inputRef.current?.click()}
            disabled={loading}
          >
            {loading ? "Identifying…" : matches ? "Scan another" : "Scan a card"}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Frame the card so it fills most of the photo. Works best with a flat background.
          </p>
        </div>

        {preview && (
          <div className="relative aspect-[63/88] max-w-xs mx-auto overflow-hidden rounded-xl border">
            <Image src={preview} alt="Scanned card" fill className="object-cover" unoptimized />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
            {error.includes("Hash index empty") && (
              <p className="mt-1 text-xs">Have the admin run <code>/api/catalog/hash-backfill</code>.</p>
            )}
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[63/88] rounded-xl" />
            ))}
          </div>
        )}

        {matches && matches.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Top matches</h2>
              <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground">
                Clear
              </button>
            </div>
            <ul className="space-y-2">
              {matches.map((m, idx) => {
                const added = addedIds.has(m.print_id);
                const confPct = Math.round(m.confidence * 100);
                return (
                  <li
                    key={m.print_id}
                    className="flex items-center gap-3 rounded-lg border bg-card p-2"
                  >
                    <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                      {m.image_url && (
                        <Image
                          src={`/api/img/${m.print_id}`}
                          alt={m.name}
                          fill
                          sizes="56px"
                          className="object-cover"
                          unoptimized
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{m.name || m.print_id}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {m.base_code}
                        {m.variant_label ? ` · ${m.variant_label}` : ""}
                        {m.rarity ? ` · ${m.rarity}` : ""}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {idx === 0 ? "Best · " : ""}
                        {confPct}% match (d={m.distance})
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={added ? "secondary" : idx === 0 ? "default" : "outline"}
                      onClick={() => handleAdd(m)}
                      disabled={added}
                    >
                      {added ? "Added" : "+1"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
