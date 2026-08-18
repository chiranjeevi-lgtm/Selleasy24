import { ListingStatus, Role, SellerKind, VerificationCheckKind, VerificationDecision } from '@kamala/db';

import {
  bearer,
  createNeighborhood,
  createUser,
  db,
  http,
  startApp,
  stopApp,
  truncateAll,
} from './harness';

/**
 * The trust loop, start to finish.
 *
 * One test that walks the whole product: a seller lists, uploads documents,
 * an officer verifies, the listing becomes publicly visible, a buyer finds it,
 * shortlists it and enquires — and the seller receives the lead.
 *
 * Deliberately a single long test rather than several small ones. Each step
 * depends on the last, and splitting them would mean either re-running the
 * setup repeatedly or sharing state between tests in execution order, which is
 * the usual source of suites that pass alone and fail together.
 */
describe('buyer, seller and officer journey', () => {
  beforeAll(async () => {
    await startApp();
  });

  afterAll(async () => {
    await stopApp();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  it('carries a listing from draft to a delivered enquiry', async () => {
    const neighborhood = await createNeighborhood('Gachibowli');
    const seller = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
    const officer = await createUser({ role: Role.VERIFIER });
    const buyer = await createUser({ role: Role.BUYER });

    // --- 1. Seller creates a listing -------------------------------------
    const created = await http()
      .post('/api/listings')
      .set(...bearer(seller))
      .send({
        title: '3 BHK with a wide east-facing balcony in Gachibowli',
        description:
          'Third floor of a nine-storey building, east facing, with two covered parking bays and a lift with power backup.',
        price: 14_500_000,
        address: 'Plot 42, Vittal Rao Nagar',
        pincode: '500032',
        neighborhoodId: neighborhood.id,
        propertyType: 'FLAT',
        bedrooms: 3,
        bathrooms: 3,
        areaSqft: 1850,
        possession: 'READY_TO_MOVE',
        floor: 3,
        totalFloors: 9,
        facing: 'EAST',
        furnishing: 'SEMI_FURNISHED',
        coveredParking: 2,
        ownership: 'FREEHOLD',
        approvingAuthority: 'HMDA',
        amenities: ['LIFT', 'POWER_BACKUP', 'GYM'],
      })
      .expect(201);

    const listingId = created.body.id as string;

    // A new listing is a draft and is not public.
    const asDraft = await db().listing.findUniqueOrThrow({
      where: { id: listingId },
      select: { status: true, firstListedAt: true },
    });
    expect(asDraft.status).toBe(ListingStatus.DRAFT);
    expect(asDraft.firstListedAt).toBeNull();
    await http().get(`/api/listings/${listingId}`).expect(404);

    // --- 2. Photographs and documents ------------------------------------
    // Written directly: the upload endpoints validate real image and PDF bytes,
    // which is covered separately. What this journey asserts is the gate.
    await db().listingPhoto.createMany({
      data: [0, 1, 2].map((sortOrder) => ({
        listingId,
        storageKey: `listings/${listingId}/photos/photo-${sortOrder}.jpg`,
        sortOrder,
      })),
    });

    await db().document.createMany({
      data: [
        { kind: 'SALE_DEED' as const },
        { kind: 'ID_PROOF' as const },
        { kind: 'PROPERTY_TAX_RECEIPT' as const },
      ].map((doc, index) => ({
        listingId,
        uploadedById: seller.id,
        kind: doc.kind,
        storageKey: `documents/${listingId}/${doc.kind}.enc`,
        originalFilename: `${doc.kind}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1024 * (index + 1),
        encryptionIv: Buffer.alloc(12).toString('base64'),
        encryptionTag: Buffer.alloc(16).toString('base64'),
      })),
    });

    // --- 3. Submit for review --------------------------------------------
    await http()
      .post(`/api/listings/${listingId}/submit`)
      .set(...bearer(seller))
      .expect(200);

    const submitted = await db().listing.findUniqueOrThrow({
      where: { id: listingId },
      select: { status: true },
    });
    expect(submitted.status).toBe(ListingStatus.PENDING_REVIEW);

    // Still not public while it waits.
    await http().get(`/api/listings/${listingId}`).expect(404);

    // --- 4. It reaches the officer's queue --------------------------------
    const queue = await http()
      .get('/api/verification/queue')
      .set(...bearer(officer))
      .expect(200);

    const queued = (queue.body.items ?? queue.body) as Array<{ id: string }>;
    expect(queued.map((item) => item.id)).toContain(listingId);

    // --- 5. Officer approves ----------------------------------------------
    await http()
      .post(`/api/verification/listings/${listingId}/decide`)
      .set(...bearer(officer))
      .send({
        decision: VerificationDecision.APPROVED,
        checks: [
          { kind: VerificationCheckKind.OWNER_NAME_MATCHES_DEED, passed: true },
          { kind: VerificationCheckKind.DEED_REGISTERED_AND_STAMPED, passed: true },
          { kind: VerificationCheckKind.PROPERTY_TAX_CURRENT, passed: true },
          { kind: VerificationCheckKind.LOCATION_MATCHES_DOCUMENTS, passed: true },
        ],
        internalNotes: 'Documents consistent. Staff-only note.',
      })
      .expect(200);

    // --- 6. Now publicly discoverable -------------------------------------
    const search = await http()
      .get('/api/listings/search?minBedrooms=3&approvingAuthority=HMDA&amenities=LIFT,GYM&limit=50')
      .expect(200);

    const found = (search.body.items as Array<{ id: string; isVerified: boolean }>).find(
      (item) => item.id === listingId,
    );
    expect(found).toBeDefined();
    expect(found!.isVerified).toBe(true);

    const detail = await http().get(`/api/listings/${listingId}`).expect(200);
    expect(detail.body.property.floor).toBe(3);
    expect(detail.body.property.amenities).toEqual(
      expect.arrayContaining(['LIFT', 'POWER_BACKUP', 'GYM']),
    );
    // Staff commentary never reaches a buyer.
    expect(JSON.stringify(detail.body)).not.toContain('Staff-only note');

    // The verification record is readable with no account at all.
    const record = await http().get(`/api/verification/public/${listingId}`).expect(200);
    expect(record.body.checks).toHaveLength(4);

    // --- 7. Buyer shortlists it -------------------------------------------
    await http()
      .post(`/api/listings/${listingId}/save`)
      .set(...bearer(buyer))
      .expect(201);

    const saved = await http()
      .get('/api/saved')
      .set(...bearer(buyer))
      .expect(200);
    expect(saved.body.items).toHaveLength(1);
    expect(saved.body.items[0].isAvailable).toBe(true);

    // --- 8. Buyer enquires, with no account required ----------------------
    await http()
      .post(`/api/listings/${listingId}/enquiries`)
      .send({
        name: 'Interested Buyer',
        phone: '+919876500011',
        message: 'Is it still available? Could I visit this weekend?',
      })
      .expect(201);

    // --- 9. The seller receives the lead ----------------------------------
    const leads = await http()
      .get('/api/leads/mine')
      .set(...bearer(seller))
      .expect(200);

    const list = (leads.body.items ?? leads.body) as Array<{
      name: string;
      phone: string;
      listingId: string;
    }>;
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe('Interested Buyer');
    expect(list[0]!.phone).toBe('+919876500011');

    // --- 10. And the audit trail recorded the decision ---------------------
    const decisions = await db().verification.findMany({
      where: { listingId },
      select: { decision: true, checks: { select: { kind: true, passed: true } } },
    });
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.decision).toBe(VerificationDecision.APPROVED);
    expect(decisions[0]!.checks).toHaveLength(4);
  });
});
