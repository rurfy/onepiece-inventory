"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseDeckList, ParseResult } from "@/lib/decklist-parser";
import { useDecks } from "@/hooks/use-decks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Upload } from "lucide-react";
import Link from "next/link";

export default function ImportDeckPage() {
  const router = useRouter();
  const { createDeck } = useDecks();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [saving, setSaving] = useState(false);

  const handleParse = () => {
    const result = parseDeckList(text);
    setPreview(result);
  };

  const handleSave = async () => {
    if (!preview || preview.cards.length === 0 || !name.trim()) return;
    setSaving(true);
    try {
      await createDeck(
        name.trim(),
        description.trim(),
        preview.cards.map((c) => ({ card_code: c.card_code, quantity: c.quantity }))
      );
      router.push("/decks");
    } catch (error) {
      console.error("Failed to save deck:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/decks">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">Import Deck</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg space-y-6">
        <div className="space-y-3">
          <Input
            placeholder="Deck name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11"
          />
          <Input
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Decklist</label>
          <textarea
            className="w-full min-h-[200px] rounded-xl border bg-muted/50 p-3 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder={`Paste your decklist here...\n\nSupported formats:\n4x OP01-001\nOP01-001 x4\n4 OP01-001\nOP01-001`}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview(null);
            }}
          />
          <Button variant="outline" onClick={handleParse} disabled={!text.trim()} className="w-full">
            Preview
          </Button>
        </div>

        {preview && (
          <Card className="p-4 space-y-3">
            <h3 className="font-medium">
              Preview — {preview.cards.length} unique cards,{" "}
              {preview.cards.reduce((s, c) => s + c.quantity, 0)} total
            </h3>
            {preview.errors.length > 0 && (
              <div className="text-sm text-destructive space-y-1">
                {preview.errors.map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
              </div>
            )}
            <div className="max-h-60 overflow-y-auto space-y-1">
              {preview.cards.map((c) => (
                <div key={c.card_code} className="flex justify-between text-sm py-1 px-2 rounded hover:bg-muted/50">
                  <span className="font-mono">{c.card_code}</span>
                  <span className="text-muted-foreground">x{c.quantity}</span>
                </div>
              ))}
            </div>
            <Button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="w-full gap-2"
            >
              <Upload className="h-4 w-4" />
              {saving ? "Saving..." : "Save Deck"}
            </Button>
          </Card>
        )}
      </main>
    </div>
  );
}
