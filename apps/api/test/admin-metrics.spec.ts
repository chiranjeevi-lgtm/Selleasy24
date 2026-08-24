import {
  LeadStatus,
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
 * The operations dashboard.
 *
 * Two properties matter more than the arithmetic. First, nothing here may leak
 * an identity — a dashboard is aggregate reporting, not a back door to personal
 * data. Second, a figure drawn from too little data has to say so: a median
 * computed from two decisions read as a finding is worse than no median at all.
 */
describe('admin metrics', () => {
  let officer: TestUser;
  let seller: TestUser;
  let buyer: TestUser;
  let neighborhoodId: string;

  const HOUR = 3_600_000;

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
    seller = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
    buyer = await createUser({ role: Role.BUYER });
  });

  const fetchMetrics = (days?: number) =>
    http()
      .get(`/api/admin/metrics${days ? `?days=${days}` : ''}`)
      .set(...bearer(officer));

  async function makeListing(
    overrides: {
      status?: ListingStatus;
      submittedAt?: Date;
      soldAt?: Date;
      soldPrice?: number;
      soldThroughPlatform?: boolean;
      price?: number;
    } = {},
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

    const status = overrides.status ?? ListingStatus.APPROVED;

    const listing = await db().listing.create({
      data: {
        propertyId: property.id,
        sellerId: seller.id,
        title: 'A flat used by the metrics tests',
        description:
          'Long enough to satisfy the fifty character minimum the create endpoint enforces.',
        price: overrides.price ?? 9_500_000,
        status,
        isVerified: status === ListingStatus.APPROVED,
        firstListedAt: status === ListingStatus.APPROVED ? new Date() : null,
        submittedAt: overrides.submittedAt ?? null,
        soldAt: overrides.soldAt ?? null,
        soldPrice: overrides.soldPrice ?? null,
        soldThroughPlatform: overrides.soldThroughPlatform ?? null,
      },
      select: { id: true },
    });

    return listing.id;
  }

  /** A recorded decision, with a chosen wait between submission and verdict. */
  async function recordDecision(
    waitHours: number,
    // Annotated rather than inferred: a default of `APPROVED` narrows the
    // parameter to that one literal and rejects every other decision.
    decision: VerificationDecision = VerificationDecision.APPROVED,
  ) {
    const submittedAt = new Date(Date.now() - waitHours * HOUR);
    const listingId = await makeListing({ submittedAt });

    await db().verification.create({
      data: {
        listingId,
        verifierId: officer.id,
        decision,
        createdAt: new Date(),
        checks: {
          create: [{ kind: VerificationCheckKind.OWNER_NAME_MATCHES_DEED, passed: true }],
        },
      },
    });

    return listingId;
  }

  // -------------------------------------------------------------------------

  describe('access', () => {
    it('is open to anyone who works the queue', async () => {
      await fetchMetrics().expect(200);

      for (const role of [Role.MODERATOR, Role.ADMIN, Role.SUPER_ADMIN]) {
        const staff = await createUser({ role });
        await http()
          .get('/api/admin/metrics')
          .set(...bearer(staff))
          .expect(200);
      }
    });

    it('refuses a seller, a buyer and a stranger', async () => {
      await http()
        .get('/api/admin/metrics')
        .set(...bearer(seller))
        .expect(403);

      await http()
        .get('/api/admin/metrics')
        .set(...bearer(buyer))
        .expect(403);

      await http().get('/api/admin/metrics').expect(401);
    });

    /**
     * A dashboard is aggregate reporting, not a route to personal data. It
     * should be safe to leave open on a screen in an office.
     */
    it('never returns an identity', async () => {
      await makeListing();
      await db().lead.create({
        data: {
          listingId: await makeListing(),
          name: 'Rahul Verma',
          phone: '+919876543210',
          email: 'rahul@example.test',
        },
      });

      const response = await fetchMetrics().expect(200);
      const body = JSON.stringify(response.body);

      expect(body).not.toMatch(/Rahul Verma/);
      expect(body).not.toMatch(/\+9198765/);
      expect(body).not.toMatch(/rahul@example/);
      expect(body).not.toMatch(/Vittal Rao Nagar/);
      expect(body).not.toMatch(/@selleasy24\.test/);
    });
  });

  // -------------------------------------------------------------------------

  describe('verification health', () => {
    it('counts what is waiting and what has breached', async () => {
      await makeListing({
        status: ListingStatus.PENDING_REVIEW,
        submittedAt: new Date(Date.now() - 40 * HOUR),
      });
      await makeListing({
        status: ListingStatus.PENDING_REVIEW,
        submittedAt: new Date(Date.now() - 2 * HOUR),
      });

      const response = await fetchMetrics().expect(200);
      const { verification } = response.body;

      expect(verification.pendingListings).toBe(2);
      expect(verification.overdue).toBe(1);
    });

    it('reports the median and the slow tail separately', async () => {
      // A tight cluster plus one that took days — the median stays inside the
      // SLA while p90 does not, which is exactly the case worth surfacing.
      for (const hours of [1, 2, 2, 3, 3, 4, 5, 72]) {
        await recordDecision(hours);
      }

      const response = await fetchMetrics().expect(200);
      const { verification } = response.body;

      expect(verification.timedSample).toBe(8);
      expect(verification.medianHoursToDecision).toBeLessThan(24);
      expect(verification.p90HoursToDecision).toBeGreaterThan(24);
      expect(verification.withinSlaPercent).toBeCloseTo(87.5, 1);
    });

    it('splits decisions by outcome', async () => {
      await recordDecision(2, VerificationDecision.APPROVED);
      await recordDecision(3, VerificationDecision.REJECTED);
      await recordDecision(4, VerificationDecision.REVISION_REQUESTED);

      const response = await fetchMetrics().expect(200);
      const { decided } = response.body.verification;

      expect(decided).toMatchObject({
        total: 3,
        approved: 1,
        rejected: 1,
        revisionRequested: 1,
      });
    });

    /**
     * Null rather than zero. "0 hours to decision" because nothing has been
     * decided reads as an instant queue, which is the opposite of the truth.
     */
    it('reports no median at all rather than zero when nothing was decided', async () => {
      const response = await fetchMetrics().expect(200);
      const { verification } = response.body;

      expect(verification.medianHoursToDecision).toBeNull();
      expect(verification.p90HoursToDecision).toBeNull();
      expect(verification.withinSlaPercent).toBeNull();
      expect(verification.timedSample).toBe(0);
    });

    /** So the client can mark a figure drawn from too little as unreliable. */
    it('carries the sample every timing was drawn from', async () => {
      await recordDecision(3);

      const response = await fetchMetrics().expect(200);
      expect(response.body.verification.timedSample).toBe(1);
      expect(response.body.minConfidentSample).toBeGreaterThan(1);
    });
  });

  // -------------------------------------------------------------------------

  describe('the funnel', () => {
    it('counts each step and the rate between them', async () => {
      const listingId = await makeListing();

      await db().listingView.createMany({
        data: [0, 1, 2, 3].map((n) => ({
          listingId,
          sessionHash: `metrics-test-${n}`,
          viewedOn: new Date(),
        })),
      });
      await db().savedListing.create({ data: { userId: buyer.id, listingId } });
      await db().lead.create({
        data: { listingId, name: 'A buyer', phone: '+919000000000' },
      });

      const response = await fetchMetrics().expect(200);
      const { funnel } = response.body;

      expect(funnel.views).toBe(4);
      expect(funnel.shortlists).toBe(1);
      expect(funnel.enquiries).toBe(1);
      expect(funnel.shortlistRate).toBe(25);
      expect(funnel.enquiryRate).toBe(100);
    });

    it('reports no rate rather than zero when the step above is empty', async () => {
      const response = await fetchMetrics().expect(200);
      expect(response.body.funnel.shortlistRate).toBeNull();
      expect(response.body.funnel.enquiryRate).toBeNull();
    });
  });

  // -------------------------------------------------------------------------

  describe('enquiry health', () => {
    it('surfaces enquiries nobody has answered', async () => {
      const listingId = await makeListing();

      await db().lead.create({
        data: {
          listingId,
          name: 'Waiting three days',
          phone: '+919000000001',
          status: LeadStatus.NEW,
          createdAt: new Date(Date.now() - 72 * HOUR),
        },
      });
      await db().lead.create({
        data: {
          listingId,
          name: 'Only just arrived',
          phone: '+919000000002',
          status: LeadStatus.NEW,
        },
      });

      const response = await fetchMetrics().expect(200);
      expect(response.body.leads.unansweredOver48h).toBe(1);
    });

    it('measures how long sellers take to reply', async () => {
      const listingId = await makeListing();

      for (const hours of [2, 4, 6]) {
        await db().lead.create({
          data: {
            listingId,
            name: 'Answered',
            phone: '+919000000003',
            status: LeadStatus.CONTACTED,
            createdAt: new Date(Date.now() - (hours + 1) * HOUR),
            contactedAt: new Date(Date.now() - 1 * HOUR),
          },
        });
      }

      const response = await fetchMetrics().expect(200);
      expect(response.body.leads.respondedSample).toBe(3);
      expect(response.body.leads.medianResponseHours).toBeCloseTo(4, 1);
    });
  });

  // -------------------------------------------------------------------------

  describe('sales attribution', () => {
    /**
     * The figure to trust, and the reason it is computed over those who
     * answered rather than over all sales — dividing by sales the seller
     * skipped would understate the platform's contribution.
     */
    it('counts attribution among sellers who answered', async () => {
      const soldAt = new Date();
      await makeListing({ status: ListingStatus.SOLD, soldAt, soldThroughPlatform: true });
      await makeListing({ status: ListingStatus.SOLD, soldAt, soldThroughPlatform: true });
      await makeListing({ status: ListingStatus.SOLD, soldAt, soldThroughPlatform: false });
      // Sold, but the seller did not say where the buyer came from.
      await makeListing({ status: ListingStatus.SOLD, soldAt });

      const response = await fetchMetrics().expect(200);
      const { sales } = response.body;

      expect(sales.sold).toBe(4);
      expect(sales.throughPlatform).toBe(2);
      expect(sales.notThroughPlatform).toBe(1);
      expect(sales.notAnswered).toBe(1);
      // Two of the three who answered, not two of four.
      expect(sales.attributedPercent).toBeCloseTo(66.7, 1);
    });

    it('measures how far sales land from the asking price', async () => {
      const soldAt = new Date();
      await makeListing({
        status: ListingStatus.SOLD,
        soldAt,
        price: 10_000_000,
        soldPrice: 9_000_000,
      });

      const response = await fetchMetrics().expect(200);
      expect(response.body.sales.medianPriceGapPercent).toBeCloseTo(-10, 1);
      expect(response.body.sales.priceDisclosed).toBe(1);
    });

    it('ignores sales where the price was withheld', async () => {
      await makeListing({ status: ListingStatus.SOLD, soldAt: new Date() });

      const response = await fetchMetrics().expect(200);
      expect(response.body.sales.priceDisclosed).toBe(0);
      expect(response.body.sales.medianPriceGapPercent).toBeNull();
    });
  });

  // -------------------------------------------------------------------------

  describe('growth', () => {
    it('splits registrations by role', async () => {
      await createUser({ role: Role.BUILDER });

      const response = await fetchMetrics().expect(200);
      const { registrations } = response.body.growth;

      // The fixtures created above, plus the builder.
      expect(registrations.buyers).toBeGreaterThanOrEqual(1);
      expect(registrations.builders).toBe(1);
      expect(registrations.owners).toBe(1);
    });

    /**
     * Every day in the window, including the empty ones. A chart drawn only
     * from days that had activity compresses the quiet stretches and makes a
     * flat fortnight look busy.
     */
    it('emits one row per day, quiet days included', async () => {
      const response = await fetchMetrics(14).expect(200);
      const { daily } = response.body.growth;

      expect(daily).toHaveLength(14);
      expect(daily.some((row: { registrations: number }) => row.registrations === 0)).toBe(true);

      const dates = daily.map((row: { date: string }) => row.date);
      expect([...dates].sort()).toEqual(dates);
    });

    it('rejects a window that is too short to compute a rate from', async () => {
      await http()
        .get('/api/admin/metrics?days=1')
        .set(...bearer(officer))
        .expect(400);
    });

    it('rejects an unbounded window', async () => {
      await http()
        .get('/api/admin/metrics?days=100000')
        .set(...bearer(officer))
        .expect(400);
    });
  });

  // -------------------------------------------------------------------------

  describe('inventory', () => {
    it('counts each listing state separately', async () => {
      await makeListing({ status: ListingStatus.APPROVED });
      await makeListing({ status: ListingStatus.PAUSED });
      await makeListing({ status: ListingStatus.SOLD, soldAt: new Date() });
      await makeListing({ status: ListingStatus.DRAFT });

      const response = await fetchMetrics().expect(200);
      const { inventory } = response.body;

      expect(inventory.liveListings).toBe(1);
      expect(inventory.pausedListings).toBe(1);
      expect(inventory.soldListings).toBe(1);
      expect(inventory.draftListings).toBe(1);
    });
  });
});
