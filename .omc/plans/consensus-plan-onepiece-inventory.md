# Consensus Plan: One Piece Card Collection Manager

## Source Spec
- Deep Interview: `.omc/specs/deep-interview-onepiece-inventory.md`
- Ambiguity: 17% (PASSED)
- Generated: 2026-04-07

## RALPLAN-DR Summary

### Principles
1. **Mobile-first responsive** — Design for phone viewports first, scale up to desktop
2. **Thin server, thick client** — Next.js provides the app shell, routing, image optimization, and PWA infrastructure via SSR; all authenticated data views (collection, cards, decks) are client-rendered via Firebase `onSnapshot` listeners. SSR benefits apply to the public landing page and login page only — not the data-heavy authenticated pages.
3. **Firestore as source of truth** — All state lives in Firestore; the frontend is a view layer with local cache. No redundant client state stores.
4. **On-demand data fetching** — Prices fetch lazily, not eagerly; minimize API calls and costs
5. **Incremental migration** — Replace Flutter piece by piece; keep Firestore schema compatible with project-o

### Decision Drivers
1. **Fast shell + real-time data** — Public product needs fast initial shell load (SSR) and real-time data views (client-side Firebase listeners). SEO applies to public pages only; authenticated collection pages are not indexable.
2. **Development velocity** — Single developer; minimize framework boilerplate and maximize reusable components
3. **Firestore schema compatibility** — Must work with existing `inventory/{uid}/cards`, `prints/{print_id}`, `prices/{print_id}` collections without migration

### Viable Options

#### Option A: Next.js App Router + PWA (Recommended)
- **Approach:** Next.js 15 with App Router, Tailwind CSS + shadcn/ui, Firebase JS SDK, PWA via serwist
- **Pros:**
  - SSR for app shell, public pages, and login — fast initial load
  - shadcn/ui provides Apple-minimal components out of the box (rounded, soft shadows, clean)
  - PWA covers mobile without app store overhead
  - Rich ecosystem (`next/image`, file-based routing, API routes for Discord OAuth)
  - `next/image` optimizes card images automatically
- **Cons:**
  - Full rewrite (though only 734 lines to replace)
  - RSC/SSR benefits limited to shell and public pages — authenticated data views are client-rendered via Firebase listeners
  - PWA has limited native capabilities vs native app (no push notifications on iOS)
  - Firebase JS SDK bundle size (~50KB gzipped)
- **Honest assessment:** Next.js is chosen for its ecosystem (routing, image optimization, PWA tooling, API routes, Vercel deployment) — not for SSR of data pages. The app is architecturally a "thin server, thick client" SPA with a Next.js shell.

#### Option D: Vite + React SPA (Considered)
- **Approach:** Vite + React + Tailwind + shadcn/ui, deployed as static site on Firebase Hosting
- **Pros:**
  - Simplest architecture — no SSR/RSC complexity, pure client-side
  - Faster builds, smaller framework overhead
  - shadcn/ui + Tailwind work identically
  - Free hosting on Firebase Hosting (static)
  - No server component vs client component confusion
- **Cons:**
  - No `next/image` — must handle card image optimization manually
  - No file-based routing — need react-router
  - No API routes — Discord OAuth Cloud Function needed regardless
  - No built-in PWA tooling — need vite-plugin-pwa
  - Slower initial load (no SSR even for shell)
- **Invalidation rationale:** Vite SPA is a genuinely viable alternative and architecturally simpler. However, Next.js's ecosystem advantages (image optimization, file-based routing, API routes for Discord OAuth, Vercel deployment with edge CDN) provide meaningful developer velocity gains that justify the modest RSC complexity tax. The key deciding factor is `next/image` — card images are the dominant visual element, and automatic optimization matters for a card collection app.

#### Option B: Keep Flutter, modernize
- **Approach:** Refactor existing Flutter app with Riverpod state management, add proper routing, improve web build
- **Pros:**
  - No rewrite needed
  - Single codebase for web + native mobile
  - Dart type safety
- **Cons:**
  - Flutter web bundle size (~2MB+ initial load)
  - Poor SEO (canvas-based rendering)
  - Smaller web component ecosystem
  - "State of the art" web UI is harder to achieve in Flutter
- **Invalidation rationale:** Flutter web's large bundle size and canvas rendering directly conflict with the "state of the art" web requirement and SEO needs of a public product. The existing codebase is only 734 lines, making migration cost negligible.

#### Option C: Remix + Capacitor
- **Approach:** Remix for web with Capacitor for native mobile wrapper
- **Pros:**
  - Excellent web performance
  - Native mobile app via Capacitor
  - Progressive enhancement built-in
- **Cons:**
  - Capacitor adds build complexity and maintenance burden
  - App store submissions required for native
  - Remix has smaller ecosystem than Next.js
- **Invalidation rationale:** Capacitor adds native build complexity that isn't justified — a well-built PWA covers the mobile use case for a collection tracker. Remix's smaller ecosystem means fewer ready-made components for the Apple-minimal design.

## Requirements Summary

### Core Features (MVP)
1. **Auth** — Google, Apple, Discord sign-in via Firebase Auth
2. **Collection View** — Searchable, filterable, sortable card grid/list with quantities and prices
3. **Card Detail** — Full card info, variant selector, price display
4. **Price Integration** — On-demand TCGPlayer prices, cached ~1 hour in Firestore
5. **Deck Coverage** — Import decklist, see owned/missing breakdown with costs
6. **Real-time Sync** — Firestore listeners for project-o card additions
7. **PWA** — Installable on mobile, works offline for cached data

### Tech Stack (Option A)
- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS 4 + shadcn/ui
- **State:** Firebase `onSnapshot` hooks for data state; React `useState`/`useReducer` + `localStorage` for UI state (sort preferences, view mode, filters). No additional state management library.
- **Backend:** Firebase (Firestore + Auth) — existing project `one-piece-card-database`
- **Prices:** Cloud Function (Node.js) calling TCGPlayer API, writes to `prices/{print_id}`
- **PWA:** `serwist` (actively maintained Next.js PWA plugin)
- **Deployment:** Vercel (optimal for Next.js)

## Acceptance Criteria
- [ ] AC1: Users sign up/log in via Google, Apple, or Discord — redirect to collection after auth
- [ ] AC2: Collection page shows cards in responsive grid (2 cols mobile, 4-6 cols desktop) with image, name, code, quantity, price
- [ ] AC3: Search filters cards by name or code prefix in <100ms (client-side filter on loaded data)
- [ ] AC4: Sort by name, code, quantity, price, rarity, set — ascending/descending toggle
- [ ] AC5: Total collection value displayed in header (sum of price × quantity for ALL cards, not limited to a page). Implemented via a Firestore trigger Cloud Function that maintains a `collectionSummary/{uid}` document with `totalValue`, `totalCards`, `lastUpdated`
- [ ] AC6: Card detail page shows: full image, all metadata, variant selector, current TCGPlayer price
- [ ] AC7: Prices load on first view, cache in Firestore `prices/{print_id}` for 1 hour, show "last updated" timestamp
- [ ] AC8: Deck import accepts pasted text (one card per line: `4x OP01-001` or `OP01-001 x4`), parses and saves to Firestore
- [ ] AC9: Deck coverage view groups cards as Owned/Missing, shows qty needed vs owned, per-card price, total cost to complete
- [ ] AC10: Tradeable extras section shows cards owned beyond deck requirements
- [ ] AC11: Multiple decks can be saved, listed, and deleted
- [ ] AC12: Cards added by project-o appear within 2 seconds via Firestore onSnapshot
- [ ] AC13: Manual +/- buttons adjust quantity; quantity 0 removes the card
- [ ] AC14: Light/dark mode toggle with system preference detection
- [ ] AC15: Lighthouse performance score ≥90 on mobile
- [ ] AC16: PWA installable (manifest, service worker, offline shell)

## Implementation Steps

### Stage 0: Project Bootstrap & Validation (2 steps)

**Step 0.1: Verify TCGPlayer API access (GATE — blocks Stage 3+)**
- Create a throwaway script that fetches a price for `OP01-001` from TCGPlayer API
- Verify: API key obtained, One Piece TCG is a supported category, price data shape matches expectations
- If access denied or OPTCG not supported: pivot to CardMarket API or manual price entry before proceeding. Redesign `prices/{print_id}` schema if data shape differs.
- This step MUST complete before any price-dependent UI is built (Stages 2-5 reference price display)

**Step 0.2: Initialize Next.js project**
- Run `npx create-next-app@latest` with TypeScript, Tailwind, App Router, src/ directory
- Remove Flutter files (`lib/`, `pubspec.yaml`, `android/`, `ios/`, `macos/`, `windows/`, `linux/`, `web/`, `test/`, `.metadata`, `analysis_options.yaml`)
- Keep: `.git/`, `firebase.json`, `.gitignore`, `.omc/`
- Install dependencies: `firebase`, `serwist`
- Initialize shadcn/ui with neutral theme (Apple-minimal base)
- Configure `next.config.ts`:
  - PWA plugin (serwist)
  - `images.remotePatterns`: add card image host domain(s) — check existing Firestore `image_url` values for the domain
- Files created: `src/app/layout.tsx`, `src/app/page.tsx`, `tailwind.config.ts`, `tsconfig.json`, `package.json`

### Stage 1: Firebase, Auth & Security (4 steps)

**Step 1.1: Firebase client setup**
- Create `src/lib/firebase.ts` — initialize Firebase app with existing config from `lib/firebase_options.dart`
- Export `db` (Firestore), `auth` (Auth) instances
- Enable Firestore persistence via `initializeFirestore()` with `localCache: persistentLocalCache()`
- Reuse Firebase project ID: `one-piece-card-database` (325621015091)

**Step 1.2: Auth providers**
- Create `src/lib/auth.ts` — configure Google and Apple providers via Firebase Auth built-in providers
- **Discord OAuth** (requires custom flow since Firebase has no built-in Discord provider):
  - Create `src/app/api/auth/discord/route.ts` — Next.js API route that:
    1. Redirects to Discord OAuth2 authorize URL
    2. Exchanges code for Discord access token
    3. Uses Firebase Admin SDK to create a custom token
    4. Returns custom token to client for `signInWithCustomToken()`
  - Install `firebase-admin` as server-side dependency for custom token creation
  - **Service account key:** Store Firebase service account JSON as `FIREBASE_SERVICE_ACCOUNT_KEY` env var. For local dev: download from Firebase Console → Project Settings → Service Accounts. For Vercel: add as environment variable via `vercel env add`.
- Create `src/app/login/page.tsx` — Apple-minimal login page with social buttons
- Create `src/components/auth/login-button.tsx` — reusable social login button component
- Create `src/components/auth/user-menu.tsx` — avatar dropdown with sign-out

**Step 1.3: Auth context & route protection**
- Create `src/lib/auth-context.tsx` — React context providing current user via `onAuthStateChanged`
- Route protection via client-side redirect in auth context (NOT Next.js middleware — Firebase client SDK cannot run in Edge middleware)
- Create `src/components/auth/protected-route.tsx` — wrapper that redirects to `/login` if unauthenticated
- Protected routes: `/collection`, `/decks`, `/cards/*`
- Public routes: `/login`, `/`

**Step 1.4: Firestore security rules (REQUIRED for public product)**
- Create/update `firestore.rules`:
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      // User inventory — owner only
      match /inventory/{uid}/cards/{cardId} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
      // Card metadata — read-only for all authenticated users
      match /prints/{printId} {
        allow read: if request.auth != null;
        allow write: if false; // Admin/import only
      }
      // Prices — read for authenticated, write only via Cloud Functions
      match /prices/{printId} {
        allow read: if request.auth != null;
        allow write: if false; // Cloud Function uses Admin SDK (bypasses rules)
      }
      // User decks — owner only
      match /decks/{uid}/lists/{deckId} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
      // Collection summary — read by owner, write only via Cloud Function trigger
      match /collectionSummary/{uid} {
        allow read: if request.auth != null && request.auth.uid == uid;
        allow write: if false; // Cloud Function uses Admin SDK
      }
    }
  }
  ```
- Deploy rules: `firebase deploy --only firestore:rules`
- **Verification:** Test cross-user access is denied — create two test users, verify User A cannot read/write User B's inventory or decks

### Stage 2: Collection Core (4 steps)

**Step 2.1: Firestore hooks & types**
- Create `src/types/card.ts` — TypeScript interfaces for Card, CollectionEntry, Price, Deck, DeckEntry
- Create `src/lib/firestore.ts` — Firestore collection references matching existing schema:
  - `inventory/{uid}/cards/{print_id}` → CollectionEntry
  - `prints/{print_id}` → Card metadata
  - `prices/{print_id}` → Price data
- Create `src/hooks/use-collection.ts` — real-time onSnapshot listener for user's inventory
- Create `src/hooks/use-card-prints.ts` — fetch card metadata from `prints` collection

**Step 2.2: Collection page — grid view**
- Create `src/app/collection/page.tsx` — main collection page
- Create `src/components/collection/card-grid.tsx` — responsive grid (CSS Grid, 2-6 cols)
- Create `src/components/collection/card-tile.tsx` — card tile with image, name, code, qty badge, price
- Use `next/image` with card image URLs from Firestore `image_url` field
- Apple-minimal styling: rounded-2xl, shadow-sm, bg-card, p-4, hover:shadow-md transition

**Step 2.3: Search & filter**
- Create `src/components/collection/search-bar.tsx` — search input with debounce (150ms)
- Create `src/components/collection/filter-sheet.tsx` — bottom sheet with filter options (set, rarity, color)
- Client-side filtering on loaded collection data with virtual scrolling (`react-window`) for large collections (500+ cards)
- Remove the arbitrary 300-card limit from the existing Flutter code — load all user cards via paginated Firestore queries
- Search matches: name (fuzzy), code prefix (exact)

**Step 2.4: Sort controls**
- Create `src/components/collection/sort-controls.tsx` — sort dropdown + direction toggle
- Sort options: name, code, quantity, price, rarity, set
- Client-side sort on the filtered collection array
- Persist sort preference in localStorage

### Stage 3: Price Integration (2 steps)

**Step 3.1: Price & Summary Cloud Functions**
- Create `functions/src/priceRefresh.ts` — HTTP-triggered Cloud Function (Node.js)
  - Accepts `print_id` parameter
  - Calls TCGPlayer API for current market price
  - Writes to `prices/{print_id}` with `market_price`, `inventory_price`, `fetchedAt`
  - Returns cached price if `fetchedAt` is within 1 hour
  - Rate limiting: max 1 request per card per hour
- Create `functions/src/collectionSummary.ts` — Firestore-triggered Cloud Function
  - Triggers on writes to `inventory/{uid}/cards/{cardId}`
  - Aggregates total card count and total collection value across ALL cards for that user
  - Writes to `collectionSummary/{uid}` with `totalValue`, `totalCards`, `lastUpdated`
  - This ensures AC5 (total collection value) is accurate regardless of client-side pagination

**Step 3.2: Price display hook**
- Create `src/hooks/use-price.ts` — fetch price from Firestore `prices/{print_id}`
- If stale (>1 hour) or missing, call Cloud Function to refresh
- Create `src/components/price-badge.tsx` — formatted price display with loading skeleton
- Create `src/components/collection-value.tsx` — total collection value in header (sum of price × qty)

### Stage 4: Card Detail (2 steps)

**Step 4.1: Card detail page**
- Create `src/app/cards/[printId]/page.tsx` — full card detail view
- Large card image (centered, max-w-sm)
- Metadata grid: set, rarity, color, type, cost, power
- Card text display
- Current price with "last updated" relative timestamp
- Quantity controls (+/- buttons)

**Step 4.2: Variant selector**
- Create `src/components/card/variant-strip.tsx` — horizontal scroll of variant thumbnails
- Query `prints` collection by `base_code` to find all variants
- Highlight owned variants vs unowned
- Tap to switch detail view to selected variant

### Stage 5: Deck Coverage (3 steps)

**Step 5.1: Deck import**
- Create `src/app/decks/page.tsx` — deck list page (saved decks)
- Create `src/app/decks/import/page.tsx` — import page with textarea for pasting
- Create `src/lib/decklist-parser.ts` — parse common formats:
  - `4x OP01-001` or `OP01-001 x4` (quantity prefix/suffix)
  - `4 OP01-001` (space-separated)
  - One card code per line (assumes qty 1)
- Save parsed deck to Firestore: `decks/{uid}/lists/{deckId}` with name, cards[], created_at

**Step 5.2: Deck coverage view**
- Create `src/app/decks/[deckId]/page.tsx` — deck detail with coverage analysis
- Create `src/components/deck/coverage-breakdown.tsx` — main breakdown component
- Sections:
  1. **Summary header:** X/Y cards owned, Z% complete, $XX.XX to complete
  2. **Owned cards:** grouped, showing qty owned vs qty needed, per-card price
  3. **Missing cards:** grouped, showing qty needed, per-card price, subtotal
  4. **Tradeable extras:** cards where owned > needed, showing surplus qty
- Each card row: image thumbnail, name, code, quantities, price

**Step 5.3: Deck management**
- Create `src/hooks/use-decks.ts` — CRUD operations for decks in Firestore
- Deck list page shows all saved decks with completion percentage
- Delete deck with confirmation dialog
- Re-import / update existing deck

### Stage 6: Polish & PWA (2 steps)

**Step 6.1: Theme & animations**
- Configure shadcn theme: neutral palette, system font stack, rounded-2xl default radius
- Create `src/components/theme-toggle.tsx` — light/dark mode toggle using `next-themes`
- Add subtle animations: card entrance (fade-in + slide-up), page transitions, skeleton loaders
- Framer Motion for complex animations (card flip on detail, sheet slides)

**Step 6.2: PWA configuration**
- Create `public/manifest.json` — app name, icons, theme color, display: standalone
- Configure service worker for offline caching of app shell and card images
- Add install prompt component for mobile browsers
- Test PWA installation on Chrome (Android) and Safari (iOS)

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| TCGPlayer API rate limits or access restrictions | No prices displayed | Medium | **Gated at Step 0.1** — verify access before building price UI. Cache aggressively (1hr), implement fallback to "price unavailable" |
| TCGPlayer API doesn't cover One Piece TCG | Feature broken | Medium | **Gated at Step 0.1** — verify OPTCG coverage. Fallback: CardMarket API or manual price entry |
| Firebase costs spike with many real-time listeners | Budget overrun | Low | Paginate large collections, lazy-load prices, monitor Firebase usage dashboard |
| Decklist format variations break parser | Import fails | Medium | Support 3+ common formats, show preview before saving, allow manual correction. Unit tests for parser |
| Discord OAuth requires custom auth flow | Auth complexity | Medium | Handled via Next.js API route + Firebase Admin SDK custom tokens (Step 1.2) |
| PWA limitations on iOS (no push, limited background sync) | Reduced mobile experience | Low | Accept limitation for v1; core features work fine as PWA on iOS |
| Firestore security rules misconfigured | Data breach — users can access others' data | High | **Addressed in Step 1.4** — rules deployed and tested before any public access |
| Next.js middleware cannot use Firebase client SDK | Auth redirect broken | Medium | **Addressed in Step 1.3** — use client-side auth context redirect, not Edge middleware |
| Card image domain not whitelisted in next.config.ts | Images fail to load | Low | **Addressed in Step 0.2** — check Firestore image_url domains and configure remotePatterns |

## Verification Steps
1. **Auth flow:** Sign in with Google, Apple, Discord on web and mobile browser — verify redirect and user creation in Firestore
2. **Security rules:** Create two test users. Verify User A cannot read/write User B's `inventory` or `decks`. Verify `prints` is read-only. Verify `prices` is not client-writable.
3. **Collection CRUD:** Add card via Firestore console (simulating project-o), verify it appears in <2 seconds in the collection view
4. **Large collection:** Add 500+ cards to a test user, verify virtual scrolling works and total collection value is correct (not truncated to a page)
5. **Price loading:** Open card detail, verify price loads on first view, verify cached on second view within 1 hour
6. **Search & sort:** Type a code prefix, verify instant filter. Toggle each sort option, verify correct ordering.
7. **Deck import:** Paste a decklist from one-piece-tcg-decks.com, verify parsing preview is correct. Test malformed input — verify graceful error.
8. **Deck coverage:** View deck with mix of owned/missing cards, verify grouping, quantities, and price calculations
9. **Responsive:** Test on 375px (iPhone SE), 768px (iPad), 1440px (desktop) — verify grid adapts
10. **PWA:** Install on Android Chrome and iOS Safari — verify app launches from home screen
11. **Lighthouse:** Run Lighthouse audit on mobile, verify performance ≥90
12. **Dark mode:** Toggle dark mode, verify all components render correctly in both themes
13. **Error states:** Disconnect network, verify cached data displays and offline indicator shown. Test with empty collection (new user).
14. **Discord OAuth:** Complete full Discord sign-in flow end-to-end — verify custom token exchange works

## ADR: Tech Stack Decision

### Decision
Replace the existing Flutter app with a **Next.js 15 App Router + Tailwind CSS + shadcn/ui** web application, delivered as a **PWA** for mobile.

### Drivers
1. User requires "state of the art" web UI with Apple-minimal aesthetic
2. Public product needs SEO and fast initial loads
3. Single developer needs maximum component reuse and ecosystem support
4. Must maintain Firestore schema compatibility with project-o
5. Mobile support needed without app store overhead

### Alternatives Considered
1. **Flutter (keep):** Rejected — canvas rendering, 2MB+ bundle, poor SEO for public product
2. **Vite + React SPA:** Genuinely viable and architecturally simpler (no RSC complexity). Rejected because `next/image` optimization for card-heavy UI, file-based routing, and API routes for Discord OAuth provide meaningful developer velocity gains. Close call.
3. **Remix + Capacitor:** Rejected — unnecessary native complexity for a collection tracker
4. **SvelteKit:** Not evaluated — smaller ecosystem, fewer pre-built UI components matching Apple-minimal style

### Why Chosen
Next.js + shadcn/ui provides the best combination of ecosystem tooling (`next/image` for card images, file-based routing, API routes for Discord OAuth), component library (shadcn's Apple-like defaults), and mobile delivery (PWA via serwist). The 734-line Flutter codebase makes migration cost negligible. Firebase JS SDK integrates seamlessly for client-side real-time listeners. SSR benefits are limited to the app shell and public pages — authenticated data views are client-rendered — but the ecosystem advantages justify this over a pure Vite SPA.

### Consequences
- Full rewrite of frontend (but only 734 lines)
- Flutter platform directories can be deleted
- Firebase config needs to be ported from Dart to TypeScript
- project-o integration unchanged (shared Firestore)
- No native mobile app — PWA only (acceptable for v1)

### Follow-ups
- Set up Vercel project and connect to GitHub repo for CI/CD
- Plan project-o Firestore integration (separate scope — modify project-o to write to Firestore)
- Add error tracking (Sentry) and analytics after MVP launch
- Consider automated tests for decklist parser (unit) and auth flow (integration)
- Investigate anonymous-to-social auth migration if any real data exists under anonymous UIDs

## Changelog
- v1: Initial plan created from deep interview spec (2026-04-07)
- v2: Revised based on Architect + Critic consensus review (2026-04-07):
  - CRITICAL: Rewrote Principle #2 — "Progressive enhancement" → "Thin server, thick client" to honestly reflect that authenticated data pages are client-rendered via Firebase listeners, not SSR
  - CRITICAL: Added Step 1.4 — Firestore security rules as required implementation step (was deferred to "follow-ups")
  - MAJOR: Added Step 0.1 — TCGPlayer API verification gate before building price-dependent UI
  - MAJOR: Removed 300-card limit — added virtual scrolling + Firestore trigger for total collection value (AC5)
  - MAJOR: Removed Zustand — Firebase hooks + React state sufficient
  - Fixed Discord OAuth — full custom auth flow via API route + Firebase Admin custom tokens
  - Fixed auth middleware — client-side redirect via auth context (Firebase SDK incompatible with Edge middleware)
  - Added `next/image` remote patterns configuration to Step 0.2
  - Added Option D (Vite SPA) as genuinely considered alternative with honest comparison
  - Added security, error state, and Discord OAuth verification steps
  - Specified `serwist` as PWA library (not unmaintained `next-pwa`)
  - Updated ADR to honestly reflect SSR scope and acknowledge Vite SPA as close alternative
- v2.1: Merged Architect/Critic minor improvements (2026-04-07):
  - Added `collectionSummary/{uid}` to Firestore security rules (Step 1.4)
  - Added `collectionSummary.ts` Firestore trigger Cloud Function to Stage 3 (Step 3.1)
  - Added Firebase service account key env var instructions to Step 1.2
  - **Consensus status:** APPROVED by Architect (iteration 2) and Critic (iteration 2)
