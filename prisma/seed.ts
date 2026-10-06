import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const uni = await prisma.university.upsert({
    where: { shortCode: 'IIITNR' },
    update: {},
    create: {
      name: 'Dr. Shyama Prasad Mukherjee IIIT Naya Raipur',
      shortCode: 'IIITNR',
      emailDomain: 'iiitnr.edu.in',
    },
  });

  console.log('✅ Seeded IIIT-NR University:', uni.name);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });