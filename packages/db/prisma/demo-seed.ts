/**
 * Demo dataset.
 *
 * Separate from the reference/dev seed on purpose. This one exists so the
 * product can be *looked at* — realistic Hyderabad listings, real photographs,
 * verification records with dates spread over the past few weeks.
 *
 * It refuses to run against production. Development only.
 *
 * Photographs come from the curated set in prisma/demo-photos, selected by
 * eye. They are demo placeholders only — real listings carry photographs
 * uploaded by their sellers.
 */
import {
  Amenity,
  ApprovingAuthority,
  DocumentKind,
  FacingDirection,
  FurnishingStatus,
  IdProofKind,
  LeadStatus,
  ListingStatus,
  OwnershipType,
  PossessionStatus,
  Prisma,
  PrismaClient,
  ProjectStage,
  ProjectStatus,
  Role,
  SellerKind,
  SiteVisitStatus,
  VerificationCheckKind,
  VerificationDecision,
} from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const prisma = new PrismaClient();

/** Where the API's local storage driver expects public media to live. */
const PUBLIC_STORAGE = resolve(process.cwd(), '..', '..', 'apps', 'api', 'storage', 'public');

interface DemoListing {
  locality: string;
  title: string;
  description: string;
  /** Whole rupees. */
  price: number;
  bedrooms: number;
  bathrooms: number;
  areaSqft: number;
  yearBuilt: number;
  address: string;
  seller: 'owner' | 'broker';
  /** Days ago this was first published — drives "Listed N days ago". */
  listedDaysAgo: number;
  /** Subject tags for the photographs. */
  photoTags: string[];
}

/**
 * Structured attributes for each demo listing.
 *
 * Every value here is transcribed from what that listing's own description
 * already says — "third floor of a nine-storey building, east facing, two
 * covered parking bays" becomes floor 3, totalFloors 9, EAST, coveredParking 2.
 * Nothing is invented: a demo where the structured fields contradict the prose
 * would be showing off precisely the inconsistency this feature exists to fix.
 *
 * Fields a description does not mention are left out rather than guessed, which
 * also gives the UI a realistic mix of complete and partial listings to render.
 *
 * Keyed by locality because each appears exactly once in LISTINGS; that
 * assumption is asserted at seed time so a future duplicate fails loudly
 * instead of silently taking the wrong row.
 */
interface StructuredFacts {
  floor?: number;
  totalFloors?: number;
  facing?: FacingDirection;
  furnishing?: FurnishingStatus;
  coveredParking?: number;
  openParking?: number;
  balconies?: number;
  amenities: Amenity[];
  ownership: OwnershipType;
  approvingAuthority: ApprovingAuthority;
}

const STRUCTURED: Record<string, StructuredFacts> = {
  Gachibowli: {
    floor: 3,
    totalFloors: 9,
    facing: FacingDirection.EAST,
    furnishing: FurnishingStatus.SEMI_FURNISHED,
    coveredParking: 2,
    balconies: 1,
    amenities: [Amenity.LIFT, Amenity.POWER_BACKUP, Amenity.BOREWELL, Amenity.GYM, Amenity.PARK],
    ownership: OwnershipType.FREEHOLD,
    approvingAuthority: ApprovingAuthority.HMDA,
  },
  Kondapur: {
    floor: 2,
    facing: FacingDirection.NORTH,
    furnishing: FurnishingStatus.SEMI_FURNISHED,
    coveredParking: 1,
    amenities: [Amenity.MAINTENANCE_STAFF],
    ownership: OwnershipType.FREEHOLD,
    approvingAuthority: ApprovingAuthority.HMDA,
  },
  Madhapur: {
    floor: 6,
    furnishing: FurnishingStatus.SEMI_FURNISHED,
    amenities: [
      Amenity.GATED_COMMUNITY,
      Amenity.SECURITY,
      Amenity.CLUBHOUSE,
      Amenity.SWIMMING_POOL,
      Amenity.LIFT,
    ],
    ownership: OwnershipType.CO_OPERATIVE_SOCIETY,
    approvingAuthority: ApprovingAuthority.GHMC,
  },
  'Jubilee Hills': {
    floor: 1,
    totalFloors: 2,
    furnishing: FurnishingStatus.UNFURNISHED,
    coveredParking: 3,
    amenities: [],
    ownership: OwnershipType.FREEHOLD,
    approvingAuthority: ApprovingAuthority.GHMC,
  },
  Kukatpally: {
    floor: 4,
    facing: FacingDirection.WEST,
    furnishing: FurnishingStatus.SEMI_FURNISHED,
    coveredParking: 1,
    amenities: [Amenity.LIFT],
    ownership: OwnershipType.FREEHOLD,
    approvingAuthority: ApprovingAuthority.GHMC,
  },
  Miyapur: {
    // Ground floor. Stored as 0, which is exactly why `floor` is nullable
    // rather than defaulted — 0 is a real answer here.
    floor: 0,
    furnishing: FurnishingStatus.UNFURNISHED,
    coveredParking: 1,
    amenities: [Amenity.BOREWELL, Amenity.POWER_BACKUP],
    ownership: OwnershipType.FREEHOLD,
    approvingAuthority: ApprovingAuthority.HMDA,
  },
  'Banjara Hills': {
    floor: 9,
    furnishing: FurnishingStatus.FULLY_FURNISHED,
    coveredParking: 2,
    balconies: 1,
    amenities: [Amenity.POWER_BACKUP, Amenity.GYM, Amenity.LIFT],
    ownership: OwnershipType.FREEHOLD,
    approvingAuthority: ApprovingAuthority.GHMC,
  },
  Manikonda: {
    floor: 3,
    totalFloors: 4,
    facing: FacingDirection.SOUTH,
    furnishing: FurnishingStatus.SEMI_FURNISHED,
    coveredParking: 0,
    openParking: 1,
    amenities: [Amenity.MAINTENANCE_STAFF],
    ownership: OwnershipType.FREEHOLD,
    approvingAuthority: ApprovingAuthority.HMDA,
  },
  Nallagandla: {
    floor: 5,
    furnishing: FurnishingStatus.SEMI_FURNISHED,
    balconies: 2,
    amenities: [
      Amenity.CLUBHOUSE,
      Amenity.SWIMMING_POOL,
      Amenity.GYM,
      Amenity.CHILDRENS_PLAY_AREA,
      Amenity.PARK,
    ],
    ownership: OwnershipType.CO_OPERATIVE_SOCIETY,
    approvingAuthority: ApprovingAuthority.HMDA,
  },
  Kokapet: {
    floor: 11,
    facing: FacingDirection.WEST,
    furnishing: FurnishingStatus.SEMI_FURNISHED,
    coveredParking: 2,
    balconies: 1,
    amenities: [Amenity.LIFT, Amenity.SECURITY],
    ownership: OwnershipType.FREEHOLD,
    approvingAuthority: ApprovingAuthority.HMDA,
  },
  Bachupally: {
    floor: 2,
    facing: FacingDirection.NORTH_EAST,
    furnishing: FurnishingStatus.UNFURNISHED,
    coveredParking: 1,
    amenities: [Amenity.LIFT, Amenity.BOREWELL, Amenity.PARK],
    ownership: OwnershipType.FREEHOLD,
    approvingAuthority: ApprovingAuthority.DTCP,
  },
  Narsingi: {
    floor: 7,
    furnishing: FurnishingStatus.SEMI_FURNISHED,
    coveredParking: 1,
    balconies: 2,
    amenities: [Amenity.LIFT, Amenity.SECURITY],
    ownership: OwnershipType.FREEHOLD,
    approvingAuthority: ApprovingAuthority.HMDA,
  },
};

