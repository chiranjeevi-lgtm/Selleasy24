import {
  ListingStatus,
  Role,
  SellerKind,
  VerificationCheckKind,
  VerificationDecision,
} from '@kamala/db';

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
 * Data invariants.
 *
 * Each of these protects a promise the product makes to buyers. They are the
 * claims that distinguish this platform from the incumbents it is competing
 * with, so a regression here is not a cosmetic bug — it removes the reason the
 * product exists.
 */
describe('data invariants', () => {
  let neighborhoodId: string;
  let officer: TestUser;

  /** The four checks the API requires before an approval is accepted. */
  const PASSING_CHECKS = [
    { kind: VerificationCheckKind.OWNER_NAME_MATCHES_DEED, passed: true },
    { kind: VerificationCheckKind.DEED_REGISTERED_AND_STAMPED, passed: true },
    { kind: VerificationCheckKind.PROPERTY_TAX_CURRENT, passed: true },
    { kind: VerificationCheckKind.LOCATION_MATCHES_DOCUMENTS, passed: true },
  ];

  beforeAll(async () => {
    await startApp();
  });

  afterAll(async () => {
    await stopApp();
  });

  beforeEach(async () => {
    await truncateAll();
    neighborhoodId = (await createNeighborhood()).id;
    officer = await createUser({ role: Role.VERIFIER });
  });

  async function makeListing(
    seller: TestUser,
    overrides: { status?: ListingStatus; floor?: number | null; price?: number } = {},
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
        floor: overrides.floor ?? null,
        neighborhoodId,
      },
      select: { id: true },
    });

    const listing = await db().listing.create({
      data: {
        propertyId: property.id,
        sellerId: seller.id,
        title: 'A three bedroom flat used by the invariant tests',
        description:
          'Long enough to satisfy the fifty character minimum the create endpoint enforces on real submissions.',
        price: overrides.price ?? 9_500_000,
        status: overrides.status ?? ListingStatus.PENDING_REVIEW,
        submittedAt: new Date(),
      },
      select: { id: true },
    });

    return listing.id;
  }

  function approve(listingId: string) {
    return http()
      .post(`/api/verification/listings/${listingId}/decide`)
      .set(...bearer(officer))
      .send({ decision: VerificationDecision.APPROVED, checks: PASSING_CHECKS });
  }

  describe('firstListedAt is immutable', () => {
    /**
     * The anti-stale-listing promise. Incumbents let sellers re-post an old
     * listing so it appears new; "Listed 3 days ago" is only meaningful if this
     * date cannot move.
     */
    it('survives approval, rejection and re-approval unchanged', async () => {
      const seller = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
      const listingId = await makeListing(seller);

      await approve(listingId).expect(200);

      const afterFirst = await db().listing.findUniqueOrThrow({
        where: { id: listingId },
        select: { firstListedAt: true },
      });
      expect(afterFirst.firstListedAt).not.toBeNull();
      const original = afterFirst.firstListedAt!.getTime();

      // Send it back for review, reject it, then approve it a second time.
      await db().listing.update({
        where: { id: listingId },
        data: { status: ListingStatus.PENDING_REVIEW },
      });

      await http()
        .post(`/api/verification/listings/${listingId}/decide`)
        .set(...bearer(officer))
        .send({
          decision: VerificationDecision.REJECTED,
          reason: 'The sale deed supplied does not match the address on the listing.',
        })
        .expect(200);

      await db().listing.update({
        where: { id: listingId },
        data: { status: ListingStatus.PENDING_REVIEW },
      });

      await approve(listingId).expect(200);

      const afterSecond = await db().listing.findUniqueOrThrow({
        where: { id: listingId },
        select: { firstListedAt: true },
      });

      expect(afterSecond.firstListedAt!.getTime()).toBe(original);
    });
  });

  describe('price history is append-only', () => {
    it('records the original price and every change, oldest preserved', async () => {
      const seller = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });

      const created = await http()
        .post('/api/listings')
        .set(...bearer(seller))
        .send({
          title: 'A flat whose price will be reduced twice',
          description:
            'Long enough to satisfy the fifty character minimum that the create endpoint enforces.',
          price: 9_500_000,
          address: 'Plot 42, Vittal Rao Nagar',
          pincode: '500032',
          neighborhoodId,
          propertyType: 'FLAT',
          bedrooms: 3,
          bathrooms: 2,
          areaSqft: 1500,
          possession: 'READY_TO_MOVE',
        })
        .expect(201);

      const listingId = created.body.id as string;

      await http()
        .patch(`/api/listings/${listingId}`)
        .set(...bearer(seller))
        .send({ price: 9_000_000 })
        .expect(200);

      await http()
        .patch(`/api/listings/${listingId}`)
        .set(...bearer(seller))
        .send({ price: 8_750_000 })
        .expect(200);

      const history = await db().priceHistory.findMany({
        where: { listingId },
        orderBy: { changedAt: 'asc' },
        select: { price: true, previousPrice: true },
      });

      // Creation plus two reductions — the original is still there.
      expect(history).toHaveLength(3);
      expect(Number(history[0]!.price)).toBe(9_500_000);
      expect(history[0]!.previousPrice).toBeNull();
      expect(Number(history[1]!.price)).toBe(9_000_000);
      expect(Number(history[1]!.previousPrice)).toBe(9_500_000);
      expect(Number(history[2]!.price)).toBe(8_750_000);
    });
  });

  describe('ground floor is a real value', () => {
    /**
     * `floor` is nullable rather than defaulted precisely so that 0 means
     * "ground floor" and null means "not answered". A truthiness check anywhere
     * in the stack collapses the two and quietly mislabels every ground-floor
     * flat as incomplete.
     */
    it('round-trips floor 0 as a recorded value, distinct from null', async () => {
      const seller = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
      const groundId = await makeListing(seller, { floor: 0 });
      const unknownId = await makeListing(seller, { floor: null });

      await approve(groundId).expect(200);
      await approve(unknownId).expect(200);

      const ground = await http().get(`/api/listings/${groundId}`).expect(200);
      const unknown = await http().get(`/api/listings/${unknownId}`).expect(200);

      expect(ground.body.property.floor).toBe(0);
      expect(unknown.body.property.floor).toBeNull();
    });
  });

  describe('separation of duties', () => {
    it('stops a verification officer approving a listing they own', async () => {
      // An officer who also sells: the role check alone would let this through.
      const officerAsSeller = await createUser({
        role: Role.VERIFIER,
        sellerKind: SellerKind.OWNER,
      });
      const listingId = await makeListing(officerAsSeller);

      const response = await http()
        .post(`/api/verification/listings/${listingId}/decide`)
        .set(...bearer(officerAsSeller))
        .send({ decision: VerificationDecision.APPROVED, checks: PASSING_CHECKS });

      expect(response.status).toBe(403);

      const untouched = await db().listing.findUniqueOrThrow({
        where: { id: listingId },
        select: { status: true, isVerified: true },
      });
      expect(untouched.status).toBe(ListingStatus.PENDING_REVIEW);
      expect(untouched.isVerified).toBe(false);
    });
  });

  describe('approval requires the checks to be recorded', () => {
    it('refuses an approval with a mandatory check missing', async () => {
      const seller = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
      const listingId = await makeListing(seller);

      const response = await http()
        .post(`/api/verification/listings/${listingId}/decide`)
        .set(...bearer(officer))
        .send({
          decision: VerificationDecision.APPROVED,
          checks: PASSING_CHECKS.slice(0, 3),
        });

      expect(response.status).toBe(400);
    });

    it('refuses an approval where a mandatory check failed', async () => {
      const seller = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
      const listingId = await makeListing(seller);

      const response = await http()
        .post(`/api/verification/listings/${listingId}/decide`)
        .set(...bearer(officer))
        .send({
          decision: VerificationDecision.APPROVED,
          checks: [
            ...PASSING_CHECKS.slice(0, 3),
            { kind: VerificationCheckKind.LOCATION_MATCHES_DOCUMENTS, passed: false },
          ],
        });

      expect(response.status).toBe(400);
    });

    it('refuses a rejection with no reason for the seller', async () => {
      const seller = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
      const listingId = await makeListing(seller);

      await http()
        .post(`/api/verification/listings/${listingId}/decide`)
        .set(...bearer(officer))
        .send({ decision: VerificationDecision.REJECTED })
        .expect(400);
    });

    it('publishes the recorded checks on the public verification record', async () => {
      const seller = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
      const listingId = await makeListing(seller);

      await approve(listingId).expect(200);

      // Readable without a token — the badge is only worth something if a buyer
      // can see what was actually checked.
      const record = await http().get(`/api/verification/public/${listingId}`).expect(200);

      const kinds = (record.body.checks as Array<{ kind: string }>).map((c) => c.kind);
      for (const check of PASSING_CHECKS) {
        expect(kinds).toContain(check.kind);
      }
      // Staff commentary must never appear here.
      expect(JSON.stringify(record.body)).not.toContain('internalNotes');
    });
  });

  describe('search filters combine with AND', () => {
    it('returns only listings satisfying every amenity, not any of them', async () => {
      const seller = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });

      const withBoth = await db().property.create({
        data: {
          address: 'Both amenities present here',
          pincode: '500032',
          propertyType: 'FLAT',
          bedrooms: 3,
          bathrooms: 2,
          areaSqft: 1500,
          possession: 'READY_TO_MOVE',
          amenities: ['LIFT', 'GYM'],
          neighborhoodId,
        },
        select: { id: true },
      });

      const withOne = await db().property.create({
        data: {
          address: 'Only one amenity present here',
          pincode: '500032',
          propertyType: 'FLAT',
          bedrooms: 3,
          bathrooms: 2,
          areaSqft: 1500,
          possession: 'READY_TO_MOVE',
          amenities: ['LIFT'],
          neighborhoodId,
        },
        select: { id: true },
      });

      const ids: string[] = [];
      for (const propertyId of [withBoth.id, withOne.id]) {
        const listing = await db().listing.create({
          data: {
            propertyId,
            sellerId: seller.id,
            title: 'A flat for the amenity filter test',
            description:
              'Long enough to satisfy the fifty character minimum the create endpoint enforces.',
            price: 9_500_000,
            status: ListingStatus.APPROVED,
            isVerified: true,
            firstListedAt: new Date(),
          },
          select: { id: true },
        });
        ids.push(listing.id);
      }

      const both = await http()
        .get('/api/listings/search?amenities=LIFT,GYM&limit=50')
        .expect(200);
      const returned = (both.body.items as Array<{ id: string }>).map((i) => i.id);

      expect(returned).toContain(ids[0]);
      // The OR bug would include this one.
      expect(returned).not.toContain(ids[1]);
      expect(both.body.total).toBe(1);
    });
  });

  describe('multi-select filters', () => {
    /** Publishes one approved listing with the given configuration. */
    async function publish(bedrooms: number, propertyType: 'FLAT' | 'HOUSE'): Promise<string> {
      const seller = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });

      const property = await db().property.create({
        data: {
          address: `A ${bedrooms} bedroom ${propertyType.toLowerCase()}`,
          pincode: '500032',
          propertyType,
          bedrooms,
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
          title: `${bedrooms} BHK ${propertyType.toLowerCase()} for the filter tests`,
          description:
            'Long enough to satisfy the fifty character minimum the create endpoint enforces.',
          price: 9_500_000,
          status: ListingStatus.APPROVED,
          isVerified: true,
          firstListedAt: new Date(),
        },
        select: { id: true },
      });

      return listing.id;
    }

    async function totalFor(query: string): Promise<number> {
      const response = await http().get(`/api/listings/search?${query}&limit=50`).expect(200);
      return response.body.total as number;
    }

    it('matches any of several bedroom counts', async () => {
      await publish(1, 'FLAT');
      await publish(2, 'FLAT');
      await publish(3, 'FLAT');
      await publish(5, 'FLAT');

      // The point of multi-select: 2 or 3, without dragging in 5.
      expect(await totalFor('bedrooms=2,3')).toBe(2);
      expect(await totalFor('bedrooms=2')).toBe(1);
      expect(await totalFor('bedrooms=1,2,3,5')).toBe(4);

      // Repeated params work too — that is what a checkbox group submits.
      expect(await totalFor('bedrooms=2&bedrooms=3')).toBe(2);
    });

    it('keeps minBedrooms as a separate, open-ended question', async () => {
      await publish(1, 'FLAT');
      await publish(2, 'FLAT');
      await publish(3, 'FLAT');
      await publish(5, 'FLAT');

      // "3 and above" includes the 5; "exactly 3" does not.
      expect(await totalFor('minBedrooms=3')).toBe(2);
      expect(await totalFor('bedrooms=3')).toBe(1);
    });

    it('matches any of several property types', async () => {
      await publish(3, 'FLAT');
      await publish(3, 'HOUSE');

      expect(await totalFor('propertyType=FLAT')).toBe(1);
      expect(await totalFor('propertyType=FLAT,HOUSE')).toBe(2);
    });

    it('combines a multi-select with other filters using AND', async () => {
      await publish(2, 'FLAT');
      await publish(3, 'FLAT');
      await publish(3, 'HOUSE');

      // 2 or 3 bedrooms AND a flat — not everything matching either.
      expect(await totalFor('bedrooms=2,3&propertyType=FLAT')).toBe(2);
    });

    it('rejects a value that is not a real property type', async () => {
      await http().get('/api/listings/search?propertyType=CASTLE').expect(400);
    });
  });

  describe('submission gates', () => {
    it('refuses to submit a listing with no phone number on the account', async () => {
      const seller = await createUser({
        role: Role.OWNER,
        sellerKind: SellerKind.OWNER,
        phone: null,
      });
      const listingId = await makeListing(seller, { status: ListingStatus.DRAFT });

      const response = await http()
        .post(`/api/listings/${listingId}/submit`)
        .set(...bearer(seller));

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toMatch(/phone/i);
    });

    it('refuses to submit when the phone number is present but unverified', async () => {
      /*
       * The gap this closes: a number typed into a profile proves nothing. Only
       * a number someone has answered a code on is worth showing to a buyer.
       */
      const seller = await createUser({
        role: Role.OWNER,
        sellerKind: SellerKind.OWNER,
        phoneVerified: false,
      });
      const listingId = await makeListing(seller, { status: ListingStatus.DRAFT });

      const response = await http()
        .post(`/api/listings/${listingId}/submit`)
        .set(...bearer(seller));

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toMatch(/verify/i);

      const untouched = await db().listing.findUniqueOrThrow({
        where: { id: listingId },
        select: { status: true },
      });
      expect(untouched.status).toBe(ListingStatus.DRAFT);
    });

    it('refuses to submit a broker listing with no RERA number', async () => {
      const broker = await createUser({ role: Role.BROKER, sellerKind: SellerKind.BROKER });
      const listingId = await makeListing(broker, { status: ListingStatus.DRAFT });

      const response = await http()
        .post(`/api/listings/${listingId}/submit`)
        .set(...bearer(broker));

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toMatch(/RERA/i);
    });
  });
});
