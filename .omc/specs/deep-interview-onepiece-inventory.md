# Deep Interview Spec: One Piece Card Collection Manager

## Metadata
- Interview ID: di-onepiece-inventory-2026-04-07
- Rounds: 12
- Final Ambiguity Score: 17%
- Type: brownfield
- Generated: 2026-04-07T17:55:00Z
- Threshold: 20%
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.85 | 0.35 | 0.298 |
| Constraint Clarity | 0.80 | 0.25 | 0.200 |
| Success Criteria | 0.85 | 0.25 | 0.213 |
| Context Clarity | 0.82 | 0.15 | 0.123 |
| **Total Clarity** | | | **0.833** |
| **Ambiguity** | | | **16.7%** |

## Goal

Build a state-of-the-art, Apple-minimal-style web + mobile frontend for managing a One Piece TCG card collection. The app is a **public product** where any collector can sign up, track their cards with real-time market prices from TCGPlayer, and check deck coverage by importing decklists. Card data enters the system via a shared Firestore database written to by project-o (a physical card sorting machine) and is displayed with on-demand price lookups cached for ~1 hour.

### Core Pillars (MVP / v1)
1. **Collection Management** — View, search, filter, and sort your card inventory with quantities. Cards are added via project-o's Firestore writes.
2. **Price Tracking** — On-demand TCGPlayer market prices, cached ~1 hour. Total collection value, per-card pricing.
3. **Deck Coverage Checker** — Paste/import a decklist, see detailed breakdown: owned vs missing cards, quantity needed vs owned, per-card price, total cost to complete, and tradeable extras.

### Deferred to v2+
- Social features (compare collections, trade suggestions)
- In-app card scanning (phone camera)
- In-app deck builder UI
- Price trend charts / historical data
- Notifications (price alerts, deck completion)

## Constraints
- **Platforms:** Web + mobile only (remove Windows, Linux, macOS desktop targets)
- **Mobile delivery:** Framework recommendation (likely PWA or responsive web — see Tech Recommendation below)
- **Tech stack:** Open to recommendation (currently Flutter, user is open to switching)
- **Backend:** Firebase (Firestore + Auth) — existing infrastructure, shared with project-o
- **Price source:** TCGPlayer API
- **Price freshness:** On-demand refresh, cached ~1 hour. No real-time streaming required.
- **Auth:** Social providers — Google, Apple, Discord via Firebase Auth
- **Visual style:** Apple-style minimal — whitespace, subtle animations, rounded cards, soft shadows, light/dark mode
- **Integration:** project-o writes card scan results directly to Firestore; this app reads via Firestore listeners
- **Existing data model:** Firestore collections `inventory/{uid}/cards`, `prints/{print_id}`, `prices/{print_id}`

## Non-Goals
- No desktop app (Windows, Linux, macOS native)
- No in-app camera scanning (project-o handles physical scanning)
- No real-time/streaming price updates (on-demand is sufficient)
- No social features in v1 (compare, trade, share)
- No in-app deck builder (import only)
- No price alerts or notifications in v1

## Acceptance Criteria
- [ ] Users can sign up/log in via Google, Apple, or Discord
- [ ] Users see their full card collection in a clean, searchable, filterable list/grid
- [ ] Cards display: image, name, code, set, rarity, color, quantity owned, market price
- [ ] Collection can be sorted by: name, code, quantity, price, rarity, set
- [ ] Total collection value is displayed (sum of all card prices × quantities)
- [ ] Card prices load on-demand from TCGPlayer API and cache for ~1 hour
- [ ] Card detail view shows full card info, variants, and current price
- [ ] Users can paste/import a decklist (text format from sites like one-piece-tcg-decks.com)
- [ ] Deck coverage view shows: cards grouped by owned/missing, quantity needed vs owned, per-card price, total cost to complete, tradeable extras
- [ ] Multiple saved decklists supported
- [ ] Cards added by project-o (via shared Firestore) appear in real-time via Firestore listeners
- [ ] Users can manually adjust card quantities (+/-)
- [ ] UI follows Apple-minimal design: whitespace, subtle animations, rounded cards, soft shadows
- [ ] Light and dark mode supported
- [ ] Works on web browsers (desktop + mobile)
- [ ] Responsive design adapts cleanly from phone to desktop viewport

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| Phone camera scanning needed | Round 1: Does the user scan with phone or receive from project-o? | Receive from project-o only — no in-app scanning |
| Real-time price streaming needed | Round 6 (Simplifier): TCGPlayer prices don't change by the second — is real-time actually needed? | On-demand refresh with ~1hr cache is sufficient |
| Flutter is the right framework | Round 4 (Contrarian): Is Flutter conviction or inertia? | User is open to suggestions — tech stack can change |
| Single-user personal tool | Round 9 (Ontologist): Is this personal or public? | Public product — real auth, multi-user, social later |
| Full feature set needed for launch | Round 10: What's the MVP? | Collection + prices + decks for v1. Social deferred. |
| Simple deck checklist sufficient | Round 12: What does deck coverage look like? | Detailed breakdown with owned/missing grouping, quantities, prices, and tradeable extras |

