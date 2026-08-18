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
 * Photo ordering (PRD feature 6).
 *
 * The first photo is the cover, so ordering is not cosmetic — it decides what
 * a buyer sees on every card and in search results.
 */
describe('photo ordering', () => {
  let neighborhoodId: string;
  let seller: TestUser;

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
  });

  async function listingWithPhotos(
    count: number,
    status: ListingStatus = ListingStatus.DRAFT,
    owner: TestUser = seller,
  ): Promise<{ listingId: string; photoIds: string[] }> {
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
        sellerId: owner.id,
        title: 'A flat used by the photo ordering tests',
        description:
          'Long enough to satisfy the fifty character minimum the create endpoint enforces.',
        price: 9_500_000,
        status,
        isVerified: status === ListingStatus.APPROVED,
        ...(status === ListingStatus.APPROVED && { firstListedAt: new Date() }),
      },
      select: { id: true },
    });

    const photoIds: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const photo = await db().listingPhoto.create({
        data: {
          listingId: listing.id,
          storageKey: `listings/${listing.id}/photos/photo-${index}.jpg`,
          sortOrder: index,
        },
        select: { id: true },
      });
      photoIds.push(photo.id);
    }

    return { listingId: listing.id, photoIds };
  }

  async function currentOrder(listingId: string): Promise<string[]> {
    const photos = await db().listingPhoto.findMany({
      where: { listingId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    });
    return photos.map((photo) => photo.id);
  }

  it('reorders photos and makes the first one the cover', async () => {
    const { listingId, photoIds } = await listingWithPhotos(4);
    const reversed = [...photoIds].reverse();

    const response = await http()
      .patch(`/api/listings/${listingId}/photos/order`)
      .set(...bearer(seller))
      .send({ order: reversed })
      .expect(200);

    expect(response.body.map((p: { id: string }) => p.id)).toEqual(reversed);
    expect(await currentOrder(listingId)).toEqual(reversed);
  });

  it('promotes any photo to cover by putting it first', async () => {
    const { listingId, photoIds } = await listingWithPhotos(4);
    const chosen = photoIds[2]!;
    const promoted = [chosen, ...photoIds.filter((id) => id !== chosen)];

    await http()
      .patch(`/api/listings/${listingId}/photos/order`)
      .set(...bearer(seller))
      .send({ order: promoted })
      .expect(200);

    const order = await currentOrder(listingId);
    expect(order[0]).toBe(chosen);

    // And the cover is what a buyer sees first in search results.
    await db().listing.update({
      where: { id: listingId },
      data: { status: ListingStatus.APPROVED, isVerified: true, firstListedAt: new Date() },
    });

    const search = await http().get('/api/listings/search?limit=10').expect(200);
    const item = (search.body.items as Array<{ id: string; photos: Array<{ id: string }> }>).find(
      (i) => i.id === listingId,
    );
    expect(item!.photos[0]!.id).toBe(chosen);
  });

  it('allows reordering a live listing', async () => {
    // Presentation only: every photograph the officer reviewed is still there.
    const { listingId, photoIds } = await listingWithPhotos(3, ListingStatus.APPROVED);
    const reversed = [...photoIds].reverse();

    await http()
      .patch(`/api/listings/${listingId}/photos/order`)
      .set(...bearer(seller))
      .send({ order: reversed })
      .expect(200);

    expect(await currentOrder(listingId)).toEqual(reversed);
  });

  it('still refuses to add or remove photos on a live listing', async () => {
    // The swap-behind-the-badge boundary: what was verified cannot change.
    const { listingId, photoIds } = await listingWithPhotos(3, ListingStatus.APPROVED);

    const response = await http()
      .delete(`/api/listings/${listingId}/photos/${photoIds[0]}`)
      .set(...bearer(seller));

    /*
     * 403, not 404: this seller does own the listing, so denying its existence
     * would be misleading. The action is refused because of the listing's
     * state, which is exactly what Forbidden means.
     */
    expect(response.status).toBe(403);
    expect(await currentOrder(listingId)).toHaveLength(3);
  });

  describe('rejects an order it cannot apply unambiguously', () => {
    it('refuses a partial list', async () => {
      const { listingId, photoIds } = await listingWithPhotos(4);

      await http()
        .patch(`/api/listings/${listingId}/photos/order`)
        .set(...bearer(seller))
        .send({ order: photoIds.slice(0, 2) })
        .expect(400);

      // Unchanged, rather than half-applied.
      expect(await currentOrder(listingId)).toEqual(photoIds);
    });

    it('refuses duplicate ids', async () => {
      const { listingId, photoIds } = await listingWithPhotos(3);

      await http()
        .patch(`/api/listings/${listingId}/photos/order`)
        .set(...bearer(seller))
        .send({ order: [photoIds[0], photoIds[0], photoIds[1]] })
        .expect(400);
    });

    it('refuses a photo id belonging to another listing', async () => {
      const mine = await listingWithPhotos(3);
      const theirs = await listingWithPhotos(3);

      await http()
        .patch(`/api/listings/${mine.listingId}/photos/order`)
        .set(...bearer(seller))
        .send({ order: [theirs.photoIds[0], mine.photoIds[1], mine.photoIds[2]] })
        .expect(400);

      expect(await currentOrder(mine.listingId)).toEqual(mine.photoIds);
    });
  });

  it('does not let a seller reorder another seller’s photos', async () => {
    const owner = await createUser({ role: Role.OWNER, sellerKind: SellerKind.OWNER });
    const { listingId, photoIds } = await listingWithPhotos(3, ListingStatus.DRAFT, owner);

    await http()
      .patch(`/api/listings/${listingId}/photos/order`)
      .set(...bearer(seller))
      .send({ order: [...photoIds].reverse() })
      .expect(404);

    expect(await currentOrder(listingId)).toEqual(photoIds);
  });
});
