import { ListingStatus, Role, SellerKind, SiteVisitStatus } from '@kamala/db';

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
 * Taking a listing off the market.
 *
 * The PRD's central complaint about the incumbents is stale listings for
 * property that has already gone. Until now a seller could only say "still
 * available" — there was no way to say "sold" or "not right now", so leaving a
 * stale listing up was the only option open to them.
 *
 * What matters here is that a listing taken down actually disappears from every
 * public surface, and that a paused one comes back without another review.
 */
describe('listing lifecycle', () => {
  let seller: TestUser;
  let buyer: TestUser;
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
    seller = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
    buyer = await createUser({ role: Role.BUYER });
  });

  async function makeListing(status: ListingStatus = ListingStatus.APPROVED): Promise<string> {
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
        title: 'A flat used by the lifecycle tests',
        description:
          'Long enough to satisfy the fifty character minimum the create endpoint enforces.',
        price: 9_500_000,
        status,
        isVerified: status === ListingStatus.APPROVED,
        firstListedAt: status === ListingStatus.APPROVED ? new Date() : null,
      },
      select: { id: true },
    });

    return listing.id;
  }

  const asSeller = (id: string, path: string) =>
    http().post(`/api/listings/${id}/${path}`).set(...bearer(seller));

  // -------------------------------------------------------------------------

  describe('pausing', () => {
    it('hides a live listing from every public surface', async () => {
      const id = await makeListing();

      await http().get(`/api/listings/${id}`).expect(200);

      await asSeller(id, 'pause').send({ reason: 'Tenants moving out first' }).expect(200);

      await http().get(`/api/listings/${id}`).expect(404);

      const search = await http().get('/api/listings/search').expect(200);
      expect(search.body.items).toHaveLength(0);
    });

    it('keeps the reason for the seller and shows it to nobody else', async () => {
      const id = await makeListing();
      await asSeller(id, 'pause').send({ reason: 'Tenants moving out first' }).expect(200);

      const mine = await http()
        .get(`/api/listings/mine/${id}`)
        .set(...bearer(seller))
        .expect(200);
      expect(mine.body.status).toBe(ListingStatus.PAUSED);

      const stored = await db().listing.findUniqueOrThrow({ where: { id } });
      expect(stored.pausedReason).toBe('Tenants moving out first');
    });

    it('accepts a pause with no reason at all', async () => {
      const id = await makeListing();
      await asSeller(id, 'pause').send({}).expect(200);
    });

    it('refuses to pause something that was never live', async () => {
      const id = await makeListing(ListingStatus.DRAFT);
      await asSeller(id, 'pause').send({}).expect(400);
    });

    it('refuses to pause the same listing twice', async () => {
      const id = await makeListing();
      await asSeller(id, 'pause').send({}).expect(200);
      await asSeller(id, 'pause').send({}).expect(400);
    });
  });

  // -------------------------------------------------------------------------

  describe('resuming', () => {
    /**
     * The point of the whole feature. If putting a listing back meant queueing
     * for another review, sellers would leave stale listings up instead of
     * pausing them — which is the behaviour we are trying to end.
     */
    it('goes straight back to live without another review', async () => {
      const id = await makeListing();
      await asSeller(id, 'pause').send({}).expect(200);

      await asSeller(id, 'resume').send({}).expect(200);

      const stored = await db().listing.findUniqueOrThrow({ where: { id } });
      expect(stored.status).toBe(ListingStatus.APPROVED);
      expect(stored.isVerified).toBe(true);
      expect(stored.pausedReason).toBeNull();

      await http().get(`/api/listings/${id}`).expect(200);
    });

    /**
     * firstListedAt survives, so a listing cannot be laundered into looking new
     * by pausing and resuming it — which is exactly the trick this platform
     * exists to stop.
     */
    it('does not make an old listing look new', async () => {
      const id = await makeListing();
      const before = await db().listing.findUniqueOrThrow({ where: { id } });

      await asSeller(id, 'pause').send({}).expect(200);
      await asSeller(id, 'resume').send({}).expect(200);

      const after = await db().listing.findUniqueOrThrow({ where: { id } });
      expect(after.firstListedAt).toEqual(before.firstListedAt);
      // Resuming is itself an assertion that it is available again.
      expect(after.lastConfirmedAt).not.toBeNull();
    });

    it('refuses to resume something that was not paused', async () => {
      const id = await makeListing();
      await asSeller(id, 'resume').send({}).expect(400);
    });
  });

  // -------------------------------------------------------------------------

  describe('marking sold', () => {
    it('takes it off the market and records the sale', async () => {
      const id = await makeListing();

      await asSeller(id, 'mark-sold')
        .send({ soldPrice: 9_200_000, soldThroughPlatform: true })
        .expect(200);

      const stored = await db().listing.findUniqueOrThrow({ where: { id } });
      expect(stored.status).toBe(ListingStatus.SOLD);
      expect(stored.soldAt).not.toBeNull();
      expect(Number(stored.soldPrice)).toBe(9_200_000);
      expect(stored.soldThroughPlatform).toBe(true);

      await http().get(`/api/listings/${id}`).expect(404);
    });

    it('accepts a sale with no details given', async () => {
      const id = await makeListing();

      await asSeller(id, 'mark-sold').send({}).expect(200);

      const stored = await db().listing.findUniqueOrThrow({ where: { id } });
      expect(stored.status).toBe(ListingStatus.SOLD);
      expect(stored.soldPrice).toBeNull();
      expect(stored.soldThroughPlatform).toBeNull();
    });

    it('can be marked sold straight from paused', async () => {
      const id = await makeListing();
      await asSeller(id, 'pause').send({}).expect(200);
      await asSeller(id, 'mark-sold').send({}).expect(200);

      const stored = await db().listing.findUniqueOrThrow({ where: { id } });
      expect(stored.status).toBe(ListingStatus.SOLD);
      expect(stored.pausedReason).toBeNull();
    });

    /**
     * Nobody should turn up at a property that has gone. A request going quiet
     * is the complaint buyers make most about the incumbents, and selling is no
     * excuse for it.
     */
    it('tells anyone waiting on a visit', async () => {
      const id = await makeListing();

      await http()
        .post(`/api/listings/${id}/site-visits`)
        .set(...bearer(buyer))
        .send({ preferredAt: new Date(Date.now() + 3 * 86_400_000).toISOString() })
        .expect(201);

      await asSeller(id, 'mark-sold').send({}).expect(200);

      const visits = await http()
        .get('/api/site-visits/mine')
        .set(...bearer(buyer))
        .expect(200);

      expect(visits.body[0].status).toBe(SiteVisitStatus.CANCELLED);
      expect(visits.body[0].sellerNote).toMatch(/sold/i);
    });

    it('is terminal', async () => {
      const id = await makeListing();
      await asSeller(id, 'mark-sold').send({}).expect(200);

      await asSeller(id, 'mark-sold').send({}).expect(400);
      await asSeller(id, 'pause').send({}).expect(400);
      await asSeller(id, 'resume').send({}).expect(400);
    });

    it('refuses to mark a draft sold', async () => {
      const id = await makeListing(ListingStatus.DRAFT);
      await asSeller(id, 'mark-sold').send({}).expect(400);
    });
  });

  // -------------------------------------------------------------------------

  /**
   * What a buyer who shortlisted the property is told.
   *
   * "Sold" and "temporarily unavailable" are the same thing to our bookkeeping
   * and completely different to them — one means stop waiting, the other means
   * check back. Getting this wrong tells someone a sold house is still in the
   * running, which is the small dishonesty this platform exists to avoid.
   */
  describe('what the shortlist says', () => {
    async function savedReason(id: string): Promise<{ available: boolean; reason: string }> {
      const response = await http()
        .get('/api/saved')
        .set(...bearer(buyer))
        .expect(200);

      const entry = response.body.items.find(
        (item: { listing: { id: string } }) => item.listing.id === id,
      );
      return { available: entry.isAvailable, reason: entry.unavailableReason };
    }

    it('says a sold home has sold', async () => {
      const id = await makeListing();
      await http()
        .post(`/api/listings/${id}/save`)
        .set(...bearer(buyer))
        .expect(201);

      await asSeller(id, 'mark-sold').send({}).expect(200);

      const { available, reason } = await savedReason(id);
      expect(available).toBe(false);
      expect(reason).toMatch(/sold/i);
      // Specifically not the "we are re-checking it" wording.
      expect(reason).not.toMatch(/re-checked/i);
    });

    it('says a paused home was taken off the market, not that it is being re-checked', async () => {
      const id = await makeListing();
      await http()
        .post(`/api/listings/${id}/save`)
        .set(...bearer(buyer))
        .expect(201);

      await asSeller(id, 'pause').send({}).expect(200);

      const { available, reason } = await savedReason(id);
      expect(available).toBe(false);
      expect(reason).toMatch(/off the market/i);
      expect(reason).not.toMatch(/re-checked/i);
    });

    it('shows it as available again once it is put back', async () => {
      const id = await makeListing();
      await http()
        .post(`/api/listings/${id}/save`)
        .set(...bearer(buyer))
        .expect(201);

      await asSeller(id, 'pause').send({}).expect(200);
      await asSeller(id, 'resume').send({}).expect(200);

      const { available, reason } = await savedReason(id);
      expect(available).toBe(true);
      expect(reason).toBeNull();
    });
  });

  describe('authorization', () => {
    it('refuses another seller', async () => {
      const id = await makeListing();
      const other = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });

      // 404 rather than 403 — a distinct "forbidden" would confirm the listing
      // exists, letting a stranger probe for ids that are not theirs.
      await http()
        .post(`/api/listings/${id}/pause`)
        .set(...bearer(other))
        .send({})
        .expect(404);

      await http()
        .post(`/api/listings/${id}/mark-sold`)
        .set(...bearer(other))
        .send({})
        .expect(404);
    });

    it('refuses a buyer outright', async () => {
      const id = await makeListing();

      await http()
        .post(`/api/listings/${id}/mark-sold`)
        .set(...bearer(buyer))
        .send({})
        .expect(403);
    });

    it('refuses an unauthenticated caller', async () => {
      const id = await makeListing();
      await http().post(`/api/listings/${id}/pause`).send({}).expect(401);
    });
  });
});