## Technical Context

### Current State (Brownfield)
- **Framework:** Flutter (Dart 3.9), 734 lines across 2 files (`lib/main.dart`, `lib/firebase_options.dart`)
- **Backend:** Firebase project `one-piece-card-database` (ID: 325621015091)
- **Database:** Firestore with collections: `inventory/{uid}/cards`, `prints/{print_id}`, `prices/{print_id}`
- **Auth:** Anonymous sign-in (to be replaced with social providers)
- **State management:** `setState()` — no state management library
- **UI:** Material Design 3 with red seed color, list/grid toggle, search by code prefix
- **Price integration:** Placeholder Cloud Function URL for `priceRefresh`
- **Scanner:** FAB with "coming soon" placeholder

### project-o Integration
- **What it does:** Physical card sorting machine using OpenCV + perceptual hashing to identify One Piece TCG cards
- **Output:** `(base_code, confidence)` per card, logged to JSONL session files
- **Integration path:** project-o will be modified to write directly to the shared Firestore database
- **Card code format:** `{Band}{Set:02d}-{Card:03d}` (e.g., OP01-001, ST03-012, P-014)
- **Bands:** OP (main), EB (extra booster), ST (starter), PRB (premium), P (promo)

### Tech Stack Recommendation
Given the requirements (Apple-minimal UI, web + mobile, public product, Firestore backend):

**Recommended: Next.js + PWA**
- Next.js (App Router) for the web app with responsive design
- PWA capabilities for mobile installation (add to home screen)
- Tailwind CSS + shadcn/ui for Apple-minimal design system
- Firebase JS SDK for Firestore + Auth
- Server-side rendering for SEO and fast initial loads
- Single codebase serves both web and mobile users

**Why not Flutter:**
- Flutter web has larger bundle sizes and slower initial loads
- Limited SEO capability
- Smaller ecosystem for web-specific UI patterns
- The existing codebase is only 734 lines — migration cost is low

**Why not React Native:**
- Adds native app complexity (app store submissions, native builds)
- A well-built PWA covers the mobile use case for a collection tracker
- Avoids maintaining two deployment targets

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| User | core domain | uid, email, displayName, auth_provider, avatar | User has one Collection, User has many Decks |
| Card | core domain | base_code, name, set_id, rarity, color, type, cost, power, card_text, image_url, variant_key, variant_label | Card has many Variants, Card has Price |
| Collection (Inventory) | core domain | user_id, cards[], total_value, lastUpdated | Collection belongs to User, Collection has many CollectionEntries |
| CollectionEntry | core domain | card_id (print_id), quantity, lastUpdated | Links Collection to Card with quantity |
| Price | supporting | market_price, inventory_price, fetchedAt, source=TCGPlayer | Price belongs to Card |
| Deck | core domain | name, description, card_list[], created_at | Deck belongs to User, Deck contains many DeckEntries |
| DeckEntry | supporting | card_code, quantity_needed, quantity_owned, is_owned, price | Links Deck to Card with coverage data |
| TCGPlayer | external system | API endpoint, price data | Provides Price data |
| project-o | external system | base_code, confidence, session_log | Feeds CollectionEntries into Collection via Firestore |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 5 | 5 | - | - | N/A |
| 2 | 6 | 1 | 0 | 5 | 83% |
| 3 | 7 | 1 | 0 | 6 | 86% |
| 4-8 | 7 | 0 | 0 | 7 | 100% |
| 9 | 8 | 1 | 0 | 7 | 88% |
| 10-12 | 8 | 0 | 0 | 8 | 100% |

