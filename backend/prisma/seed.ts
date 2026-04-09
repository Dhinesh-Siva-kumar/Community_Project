import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

const countries = [
  { countryName: 'Afghanistan', countryCode: 'AF', countryFlag: '🇦🇫' },
  { countryName: 'Albania', countryCode: 'AL', countryFlag: '🇦🇱' },
  { countryName: 'Algeria', countryCode: 'DZ', countryFlag: '🇩🇿' },
  { countryName: 'Argentina', countryCode: 'AR', countryFlag: '🇦🇷' },
  { countryName: 'Australia', countryCode: 'AU', countryFlag: '🇦🇺' },
  { countryName: 'Austria', countryCode: 'AT', countryFlag: '🇦🇹' },
  { countryName: 'Bangladesh', countryCode: 'BD', countryFlag: '🇧🇩' },
  { countryName: 'Belgium', countryCode: 'BE', countryFlag: '🇧🇪' },
  { countryName: 'Brazil', countryCode: 'BR', countryFlag: '🇧🇷' },
  { countryName: 'Canada', countryCode: 'CA', countryFlag: '🇨🇦' },
  { countryName: 'Chile', countryCode: 'CL', countryFlag: '🇨🇱' },
  { countryName: 'China', countryCode: 'CN', countryFlag: '🇨🇳' },
  { countryName: 'Colombia', countryCode: 'CO', countryFlag: '🇨🇴' },
  { countryName: 'Denmark', countryCode: 'DK', countryFlag: '🇩🇰' },
  { countryName: 'Egypt', countryCode: 'EG', countryFlag: '🇪🇬' },
  { countryName: 'Ethiopia', countryCode: 'ET', countryFlag: '🇪🇹' },
  { countryName: 'Finland', countryCode: 'FI', countryFlag: '🇫🇮' },
  { countryName: 'France', countryCode: 'FR', countryFlag: '🇫🇷' },
  { countryName: 'Germany', countryCode: 'DE', countryFlag: '🇩🇪' },
  { countryName: 'Ghana', countryCode: 'GH', countryFlag: '🇬🇭' },
  { countryName: 'Greece', countryCode: 'GR', countryFlag: '🇬🇷' },
  { countryName: 'India', countryCode: 'IN', countryFlag: '🇮🇳' },
  { countryName: 'Indonesia', countryCode: 'ID', countryFlag: '🇮🇩' },
  { countryName: 'Iran', countryCode: 'IR', countryFlag: '🇮🇷' },
  { countryName: 'Iraq', countryCode: 'IQ', countryFlag: '🇮🇶' },
  { countryName: 'Ireland', countryCode: 'IE', countryFlag: '🇮🇪' },
  { countryName: 'Israel', countryCode: 'IL', countryFlag: '🇮🇱' },
  { countryName: 'Italy', countryCode: 'IT', countryFlag: '🇮🇹' },
  { countryName: 'Japan', countryCode: 'JP', countryFlag: '🇯🇵' },
  { countryName: 'Jordan', countryCode: 'JO', countryFlag: '🇯🇴' },
  { countryName: 'Kenya', countryCode: 'KE', countryFlag: '🇰🇪' },
  { countryName: 'Malaysia', countryCode: 'MY', countryFlag: '🇲🇾' },
  { countryName: 'Mexico', countryCode: 'MX', countryFlag: '🇲🇽' },
  { countryName: 'Morocco', countryCode: 'MA', countryFlag: '🇲🇦' },
  { countryName: 'Netherlands', countryCode: 'NL', countryFlag: '🇳🇱' },
  { countryName: 'New Zealand', countryCode: 'NZ', countryFlag: '🇳🇿' },
  { countryName: 'Nigeria', countryCode: 'NG', countryFlag: '🇳🇬' },
  { countryName: 'Norway', countryCode: 'NO', countryFlag: '🇳🇴' },
  { countryName: 'Pakistan', countryCode: 'PK', countryFlag: '🇵🇰' },
  { countryName: 'Peru', countryCode: 'PE', countryFlag: '🇵🇪' },
  { countryName: 'Philippines', countryCode: 'PH', countryFlag: '🇵🇭' },
  { countryName: 'Poland', countryCode: 'PL', countryFlag: '🇵🇱' },
  { countryName: 'Portugal', countryCode: 'PT', countryFlag: '🇵🇹' },
  { countryName: 'Romania', countryCode: 'RO', countryFlag: '🇷🇴' },
  { countryName: 'Russia', countryCode: 'RU', countryFlag: '🇷🇺' },
  { countryName: 'Saudi Arabia', countryCode: 'SA', countryFlag: '🇸🇦' },
  { countryName: 'Singapore', countryCode: 'SG', countryFlag: '🇸🇬' },
  { countryName: 'South Africa', countryCode: 'ZA', countryFlag: '🇿🇦' },
  { countryName: 'South Korea', countryCode: 'KR', countryFlag: '🇰🇷' },
  { countryName: 'Spain', countryCode: 'ES', countryFlag: '🇪🇸' },
  { countryName: 'Sri Lanka', countryCode: 'LK', countryFlag: '🇱🇰' },
  { countryName: 'Sweden', countryCode: 'SE', countryFlag: '🇸🇪' },
  { countryName: 'Switzerland', countryCode: 'CH', countryFlag: '🇨🇭' },
  { countryName: 'Tanzania', countryCode: 'TZ', countryFlag: '🇹🇿' },
  { countryName: 'Thailand', countryCode: 'TH', countryFlag: '🇹🇭' },
  { countryName: 'Turkey', countryCode: 'TR', countryFlag: '🇹🇷' },
  { countryName: 'Uganda', countryCode: 'UG', countryFlag: '🇺🇬' },
  { countryName: 'Ukraine', countryCode: 'UA', countryFlag: '🇺🇦' },
  { countryName: 'United Arab Emirates', countryCode: 'AE', countryFlag: '🇦🇪' },
  { countryName: 'United Kingdom', countryCode: 'GB', countryFlag: '🇬🇧' },
  { countryName: 'United States', countryCode: 'US', countryFlag: '🇺🇸' },
  { countryName: 'Venezuela', countryCode: 'VE', countryFlag: '🇻🇪' },
  { countryName: 'Vietnam', countryCode: 'VN', countryFlag: '🇻🇳' },
];

