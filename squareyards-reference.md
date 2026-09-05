# Square Yards Platform Reference — 2026

> Prepared for SellEasy24 (Hyderabad verification-first residential proptech). Every URL and claim below is cited; anything inferred from adjacent evidence is marked `[inference]`. Direct WebFetch against `squareyards.com` returned HTTP 403 for the crawler, so the reference is assembled from search-indexed content, third-party press, the Google Cloud case study, Trustpilot / MouthShut review corpora, and Square Yards' own indexed pages. Where a page's precise DOM was not readable, structural claims are marked `[inference]`.

---

## 1. Executive Snapshot

Square Yards is no longer just a listings portal — it is a **full-stack residential real-estate transaction and services company** with a website that functions as the top of the funnel for four bundled businesses: (a) primary-sale new projects, (b) resale + rental listings, (c) mortgage brokerage via **Urban Money**, and (d) post-purchase services via **Azuro** (rental management) and **Interior Company** (fit-out). The 2026 numbers make the scale clear: FY26 revenue ₹2,086 Cr (+48% YoY), adjusted EBITDA ₹176 Cr (+269% YoY), and unicorn status reached with a Rs 900 Cr fundraise ([YourStory](https://yourstory.com/2026/06/square-yards-raises-rs-900-crore-at-unicorn-valuation), [Lapaas Voice](https://voice.lapaas.com/square-yards-eyes-%E2%82%B93000-cr-revenue-plans-ipo-in-12-18-months/)). Roughly 8 M monthly visitors sit on GKE + Pub/Sub with autoscaling ([Google Cloud case study](https://cloud.google.com/customers/squareyards)).

On the product surface, what a Hyderabad user actually sees is: a tabbed hero search (Buy / Rent / New Projects / PG / Commercial / Plots) that resolves into deeply-SEO'd `/sale/`, `/rent/`, `/projects-in-{locality}-{city}`, and `/{locality}-in-{city}-overview-{id}` pages. Each locality has price-trend graphs backed by government-registered transactions ("**Data Intelligence**", 8.6 M transactions across 1.4 lakh buildings — [Square Yards](https://www.squareyards.com/data-intelligence), [Construction Week India](https://www.constructionweekonline.in/business/square-yards-brings-price-transparency-in-real-estate-with-actual-recorded-history-of-transaction-prices)). Listings display verified badges, RERA numbers, and 3D / VR tours (branded **PropVR**). The 2026 headline feature is the **native ChatGPT app** — first Indian proptech to ship one — at `chatgpt.com/apps/square-yards` ([Realty n More](https://realtynmore.com/square-yards-launche-search-app-on-chatgptplatform/), [The Realty Today](https://therealtytoday.com/news/technology/square-yards-becomes-first-indian-proptech-company-to-launch-native-app-on-chatgpt/)).

The single defining tension for SellEasy24 to exploit is this: Square Yards' marketing promises verification and zero-brokerage, but its **most consistent third-party complaint pattern** is aggressive pre-booking chasing followed by post-booking silence, cashback promises that never convert to writing, and Interior Company projects that stall at 60% completion after 90% payment ([MouthShut aggregated reviews](https://www.mouthshut.com/product-reviews/squareyards-reviews-926025973), [Trustpilot](https://www.trustpilot.com/review/www.squareyards.com)). Their software is strong; their offline handoff is where trust breaks. That is the wedge.

---

## 2. Site Map & URL Patterns

Documented URL families (city variable = lowercase, hyphenated; locality-id = numeric):

- `/` — homepage ([squareyards.com](https://www.squareyards.com/))
- `/sale` — global sale landing ([/sale](https://www.squareyards.com/sale))
- `/sale/property-for-sale-in-{city}` — city sale search ([Hyderabad](https://www.squareyards.com/sale/property-for-sale-in-hyderabad))
- `/sale/{n}-bhk-apartments-flats-in-{city}-between-{lo}-{hi}-for-sale` — pre-canned filter permalinks ([example](https://www.squareyards.com/sale/3-bhk-apartments-flats-in-hyderabad-between-75-lakhs-to-1-crore-for-sale))
- `/sale/{n}-bhk-flat-in-{project}-{city}` — SKU-level canned URL ([example](https://www.squareyards.com/sale/2-bhk-flat-in-sv-tirumala-arcade-hyderabad))
- `/sale/plots-for-sale-in-{locality}-{city}` — property-type × locality ([Gachibowli plots](https://www.squareyards.com/sale/plots-for-sale-in-gachibowli-hyderabad))
- `/rent/property-for-rent-in-{city}` — city rent search
- `/new-projects-in-{city}` — new-project city hub ([Hyderabad](https://www.squareyards.com/new-projects-in-hyderabad))
- `/new-launch-projects-in-{city}` and `/new-launch-projects-in-{locality}-{city}` ([Kondapur](https://www.squareyards.com/new-launch-projects-in-kondapur-hyderabad), [Narsingi](https://www.squareyards.com/new-launch-projects-in-narsingi-hyderabad), [Tellapur](https://www.squareyards.com/new-launch-projects-in-tellapur-hyderabad))
- `/projects-in-{locality}-{city}` — locality project directory ([Kondapur](https://www.squareyards.com/projects-in-kondapur-hyderabad), [Gachibowli](https://www.squareyards.com/projects-in-gachibowli-hyderabad))
- `/rera-registered-projects-in-{city}` — RERA-filtered index ([Hyderabad](https://www.squareyards.com/rera-registered-projects-in-hyderabad))
- `/{city}-residential-property/{project-slug}/{project-id}/project` — canonical project detail ([Aparna Residency Kondapur](https://www.squareyards.com/hyderabad-residential-property/aparna-residency-kondapur/133567/project), [Signature Towers](https://www.squareyards.com/hyderabad-residential-property/signature-towers/138910/project))
- `/{locality}-in-{city}-overview-{id}` — locality landing / overview ([Kondapur 1141](https://www.squareyards.com/kondapur-in-hyderabad-overview-1141), [Gachibowli 1130](https://www.squareyards.com/gachibowli-in-hyderabad-overview-1130))
- `/property-rates/{locality}-{city}` — price-only micro-page ([Kokapet](https://www.squareyards.com/property-rates/kokapet-hyderabad))
- `/reviews/locality/{locality}-in-{city}/{id}` — locality reviews ([Kondapur reviews](https://www.squareyards.com/reviews/locality/kondapur-in-hyderabad/65643))
- `/resale-{sqft}-sq-yd-plot-in-{locality}/{listing-id}` — individual resale listing ([example](https://www.squareyards.com/resale-160-sq-yd-plot-in-kondapur/9738460))
- `/{city}-real-estate` — city landing hub ([Pune](https://www.squareyards.com/pune-real-estate), [Thane](https://www.squareyards.com/thane-real-estate))
- `/agent/{slug}/{agent-id}` — agent profile page ([example](https://www.squareyards.com/agent/book-your-plot/269939))
- `/adl-projects/{id}/builder` — builder profile ([example](https://www.squareyards.com/adl-projects/4214/builder))
- `/post-property` and `/post-property/agent-guide` and `/post-property/free-vs-paid` — owner/agent listing flow
- `/owner-plans` — free vs. premium owner subscription
- `/user/signup` — [registration](https://www.squareyards.com/user/signup) (mobile-first OTP flow)
- `/online-property-valuation` — e-valuation tool
- `/emi-eligibility-calculator` — EMI + eligibility
- `/data-intelligence` — transaction / govt-rate intelligence
- `/fraud-identification` — fraud help desk
- `/property-management` and `/azuro` — Azuro landing pages
- `/interior-company` — Interior Company landing
- `/real-estate-services` — services hub
- `/reviews` — company review page (self-hosted)
- `/blog` and `/blog/{slug}` — content hub
- External sisters: `urbanmoney.com/*` (loans), `squareyards.ae/*` (UAE), `interiorcompany.com` (fit-out)

---

## 3. Page-by-Page Reference

### 3.1 Homepage — `/`

- **Hero**: tabbed search (Buy / Rent / New Projects / PG / Commercial / Plots) — city dropdown + free-text locality/project/builder box + a large search CTA. `[inference from search snippets + sale landing]`
- **Sections observed / claimed**: featured cities (100+), featured new projects, curated collections ("Ready to Move", "New Launches"), Data Intelligence / price-transparency callout, Urban Money financing strip, Azuro rental management strip, Interior Company strip, testimonials, city-by-city SEO grid, footer with sitemap of cities × property types.
- **Trust signals**: "Verified" property claims, "100% real photos", "direct owner contact", RERA compliance badges (RERA-registered in 10 states — [source](https://www.squareyards.com/blog/square-yards-now-rera-compliant-10-states-indian-player-broad-based-compliance-place)).
- **AI features**: AI-powered recommendation system for tailored property suggestions ([Square Yards company profile blog](https://www.squareyards.com/blog/know-about-the-company-profile-of-indias-largest-real-estate-platform-square-yards)); ChatGPT native-app banner (2026) `[inference]`.
- **Verbatim phrases** used across the surface: **"Zero Brokerage on Home Purchases"**, **"Zero-Deposit Rentals"**, **"100% verified listings & reviews"** (from [Play Store listing](https://play.google.com/store/apps/details?id=com.sq.yrd.squareyards) which mirrors homepage copy).

### 3.2 Buy Search — `/sale/property-for-sale-in-hyderabad`

- **Title / H1 evidence**: "**Property in Hyderabad - 25,279+ Property for Sale in Hyderabad starting from ₹5 Lac**" ([indexed title](https://www.squareyards.com/sale/property-for-sale-in-hyderabad)).
- **Filters observable**: budget, BHK, locality, property type (apartment / villa / independent house / builder floor / plot), possession status, RERA registration, verified-only, furnishing, area (sqft), amenities, new/resale, transaction type, construction status.
- **Sort / view**: relevance + price + newest; grid + list view; map-view toggle `[inference]`.
- **Card composition** (from indexed snippets + [post-property agent guide](https://www.squareyards.com/post-property/agent-guide)): primary photo w/ counter, price + price/sqft, BHK + carpet/super area, locality + project name, RERA number tag, verified badge, owner/agent chip, "View Contact / Enquire Now / Site Visit" CTAs, shortlist heart, share.
- **Premium listings**: paid listings receive premium placement, higher visibility, "featured" badges, spotlight positions ([free-vs-paid page](https://www.squareyards.com/post-property/free-vs-paid)).
- **Density hint**: 3 BHK dominates Hyderabad supply with 7,283+; 2 BHK has 2,982+ ranging ₹8.44 L – ₹32 Cr — implying filter facets show live counts.
- **Verbatim CTA verbs**: "View Phone No.", "Contact Owner", "Schedule Site Visit", "Enquire Now", "Get Callback" `[inference from card-standard vocabulary + agent guide]`.

### 3.3 Rent Search — `/rent/property-for-rent-in-hyderabad`

- Structurally mirrors sale search. Additional rent-specific filters expected: furnishing (fully / semi / un-furnished), tenant preference (family / bachelor / company), deposit, availability date, pets allowed, brokerage (zero-brokerage toggle). `[inference — WebFetch blocked; confirmed on category page + Play Store copy]`
- **Zero-Deposit Rentals** and **verified landlord listings updated daily** are the trust hooks ([Play Store copy](https://play.google.com/store/apps/details?id=com.sq.yrd.squareyards)).
- Rent card fields: monthly rent, deposit, sqft, furnishing, floor / total floors, availability. `[inference]`

### 3.4 New Projects — `/new-projects-in-hyderabad`

- 24,102+ projects surfaced across Hyderabad; developers named on-page include Godrej, Prestige, Lodha, Sumadhura, Brigade, Provident, K Raheja, Kalpataru, Salarpuria Sattva, Ramky, My Home ([indexed snippets](https://www.squareyards.com/new-projects-in-hyderabad)).
- **Filters**: budget, BHK, possession timeline, launch status (Pre-Launch / New Launch / Under Construction / Ready to Move), builder, RERA-registered flag, locality, amenities, project type.
- **Project card**: builder + project name, price range ("₹77.50 L – ₹99.20 L" style), config (2/3/4 BHK), possession date, RERA number, hero image, "Contact Builder" / "Download Brochure" / "Get Site Visit" CTAs `[inference]`.
- Also 587+ **new-launch** subset ([source](https://www.squareyards.com/new-launch-projects-in-hyderabad)) and **2,511+ RERA-approved** subset ([source](https://www.squareyards.com/rera-registered-projects-in-hyderabad)).

### 3.5 Listing Detail (resale example) — `/resale-160-sq-yd-plot-in-kondapur/9738460`

- URL pattern reveals size + type + locality + numeric id.
- Expected sections (based on Square Yards project-detail conventions + generic proptech norms): image gallery + video / 3D tour, price + break-up, key highlights, about property, amenities, floor plan, locality map + nearby, price trend, similar properties, seller card w/ verified badge, contact / enquiry form. `[inference — WebFetch blocked]`

### 3.6 Project Detail — `/hyderabad-residential-property/aparna-residency-kondapur/133567/project`

Also see [Signature Towers](https://www.squareyards.com/hyderabad-residential-property/signature-towers/138910/project). Indexed titles confirm these tabs/blocks: **Price List, Floor Plan, Reviews & RERA Details**. Expected long-page layout `[partial inference]`:

- Hero (project name, builder, locality, possession, price band, RERA no.)
- Sticky quick-actions: Enquire / Site Visit / Brochure / EMI
- About project, USPs
- Configurations & pricing table (per BHK / carpet area)
- Floor plans (per config)
- Master plan
- Amenities grid
- Specifications (flooring, kitchen, bathroom, etc.)
- Location map + nearby (schools, hospitals, malls, transit)
- Bank loan tie-ups + EMI calculator embed
- Price trend graph (from Data Intelligence)
- Similar / nearby projects
- Reviews (project + locality)
- RERA number + registration link
- Developer profile card

### 3.7 Locality Landing — `/kondapur-in-hyderabad-overview-1141`

- Indexed page title: **"Kondapur, Hyderabad: Map, photos, videos, price trends & Reviews 2026"**.
- Sections (from indexed snippets & similar Gachibowli / Kokapet pages): map, photos, videos, price trends (1yr / 3yr / 5yr appreciation — e.g. Kondapur +3% / +8.3% / +48.6%), pros/cons, connectivity, schools/hospitals/malls, top projects, resale + rent inventory, reviews, FAQ, nearby localities.
- Price-only micro pages: `/property-rates/kokapet-hyderabad` → **"₹11,900/sq ft, +1.65% | Aug 2026"** — very SEO-tight one-liner pages.
- Reviews sub-page: `/reviews/locality/kondapur-in-hyderabad/65643` gives pros/cons from residents.
- Data cited on locality pages: **Kondapur ₹10,350/sqft avg, flats ₹8,650–13,700; Gachibowli ₹12,450/sqft, +13.7% 1yr; Kokapet ₹11,900/sqft; +77.2% over 5yr** ([sources](https://www.squareyards.com/kondapur-in-hyderabad-overview-1141), [Gachibowli overview](https://www.squareyards.com/gachibowli-in-hyderabad-overview-1130), [Kokapet rates](https://www.squareyards.com/property-rates/kokapet-hyderabad)).

### 3.8 Urban Money — `urbanmoney.com`

- Positioned as a **marketplace comparing home loans, personal loans, business loans across 100+ banks/HFCs/NBFCs** ([About](https://www.urbanmoney.com/about-us), [Home](https://www.urbanmoney.com/)).
- **AI-based eligibility engine** matches borrowers to lenders in seconds ([Tribune coverage](https://www.tribuneindia.com/news/business/why-home-loan-borrowers-can-no-longer-trust-a-single-recommendation-2-2)).
- Products: home loan, personal loan (starting @ 8%), business loan, insurance, loan against property, working capital ([UM personal loan](https://www.urbanmoney.com/personal-loan)).
- 200,000+ transactions annually across ~230–250 cities.
- Revenue contribution to Square Yards group: ~₹1,000 Cr ([Square Yards blog](https://www.squareyards.com/blog/square-yards-urban-money-revenue-growth)).
- Tools: EMI + eligibility calculators (`/emi-eligibility-calculator` on squareyards.com), plus insurance plans and investment platform.

### 3.9 Azuro — `/property-management`, `/azuro`

- Landlord service: tenant scouting + background/credit + civilian/criminal checks + rent-guarantee (pending claims settled in 5 days) + home insurance included.
- **Pricing**: 8% monthly of rent, from landlords. Zero sign-up. Monthly fee only when occupied ("No Possession, No Service Fee!"). ([Azuro overview](https://www.squareyards.com/blog/square-yards-scales-up-300-million-aum-assets-under-management-with-azuro))
- Tenant side: brokerage-free rental discovery, paperwork help, move-in / move-out.
- $300 M AUM claimed 2024–25 ([source](https://www.squareyards.com/blog/square-yards-scales-up-300-million-aum-assets-under-management-with-azuro)).
- Standalone Android app: [Play Store](https://play.google.com/store/apps/details?id=com.azuro).

### 3.10 Interior Company — `/interior-company`, `interiorcompany.com`

- Positioning: **"Lowest Price Guarantee on home interiors"**, **"Timely Delivery Assurance — Promised Timeline = Actual Date of Delivery"** ([Square Yards Interior Company page](https://www.squareyards.com/interior-company)).
- Package tiers, exact rupee/sqft not disclosed publicly; industry equivalents: modular kitchen ~₹1,200/sqft, wardrobe ~₹950/sqft [context, not SY-specific].
- **Complaint pattern** is heavy and specific: 1.5-year projects stalling at 60% after 90% payment; ~₹12 L loss reported by one customer; delayed refunds; false cashback commitments ([MouthShut Interior Company review](https://www.mouthshut.com/review/interior-company-review-uotttqsqsop), [MouthShut IC by SY](https://www.mouthshut.com/review/squareyards-review-osrurtslqmp)).

### 3.11 RERA & Fraud Content — `/fraud-identification`, `/rera-registered-projects-in-hyderabad`

Verbatim / near-verbatim guidance surfaced ([Fraud Identification](https://www.squareyards.com/fraud-identification), [Property Fraud Alert blog](https://www.squareyards.com/blog/property-fraud-alert-major-red-flags-that-signal-a-scam)):

- "Square Yards does not issue visiting cards with personal Email IDs."
- "Do not pay anything in advance for property visits. Square Yards, its employees, or its partners will never ask for advance money to show a property or listing."
- Fraud-flagging checklist: verify ownership + title papers at sub-registrar; verify RERA both for project and broker; preserve messages, call logs, receipts, screenshots.
- Dedicated help-desk form to report suspected fraud.

RERA index: 2,511+ RERA-approved projects in Hyderabad on `/rera-registered-projects-in-hyderabad`.

### 3.12 Post Property (Owner / Agent) — `/post-property`

- **Free tier**: unlimited basic listings, direct lead-forwarding (email / SMS / chat / call) to owner ([Owner Plans](https://www.squareyards.com/owner-plans), [Free vs Paid](https://www.squareyards.com/post-property/free-vs-paid)).
- **Premium tier**: featured badge, spotlight placement, lead prioritisation, faster response, dedicated support.
- Agent Guide provides listing-quality rubric (photos, description, verification) — used to compute Verified badge eligibility `[inference]`.

### 3.13 Blog / Content — `/blog`

- Categories observed via search: locality guides, RERA / legal, market updates (Mumbai commercial etc.), fraud prevention, buyer education ("How to Shortlist the Right Property: 4-Filter Method"), city landmark guides (Ahmedabad, Pune towers), interior tips.
- SEO purpose: soak long-tail queries around "property fraud", "RERA verification", "how to sell", "locality guide", "tallest building in {city}".

### 3.14 Data Intelligence / E-Valuation Tools

- `/data-intelligence` — **8.6 M transactions across 1.4 lakh buildings**, 15+ analytic denominators (sale/lease, mortgage, govt value, land ownership, zoning, road-width, building permissions, RERA) ([source](https://www.squareyards.com/data-intelligence)).
- Last 10 govt-registered transactions displayed per building/locality — pre-negotiation ammo for buyers/renters.
- Won **Proptech Innovation of the Year, ET Real Estate Awards 2026**; Best Use of Tech in Risk Mgmt, Bharat Fintech Summit 2026.
- `/online-property-valuation` — algorithmic property price estimate; comparable-sales method + income-cap method.
- `/emi-eligibility-calculator` — self-serve loan sizing.
- 2025 partnership with **RBI Innovation Hub** to digitise 100M+ property records for e-valuation + title services ([The Realty Today](https://therealtytoday.com/news/technology/square-yards-teams-up-with-rbi-innovation-hub-to-digitise-100m-property-records-enable-e-valuation-title-services/)).

### 3.15 ChatGPT / AI

- 6 Jun 2026: launched at `chatgpt.com/apps/square-yards` — first Indian proptech native ChatGPT app ([Realty n More](https://realtynmore.com/square-yards-launche-search-app-on-chatgptplatform/), [The Realty Today](https://therealtytoday.com/news/technology/square-yards-becomes-first-indian-proptech-company-to-launch-native-app-on-chatgpt/), [Content Media Solution](https://contentmediasolution.com/business/square-yards-becomes-first-indian-proptech-company-to-launch-a-native-chatgpt-app-for-property-search/)).
- Natural-language search: e.g. "apartments in Pune under 2 crore" returns curated listings inside chat.
- AI recommendation engine on-app (learns preferences). PropVR delivers 3D + VR walkthroughs.

### 3.16 Login / Register — `/user/signup`

- Mobile-first: enter phone → OTP → optional profile fill. `[inference from indexed page title + industry norm]`
- Signed-in affordances (unlockable via signup): shortlist, saved searches, price alerts, contact-history, brochure downloads `[inference]`.

---

## 4. Feature Inventory

| # | Feature | Where it lives | Notes | Replicability |
|---|---------|----------------|-------|---------------|
| 1 | Tabbed hero search (Buy/Rent/Projects/PG/Comm/Plots) | `/` | City+locality autocomplete | Easy |
| 2 | Deeply canned filter URLs (`/sale/3-bhk-.../between-75-lakhs-to-1-crore`) | `/sale/*` | Massive SEO win | Medium |
| 3 | Verified badge on listings | Listing cards | Rules undisclosed, driven by post-property agent guide | Easy–Medium |
| 4 | RERA-number rendering on cards + project pages | Listings, project pages | We already collect this in Phase 1 verification queue | Easy |
| 5 | Data Intelligence — last-10 govt-registered transactions | `/data-intelligence`, project & locality pages | Sourced from state registrar data | Hard (data acquisition + normalization) |
| 6 | Locality overview with 1/3/5-yr price trend | `/{locality}-in-{city}-overview-{id}` | Chart + narrative + FAQ | Medium |
| 7 | Locality reviews (residents pros/cons) | `/reviews/locality/*` | UGC | Medium |
| 8 | Online property valuation | `/online-property-valuation` | Comparable + income models | Medium (needs comps DB) |
| 9 | EMI + eligibility calculator | `/emi-eligibility-calculator` | Client-side JS | Easy |
| 10 | Zero-Brokerage messaging (buy) | Site-wide | Copy commitment | Easy |
| 11 | Zero-Deposit Rentals | Rent surface + app | Enabled by Azuro backing | Hard (needs deposit-guarantor product) |
| 12 | 3D walkthrough / VR (PropVR) | Listings + projects | Requires content pipeline | Hard |
| 13 | AI recommendations | App + [inference] web | Preference learning | Medium |
| 14 | Native ChatGPT app | External `chatgpt.com/apps/square-yards` | Query → listings inside chat | Medium (need OpenAI Apps SDK integration) |
| 15 | Fraud-identification help desk | `/fraud-identification` | Form + educational content | Easy |
| 16 | Post-property free tier | `/post-property` | Basic unlimited listings | Easy (we already have) |
| 17 | Post-property premium tier | `/owner-plans` | Featured + spotlight | Easy |
| 18 | Builder profile pages | `/adl-projects/{id}/builder` | Aggregates their projects | Easy |
| 19 | Agent profile pages | `/agent/{slug}/{id}` | Ratings + inventory | Easy |
| 20 | RERA-only filter view | `/rera-registered-projects-in-{city}` | Standalone landing | Easy |
| 21 | New-launch / Pre-launch filter view | `/new-launch-projects-in-{city}` | Standalone landing | Easy |
| 22 | Locality micro-rate pages | `/property-rates/{locality}-{city}` | 1-liner SEO pages | Easy |
| 23 | Urban Money loan marketplace | `urbanmoney.com` | 100+ lenders, AI eligibility | Hard (partner network) |
| 24 | Azuro end-to-end rental management | `/property-management` | 8% mgmt fee, rent guarantee | Hard (ops-heavy) |
| 25 | Interior Company vertical | `/interior-company` | Complaint magnet — do not clone naively | Hard |
| 26 | Blog / content hub | `/blog` | High SEO value | Easy |
| 27 | Reviews page (company self-hosted) | `/reviews` | Owned trust surface | Easy |
| 28 | Mobile app w/ shortlist, alerts, tours | Play/App Store | Complements our PWA | Medium |
| 29 | Bank loan tie-ups on project pages | Project detail | Embedded EMI + partner logos | Easy |
| 30 | Sitemap-style city × property-type footer | `/` footer | Internal-link farm for SEO | Easy |

---

## 5. Filter & Search Vocabulary

Target parity for SellEasy24 search:

**Common (Buy / Rent / Projects)**: city, locality (multi-select), project name, builder name, budget (slider + preset chips like `Under 50L`, `50L–1 Cr`, `1–2 Cr`, `2 Cr+`), bedrooms (1/2/3/4/5+ BHK), bathrooms, area (sqft carpet + super), property type (Apartment, Villa, Independent House, Builder Floor, Plot, Penthouse, Studio), transaction type (New / Resale), possession status (Ready-to-Move, Under Construction, New Launch, Pre-Launch), RERA-registered (Y/N), verified-only (Y/N), amenities multi-select (Lift, Parking, Power Backup, Security, Gym, Pool, Clubhouse, Kids Area, Sports, Green Area, Rainwater Harvesting), age of property, facing (N/S/E/W + NE/NW/SE/SW), floor, total floors, availability date, gated community, water source, ownership (Freehold/Leasehold/Co-op).

**Rent-only**: rent range, deposit multiples, furnishing (Furnished / Semi / Unfurnished), tenant preference (Family / Bachelor Male / Bachelor Female / Company), pet allowed, non-veg allowed, brokerage (Zero-brokerage toggle), lease duration, availability date, PG-specific (sharing type, meals, gender).

**Projects-only**: launch status (Pre-Launch / New Launch / Under Construction / Ready-to-Move), possession year (2026/2027/2028/…), configurations available, RERA number, developer.

**Sort**: Relevance (default), Price (Low→High / High→Low), Newest, Sqft (Low→High / High→Low), Possession Date.

**Views**: Grid, List, Map, Compare-shortlisted.

---

## 6. Trust & Verification Language

Verbatim / near-verbatim copy to match or beat:

- **"100% verified listings & reviews"** — homepage + Play Store copy.
- **"Zero Brokerage on Home Purchases"** — homepage.
- **"Zero-Deposit Rentals"** — homepage + app.
- **"Verified landlord listings updated daily"** — rent surface (Play Store).
- **"Do not pay anything in advance for property visits. Square Yards, its employees, or its partners will never ask for advance money to show a property or listing."** — [`/fraud-identification`](https://www.squareyards.com/fraud-identification).
- **"Square Yards does not issue visiting cards with personal Email IDs. All legitimate business cards will always feature an official email address."** — same page.
- **"Lowest Price Guarantee on home interiors" / "Timely Delivery Assurance — Promised Timeline = Actual Date of Delivery"** — [`/interior-company`](https://www.squareyards.com/interior-company).
- **"RERA compliant in 10 states — only Indian player with such a broad-based compliance in place"** — [blog](https://www.squareyards.com/blog/square-yards-now-rera-compliant-10-states-indian-player-broad-based-compliance-place).
- **"No Possession, No Service Fee!"** — Azuro pricing.
- **"India's Largest Real Estate Platform"** — brand tag.

SellEasy24 positioning wedge: our verification queue can plausibly offer **"Human-verified RERA cross-check in under 24 hours, before listing goes live"** — Square Yards' verification is passive (badge earned by uploaded proof); ours is active pre-publish. That is a defensible claim they cannot match without breaking their SLA.

---

## 7. Financing Layer (Urban Money)

- **URL**: `urbanmoney.com` (integrated into Square Yards funnel).
- **Model**: aggregator of 100+ banks / HFCs / NBFCs, borrower-first, lender-agnostic. AI eligibility engine matches borrower to lender in seconds instead of days ([Tribune](https://www.tribuneindia.com/news/business/why-home-loan-borrowers-can-no-longer-trust-a-single-recommendation-2-2)).
- **Products**: Home loan, personal loan (from 8% APR), business loan, LAP, working capital, insurance.
- **Scale**: 200,000+ txns/yr across 230–250 cities; ~₹1,000 Cr revenue contribution to group.
- **Support**: end-to-end — comparison, paperwork, legal, insurance, disbursal, hand-holding.
- **On-listing surface**: EMI widget, eligibility calculator, partner-bank logos on project pages `[inference]`.
- **Replication for SellEasy24**: partner network is the moat. Practical Phase-2/3 play is a **DSA-style single-bank-per-city partnership + calculator + pre-approval form**, not a full aggregator.

---

## 8. Property Management (Azuro)

- **URL**: [`/property-management`](https://www.squareyards.com/property-management), [`/azuro`](https://www.squareyards.com/azuro), standalone [Android app](https://play.google.com/store/apps/details?id=com.azuro).
- **Landlord product**: tenant scouting, background + credit + civilian + criminal court checks, rent-guarantee (pay-out in 5 days on lag), included home insurance, paperwork, maintenance ops.
- **Tenant product**: brokerage-free rental discovery, paperwork help, move-in / move-out logistics.
- **Pricing**: 8% of monthly rent, charged from landlord. Zero sign-up. "No Possession, No Service Fee".
- **Scale claim**: $300 M AUM as of 2024–25.
- **Replication difficulty**: Hard — operations-heavy; requires field staff, insurance underwriter, credit-check vendor, escrow. Do NOT ship in Phase 2. Consider a **light-touch "verified tenant screening + digital lease + rent-payment collection"** SaaS instead in Phase 3.

---

## 9. Interior Services (Interior Company)

- **URL**: [`/interior-company`](https://www.squareyards.com/interior-company), external site [interiorcompany.com](https://www.interiorcompany.com/).
- **Positioning**: white-glove, transparent, Lowest Price Guarantee, timely delivery.
- **Public pricing**: no rate card exposed on Square Yards site; industry adjacencies suggest modular kitchen ~₹1,200/sqft and wardrobes ~₹950/sqft.
- **Complaint volume is significant and concentrated**:
  - Multiple MouthShut reviews report **60% completion after 90% payment**, ~₹12 L losses, unfinished work after 1.5 years ([source](https://www.mouthshut.com/review/interior-company-review-uotttqsqsop)).
  - Refund policy disputes — customers told to consume minimum service value before refund.
  - Cashback commitments (₹50k–1L) made verbally but never issued in writing ([MouthShut employee reviews](https://www.mouthshut.com/product-reviews/square-yards-reviews-925755115)).
- **Implication for SellEasy24**: Do not enter interiors as a service line. If we surface interiors, do it as a **curated marketplace of verified 3rd-party interior firms with escrow-protected milestone payments** — that is a direct anti-pattern to their pain point.

---

## 10. AI & Data Intelligence Features (User-Facing Today)

- **Live and shipped**:
  - Native ChatGPT app for property search (Jun 2026) — [chatgpt.com/apps/square-yards].
  - AI-based loan eligibility engine on Urban Money.
  - AI-powered property recommendation feed in the mobile app.
  - PropVR — 3D + VR walkthroughs (in-app + web).
  - Data Intelligence dashboard — 8.6 M gov-registered transactions, price trends per building/locality.
  - Online property valuation (algorithmic).
- **Announced / infra**:
  - RBI Innovation Hub partnership to digitise 100M+ property records + enable e-valuation and title services.
- **Not evidenced on live surface**: voice assistant, chat concierge inside squareyards.com, AI-generated listing descriptions, image auto-QA. `[not found in indexed content]`

SellEasy24 wedge: they hold the ChatGPT badge but the actual **web-side conversational UI** does not exist. Shipping a floating conversational search on our own site (via Claude or OpenAI Responses API + our listing embeddings) closes the gap on-property.

---

## 11. Content & SEO Strategy

Square Yards' organic footprint is built on three URL templates, each producing thousands of pages:

1. **Locality × property-type × BHK × budget** combinatorial permalinks (`/sale/3-bhk-apartments-flats-in-hyderabad-between-75-lakhs-to-1-crore-for-sale`) — captures every long-tail query.
2. **Locality overview pages** (`/{locality}-in-{city}-overview-{id}`) with reviews, price trends, videos, maps, FAQ — captures navigational + informational queries.
3. **Price-rate micro pages** (`/property-rates/{locality}-{city}`) — single strong H1 (e.g. "Kokapet Property Rates — ₹11,900/sq ft, +1.65% | Aug 2026") for rate-lookup queries.

Plus:
- **Builder profile pages** for developer-name queries.
- **Agent profile pages** for agent-name queries.
- **RERA index pages** for regulatory queries.
- **Blog** covering legal (RERA), fraud, buying/renting guides, city guides, market updates — feeds Google Discover + captures top-of-funnel intent.
- **Reviews on-domain** (`/reviews` + `/reviews/locality/*`) to keep 4-5-star UGC on their property instead of on Google/MouthShut.

For SellEasy24: replicate templates 1, 2, 3 for Hyderabad only. That's ~200 locality pages × ~10 canned filter permutations = ~2,000 SEO pages generated from templates. High-value, low-effort.

---

## 12. User Pain Points (from third-party reviews)

Recurring themes from Trustpilot + MouthShut + Glassdoor + third-party complaint threads ([Trustpilot](https://www.trustpilot.com/review/www.squareyards.com), [MouthShut aggregate](https://www.mouthshut.com/product-reviews/squareyards-reviews-926025973), [MouthShut IC](https://www.mouthshut.com/review/interior-company-review-uotttqsqsop), [Glassdoor "fraud" reviews](https://www.glassdoor.com/Reviews/Square-Yards-fraud-Reviews-EI_IE854289.0,12_KH13,18.htm)):

- **Pre-booking hyper-chase, post-booking silence**: agents call/message aggressively until the token is paid, then go dark on emails, calls, WhatsApp for months.
- **Verbal cashback / discount promises never converted to writing**: ₹50k–1L cashback commitments dropped once written confirmation is requested.
- **Refund friction**: refund requests routed through minimum-service-consumption rules; customers report money "lost".
- **Interior Company delivery failures**: 60% complete after 90% paid; timelines missed by 12–18 months.
- **Individual agent fraud accusations**: mis-selling, misrepresentation of project specs.
- **Broker-like behavior despite "no-broker" positioning**: complaints that Square Yards representatives behave as brokers with commission incentives.
- **Cold-call / re-marketing intensity** after any form submission `[inference from repeated Trustpilot complaints]`.

SellEasy24 must design against each: written commitments only, self-serve refund flow, escrow-milestone payments for any service, hard cap on outbound call frequency after a lead is captured, agent-code-of-conduct badge visible on every listing.

---

## 13. Tech Stack Signals

- **Cloud**: Google Cloud Platform — GKE (Kubernetes), Pub/Sub, custom VMs, autoscaling. Full-stack migration with **zero downtime**, **+25% page-load perf**, **-15% cost**. Serves **~8 M monthly visitors** ([Google Cloud case study](https://cloud.google.com/customers/squareyards)).
- **Front door blocking**: their WAF returns 403 to Claude WebFetch UA — indicates active bot / scraper mitigation (likely Cloud Armor or Cloudflare-equivalent) `[inference]`.
- **Native apps**: Android + iOS with feature parity ([Play Store](https://play.google.com/store/apps/details?id=com.sq.yrd.squareyards), [App Store](https://apps.apple.com/in/app/square-yards/id1093755061)).
- **AI infra**: OpenAI Apps SDK (ChatGPT app), internal AI models for recommendations + loan eligibility.
- **PropVR** for 3D/VR — in-house product line.
- **Data**: 8.6 M gov-registered transaction records, 100M+ property records via RBI IH partnership.
- URL slug generator is aggressive and consistent — implies a **CMS / SEO-templating layer** driving thousands of pages from structured data `[inference]`.

---

## 14. Priority Replication List for SellEasy24

Ranked by value × ease-of-build given what SellEasy24 already ships (verification queue, seller/buyer flows, PWA, service worker, map page, GPS "near me", blog).

| Rank | Feature | Rationale (1 line) |
|------|---------|--------------------|
| 1 | **Canned-filter permalink template** (`/sale/{bhk}-bhk-flats-in-{locality}-hyderabad-between-{lo}-{hi}`) | Cheapest SEO force-multiplier — 2,000+ pages generated from our existing listing data in one sprint. |
| 2 | **Locality overview page template** (map + 1/3/5-yr price trend + pros/cons + reviews + top projects + FAQ) | Directly attacks Square Yards' strongest SEO surface for Hyderabad; we already have GPS + map from Phase 1. |
| 3 | **Price-rate micro-pages** (`/property-rates/{locality}-hyderabad`) with one H1 + one number + one delta | Trivial to ship, captures rate-lookup search intent. |
| 4 | **RERA cross-check automation on Verified badge** with visible last-checked timestamp | Turns a Phase-2 planned feature into a public trust signal Square Yards cannot match at their SLA. |
| 5 | **Price history per listing** (from registrar scrapes + our own sold-through data) | Direct clone of Data Intelligence's most-loved feature; ship with only Hyderabad districts to start. |
| 6 | **On-site conversational search** (Claude/OpenAI over listing embeddings) | Closes the ChatGPT-app gap on our own domain — they only have off-domain conversational UI. |
| 7 | **EMI + eligibility calculator** with one bank-partner pre-approval hand-off | 1-week build, feeds Phase 3 financing partnership. |
| 8 | **Anti-fraud help-desk page** with Hyderabad-specific checklist + report form | Match `/fraud-identification`; use our verification queue as the differentiator. |
| 9 | **Owner-plans page** (Free vs. Featured) + featured-listing paid tier | Direct revenue; we already have post-property flow. |
| 10 | **Locality reviews UGC** (`/reviews/locality/…`) with moderated pros/cons | Owned trust surface — keeps 4/5-star content on our domain, not on Google. |
| 11 | **Builder profile pages** aggregating a builder's projects + RERA history | Low effort from existing data; unique Hyderabad-focused angle. |
| 12 | **Rent search parity** (furnishing, tenant type, deposit, availability, zero-brokerage toggle, pets) | Filter parity is the price of entry; ship in one sprint. |
| 13 | **Project detail page with sticky enquire + brochure + site-visit + EMI** | Standardises new-project UX; unlocks builder monetisation. |
| 14 | **Written-commitment discipline** — every discount / cashback / callback promise captured as a signed PDF in-app | Zero visual UI weight, huge trust wedge against Square Yards' single biggest complaint pattern. |
| 15 | **Escrow-milestone flow for any premium / interior / service upsell** | Insures against the Interior-Company failure mode before we ever offer such services. |

Deferred (Hard for a small team; Phase 4+): PropVR-style 3D tours (needs content ops), full loan aggregator (needs 100+ lender contracts), Azuro-style property-management ops (needs field staff + insurance), native ChatGPT app (do the on-site version first, port after).

---

### Sources (canonical URLs cited above)
- Homepage & product surface: [squareyards.com](https://www.squareyards.com/), [Google Play listing](https://play.google.com/store/apps/details?id=com.sq.yrd.squareyards&hl=en_IN), [App Store listing](https://apps.apple.com/in/app/square-yards/id1093755061)
- Search pages: [Hyd Sale](https://www.squareyards.com/sale/property-for-sale-in-hyderabad), [Hyd New Projects](https://www.squareyards.com/new-projects-in-hyderabad), [Hyd New Launch](https://www.squareyards.com/new-launch-projects-in-hyderabad), [Hyd RERA](https://www.squareyards.com/rera-registered-projects-in-hyderabad)
- Localities: [Kondapur overview](https://www.squareyards.com/kondapur-in-hyderabad-overview-1141), [Gachibowli overview](https://www.squareyards.com/gachibowli-in-hyderabad-overview-1130), [Kokapet rates](https://www.squareyards.com/property-rates/kokapet-hyderabad), [Kondapur reviews](https://www.squareyards.com/reviews/locality/kondapur-in-hyderabad/65643), [Kondapur new-launch](https://www.squareyards.com/new-launch-projects-in-kondapur-hyderabad), [Gachibowli projects](https://www.squareyards.com/projects-in-gachibowli-hyderabad)
- Project pages: [Aparna Residency Kondapur](https://www.squareyards.com/hyderabad-residential-property/aparna-residency-kondapur/133567/project), [Signature Towers](https://www.squareyards.com/hyderabad-residential-property/signature-towers/138910/project)
- Verticals: [Urban Money home](https://www.urbanmoney.com/), [Urban Money about](https://www.urbanmoney.com/about-us), [Azuro / property mgmt](https://www.squareyards.com/property-management), [Azuro overview blog](https://www.squareyards.com/blog/square-yards-scales-up-300-million-aum-assets-under-management-with-azuro), [Interior Company (SY)](https://www.squareyards.com/interior-company), [Interior Company site](https://www.interiorcompany.com/)
- Trust / RERA / Fraud: [/fraud-identification](https://www.squareyards.com/fraud-identification), [Fraud red flags blog](https://www.squareyards.com/blog/property-fraud-alert-major-red-flags-that-signal-a-scam), [RERA 10-state compliance blog](https://www.squareyards.com/blog/square-yards-now-rera-compliant-10-states-indian-player-broad-based-compliance-place)
- Tools & data: [Data Intelligence](https://www.squareyards.com/data-intelligence), [Online Valuation](https://www.squareyards.com/online-property-valuation), [EMI Eligibility](https://www.squareyards.com/emi-eligibility-calculator)
- Owner flows: [/post-property](https://www.squareyards.com/post-property), [Free vs Paid](https://www.squareyards.com/post-property/free-vs-paid), [Owner Plans](https://www.squareyards.com/owner-plans), [Signup](https://www.squareyards.com/user/signup)
- Press / financials: [Google Cloud case study](https://cloud.google.com/customers/squareyards), [YourStory unicorn raise](https://yourstory.com/2026/06/square-yards-raises-rs-900-crore-at-unicorn-valuation), [YourStory data transparency 2022](https://yourstory.com/2022/02/square-yards-price-transparency-real-estate-transaction-records), [Inc42 profile](https://inc42.com/company/square-yards/), [Tracxn](https://tracxn.com/d/companies/square-yards/__8OnVGnLPQWV1bKyBfeDeC2g8OM6rT3L1jACq3M22hnc), [ChatGPT app press — Realty n More](https://realtynmore.com/square-yards-launche-search-app-on-chatgptplatform/), [ChatGPT app — Realty Today](https://therealtytoday.com/news/technology/square-yards-becomes-first-indian-proptech-company-to-launch-native-app-on-chatgpt/), [RBI Innovation Hub partnership](https://therealtytoday.com/news/technology/square-yards-teams-up-with-rbi-innovation-hub-to-digitise-100m-property-records-enable-e-valuation-title-services/), [Construction Week India — data intelligence](https://www.constructionweekonline.in/business/square-yards-brings-price-transparency-in-real-estate-with-actual-recorded-history-of-transaction-prices), [Tribune — Urban Money](https://www.tribuneindia.com/news/business/why-home-loan-borrowers-can-no-longer-trust-a-single-recommendation-2-2), [Wikipedia](https://en.wikipedia.org/wiki/Square_Yards_(company))
- Reviews / complaints: [Trustpilot](https://www.trustpilot.com/review/www.squareyards.com), [MouthShut aggregate](https://www.mouthshut.com/product-reviews/squareyards-reviews-926025973), [MouthShut Interior Company](https://www.mouthshut.com/review/interior-company-review-uotttqsqsop), [MouthShut IC by SY](https://www.mouthshut.com/review/squareyards-review-osrurtslqmp), [Glassdoor "fraud" reviews](https://www.glassdoor.com/Reviews/Square-Yards-fraud-Reviews-EI_IE854289.0,12_KH13,18.htm)
