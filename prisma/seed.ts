import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  // 1. Seed University with primary and student domains
  const uni = await prisma.university.upsert({
    where: { shortCode: 'IIITNR' },
    update: {},
    create: {
      name: 'Dr. Shyama Prasad Mukherjee IIIT Naya Raipur',
      shortCode: 'IIITNR',
      contactName: 'Dean of Academic Affairs',
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

  // 2. Hash default admin password (Argon2id)
  const passwordHash = await argon2.hash('Admin@123456', {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
  });

  // 3. Seed Root University Admin user
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@iiitnr.edu.in' },
    update: {},
    create: {
      email: 'admin@iiitnr.edu.in',
      username: 'admin_iiitnr',
      fullName: 'Dr. System Administrator',
      role: 'ADMIN',
      status: 'ACTIVE',
      isEmailVerified: true,
      universityId: uni.id,
      password: {
        create: {
          passwordHash,
        },
      },
    },
  });

  console.log('✅ Seeded IIIT-NR University:', uni.name);
  console.log('🔑 Seeded Admin credentials:');
  console.log('   Email:    admin@iiitnr.edu.in');
  console.log('   Password: Admin@123456');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });