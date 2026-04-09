export interface ParsedCard {
  card_code: string;
  quantity: number;
}

export interface ParseResult {
  cards: ParsedCard[];
  errors: string[];
}

export function parseDeckList(text: string): ParseResult {
  const cards: ParsedCard[] = [];
  const errors: string[] = [];
  const lines = text.trim().split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("//") || line.startsWith("#")) continue;

    let match: RegExpMatchArray | null;

    // Format: "4x OP01-001" or "4X OP01-001"
    match = line.match(/^(\d+)\s*[xX]\s+([A-Z]+\d*-?\d+)/);
    if (match) {
      cards.push({ card_code: match[2], quantity: parseInt(match[1]) });
      continue;
    }

    // Format: "OP01-001 x4" or "OP01-001 X4"
    match = line.match(/^([A-Z]+\d*-?\d+)\s*[xX]\s*(\d+)/);
    if (match) {
      cards.push({ card_code: match[1], quantity: parseInt(match[2]) });
      continue;
    }

    // Format: "4 OP01-001" (quantity space code)
    match = line.match(/^(\d+)\s+([A-Z]+\d*-?\d+)/);
    if (match) {
      cards.push({ card_code: match[2], quantity: parseInt(match[1]) });
      continue;
    }

    // Format: just a card code (assumes qty 1)
    match = line.match(/^([A-Z]+\d*-?\d+)$/);
    if (match) {
      cards.push({ card_code: match[1], quantity: 1 });
      continue;
    }

    errors.push(`Line ${i + 1}: Could not parse "${line}"`);
  }

  // Merge duplicates
  const merged = new Map<string, number>();
  for (const card of cards) {
    merged.set(card.card_code, (merged.get(card.card_code) ?? 0) + card.quantity);
  }

  return {
    cards: Array.from(merged.entries()).map(([card_code, quantity]) => ({ card_code, quantity })),
    errors,
  };
}
