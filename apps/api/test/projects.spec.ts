import {
  DocumentKind,
  ProjectStage,
  ProjectStatus,
  Role,
  SellerKind,
  VerificationCheckKind,
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
 * Builder projects (PRD Phase 1, builder role).
 *
 * A project differs from a resale listing in the ways that matter to a buyer:
 * there is no owner yet, the price is a range rather than a figure, and the
 * thing being sold may not exist. The rules tested here are the ones that keep
 * those differences honest.
 */
describe('builder projects', () => {
  let neighborhoodId: string;
  let builder: TestUser;
  let verifier: TestUser;

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
    builder = await createUser({ role: Role.BUILDER });
    verifier = await createUser({ role: Role.VERIFIER });
  });

  /** A project body that passes validation, overridable per test. */
  function projectBody(overrides: Record<string, unknown> = {}) {
    return {
      name: 'Aurum Heights',
      description:
        'A gated development of three towers off the Outer Ring Road, with a clubhouse and covered parking throughout.',
      address: 'Survey 118, Kokapet, Rangareddy',
      pincode: '500075',
      neighborhoodId,
      stage: ProjectStage.UNDER_CONSTRUCTION,
      possessionDate: inDays(400),
      reraNumber: 'P02400004567',
      totalTowers: 3,
      totalUnits: 240,
      landAreaAcres: 4.5,
      amenities: ['LIFT', 'POWER_BACKUP'],
      ...overrides,
    };
  }

  async function createProject(overrides: Record<string, unknown> = {}): Promise<string> {
    const response = await http()
      .post('/api/projects')
      .set(...bearer(builder))
      .send(projectBody(overrides))
      .expect(201);

    return response.body.id;
  }

  // -------------------------------------------------------------------------

  describe('creating', () => {
    it('creates a draft that is not publicly visible', async () => {
      const id = await createProject();

      const stored = await db().project.findUniqueOrThrow({ where: { id } });
      expect(stored.status).toBe(ProjectStatus.DRAFT);
      expect(stored.isVerified).toBe(false);
      // Never set at creation — it is the honest "launched N days ago" anchor.
      expect(stored.firstListedAt).toBeNull();

      await http().get(`/api/projects/${id}`).expect(404);
    });

    it('refuses an unfinished project with no expected possession date', async () => {
      const response = await http()
        .post('/api/projects')
        .set(...bearer(builder))
        .send({ ...projectBody(), possessionDate: undefined })
        .expect(400);

      expect(JSON.stringify(response.body)).toMatch(/possession/i);
    });

    it('refuses a handover date on a project that is not delivered', async () => {
      await http()
        .post('/api/projects')
        .set(...bearer(builder))
        .send(projectBody({ deliveredOn: new Date(Date.now() - 86_400_000).toISOString() }))
        .expect(400);
    });

    it('refuses a handover date in the future', async () => {
      await http()
        .post('/api/projects')
        .set(...bearer(builder))
        .send(
          projectBody({
            stage: ProjectStage.DELIVERED,
            deliveredOn: inDays(30),
          }),
        )
        .expect(400);
    });

    it('accepts a delivered project with a past handover date', async () => {
      await http()
        .post('/api/projects')
        .set(...bearer(builder))
        .send(
          projectBody({
            stage: ProjectStage.DELIVERED,
            deliveredOn: new Date(Date.now() - 200 * 86_400_000).toISOString(),
            possessionDate: undefined,
          }),
        )
        .expect(201);
    });

    it('refuses a project without a RERA number', async () => {
      await http()
        .post('/api/projects')
        .set(...bearer(builder))
        .send({ ...projectBody(), reraNumber: undefined })
        .expect(400);
    });

    it('refuses a locality that does not exist', async () => {
      await http()
        .post('/api/projects')
        .set(...bearer(builder))
        .send(projectBody({ neighborhoodId: '00000000-0000-4000-8000-000000000000' }))
        .expect(400);
    });
  });

  // -------------------------------------------------------------------------

  describe('authorization', () => {
    it('refuses a seller access to the builder endpoints', async () => {
      const seller = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });

      await http()
        .get('/api/projects/mine')
        .set(...bearer(seller))
        .expect(403);

      await http()
        .post('/api/projects')
        .set(...bearer(seller))
        .send(projectBody())
        .expect(403);
    });

    it('refuses an unauthenticated caller', async () => {
      await http().get('/api/projects/mine').expect(401);
    });

    /**
     * 404 rather than 403 for another builder's project. A distinct "forbidden"
     * would confirm the id exists, letting a builder enumerate a competitor's
     * portfolio one guess at a time.
     */
    it('hides another builder’s project behind a 404', async () => {
      const id = await createProject();
      const other = await createUser({ role: Role.BUILDER });

      await http()
        .get(`/api/projects/mine/${id}`)
        .set(...bearer(other))
        .expect(404);

      await http()
        .patch(`/api/projects/${id}`)
        .set(...bearer(other))
        .send({ name: 'Renamed by a stranger' })
        .expect(404);
    });
  });

  // -------------------------------------------------------------------------

  describe('units', () => {
    it('replaces the whole configuration set', async () => {
      const id = await createProject();

      await http()
        .put(`/api/projects/${id}/units`)
        .set(...bearer(builder))
        .send({
          units: [
            { bedrooms: 2, bathrooms: 2, areaSqft: 1180, priceFrom: 8_900_000 },
            { bedrooms: 3, bathrooms: 3, areaSqft: 1650, priceFrom: 14_200_000 },
          ],
        })
        .expect(200);

      const second = await http()
        .put(`/api/projects/${id}/units`)
        .set(...bearer(builder))
        .send({ units: [{ bedrooms: 3, bathrooms: 3, areaSqft: 1650, priceFrom: 14_900_000 }] })
        .expect(200);

      // Replaced, not appended.
      expect(second.body).toHaveLength(1);
      expect(Number(second.body[0].priceFrom)).toBe(14_900_000);
    });

    it('refuses two configurations describing the same thing', async () => {
      const id = await createProject();

      await http()
        .put(`/api/projects/${id}/units`)
        .set(...bearer(builder))
        .send({
          units: [
            { bedrooms: 3, bathrooms: 3, areaSqft: 1650, priceFrom: 14_200_000 },
            { bedrooms: 3, bathrooms: 2, areaSqft: 1650, priceFrom: 15_000_000 },
          ],
        })
        .expect(400);
    });

    it('refuses carpet area larger than built-up area', async () => {
      const id = await createProject();

      await http()
        .put(`/api/projects/${id}/units`)
        .set(...bearer(builder))
        .send({
          units: [
            {
              bedrooms: 3,
              bathrooms: 3,
              areaSqft: 1650,
              carpetAreaSqft: 1700,
              priceFrom: 14_200_000,
            },
          ],
        })
        .expect(400);
    });

    it('refuses more available units than exist', async () => {
      const id = await createProject();

      await http()
        .put(`/api/projects/${id}/units`)
        .set(...bearer(builder))
        .send({
          units: [
            {
              bedrooms: 3,
              bathrooms: 3,
              areaSqft: 1650,
              priceFrom: 14_200_000,
              totalUnits: 40,
              availableUnits: 45,
            },
          ],
        })
        .expect(400);
    });
  });

  // -------------------------------------------------------------------------

  describe('submission', () => {
    /** Gets a project to the point where only documents are missing. */
    async function readyToSubmit(overrides: Record<string, unknown> = {}): Promise<string> {
      const id = await createProject(overrides);

      await http()
        .put(`/api/projects/${id}/units`)
        .set(...bearer(builder))
        .send({ units: [{ bedrooms: 3, bathrooms: 3, areaSqft: 1650, priceFrom: 14_200_000 }] })
        .expect(200);

      // Photos and documents are file uploads; created directly so this suite
      // tests the submission gate rather than re-testing upload validation,
      // which photos.spec.ts and documents.spec.ts already cover.
      await db().projectPhoto.createMany({
        data: [0, 1, 2].map((sortOrder) => ({
          projectId: id,
          storageKey: `projects/${id}/photos/test-${sortOrder}.jpg`,
          sortOrder,
        })),
      });

      return id;
    }

    async function addDocument(projectId: string, kind: DocumentKind): Promise<void> {
      await db().projectDocument.create({
        data: {
          projectId,
          uploadedById: builder.id,
          kind,
          storageKey: `projects/${projectId}/documents/${kind}.enc`,
          originalFilename: `${kind}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 2048,
          encryptionIv: 'test-iv',
          encryptionTag: 'test-tag',
        },
      });
    }

    it('refuses to submit without the RERA certificate and sanctioned plan', async () => {
      const id = await readyToSubmit();

      const response = await http()
        .post(`/api/projects/${id}/submit`)
        .set(...bearer(builder))
        .expect(400);

      expect(JSON.stringify(response.body)).toMatch(/RERA/i);
    });

    it('refuses to submit without unit configurations', async () => {
      const id = await createProject();
      await db().projectPhoto.createMany({
        data: [0, 1, 2].map((sortOrder) => ({
          projectId: id,
          storageKey: `projects/${id}/photos/test-${sortOrder}.jpg`,
          sortOrder,
        })),
      });
      await addDocument(id, DocumentKind.RERA_CERTIFICATE);
      await addDocument(id, DocumentKind.APPROVED_PLAN);

      const response = await http()
        .post(`/api/projects/${id}/submit`)
        .set(...bearer(builder))
        .expect(400);

      expect(JSON.stringify(response.body)).toMatch(/configuration/i);
    });

    it('refuses to submit with fewer than three photos', async () => {
      const id = await createProject();
      await http()
        .put(`/api/projects/${id}/units`)
        .set(...bearer(builder))
        .send({ units: [{ bedrooms: 3, bathrooms: 3, areaSqft: 1650, priceFrom: 14_200_000 }] })
        .expect(200);
      await addDocument(id, DocumentKind.RERA_CERTIFICATE);
      await addDocument(id, DocumentKind.APPROVED_PLAN);

      await http()
        .post(`/api/projects/${id}/submit`)
        .set(...bearer(builder))
        .expect(400);
    });

    it('submits once everything required is present', async () => {
      const id = await readyToSubmit();
      await addDocument(id, DocumentKind.RERA_CERTIFICATE);
      await addDocument(id, DocumentKind.APPROVED_PLAN);

      await http()
        .post(`/api/projects/${id}/submit`)
        .set(...bearer(builder))
        .expect(200);

      const stored = await db().project.findUniqueOrThrow({ where: { id } });
      expect(stored.status).toBe(ProjectStatus.PENDING_REVIEW);
      expect(stored.submittedAt).not.toBeNull();
    });

    /**
     * An occupancy certificate is what makes "ready to move" true. Without this
     * rule a builder could advertise possession they cannot legally offer.
     */
    it('demands an occupancy certificate once the project claims to be finished', async () => {
      const id = await readyToSubmit({
        stage: ProjectStage.READY_TO_MOVE,
        possessionDate: undefined,
      });
      await addDocument(id, DocumentKind.RERA_CERTIFICATE);
      await addDocument(id, DocumentKind.APPROVED_PLAN);

      const response = await http()
        .post(`/api/projects/${id}/submit`)
        .set(...bearer(builder))
        .expect(400);

      expect(JSON.stringify(response.body)).toMatch(/occupancy/i);

      await addDocument(id, DocumentKind.OCCUPANCY_CERTIFICATE);

      await http()
        .post(`/api/projects/${id}/submit`)
        .set(...bearer(builder))
        .expect(200);
    });

    it('refuses to submit without a verified phone number', async () => {
      const unverified = await createUser({ role: Role.BUILDER, phoneVerified: false });

      const created = await http()
        .post('/api/projects')
        .set(...bearer(unverified))
        .send(projectBody())
        .expect(201);

      const id = created.body.id;
      await http()
        .put(`/api/projects/${id}/units`)
        .set(...bearer(unverified))
        .send({ units: [{ bedrooms: 3, bathrooms: 3, areaSqft: 1650, priceFrom: 14_200_000 }] })
        .expect(200);
      await db().projectPhoto.createMany({
        data: [0, 1, 2].map((sortOrder) => ({
          projectId: id,
          storageKey: `projects/${id}/photos/test-${sortOrder}.jpg`,
          sortOrder,
        })),
      });
      await db().projectDocument.createMany({
        data: [DocumentKind.RERA_CERTIFICATE, DocumentKind.APPROVED_PLAN].map((kind) => ({
          projectId: id,
          uploadedById: unverified.id,
          kind,
          storageKey: `projects/${id}/documents/${kind}.enc`,
          originalFilename: `${kind}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 2048,
          encryptionIv: 'test-iv',
          encryptionTag: 'test-tag',
        })),
      });

      const response = await http()
        .post(`/api/projects/${id}/submit`)
        .set(...bearer(unverified))
        .expect(400);

      expect(JSON.stringify(response.body)).toMatch(/phone/i);
    });

    it('refuses edits while awaiting review', async () => {
      const id = await readyToSubmit();
      await addDocument(id, DocumentKind.RERA_CERTIFICATE);
      await addDocument(id, DocumentKind.APPROVED_PLAN);
      await http()
        .post(`/api/projects/${id}/submit`)
        .set(...bearer(builder))
        .expect(200);

      await http()
        .patch(`/api/projects/${id}`)
        .set(...bearer(builder))
        .send({ name: 'Changed while under review' })
        .expect(403);
    });
  });

  // -------------------------------------------------------------------------

  describe('verification', () => {
    /** A project sitting in the review queue. */
    async function pending(stage: ProjectStage = ProjectStage.UNDER_CONSTRUCTION): Promise<string> {
      const project = await db().project.create({
        data: {
          builderId: builder.id,
          neighborhoodId,
          name: 'Aurum Heights',
          description: 'A project used by the verification tests, long enough to be valid.',
          address: 'Survey 118, Kokapet',
          pincode: '500075',
          stage,
          possessionDate: new Date(Date.now() + 400 * 86_400_000),
          reraNumber: 'P02400004567',
          status: ProjectStatus.PENDING_REVIEW,
          submittedAt: new Date(),
        },
        select: { id: true },
      });

      await db().projectUnit.create({
        data: {
          projectId: project.id,
          bedrooms: 3,
          bathrooms: 3,
          areaSqft: 1650,
          priceFrom: 14_200_000,
        },
      });

      return project.id;
    }

    const passing = (kinds: VerificationCheckKind[]) =>
      kinds.map((kind) => ({ kind, passed: true }));

    const BASE_CHECKS = [
      VerificationCheckKind.PROJECT_RERA_VALID,
      VerificationCheckKind.PROJECT_PLAN_SANCTIONED,
      VerificationCheckKind.PROJECT_LAND_TITLE_CLEAR,
    ];

    it('lists pending projects in its own queue, oldest first', async () => {
      await pending();

      const response = await http()
        .get('/api/verification/projects/queue')
        .set(...bearer(verifier))
        .expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.items[0].name).toBe('Aurum Heights');
    });

    it('tells the officer which checks this stage requires', async () => {
      const id = await pending(ProjectStage.READY_TO_MOVE);

      const response = await http()
        .get(`/api/verification/projects/${id}`)
        .set(...bearer(verifier))
        .expect(200);

      expect(response.body.requiredChecks).toContain(
        VerificationCheckKind.PROJECT_OCCUPANCY_CERTIFICATE,
      );
    });

    it('refuses approval with a mandatory check missing', async () => {
      const id = await pending();

      const response = await http()
        .post(`/api/verification/projects/${id}/decide`)
        .set(...bearer(verifier))
        .send({
          decision: 'APPROVED',
          checks: passing([VerificationCheckKind.PROJECT_RERA_VALID]),
        })
        .expect(400);

      expect(JSON.stringify(response.body)).toMatch(/sanctioned|title/i);
    });

    it('refuses approval when a mandatory check did not pass', async () => {
      const id = await pending();

      await http()
        .post(`/api/verification/projects/${id}/decide`)
        .set(...bearer(verifier))
        .send({
          decision: 'APPROVED',
          checks: [
            ...passing([
              VerificationCheckKind.PROJECT_PLAN_SANCTIONED,
              VerificationCheckKind.PROJECT_LAND_TITLE_CLEAR,
              VerificationCheckKind.PROJECT_COMMENCEMENT_CERTIFICATE,
            ]),
            { kind: VerificationCheckKind.PROJECT_RERA_VALID, passed: false },
          ],
        })
        .expect(400);
    });

    /**
     * The stage rule in the direction that protects a buyer: a project claiming
     * to be ready to move in cannot be approved on the under-construction check
     * set alone.
     */
    it('demands the occupancy check on a ready-to-move project', async () => {
      const id = await pending(ProjectStage.READY_TO_MOVE);

      const response = await http()
        .post(`/api/verification/projects/${id}/decide`)
        .set(...bearer(verifier))
        .send({
          decision: 'APPROVED',
          checks: passing([
            ...BASE_CHECKS,
            VerificationCheckKind.PROJECT_COMMENCEMENT_CERTIFICATE,
          ]),
        })
        .expect(400);

      expect(JSON.stringify(response.body)).toMatch(/occupancy/i);
    });

    it('approves and publishes when every required check passes', async () => {
      const id = await pending();

      await http()
        .post(`/api/verification/projects/${id}/decide`)
        .set(...bearer(verifier))
        .send({
          decision: 'APPROVED',
          checks: passing([
            ...BASE_CHECKS,
            VerificationCheckKind.PROJECT_COMMENCEMENT_CERTIFICATE,
          ]),
        })
        .expect(200);

      const stored = await db().project.findUniqueOrThrow({ where: { id } });
      expect(stored.status).toBe(ProjectStatus.APPROVED);
      expect(stored.isVerified).toBe(true);
      expect(stored.firstListedAt).not.toBeNull();

      // And it is now publicly visible.
      await http().get(`/api/projects/${id}`).expect(200);
    });

    /**
     * Separation of duties. Staff can also hold a builder account, and
     * self-approval would void the one thing buyers are asked to rely on.
     */
    it('refuses to let a verifier approve their own project', async () => {
      const staffBuilder = await createUser({ role: Role.VERIFIER });

      const project = await db().project.create({
        data: {
          builderId: staffBuilder.id,
          neighborhoodId,
          name: 'Conflict of Interest Towers',
          description: 'A project owned by the same person who would review it.',
          address: 'Survey 1, Kokapet',
          pincode: '500075',
          stage: ProjectStage.UNDER_CONSTRUCTION,
          possessionDate: new Date(Date.now() + 400 * 86_400_000),
          reraNumber: 'P02400009999',
          status: ProjectStatus.PENDING_REVIEW,
          submittedAt: new Date(),
        },
        select: { id: true },
      });

      await http()
        .post(`/api/verification/projects/${project.id}/decide`)
        .set(...bearer(staffBuilder))
        .send({
          decision: 'APPROVED',
          checks: passing([
            ...BASE_CHECKS,
            VerificationCheckKind.PROJECT_COMMENCEMENT_CERTIFICATE,
          ]),
        })
        .expect(403);
    });

    it('requires a reason to reject, and returns it to the builder', async () => {
      const id = await pending();

      await http()
        .post(`/api/verification/projects/${id}/decide`)
        .set(...bearer(verifier))
        .send({ decision: 'REJECTED' })
        .expect(400);

      await http()
        .post(`/api/verification/projects/${id}/decide`)
        .set(...bearer(verifier))
        .send({
          decision: 'REJECTED',
          reason: 'The RERA registration number does not match the register.',
        })
        .expect(200);

      const mine = await http()
        .get(`/api/projects/mine/${id}`)
        .set(...bearer(builder))
        .expect(200);

      expect(mine.body.status).toBe(ProjectStatus.REJECTED);
      expect(mine.body.rejectionReason).toMatch(/does not match/);
    });

    /**
     * firstListedAt is set once and never again, so a project re-approved after
     * an edit does not appear newly launched — the specific behaviour incumbents
     * break by re-posting stale inventory as new.
     */
    it('keeps the original launch date across a re-approval', async () => {
      const id = await pending();
      const checks = passing([
        ...BASE_CHECKS,
        VerificationCheckKind.PROJECT_COMMENCEMENT_CERTIFICATE,
      ]);

      await http()
        .post(`/api/verification/projects/${id}/decide`)
        .set(...bearer(verifier))
        .send({ decision: 'APPROVED', checks })
        .expect(200);

      const first = await db().project.findUniqueOrThrow({ where: { id } });

      await db().project.update({
        where: { id },
        data: { status: ProjectStatus.PENDING_REVIEW, submittedAt: new Date() },
      });

      await http()
        .post(`/api/verification/projects/${id}/decide`)
        .set(...bearer(verifier))
        .send({ decision: 'APPROVED', checks })
        .expect(200);

      const second = await db().project.findUniqueOrThrow({ where: { id } });
      expect(second.firstListedAt).toEqual(first.firstListedAt);
    });

    it('publishes the checklist publicly, with no login', async () => {
      const id = await pending();

      await http()
        .post(`/api/verification/projects/${id}/decide`)
        .set(...bearer(verifier))
        .send({
          decision: 'APPROVED',
          checks: passing([
            ...BASE_CHECKS,
            VerificationCheckKind.PROJECT_COMMENCEMENT_CERTIFICATE,
          ]),
        })
        .expect(200);

      const response = await http()
        .get(`/api/verification/projects/public/${id}`)
        .expect(200);

      expect(response.body.reraNumber).toBe('P02400004567');
      expect(response.body.checks).toHaveLength(4);
      // Each check carries a label written for a buyer, not a staff shorthand.
      expect(response.body.checks[0].label).toMatch(/[a-z]{4}/i);
      // Never who reviewed it, and never the internal commentary.
      expect(response.body.verifierId).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toMatch(/internalNotes/);
    });

    it('refuses a builder access to the verification queue', async () => {
      await http()
        .get('/api/verification/projects/queue')
        .set(...bearer(builder))
        .expect(403);
    });
  });

  // -------------------------------------------------------------------------

  describe('public visibility', () => {
    async function approvedProject(
      overrides: Record<string, unknown> = {},
    ): Promise<string> {
      const project = await db().project.create({
        data: {
          builderId: builder.id,
          neighborhoodId,
          name: 'Aurum Heights',
          description: 'A published project used by the public search tests.',
          address: 'Survey 118, Kokapet',
          pincode: '500075',
          stage: ProjectStage.UNDER_CONSTRUCTION,
          possessionDate: new Date(Date.now() + 400 * 86_400_000),
          reraNumber: 'P02400004567',
          status: ProjectStatus.APPROVED,
          isVerified: true,
          firstListedAt: new Date(),
          ...overrides,
        },
        select: { id: true },
      });

      await db().projectUnit.createMany({
        data: [
          {
            projectId: project.id,
            bedrooms: 2,
            bathrooms: 2,
            areaSqft: 1180,
            priceFrom: 8_900_000,
          },
          {
            projectId: project.id,
            bedrooms: 3,
            bathrooms: 3,
            areaSqft: 1650,
            priceFrom: 14_200_000,
          },
        ],
      });

      return project.id;
    }

    it('returns a price range and the configurations offered', async () => {
      await approvedProject();

      const response = await http().get('/api/projects/search').expect(200);

      expect(response.body.total).toBe(1);
      const [card] = response.body.items;
      expect(card.priceFrom).toBe(8_900_000);
      expect(card.priceTo).toBe(14_200_000);
      expect(card.bedrooms).toEqual([2, 3]);
      expect(card.reraNumber).toBe('P02400004567');
    });

    /**
     * The single most important rule on this surface. An unverified project
     * reaching a buyer is a regulatory problem in Telangana as well as a trust
     * one — advertising an unregistered project is illegal outright.
     */
    it.each([
      ProjectStatus.DRAFT,
      ProjectStatus.PENDING_REVIEW,
      ProjectStatus.REJECTED,
      ProjectStatus.SUSPENDED,
      ProjectStatus.ARCHIVED,
    ])('never shows a %s project publicly', async (status) => {
      const id = await approvedProject({ status, isVerified: false });

      const search = await http().get('/api/projects/search').expect(200);
      expect(search.body.total).toBe(0);

      await http().get(`/api/projects/${id}`).expect(404);
    });

    it('never shows an approved-but-unverified project', async () => {
      await approvedProject({ status: ProjectStatus.APPROVED, isVerified: false });

      const search = await http().get('/api/projects/search').expect(200);
      expect(search.body.total).toBe(0);
    });

    it('filters by configuration, not by the project as a whole', async () => {
      await approvedProject();

      // The project offers a 3 BHK, so it matches.
      const match = await http().get('/api/projects/search?bedrooms=3').expect(200);
      expect(match.body.total).toBe(1);

      const miss = await http().get('/api/projects/search?bedrooms=5').expect(200);
      expect(miss.body.total).toBe(0);

      // Price filters apply to the unit price, so a ceiling below the cheapest
      // configuration excludes the project.
      const tooExpensive = await http()
        .get('/api/projects/search?maxPrice=5000000')
        .expect(200);
      expect(tooExpensive.body.total).toBe(0);
    });

    it('records one view per viewer per day', async () => {
      const id = await approvedProject();

      await http().get(`/api/projects/${id}`).expect(200);
      await http().get(`/api/projects/${id}`).expect(200);

      const stored = await db().project.findUniqueOrThrow({ where: { id } });
      expect(stored.viewsCount).toBe(1);
    });

    it('does not count the builder’s own views', async () => {
      const id = await approvedProject();

      await http()
        .get(`/api/projects/${id}`)
        .set(...bearer(builder))
        .expect(200);

      const stored = await db().project.findUniqueOrThrow({ where: { id } });
      expect(stored.viewsCount).toBe(0);
    });

    it('never exposes the builder’s contact details', async () => {
      const id = await approvedProject();

      const response = await http().get(`/api/projects/${id}`).expect(200);
      const body = JSON.stringify(response.body);

      expect(body).not.toMatch(/@selleasy24\.test/);
      expect(response.body.builder.email).toBeUndefined();
      expect(response.body.builder.phone).toBeUndefined();
    });
  });
});