const interests = [
  { interestName: 'Art & Culture' },
  { interestName: 'Business & Entrepreneurship' },
  { interestName: 'Community Service' },
  { interestName: 'Cooking & Food' },
  { interestName: 'Education & Learning' },
  { interestName: 'Environment & Sustainability' },
  { interestName: 'Fashion & Lifestyle' },
  { interestName: 'Fitness & Sports' },
  { interestName: 'Gaming' },
  { interestName: 'Health & Wellness' },
  { interestName: 'History & Heritage' },
  { interestName: 'Language & Literature' },
  { interestName: 'Music & Entertainment' },
  { interestName: 'Nature & Outdoors' },
  { interestName: 'Parenting & Family' },
  { interestName: 'Photography & Video' },
  { interestName: 'Politics & Social Issues' },
  { interestName: 'Religion & Spirituality' },
  { interestName: 'Science & Technology' },
  { interestName: 'Travel & Adventure' },
  { interestName: 'Volunteering' },
  { interestName: 'Women Empowerment' },
  { interestName: 'Youth & Students' },
];

async function main() {
  console.log('Seeding country_master...');
  for (const c of countries) {
    await prisma.countryMaster.upsert({
      where: { countryName: c.countryName },
      update: {},
      create: c,
    });
  }
  console.log(`Seeded ${countries.length} countries.`);

  console.log('Seeding interest_master...');
  for (const i of interests) {
    await prisma.interestMaster.upsert({
      where: { interestName: i.interestName },
      update: {},
      create: i,
    });
  }
  console.log(`Seeded ${interests.length} interests.`);

  // Seed admin user
  console.log('Seeding admin user...');
  const adminPassword = await bcrypt.hash('Admin@123', 10);
  await prisma.user.upsert({
    where: { userName: 'admin' },
    update: {},
    create: {
      userName: 'admin',
      displayName: 'Administrator',
      email: 'admin@community.local',
      password: adminPassword,
      role: 'ADMIN',
      roleLevel: 100,
      countryId: 60, // United Kingdom
      isActive: true,
    },
  });
  console.log('Admin user created: username=admin, password=Admin@123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
