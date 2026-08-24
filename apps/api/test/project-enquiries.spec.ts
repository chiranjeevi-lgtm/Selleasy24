import { LeadStatus, ProjectStage, ProjectStatus, Role } from '@kamala/db';

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
 * Buyers contacting builders.
 *
 * Until this existed a builder could list a development, pass verification and
 * collect views with no way for anyone to express interest — and the enquiry
 * count on their dashboard was a permanent zero.
 *
 * The privacy rule is the same one that governs resale enquiries and is the
 * platform's core promise made operational: a buyer's number reaches exactly
 * one seller, in one place, behind authentication.
 */
describe('project enquiries', () => {
  let builder: TestUser;
  let buyer: TestUser;
  let neighborhoodId: string;
  let projectId: string;
  let threeBhkId: string;

  beforeAll(async () => {
    await startApp();
  });

  afterAll(async () => {
    await stopApp();
  });

  beforeEach(async () => {
    await truncateAll();
    neighborhoodId = (await createNeighborhood()).id;
    builder = await createUser({ role: Role.BUILDER });
    buyer = await createUser({ role: Role.BUYER });

    const project = await db().project.create({
      data: {
        builderId: builder.id,
        neighborhoodId,
        name: 'Aurum Heights',
        description: 'A project used by the enquiry tests, long enough to be valid.',
        address: 'Survey 118, Kokapet',
        pincode: '500075',
        stage: ProjectStage.UNDER_CONSTRUCTION,
        possessionDate: new Date(Date.now() + 400 * 86_400_000),
        reraNumber: 'P02400004567',
        status: ProjectStatus.APPROVED,
        isVerified: true,
        firstListedAt: new Date(),
      },
      select: { id: true },
    });
    projectId = project.id;

    const unit = await db().projectUnit.create({
      data: {
        projectId,
        bedrooms: 3,
        bathrooms: 3,
        areaSqft: 1650,
        priceFrom: 14_200_000,
      },
      select: { id: true },
    });
    threeBhkId = unit.id;
  });

  const enquire = (user: TestUser, body: Record<string, unknown>) =>
    http()
      .post(`/api/projects/${projectId}/enquiries`)
      .set(...bearer(user))
      .send(body);

  // -------------------------------------------------------------------------

  describe('sending one', () => {
    it('records the enquiry against the project', async () => {
      const response = await enquire(buyer, {
        name: 'Rahul Verma',
        phone: '+919876543210',
        message: 'When is possession?',
      }).expect(201);

      expect(response.body.submitted).toBe(true);

      const lead = await db().lead.findUniqueOrThrow({ where: { id: response.body.id } });
      expect(lead.projectId).toBe(projectId);
      // A lead carries exactly one target.
      expect(lead.listingId).toBeNull();
      expect(lead.buyerId).toBe(buyer.id);
      expect(lead.status).toBe(LeadStatus.NEW);
    });

    /** The figure that sat on the builder's dashboard as a permanent zero. */
    it('increments the count the builder sees', async () => {
      const before = await db().project.findUniqueOrThrow({ where: { id: projectId } });
      expect(before.leadsCount).toBe(0);

      await enquire(buyer, { name: 'Rahul Verma', phone: '+919876543210' }).expect(201);

      const after = await db().project.findUniqueOrThrow({ where: { id: projectId } });
      expect(after.leadsCount).toBe(1);
    });

    it('records which configuration they asked about', async () => {
      const response = await enquire(buyer, {
        name: 'Rahul Verma',
        phone: '+919876543210',
        projectUnitId: threeBhkId,
      }).expect(201);

      const lead = await db().lead.findUniqueOrThrow({ where: { id: response.body.id } });
      expect(lead.projectUnitId).toBe(threeBhkId);
    });

    it('accepts an enquiry with no configuration named', async () => {
      const response = await enquire(buyer, {
        name: 'Rahul Verma',
        phone: '+919876543210',
      }).expect(201);

      const lead = await db().lead.findUniqueOrThrow({ where: { id: response.body.id } });
      expect(lead.projectUnitId).toBeNull();
    });

    /**
     * A unit from someone else's project would attach the enquiry to something
     * this builder never offered.
     */
    it('refuses a configuration belonging to another project', async () => {
      const otherBuilder = await createUser({ role: Role.BUILDER });
      const other = await db().project.create({
        data: {
          builderId: otherBuilder.id,
          neighborhoodId,
          name: 'Somewhere Else',
          description: 'A different project entirely, long enough to be valid.',
          address: 'Survey 9, Miyapur',
          pincode: '500049',
          stage: ProjectStage.UNDER_CONSTRUCTION,
          possessionDate: new Date(Date.now() + 400 * 86_400_000),
          reraNumber: 'P02400001111',
          status: ProjectStatus.APPROVED,
          isVerified: true,
        },
        select: { id: true },
      });
      const foreignUnit = await db().projectUnit.create({
        data: {
          projectId: other.id,
          bedrooms: 2,
          bathrooms: 2,
          areaSqft: 1100,
          priceFrom: 7_000_000,
        },
        select: { id: true },
      });

      await enquire(buyer, {
        name: 'Rahul Verma',
        phone: '+919876543210',
        projectUnitId: foreignUnit.id,
      }).expect(400);
    });

    it('requires an account', async () => {
      await http()
        .post(`/api/projects/${projectId}/enquiries`)
        .send({ name: 'Rahul Verma', phone: '+919876543210' })
        .expect(401);
    });

    it('refuses a bad phone number', async () => {
      await enquire(buyer, { name: 'Rahul Verma', phone: 'not-a-number' }).expect(400);
    });

    /** An unverified project is not public, so it cannot be enquired about. */
    it('refuses an enquiry on a project that is not live', async () => {
      await db().project.update({
        where: { id: projectId },
        data: { status: ProjectStatus.PENDING_REVIEW, isVerified: false },
      });

      await enquire(buyer, { name: 'Rahul Verma', phone: '+919876543210' }).expect(404);
    });
  });

  // -------------------------------------------------------------------------

  describe('the builder’s inbox', () => {
    it('shows the enquiry with the contact details and the configuration', async () => {
      await enquire(buyer, {
        name: 'Rahul Verma',
        phone: '+919876543210',
        projectUnitId: threeBhkId,
        message: 'When is possession?',
      }).expect(201);

      const response = await http()
        .get('/api/leads/mine')
        .set(...bearer(builder))
        .expect(200);

      expect(response.body).toHaveLength(1);
      const [lead] = response.body;
      expect(lead.name).toBe('Rahul Verma');
      expect(lead.phone).toBe('+919876543210');
      expect(lead.project.name).toBe('Aurum Heights');
      expect(lead.projectUnit.bedrooms).toBe(3);
      // Nothing about a resale listing, because this is not one.
      expect(lead.listing).toBeNull();
    });

    it('shows a builder nobody else’s enquiries', async () => {
      await enquire(buyer, { name: 'Rahul Verma', phone: '+919876543210' }).expect(201);

      const stranger = await createUser({ role: Role.BUILDER });
      const response = await http()
        .get('/api/leads/mine')
        .set(...bearer(stranger))
        .expect(200);

      expect(response.body).toHaveLength(0);
    });

    it('lets the builder move it through the pipeline', async () => {
      const created = await enquire(buyer, {
        name: 'Rahul Verma',
        phone: '+919876543210',
      }).expect(201);

      await http()
        .patch(`/api/leads/${created.body.id}/status`)
        .set(...bearer(builder))
        .send({ status: LeadStatus.CONTACTED })
        .expect(200);

      const lead = await db().lead.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(lead.status).toBe(LeadStatus.CONTACTED);
      // Stamped on the first move away from NEW, feeding the response-time
      // figure on the operations dashboard.
      expect(lead.contactedAt).not.toBeNull();
    });

    it('refuses to let another builder touch it', async () => {
      const created = await enquire(buyer, {
        name: 'Rahul Verma',
        phone: '+919876543210',
      }).expect(201);

      const stranger = await createUser({ role: Role.BUILDER });
      await http()
        .patch(`/api/leads/${created.body.id}/status`)
        .set(...bearer(stranger))
        .send({ status: LeadStatus.CONTACTED })
        .expect(404);
    });

    /**
     * One inbox for both kinds. A builder holding resale stock as well as a
     * project should not have to look in two places.
     */
    it('returns listing and project enquiries together', async () => {
      await enquire(buyer, { name: 'From the project', phone: '+919876543210' }).expect(201);

      // The same account, also selling one flat directly.
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
          sellerId: builder.id,
          title: 'A resale flat held by the same account',
          description:
            'Long enough to satisfy the fifty character minimum the create endpoint enforces.',
          price: 9_500_000,
          status: 'APPROVED',
          isVerified: true,
          firstListedAt: new Date(),
        },
        select: { id: true },
      });

      await http()
        .post(`/api/listings/${listing.id}/enquiries`)
        .set(...bearer(buyer))
        .send({ name: 'From the listing', phone: '+919876543211' })
        .expect(201);

      const response = await http()
        .get('/api/leads/mine')
        .set(...bearer(builder))
        .expect(200);

      expect(response.body).toHaveLength(2);
      const names = response.body.map((lead: { name: string }) => lead.name).sort();
      expect(names).toEqual(['From the listing', 'From the project']);
    });
  });

  // -------------------------------------------------------------------------

  describe('privacy', () => {
    /**
     * The platform's core promise made operational. "Data shared with brokers
     * within hours" is the single most common complaint about the incumbents.
     */
    it('never exposes the buyer’s number to anyone but the builder', async () => {
      await enquire(buyer, {
        name: 'Rahul Verma',
        phone: '+919876543210',
      }).expect(201);

      // Not on the public project page.
      const publicView = await http().get(`/api/projects/${projectId}`).expect(200);
      expect(JSON.stringify(publicView.body)).not.toMatch(/9876543210/);

      // Not to a buyer who happens to be signed in.
      const otherBuyer = await createUser({ role: Role.BUYER });
      await http()
        .get('/api/leads/mine')
        .set(...bearer(otherBuyer))
        .expect(403);
    });

    it('does not copy the buyer’s details into the audit trail', async () => {
      const created = await enquire(buyer, {
        name: 'Rahul Verma',
        phone: '+919876543210',
        message: 'Please call me back',
      }).expect(201);

      const entry = await db().auditLog.findFirstOrThrow({
        where: { entityType: 'lead', entityId: created.body.id },
      });

      const metadata = JSON.stringify(entry.metadata);
      expect(metadata).toMatch(projectId);
      // The name, number and message already live on the lead row; copying
      // them here would widen the exposure surface for no gain.
      expect(metadata).not.toMatch(/Rahul/);
      expect(metadata).not.toMatch(/9876543210/);
      expect(metadata).not.toMatch(/call me back/);
    });
  });
});
