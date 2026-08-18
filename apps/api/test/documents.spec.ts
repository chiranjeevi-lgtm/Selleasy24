import { ListingStatus, Role, SellerKind } from '@kamala/db';

import {
  bearer,
  createNeighborhood,
  createUser,
  db,
  http,
  startApp,
  stopApp,
  truncateAll,
  type TestUser,
} from './harness';

/**
 * Ownership document uploads.
 *
 * The officer's review screen shows each document's declared type beside the
 * file. If those two can disagree, the screen is worse than useless — it lends
 * the appearance of a check to something nobody actually checked.
 */
describe('document uploads', () => {
  let neighborhoodId: string;
  let seller: TestUser;
  let listingId: string;

  /** Smallest thing the magic-byte validator accepts as a PDF. */
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

  beforeAll(async () => {
    await startApp();
  });

  afterAll(async () => {
    await stopApp();
  });

  beforeEach(async () => {
    await truncateAll();
    neighborhoodId = (await createNeighborhood()).id;
    seller = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });

    const property = await db().property.create({
      data: {
        address: 'Plot 42, Vittal Rao Nagar',
        pincode: '500032',
        propertyType: 'FLAT',
        bedrooms: 3,
        bathrooms: 2,
        areaSqft: 1500,
        possession: 'READY_TO_MOVE',
        neighborhoodId,
      },
      select: { id: true },
    });

    const listing = await db().listing.create({
      data: {
        propertyId: property.id,
        sellerId: seller.id,
        title: 'A flat used by the document upload tests',
        description:
          'Long enough to satisfy the fifty character minimum the create endpoint enforces.',
        price: 9_500_000,
        status: ListingStatus.DRAFT,
      },
      select: { id: true },
    });

    listingId = listing.id;
  });

  function upload(query: string) {
    return http()
      .post(`/api/listings/${listingId}/documents?${query}`)
      .set(...bearer(seller))
      .attach('file', pdf, { filename: 'document.pdf', contentType: 'application/pdf' });
  }

  it('accepts a sale deed', async () => {
    await upload('kind=SALE_DEED').expect(201);

    const stored = await db().document.findMany({
      where: { listingId },
      select: { kind: true, idProofKind: true },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]!.kind).toBe('SALE_DEED');
    expect(stored[0]!.idProofKind).toBeNull();
  });

  it('accepts an identity proof that says which kind it is', async () => {
    await upload('kind=ID_PROOF&idProofKind=PAN').expect(201);

    const stored = await db().document.findFirstOrThrow({
      where: { listingId },
      select: { kind: true, idProofKind: true },
    });
    expect(stored.kind).toBe('ID_PROOF');
    expect(stored.idProofKind).toBe('PAN');
  });

  it('refuses an identity proof that does not say which kind it is', async () => {
    await upload('kind=ID_PROOF').expect(400);
    expect(await db().document.count({ where: { listingId } })).toBe(0);
  });

  it('refuses a non-identity document carrying an identity kind', async () => {
    /*
     * This combination used to be accepted, and the officer's screen then read
     * "sale deed · pan" — a document labelled as two contradictory things on
     * the one screen whose job is deciding whether documents match their
     * description.
     */
    await upload('kind=SALE_DEED&idProofKind=PAN').expect(400);
    expect(await db().document.count({ where: { listingId } })).toBe(0);
  });

  it('refuses an unknown document kind', async () => {
    await upload('kind=NOT_A_REAL_KIND').expect(400);
  });

  it('rejects a file whose bytes are not what its type claims', async () => {
    // Content-Type says PDF; the bytes are not. Trusting the header is how a
    // script gets stored as an ownership document.
    await http()
      .post(`/api/listings/${listingId}/documents?kind=SALE_DEED`)
      .set(...bearer(seller))
      .attach('file', Buffer.from('<?php echo "not a pdf"; ?>'), {
        filename: 'document.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);

    expect(await db().document.count({ where: { listingId } })).toBe(0);
  });

  it('does not let a seller upload to another seller’s listing', async () => {
    const intruder = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });

    await http()
      .post(`/api/listings/${listingId}/documents?kind=SALE_DEED`)
      .set(...bearer(intruder))
      .attach('file', pdf, { filename: 'document.pdf', contentType: 'application/pdf' })
      .expect(404);

    expect(await db().document.count({ where: { listingId } })).toBe(0);
  });
});
