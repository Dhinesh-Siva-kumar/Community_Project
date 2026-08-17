import { Knex } from 'knex';
import bcrypt from 'bcryptjs';

const countries = [
    { name: 'Afghanistan',                iso2: 'AF', dial_code: '+93',   flag_emoji: '🇦🇫' },
    { name: 'Albania',                    iso2: 'AL', dial_code: '+355',  flag_emoji: '🇦🇱' },
    { name: 'Algeria',                    iso2: 'DZ', dial_code: '+213',  flag_emoji: '🇩🇿' },
    { name: 'Andorra',                    iso2: 'AD', dial_code: '+376',  flag_emoji: '🇦🇩' },
    { name: 'Angola',                     iso2: 'AO', dial_code: '+244',  flag_emoji: '🇦🇴' },
    { name: 'Argentina',                  iso2: 'AR', dial_code: '+54',   flag_emoji: '🇦🇷' },
    { name: 'Armenia',                    iso2: 'AM', dial_code: '+374',  flag_emoji: '🇦🇲' },
    { name: 'Australia',                  iso2: 'AU', dial_code: '+61',   flag_emoji: '🇦🇺' },
    { name: 'Austria',                    iso2: 'AT', dial_code: '+43',   flag_emoji: '🇦🇹' },
    { name: 'Azerbaijan',                 iso2: 'AZ', dial_code: '+994',  flag_emoji: '🇦🇿' },
    { name: 'Bahrain',                    iso2: 'BH', dial_code: '+973',  flag_emoji: '🇧🇭' },
    { name: 'Bangladesh',                 iso2: 'BD', dial_code: '+880',  flag_emoji: '🇧🇩' },
    { name: 'Belarus',                    iso2: 'BY', dial_code: '+375',  flag_emoji: '🇧🇾' },
    { name: 'Belgium',                    iso2: 'BE', dial_code: '+32',   flag_emoji: '🇧🇪' },
    { name: 'Belize',                     iso2: 'BZ', dial_code: '+501',  flag_emoji: '🇧🇿' },
    { name: 'Benin',                      iso2: 'BJ', dial_code: '+229',  flag_emoji: '🇧🇯' },
    { name: 'Bhutan',                     iso2: 'BT', dial_code: '+975',  flag_emoji: '🇧🇹' },
    { name: 'Bolivia',                    iso2: 'BO', dial_code: '+591',  flag_emoji: '🇧🇴' },
    { name: 'Bosnia and Herzegovina',     iso2: 'BA', dial_code: '+387',  flag_emoji: '🇧🇦' },
    { name: 'Botswana',                   iso2: 'BW', dial_code: '+267',  flag_emoji: '🇧🇼' },
    { name: 'Brazil',                     iso2: 'BR', dial_code: '+55',   flag_emoji: '🇧🇷' },
    { name: 'Brunei',                     iso2: 'BN', dial_code: '+673',  flag_emoji: '🇧🇳' },
    { name: 'Bulgaria',                   iso2: 'BG', dial_code: '+359',  flag_emoji: '🇧🇬' },
    { name: 'Burkina Faso',               iso2: 'BF', dial_code: '+226',  flag_emoji: '🇧🇫' },
    { name: 'Cambodia',                   iso2: 'KH', dial_code: '+855',  flag_emoji: '🇰🇭' },
    { name: 'Cameroon',                   iso2: 'CM', dial_code: '+237',  flag_emoji: '🇨🇲' },
    { name: 'Canada',                     iso2: 'CA', dial_code: '+1',    flag_emoji: '🇨🇦' },
    { name: 'Chile',                      iso2: 'CL', dial_code: '+56',   flag_emoji: '🇨🇱' },
    { name: 'China',                      iso2: 'CN', dial_code: '+86',   flag_emoji: '🇨🇳' },
    { name: 'Colombia',                   iso2: 'CO', dial_code: '+57',   flag_emoji: '🇨🇴' },
    { name: 'Costa Rica',                 iso2: 'CR', dial_code: '+506',  flag_emoji: '🇨🇷' },
    { name: 'Croatia',                    iso2: 'HR', dial_code: '+385',  flag_emoji: '🇭🇷' },
    { name: 'Cuba',                       iso2: 'CU', dial_code: '+53',   flag_emoji: '🇨🇺' },
    { name: 'Cyprus',                     iso2: 'CY', dial_code: '+357',  flag_emoji: '🇨🇾' },
    { name: 'Czech Republic',             iso2: 'CZ', dial_code: '+420',  flag_emoji: '🇨🇿' },
    { name: 'Denmark',                    iso2: 'DK', dial_code: '+45',   flag_emoji: '🇩🇰' },
    { name: 'Dominican Republic',         iso2: 'DO', dial_code: '+1809', flag_emoji: '🇩🇴' },
    { name: 'Ecuador',                    iso2: 'EC', dial_code: '+593',  flag_emoji: '🇪🇨' },
    { name: 'Egypt',                      iso2: 'EG', dial_code: '+20',   flag_emoji: '🇪🇬' },
    { name: 'El Salvador',                iso2: 'SV', dial_code: '+503',  flag_emoji: '🇸🇻' },
    { name: 'Estonia',                    iso2: 'EE', dial_code: '+372',  flag_emoji: '🇪🇪' },
    { name: 'Ethiopia',                   iso2: 'ET', dial_code: '+251',  flag_emoji: '🇪🇹' },
    { name: 'Finland',                    iso2: 'FI', dial_code: '+358',  flag_emoji: '🇫🇮' },
    { name: 'France',                     iso2: 'FR', dial_code: '+33',   flag_emoji: '🇫🇷' },
    { name: 'Georgia',                    iso2: 'GE', dial_code: '+995',  flag_emoji: '🇬🇪' },
    { name: 'Germany',                    iso2: 'DE', dial_code: '+49',   flag_emoji: '🇩🇪' },
    { name: 'Ghana',                      iso2: 'GH', dial_code: '+233',  flag_emoji: '🇬🇭' },
    { name: 'Greece',                     iso2: 'GR', dial_code: '+30',   flag_emoji: '🇬🇷' },
    { name: 'Guatemala',                  iso2: 'GT', dial_code: '+502',  flag_emoji: '🇬🇹' },
    { name: 'Honduras',                   iso2: 'HN', dial_code: '+504',  flag_emoji: '🇭🇳' },
    { name: 'Hungary',                    iso2: 'HU', dial_code: '+36',   flag_emoji: '🇭🇺' },
    { name: 'Iceland',                    iso2: 'IS', dial_code: '+354',  flag_emoji: '🇮🇸' },
    { name: 'India',                      iso2: 'IN', dial_code: '+91',   flag_emoji: '🇮🇳' },
    { name: 'Indonesia',                  iso2: 'ID', dial_code: '+62',   flag_emoji: '🇮🇩' },
    { name: 'Iran',                       iso2: 'IR', dial_code: '+98',   flag_emoji: '🇮🇷' },
    { name: 'Iraq',                       iso2: 'IQ', dial_code: '+964',  flag_emoji: '🇮🇶' },
    { name: 'Ireland',                    iso2: 'IE', dial_code: '+353',  flag_emoji: '🇮🇪' },
    { name: 'Israel',                     iso2: 'IL', dial_code: '+972',  flag_emoji: '🇮🇱' },
    { name: 'Italy',                      iso2: 'IT', dial_code: '+39',   flag_emoji: '🇮🇹' },
    { name: 'Jamaica',                    iso2: 'JM', dial_code: '+1876', flag_emoji: '🇯🇲' },
    { name: 'Japan',                      iso2: 'JP', dial_code: '+81',   flag_emoji: '🇯🇵' },
    { name: 'Jordan',                     iso2: 'JO', dial_code: '+962',  flag_emoji: '🇯🇴' },
    { name: 'Kazakhstan',                 iso2: 'KZ', dial_code: '+7',    flag_emoji: '🇰🇿' },
    { name: 'Kenya',                      iso2: 'KE', dial_code: '+254',  flag_emoji: '🇰🇪' },
    { name: 'Kuwait',                     iso2: 'KW', dial_code: '+965',  flag_emoji: '🇰🇼' },
    { name: 'Kyrgyzstan',                 iso2: 'KG', dial_code: '+996',  flag_emoji: '🇰🇬' },
    { name: 'Laos',                       iso2: 'LA', dial_code: '+856',  flag_emoji: '🇱🇦' },
    { name: 'Latvia',                     iso2: 'LV', dial_code: '+371',  flag_emoji: '🇱🇻' },
    { name: 'Lebanon',                    iso2: 'LB', dial_code: '+961',  flag_emoji: '🇱🇧' },
    { name: 'Libya',                      iso2: 'LY', dial_code: '+218',  flag_emoji: '🇱🇾' },
    { name: 'Lithuania',                  iso2: 'LT', dial_code: '+370',  flag_emoji: '🇱🇹' },
    { name: 'Luxembourg',                 iso2: 'LU', dial_code: '+352',  flag_emoji: '🇱🇺' },
    { name: 'Malaysia',                   iso2: 'MY', dial_code: '+60',   flag_emoji: '🇲🇾' },
    { name: 'Maldives',                   iso2: 'MV', dial_code: '+960',  flag_emoji: '🇲🇻' },
    { name: 'Mali',                       iso2: 'ML', dial_code: '+223',  flag_emoji: '🇲🇱' },
    { name: 'Malta',                      iso2: 'MT', dial_code: '+356',  flag_emoji: '🇲🇹' },
    { name: 'Mexico',                     iso2: 'MX', dial_code: '+52',   flag_emoji: '🇲🇽' },
    { name: 'Moldova',                    iso2: 'MD', dial_code: '+373',  flag_emoji: '🇲🇩' },
    { name: 'Mongolia',                   iso2: 'MN', dial_code: '+976',  flag_emoji: '🇲🇳' },
    { name: 'Morocco',                    iso2: 'MA', dial_code: '+212',  flag_emoji: '🇲🇦' },
    { name: 'Mozambique',                 iso2: 'MZ', dial_code: '+258',  flag_emoji: '🇲🇿' },
    { name: 'Myanmar',                    iso2: 'MM', dial_code: '+95',   flag_emoji: '🇲🇲' },
    { name: 'Nepal',                      iso2: 'NP', dial_code: '+977',  flag_emoji: '🇳🇵' },
    { name: 'Netherlands',                iso2: 'NL', dial_code: '+31',   flag_emoji: '🇳🇱' },
    { name: 'New Zealand',                iso2: 'NZ', dial_code: '+64',   flag_emoji: '🇳🇿' },
    { name: 'Nicaragua',                  iso2: 'NI', dial_code: '+505',  flag_emoji: '🇳🇮' },
    { name: 'Nigeria',                    iso2: 'NG', dial_code: '+234',  flag_emoji: '🇳🇬' },
    { name: 'North Korea',                iso2: 'KP', dial_code: '+850',  flag_emoji: '🇰🇵' },
    { name: 'Norway',                     iso2: 'NO', dial_code: '+47',   flag_emoji: '🇳🇴' },
    { name: 'Oman',                       iso2: 'OM', dial_code: '+968',  flag_emoji: '🇴🇲' },
    { name: 'Pakistan',                   iso2: 'PK', dial_code: '+92',   flag_emoji: '🇵🇰' },
    { name: 'Palestine',                  iso2: 'PS', dial_code: '+970',  flag_emoji: '🇵🇸' },
    { name: 'Panama',                     iso2: 'PA', dial_code: '+507',  flag_emoji: '🇵🇦' },
    { name: 'Paraguay',                   iso2: 'PY', dial_code: '+595',  flag_emoji: '🇵🇾' },
    { name: 'Peru',                       iso2: 'PE', dial_code: '+51',   flag_emoji: '🇵🇪' },
    { name: 'Philippines',                iso2: 'PH', dial_code: '+63',   flag_emoji: '🇵🇭' },
    { name: 'Poland',                     iso2: 'PL', dial_code: '+48',   flag_emoji: '🇵🇱' },
    { name: 'Portugal',                   iso2: 'PT', dial_code: '+351',  flag_emoji: '🇵🇹' },
    { name: 'Qatar',                      iso2: 'QA', dial_code: '+974',  flag_emoji: '🇶🇦' },
    { name: 'Romania',                    iso2: 'RO', dial_code: '+40',   flag_emoji: '🇷🇴' },
    { name: 'Russia',                     iso2: 'RU', dial_code: '+7',    flag_emoji: '🇷🇺' },
    { name: 'Rwanda',                     iso2: 'RW', dial_code: '+250',  flag_emoji: '🇷🇼' },
    { name: 'Saudi Arabia',               iso2: 'SA', dial_code: '+966',  flag_emoji: '🇸🇦' },
    { name: 'Senegal',                    iso2: 'SN', dial_code: '+221',  flag_emoji: '🇸🇳' },
    { name: 'Serbia',                     iso2: 'RS', dial_code: '+381',  flag_emoji: '🇷🇸' },
    { name: 'Sierra Leone',               iso2: 'SL', dial_code: '+232',  flag_emoji: '🇸🇱' },
    { name: 'Singapore',                  iso2: 'SG', dial_code: '+65',   flag_emoji: '🇸🇬' },
    { name: 'Slovakia',                   iso2: 'SK', dial_code: '+421',  flag_emoji: '🇸🇰' },
    { name: 'Slovenia',                   iso2: 'SI', dial_code: '+386',  flag_emoji: '🇸🇮' },
    { name: 'Somalia',                    iso2: 'SO', dial_code: '+252',  flag_emoji: '🇸🇴' },
    { name: 'South Africa',               iso2: 'ZA', dial_code: '+27',   flag_emoji: '🇿🇦' },
    { name: 'South Korea',                iso2: 'KR', dial_code: '+82',   flag_emoji: '🇰🇷' },
    { name: 'Spain',                      iso2: 'ES', dial_code: '+34',   flag_emoji: '🇪🇸' },
    { name: 'Sri Lanka',                  iso2: 'LK', dial_code: '+94',   flag_emoji: '🇱🇰' },
    { name: 'Sudan',                      iso2: 'SD', dial_code: '+249',  flag_emoji: '🇸🇩' },
    { name: 'Sweden',                     iso2: 'SE', dial_code: '+46',   flag_emoji: '🇸🇪' },
    { name: 'Switzerland',                iso2: 'CH', dial_code: '+41',   flag_emoji: '🇨🇭' },
    { name: 'Syria',                      iso2: 'SY', dial_code: '+963',  flag_emoji: '🇸🇾' },
    { name: 'Taiwan',                     iso2: 'TW', dial_code: '+886',  flag_emoji: '🇹🇼' },
    { name: 'Tajikistan',                 iso2: 'TJ', dial_code: '+992',  flag_emoji: '🇹🇯' },
    { name: 'Tanzania',                   iso2: 'TZ', dial_code: '+255',  flag_emoji: '🇹🇿' },
    { name: 'Thailand',                   iso2: 'TH', dial_code: '+66',   flag_emoji: '🇹🇭' },
    { name: 'Tunisia',                    iso2: 'TN', dial_code: '+216',  flag_emoji: '🇹🇳' },
    { name: 'Turkey',                     iso2: 'TR', dial_code: '+90',   flag_emoji: '🇹🇷' },
    { name: 'Turkmenistan',               iso2: 'TM', dial_code: '+993',  flag_emoji: '🇹🇲' },
    { name: 'Uganda',                     iso2: 'UG', dial_code: '+256',  flag_emoji: '🇺🇬' },
    { name: 'Ukraine',                    iso2: 'UA', dial_code: '+380',  flag_emoji: '🇺🇦' },
    { name: 'United Arab Emirates',       iso2: 'AE', dial_code: '+971',  flag_emoji: '🇦🇪' },
    { name: 'United Kingdom',             iso2: 'GB', dial_code: '+44',   flag_emoji: '🇬🇧' },
    { name: 'United States',              iso2: 'US', dial_code: '+1',    flag_emoji: '🇺🇸' },
    { name: 'Uruguay',                    iso2: 'UY', dial_code: '+598',  flag_emoji: '🇺🇾' },
    { name: 'Uzbekistan',                 iso2: 'UZ', dial_code: '+998',  flag_emoji: '🇺🇿' },
    { name: 'Venezuela',                  iso2: 'VE', dial_code: '+58',   flag_emoji: '🇻🇪' },
    { name: 'Vietnam',                    iso2: 'VN', dial_code: '+84',   flag_emoji: '🇻🇳' },
    { name: 'Yemen',                      iso2: 'YE', dial_code: '+967',  flag_emoji: '🇾🇪' },
    { name: 'Zambia',                     iso2: 'ZM', dial_code: '+260',  flag_emoji: '🇿🇲' },
    { name: 'Zimbabwe',                   iso2: 'ZW', dial_code: '+263',  flag_emoji: '🇿🇼' },
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

const jobs = [
  {
    title: 'Frontend Developer (Angular)',
    description: 'We are looking for a motivated Frontend Developer to join our growing product team and help build our customer-facing web app.',
    responsibilities: 'Build and maintain Angular components; collaborate with design and backend teams; write unit tests; participate in code reviews.',
    qualifications: 'Bachelor\'s degree in Computer Science or related field, or equivalent practical experience.',
    requirements: '2+ years with Angular or a similar framework; strong TypeScript and CSS fundamentals; familiarity with REST APIs.',
    benefits: 'Health insurance, flexible working hours, annual learning budget.',
    company_name: 'Nimbus Softworks', company_website: 'https://nimbussoftworks.example.com',
    city: 'Chennai', state: 'Tamil Nadu', country: 'India', pincode: '600001', location: 'Chennai, Tamil Nadu',
    is_remote: false, work_mode: 'Hybrid',
    exp_min: 2, exp_max: 5, education: '12th', openings: 2, job_type: 'Full-time', shift_type: 'Day',
    salary_min: 600000, salary_max: 1000000, salary_type: 'Annual', salary_currency: 'INR', salary_hidden: false,
    work_start_time: '09:30', work_end_time: '18:30', working_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    contact_person: 'Priya Raman', contact_email: 'careers@nimbussoftworks.example.com', contact_phone: '+91 9840012345',
    application_url: 'https://nimbussoftworks.example.com/careers/frontend-developer',
    skills: ['Angular', 'TypeScript', 'RxJS', 'CSS'],
  },
  {
    title: 'Backend Engineer (Node.js)',
    description: 'Join our backend team building scalable APIs that power our community platform.',
    responsibilities: 'Design and implement REST APIs; own database schema changes; monitor and improve performance.',
    qualifications: null, requirements: '3+ years Node.js/Express experience; solid SQL skills.', benefits: null,
    company_name: 'BlueOrbit Technologies', company_website: 'https://blueorbit.example.com',
    city: 'Bengaluru', state: 'Karnataka', country: 'India', pincode: '560001', location: 'Bengaluru, Karnataka',
    is_remote: false, work_mode: 'On-site',
    exp_min: 3, exp_max: 7, education: 'Any Graduate', openings: 1, job_type: 'Full-time', shift_type: 'Day',
    salary_min: 900000, salary_max: 1500000, salary_type: 'Annual', salary_currency: 'INR', salary_hidden: false,
    work_start_time: '10:00', work_end_time: '19:00', working_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    contact_person: 'Arjun Mehta', contact_email: 'hr@blueorbit.example.com', contact_phone: '+91 9900011122',
    application_url: null, skills: ['Node.js', 'Express', 'PostgreSQL', 'Knex'],
  },
  {
    title: 'Remote Customer Support Executive',
    description: 'Support our customers over chat and email, fully remote role with flexible hours.',
    responsibilities: null, qualifications: null, requirements: null, benefits: 'Work from home, performance bonus.',
    company_name: 'HelpDesk Global', company_website: null,
    city: null, state: null, country: 'India', pincode: null, location: null,
    is_remote: true, work_mode: 'Remote',
    exp_min: 0, exp_max: 2, education: '10th', openings: 5, job_type: 'Part-time', shift_type: 'Flexible',
    salary_min: 15000, salary_max: 25000, salary_type: 'Monthly', salary_currency: 'INR', salary_hidden: false,
    work_start_time: null, work_end_time: null, working_days: [],
    contact_person: 'Support Hiring Team', contact_email: 'jobs@helpdeskglobal.example.com', contact_phone: null,
    application_url: null, skills: ['Communication', 'Customer Service'],
  },
  {
    title: 'Warehouse Associate',
    description: 'Pack and dispatch orders at our regional fulfilment centre.',
    responsibilities: 'Pick and pack orders; maintain inventory accuracy; operate warehouse scanning equipment.',
    qualifications: null, requirements: 'Ability to lift up to 20kg; punctual and reliable.', benefits: 'Overtime pay, transport allowance.',
    company_name: 'Swift Logistics', company_website: null,
    city: 'Coimbatore', state: 'Tamil Nadu', country: 'India', pincode: '641001', location: 'Coimbatore, Tamil Nadu',
    is_remote: false, work_mode: 'On-site',
    exp_min: 0, exp_max: 1, education: 'No education needed', openings: 10, job_type: 'Full-time', shift_type: 'Rotational',
    salary_min: 12000, salary_max: 16000, salary_type: 'Monthly', salary_currency: 'INR', salary_hidden: false,
    work_start_time: '08:00', work_end_time: '17:00', working_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    contact_person: 'Warehouse Hiring Desk', contact_email: 'hiring@swiftlogistics.example.com', contact_phone: '+91 9843300112',
    application_url: null, skills: ['Physical Stamina', 'Teamwork'],
  },
  {
    title: 'Senior Product Manager',
    description: 'Lead product strategy for our flagship community engagement product.',
    responsibilities: 'Define roadmap; work with engineering/design; run discovery interviews; own KPIs.',
    qualifications: 'MBA or equivalent experience preferred.', requirements: '6+ years product management, B2C SaaS background.',
    benefits: 'ESOPs, premium health cover, annual offsite.',
    company_name: 'Orbit Community Labs', company_website: 'https://orbitlabs.example.com',
    city: 'London', state: null, country: 'United Kingdom', pincode: 'EC1A 1BB', location: 'London, UK',
    is_remote: false, work_mode: 'Hybrid',
    exp_min: 6, exp_max: 12, education: 'Any Graduate', openings: 1, job_type: 'Full-time', shift_type: 'Day',
    salary_min: 70000, salary_max: 95000, salary_type: 'Annual', salary_currency: 'GBP', salary_hidden: false,
    work_start_time: '09:00', work_end_time: '17:30', working_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    contact_person: 'Talent Team', contact_email: 'talent@orbitlabs.example.com', contact_phone: null,
    application_url: 'https://orbitlabs.example.com/careers/senior-pm', skills: ['Product Strategy', 'Roadmapping', 'Analytics'],
  },
  {
    title: 'Graphic Design Intern',
    description: 'Great opportunity for a design student to build a real-world portfolio with our marketing team.',
    responsibilities: 'Design social media creatives; support brand guideline updates.', qualifications: null,
    requirements: 'Currently pursuing a design degree/diploma; proficient in Figma or Adobe tools.', benefits: 'Certificate, stipend, mentorship.',
    company_name: 'Kaleidoscope Studio', company_website: null,
    city: 'Pune', state: 'Maharashtra', country: 'India', pincode: '411001', location: 'Pune, Maharashtra',
    is_remote: false, work_mode: 'On-site',
    exp_min: 0, exp_max: 0, education: 'Diploma', openings: 3, job_type: 'Internship', shift_type: 'Day',
    salary_min: 8000, salary_max: 12000, salary_type: 'Monthly', salary_currency: 'INR', salary_hidden: false,
    work_start_time: '10:00', work_end_time: '18:00', working_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    contact_person: 'Design Team Lead', contact_email: 'internships@kaleidoscope.example.com', contact_phone: null,
    application_url: null, skills: ['Figma', 'Adobe Photoshop', 'Illustration'],
  },
  {
    title: 'Data Analyst (Salary Not Disclosed)',
    description: 'Analyse product usage data and build dashboards for leadership.',
    responsibilities: 'Build and maintain BI dashboards; run ad-hoc analyses; partner with product teams.',
    qualifications: null, requirements: 'Strong SQL; experience with a BI tool (Metabase/PowerBI/Looker).', benefits: null,
    company_name: 'DataForge Analytics', company_website: 'https://dataforge.example.com',
    city: 'Hyderabad', state: 'Telangana', country: 'India', pincode: '500001', location: 'Hyderabad, Telangana',
    is_remote: false, work_mode: 'Hybrid',
    exp_min: 1, exp_max: 4, education: 'Any Graduate', openings: 2, job_type: 'Full-time', shift_type: 'Day',
    salary_min: null, salary_max: null, salary_type: 'Annual', salary_currency: 'INR', salary_hidden: true,
    work_start_time: '09:30', work_end_time: '18:30', working_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    contact_person: 'Recruiting', contact_email: 'jobs@dataforge.example.com', contact_phone: null,
    application_url: null, skills: ['SQL', 'Metabase', 'Data Visualization'],
  },
  {
    title: 'Night Shift Security Guard',
    description: 'Provide security coverage for our commercial premises during night hours.',
    responsibilities: null, qualifications: null, requirements: 'Valid security license preferred; alert and dependable.', benefits: 'Night shift allowance.',
    company_name: 'Guardian Facility Services', company_website: null,
    city: 'Chennai', state: 'Tamil Nadu', country: 'India', pincode: '600020', location: 'Chennai, Tamil Nadu',
    is_remote: false, work_mode: 'On-site',
    exp_min: 0, exp_max: 3, education: '8th', openings: 4, job_type: 'Full-time', shift_type: 'Night',
    salary_min: 14000, salary_max: 18000, salary_type: 'Monthly', salary_currency: 'INR', salary_hidden: false,
    work_start_time: '21:00', work_end_time: '06:00', working_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    contact_person: 'Ops Manager', contact_email: 'ops@guardianfs.example.com', contact_phone: '+91 9876500011',
    application_url: null, skills: ['Vigilance', 'Discipline'],
  },
  {
    title: 'Freelance Content Writer',
    description: 'Write blog posts and website copy for a range of clients, on a contract basis.',
    responsibilities: 'Research and write SEO-friendly articles; revise based on editor feedback.',
    qualifications: null, requirements: 'Excellent written English; portfolio of published work.', benefits: 'Flexible schedule, per-article pay.',
    company_name: 'WordCraft Media', company_website: 'https://wordcraft.example.com',
    city: null, state: null, country: 'United States', pincode: null, location: null,
    is_remote: true, work_mode: 'Remote',
    exp_min: 1, exp_max: 5, education: 'Any Graduate', openings: 3, job_type: 'Contract', shift_type: 'Flexible',
    salary_min: 20, salary_max: 60, salary_type: 'Hourly', salary_currency: 'USD', salary_hidden: false,
    work_start_time: null, work_end_time: null, working_days: [],
    contact_person: 'Editorial Team', contact_email: 'write@wordcraft.example.com', contact_phone: null,
    application_url: 'https://wordcraft.example.com/write-for-us', skills: ['Writing', 'SEO', 'Editing'],
  },
  {
    title: 'Retail Store Manager',
    description: 'Manage day-to-day operations of our flagship retail outlet, including staff and inventory.',
    responsibilities: 'Supervise store staff; manage inventory and stock counts; ensure customer satisfaction; handle daily sales reporting.',
    qualifications: 'Diploma or degree in retail/business management preferred.', requirements: '4+ years retail experience, 1+ years in a supervisory role.',
    benefits: 'Store performance bonus, staff discount.',
    company_name: 'Meridian Retail Group', company_website: null,
    city: 'Madurai', state: 'Tamil Nadu', country: 'India', pincode: '625001', location: 'Madurai, Tamil Nadu',
    is_remote: false, work_mode: 'On-site',
    exp_min: 4, exp_max: 10, education: 'Diploma', openings: 1, job_type: 'Full-time', shift_type: 'Rotational',
    salary_min: 350000, salary_max: 550000, salary_type: 'Annual', salary_currency: 'INR', salary_hidden: false,
    work_start_time: '10:00', work_end_time: '20:00', working_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    contact_person: 'Regional HR', contact_email: 'careers@meridianretail.example.com', contact_phone: '+91 9843211009',
    application_url: null, skills: ['Retail Operations', 'Team Leadership', 'Inventory Management'],
  },
];

const businessCategories = [
  { name: 'Restaurant',        icon: 'bi-fork-knife',       description: 'Dine-in and takeaway restaurants' },
  { name: 'Coffee Shop',       icon: 'bi-cup-hot',          description: 'Cafes and coffee houses' },
  { name: 'Hotel',             icon: 'bi-building',         description: 'Hotels and accommodation' },
  { name: 'Bakery',            icon: 'bi-cake',             description: 'Bakeries and pastry shops' },
  { name: 'Supermarket',       icon: 'bi-cart',             description: 'Supermarkets and hypermarkets' },
  { name: 'Grocery',           icon: 'bi-basket',           description: 'Grocery and convenience stores' },
  { name: 'Pharmacy',          icon: 'bi-capsule',          description: 'Pharmacies and chemists' },
  { name: 'Hospital',          icon: 'bi-hospital',         description: 'Hospitals and medical centres' },
  { name: 'Clinic',            icon: 'bi-stethoscope',      description: 'Clinics and health centres' },
  { name: 'Gym',               icon: 'bi-activity',         description: 'Gyms and fitness centres' },
  { name: 'Spa',               icon: 'bi-flower1',          description: 'Spas and wellness centres' },
  { name: 'Salon',             icon: 'bi-scissors',         description: 'Hair and beauty salons' },
  { name: 'Shopping Mall',     icon: 'bi-bag',              description: 'Shopping malls and plazas' },
  { name: 'Electronics Store', icon: 'bi-laptop',           description: 'Electronics and gadget stores' },
  { name: 'Clothing Store',    icon: 'bi-handbag',          description: 'Fashion and clothing stores' },
  { name: 'Furniture Store',   icon: 'bi-lamp',             description: 'Furniture and home décor stores' },
  { name: 'Car Dealer',        icon: 'bi-car-front',        description: 'Car dealerships and showrooms' },
  { name: 'Petrol Station',    icon: 'bi-fuel-pump',        description: 'Petrol stations and fuel stops' },
  { name: 'Book Store',        icon: 'bi-book',             description: 'Book shops and libraries' },
  { name: 'Jewelry Store',     icon: 'bi-gem',              description: 'Jewelry and accessory stores' },
  { name: 'School',            icon: 'bi-pencil',           description: 'Schools and educational institutions' },
  { name: 'College',           icon: 'bi-journal',          description: 'Colleges and technical institutes' },
  { name: 'University',        icon: 'bi-mortarboard',      description: 'Universities and higher education' },
  { name: 'Real Estate',       icon: 'bi-house-door',       description: 'Real estate and property agencies' },
  { name: 'Travel Agency',     icon: 'bi-airplane',         description: 'Travel agencies and tour operators' },
  { name: 'Bank',              icon: 'bi-bank',             description: 'Banks and financial institutions' },
  { name: 'Insurance',         icon: 'bi-shield-check',     description: 'Insurance companies and brokers' },
  { name: 'Event Hall',        icon: 'bi-calendar-event',   description: 'Event halls and banquet venues' },
  { name: 'Cinema',            icon: 'bi-film',             description: 'Cinemas and movie theatres' },
  { name: 'Bar',               icon: 'bi-beer',             description: 'Bars and nightlife venues' },
  { name: 'Pub',               icon: 'bi-cup-straw',        description: 'Pubs and taverns' },
  { name: 'Cafe',              icon: 'bi-cup',              description: 'Casual cafes and bistros' },
  { name: 'Fast Food',         icon: 'bi-bag-heart',        description: 'Fast food and quick service restaurants' },
  { name: 'Food Truck',        icon: 'bi-truck',            description: 'Food trucks and mobile eateries' },
  { name: 'Ice Cream Shop',    icon: 'bi-ice-cream',        description: 'Ice cream parlours and dessert shops' },
];

export async function seed(knex: Knex): Promise<void> {
  // ------------------------------------------------------------------
  // Countries
  // ------------------------------------------------------------------
  console.log('Seeding master_countries...');
  for (const c of countries) {
    await knex('master_countries')
      .insert(c)
      .onConflict('iso2')
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

  const indiaRow = await knex('master_countries')
    .where({ name: 'India' })
    .first();
  const indiaId: number | null = indiaRow ? (indiaRow as { id: number }).id : null;

  await knex('users')
    .insert({
      user_name: 'admin',
      display_name: 'Administrator',
      email: 'admin@tamilconnect.com',
      password: adminPassword,
      role: 'ADMIN',
      role_level: 100,
      country_id: indiaId,
      is_active: true,
    })
    .onConflict('user_name')
    .ignore();

  console.log('Admin user seeded: username=admin, password=Admin@123');

  // ------------------------------------------------------------------
  // Business Categories
  // ------------------------------------------------------------------
  console.log('Seeding business_categories...');
  for (const cat of businessCategories) {
    await knex('business_categories')
      .insert(cat)
      .onConflict('name')
      .ignore();
  }
  console.log(`Seeded ${businessCategories.length} business categories.`);

  // ------------------------------------------------------------------
  // Jobs (sample listings — skipped if any jobs already exist, so this
  // stays idempotent across repeated `knex seed:run` calls without
  // needing a unique constraint on job title)
  // ------------------------------------------------------------------
  const existingJobCount = await knex('jobs').count<{ count: string }[]>('id as count').first();
  if (!existingJobCount || Number(existingJobCount.count) === 0) {
    console.log('Seeding jobs...');
    const adminRow = await knex('users').where({ user_name: 'admin' }).first();
    const adminId: string | undefined = adminRow ? (adminRow as { id: string }).id : undefined;

    if (adminId) {
      await knex('jobs').insert(jobs.map((j) => ({ ...j, user_id: adminId })));
      console.log(`Seeded ${jobs.length} jobs.`);
    } else {
      console.log('Skipped job seeding: admin user not found.');
    }
  } else {
    console.log('Skipped job seeding: jobs already exist.');
  }
}