Ontology converged at round 4 and remained stable through round 12, with one addition (User) at round 9 when scope expanded to public product.

## Interview Transcript
<details>
<summary>Full Q&A (12 rounds)</summary>

### Round 1
**Q:** When a user scans a card (via project-o or a phone camera), what exactly should happen step-by-step in this app?
**A:** Receive from project-o — project-o sends scan results (base_code + confidence) to the app over the network, app auto-updates inventory.
**Ambiguity:** 100% → scored after answer

### Round 2
**Q:** If I showed you the finished app tomorrow, what would make you say 'yes, that's exactly what I wanted'?
**A:** All of the above — collection with live prices, deck coverage checking, AND beautiful card browser.
**Ambiguity:** 76% (Goal: 0.40, Constraints: 0.15, Criteria: 0.35, Context: 0.50)

### Round 3
**Q:** Where should 'almost real-time' card prices come from?
**A:** TCGPlayer API
**Ambiguity:** 58% (Goal: 0.45, Constraints: 0.35, Criteria: 0.35, Context: 0.55)

### Round 4 (Contrarian Mode)
**Q:** Your current app is Flutter. You want 'state of the art' on web + mobile. Would you consider switching frameworks?
**A:** Open to suggestions — recommend what gives the best result.
**Ambiguity:** 55% (Goal: 0.50, Constraints: 0.40, Criteria: 0.35, Context: 0.55)

### Round 5
**Q:** When you say 'state of the art' and 'clean' — can you point to an existing app whose look and feel you admire?
**A:** Apple-style minimal — whitespace, subtle animations, rounded cards, soft shadows, light/dark mode.
**Ambiguity:** 50% (Goal: 0.50, Constraints: 0.40, Criteria: 0.55, Context: 0.55)

### Round 6 (Simplifier Mode)
**Q:** How fresh do card prices actually need to be?
**A:** On-demand refresh — prices load when opening the app or viewing a card, cached for ~1 hour.
**Ambiguity:** 45% (Goal: 0.50, Constraints: 0.60, Criteria: 0.55, Context: 0.60)

### Round 7
**Q:** How do you imagine deck management working?
**A:** Paste/import decklist from sites like one-piece-tcg-decks.com, then see owned vs missing cards with costs.
**Ambiguity:** 38% (Goal: 0.65, Constraints: 0.60, Criteria: 0.60, Context: 0.60)

### Round 8 (Ontologist Mode)
**Q:** project-o currently only writes local JSONL session logs — it has no API. How should scan results get to this app?
**A:** Shared Firestore — modify project-o to write directly to the same Firestore database.
**Ambiguity:** 34% (Goal: 0.70, Constraints: 0.60, Criteria: 0.60, Context: 0.80)

### Round 9
**Q:** Is this a personal tool just for you, or a public product?
**A:** Public product — anyone should be able to sign up, track their collection, and potentially trade/compare.
**Ambiguity:** 31% (Goal: 0.70, Constraints: 0.70, Criteria: 0.60, Context: 0.80)

### Round 10
**Q:** What's the MVP — the minimum version you'd actually launch with?
**A:** Collection + prices + decks. Social/compare features come later.
**Ambiguity:** 24% (Goal: 0.80, Constraints: 0.70, Criteria: 0.75, Context: 0.80)

### Round 11
**Q:** How should users sign up and log in?
**A:** Social providers — Google, Apple, maybe Discord.
**Ambiguity:** 21% (Goal: 0.80, Constraints: 0.80, Criteria: 0.75, Context: 0.82)

### Round 12
**Q:** For the deck coverage checker, what exactly should you see?
**A:** Detailed breakdown — group by owned/missing, quantity needed vs owned, per-card price, total cost to complete, tradeable extras.
**Ambiguity:** 17% (Goal: 0.85, Constraints: 0.80, Criteria: 0.85, Context: 0.82)

</details>
