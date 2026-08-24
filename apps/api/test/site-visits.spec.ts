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
 * Site visit requests (PRD feature 16).
 *
 * Arranging to meet a stranger at a property is the point where an online
 * marketplace becomes a real-world commitment, so the rules are stricter than
 * for an enquiry: both parties are accounts, one request at a time, and a
 * refusal has to say something.
 */
describe('site visit requests', () => {
  let neighborhoodId: string;
  let seller: TestUser;
  let buyer: TestUser;
  let listingId: string;

  /** A slot comfortably inside the accepted window. */
  const inDays = (days: number): string =>
    new Date(Date.now() + days * 86_400_000).toISOString();

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
        title: 'A flat used by the site visit tests',
        description:
          'Long enough to satisfy the fifty character minimum the create endpoint enforces.',
        price: 9_500_000,
        status: ListingStatus.APPROVED,
        isVerified: true,
        firstListedAt: new Date(),
      },
      select: { id: true },
    });

    listingId = listing.id;
  });

  function request(user: TestUser, body: Record<string, unknown>) {
    return http()
      .post(`/api/listings/${listingId}/site-visits`)
      .set(...bearer(user))
      .send(body);
  }

  describe('requesting', () => {
    it('records a request against the buyer’s account', async () => {
      const response = await request(buyer, {
        preferredAt: inDays(3),
        note: 'Saturday morning would suit me best.',
      }).expect(201);

      expect(response.body.status).toBe('REQUESTED');

      const stored = await db().siteVisitRequest.findFirstOrThrow({
        where: { listingId },
        select: { buyerId: true, status: true, note: true, confirmedAt: true },
      });
      expect(stored.buyerId).toBe(buyer.id);
      expect(stored.confirmedAt).toBeNull();
    });

    it('requires a signed-in buyer', async () => {
      // Unlike reporting a listing, which stays open to anyone.
      await http()
        .post(`/api/listings/${listingId}/site-visits`)
        .send({ preferredAt: inDays(3) })
        .expect(401);
    });

    it('refuses a second open request on the same listing', async () => {
      await request(buyer, { preferredAt: inDays(3) }).expect(201);

      // Otherwise a seller's inbox fills with the same person asking twice and
      // there is no single row to confirm against.
      const second = await request(buyer, { preferredAt: inDays(5) });
      expect(second.status).toBe(400);

      expect(await db().siteVisitRequest.count({ where: { listingId } })).toBe(1);
    });

    it('refuses a seller requesting a visit to their own listing', async () => {
      await request(seller, { preferredAt: inDays(3) }).expect(400);
    });

    it.each([
      ['a time in the past', -1],
      ['a time beyond ninety days', 120],
    ])('rejects %s', async (_label, offset) => {
      await request(buyer, { preferredAt: inDays(offset) }).expect(400);
    });

    it('does not allow a request against a listing that is not public', async () => {
      await db().listing.update({
        where: { id: listingId },
        data: { status: ListingStatus.DRAFT, isVerified: false },
      });

      await request(buyer, { preferredAt: inDays(3) }).expect(404);
    });
  });

  describe('responding', () => {
    async function open(): Promise<string> {
      const response = await request(buyer, { preferredAt: inDays(3) }).expect(201);
      return response.body.id as string;
    }

    function respond(user: TestUser, id: string, body: Record<string, unknown>) {
      return http()
        .patch(`/api/site-visits/${id}/respond`)
        .set(...bearer(user))
        .send(body);
    }

    it('confirms at the buyer’s requested time by default', async () => {
      const id = await open();

      const response = await respond(seller, id, { decision: 'CONFIRM' }).expect(200);

      expect(response.body.status).toBe('CONFIRMED');
      expect(response.body.confirmedAt).not.toBeNull();
      // The slot the buyer asked for, not a new one.
      expect(new Date(response.body.confirmedAt).getTime()).toBe(
        new Date(response.body.preferredAt).getTime(),
      );
    });

    it('records a counter-proposal as rescheduled, not declined', async () => {
      const id = await open();
      const alternative = inDays(6);

      const response = await respond(seller, id, {
        decision: 'RESCHEDULE',
        proposedAt: alternative,
        sellerNote: 'Sunday suits me better if that works for you.',
      }).expect(200);

      // A different time on offer is not a refusal, and collapsing the two
      // would lose a visit that was going to happen.
      expect(response.body.status).toBe('RESCHEDULED');
      expect(response.body.proposedAt).not.toBeNull();
    });

    it('refuses to reschedule without offering a time', async () => {
      const id = await open();
      await respond(seller, id, { decision: 'RESCHEDULE' }).expect(400);
    });

    it('refuses to decline without a reason', async () => {
      const id = await open();
      // A request going quiet is the complaint buyers make most about the
      // incumbent portals.
      await respond(seller, id, { decision: 'DECLINE' }).expect(400);
    });

    it('declines with a reason', async () => {
      const id = await open();
      const response = await respond(seller, id, {
        decision: 'DECLINE',
        sellerNote: 'The property is under offer, so a visit would waste your time.',
      }).expect(200);

      expect(response.body.status).toBe('DECLINED');
      expect(response.body.sellerNote).toContain('under offer');
    });

    it('does not let another seller respond', async () => {
      const id = await open();
      const intruder = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });

      await respond(intruder, id, { decision: 'CONFIRM' }).expect(404);

      const untouched = await db().siteVisitRequest.findUniqueOrThrow({
        where: { id },
        select: { status: true },
      });
      expect(untouched.status).toBe('REQUESTED');
    });

    it('does not let the buyer respond on the seller’s behalf', async () => {
      const id = await open();
      const response = await respond(buyer, id, { decision: 'CONFIRM' });
      expect(response.status).toBe(403);
    });
  });

  describe('visibility', () => {
    it('shows the buyer their own requests and their status', async () => {
      await request(buyer, { preferredAt: inDays(3) }).expect(201);

      const response = await http()
        .get('/api/site-visits/mine')
        .set(...bearer(buyer))
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].status).toBe('REQUESTED');
    });

    it('shows a seller only requests on their own listings', async () => {
      await request(buyer, { preferredAt: inDays(3) }).expect(201);

      const other = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
      const theirs = await http()
        .get('/api/site-visits/received')
        .set(...bearer(other))
        .expect(200);
      expect(theirs.body).toHaveLength(0);

      const mine = await http()
        .get('/api/site-visits/received')
        .set(...bearer(seller))
        .expect(200);
      expect(mine.body).toHaveLength(1);
      // Contact details appear here and nowhere else.
      expect(mine.body[0].buyer.fullName).toBeTruthy();
    });

    /**
     * The buyer's page has to carry the seller's answer, including a decline and
     * the reason for it — the listing page promises exactly that. It must not
     * carry anything about the other party beyond what they wrote.
     */
    it('gives the buyer the answer without leaking the seller', async () => {
      await request(buyer, {
        preferredAt: inDays(3),
        note: 'I can be flexible either side of this.',
      }).expect(201);

      const inbox = await http()
        .get('/api/site-visits/received')
        .set(...bearer(seller))
        .expect(200);

      await http()
        .patch(`/api/site-visits/${inbox.body[0].id}/respond`)
        .set(...bearer(seller))
        .send({ decision: 'DECLINE', sellerNote: 'The property is under offer.' })
        .expect(200);

      const response = await http()
        .get('/api/site-visits/mine')
        .set(...bearer(buyer))
        .expect(200);

      const [visit] = response.body;
      expect(visit.status).toBe('DECLINED');
      expect(visit.sellerNote).toBe('The property is under offer.');
      // Their own note, echoed back so they can see what they asked for.
      expect(visit.note).toBe('I can be flexible either side of this.');
      // No seller contact details on the buyer's side.
      expect(visit.seller).toBeUndefined();
      expect(visit.buyer).toBeUndefined();
    });
  });
});
