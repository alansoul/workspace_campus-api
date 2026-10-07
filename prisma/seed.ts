import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const uni = await prisma.university.upsert({
    where: { shortCode: 'IIITNR' },
    update: {},
    create: {
      name: 'Dr. Shyama Prasad Mukherjee IIIT Naya Raipur',
      shortCode: 'IIITNR',
      contactName: 'University Admin',
      contactEmail: 'admin@iiitnr.edu.in',
      website: 'https://iiitnr.ac.in',
      status: 'ACTIVE',
      domains: {
        create: [
          { domain: 'iiitnr.edu.in', isPrimary: true, isVerified: true },
          { domain: 'student.iiitnr.edu.in', isPrimary: false, isVerified: true },
        ],
      },
    },
  });

  console.log('✅ Seeded IIIT-NR University with domains:', uni.name);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });