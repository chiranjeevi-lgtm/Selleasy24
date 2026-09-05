/**
 * Static blog posts.
 *
 * Kept in-file for the scaffold: the blog does not need a database or CMS on
 * day one, and static content ships without touching the API surface, Prisma
 * schema, or any shared infrastructure. Swap the source for MDX or a CMS
 * later without changing the page components.
 */

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  author: string;
  publishedAt: string;
  readMinutes: number;
  category: 'Buying' | 'Verification' | 'Regulation' | 'Neighbourhoods';
  body: string[];
}

export const posts: BlogPost[] = [
  {
    slug: 'what-verification-actually-checks',
    title: 'What verification actually checks before a home appears',
    excerpt:
      'A plain description of the ownership documents an officer compares against every listing — and why a photograph and a phone number are not enough.',
    author: 'SellEasy24 editorial',
    publishedAt: '2025-11-04',
    readMinutes: 6,
    category: 'Verification',
    body: [
      'Every home on the site reaches a buyer only after a verification officer has read the seller’s ownership documents and matched them to what the listing claims. The check happens once, before the listing goes live, and the outcome is recorded on the listing itself — the date, the officer, and what was compared.',
      'The core document is the sale deed. It names the current owner, describes the property with its survey number and boundaries, and shows the chain of ownership back to the last registered transaction. If the name on the deed does not match the person listing the home, the listing does not appear.',
      'Alongside the deed, the officer looks at the encumbrance certificate for the last thirteen years. It shows every registered charge on the property — mortgages, court orders, prior sales. A clean EC is what lets a buyer know they are not stepping into someone else’s dispute.',
      'For apartments and independent houses, the officer confirms the building has an occupancy certificate and, where applicable, that the project is registered with the Telangana State RERA. They also cross-check the sanctioned building plan against the approving authority — HMDA or GHMC — so a buyer isn’t discovering unauthorised construction at the last minute of a loan sanction.',
      'None of this is unusual work — it is what any careful buyer’s lawyer would do before a sale. The difference is that on SellEasy24 it happens before the buyer arrives, not after they have already made a shortlist.',
    ],
  },
  {
    slug: 'reading-a-rera-registration-number',
    title: 'How to read a RERA registration number',
    excerpt:
      'The eleven characters on a project brochure carry the state, the year of registration and the promoter’s serial — here is how to unpack them.',
    author: 'Editorial desk',
    publishedAt: '2025-10-21',
    readMinutes: 4,
    category: 'Regulation',
    body: [
      'The Real Estate (Regulation and Development) Act of 2016 requires every residential project above eight units or five hundred square metres to register with the state regulator before advertising a single unit. In Telangana, that regulator is TSRERA, and the registration number is what tells a buyer the project is disclosed and answerable.',
      'A Telangana RERA number begins with the state code, followed by the project type, the district, the year of registration and a serial. The full number is searchable on the TSRERA portal, which returns the project name, promoter, approved plan, completion date and a list of complaints on file.',
      'A number on a brochure that does not resolve on the portal is not a RERA registration — it is a claim. Ask the promoter which page you can find it on before you pay a booking amount, and confirm the completion date on the portal matches what the sales team told you. Deadlines slip; the portal shows the amended date.',
      'On SellEasy24, every project listing links directly to the TSRERA record. The link is not the verification — the officer already checked it — but it lets a buyer confirm the record independently, which is the point of a regulator in the first place.',
    ],
  },
  {
    slug: 'buying-in-kokapet-what-to-expect',
    title: 'Buying in Kokapet: what to expect in 2025',
    excerpt:
      'A neighbourhood note on the west corridor’s fastest-growing residential zone — infrastructure, price bands, and the questions worth asking before a site visit.',
    author: 'Neighbourhood desk',
    publishedAt: '2025-10-08',
    readMinutes: 7,
    category: 'Neighbourhoods',
    body: [
      'Kokapet sits at the western edge of the Financial District, five kilometres from the Outer Ring Road and eight from the airport link. Ten years ago it was farmland behind Gachibowli; today it is the corridor’s largest concentration of new high-rise inventory, with roughly forty active project registrations on the TSRERA portal.',
      'Most inventory here is three-bedroom apartments in towers of thirty to forty floors, positioned at the upper end of the mid-market. Price per square foot in registered projects ranges between nine and fourteen thousand rupees at launch, with completed inventory trading above that. A handful of low-rise villa communities exist alongside the towers, though the vast majority of new units are apartments.',
      'The infrastructure story is unusually specific to this pocket. The HMDA Neopolis auction reshaped the market here, and every large parcel sold in that round has since become a named apartment project. Water is supplied by the HMWSSB main from Manikonda; sewage is on the municipal line rather than the septic tanks that still serve parts of Narsingi to the north.',
      'The questions worth asking on a site visit are the ones the brochure will not answer for you. Which floor plate is south-facing? Is the tower on land the promoter owned outright or on a development agreement with the original landowner? What does the sanctioned plan show for the amenity block that the sales team is walking you through — is it approved, or is it a rendering? A verified listing on SellEasy24 will have the sanctioned plan on file; ask to see it before you leave.',
    ],
  },
  {
    slug: 'why-your-phone-number-stays-with-you',
    title: 'Why your phone number stays with you',
    excerpt:
      'The reason SellEasy24 sends your contact details to exactly one seller — and never to the others.',
    author: 'Product team',
    publishedAt: '2025-09-19',
    readMinutes: 3,
    category: 'Buying',
    body: [
      'On most property sites, entering your phone number on any listing enters it into a shared lead pool. The listing you contacted receives it, and so does every broker who has paid for the postcode, and often several who have not. Within a day the buyer has ten calls, none of which they invited.',
      'SellEasy24 works the other way around. Your phone number goes to the one seller whose listing you contacted, and only that seller. It is not shared with other sellers, with brokers who did not list the home, or with any third party. If you enquire on three listings, three sellers see your number — no more.',
      'Site visits work the same way. The visit request goes to the listing owner. If the visit does not happen, the number is not passed on, and the enquiry closes with the record kept on your account rather than distributed elsewhere.',
      'A property search that costs a buyer their phone privacy is not a search — it is a lead-generation product with the buyer as the raw material. We think the buyer is the customer.',
    ],
  },
];

export function findPost(slug: string): BlogPost | undefined {
  return posts.find((post) => post.slug === slug);
}