const LISTINGS: DemoListing[] = [
  {
    locality: 'Gachibowli',
    title: '3 BHK with a wide east-facing balcony in Gachibowli',
    description:
      'Third floor of a nine-storey building, east facing, with an unusually wide balcony running the length of the living room. Two covered parking bays, lift with power backup, and borewell plus municipal water. Walking distance to the ORR junction and about ten minutes from the financial district. Society has a gym and a small park.',
    price: 14_500_000,
    bedrooms: 3,
    bathrooms: 3,
    areaSqft: 1850,
    yearBuilt: 2019,
    address: 'Plot 42, Vittal Rao Nagar',
    seller: 'owner',
    listedDaysAgo: 3,
    photoTags: ['apartment,livingroom', 'bedroom,interior', 'kitchen,modern', 'balcony,apartment'],
  },
  {
    locality: 'Kondapur',
    title: '2 BHK near Botanical Garden metro, ready to move',
    description:
      'Second floor, north facing, in a quiet lane off the main road. Modular kitchen, wardrobes in both bedrooms, and one covered parking space. Five minutes walk to Botanical Garden metro station and close to two schools. The building has twenty-four flats and a resident association that maintains it well.',
    price: 7_800_000,
    bedrooms: 2,
    bathrooms: 2,
    areaSqft: 1180,
    yearBuilt: 2017,
    address: 'Flat 204, Sai Enclave, Kondapur Main Road',
    seller: 'owner',
    listedDaysAgo: 8,
    photoTags: ['apartment,interior', 'bedroom,apartment', 'kitchen,interior'],
  },
  {
    locality: 'Madhapur',
    title: '3 BHK in a gated community close to Hitech City',
    description:
      'Sixth floor with a clear view over the community garden. Vitrified flooring throughout, false ceiling in the living room, and a utility area off the kitchen. Gated community with security, clubhouse, swimming pool and two lifts per block. Ten minutes from Hitech City MMTS.',
    price: 16_200_000,
    bedrooms: 3,
    bathrooms: 3,
    areaSqft: 1950,
    yearBuilt: 2021,
    address: 'Tower C, Aparna Cyber Life, Madhapur',
    seller: 'broker',
    listedDaysAgo: 5,
    photoTags: ['apartment,livingroom', 'bedroom,modern', 'bathroom,interior', 'apartment,balcony'],
  },
  {
    locality: 'Jubilee Hills',
    title: '4 BHK independent floor on a quiet Jubilee Hills road',
    description:
      'Entire first floor of a two-storey building on a 400 square yard plot, with private entrance and terrace rights. Four bedrooms each with attached bath, a separate pooja room, servant quarters, and parking for three cars. Road 45, close to the Apollo hospital junction.',
    price: 42_500_000,
    bedrooms: 4,
    bathrooms: 4,
    areaSqft: 3400,
    yearBuilt: 2015,
    address: 'Road No. 45, Jubilee Hills',
    seller: 'owner',
    listedDaysAgo: 12,
    photoTags: ['villa,interior', 'livingroom,luxury', 'bedroom,luxury', 'house,exterior'],
  },
  {
    locality: 'Kukatpally',
    title: '2 BHK in KPHB, walking distance to the metro',
    description:
      'Fourth floor, west facing, in a building of thirty-two flats. Recently repainted, new bathroom fittings, and a covered parking bay. Two minutes from KPHB Colony metro station and close to Forum Sujana Mall. Suited to a family that wants to be on the metro line.',
    price: 6_200_000,
    bedrooms: 2,
    bathrooms: 2,
    areaSqft: 1050,
    yearBuilt: 2014,
    address: 'Flat 401, Sri Sai Residency, KPHB Phase 6',
    seller: 'broker',
    listedDaysAgo: 19,
    photoTags: ['apartment,interior', 'bedroom,simple', 'kitchen,apartment'],
  },
  {
    locality: 'Miyapur',
    title: '3 BHK with covered parking and a large utility area',
    description:
      'Ground floor with a small private sit-out, useful if you have young children or elderly parents. Three bedrooms, two baths, and a utility area big enough for a washing machine and storage. Borewell plus municipal water, and a generator for common areas.',
    price: 8_500_000,
    bedrooms: 3,
    bathrooms: 2,
    areaSqft: 1520,
    yearBuilt: 2018,
    address: 'Flat 002, Sree Nilayam, Miyapur',
    seller: 'owner',
    listedDaysAgo: 2,
    photoTags: ['apartment,livingroom', 'bedroom,interior', 'kitchen,home'],
  },
  {
    locality: 'Banjara Hills',
    title: '3 BHK with city views on Road No. 12',
    description:
      'Ninth floor, corner unit with windows on two sides and a long balcony facing the city. Imported marble in the living areas, wooden flooring in the bedrooms, and a fully fitted modular kitchen. Two covered parking bays, power backup for the whole flat, and a gym in the building.',
    price: 28_000_000,
    bedrooms: 3,
    bathrooms: 3,
    areaSqft: 2400,
    yearBuilt: 2020,
    address: 'Road No. 12, Banjara Hills',
    seller: 'owner',
    listedDaysAgo: 6,
    photoTags: ['apartment,luxury', 'livingroom,modern', 'bedroom,luxury', 'kitchen,modern'],
  },
  {
    locality: 'Manikonda',
    title: '2 BHK in a quiet lane, close to the ORR',
    description:
      'Third floor, south facing, in a small building of sixteen flats with a resident association. Tiled flooring, wardrobes in the master bedroom, and one open parking space. Quiet residential lane with easy access to the Outer Ring Road for the airport run.',
    price: 6_800_000,
    bedrooms: 2,
    bathrooms: 2,
    areaSqft: 1120,
    yearBuilt: 2016,
    address: 'Flat 302, Lakshmi Residency, Manikonda',
    seller: 'owner',
    listedDaysAgo: 25,
    photoTags: ['apartment,interior', 'bedroom,apartment', 'balcony,view'],
  },
  {
    locality: 'Nallagandla',
    title: '3 BHK in a community with a clubhouse and pool',
    description:
      'Fifth floor overlooking the internal garden rather than the road, so it stays quiet. Three bedrooms with wardrobes, two balconies, and a separate dining space. The community has a clubhouse, swimming pool, gym, and a children’s play area. Close to the Lingampally MMTS.',
    price: 11_500_000,
    bedrooms: 3,
    bathrooms: 3,
    areaSqft: 1680,
    yearBuilt: 2020,
    address: 'Block B, Vasavi Signature, Nallagandla',
    seller: 'broker',
    listedDaysAgo: 9,
    photoTags: ['apartment,livingroom', 'bedroom,modern', 'swimmingpool,apartment', 'kitchen,interior'],
  },
  {
    locality: 'Kokapet',
    title: '4 BHK west-facing flat in a new Kokapet tower',
    description:
      'Eleventh floor, west facing, with a wide balcony catching the evening light. Four bedrooms, four baths, a family lounge separate from the main living room, and a maid’s room. Two covered parking bays. The tower has a rooftop deck and is a short drive from the financial district.',
    price: 29_500_000,
    bedrooms: 4,
    bathrooms: 4,
    areaSqft: 2850,
    yearBuilt: 2023,
    address: 'Tower 2, My Home Apas, Kokapet',
    seller: 'broker',
    listedDaysAgo: 1,
    photoTags: ['apartment,luxury', 'livingroom,modern', 'bedroom,luxury', 'balcony,city'],
  },
  {
    locality: 'Bachupally',
    title: '2 BHK, first-time buyer flat with covered parking',
    description:
      'Second floor in a low-rise building, north-east facing. Two bedrooms, two baths, and a covered parking bay. Municipal water plus borewell, lift, and a small common garden. Well suited to a first purchase, close to schools and the Bachupally main road.',
    price: 5_800_000,
    bedrooms: 2,
    bathrooms: 2,
    areaSqft: 1080,
    yearBuilt: 2015,
    address: 'Flat 201, Green Meadows, Bachupally',
    seller: 'owner',
    listedDaysAgo: 31,
    photoTags: ['apartment,interior', 'bedroom,simple', 'kitchen,small'],
  },
  {
    locality: 'Narsingi',
    title: '3 BHK with a study, near the ORR exit',
    description:
      'Seventh floor with a separate study off the living room, which works well if someone in the house works from home. Three bedrooms, three baths, two balconies, and one covered parking bay. Two minutes from the Narsingi ORR exit and close to two international schools.',
    price: 13_500_000,
    bedrooms: 3,
    bathrooms: 3,
    areaSqft: 1780,
    yearBuilt: 2022,
    address: 'Block A, Ramky One Galaxia, Narsingi',
    seller: 'owner',
    listedDaysAgo: 15,
    photoTags: ['apartment,livingroom', 'homeoffice,interior', 'bedroom,modern', 'kitchen,modern'],
  },
];

const CHECKS: VerificationCheckKind[] = [
  VerificationCheckKind.OWNER_NAME_MATCHES_DEED,
  VerificationCheckKind.DEED_REGISTERED_AND_STAMPED,
  VerificationCheckKind.PROPERTY_TAX_CURRENT,
  VerificationCheckKind.LOCATION_MATCHES_DOCUMENTS,
];

/**
 * Curated demo photographs, committed alongside this seed.
 *
 * Earlier versions fetched these at seed time from a tag-based placeholder
 * service. That produced a hotel bathroom for a four-bedroom flat and a crowd of
 * people for another — tag matching on those services is loose enough to be
 * unusable. These were selected by eye instead, so the demo cannot regress into
 * nonsense photographs.
 */
const PHOTO_ROOT = resolve(process.cwd(), 'prisma', 'demo-photos');

function loadPool(kind: 'cover' | 'bedroom' | 'kitchen'): string[] {
  const dir = join(PHOTO_ROOT, kind);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.jpg'))
    .sort()
    .map((f) => join(dir, f));
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo data into production.');
  }

  console.log('Clearing previous demo content…');
  // Order matters: children before parents.
  await prisma.listingView.deleteMany({});
  // Covers both kinds — a lead points at either a listing or a project.
  await prisma.lead.deleteMany({});
  // Cascades from the listing delete below, but clearing it here keeps the
  // count honest if a previous run left listings in place.
  await prisma.siteVisitRequest.deleteMany({});
  // Shortlists too, or reseeding stacks a fresh set on top of the old ones and
  // the saved counts climb every run.
  await prisma.savedListing.deleteMany({});
  await prisma.listingReport.deleteMany({});
  await prisma.verificationCheckResult.deleteMany({});
  await prisma.verification.deleteMany({});
  await prisma.documentAccessLog.deleteMany({});
  await prisma.document.deleteMany({});
  await prisma.listingPhoto.deleteMany({});
  await prisma.priceHistory.deleteMany({});
  await prisma.listing.deleteMany({});
  await prisma.property.deleteMany({});

  // Projects and everything hanging off them. The children cascade, but the
  // verification rows do not — they point at a project rather than being owned
  // by one, so they have to go first.
  await prisma.verificationCheckResult.deleteMany({});
  await prisma.verification.deleteMany({});
  await prisma.projectView.deleteMany({});
  await prisma.project.deleteMany({});

  // Deleting the rows above orphans the JPEGs those rows pointed at. Without
  // this, every re-seed leaves the previous run's photographs on disk with
  // nothing referencing them — after a few runs the storage directory holds
  // several times more files than the demo actually uses.
  rmSync(join(PUBLIC_STORAGE, 'listings'), { recursive: true, force: true });

  const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@kamalainfra.dev' } });
  const broker = await prisma.user.findUniqueOrThrow({ where: { email: 'broker@kamalainfra.dev' } });
  const verifier = await prisma.user.findUniqueOrThrow({
    where: { email: 'verifier@kamalainfra.dev' },
  });
  const builder = await prisma.user.findUniqueOrThrow({
    where: { email: 'builder@kamalainfra.dev' },
  });

  // A builder cannot submit a project without a verified number either.
  await prisma.user.update({
    where: { id: builder.id },
    data: { phone: '+919845012345', isPhoneVerified: true, role: Role.BUILDER },
  });

  // Sellers need a phone before a listing may be submitted.
  await prisma.user.update({
    where: { id: owner.id },
    data: { phone: '+919876543210', sellerKind: SellerKind.OWNER, role: Role.OWNER },
  });
  await prisma.user.update({
    where: { id: broker.id },
    data: { phone: '+919812345678', sellerKind: SellerKind.BROKER, role: Role.BROKER },
  });

  const pools = {
    cover: loadPool(`cover`),
    bedroom: loadPool(`bedroom`),
    kitchen: loadPool(`kitchen`),
  };
  console.log(`Photo pools: ${pools.cover.length} cover, ${pools.bedroom.length} bedroom, ${pools.kitchen.length} kitchen`);

  let listingIndex = 0;
  let created = 0;
  let photosSaved = 0;

  for (const item of LISTINGS) {
    const neighborhood = await prisma.neighborhood.findFirst({
      where: { name: item.locality, city: 'Hyderabad' },
    });
    if (!neighborhood) {
      console.warn(`  skipped ${item.locality} — locality not in reference data`);
      continue;
    }

    const sellerId = item.seller === 'owner' ? owner.id : broker.id;
    const listedAt = new Date(Date.now() - item.listedDaysAgo * 86_400_000);
    // Confirmed some time after listing, but never in the future.
    const confirmedAt = new Date(
      Math.min(Date.now(), listedAt.getTime() + Math.floor(item.listedDaysAgo / 2) * 86_400_000),
    );

    const facts = STRUCTURED[item.locality];
    if (!facts) {
      throw new Error(
        `No structured facts for ${item.locality}. Add an entry to STRUCTURED — ` +
          'a listing without them renders as a half-empty detail page.',
      );
    }

    const property = await prisma.property.create({
      data: {
        address: item.address,
        pincode: neighborhood.pincode,
        propertyType: 'FLAT',
        bedrooms: item.bedrooms,
        bathrooms: item.bathrooms,
        areaSqft: item.areaSqft,
        // Carpet is typically around three quarters of built-up in Hyderabad
        // apartments. Derived rather than listed so it cannot drift above the
        // built-up figure and trip the database CHECK constraint.
        carpetAreaSqft: Math.round(item.areaSqft * 0.75),
        yearBuilt: item.yearBuilt,
        // Every demo property is complete and occupied.
        possession: PossessionStatus.READY_TO_MOVE,
        floor: facts.floor,
        totalFloors: facts.totalFloors,
        facing: facts.facing,
        furnishing: facts.furnishing,
        coveredParking: facts.coveredParking,
        openParking: facts.openParking,
        balconies: facts.balconies,
        amenities: facts.amenities,
        ownership: facts.ownership,
        approvingAuthority: facts.approvingAuthority,
        neighborhoodId: neighborhood.id,
      },
    });

    const listing = await prisma.listing.create({
      data: {
        propertyId: property.id,
        sellerId,
        title: item.title,
        description: item.description,
        price: new Prisma.Decimal(item.price),
        priceNegotiable: item.listedDaysAgo > 14,
        status: ListingStatus.APPROVED,
        isVerified: true,
        firstListedAt: listedAt,
        lastConfirmedAt: confirmedAt,
        // How long this one waited for a decision. Varied rather than fixed:
        // a flat two days for every listing made the dashboard report that the
        // 24-hour promise was missed on every single submission, which is both
        // untrue to how the queue is meant to run and a poor thing to put in
        // front of anyone.
        submittedAt: new Date(listedAt.getTime() - REVIEW_HOURS[listingIndex % REVIEW_HOURS.length]! * 3_600_000),
        verifiedAt: listedAt,
        verifiedById: verifier.id,
        createdAt: new Date(listedAt.getTime() - 3 * 86_400_000),
      },
    });

    // Initial price, plus a reduction on the older listings so the "reduced
    // from" signal has something to show.
    await prisma.priceHistory.create({
      data: {
        listingId: listing.id,
        price: new Prisma.Decimal(item.price),
        previousPrice: null,
        changedById: sellerId,
        changedAt: listing.createdAt,
      },
    });
    if (item.listedDaysAgo > 14) {
      const was = Math.round((item.price * 1.06) / 100_000) * 100_000;
      await prisma.priceHistory.create({
        data: {
          listingId: listing.id,
          price: new Prisma.Decimal(item.price),
          previousPrice: new Prisma.Decimal(was),
          changedById: sellerId,
          changedAt: new Date(Date.now() - 4 * 86_400_000),
        },
      });
    }

    // Documents — metadata only. No encrypted bytes are written, because demo
    // data must never look like a real identity document.
    for (const kind of [
      DocumentKind.SALE_DEED,
      DocumentKind.ID_PROOF,
      DocumentKind.PROPERTY_TAX_RECEIPT,
    ]) {
      await prisma.document.create({
        data: {
          listingId: listing.id,
          uploadedById: sellerId,
          kind,
          idProofKind: kind === DocumentKind.ID_PROOF ? IdProofKind.PAN : null,
          storageKey: `demo/${listing.id}/${kind.toLowerCase()}.enc`,
          encryptionIv: 'demo-not-a-real-iv',
          encryptionTag: 'demo-not-a-real-tag',
          originalFilename: `${kind.toLowerCase()}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 240_000,
          createdAt: listing.createdAt,
        },
      });
    }

    await prisma.verification.create({
      data: {
        listingId: listing.id,
        verifierId: verifier.id,
        decision: VerificationDecision.APPROVED,
        internalNotes: 'Demo record.',
        createdAt: listedAt,
        checks: { create: CHECKS.map((kind) => ({ kind, passed: true })) },
      },
    });

    /**
     * Gallery: exterior or living space first, then a bedroom, then a kitchen.
     * That is the order a buyer expects, and rotating through the pools by index
     * keeps neighbouring cards in the grid from sharing a photograph.
     */
    /*
     * Covers are drawn from every photograph, not just the three exteriors.
     *
     * With only three exterior shots across twelve listings, cards repeated —
     * and worse, two of the three are near-identical waterfront towers, so the
     * grid looked like it was showing the same building over and over. Leading
     * with an interior is normal on property sites anyway, and pulling from the
     * full pool gives eleven distinct covers for twelve listings.
     */
    const allPhotos = [...pools.cover, ...pools.kitchen, ...pools.bedroom];
    const cover = allPhotos[listingIndex % allPhotos.length];

    // The supporting shots skip whatever was used as the cover, so a listing
    // never shows the same photograph twice.
    const supporting = [
      pools.bedroom[listingIndex % pools.bedroom.length],
      pools.kitchen[(listingIndex + 1) % pools.kitchen.length],
    ].filter((file) => file !== cover);

    const gallery = [cover, ...supporting].filter((f): f is string => Boolean(f));

    for (const [index, source] of gallery.entries()) {
      const buffer = readFileSync(source);
      const key = `listings/${listing.id}/photos/${randomUUID()}.jpg`;
      const path = join(PUBLIC_STORAGE, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, buffer);
      await prisma.listingPhoto.create({
        data: {
          listingId: listing.id,
          storageKey: key,
          sortOrder: index,
          sizeBytes: buffer.length,
          width: 640,
          height: 480,
        },
      });
      photosSaved += 1;
    }
    listingIndex += 1;

    created += 1;
    process.stdout.write(`  ${created}/${LISTINGS.length}  ${item.locality}\n`);
  }

  // Locality medians are cached; force a recompute on next read so the
  // comparison figures reflect this dataset.
  await prisma.neighborhood.updateMany({ data: { medianComputedAt: null } });

  const queued = await seedReviewQueue(owner, broker, pools);
  const buyers = await seedBuyerActivity();
  await seedSiteVisits(buyers);
  const projects = await seedProjects(builder, verifier, pools);
  await seedProjectEnquiries(buyers);

  console.log(
    `\nDone. ${created} live listings, ${photosSaved} photographs, ` +
      `${projects.published} live projects, ${queued + projects.pending} awaiting verification.`,
  );
}

// ---------------------------------------------------------------------------
// Buyer activity
// ---------------------------------------------------------------------------

/**
 * Deterministic pseudo-random numbers.
 *
 * `Math.random()` would give a different dataset on every reseed, so a figure
 * on the seller's dashboard could change without anything having happened —
 * which makes the page impossible to talk about or screenshot. This is seeded
 * from the caller, so the same input always produces the same demo.
 */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10_000) / 10_000;
  };
}

/**
 * Views, shortlists and enquiries across the live listings.
 *
 * Shaped as a funnel that narrows the way a real one does: many people look, a
 * few shortlist, fewer write in. A flat dataset where every listing performed
 * identically would make the dashboard useless for demonstrating what it is
 * for — spotting the property that is being looked at but not acted on.
 */
async function seedBuyerActivity(): Promise<string[]> {
  console.log('\nSeeding buyer activity…');

  const listings = await prisma.listing.findMany({
    where: { status: ListingStatus.APPROVED, isVerified: true },
    select: { id: true, title: true },
    orderBy: { createdAt: 'asc' },
  });

  if (listings.length === 0) return [];

  // Shortlists are per-account, so several buyers are needed for a listing to
  // show more than one save.
  const passwordHash = await hash(DEMO_BUYER_PASSWORD, {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const buyers: string[] = [];
  for (let index = 0; index < 14; index += 1) {
    const buyer = await prisma.user.upsert({
      where: { email: `demo-buyer-${index + 1}@selleasy24.dev` },
      // A phone on every buyer: the seller's visit inbox exists to hand over a
      // number, and a demo where that line reads "no phone on file" shows the
      // opposite of what the page is for.
      update: {
        phone: `+9198${String(76540000 + index * 111).slice(0, 8)}`,
        isPhoneVerified: true,
      },
      create: {
        email: `demo-buyer-${index + 1}@selleasy24.dev`,
        fullName: DEMO_BUYER_NAMES[index % DEMO_BUYER_NAMES.length]!,
        passwordHash,
        role: Role.BUYER,
        isEmailVerified: true,
        phone: `+9198${String(76540000 + index * 111).slice(0, 8)}`,
        isPhoneVerified: true,
      },
      select: { id: true },
    });
    buyers.push(buyer.id);
  }

  const random = rng(20260818);
  let views = 0;
  let saves = 0;
  let leads = 0;

  for (const [index, listing] of listings.entries()) {
    // A popularity multiplier so the grid is not uniform — some properties
    // genuinely outperform others, and that contrast is the whole point.
    const appeal = 0.35 + random() * 1.3;

    // --- Views over the last 30 days ---
    const viewRows: Array<{ listingId: string; sessionHash: string; viewedOn: Date; viewedAt: Date }> = [];

    for (let dayAgo = 29; dayAgo >= 0; dayAgo -= 1) {
      const day = new Date();
      day.setUTCHours(0, 0, 0, 0);
      day.setUTCDate(day.getUTCDate() - dayAgo);

      // Recent days weigh more: interest builds as a listing is indexed and
      // shared, and a flat line across a month looks synthetic.
      const recency = 0.45 + ((30 - dayAgo) / 30) * 0.9;
      const count = Math.floor(random() * 5 * appeal * recency);

      for (let n = 0; n < count; n += 1) {
        viewRows.push({
          listingId: listing.id,
          // Unique per listing per day, matching the real dedupe key.
          sessionHash: `demo-${listing.id.slice(0, 8)}-${dayAgo}-${n}`,
          viewedOn: day,
          viewedAt: new Date(day.getTime() + Math.floor(random() * 86_400_000)),
        });
      }
    }

    if (viewRows.length > 0) {
      await prisma.listingView.createMany({ data: viewRows, skipDuplicates: true });
      views += viewRows.length;
    }

    await prisma.listing.update({
      where: { id: listing.id },
      data: { viewsCount: viewRows.length },
    });

    // --- Shortlists: a fraction of viewers ---
    const saveCount = Math.min(Math.floor(viewRows.length * (0.05 + random() * 0.07)), buyers.length);
    for (let n = 0; n < saveCount; n += 1) {
      const buyerId = buyers[(index * 3 + n) % buyers.length]!;
      await prisma.savedListing.upsert({
        where: { userId_listingId: { userId: buyerId, listingId: listing.id } },
        update: {},
        create: {
          userId: buyerId,
          listingId: listing.id,
          createdAt: new Date(Date.now() - Math.floor(random() * 25) * 86_400_000),
        },
      });
      saves += 1;
    }

    // --- Enquiries: fewer than shortlists ---
    //
    // Deliberately narrower than saves. The gap between "saved it" and "wrote
    // in" is the signal the dashboard exists to surface, and a dataset where
    // everyone who saved also enquired would hide it.
    const leadCount = Math.floor(saveCount * (0.2 + random() * 0.4));
    for (let n = 0; n < leadCount; n += 1) {
      const name = DEMO_BUYER_NAMES[(index + n) % DEMO_BUYER_NAMES.length]!;
      const createdAt = new Date(Date.now() - Math.floor(random() * 20) * 86_400_000);

      /*
       * A realistic spread of outcomes rather than a wall of untouched
       * enquiries.
       *
       * Leaving every lead in NEW meant the dashboard could report no reply
       * time at all — the seller-response figure had nothing to measure — while
       * showing that every enquiry on the platform had been ignored. Some are
       * still deliberately left NEW and old, because "nobody has answered
       * these" is a real signal the ops team should see rather than one to
       * seed away.
       */
      const roll = random();
      const outcome =
        roll < 0.25
          ? LeadStatus.NEW
          : roll < 0.7
            ? LeadStatus.CONTACTED
            : roll < 0.9
              ? LeadStatus.INTERESTED
              : LeadStatus.CONVERTED;

      // Replies cluster in the first day, with a tail — which is what a median
      // is worth reporting on.
      const replyHours = 1 + Math.floor(random() * 34);
      const contactedAt =
        outcome === LeadStatus.NEW
          ? null
          : new Date(
              Math.min(Date.now(), createdAt.getTime() + replyHours * 3_600_000),
            );

      await prisma.lead.create({
        data: {
          listingId: listing.id,
          name,
          phone: `+9198${String(76500000 + index * 37 + n).slice(0, 8)}`,
          message: DEMO_ENQUIRIES[(index + n) % DEMO_ENQUIRIES.length]!,
          status: outcome,
          contactedAt,
          createdAt,
        },
      });
      leads += 1;
    }

    await prisma.listing.update({
      where: { id: listing.id },
      data: { leadsCount: leadCount },
    });
  }

  console.log(`  ${views} views, ${saves} shortlists, ${leads} enquiries across ${listings.length} listings`);

  return buyers;
}

/**
 * Visit requests across every state the seller's inbox can show.
 *
 * The two open requests come first deliberately: a seller opening the page
 * during a demo should land on the thing that needs them, not on a page of
 * settled history. The rest exist so the settled section, the decline reason
 * and the buyer's own view all have something real in them.
 */
async function seedSiteVisits(buyers: string[]): Promise<void> {
  if (buyers.length === 0) return;

  console.log('\nSeeding site visit requests…');

  const listings = await prisma.listing.findMany({
    where: { status: ListingStatus.APPROVED, isVerified: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  if (listings.length === 0) return;

  const day = 86_400_000;
  const at = (offsetDays: number, hour: number): Date => {
    const date = new Date(Date.now() + offsetDays * day);
    date.setHours(hour, 0, 0, 0);
    return date;
  };

  /**
   * `listing` and `buyer` are indexes into the arrays above. Modulo keeps this
   * valid on a smaller dataset rather than throwing.
   */
  const VISITS: Array<{
    listing: number;
    buyer: number;
    status: SiteVisitStatus;
    preferredAt: Date;
    proposedAt?: Date;
    confirmedAt?: Date;
    note?: string;
    sellerNote?: string;
    createdDaysAgo: number;
  }> = [
    {
      listing: 0,
      buyer: 0,
      status: SiteVisitStatus.REQUESTED,
      preferredAt: at(2, 11),
      note: 'Weekday mornings suit me best, but I can be flexible.',
      createdDaysAgo: 1,
    },
    {
      listing: 2,
      buyer: 3,
      status: SiteVisitStatus.REQUESTED,
      preferredAt: at(4, 17),
      note: 'Coming from Gachibowli, so late afternoon works.',
      createdDaysAgo: 0,
    },
    {
      listing: 1,
      buyer: 5,
      status: SiteVisitStatus.RESCHEDULED,
      preferredAt: at(1, 10),
      proposedAt: at(3, 16),
      sellerNote: 'Tenants are in until Thursday. Friday evening is better.',
      createdDaysAgo: 3,
    },
    {
      listing: 3,
      buyer: 2,
      status: SiteVisitStatus.CONFIRMED,
      preferredAt: at(5, 12),
      confirmedAt: at(5, 12),
      note: 'Both of us will come.',
      sellerNote: 'See you at the gate, ask for block C.',
      createdDaysAgo: 4,
    },
    {
      listing: 4,
      buyer: 7,
      status: SiteVisitStatus.DECLINED,
      preferredAt: at(2, 15),
      sellerNote: 'The property is under offer. I will come back to you if it falls through.',
      createdDaysAgo: 6,
    },
    {
      listing: 0,
      buyer: 4,
      status: SiteVisitStatus.COMPLETED,
      preferredAt: at(-8, 11),
      confirmedAt: at(-8, 11),
      createdDaysAgo: 12,
    },
  ];

  let created = 0;
  for (const visit of VISITS) {
    await prisma.siteVisitRequest.create({
      data: {
        listingId: listings[visit.listing % listings.length]!.id,
        buyerId: buyers[visit.buyer % buyers.length]!,
        status: visit.status,
        preferredAt: visit.preferredAt,
        proposedAt: visit.proposedAt ?? null,
        confirmedAt: visit.confirmedAt ?? null,
        note: visit.note ?? null,
        sellerNote: visit.sellerNote ?? null,
        createdAt: new Date(Date.now() - visit.createdDaysAgo * day),
      },
    });
    created += 1;
  }

  console.log(`  ${created} visit requests, 2 of them awaiting the seller`);
}

const DEMO_BUYER_PASSWORD = 'DevPassword123!';

const DEMO_BUYER_NAMES = [
  'Rahul Verma',
  'Sneha Reddy',
  'Imran Qureshi',
  'Divya Nair',
  'Karthik Rao',
  'Ayesha Sultana',
  'Vikram Chowdary',
  'Meera Iyer',
  'Sandeep Kumar',
  'Priya Menon',
];

const DEMO_ENQUIRIES = [
  'Is it still available? Could I visit this weekend?',
  'What is the maintenance per month?',
  'Is the price negotiable? I am a serious buyer.',
  'Which floor is it on, and is there a lift?',
  'Can I see the sale deed before visiting?',
  'Is bank loan available on this property?',
];

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

/** Where the API's local driver keeps encrypted documents. */
const DOCUMENT_STORAGE = resolve(process.cwd(), '..', '..', 'apps', 'api', 'storage', 'documents');

/** Sample statutory documents, shaped like the real ones and stamped as specimens. */
const DEMO_FILES = resolve(process.cwd(), '..', '..', 'demo-files');

/**
 * Reads a single value out of the repo-root .env.
 *
 * The seed's own .env carries only DATABASE_URL; the document encryption key
 * lives at the root, where the API reads it from.
 */
function rootEnv(key: string): string | undefined {
  const path = resolve(process.cwd(), '..', '..', '.env');
  if (!existsSync(path)) return undefined;

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    if (trimmed.slice(0, eq).trim() !== key) continue;

    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return undefined;
}

interface QueuedListing {
  locality: string;
  title: string;
  description: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  areaSqft: number;
  yearBuilt: number;
  address: string;
  seller: 'owner' | 'broker';
  /** Hours since submission. Anything over 24 shows as overdue in the console. */
  submittedHoursAgo: number;
}

/**
 * Listings waiting for a decision.
 *
 * Submission times are staggered on purpose: the console counts anything past
 * twenty-four hours as overdue, and a queue where every item is fresh never
 * exercises that.
 */
const QUEUE: QueuedListing[] = [
  {
    locality: 'Kondapur',
    title: '3 BHK facing the park in a Kondapur gated community',
    description:
      'Fourth floor, east facing, overlooking the internal park rather than the road. Three bedrooms with wardrobes, two balconies, and a separate utility. Gated community with security, gym and a children’s play area. Ten minutes from Botanical Garden metro.',
    price: 11_800_000,
    bedrooms: 3,
    bathrooms: 3,
    areaSqft: 1620,
    yearBuilt: 2021,
    address: 'Tower 4, Aparna Sarovar, Kondapur',
    seller: 'owner',
    submittedHoursAgo: 40,
  },
  {
    locality: 'Madhapur',
    title: '2 BHK walking distance to Hitech City MMTS',
    description:
      'Second floor in a building of eighteen flats, north facing and quiet despite being close to the main road. Modular kitchen, wardrobes in both bedrooms, one covered parking bay. Borewell plus municipal water and a generator for common areas.',
    price: 8_900_000,
    bedrooms: 2,
    bathrooms: 2,
    areaSqft: 1180,
    yearBuilt: 2018,
    address: 'Flat 203, Sai Krupa Residency, Madhapur',
    seller: 'broker',
    submittedHoursAgo: 27,
  },
  {
    locality: 'Narsingi',
    title: '4 BHK duplex with a private terrace in Narsingi',
    description:
      'Top two floors as a duplex, with a private terrace and an internal staircase. Four bedrooms each with attached bath, a family lounge, and a maid’s room. Two covered parking bays. Two minutes from the ORR exit and close to two international schools.',
    price: 24_500_000,
    bedrooms: 4,
    bathrooms: 4,
    areaSqft: 2640,
    yearBuilt: 2022,
    address: 'Block C, Ramky One Galaxia, Narsingi',
    seller: 'owner',
    submittedHoursAgo: 5,
  },
];

/**
 * Hours each listing waited between submission and decision.
 *
 * Cycled by index rather than randomised, so the dashboard reports the same
 * figures on every reseed — a median that moves when nothing happened is
 * impossible to talk about or screenshot.
 *
 * Chosen to be honest rather than flattering: ten of twelve inside the
 * 24-hour promise, two over it. A queue that never slips does not look
 * credible, and the slow tail is the thing an ops team most needs to see.
 */
const REVIEW_HOURS = [3, 6, 5, 21, 9, 2, 14, 30, 7, 4, 11, 26];

/** Documents every submission must carry before it can be reviewed. */
const QUEUE_DOCUMENTS: Array<{ kind: DocumentKind; file: string; idProof?: IdProofKind }> = [
  { kind: DocumentKind.SALE_DEED, file: 'sale-deed.pdf' },
  { kind: DocumentKind.ID_PROOF, file: 'id-proof.pdf', idProof: IdProofKind.PAN },
  { kind: DocumentKind.PROPERTY_TAX_RECEIPT, file: 'property-tax-receipt.pdf' },
];

async function seedReviewQueue(
  owner: { id: string },
  broker: { id: string },
  pools: { cover: string[]; bedroom: string[]; kitchen: string[] },
): Promise<number> {
  const encryptionKey = rootEnv('DOCUMENT_ENCRYPTION_KEY');

  if (!encryptionKey) {
    console.warn(
      '  no DOCUMENT_ENCRYPTION_KEY at the repo root — queue seeded without documents',
    );
  }

  console.log('\nSeeding the verification queue…');

  let count = 0;

  for (const [index, item] of QUEUE.entries()) {
    const neighborhood = await prisma.neighborhood.findFirst({
      where: { name: item.locality, city: 'Hyderabad' },
    });
    if (!neighborhood) {
      console.warn(`  skipped ${item.locality} — locality not in reference data`);
      continue;
    }

    const facts = STRUCTURED[item.locality];
    const submittedAt = new Date(Date.now() - item.submittedHoursAgo * 3_600_000);

    const property = await prisma.property.create({
      data: {
        address: item.address,
        pincode: neighborhood.pincode,
        propertyType: 'FLAT',
        bedrooms: item.bedrooms,
        bathrooms: item.bathrooms,
        areaSqft: item.areaSqft,
        carpetAreaSqft: Math.round(item.areaSqft * 0.75),
        yearBuilt: item.yearBuilt,
        possession: PossessionStatus.READY_TO_MOVE,
        floor: facts?.floor ?? null,
        totalFloors: facts?.totalFloors ?? null,
        facing: facts?.facing ?? null,
        furnishing: facts?.furnishing ?? null,
        coveredParking: facts?.coveredParking ?? null,
        amenities: facts?.amenities ?? [],
        ownership: facts?.ownership ?? OwnershipType.FREEHOLD,
        approvingAuthority: facts?.approvingAuthority ?? ApprovingAuthority.HMDA,
        neighborhoodId: neighborhood.id,
      },
    });

    const listing = await prisma.listing.create({
      data: {
        propertyId: property.id,
        sellerId: item.seller === 'owner' ? owner.id : broker.id,
        title: item.title,
        description: item.description,
        price: new Prisma.Decimal(item.price),
        // Awaiting a decision, so deliberately NOT verified and with no
        // firstListedAt — that is set only on the first approval.
        status: ListingStatus.PENDING_REVIEW,
        submittedAt,
      },
    });

    await prisma.priceHistory.create({
      data: {
        listingId: listing.id,
        price: new Prisma.Decimal(item.price),
        previousPrice: null,
        changedById: item.seller === 'owner' ? owner.id : broker.id,
      },
    });

    // --- Photographs -------------------------------------------------------
    const all = [...pools.cover, ...pools.kitchen, ...pools.bedroom];
    const gallery = [
      all[(index + 5) % all.length],
      pools.bedroom[index % pools.bedroom.length],
      pools.kitchen[index % pools.kitchen.length],
    ].filter((f): f is string => Boolean(f));

    for (const [order, source] of gallery.entries()) {
      const key = `listings/${listing.id}/photos/${randomUUID()}.jpg`;
      const path = join(PUBLIC_STORAGE, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, readFileSync(source));
      await prisma.listingPhoto.create({
        data: { listingId: listing.id, storageKey: key, sortOrder: order },
      });
    }

    // --- Documents ---------------------------------------------------------
    if (encryptionKey) {
      for (const doc of QUEUE_DOCUMENTS) {
        const source = join(DEMO_FILES, doc.file);
        if (!existsSync(source)) {
          console.warn(`  missing ${doc.file} in demo-files — skipped`);
          continue;
        }

        const plaintext = readFileSync(source);
        const storageKey = `listings/${listing.id}/documents/${randomUUID()}.enc`;

        const iv = randomBytes(12);
        const cipher = createCipheriv(
          'aes-256-gcm',
          Buffer.from(encryptionKey, 'base64'),
          iv,
          { authTagLength: 16 },
        );
        // Binds the ciphertext to its location: a document moved to another
        // listing's key fails to decrypt rather than opening as that listing's.
        cipher.setAAD(Buffer.from(storageKey, 'utf8'));

        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const path = join(DOCUMENT_STORAGE, storageKey);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, ciphertext);

        await prisma.document.create({
          data: {
            listingId: listing.id,
            uploadedById: item.seller === 'owner' ? owner.id : broker.id,
            kind: doc.kind,
            idProofKind: doc.idProof ?? null,
            storageKey,
            originalFilename: doc.file,
            mimeType: 'application/pdf',
            sizeBytes: plaintext.byteLength,
            encryptionIv: iv.toString('base64'),
            encryptionTag: cipher.getAuthTag().toString('base64'),
          },
        });
      }
    }

    const age = item.submittedHoursAgo > 24 ? 'overdue' : 'within target';
    console.log(`  ${item.locality} — submitted ${item.submittedHoursAgo}h ago (${age})`);
    count += 1;
  }

  return count;
}

// ---------------------------------------------------------------------------
// Builder projects
// ---------------------------------------------------------------------------

/**
 * A builder's portfolio spanning the whole lifecycle.
 *
 * Deliberately not four projects that all look the same. The point of the
 * builder surface is that an unbuilt flat and a delivered one are different
 * purchases, so the demo has to contain both — plus a delivered project with no
 * inventory left, which exists purely as the track record a buyer judges the
 * current one on.
 */
const PROJECTS: Array<{
  name: string;
  locality: string;
  stage: ProjectStage;
  description: string;
  address: string;
  pincode: string;
  reraNumber: string;
  approvingAuthority: ApprovingAuthority;
  towers: number;
  totalUnits: number;
  landAcres: number;
  /** Months from now. Negative means already delivered. */
  possessionMonths: number | null;
  deliveredMonthsAgo?: number;
  amenities: Amenity[];
  units: Array<{
    bedrooms: number;
    bathrooms: number;
    areaSqft: number;
    carpetAreaSqft: number;
    priceFrom: number;
    totalUnits: number;
    availableUnits: number;
  }>;
  /** Left in the queue rather than published, so the console has work in it. */
  pending?: boolean;
  /** Still being filled in — the state a builder actually starts from. */
  draft?: boolean;
  launchedDaysAgo: number;
}> = [
  {
    name: 'Aurum Heights',
    locality: 'Kokapet',
    stage: ProjectStage.UNDER_CONSTRUCTION,
    description:
      'Three towers of G+14 on four and a half acres off the Outer Ring Road, with a clubhouse, two levels of covered parking and a half-acre central green. Structural work on towers A and B is complete; tower C is at the eighth floor.',
    address: 'Survey 118, Kokapet, Rangareddy District',
    pincode: '500075',
    reraNumber: 'P02400004567',
    approvingAuthority: ApprovingAuthority.HMDA,
    towers: 3,
    totalUnits: 240,
    landAcres: 4.5,
    possessionMonths: 14,
    amenities: [
      Amenity.LIFT,
      Amenity.POWER_BACKUP,
      Amenity.GYM,
      Amenity.SWIMMING_POOL,
      Amenity.CLUBHOUSE,
      Amenity.CHILDRENS_PLAY_AREA,
      Amenity.SECURITY,
      Amenity.RAINWATER_HARVESTING,
    ],
    units: [
      {
        bedrooms: 2,
        bathrooms: 2,
        areaSqft: 1185,
        carpetAreaSqft: 845,
        priceFrom: 8_900_000,
        totalUnits: 96,
        availableUnits: 31,
      },
      {
        bedrooms: 3,
        bathrooms: 3,
        areaSqft: 1650,
        carpetAreaSqft: 1180,
        priceFrom: 13_400_000,
        totalUnits: 112,
        availableUnits: 44,
      },
      {
        bedrooms: 4,
        bathrooms: 4,
        areaSqft: 2340,
        carpetAreaSqft: 1690,
        priceFrom: 19_800_000,
        totalUnits: 32,
        availableUnits: 12,
      },
    ],
    launchedDaysAgo: 96,
  },
  {
    name: 'Emerald Enclave',
    locality: 'Nallagandla',
    stage: ProjectStage.READY_TO_MOVE,
    description:
      'Two towers completed and handed over to the association, with the occupancy certificate issued in January. Remaining inventory is builder stock rather than resale, so the buyer is the first occupant.',
    address: 'Plot 7, Nallagandla, Serilingampally Mandal',
    pincode: '500019',
    reraNumber: 'P02400003211',
    approvingAuthority: ApprovingAuthority.GHMC,
    towers: 2,
    totalUnits: 148,
    landAcres: 2.8,
    possessionMonths: null,
    amenities: [
      Amenity.LIFT,
      Amenity.POWER_BACKUP,
      Amenity.GYM,
      Amenity.CLUBHOUSE,
      Amenity.SECURITY,
      Amenity.VISITOR_PARKING,
    ],
    units: [
      {
        bedrooms: 3,
        bathrooms: 3,
        areaSqft: 1580,
        carpetAreaSqft: 1140,
        priceFrom: 12_600_000,
        totalUnits: 108,
        availableUnits: 9,
      },
      {
        bedrooms: 4,
        bathrooms: 4,
        areaSqft: 2180,
        carpetAreaSqft: 1580,
        priceFrom: 17_900_000,
        totalUnits: 40,
        availableUnits: 3,
      },
    ],
    launchedDaysAgo: 210,
  },
  {
    name: 'Riverstone Villas',
    locality: 'Narsingi',
    stage: ProjectStage.DELIVERED,
    description:
      'Forty independent villas handed over in 2024, now fully occupied. Listed here as delivered work rather than as inventory — nothing remains unsold.',
    address: 'Survey 44, Narsingi, Rajendranagar Mandal',
    pincode: '500089',
    reraNumber: 'P02300001902',
    approvingAuthority: ApprovingAuthority.HMDA,
    towers: 1,
    totalUnits: 40,
    landAcres: 6.2,
    possessionMonths: null,
    deliveredMonthsAgo: 20,
    amenities: [Amenity.SECURITY, Amenity.POWER_BACKUP, Amenity.CLUBHOUSE, Amenity.PARK],
    units: [
      {
        bedrooms: 4,
        bathrooms: 5,
        areaSqft: 3200,
        carpetAreaSqft: 2410,
        priceFrom: 28_500_000,
        totalUnits: 40,
        // Nothing left. The project is a record of delivery, not an offer.
        availableUnits: 0,
      },
    ],
    launchedDaysAgo: 700,
  },
  {
    name: 'Skyline Prime',
    locality: 'Bachupally',
    stage: ProjectStage.PRE_LAUNCH,
    description:
      'Registered with TS-RERA and announced, with bookings opening next quarter. Two towers of G+18 planned on three acres, with the sanctioned plan already in hand.',
    address: 'Survey 202, Bachupally, Medchal District',
    pincode: '500090',
    reraNumber: 'P02400005588',
    approvingAuthority: ApprovingAuthority.HMDA,
    towers: 2,
    totalUnits: 196,
    landAcres: 3.0,
    possessionMonths: 34,
    amenities: [
      Amenity.LIFT,
      Amenity.POWER_BACKUP,
      Amenity.GYM,
      Amenity.SWIMMING_POOL,
      Amenity.SECURITY,
    ],
    units: [
      {
        bedrooms: 2,
        bathrooms: 2,
        areaSqft: 1120,
        carpetAreaSqft: 800,
        priceFrom: 6_900_000,
        totalUnits: 98,
        availableUnits: 98,
      },
      {
        bedrooms: 3,
        bathrooms: 3,
        areaSqft: 1540,
        carpetAreaSqft: 1105,
        priceFrom: 9_800_000,
        totalUnits: 98,
        availableUnits: 98,
      },
    ],
    launchedDaysAgo: 22,
  },
  {
    name: 'Vantage One',
    locality: 'Manikonda',
    stage: ProjectStage.UNDER_CONSTRUCTION,
    description:
      'A single tower of G+12 on one and a half acres in Manikonda, submitted for verification and awaiting a decision. Nothing here is visible to buyers until an officer has checked the RERA registration and the sanctioned plan.',
    address: 'Survey 61, Manikonda, Rajendranagar Mandal',
    pincode: '500089',
    reraNumber: 'P02400006701',
    approvingAuthority: ApprovingAuthority.GHMC,
    towers: 1,
    totalUnits: 84,
    landAcres: 1.5,
    possessionMonths: 22,
    amenities: [Amenity.LIFT, Amenity.POWER_BACKUP, Amenity.SECURITY, Amenity.VISITOR_PARKING],
    units: [
      {
        bedrooms: 2,
        bathrooms: 2,
        areaSqft: 1150,
        carpetAreaSqft: 820,
        priceFrom: 7_400_000,
        totalUnits: 56,
        availableUnits: 56,
      },
      {
        bedrooms: 3,
        bathrooms: 3,
        areaSqft: 1590,
        carpetAreaSqft: 1140,
        priceFrom: 10_900_000,
        totalUnits: 28,
        availableUnits: 28,
      },
    ],
    pending: true,
    launchedDaysAgo: 0,
  },
  {
    name: 'Lakeview Residences',
    locality: 'Tellapur',
    stage: ProjectStage.PRE_LAUNCH,
    description:
      'A draft still being put together — registration in hand, configurations entered, photographs and the sanctioned plan still to come. Nobody outside this account can see it.',
    address: 'Survey 90, Tellapur, Ramachandrapuram Mandal',
    pincode: '502032',
    reraNumber: 'P02400007140',
    approvingAuthority: ApprovingAuthority.HMDA,
    towers: 4,
    totalUnits: 320,
    landAcres: 5.1,
    possessionMonths: 40,
    amenities: [Amenity.LIFT, Amenity.POWER_BACKUP, Amenity.SWIMMING_POOL, Amenity.CLUBHOUSE],
    units: [
      {
        bedrooms: 3,
        bathrooms: 3,
        areaSqft: 1720,
        carpetAreaSqft: 1230,
        priceFrom: 11_800_000,
        totalUnits: 240,
        availableUnits: 240,
      },
    ],
    draft: true,
    launchedDaysAgo: 0,
  },
];

/**
 * Buyers getting in touch about a project.
 *
 * Seeded because `Project.leadsCount` is shown on the builder's dashboard, and
 * a demo where every project reports zero enquiries makes a working feature
 * look broken. Most name a configuration, because that is the realistic case
 * and it is the detail the inbox exists to surface.
 */
async function seedProjectEnquiries(buyers: string[]): Promise<void> {
  if (buyers.length === 0) return;

  console.log('\nSeeding project enquiries…');

  const projects = await prisma.project.findMany({
    where: { status: ProjectStatus.APPROVED, isVerified: true },
    select: {
      id: true,
      name: true,
      stage: true,
      units: { select: { id: true, availableUnits: true }, orderBy: { priceFrom: 'asc' } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const random = rng(20260821);
  let total = 0;

  for (const [index, project] of projects.entries()) {
    /*
     * A delivered project with nothing left draws almost no enquiries, which is
     * the honest shape — it is on the platform as track record, not stock.
     */
    const count =
      project.stage === ProjectStage.DELIVERED ? 1 : 2 + Math.floor(random() * 4);

    for (let n = 0; n < count; n += 1) {
      const name = DEMO_BUYER_NAMES[(index + n) % DEMO_BUYER_NAMES.length]!;
      const createdAt = new Date(Date.now() - Math.floor(random() * 18) * 86_400_000);

      // Most people know which size they want; some are still deciding.
      const sellable = project.units.filter((unit) => unit.availableUnits !== 0);
      const named = random() < 0.75 && sellable.length > 0;
      const unit = named ? sellable[Math.floor(random() * sellable.length)] : null;

      const roll = random();
      const outcome =
        roll < 0.3
          ? LeadStatus.NEW
          : roll < 0.75
            ? LeadStatus.CONTACTED
            : LeadStatus.INTERESTED;

      await prisma.lead.create({
        data: {
          projectId: project.id,
          projectUnitId: unit?.id ?? null,
          name,
          phone: `+9198${String(76530000 + index * 53 + n).slice(0, 8)}`,
          message: DEMO_PROJECT_ENQUIRIES[(index + n) % DEMO_PROJECT_ENQUIRIES.length]!,
          status: outcome,
          contactedAt:
            outcome === LeadStatus.NEW
              ? null
              : new Date(
                  Math.min(
                    Date.now(),
                    createdAt.getTime() + (1 + Math.floor(random() * 30)) * 3_600_000,
                  ),
                ),
          createdAt,
        },
      });
      total += 1;
    }

    await prisma.project.update({
      where: { id: project.id },
      data: { leadsCount: count },
    });
  }

  console.log(`  ${total} enquiries across ${projects.length} projects`);
}

/** What buyers actually ask a builder, as opposed to a resale owner. */
const DEMO_PROJECT_ENQUIRIES = [
  'What is the payment plan, and how much on booking?',
  'Is the possession date firm? What happens if it slips?',
  'Can I see the sanctioned plan and the RERA certificate?',
  'Which banks have approved this project for home loans?',
  'What is the maintenance likely to be per square foot?',
  'Is there a show flat I can visit this weekend?',
  'What is the carpet area against the built-up you have listed?',
  'Are corner units available, and is there a premium on them?',
];

/** Statutory documents a project carries into review. */
const PROJECT_DOCUMENTS: Array<{ kind: DocumentKind; file: string; completedOnly?: boolean }> = [
  { kind: DocumentKind.RERA_CERTIFICATE, file: 'rera-certificate.pdf' },
  { kind: DocumentKind.APPROVED_PLAN, file: 'approved-plan.pdf' },
  {
    kind: DocumentKind.OCCUPANCY_CERTIFICATE,
    file: 'occupancy-certificate.pdf',
    completedOnly: true,
  },
];

/** Only a project that has been through review is live and verified. */
function published(item: { draft?: boolean; pending?: boolean }): boolean {
  return !item.draft && !item.pending;
}

/** Checks recorded on an approved project, by stage. */
function projectChecksFor(stage: ProjectStage): VerificationCheckKind[] {
  const base = [
    VerificationCheckKind.PROJECT_RERA_VALID,
    VerificationCheckKind.PROJECT_PLAN_SANCTIONED,
    VerificationCheckKind.PROJECT_LAND_TITLE_CLEAR,
  ];

  if (stage === ProjectStage.PRE_LAUNCH) {
    return base;
  }

  const started = [...base, VerificationCheckKind.PROJECT_COMMENCEMENT_CERTIFICATE];

  return stage === ProjectStage.READY_TO_MOVE || stage === ProjectStage.DELIVERED
    ? [...started, VerificationCheckKind.PROJECT_OCCUPANCY_CERTIFICATE]
    : started;
}

async function seedProjects(
  builder: { id: string },
  verifier: { id: string },
  pools: { cover: string[]; bedroom: string[]; kitchen: string[] },
): Promise<{ published: number; pending: number }> {
  console.log('\nSeeding builder projects…');

  const encryptionKey = rootEnv('DOCUMENT_ENCRYPTION_KEY');
  if (!encryptionKey) {
    console.warn('  no DOCUMENT_ENCRYPTION_KEY at the repo root — projects seeded without documents');
  }

  const gallery = [...pools.cover, ...pools.bedroom, ...pools.kitchen];
  const random = rng(20260820);

  let live = 0;
  let awaiting = 0;
  let index = 0;

  for (const item of PROJECTS) {
    const neighborhood = await prisma.neighborhood.findFirst({
      where: { name: item.locality, city: 'Hyderabad' },
      select: { id: true },
    });

    if (!neighborhood) {
      console.warn(`  skipped ${item.name} — ${item.locality} not in reference data`);
      continue;
    }

    const month = 30 * 86_400_000;
    const launchedAt = new Date(Date.now() - item.launchedDaysAgo * 86_400_000);
    const isCompleted =
      item.stage === ProjectStage.READY_TO_MOVE || item.stage === ProjectStage.DELIVERED;

    const project = await prisma.project.create({
      data: {
        builderId: builder.id,
        neighborhoodId: neighborhood.id,
        name: item.name,
        description: item.description,
        address: item.address,
        pincode: item.pincode,
        stage: item.stage,
        possessionDate:
          item.possessionMonths === null
            ? null
            : new Date(Date.now() + item.possessionMonths * month),
        deliveredOn:
          item.deliveredMonthsAgo === undefined
            ? null
            : new Date(Date.now() - item.deliveredMonthsAgo * month),
        reraNumber: item.reraNumber,
        approvingAuthority: item.approvingAuthority,
        totalTowers: item.towers,
        totalUnits: item.totalUnits,
        landAreaAcres: new Prisma.Decimal(item.landAcres),
        amenities: item.amenities,
        status: item.draft
          ? ProjectStatus.DRAFT
          : item.pending
            ? ProjectStatus.PENDING_REVIEW
            : ProjectStatus.APPROVED,
        isVerified: published(item),
        // A draft has never been submitted; nothing about it is dated yet.
        submittedAt: item.draft
          ? null
          : item.pending
            ? new Date(Date.now() - 6 * 3_600_000)
            : new Date(launchedAt.getTime() - 2 * 86_400_000),
        verifiedAt: published(item) ? launchedAt : null,
        verifiedById: published(item) ? verifier.id : null,
        firstListedAt: published(item) ? launchedAt : null,
        createdAt: new Date(launchedAt.getTime() - 5 * 86_400_000),
      },
      select: { id: true },
    });

    await prisma.projectUnit.createMany({
      data: item.units.map((unit) => ({
        projectId: project.id,
        bedrooms: unit.bedrooms,
        bathrooms: unit.bathrooms,
        areaSqft: unit.areaSqft,
        carpetAreaSqft: unit.carpetAreaSqft,
        priceFrom: new Prisma.Decimal(unit.priceFrom),
        totalUnits: unit.totalUnits,
        availableUnits: unit.availableUnits,
      })),
    });

    // --- Photographs -------------------------------------------------------
    //
    // The first is marked a render on unfinished projects and a photograph on
    // finished ones, which is the distinction the schema records and the card
    // surfaces. A buyer treats the two very differently.
    //
    // The draft deliberately gets two, one short of the three a submission
    // needs — so the demo shows the gate doing its job rather than only the
    // happy path.
    const chosen = [
      gallery[index % gallery.length],
      gallery[(index + 3) % gallery.length],
      gallery[(index + 6) % gallery.length],
      gallery[(index + 9) % gallery.length],
    ]
      .slice(0, item.draft ? 2 : 4)
      .filter((file): file is string => Boolean(file));

    for (const [order, source] of chosen.entries()) {
      const key = `projects/${project.id}/photos/${randomUUID()}.jpg`;
      const path = join(PUBLIC_STORAGE, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, readFileSync(source));

      await prisma.projectPhoto.create({
        data: {
          projectId: project.id,
          storageKey: key,
          sortOrder: order,
          isRender: !isCompleted && order === 0,
        },
      });
    }

    // --- Documents ---------------------------------------------------------
    //
    // The draft has none, which is the other half of what its blocker list
    // should be telling the builder to do.
    if (encryptionKey && !item.draft) {
      for (const doc of PROJECT_DOCUMENTS) {
        if (doc.completedOnly && !isCompleted) continue;

        const source = join(DEMO_FILES, doc.file);
        if (!existsSync(source)) {
          console.warn(`  missing ${doc.file} in demo-files — skipped`);
          continue;
        }

        const plaintext = readFileSync(source);
        const storageKey = `projects/${project.id}/documents/${randomUUID()}.enc`;

        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', Buffer.from(encryptionKey, 'base64'), iv, {
          authTagLength: 16,
        });
        // Binds the ciphertext to its location, exactly as the API does.
        cipher.setAAD(Buffer.from(storageKey, 'utf8'));

        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const path = join(DOCUMENT_STORAGE, storageKey);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, ciphertext);

        await prisma.projectDocument.create({
          data: {
            projectId: project.id,
            uploadedById: builder.id,
            kind: doc.kind,
            storageKey,
            originalFilename: doc.file,
            mimeType: 'application/pdf',
            sizeBytes: plaintext.byteLength,
            encryptionIv: iv.toString('base64'),
            encryptionTag: cipher.getAuthTag().toString('base64'),
          },
        });
      }
    }

    // --- Verification record and views -------------------------------------
    if (published(item)) {
      await prisma.verification.create({
        data: {
          projectId: project.id,
          verifierId: verifier.id,
          decision: VerificationDecision.APPROVED,
          createdAt: launchedAt,
          checks: {
            create: projectChecksFor(item.stage).map((kind) => ({ kind, passed: true })),
          },
        },
      });

      // Views over the last 30 days. A pre-launch project draws fewer eyes than
      // one people can move into, which is what makes the dashboard readable.
      const appeal = item.stage === ProjectStage.DELIVERED ? 0.3 : 0.6 + random() * 1.1;
      const viewRows: Array<{
        projectId: string;
        sessionHash: string;
        viewedOn: Date;
        viewedAt: Date;
      }> = [];

      for (let dayAgo = 29; dayAgo >= 0; dayAgo -= 1) {
        const day = new Date();
        day.setUTCHours(0, 0, 0, 0);
        day.setUTCDate(day.getUTCDate() - dayAgo);

        const recency = 0.45 + ((30 - dayAgo) / 30) * 0.9;
        const count = Math.floor(random() * 6 * appeal * recency);

        for (let n = 0; n < count; n += 1) {
          viewRows.push({
            projectId: project.id,
            sessionHash: `demo-project-${project.id.slice(0, 8)}-${dayAgo}-${n}`,
            viewedOn: day,
            viewedAt: new Date(day.getTime() + Math.floor(random() * 86_400_000)),
          });
        }
      }

      if (viewRows.length > 0) {
        await prisma.projectView.createMany({ data: viewRows, skipDuplicates: true });
        await prisma.project.update({
          where: { id: project.id },
          data: { viewsCount: viewRows.length },
        });
      }

      live += 1;
      console.log(`  ${item.name} — ${item.stage}, ${viewRows.length} views`);
    } else if (item.pending) {
      awaiting += 1;
      console.log(`  ${item.name} — awaiting verification`);
    } else {
      console.log(`  ${item.name} — draft, not yet submitted`);
    }

    index += 1;
  }

  return { published: live, pending: awaiting };
}

main()
  .catch((error: unknown) => {
    console.error('Demo seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
