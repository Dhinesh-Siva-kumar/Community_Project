import { Knex } from 'knex';
import bcrypt from 'bcryptjs';

const countries = [
  { country_name: 'Afghanistan', country_code: 'AF', country_flag: '🇦🇫' },
  { country_name: 'Albania', country_code: 'AL', country_flag: '🇦🇱' },
  { country_name: 'Algeria', country_code: 'DZ', country_flag: '🇩🇿' },
  { country_name: 'Argentina', country_code: 'AR', country_flag: '🇦🇷' },
  { country_name: 'Australia', country_code: 'AU', country_flag: '🇦🇺' },
  { country_name: 'Austria', country_code: 'AT', country_flag: '🇦🇹' },
  { country_name: 'Bangladesh', country_code: 'BD', country_flag: '🇧🇩' },
  { country_name: 'Belgium', country_code: 'BE', country_flag: '🇧🇪' },
  { country_name: 'Brazil', country_code: 'BR', country_flag: '🇧🇷' },
  { country_name: 'Canada', country_code: 'CA', country_flag: '🇨🇦' },
  { country_name: 'Chile', country_code: 'CL', country_flag: '🇨🇱' },
  { country_name: 'China', country_code: 'CN', country_flag: '🇨🇳' },
  { country_name: 'Colombia', country_code: 'CO', country_flag: '🇨🇴' },
  { country_name: 'Croatia', country_code: 'HR', country_flag: '🇭🇷' },
  { country_name: 'Czech Republic', country_code: 'CZ', country_flag: '🇨🇿' },
  { country_name: 'Denmark', country_code: 'DK', country_flag: '🇩🇰' },
  { country_name: 'Egypt', country_code: 'EG', country_flag: '🇪🇬' },
  { country_name: 'Ethiopia', country_code: 'ET', country_flag: '🇪🇹' },
  { country_name: 'Finland', country_code: 'FI', country_flag: '🇫🇮' },
  { country_name: 'France', country_code: 'FR', country_flag: '🇫🇷' },
  { country_name: 'Germany', country_code: 'DE', country_flag: '🇩🇪' },
  { country_name: 'Ghana', country_code: 'GH', country_flag: '🇬🇭' },
  { country_name: 'Greece', country_code: 'GR', country_flag: '🇬🇷' },
  { country_name: 'Hungary', country_code: 'HU', country_flag: '🇭🇺' },
  { country_name: 'India', country_code: 'IN', country_flag: '🇮🇳' },
  { country_name: 'Indonesia', country_code: 'ID', country_flag: '🇮🇩' },
  { country_name: 'Iran', country_code: 'IR', country_flag: '🇮🇷' },
  { country_name: 'Iraq', country_code: 'IQ', country_flag: '🇮🇶' },
  { country_name: 'Ireland', country_code: 'IE', country_flag: '🇮🇪' },
  { country_name: 'Israel', country_code: 'IL', country_flag: '🇮🇱' },
  { country_name: 'Italy', country_code: 'IT', country_flag: '🇮🇹' },
  { country_name: 'Japan', country_code: 'JP', country_flag: '🇯🇵' },
  { country_name: 'Jordan', country_code: 'JO', country_flag: '🇯🇴' },
  { country_name: 'Kenya', country_code: 'KE', country_flag: '🇰🇪' },
  { country_name: 'Malaysia', country_code: 'MY', country_flag: '🇲🇾' },
  { country_name: 'Mexico', country_code: 'MX', country_flag: '🇲🇽' },
  { country_name: 'Morocco', country_code: 'MA', country_flag: '🇲🇦' },
  { country_name: 'Netherlands', country_code: 'NL', country_flag: '🇳🇱' },
  { country_name: 'New Zealand', country_code: 'NZ', country_flag: '🇳🇿' },
  { country_name: 'Nigeria', country_code: 'NG', country_flag: '🇳🇬' },
  { country_name: 'Norway', country_code: 'NO', country_flag: '🇳🇴' },
  { country_name: 'Pakistan', country_code: 'PK', country_flag: '🇵🇰' },
  { country_name: 'Peru', country_code: 'PE', country_flag: '🇵🇪' },
  { country_name: 'Philippines', country_code: 'PH', country_flag: '🇵🇭' },
  { country_name: 'Poland', country_code: 'PL', country_flag: '🇵🇱' },
  { country_name: 'Portugal', country_code: 'PT', country_flag: '🇵🇹' },
  { country_name: 'Romania', country_code: 'RO', country_flag: '🇷🇴' },
  { country_name: 'Russia', country_code: 'RU', country_flag: '🇷🇺' },
  { country_name: 'Saudi Arabia', country_code: 'SA', country_flag: '🇸🇦' },
  { country_name: 'Singapore', country_code: 'SG', country_flag: '🇸🇬' },
  { country_name: 'South Africa', country_code: 'ZA', country_flag: '🇿🇦' },
  { country_name: 'South Korea', country_code: 'KR', country_flag: '🇰🇷' },
  { country_name: 'Spain', country_code: 'ES', country_flag: '🇪🇸' },
  { country_name: 'Sri Lanka', country_code: 'LK', country_flag: '🇱🇰' },
  { country_name: 'Sweden', country_code: 'SE', country_flag: '🇸🇪' },
  { country_name: 'Switzerland', country_code: 'CH', country_flag: '🇨🇭' },
  { country_name: 'Tanzania', country_code: 'TZ', country_flag: '🇹🇿' },
  { country_name: 'Thailand', country_code: 'TH', country_flag: '🇹🇭' },
  { country_name: 'Turkey', country_code: 'TR', country_flag: '🇹🇷' },
  { country_name: 'Uganda', country_code: 'UG', country_flag: '🇺🇬' },
  { country_name: 'Ukraine', country_code: 'UA', country_flag: '🇺🇦' },
  { country_name: 'United Arab Emirates', country_code: 'AE', country_flag: '🇦🇪' },
  { country_name: 'United Kingdom', country_code: 'GB', country_flag: '🇬🇧' },
  { country_name: 'United States', country_code: 'US', country_flag: '🇺🇸' },
  { country_name: 'Vietnam', country_code: 'VN', country_flag: '🇻🇳' },
];

const interests = [
  { interest_name: 'Art & Culture' },
  { interest_name: 'Business & Entrepreneurship' },
  { interest_name: 'Community Development' },
  { interest_name: 'Education & Learning' },
  { interest_name: 'Environment & Sustainability' },
  { interest_name: 'Events & Entertainment' },
  { interest_name: 'Finance & Investment' },
  { interest_name: 'Food & Dining' },
  { interest_name: 'Health & Wellness' },
  { interest_name: 'Housing & Real Estate' },
  { interest_name: 'Immigration & Visa' },
  { interest_name: 'Jobs & Careers' },
  { interest_name: 'Language & Communication' },
  { interest_name: 'Legal & Rights' },
  { interest_name: 'Networking' },
  { interest_name: 'Politics & Governance' },
  { interest_name: 'Religion & Spirituality' },
  { interest_name: 'Sports & Fitness' },
  { interest_name: 'Technology & Innovation' },
  { interest_name: 'Travel & Tourism' },
  { interest_name: 'Volunteering & Social Work' },
  { interest_name: 'Women & Gender' },
  { interest_name: 'Youth & Students' },
];

export async function seed(knex: Knex): Promise<void> {
  // ------------------------------------------------------------------
  // Countries
  // ------------------------------------------------------------------
  console.log('Seeding country_master...');
  for (const c of countries) {
    await knex('country_master')
      .insert(c)
      .onConflict('country_name')
      .ignore();
  }
  console.log(`Seeded ${countries.length} countries.`);

  // ------------------------------------------------------------------
  // Interests
  // ------------------------------------------------------------------
  console.log('Seeding interest_master...');
  for (const i of interests) {
    await knex('interest_master')
      .insert(i)
      .onConflict('interest_name')
      .ignore();
  }
  console.log(`Seeded ${interests.length} interests.`);

  // ------------------------------------------------------------------
  // Admin user
  // ------------------------------------------------------------------
  console.log('Seeding admin user...');
  const adminPassword = await bcrypt.hash('Admin@123', 10);

  const ukRow = await knex('country_master')
    .where({ country_name: 'United Kingdom' })
    .first();
  const ukId: number | null = ukRow ? (ukRow as { country_id: number }).country_id : null;

  await knex('users')
    .insert({
      user_name: 'admin',
      display_name: 'Administrator',
      email: 'admin@community.local',
      password: adminPassword,
      role: 'ADMIN',
      role_level: 100,
      country_id: ukId,
      is_active: true,
    })
    .onConflict('user_name')
    .ignore();

  console.log('Admin user seeded: username=admin, password=Admin@123');

  // SCAFFOLD: insert your seed data here
}
