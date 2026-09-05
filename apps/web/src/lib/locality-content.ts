/**
 * Hand-seeded editorial content per locality.
 *
 * The point of a locality overview page is not to be another listings shell.
 * It is to be the answer someone actually gets when they type "buying in
 * Kondapur" into Google. That means short, opinionated, specific writing —
 * not a marketing template.
 *
 * Only the localities we know well enough to write about honestly are
 * seeded here. Everything else falls through to a generic overview so the
 * page still renders, just without the editorial layer.
 *
 * Content style: two sentences of positioning, four to six real pros / real
 * cons (not "spacious rooms" boilerplate), one connectivity paragraph.
 * Keyed by slug — see hyderabad-localities.ts::localitySlug.
 */

export interface LocalityEditorial {
  headline: string;
  positioning: string;
  pros: string[];
  cons: string[];
  connectivity: string;
  buyerProfile: string;
}

export const LOCALITY_CONTENT: Record<string, LocalityEditorial> = {
  'kondapur-hyderabad': {
    headline: 'The mid-market default for the west corridor',
    positioning:
      'Kondapur sits between Gachibowli and Miyapur and is the default choice for anyone working in HITEC City who wants to actually walk out of their office at 7pm and be home by 7:20. Dense apartment supply keeps prices honest and buyer choice wide.',
    pros: [
      'The largest ready-to-move-in inventory of any west-corridor locality',
      'Two metro stations (Gachibowli and Raidurg) inside a fifteen-minute drive',
      'Mature social infrastructure — schools, hospitals, supermarkets, restaurants all within walking distance of most towers',
      'Widest configuration range in the market, from 2BHK compacts under a crore to 4BHK duplexes above three',
    ],
    cons: [
      'Peak-hour traffic on the Kondapur–Gachibowli junction is genuinely bad',
      'Water table pressure means some towers rely on tanker supply through summer',
      'Older stock (2010–2015) is priced close to newer construction because the locality demand keeps floor supply tight',
    ],
    connectivity:
      'Direct access to the Outer Ring Road via the Gachibowli flyover. Metro connectivity via the Gachibowli station on the Blue Line; airport is a 45-minute drive via the ORR. HITEC City and Financial District are both under fifteen minutes in off-peak hours.',
    buyerProfile:
      'IT professional or dual-income family working in HITEC City / Gachibowli / Financial District, ₹1.2–2.5 Cr budget, wants to move in within six months.',
  },

  'gachibowli-hyderabad': {
    headline: 'Where the west corridor pays a premium for proximity',
    positioning:
      'Gachibowli is what Kondapur wanted to be. Same connectivity, better civic infrastructure, meaningfully higher prices. Buyers here are choosing walk-to-office over price efficiency.',
    pros: [
      'Walk-to-office for anyone employed in the DLF / RMZ / Salarpuria office parks',
      'The city\'s cleanest concentration of Grade-A residential inventory',
      'ISB, University of Hyderabad, and international schools within a five-kilometre radius',
      'Blue Line metro station on-locality',
    ],
    cons: [
      'Prices are 15–20% above equivalent Kondapur inventory for the same configuration',
      'Rental yields are compressed compared to Kondapur — the premium is priced in',
      'Most well-located parcels are already built out; new supply is limited and expensive',
    ],
    connectivity:
      'Blue Line metro (Gachibowli station), Outer Ring Road access via the DLF flyover, airport at 40 minutes off-peak. The Financial District is a five-minute drive.',
    buyerProfile:
      'Mid-senior IT executive, ₹2–4 Cr budget, willing to pay a premium to eliminate a daily commute.',
  },

  'kokapet-hyderabad': {
    headline: 'The west corridor\'s newest luxury pocket',
    positioning:
      'Kokapet is what happens when the HMDA sells four hundred acres in a single auction. Every major builder — Prestige, Sumadhura, DLF, My Home — has a project here. Prices reflect the launch premium.',
    pros: [
      'Newest large-scale apartment inventory in Hyderabad; construction quality is uniformly high',
      'Financial District and IT corridor within a ten-minute drive',
      'Wide roads and planned civic infrastructure, unusual for a Hyderabad micro-market',
      'Direct ORR access without going through Gachibowli',
    ],
    cons: [
      'Social infrastructure (schools, hospitals, supermarkets) lags the construction pace by three to five years',
      'Launch prices at ₹11,000–14,000/sqft are near the city ceiling for non-Jubilee Hills stock',
      'Most inventory is under construction — three-year possession horizons are typical',
    ],
    connectivity:
      'Outer Ring Road direct access via the Neopolis exit. No metro at present; nearest station is Raidurg, a fifteen-minute drive. Airport is 35 minutes via the ORR. Nallagandla and Narsingi are five to ten minutes away.',
    buyerProfile:
      'Senior tech / finance professional or NRI investor, ₹2.5–5 Cr budget, comfortable with a two-to-three-year possession wait for a launch-price entry.',
  },

  'madhapur-hyderabad': {
    headline: 'HITEC City\'s residential twin',
    positioning:
      'Madhapur is where HITEC City lives. High-density mixed-use — apartments above showrooms, offices next to schools. Prices reflect walk-to-office more than any locality other than Gachibowli.',
    pros: [
      'Highest concentration of mid-rise apartment inventory of any HITEC City-adjacent locality',
      'Walkable to Cyber Towers, Mindspace, DLF Cyber City',
      'Dense restaurant and retail environment',
      'Blue Line metro on-locality',
    ],
    cons: [
      'Very high daytime traffic; residential streets carry office overflow',
      'Older stock predominates — most inventory is 10–15 years old',
      'Air quality noticeably worse than Kondapur / Kokapet due to density',
    ],
    connectivity:
      'Blue Line metro (Madhapur, Durgam Cheruvu, and HITEC City stations). ORR via Kondapur / Hafeezpet. Airport is 45 minutes off-peak.',
    buyerProfile:
      'HITEC City IT professional who prioritises proximity over new construction, ₹1.5–3 Cr budget.',
  },

  'hitech-city-hyderabad': {
    headline: 'The office district with a residential edge',
    positioning:
      'Not a traditional residential locality — HITEC City is where people work. Residential inventory here is mostly service apartments, small studios, and a few flagship towers directly adjacent to the office parks.',
    pros: [
      'Zero commute for anyone employed inside the HITEC City / Cyber Towers ecosystem',
      'Blue Line metro directly on-locality',
      'Highest walkability score of any west-corridor locality',
    ],
    cons: [
      'Very limited residential inventory — most buildings are commercial',
      'Prices per square foot are among the highest in the city for what is often smaller-format housing',
      'Weekends are empty; the locality is designed around the office population',
    ],
    connectivity:
      'Blue Line metro (HITEC City station). Direct access to Cyber Towers, Mindspace, DLF. Airport is 45 minutes.',
    buyerProfile:
      'Single professional or small family working in HITEC City, ₹1.5–3 Cr budget for a compact-format apartment.',
  },

  'narsingi-hyderabad': {
    headline: 'The affordable end of the west corridor',
    positioning:
      'Narsingi is Kokapet ten years ago — same road, cheaper prices, less developed civic infrastructure. Buyers here are betting on the corridor expansion catching up to their address.',
    pros: [
      'Prices 20–30% below equivalent Kokapet inventory',
      'Direct ORR access via the Narsingi exit',
      'Multiple large developer projects launched in the last two years',
      'Emerging school and hospital infrastructure',
    ],
    cons: [
      'Public transport is limited — car ownership is essential',
      'Retail and restaurant density is still thin',
      'Some pockets have inconsistent water and drainage infrastructure',
    ],
    connectivity:
      'Outer Ring Road via the Narsingi exit. Nearest metro is Raidurg, a twenty-minute drive. Airport is 30 minutes via the ORR — faster than most west-corridor localities.',
    buyerProfile:
      'First-time buyer or younger family, ₹1–2 Cr budget, willing to trade civic maturity for price.',
  },

  'financial-district-hyderabad': {
    headline: 'Where the banks live',
    positioning:
      'Purpose-built for financial-services firms and the senior professionals who staff them. Residential inventory is limited, high-end, and prices at a premium to the surrounding west corridor.',
    pros: [
      'Walk-to-office for anyone employed in the Financial District campuses',
      'Newer and better-planned than the older parts of HITEC City',
      'Direct ORR access; airport in 35 minutes',
    ],
    cons: [
      'Very limited residential inventory',
      'Schools and hospitals cluster in adjacent Gachibowli / Kokapet, not on-locality',
      'Weekend atmosphere is quiet',
    ],
    connectivity:
      'ORR direct access. Nearest metro is Raidurg (Blue Line), twelve minutes. Airport 35 minutes via ORR.',
    buyerProfile:
      'Financial-services executive, ₹2.5–5 Cr budget, wants a short commute above all.',
  },

  'jubilee-hills-hyderabad': {
    headline: 'Hyderabad\'s prestige address',
    positioning:
      'Old money, new money, and the film industry. Inventory here is dominated by independent villas and low-rise apartments; new high-rise construction is rare and expensive.',
    pros: [
      'The city\'s most established premium residential address',
      'Mature tree cover, low density, quiet interior lanes',
      'Concentration of specialty hospitals, restaurants, and international schools',
    ],
    cons: [
      'Apartment inventory is thin and expensive relative to comparable west-corridor stock',
      'Traffic on Road No. 36 / 45 during evening hours is heavy',
      'New construction requires acquiring older stock — approvals can take years',
    ],
    connectivity:
      'Nearest metro is Jubilee Hills Check Post (Green Line, ~2 km). HITEC City is 20 minutes; airport is 45 minutes.',
    buyerProfile:
      'Established professional, business owner, or NRI, ₹4–15 Cr budget, wants a legacy address more than a commute optimization.',
  },

  'banjara-hills-hyderabad': {
    headline: 'Old Hyderabad\'s premium heart',
    positioning:
      'Banjara Hills predates HITEC City by decades and remains the choice for buyers who want proximity to the city\'s commercial and diplomatic centres over the tech corridor. Prices are on par with Jubilee Hills.',
    pros: [
      'Central to the old city commercial districts (Somajiguda, Punjagutta, Ameerpet)',
      'Highest concentration of embassies, consulates, and international schools',
      'Green cover and mature streets',
    ],
    cons: [
      'Traffic on Road No. 12 is genuinely bad throughout the day',
      'Most inventory is older — 15+ years is typical',
      'Newer apartment construction is limited by acquisition costs',
    ],
    connectivity:
      'Nearest metro is Punjagutta (Red Line, ~2 km). HITEC City is 30 minutes off-peak.',
    buyerProfile:
      'Established Hyderabadi family, business owner, or diplomat, ₹3–10 Cr budget, prioritises central-city proximity.',
  },

  'tellapur-hyderabad': {
    headline: 'The west corridor\'s next affordable frontier',
    positioning:
      'Tellapur is what Kokapet was five years ago. Multiple large builders are launching here; prices are meaningfully below Kokapet for equivalent construction. Buyers are betting on the pattern repeating.',
    pros: [
      'Launch prices 25–35% below Kokapet for comparable configurations',
      'Direct connectivity to ORR and the Financial District',
      'New large-format projects with generous amenity mixes',
    ],
    cons: [
      'Social infrastructure is nascent',
      'Public transport is essentially non-existent',
      'Water infrastructure varies significantly between developments',
    ],
    connectivity:
      'ORR via the Tellapur exit. Nearest metro is Raidurg, a 25-minute drive. Airport is 45 minutes.',
    buyerProfile:
      'Younger buyer or investor, ₹1–2 Cr budget, comfortable with a two-year possession wait and a car-dependent lifestyle.',
  },
};

export function localityContent(slug: string): LocalityEditorial | undefined {
  return LOCALITY_CONTENT[slug];
}
