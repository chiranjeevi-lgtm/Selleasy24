/**
 * Database seed.
 *
 * Two distinct concerns, deliberately separated:
 *
 *  1. REFERENCE DATA (neighbourhoods) — required in every environment,
 *     including production. Idempotent upserts.
 *
 *  2. DEVELOPMENT FIXTURES (test accounts) — created ONLY when
 *     NODE_ENV !== 'production'. Seeding known-password accounts into a live
 *     environment would be a critical vulnerability, so this is guarded.
 *
 * NOTE ON PINCODES: the localities below are real Hyderabad areas, but the
 * pincode mapping is development-grade and has not been reconciled against an
 * authoritative source. Before launch, replace this list with India Post PIN
 * data (or GHMC ward data) — search correctness depends on it, and a buyer
 * filtering by pincode getting wrong results undermines the whole product.
 */
import { PrismaClient, Role, SellerKind } from '@prisma/client';

const prisma = new PrismaClient();

/** Real Hyderabad localities. Pincodes are provisional — see note above. */
const HYDERABAD_NEIGHBORHOODS: ReadonlyArray<{ name: string; pincode: string }> = [
  { name: 'Gachibowli', pincode: '500032' },
  { name: 'Madhapur', pincode: '500081' },
  { name: 'Hitech City', pincode: '500081' },
  { name: 'Kondapur', pincode: '500084' },
  { name: 'Manikonda', pincode: '500089' },
  { name: 'Narsingi', pincode: '500089' },
  { name: 'Kokapet', pincode: '500075' },
  { name: 'Nallagandla', pincode: '500019' },
  { name: 'Tellapur', pincode: '502032' },
  { name: 'Banjara Hills', pincode: '500034' },
  { name: 'Jubilee Hills', pincode: '500033' },
  { name: 'Begumpet', pincode: '500016' },
  { name: 'Ameerpet', pincode: '500073' },
  { name: 'Kukatpally', pincode: '500072' },
  { name: 'Miyapur', pincode: '500049' },
  { name: 'Nizampet', pincode: '500090' },
  { name: 'Bachupally', pincode: '500090' },
  { name: 'Gajularamaram', pincode: '500055' },
  { name: 'Attapur', pincode: '500048' },
  { name: 'LB Nagar', pincode: '500074' },
  { name: 'Uppal', pincode: '500039' },
  { name: 'Secunderabad', pincode: '500003' },
];

async function seedNeighborhoods(): Promise<number> {
  for (const { name, pincode } of HYDERABAD_NEIGHBORHOODS) {
    await prisma.neighborhood.upsert({
      where: { name_city_pincode: { name, city: 'Hyderabad', pincode } },
      update: {},
      create: { name, city: 'Hyderabad', state: 'Telangana', pincode },
    });
  }
  return HYDERABAD_NEIGHBORHOODS.length;
}

/**
 * Development-only accounts.
 *
 * Passwords are hashed with argon2id, the same path the API uses, so these
 * accounts behave identically to real ones. The shared password is fine here
 * precisely because this function never runs outside development.
 */
async function seedDevUsers(): Promise<void> {
  // Imported lazily so production seeds never load the hashing native module.
  const { hash } = await import('@node-rs/argon2');

  const DEV_PASSWORD = 'DevPassword123!';
  const passwordHash = await hash(DEV_PASSWORD, {
    // OWASP-recommended argon2id parameters. Must stay in sync with
    // apps/api password hashing configuration.
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const accounts: ReadonlyArray<{
    email: string;
    fullName: string;
    role: Role;
    sellerKind?: SellerKind;
    reraNumber?: string;
  }> = [
    { email: 'admin@kamalainfra.dev', fullName: 'Platform Admin', role: Role.ADMIN },
    { email: 'verifier@kamalainfra.dev', fullName: 'Verification Officer', role: Role.VERIFIER },
    {
      email: 'owner@kamalainfra.dev',
      fullName: 'Test Owner',
      role: Role.OWNER,
      sellerKind: SellerKind.OWNER,
    },
    {
      email: 'broker@kamalainfra.dev',
      fullName: 'Test Broker',
      role: Role.BROKER,
      sellerKind: SellerKind.BROKER,
      reraNumber: 'TS-RERA-DEV-0001',
    },
    /*
     * A builder's trading name goes in `fullName` — for a developer account the
     * "person" a buyer sees is the company, and that is the name on the RERA
     * register. `reraNumber` here is the promoter registration, distinct from
     * the per-project registration held on each Project row.
     */
    {
      email: 'builder@kamalainfra.dev',
      fullName: 'Aparna Constructions',
      role: Role.BUILDER,
      reraNumber: 'TS-RERA-PROM-0007',
    },
    { email: 'buyer@kamalainfra.dev', fullName: 'Test Buyer', role: Role.BUYER },
  ];

  for (const account of accounts) {
    await prisma.user.upsert({
      where: { email: account.email },
      update: {},
      create: {
        email: account.email,
        fullName: account.fullName,
        role: account.role,
        sellerKind: account.sellerKind ?? null,
        reraNumber: account.reraNumber ?? null,
        passwordHash,
        // Pre-verified so development flows do not require an inbox.
        isEmailVerified: true,
      },
    });
  }

  console.log(`  ${accounts.length} dev accounts (password: ${DEV_PASSWORD})`);
}

async function main(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';

  console.log(`Seeding (NODE_ENV=${process.env.NODE_ENV ?? 'development'})`);

  const count = await seedNeighborhoods();
  console.log(`  ${count} Hyderabad neighbourhoods`);

  if (isProduction) {
    console.log('  Skipping dev accounts — NODE_ENV is production');
  } else {
    await seedDevUsers();
  }

  console.log('Seed complete.');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
