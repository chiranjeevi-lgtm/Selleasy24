import { BuyingPurpose, ListingStatus, Occupation, PossessionStatus, Role, SellerKind } from '@kamala/db';

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
 * Buyer preferences and the recommendations built from them.
 *
 * The flow is deliberately abandonable: each step saves on its own, so a buyer
 * who gives up after the first question still keeps that answer. Most of what
 * is tested here is that partial input behaves — because that is the state most
 * real buyers will be in.
 */
describe('buyer preferences', () => {
  let buyer: TestUser;
  let seller: TestUser;
  let gachibowli: string;
  let kondapur: string;

  beforeAll(async () => {
    await startApp();
  });

  afterAll(async () => {
    await stopApp();
  });

  beforeEach(async () => {
    await truncateAll();
    buyer = await createUser({ role: Role.BUYER });
    seller = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
    gachibowli = (await createNeighborhood('Gachibowli')).id;
    kondapur = (await createNeighborhood('Kondapur')).id;
  });

  /** A published listing to rank. */
  async function publish(options: {
    price: number;
    bedrooms: number;
    neighborhoodId: string;
    possession?: PossessionStatus;
    areaSqft?: number;
    title?: string;
  }): Promise<string> {
    const property = await db().property.create({
      data: {
        address: 'Plot 42, Vittal Rao Nagar',
        pincode: '500032',
        propertyType: 'FLAT',
        bedrooms: options.bedrooms,
        bathrooms: 2,
        areaSqft: options.areaSqft ?? 1500,
        possession: options.possession ?? PossessionStatus.READY_TO_MOVE,
        neighborhoodId: options.neighborhoodId,
      },
      select: { id: true },
    });

    const listing = await db().listing.create({
      data: {
        propertyId: property.id,
        sellerId: seller.id,
        title: options.title ?? `A ${options.bedrooms} BHK used by the preference tests`,
        description:
          'Long enough to satisfy the fifty character minimum the create endpoint enforces.',
        price: options.price,
        status: ListingStatus.APPROVED,
        isVerified: true,
        firstListedAt: new Date(),
      },
      select: { id: true },
    });

    return listing.id;
  }

  const profile = () => http().get('/api/buyers/me/profile').set(...bearer(buyer));

  // -------------------------------------------------------------------------

  describe('the steps', () => {
    it('creates an empty profile on first read', async () => {
      const response = await profile().expect(200);

      expect(response.body.purpose).toBeNull();
      expect(response.body.localities).toEqual([]);
      // Null rather than a date: they have not finished, they have not started.
      expect(response.body.completedAt).toBeNull();
    });

    it('keeps each step independently, so abandoning halfway loses nothing', async () => {
      await http()
        .put('/api/buyers/me/profile/purpose')
        .set(...bearer(buyer))
        .send({ purpose: BuyingPurpose.LIVE_IN, householdSize: 4 })
        .expect(200);

      // Buyer leaves here. What they answered is still there.
      const after = await profile().expect(200);
      expect(after.body.purpose).toBe(BuyingPurpose.LIVE_IN);
      expect(after.body.householdSize).toBe(4);
      expect(after.body.budgetMax).toBeNull();
      expect(after.body.completedAt).toBeNull();
    });

    it('records a budget and an optional income', async () => {
      const response = await http()
        .put('/api/buyers/me/profile/budget')
        .set(...bearer(buyer))
        .send({ budgetMin: 5_000_000, budgetMax: 9_000_000, monthlyIncome: 180_000 })
        .expect(200);

      expect(response.body.budgetMin).toBe(5_000_000);
      expect(response.body.budgetMax).toBe(9_000_000);
      expect(response.body.monthlyIncome).toBe(180_000);
    });

    it('accepts a budget with no income at all', async () => {
      const response = await http()
        .put('/api/buyers/me/profile/budget')
        .set(...bearer(buyer))
        .send({ budgetMax: 9_000_000 })
        .expect(200);

      expect(response.body.budgetMax).toBe(9_000_000);
      expect(response.body.monthlyIncome).toBeNull();
    });

    it('refuses a budget whose floor is above its ceiling', async () => {
      await http()
        .put('/api/buyers/me/profile/budget')
        .set(...bearer(buyer))
        .send({ budgetMin: 9_000_000, budgetMax: 5_000_000 })
        .expect(400);
    });

    it('replaces the locality set rather than appending', async () => {
      await http()
        .put('/api/buyers/me/profile/localities')
        .set(...bearer(buyer))
        .send({ neighborhoodIds: [gachibowli, kondapur] })
        .expect(200);

      const second = await http()
        .put('/api/buyers/me/profile/localities')
        .set(...bearer(buyer))
        .send({ neighborhoodIds: [kondapur] })
        .expect(200);

      expect(second.body.localities).toHaveLength(1);
      expect(second.body.localities[0].name).toBe('Kondapur');
    });

    it('refuses a locality that does not exist', async () => {
      await http()
        .put('/api/buyers/me/profile/localities')
        .set(...bearer(buyer))
        .send({ neighborhoodIds: ['00000000-0000-4000-8000-000000000000'] })
        .expect(400);
    });

    it('marks the run finished on the last step', async () => {
      const response = await http()
        .put('/api/buyers/me/profile/about')
        .set(...bearer(buyer))
        .send({ occupation: Occupation.SALARIED })
        .expect(200);

      expect(response.body.occupation).toBe(Occupation.SALARIED);
      expect(response.body.completedAt).not.toBeNull();
    });

    /**
     * Skipping has to keep what was already given. A buyer who answered two
     * steps and skipped the rest has told us something useful, and discarding
     * it would be the worst possible reading of "skip".
     */
    it('keeps earlier answers when the rest is skipped', async () => {
      await http()
        .put('/api/buyers/me/profile/purpose')
        .set(...bearer(buyer))
        .send({ purpose: BuyingPurpose.RENT_OUT, bedroomsWanted: 2 })
        .expect(200);

      const response = await http()
        .post('/api/buyers/me/profile/skip')
        .set(...bearer(buyer))
        .expect(200);

      expect(response.body.purpose).toBe(BuyingPurpose.RENT_OUT);
      expect(response.body.bedroomsWanted).toBe(2);
      expect(response.body.completedAt).not.toBeNull();
    });

    it('refuses an unauthenticated caller', async () => {
      await http().get('/api/buyers/me/profile').expect(401);
    });

    it('never lets one account read another’s preferences', async () => {
      await http()
        .put('/api/buyers/me/profile/budget')
        .set(...bearer(buyer))
        .send({ budgetMax: 9_000_000 })
        .expect(200);

      const other = await createUser({ role: Role.BUYER });
      const response = await http()
        .get('/api/buyers/me/profile')
        .set(...bearer(other))
        .expect(200);

      // Their own empty profile, not the first buyer's.
      expect(response.body.budgetMax).toBeNull();
    });
  });

  // -------------------------------------------------------------------------

  describe('recommendations', () => {
    const recommend = () =>
      http().get('/api/buyers/me/recommendations').set(...bearer(buyer));

    /**
     * The most important rule here. A row of arbitrary properties under a
     * "recommended for you" heading is the dishonesty this platform exists to
     * displace — if we cannot personalise, we should say so.
     */
    it('returns nothing rather than guessing when we know nothing', async () => {
      await publish({ price: 8_000_000, bedrooms: 3, neighborhoodId: gachibowli });

      const response = await recommend().expect(200);

      expect(response.body.personalised).toBe(false);
      expect(response.body.items).toEqual([]);
    });

    it('ranks a match in a chosen area above one outside it', async () => {
      const inside = await publish({
        price: 8_000_000,
        bedrooms: 3,
        neighborhoodId: gachibowli,
        title: 'The one in the area they picked',
      });
      await publish({
        price: 8_000_000,
        bedrooms: 3,
        neighborhoodId: kondapur,
        title: 'The one somewhere else',
      });

      await http()
        .put('/api/buyers/me/profile/budget')
        .set(...bearer(buyer))
        .send({ budgetMax: 9_000_000 })
        .expect(200);
      await http()
        .put('/api/buyers/me/profile/localities')
        .set(...bearer(buyer))
        .send({ neighborhoodIds: [gachibowli] })
        .expect(200);

      const response = await recommend().expect(200);

      expect(response.body.personalised).toBe(true);
      expect(response.body.items[0].id).toBe(inside);
      expect(response.body.items[0].reasons).toContain('In an area you chose');
    });

    it('excludes anything far above the stated budget', async () => {
      await publish({ price: 8_000_000, bedrooms: 3, neighborhoodId: gachibowli });
      await publish({
        price: 30_000_000,
        bedrooms: 3,
        neighborhoodId: gachibowli,
        title: 'Far out of reach',
      });

      await http()
        .put('/api/buyers/me/profile/budget')
        .set(...bearer(buyer))
        .send({ budgetMax: 9_000_000 })
        .expect(200);

      const response = await recommend().expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].price).toBe(8_000_000);
    });

    /**
     * Budgets are approximate, so a small overshoot is shown — and labelled, so
     * the buyer is never surprised by the number.
     */
    it('shows a near miss and says how far over it is', async () => {
      await publish({
        price: 9_500_000,
        bedrooms: 3,
        neighborhoodId: gachibowli,
        title: 'Slightly over',
      });

      await http()
        .put('/api/buyers/me/profile/budget')
        .set(...bearer(buyer))
        .send({ budgetMax: 9_000_000 })
        .expect(200);

      const response = await recommend().expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].reasons.join(' ')).toMatch(/above your budget/i);
    });

    it('prefers the configuration the buyer asked for', async () => {
      const wanted = await publish({
        price: 8_000_000,
        bedrooms: 3,
        neighborhoodId: gachibowli,
        title: 'Three bedrooms',
      });
      await publish({
        price: 8_000_000,
        bedrooms: 1,
        neighborhoodId: gachibowli,
        title: 'One bedroom',
      });

      await http()
        .put('/api/buyers/me/profile/purpose')
        .set(...bearer(buyer))
        .send({ purpose: BuyingPurpose.LIVE_IN, bedroomsWanted: 3 })
        .expect(200);
      await http()
        .put('/api/buyers/me/profile/budget')
        .set(...bearer(buyer))
        .send({ budgetMax: 9_000_000 })
        .expect(200);

      const response = await recommend().expect(200);
      expect(response.body.items[0].id).toBe(wanted);
    });

    /**
     * The same property should not rank identically for someone who will live
     * in it and someone who will let it out. An under-construction flat is a
     * reasonable home purchase and a poor immediate rental.
     */
    it('ranks by purpose, not only by price and place', async () => {
      const ready = await publish({
        price: 8_000_000,
        bedrooms: 3,
        neighborhoodId: gachibowli,
        possession: PossessionStatus.READY_TO_MOVE,
        title: 'Ready now',
      });
      await publish({
        price: 8_000_000,
        bedrooms: 3,
        neighborhoodId: gachibowli,
        possession: PossessionStatus.UNDER_CONSTRUCTION,
        title: 'Still being built',
      });

      await http()
        .put('/api/buyers/me/profile/purpose')
        .set(...bearer(buyer))
        .send({ purpose: BuyingPurpose.RENT_OUT })
        .expect(200);
      await http()
        .put('/api/buyers/me/profile/budget')
        .set(...bearer(buyer))
        .send({ budgetMax: 9_000_000 })
        .expect(200);

      const response = await recommend().expect(200);

      expect(response.body.items[0].id).toBe(ready);
      expect(response.body.items[0].reasons.join(' ')).toMatch(/let out/i);
    });

    it('gives every recommendation a reason', async () => {
      await publish({ price: 8_000_000, bedrooms: 3, neighborhoodId: gachibowli });

      await http()
        .put('/api/buyers/me/profile/budget')
        .set(...bearer(buyer))
        .send({ budgetMax: 9_000_000 })
        .expect(200);

      const response = await recommend().expect(200);

      for (const item of response.body.items) {
        expect(item.reasons.length).toBeGreaterThan(0);
        expect(item.matchScore).toBeGreaterThan(0);
      }
    });

    /** Unverified and unapproved listings must never reach a buyer, here either. */
    it('never recommends a listing that is not publicly visible', async () => {
      const id = await publish({ price: 8_000_000, bedrooms: 3, neighborhoodId: gachibowli });
      await db().listing.update({
        where: { id },
        data: { status: ListingStatus.SUSPENDED },
      });

      await http()
        .put('/api/buyers/me/profile/budget')
        .set(...bearer(buyer))
        .send({ budgetMax: 9_000_000 })
        .expect(200);

      const response = await recommend().expect(200);
      expect(response.body.items).toEqual([]);
    });
  });
});
