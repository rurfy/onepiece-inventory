export interface Card {
  base_code: string;
  name: string;
  set_id: string;
  rarity: string;
  color: string;
  type: string;
  cost: string;
  power: string;
  card_text: string;
  image_url: string;
  variant_key: string;
  variant_label: string;
}

export interface CollectionEntry {
  print_id: string;
  base_code: string;
  name: string;
  set_id: string;
  rarity: string;
  color: string;
  image_url: string;
  quantity: number;
  lastUpdated: number;
}

export interface Price {
  market_price: number | null;
  inventory_price: number | null;
  fetchedAt: number;
}

export interface CollectionSummary {
  totalValue: number;
  totalCards: number;
  lastUpdated: number;
}

export interface Deck {
  id: string;
  name: string;
  description: string;
  cards: DeckCard[];
  created_at: number;
}

export interface DeckCard {
  card_code: string;
  quantity: number;
}

export interface DeckEntry {
  card_code: string;
  quantity_needed: number;
  quantity_owned: number;
  is_owned: boolean;
  price: number | null;
  name: string;
  image_url: string;
}
