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
 * Authorization invariants.
 *
 * These are the failures that are both most likely and most expensive: they do
 * not throw, they do not appear in logs, and nothing looks wrong until someone
 * reads data that was never theirs. Every case here asserts a boundary rather
 * than a feature.
 */
describe('authorization', () => {
  let neighborhoodId: string;

  beforeAll(async () => {
    await startApp();
  });

  afterAll(async () => {
    await stopApp();
  });

  beforeEach(async () => {
    await truncateAll();
    neighborhoodId = (await createNeighborhood()).id;
  });

  /** Creates a listing owned by `seller`, in whatever state the test needs. */
  async function makeListing(
    seller: TestUser,
    status: ListingStatus = ListingStatus.DRAFT,
    isVerified = false,
  ): Promise<string> {
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
        title: 'A three bedroom flat for the authorization tests',
        description:
          'Long enough to satisfy the description minimum that the create endpoint enforces on real submissions.',
        price: 9_500_000,
        status,
        isVerified,
        ...(status === ListingStatus.APPROVED && { firstListedAt: new Date() }),
      },
      select: { id: true },
    });

    return listing.id;
  }

  describe('cross-seller isolation', () => {
    it('does not let a seller read another seller’s listing', async () => {
      const owner = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
      const intruder = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
      const listingId = await makeListing(owner);

      const response = await http()
        .get(`/api/listings/mine/${listingId}`)
        .set(...bearer(intruder));

      /*
       * 404, not 403. A 403 confirms the listing exists, which lets someone
       * enumerate ids and learn who is selling what before it is public.
       */
      expect(response.status).toBe(404);
    });

    it('does not let a seller edit another seller’s listing', async () => {
      const owner = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
      const intruder = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
      const listingId = await makeListing(owner);

      const response = await http()
        .patch(`/api/listings/${listingId}`)
        .set(...bearer(intruder))
        .send({ price: 1_000_000 });

      expect(response.status).toBe(404);

      const unchanged = await db().listing.findUniqueOrThrow({
        where: { id: listingId },
        select: { price: true },
      });
      expect(Number(unchanged.price)).toBe(9_500_000);
    });

    it('does not let a seller submit another seller’s listing for review', async () => {
      const owner = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
      const intruder = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
      const listingId = await makeListing(owner);

      await http()
        .post(`/api/listings/${listingId}/submit`)
        .set(...bearer(intruder))
        .expect(404);

      const still = await db().listing.findUniqueOrThrow({
        where: { id: listingId },
        select: { status: true },
      });
      expect(still.status).toBe(ListingStatus.DRAFT);
    });

    it('lists only the requesting seller’s own listings', async () => {
      const owner = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
      const other = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
      await makeListing(owner);
      await makeListing(other);

      const response = await http()
        .get('/api/listings/mine')
        .set(...bearer(owner))
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
    });
  });

  describe('public visibility', () => {
    /**
     * The single most important boundary on the platform: the promise is that
     * nothing reaches a buyer until an officer has checked it.
     */
    it.each([
      ['DRAFT', ListingStatus.DRAFT, false],
      ['PENDING_REVIEW', ListingStatus.PENDING_REVIEW, false],
      ['REJECTED', ListingStatus.REJECTED, false],
      ['ARCHIVED', ListingStatus.ARCHIVED, false],
      ['SUSPENDED', ListingStatus.SUSPENDED, false],
      // Approved but not verified must also stay hidden — both conditions are
      // required, and testing only the status would miss a flag regression.
      ['APPROVED but unverified', ListingStatus.APPROVED, false],
    ])('keeps a %s listing out of public search', async (_label, status, isVerified) => {
      const owner = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
      const listingId = await makeListing(owner, status, isVerified);

      const search = await http().get('/api/listings/search?limit=50').expect(200);
      const ids = (search.body.items as Array<{ id: string }>).map((item) => item.id);
      expect(ids).not.toContain(listingId);

      // And it must not be reachable directly either.
      await http().get(`/api/listings/${listingId}`).expect(404);
    });

    it('shows an approved and verified listing publicly, with no token', async () => {
      const owner = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
      const listingId = await makeListing(owner, ListingStatus.APPROVED, true);

      const search = await http().get('/api/listings/search?limit=50').expect(200);
      const ids = (search.body.items as Array<{ id: string }>).map((item) => item.id);
      expect(ids).toContain(listingId);

      await http().get(`/api/listings/${listingId}`).expect(200);
    });

    it('never exposes seller contact details in a public payload', async () => {
      const owner = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
      const listingId = await makeListing(owner, ListingStatus.APPROVED, true);

      const response = await http().get(`/api/listings/${listingId}`).expect(200);
      const serialised = JSON.stringify(response.body);

      // A buyer reaches a seller through a lead, never by scraping the payload.
      expect(serialised).not.toContain(owner.email);
      expect(serialised).not.toContain('passwordHash');
      expect(serialised).not.toContain('rejectionReason');
    });

    it('does not leak a rejection reason to a comparison request', async () => {
      const owner = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
      const a = await makeListing(owner, ListingStatus.APPROVED, true);
      const b = await makeListing(owner, ListingStatus.APPROVED, true);

      const response = await http().get(`/api/listings/compare?ids=${a},${b}`).expect(200);
      expect(JSON.stringify(response.body)).not.toContain('rejectionReason');
    });

    it('silently drops a non-public listing from a comparison', async () => {
      const owner = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
      const visible = await makeListing(owner, ListingStatus.APPROVED, true);
      const alsoVisible = await makeListing(owner, ListingStatus.APPROVED, true);
      const hidden = await makeListing(owner, ListingStatus.DRAFT);

      const response = await http()
        .get(`/api/listings/compare?ids=${visible},${alsoVisible},${hidden}`)
        .expect(200);

      const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
      expect(ids).toEqual([visible, alsoVisible]);
      expect(response.body.unavailable).toContain(hidden);
    });
  });

  describe('role boundaries', () => {
    it('refuses a buyer access to the verification queue', async () => {
      const buyer = await createUser({ role: Role.BUYER });

      const response = await http()
        .get('/api/verification/queue')
        .set(...bearer(buyer));

      expect(response.status).toBe(403);
    });

    it('refuses a seller access to the verification queue', async () => {
      const seller = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });

      const response = await http()
        .get('/api/verification/queue')
        .set(...bearer(seller));

      expect(response.status).toBe(403);
    });

    it('allows a verification officer into the queue', async () => {
      const officer = await createUser({ role: Role.VERIFIER });

      await http()
        .get('/api/verification/queue')
        .set(...bearer(officer))
        .expect(200);
    });

    it('refuses a buyer the seller’s lead inbox', async () => {
      const buyer = await createUser({ role: Role.BUYER });

      const response = await http()
        .get('/api/leads/mine')
        .set(...bearer(buyer));

      expect(response.status).toBe(403);
    });
  });

  describe('unauthenticated access', () => {
    it.each([
      ['GET', '/api/saved'],
      ['GET', '/api/saved/ids'],
      ['GET', '/api/listings/mine'],
      ['GET', '/api/leads/mine'],
      ['GET', '/api/verification/queue'],
      ['GET', '/api/auth/me'],
    ])('rejects %s %s without a token', async (method, path) => {
      const response = await (method === 'GET'
        ? http().get(path)
        : http().post(path));

      expect(response.status).toBe(401);
    });

    it.each([
      ['/api/listings/search'],
      ['/api/localities'],
      ['/api/health'],
    ])('allows %s without a token', async (path) => {
      const response = await http().get(path);
      expect(response.status).toBe(200);
    });
  });
});
