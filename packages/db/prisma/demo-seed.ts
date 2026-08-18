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
  ListingStatus,
  OwnershipType,
  PossessionStatus,
  Prisma,
  PrismaClient,
  Role,
  SellerKind,
  VerificationCheckKind,
  VerificationDecision,
} from '@prisma/client';
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
  await prisma.lead.deleteMany({});
  await prisma.listingReport.deleteMany({});
  await prisma.verificationCheckResult.deleteMany({});
  await prisma.verification.deleteMany({});
  await prisma.documentAccessLog.deleteMany({});
  await prisma.document.deleteMany({});
  await prisma.listingPhoto.deleteMany({});
  await prisma.priceHistory.deleteMany({});
  await prisma.listing.deleteMany({});
  await prisma.property.deleteMany({});

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
        submittedAt: new Date(listedAt.getTime() - 2 * 86_400_000),
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

  console.log(
    `\nDone. ${created} live listings, ${photosSaved} photographs, ${queued} awaiting verification.`,
  );
}

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

main()
  .catch((error: unknown) => {
    console.error('Demo seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
