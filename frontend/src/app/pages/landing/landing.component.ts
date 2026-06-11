import {
  Component, OnInit, OnDestroy, AfterViewInit, ViewChild,
  Inject, PLATFORM_ID, ElementRef, HostBinding, HostListener, NgZone
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { SearchableSelectComponent, SelectOption } from '../../shared/components/searchable-select/searchable-select.component';

// ─────────────────────────────────────────────────────────────────────────────
// TRANSLATIONS — co-located EN / TA objects
// All visible landing-page text lives here. Arrays are fully duplicated so
// switching language swaps titles, descriptions, tags, and labels in one shot.
// ─────────────────────────────────────────────────────────────────────────────
const TRANSLATIONS = {
  en: {
    // ── Navbar ──
    nav_home: 'Home',
    nav_features: 'Features',
    nav_communities: 'Communities',
    nav_how_it_works: 'How It Works',
    nav_reviews: 'Reviews',
    nav_about: 'About',
    nav_contact: 'Contact',
    nav_login: 'Log In',
    nav_get_started: 'Get Started',
    mobile_light_mode: 'Light Mode',
    mobile_dark_mode: 'Dark Mode',

    // ── Hero ──
    hero_h1_pre: 'A platform for',
    hero_h1_accent: 'Tamils',
    hero_h1_post: 'around the world',
    hero_h1_sub: 'Students, workers, professionals, business owners, and families.',
    hero_motto: 'You are not alone abroad — your Tamil community is already waiting for you.',
    // hero_desc1: 'Whether you move for study, work, or a new life —',
    // hero_desc2: 'your Tamil community is already waiting for you.',
    hero_join_community: 'Join Community',
    hero_how_it_works: 'How it Works',
    pill_jobs_label: 'Jobs',
    pill_jobs_stat: '2.5K+ listings',
    pill_communities_label: 'Communities',
    pill_communities_stat: '500+ groups',
    pill_events_label: 'Events',
    pill_events_stat: '1K+ hosted',
    pill_support_label: 'Support',
    pill_support_stat: '24/7 active',
    pill_help_label: 'Help',
    pill_help_stat: 'Always here',
    pill_business_label: 'Business',
    pill_business_stat: '800+ listed',
    trust_secure: 'Secure & Private',
    trust_free: 'Free for everyone',
    trust_worldwide: 'Available worldwide',

    // ── Features Section ──
    feat_pill: 'Platform Features',
    feat_title1: 'Everything You Need Abroad,',
    feat_title2: 'All in One Place.',
    feat_sub: 'Jobs, education, support, events, and a community of friends — everything you need, all in one platform.',

    // ── Communities Section ──
    comm_pill: 'Country Communities',
    comm_title1: 'No Matter Where You Are — ',
    comm_title2: 'Your Tamil Community Is There.',
    comm_sub: 'Connect with Tamils living in your country. Whether you are a student, job seeker, newcomer, or business owner, you can receive local guidance, ask questions, and build meaningful connections with people who understand your situation.',
    comm_group_chat_title: 'Group Chat',
    comm_group_chat_desc: 'Members can participate in country-specific discussions, ask questions, and help each other with local information.',
    comm_local_help_title: 'Local Help',
    comm_local_help_desc: 'New members can receive assistance regarding accommodation, transportation, banking, healthcare, job searching, and settling in.',
    comm_guidance_title: 'Guidance',
    comm_guidance_desc: 'Experienced community members provide practical advice about visas, universities, careers, business opportunities, and daily life.',
    comm_active: 'Active',
    comm_chat_community_name: 'UK Tamils Community',
    comm_chat_active_status: 'Active Community',
    comm_chat_sender_name: 'Murugan',
    comm_chat_online_badge: '🟢 Online',
    comm_chat_murugan_msg: 'Hello everyone, I recently moved to the UK. Can anyone suggest good websites to find part-time jobs?',
    comm_chat_member_name: 'Community Member',
    comm_chat_reply_msg: 'Welcome! You can start with Indeed, Reed, and Gumtree. Let us know which city you are in and we can provide more specific recommendations.',
    comm_browse_all: 'Browse All Communities',

    // ── Timeline / How It Works ──
    timeline_pill: 'How It Works',
    timeline_title1: 'Your Journey in',
    timeline_title2: 'Four Simple Steps',
    timeline_sub: 'From sign-up to finding your community — here is how it works.',

    // ── Testimonials ──
    testi_pill: 'Real Stories',
    testi_title_pre: 'Real',
    testi_title_accent: 'Stories',
    testi_sub: 'Hear from Tamils who found community, jobs, and support through TamilConnect.',

    // ── About ──
    about_pill: 'About Us',
    about_title1: 'Our Mission is',
    about_title2: 'Your Community',
    about_sub: 'Connecting, supporting, and empowering Tamils living across the globe.',
    about_mission_title: 'Why We Built This',
    about_mission_text: 'TamilConnect was born from a simple truth — Tamils abroad often feel alone. We built this platform so that wherever you go in the world, your Tamil community is already there waiting for you. Whether you are a student, a worker, a professional, or a business owner, you never have to face a new country alone. TamilConnect exists to connect, support, and empower Tamils living across the globe.',
    about_location: 'Available Worldwide',
    about_join_now: 'Join Now',
    about_log_in: 'Log In',

    // ── Trust & Safety ──
    trust_badge: 'Trust & Safety',
    trust_title: 'Your Safety Comes First.',
    trust_sub: 'TamilConnect is built to help members connect, communicate, and support each other in a secure and trusted environment.',
    trust_tagline: 'Connect with confidence. Your safety and privacy are always protected on TamilConnect.',

    // ── Blog ──
    blog_pill: 'Blog & Updates',
    blog_title1: 'Latest from',
    blog_title2: 'TamilConnect',
    blog_sub: 'Tips, guides, community updates, and opportunities for Tamils living around the world.',
    blog_read_more: 'Read More',

    // ── Contact ──
    contact_pill: 'Contact Us',
    contact_title1: "We're Here",
    contact_title2: 'For You',
    contact_sub: 'Have a question or need help settling in? The TamilConnect team is ready to support you wherever you are.',
    contact_badge: 'Every question answered. Every Tamil supported.',
    contact_panel_title: "We're here to help every Tamil abroad.",
    contact_panel_desc: 'Whether you have a question about the platform, need support, or want to provide feedback, our team is always available.',
    contact_email_label: 'Email Us',
    contact_email_note: 'We reply within 24 hours',
    contact_whatsapp_label: 'WhatsApp Support',
    contact_whatsapp_value: 'Community Help Channel',
    contact_whatsapp_note: 'Quick responses',
    contact_worldwide_label: 'Available Worldwide',
    contact_worldwide_value: '40+ Countries',
    contact_worldwide_note: 'Tamils helping Tamils',
    contact_form_title: 'Send us a Message',
    contact_success_title: 'Message Sent!',
    contact_success_desc: "Thanks for reaching out. We'll get back to you within 24 hours.",
    contact_send_another: 'Send Another Message',
    contact_first_name: 'First Name',
    contact_last_name: 'Last Name',
    contact_email_address: 'Email Address',
    contact_subject_label: 'Subject',
    contact_message_label: 'Message',
    contact_send_message_btn: 'Send Message',
    contact_select_topic: 'Select a topic...',
    contact_tell_us: 'Tell us how we can help...',
    err_first_name: 'First name is required.',
    err_last_name: 'Last name is required.',
    err_email: 'A valid email address is required.',
    err_subject: 'Please select a subject.',
    err_message: 'Message must be at least 10 characters.',

    // ── CTA Banner ──
    cta_badge: 'Wherever you are in the world, your Tamil community is with you.',
    cta_title1: "You're Not Alone",
    cta_title2: 'Abroad',
    cta_desc: 'Millions of Tamils live across the world. Whether you are studying, working, running a business, or starting a new life in another country, TamilConnect helps you connect with people who understand your journey.',
    cta_join_free: 'Join TamilConnect Free',
    cta_already_member: 'Already a member? Log in',
    cta_network_text: 'Connect with Tamils across 40+ countries and build your network today.',
    cta_trust1: '40+ Countries',
    cta_trust2: '10M+ Tamils Worldwide',
    cta_trust3: 'Join Free Today',

    // ── Footer ──
    footer_desc: 'Connecting Tamils living abroad through community, support, opportunities, and meaningful relationships.',
    footer_tagline: 'Your Digital Home for the Global Tamil Community.',
    footer_platform: 'Platform',
    footer_platform_communities: 'Country Communities',
    footer_platform_jobs: 'Jobs & Career',
    footer_platform_students: 'Students Section',
    footer_platform_help: 'Help Center',
    footer_platform_events: 'Events & Festivals',
    footer_platform_share: 'Share Items',
    footer_platform_chat: 'Direct Chat',
    footer_platform_business: 'Tamil Business Directory',
    footer_community: 'Community',
    footer_comm_uk: 'UK Tamils',
    footer_comm_de: 'Germany Tamils',
    footer_comm_ca: 'Canada Tamils',
    footer_comm_au: 'Australia Tamils',
    footer_comm_sg: 'Singapore Tamils',
    footer_comm_uae: 'UAE Tamils',
    footer_comm_nz: 'New Zealand Tamils',
    footer_comm_ie: 'Ireland Tamils',
    footer_comm_all: 'All Countries',
    footer_support: 'Support',
    footer_about_us: 'About Us',
    footer_contact_us: 'Contact Us',
    footer_privacy: 'Privacy Policy',
    footer_terms: 'Terms & Conditions',
    footer_safety: 'Safety Tips',
    footer_report: 'Report an Issue',
    footer_copyright: 'Built for Tamils Around the World.',
    footer_made_with: 'Made with',
    footer_made_for: 'for the Global Tamil Diaspora.',
    footer_privacy_link: 'Privacy',
    footer_terms_link: 'Terms',
    footer_cookies_link: 'Cookies',

    // ── Data Arrays ──
    features: [
      {
        icon: 'bi-globe2',
        title: 'Country Communities',
        desc: 'UK, Germany, Canada, Australia — A Connected Tamil Community in Every Country. Newcomers can connect with local Tamils and receive guidance, support, and practical help to settle in.',
        tags: ['Group Chat', 'Local Help', 'Guidance'],
        color: 'primary', featured: false
      },
      {
        icon: 'bi-briefcase-fill',
        title: 'Jobs & Career',
        desc: 'Share and find job opportunities, sponsored jobs, part-time roles, and internships — directly through fellow Tamils around the world.',
        tags: ['Full-time', 'Part-time', 'Sponsored'],
        color: 'green', featured: false
      },
      {
        icon: 'bi-mortarboard-fill',
        title: 'Students Section',
        desc: 'Get university tips, scholarship information, part-time job opportunities, and project support — all designed for students studying abroad.',
        tags: ['Scholarships', 'Universities', 'Projects'],
        color: 'violet', featured: false
      },
      {
        icon: 'bi-shield-fill-check',
        title: 'Help & Support',
        desc: 'For legal assistance, emergencies, or medical support, you can connect with trusted members of the Tamil community for guidance and help.',
        tags: ['Legal Help', 'Emergency', 'Advice'],
        color: 'pink', featured: false
      },
      {
        icon: 'bi-calendar-event-fill',
        title: 'Events & Festivals',
        desc: 'Discover and join Diwali, Pongal, and Tamil New Year celebrations happening in the country where you live, and connect with your local Tamil community.',
        tags: ['Festivals', 'Meetups', 'Events'],
        color: 'yellow', featured: false
      },
      {
        icon: 'bi-gift-fill',
        title: 'Share Items',
        desc: 'Furniture, Electronics, Books, Kitchen items — Give away or receive unused items from fellow community members, helping others while reducing waste.',
        tags: ['Free Items', 'Furniture', 'Books'],
        color: 'accent', featured: false
      },
      {
        icon: 'bi-chat-dots-fill',
        title: 'Direct Chat',
        desc: 'Private chats, country group chats, and topic-based groups — such as Jobs, Students, and Business — allow you to connect and communicate directly with the community.',
        tags: ['Private', 'Groups', 'Topics'],
        color: 'primary', featured: false
      },
      {
        icon: 'bi-shop',
        title: 'Tamil Business',
        desc: 'Tamils running businesses abroad can register and showcase their businesses, enabling direct trade and easier product shipping within the global Tamil community.',
        tags: ['Directory', 'Trade', 'Services'],
        color: 'violet', featured: false
      },
      {
        icon: 'bi-person-badge-fill',
        title: 'Member Profiles',
        desc: 'Create a profile with your country, city, profession, and education, then search for and connect with fellow Tamils. Find the right people easily, wherever you are.',
        tags: ['Search', 'Connect', 'Verified'],
        color: 'green', featured: false
      }
    ],

    steps: [
      {
        num: '01',
        title: 'Sign Up',
        desc: "Create your profile easily by adding your name, country, city, and profession or field of study. It's completely free.",
        color: 'primary'
      },
      {
        num: '02',
        title: 'Choose Your Country',
        desc: 'Join the Tamil community in the country where you live and connect with local members.',
        color: 'violet'
      },
      {
        num: '03',
        title: 'Get Help or Offer Support',
        desc: "Find jobs, get legal help, share items, or support others — everything your community needs, all in one place.",
        color: 'green'
      },
      {
        num: '04',
        title: 'Grow Your Network',
        desc: 'Make new friends, join events, and build meaningful connections with the Tamil community wherever you are.',
        color: 'pink'
      }
    ],

    testimonials: [
      {
        name: 'Murugan Selvam',
        location: 'Manchester, UK',
        category: 'Housing & Jobs',
        initial: 'M',
        quote: "When I first moved to the UK, I didn't know anyone and felt completely alone. Through TamilConnect, I connected with other Tamils living in Manchester. They helped me find accommodation, guided me through local procedures, and even shared job opportunities. What could have taken months became much easier because of the community.",
        color: 'primary',
        rating: 5
      },
      {
        name: 'Kavitha Rajan',
        location: 'Berlin, Germany',
        category: 'Student Support',
        initial: 'K',
        quote: "While studying in Germany, I struggled to find a part-time job and didn't know where to start. Through the Students Section, I connected with a Tamil senior who guided me through the local job market and university resources. Today, I work part-time at a café and have a strong support network around me.",
        color: 'violet',
        rating: 5
      },
      {
        name: 'Arjun Kumar',
        location: 'Toronto, Canada',
        category: 'Community Networking',
        initial: 'A',
        quote: 'Moving to Canada was exciting but overwhelming. I didn\'t know where to start. Through TamilConnect, I connected with Tamils in Toronto, attended community events, and built real friendships within weeks. Settling into a new country became so much easier.',
        color: 'green',
        rating: 5
      },
      {
        name: 'Priya Nandakumar',
        location: 'Sydney, Australia',
        category: 'Help & Support',
        initial: 'P',
        quote: 'When I needed advice about visa procedures and local services, members of the Australia Tamil community were incredibly helpful. The guidance I received saved me time, reduced stress, and gave me confidence.',
        color: 'pink',
        rating: 5
      }
    ],

    aboutStats: [
      { value: '100%',  label: 'Growing Community' },
      { value: '40+',  label: 'Countries' },
      { value: '100%',   label: 'Free Forever' },
      { value: '100%', label: 'Safe and Secure' }
    ],

    aboutChips: ['By Tamils, For Tamils','A trusted platform','Everyone is welcome','A global community'],

    trustCards: [
      {
        icon: 'bi-patch-check-fill',
        title: 'Verified Profiles',
        desc: 'Members can verify their profiles to build trust within the community. Verified users receive a badge, helping others connect with genuine and reliable people.',
        color: 'primary'
      },
      {
        icon: 'bi-shield-fill-x',
        title: 'Block & Report',
        desc: 'Instantly block unwanted users and report inappropriate behavior, harassment, spam, or suspicious activity. Reported accounts are reviewed by administrators.',
        color: 'pink'
      },
      {
        icon: 'bi-lock-fill',
        title: 'Privacy First',
        desc: 'Personal information is protected and only shared according to your privacy settings. You have full control over what others can see.',
        color: 'violet'
      },
      {
        icon: 'bi-funnel-fill',
        title: 'Spam Detection',
        desc: 'Suspicious activities, fake accounts, and spam messages are automatically detected and removed to keep the platform safe and trustworthy.',
        color: 'green'
      }
    ],

    footerMetrics: [
      { icon: 'bi-briefcase-fill',      value: '1,240+', label: 'Jobs Posted' },
      { icon: 'bi-mortarboard-fill',    value: '3,800+', label: 'Students Connected' },
      { icon: 'bi-hand-thumbs-up-fill', value: '9,500+', label: 'Help Requests Resolved' },
      { icon: 'bi-globe2',              value: '40+',    label: 'Countries Covered' },
    ],

    blogPosts: [
      {
        title: 'How to Find a Part-Time Job Abroad: A Complete Tamil Guide',
        excerpt: 'Discover where to search for jobs, how to prepare your CV, ace interviews, and find part-time opportunities in your new country — step by step.',
        category: 'Jobs & Students',
        readTime: '6 min read',
        date: 'Jun 01, 2026',
        color: 'primary'
      },
      {
        title: 'What to Do When You First Arrive in a New Country: A Tamil Community Guide',
        excerpt: 'From finding housing and setting up a bank account to getting a SIM card and connecting with your local Tamil community — everything you need for a smooth start.',
        category: 'Country Communities',
        readTime: '7 min read',
        date: 'May 20, 2026',
        color: 'violet'
      },
      {
        title: 'Top Tamil Festivals and Events Happening Across Europe This Year',
        excerpt: 'Pongal celebrations, Tamil New Year gatherings, cultural events, and community networking — here are the unmissable Tamil events across Europe this year.',
        category: 'Events & Festivals',
        readTime: '4 min read',
        date: 'May 10, 2026',
        color: 'green'
      }
    ],

    marqueeItems: [
      { icon: 'bi-people-fill',         text: 'Communities' },
      { icon: 'bi-calendar-event-fill', text: 'Events' },
      { icon: 'bi-briefcase-fill',      text: 'Jobs' },
      { icon: 'bi-shop',                text: 'Businesses' },
      { icon: 'bi-chat-dots-fill',      text: 'Posts' },
      { icon: 'bi-bell-fill',           text: 'Notifications' },
      { icon: 'bi-people-fill',         text: 'Communities' },
      { icon: 'bi-calendar-event-fill', text: 'Events' },
      { icon: 'bi-briefcase-fill',      text: 'Jobs' },
      { icon: 'bi-shop',                text: 'Businesses' },
      { icon: 'bi-chat-dots-fill',      text: 'Posts' },
      { icon: 'bi-bell-fill',           text: 'Notifications' }
    ],

    contactSubjectOptions: [
      { value: 'general',     label: 'General Inquiry' },
      { value: 'question',     label: 'Questions About the Platform' },
      { value: 'feedback',    label: 'Feedback & Suggestions' },
      { value: 'partnership', label: 'Partnership / Collaboration' },
      { value: 'other',       label: 'Others' },
    ] as SelectOption[],
  },

  // ═══════════════════════════════════════════════════════════════
  // TAMIL TRANSLATIONS
  // ═══════════════════════════════════════════════════════════════
  ta: {
    // ── Navbar ──
    nav_home: 'முகப்பு',
    nav_features: 'சேவைகள்',
    nav_communities: 'சமூகங்கள்',
    nav_how_it_works: 'எப்படி செயல்படுகிறது',
    nav_reviews: 'மதிப்புரைகள்',
    nav_about: 'எங்களைப் பற்றி',
    nav_contact: 'தொடர்பு',
    nav_login: 'உள்நுழைவு',
    nav_get_started: 'தொடங்குங்கள்',
    mobile_light_mode: 'வெளிர் முறை',
    mobile_dark_mode: 'இருண்ட முறை',

    // ── Hero ──
    hero_h1_pre: 'உலகெங்கிலும் வாழும்',
    hero_h1_accent: 'தமிழர்களின்',
    hero_h1_post: 'சொந்த தளம்',
    hero_h1_sub: 'மாணவர்களுக்கும், தொழிலாளர்களுக்கும், வணிகர்களுக்கும் — அனைத்து தமிழர்களுக்கும்.',
    hero_motto: 'தெரியாத நாட்டில் தனியாக போராடுகிறீர்களா? உங்களுக்காகவே இந்த தளம் உருவாக்கப்பட்டது.',
    // hero_desc1: 'படிப்புக்கோ, வேலைக்கோ, புதிய வாழ்க்கைக்கோ நீங்கள் செல்கிறீர்களோ —',
    // hero_desc2: 'உங்கள் தமிழ் சமூகம் ஏற்கனவே உங்களுக்காக காத்திருக்கிறது.',
    hero_join_community: 'சமூகத்தில் சேருங்கள்',
    hero_how_it_works: 'எப்படி செயல்படுகிறது',
    pill_jobs_label: 'வேலைகள்',
    pill_jobs_stat: '2.5K+ பட்டியல்கள்',
    pill_communities_label: 'சமூகங்கள்',
    pill_communities_stat: '500+ குழுக்கள்',
    pill_events_label: 'நிகழ்வுகள்',
    pill_events_stat: '1K+ நடத்தப்பட்டது',
    pill_support_label: 'ஆதரவு',
    pill_support_stat: '24/7 செயலில்',
    pill_help_label: 'உதவி',
    pill_help_stat: 'எப்போதும் இங்கே',
    pill_business_label: 'வணிகம்',
    pill_business_stat: '800+ பதிவு',
    trust_secure: 'பாதுகாப்பான & தனிப்பட்ட',
    trust_free: 'அனைவருக்கும் இலவசம்',
    trust_worldwide: 'உலகெங்கும் கிடைக்கும்',

    // ── Features Section ──
    feat_pill: 'தள சேவைகள்',
    feat_title1: 'வெளிநாட்டில் தேவையான அனைத்தும்,',
    feat_title2: 'ஒரே இடத்தில்.',
    feat_sub: 'வேலைகள், கல்வி, ஆதரவு, நிகழ்வுகள் மற்றும் நண்பர்களின் சமூகம் — உங்களுக்குத் தேவையான அனைத்தும், ஒரே தளத்தில்.',

    // ── Communities Section ──
    comm_pill: 'நாட்டு சமூகங்கள்',
    comm_title1: 'உலகில் எங்கும்',
    comm_title2: 'தமிழர்கள் இருக்கிறார்கள்',
    comm_sub: 'உங்கள் நாட்டில் வாழும் தமிழர்களுடன் இணைந்துகொள்ளுங்கள். நீங்கள் மாணவராயினும், வேலை தேடுபவராயினும், புதியவராயினும், வணிகராயினும் — உங்கள் சூழ்நிலையை புரிந்துகொள்ளும் மக்களுடன் உள்ளூர் வழிகாட்டுதல் பெறலாம், கேள்விகள் கேட்கலாம், அர்த்தமுள்ள தொடர்புகளை உருவாக்கலாம்.',
    comm_group_chat_title: 'குழு அரட்டை',
    comm_group_chat_desc: 'உறுப்பினர்கள் நாட்டு சார்ந்த கலந்துரையாடல்களில் பங்கேற்று, கேள்விகள் கேட்டு, உள்ளூர் தகவல்களில் ஒருவருக்கொருவர் உதவிக்கொள்ளலாம்.',
    comm_local_help_title: 'உள்ளூர் உதவி',
    comm_local_help_desc: 'புதிய உறுப்பினர்கள் வசிப்பிடம், போக்குவரத்து, வங்கி, சுகாதாரம், வேலை தேடல் மற்றும் குடியேற்றம் குறித்த உதவிகளைப் பெறலாம்.',
    comm_guidance_title: 'வழிகாட்டுதல்',
    comm_guidance_desc: 'அனுபவமிக்க சமூக உறுப்பினர்கள் விசா, பல்கலைக்கழகங்கள், தொழில், வணிக வாய்ப்புகள் மற்றும் அன்றாட வாழ்க்கை பற்றிய நடைமுறை ஆலோசனைகளை வழங்குகிறார்கள்.',
    comm_active: 'செயலில்',
    comm_chat_community_name: 'யுகே தமிழர் சமூகம்',
    comm_chat_active_status: 'செயலில் உள்ள சமூகம்',
    comm_chat_sender_name: 'முருகன்',
    comm_chat_online_badge: '🟢 நேரடியில்',
    comm_chat_murugan_msg: 'வணக்கம், நான் சமீபத்தில் யுகே வந்தேன். பகுதிநேர வேலைகளை தேட நல்ல இணையதளங்கள் ஏதேனும் பரிந்துரைக்க முடியுமா?',
    comm_chat_member_name: 'சமூக உறுப்பினர்',
    comm_chat_reply_msg: 'வரவேற்கிறோம்! Indeed, Reed மற்றும் Gumtree இல் தொடங்கலாம். நீங்கள் எந்த நகரில் இருக்கிறீர்கள் என்று சொன்னால் மேலும் குறிப்பிட்ட பரிந்துரைகள் தர முடியும்.',
    comm_browse_all: 'அனைத்து சமூகங்களையும் காண்க',

    // ── Timeline / How It Works ──
    timeline_pill: 'எப்படி செயல்படுகிறது',
    timeline_title1: 'உங்கள் பயணம்',
    timeline_title2: 'நான்கு எளிய படிகளில்',
    timeline_sub: 'பதிவு செய்வதிலிருந்து உங்கள் சமூகத்தை கண்டுபிடிக்கும் வரை — இப்படித்தான் செயல்படுகிறது.',

    // ── Testimonials ──
    testi_pill: 'உண்மையான கதைகள்',
    testi_title_pre: 'உண்மையான',
    testi_title_accent: 'கதைகள்',
    testi_sub: 'உலகெங்கிலும் உள்ள தமிழர்களின் அனுபவங்களை படியுங்கள்.',

    // ── About ──
    about_pill: 'எங்களைப் பற்றி',
    about_title1: 'எங்கள் நோக்கமே',
    about_title2: 'உங்கள் சமூகம்',
    about_sub: 'உலகெங்கிலும் வாழும் தமிழர்களை இணைத்து, ஆதரித்து, வலுப்படுத்துகிறோம்.',
    about_mission_title: 'நாம் ஏன் இதை உருவாக்கினோம்',
    about_mission_text: 'TamilConnect ஒரு எளிய உண்மையிலிருந்து பிறந்தது — வெளிநாட்டில் தமிழர்கள் அடிக்கடி தனிமையாக உணர்கிறார்கள். நீங்கள் உலகின் எங்கு சென்றாலும், உங்கள் தமிழ் சமூகம் ஏற்கனவே அங்கே காத்திருக்கும் என்பதற்காக இந்த தளத்தை உருவாக்கினோம். நீங்கள் மாணவராயினும், தொழிலாளராயினும், நிபுணராயினும் அல்லது வணிகராயினும், ஒரு புதிய நாட்டை தனியாக எதிர்கொள்ளத் தேவையில்லை. TamilConnect உலகெங்கிலும் வாழும் தமிழர்களை இணைக்கவும், ஆதரிக்கவும், வலுப்படுத்தவும் இருக்கிறது.',
    about_location: 'உலகெங்கும் கிடைக்கும்',
    about_join_now: 'இப்போது சேருங்கள்',
    about_log_in: 'உள்நுழைவு',

    // ── Trust & Safety ──
    trust_badge: 'நம்பகம் & பாதுகாப்பு',
    trust_title: 'உங்கள் பாதுகாப்பு முதலிடம் பெறுகிறது.',
    trust_sub: 'TamilConnect உறுப்பினர்கள் பாதுகாப்பான மற்றும் நம்பகமான சூழலில் இணைந்து, தொடர்புகொண்டு, ஒருவருக்கொருவர் ஆதரிக்க உதவுவதற்காக உருவாக்கப்பட்டுள்ளது.',
    trust_tagline: 'நம்பிக்கையுடன் இணையுங்கள். உங்கள் பாதுகாப்பும் தனியுரிமையும் TamilConnect இல் எப்போதும் பாதுகாக்கப்படுகின்றன.',

    // ── Blog ──
    blog_pill: 'வலைப்பதிவு & புதுப்பிப்புகள்',
    blog_title1: 'சமீபத்திய',
    blog_title2: 'கட்டுரைகள்',
    blog_sub: 'உலகெங்கிலும் வாழும் தமிழர்களுக்கான குறிப்புகள், வழிகாட்டிகள், சமூக புதுப்பிப்புகள் மற்றும் வாய்ப்புகள்.',
    blog_read_more: 'மேலும் படிக்கவும்',

    // ── Contact ──
    contact_pill: 'தொடர்பு கொள்ளுங்கள்',
    contact_title1: 'நாங்கள் இங்கே இருக்கிறோம்',
    contact_title2: 'உங்களுக்காக',
    contact_sub: 'ஒரு கேள்வி இருக்கிறதா அல்லது குடியேற உதவி தேவையா? TamilConnect குழு நீங்கள் எங்கிருந்தாலும் உங்களுக்கு ஆதரவு தர தயாராக இருக்கிறது.',
    contact_badge: 'எப்போதும் உங்களுக்காக இங்கே',
    contact_panel_title: 'வெளிநாட்டில் வாழும் ஒவ்வொரு தமிழருக்கும் உதவ நாங்கள் இங்கே இருக்கிறோம்.',
    contact_panel_desc: 'தளம் பற்றிய கேள்வியோ, ஆதரவு தேவையோ, அல்லது கருத்துக்கள் தர விரும்பினாலோ, எங்கள் குழு எப்போதும் கிடைக்கும்.',
    contact_email_label: 'மின்னஞ்சல் அனுப்புங்கள்',
    contact_email_note: '24 மணி நேரத்தில் பதிலளிப்போம்',
    contact_whatsapp_label: 'வாட்ஸ்அப் ஆதரவு',
    contact_whatsapp_value: 'சமூக உதவி சேனல்',
    contact_whatsapp_note: 'விரைவான பதில்கள்',
    contact_worldwide_label: 'உலகெங்கும் கிடைக்கும்',
    contact_worldwide_value: '40+ நாடுகள்',
    contact_worldwide_note: 'தமிழர்கள் தமிழர்களுக்கு உதவுகிறார்கள்',
    contact_form_title: 'எங்களுக்கு செய்தி அனுப்புங்கள்',
    contact_success_title: 'செய்தி அனுப்பப்பட்டது!',
    contact_success_desc: 'தொடர்பு கொண்டதற்கு நன்றி. 24 மணி நேரத்தில் திரும்பவும் தொடர்பு கொள்வோம்.',
    contact_send_another: 'மற்றொரு செய்தி அனுப்புங்கள்',
    contact_first_name: 'முதல் பெயர்',
    contact_last_name: 'கடைசி பெயர்',
    contact_email_address: 'மின்னஞ்சல் முகவரி',
    contact_subject_label: 'விஷயம்',
    contact_message_label: 'செய்தி',
    contact_send_message_btn: 'செய்தி அனுப்புங்கள்',
    contact_select_topic: 'ஒரு தலைப்பைத் தேர்ந்தெடுங்கள்...',
    contact_tell_us: 'நாங்கள் எப்படி உதவலாம் என்று சொல்லுங்கள்...',
    err_first_name: 'முதல் பெயர் அவசியம்.',
    err_last_name: 'கடைசி பெயர் அவசியம்.',
    err_email: 'சரியான மின்னஞ்சல் முகவரி அவசியம்.',
    err_subject: 'தயவுசெய்து ஒரு விஷயம் தேர்ந்தெடுங்கள்.',
    err_message: 'செய்தி குறைந்தது 10 எழுத்துக்கள் இருக்க வேண்டும்.',

    // ── CTA Banner ──
    cta_badge: 'உலகின் எந்த மூலையிலும் — உங்கள் தமிழ் சமூகம் உங்களுடன்',
    cta_title1: 'வெளிநாட்டில்',
    cta_title2: 'நீங்கள் தனியாக இல்லை',
    cta_desc: 'உலகெங்கிலும் மில்லியன் கணக்கான தமிழர்கள் வாழ்கிறார்கள். நீங்கள் படிக்கிறீர்களோ, வேலை செய்கிறீர்களோ, வணிகம் நடத்துகிறீர்களோ, அல்லது வேறொரு நாட்டில் புதிய வாழ்க்கை தொடங்குகிறீர்களோ — TamilConnect உங்கள் பயணத்தை புரிந்துகொள்ளும் மக்களுடன் இணைய உதவுகிறது.',
    cta_join_free: 'இலவசமாக TamilConnect-ல் சேருங்கள்',
    cta_already_member: 'ஏற்கனவே உறுப்பினரா? உள்நுழையுங்கள்',
    cta_network_text: '40+ நாடுகளில் உள்ள தமிழர்களுடன் இணைந்து இன்றே உங்கள் வலைப்பின்னலை உருவாக்குங்கள்.',
    cta_trust1: '40+ நாடுகள்',
    cta_trust2: 'உலகெங்கும் 10 மில்லியன்+ தமிழர்கள்',
    cta_trust3: 'இன்று இலவசமாக சேருங்கள்',

    // ── Footer ──
    footer_desc: 'சமூகம், ஆதரவு, வாய்ப்புகள் மற்றும் அர்த்தமுள்ள உறவுகள் மூலம் வெளிநாட்டில் வாழும் தமிழர்களை இணைக்கிறோம்.',
    footer_tagline: 'உலக தமிழ் சமூகத்தின் டிஜிட்டல் வீடு.',
    footer_platform: 'தளம்',
    footer_platform_communities: 'நாட்டு சமூகங்கள்',
    footer_platform_jobs: 'வேலைகள் & தொழில்',
    footer_platform_students: 'மாணவர் பகுதி',
    footer_platform_help: 'உதவி மையம்',
    footer_platform_events: 'நிகழ்வுகள் & திருவிழாக்கள்',
    footer_platform_share: 'பொருட்களை பகிரவும்',
    footer_platform_chat: 'நேரடி அரட்டை',
    footer_platform_business: 'தமிழ் வணிக அட்டவணை',
    footer_community: 'சமூகம்',
    footer_comm_uk: 'யுகே தமிழர்கள்',
    footer_comm_de: 'ஜெர்மனி தமிழர்கள்',
    footer_comm_ca: 'கனடா தமிழர்கள்',
    footer_comm_au: 'ஆஸ்திரேலியா தமிழர்கள்',
    footer_comm_sg: 'சிங்கப்பூர் தமிழர்கள்',
    footer_comm_uae: 'UAE தமிழர்கள்',
    footer_comm_nz: 'நியூசிலாந்து தமிழர்கள்',
    footer_comm_ie: 'அயர்லாந்து தமிழர்கள்',
    footer_comm_all: 'அனைத்து நாடுகளும்',
    footer_support: 'ஆதரவு',
    footer_about_us: 'எங்களைப் பற்றி',
    footer_contact_us: 'தொடர்பு கொள்ளுங்கள்',
    footer_privacy: 'தனியுரிமை கொள்கை',
    footer_terms: 'விதிமுறைகள் & நிபந்தனைகள்',
    footer_safety: 'பாதுகாப்பு குறிப்புகள்',
    footer_report: 'சிக்கலை புகாரளிக்கவும்',
    footer_copyright: 'உலகெங்கிலும் வாழும் தமிழர்களுக்காக கட்டமைக்கப்பட்டது.',
    footer_made_with: 'இதயத்துடன்',
    footer_made_for: 'உலக தமிழ் புலம்பெயர் சமூகத்திற்காக உருவாக்கப்பட்டது.',
    footer_privacy_link: 'தனியுரிமை',
    footer_terms_link: 'விதிமுறைகள்',
    footer_cookies_link: 'குக்கீகள்',

    // ── Data Arrays ──
    features: [
      {
        icon: 'bi-globe2',
        title: 'நாட்டு சமூகங்கள்',
        desc: 'யுகே, ஜெர்மனி, கனடா, ஆஸ்திரேலியா — ஒவ்வொரு நாட்டிலும் ஒரு தொடர்புடைய தமிழ் சமூகம். புதியவர்கள் உள்ளூர் தமிழர்களுடன் இணைந்து வழிகாட்டுதல், ஆதரவு மற்றும் நடைமுறை உதவிகளைப் பெறலாம்.',
        tags: ['குழு அரட்டை', 'உள்ளூர் உதவி', 'வழிகாட்டுதல்'],
        color: 'primary', featured: false
      },
      {
        icon: 'bi-briefcase-fill',
        title: 'வேலைகள் & தொழில்',
        desc: 'உலகெங்கிலும் உள்ள தமிழர்கள் மூலம் நேரடியாக வேலை வாய்ப்புகளை பகிர்ந்துகொள்ளுங்கள் — முழு நேரம், பகுதி நேரம், ஸ்பான்சர் வேலைகள் மற்றும் இன்டர்ன்ஷிப்கள்.',
        tags: ['முழு நேரம்', 'பகுதி நேரம்', 'ஸ்பான்சர்'],
        color: 'green', featured: false
      },
      {
        icon: 'bi-mortarboard-fill',
        title: 'மாணவர் பகுதி',
        desc: 'வெளிநாட்டில் படிக்கும் மாணவர்களுக்கென்றே வடிவமைக்கப்பட்டது — பல்கலைக்கழக குறிப்புகள், உதவித்தொகை தகவல்கள், பகுதி நேர வேலை வாய்ப்புகள் மற்றும் திட்ட ஆதரவு.',
        tags: ['உதவித்தொகைகள்', 'பல்கலைக்கழகங்கள்', 'திட்டங்கள்'],
        color: 'violet', featured: false
      },
      {
        icon: 'bi-shield-fill-check',
        title: 'உதவி & ஆதரவு',
        desc: 'சட்ட உதவி, அவசரநிலை அல்லது மருத்துவ ஆதரவுக்கு, நம்பகமான தமிழ் சமூக உறுப்பினர்களுடன் இணைந்து வழிகாட்டுதலும் உதவியும் பெறலாம்.',
        tags: ['சட்ட உதவி', 'அவசரநிலை', 'ஆலோசனை'],
        color: 'pink', featured: false
      },
      {
        icon: 'bi-calendar-event-fill',
        title: 'நிகழ்வுகள் & திருவிழாக்கள்',
        desc: 'நீங்கள் வாழும் நாட்டில் நடைபெறும் தீபாவளி, பொங்கல் மற்றும் தமிழ் புத்தாண்டு கொண்டாட்டங்களை கண்டறிந்து கலந்துகொள்ளுங்கள்.',
        tags: ['திருவிழாக்கள்', 'கூட்டங்கள்', 'நிகழ்வுகள்'],
        color: 'yellow', featured: false
      },
      {
        icon: 'bi-gift-fill',
        title: 'பொருட்களை பகிரவும்',
        desc: 'தளபாடங்கள், மின்னணு சாதனங்கள், புத்தகங்கள், சமையலறை பொருட்கள் — பயன்படுத்தப்படாத பொருட்களை கொடுங்கள் அல்லது பெறுங்கள், மற்றவர்களுக்கு உதவுங்கள்.',
        tags: ['இலவச பொருட்கள்', 'தளபாடங்கள்', 'புத்தகங்கள்'],
        color: 'accent', featured: false
      },
      {
        icon: 'bi-chat-dots-fill',
        title: 'நேரடி அரட்டை',
        desc: 'தனிப்பட்ட அரட்டைகள், நாட்டு குழு அரட்டைகள் மற்றும் வேலைகள், மாணவர்கள், வணிகம் போன்ற தலைப்பு அடிப்படையிலான குழுக்கள் — சமூகத்துடன் நேரடியாக தொடர்புகொள்ளுங்கள்.',
        tags: ['தனிப்பட்ட', 'குழுக்கள்', 'தலைப்புகள்'],
        color: 'primary', featured: false
      },
      {
        icon: 'bi-shop',
        title: 'தமிழ் வணிகம்',
        desc: 'வெளிநாட்டில் வணிகம் நடத்தும் தமிழர்கள் தங்கள் வணிகங்களை பதிவு செய்து காட்சிப்படுத்தலாம் — உலக தமிழ் சமூகத்தினரிடையே நேரடி வர்த்தகம் மேற்கொள்ளலாம்.',
        tags: ['அட்டவணை', 'வர்த்தகம்', 'சேவைகள்'],
        color: 'violet', featured: false
      },
      {
        icon: 'bi-person-badge-fill',
        title: 'உறுப்பினர் சுயவிவரங்கள்',
        desc: 'நாடு, நகரம், தொழில் மற்றும் கல்வி உள்ளிட்ட விவரங்களுடன் சுயவிவரம் உருவாக்கி, தமிழர்களை தேடி இணைந்துகொள்ளுங்கள். எங்கிருந்தாலும் சரியான மக்களை எளிதாக கண்டுபிடியுங்கள்.',
        tags: ['தேடல்', 'இணைவு', 'சரிபார்க்கப்பட்டது'],
        color: 'green', featured: false
      }
    ],

    steps: [
      {
        num: '01',
        title: 'பதிவு செய்யுங்கள்',
        desc: 'உங்கள் பெயர், நாடு, நகரம் மற்றும் தொழில் அல்லது படிப்புத் துறை ஆகியவற்றை சேர்த்து சுலபமாக சுயவிவரம் உருவாக்குங்கள். இது முற்றிலும் இலவசம்.',
        color: 'primary'
      },
      {
        num: '02',
        title: 'உங்கள் நாட்டைத் தேர்ந்தெடுங்கள்',
        desc: 'நீங்கள் வாழும் நாட்டில் உள்ள தமிழ் சமூகத்தில் சேர்ந்து உள்ளூர் உறுப்பினர்களுடன் தொடர்புகொள்ளுங்கள்.',
        color: 'violet'
      },
      {
        num: '03',
        title: 'உதவி பெறுங்கள் அல்லது ஆதரவு வழங்குங்கள்',
        desc: 'வேலைகள், படிப்பு, சட்ட உதவி அல்லது பகிர்ந்த பொருட்கள் என்பதற்கான உதவியைக் கண்டறியுங்கள். உங்கள் அறிவையும் வளங்களையும் வழங்கி சமூகத்தில் மற்றவர்களுக்கு ஆதரவாக இருங்கள்.',
        color: 'green'
      },
      {
        num: '04',
        title: 'உங்கள் வலைப்பின்னலை வளர்த்துக்கொள்ளுங்கள்',
        desc: 'புதிய நண்பர்களை உருவாக்குங்கள், நிகழ்வுகளில் பங்கேற்குங்கள், மற்றும் நீங்கள் எங்கிருந்தாலும் தமிழ் சமூகத்துடன் அர்த்தமுள்ள தொடர்புகளை கட்டிடுங்கள்.',
        color: 'pink'
      }
    ],

    testimonials: [
      {
        name: 'Murugan Selvam',
        location: 'மான்செஸ்டர், யுகே',
        category: 'வீட்டு வசதி & வேலைகள்',
        initial: 'M',
        quote: 'நான் முதலில் யுகே வந்தபோது யாரும் அறிமுகமில்லாமல் முற்றிலும் தனிமையாக உணர்ந்தேன். TamilConnect மூலம் மான்செஸ்டரில் வாழும் மற்ற தமிழர்களுடன் இணைந்தேன். அவர்கள் வசிப்பிடம் கண்டுபிடிக்க உதவினார்கள், உள்ளூர் நடைமுறைகள் பற்றி வழிகாட்டினார்கள், வேலை வாய்ப்புகளையும் பகிர்ந்தார்கள். மாதங்கள் ஆகக்கூடியது சமூகத்தின் உதவியால் மிகவும் எளிதாகியது.',
        color: 'primary',
        rating: 5
      },
      {
        name: 'Kavitha Rajan',
        location: 'பர்லின், ஜெர்மனி',
        category: 'மாணவர் ஆதரவு',
        initial: 'K',
        quote: 'ஜெர்மனியில் படிக்கும்போது பகுதிநேர வேலை கண்டுபிடிக்க தெரியாமல் திணறினேன். மாணவர் பகுதி மூலம் ஒரு தமிழ் மூத்தவர் உள்ளூர் வேலை சந்தை மற்றும் பல்கலைக்கழக வளங்கள் பற்றி என்னை வழிகாட்டினார். இன்று நான் ஒரு கஃபேயில் பகுதிநேரமாக பணிபுரிகிறேன், என்னைச் சுற்றி ஒரு வலுவான ஆதரவு வலையமைப்பு உள்ளது.',
        color: 'violet',
        rating: 5
      },
      {
        name: 'Arjun Kumar',
        location: 'டொரொண்டோ, கனடா',
        category: 'சமூக வலைப்பின்னல்',
        initial: 'A',
        quote: 'கனடாவுக்கு குடிபெயர்ந்தது எனக்கு மிகுந்த உற்சாகமாக இருந்தாலும், அதே நேரத்தில் சற்று சவாலாகவும் இருந்தது. எங்கு தொடங்குவது என்று எனக்குத் தெரியவில்லை. TamilConnect மூலம் டொரோண்டோவில் வசிக்கும் தமிழர்களுடன் தொடர்பு கொண்டு, சமூக நிகழ்வுகளில் கலந்து கொண்டு, சில வாரங்களிலேயே உண்மையான நட்புகளை உருவாக்க முடிந்தது. இதனால் புதிய நாட்டில் என் வாழ்க்கையை அமைத்துக்கொள்வது மிகவும் எளிதானதாக மாறியது.',
        color: 'green',
        rating: 5
      },
      {
        name: 'Priya Nandakumar',
        location: 'சிட்னி, ஆஸ்திரேலியா',
        category: 'உதவி & ஆதரவு',
        initial: 'P',
        quote: 'விசா நடைமுறைகள் மற்றும் உள்ளூர் சேவைகள் பற்றி ஆலோசனை தேவைப்பட்டபோது, ஆஸ்திரேலியா தமிழ் சமூக உறுப்பினர்கள் மிகவும் உதவிகரமாக இருந்தனர். நான் பெற்ற வழிகாட்டுதல் எனக்கு நேரம் மிச்சப்படுத்தியது, மன அழுத்தத்தை குறைத்தது மற்றும் நம்பிக்கையை அளித்தது.',
        color: 'pink',
        rating: 5
      }
    ],

    aboutStats: [
      { value: '100%',  label: 'வளர்ந்து வரும் சமூகம்' },
      { value: '40+',  label: 'நாடுகள்' },
      { value: '100%',   label: 'இலவசம் எப்போதும்' },
      { value: '100%', label: 'பாதுகாப்பானது' }
    ],

    aboutChips: ['தமிழர்களால் தமிழர்களுக்காக', 'நம்பகமான தளம்', 'அனைவரும் வரவேற்கப்படுகிறார்கள்', 'உலகளாவிய சமூகம்'],

    trustCards: [
      {
        icon: 'bi-patch-check-fill',
        title: 'சரிபார்க்கப்பட்ட சுயவிவரங்கள்',
        desc: 'உறுப்பினர்கள் சமூகத்தில் நம்பகத்தன்மையை வளர்க்க தங்கள் சுயவிவரங்களை சரிபார்க்கலாம். சரிபார்க்கப்பட்ட பயனர்கள் ஒரு பேட்ஜ் பெறுவார்கள், உண்மையான மற்றும் நம்பகமான நபர்களுடன் மற்றவர்கள் இணைய உதவுகிறது.',
        color: 'primary'
      },
      {
        icon: 'bi-shield-fill-x',
        title: 'தடுத்தல் & புகாரளிக்கவும்',
        desc: 'விரும்பாத பயனர்களை உடனடியாக தடுத்து, பொருத்தமற்ற நடத்தை, துன்புறுத்தல், ஸ்பாம் அல்லது சந்தேகத்திற்கிடமான செயல்களை புகாரளிக்கவும். புகாரளிக்கப்பட்ட கணக்குகள் நிர்வாகிகளால் ஆய்வு செய்யப்படுகின்றன.',
        color: 'pink'
      },
      {
        icon: 'bi-lock-fill',
        title: 'தனியுரிமை முதலிடம்',
        desc: 'தனிப்பட்ட தகவல்கள் பாதுகாக்கப்படுகின்றன மற்றும் உங்கள் தனியுரிமை அமைப்புகளுக்கு ஏற்றவாறு மட்டுமே பகிரப்படும். மற்றவர்கள் என்ன பார்க்கலாம் என்பதில் உங்களுக்கு முழு கட்டுப்பாடு உள்ளது.',
        color: 'violet'
      },
      {
        icon: 'bi-funnel-fill',
        title: 'ஸ்பாம் கண்டறிதல்',
        desc: 'சந்தேகத்திற்கிடமான செயல்கள், போலி கணக்குகள் மற்றும் ஸ்பாம் செய்திகள் தானாகவே கண்டறியப்பட்டு நீக்கப்படும், தளத்தை பாதுகாப்பாகவும் நம்பகமாகவும் வைக்கும்.',
        color: 'green'
      }
    ],

    footerMetrics: [
      { icon: 'bi-briefcase-fill',      value: '1,240+', label: 'வேலைகள் பதிவிடப்பட்டன' },
      { icon: 'bi-mortarboard-fill',    value: '3,800+', label: 'மாணவர்கள் இணைந்தனர்' },
      { icon: 'bi-hand-thumbs-up-fill', value: '9,500+', label: 'உதவி கோரிக்கைகள் தீர்க்கப்பட்டன' },
      { icon: 'bi-globe2',              value: '40+',    label: 'நாடுகள் உள்ளடக்கப்பட்டன' },
    ],

    blogPosts: [
      {
        title: 'வெளிநாட்டில் பகுதிநேர வேலை எப்படி கண்டுபிடிப்பது: முழுமையான தமிழ் வழிகாட்டி',
        excerpt: 'வேலைகளை தேடும் இடங்கள், சி.வி. தயாரிப்பு, நேர்காணல்கள் வெற்றிகரமாக முடிப்பது மற்றும் உங்கள் நாட்டில் பகுதிநேர வாய்ப்புகளை கண்டுபிடிப்பது — படிப்படியாக.',
        category: 'வேலைகள் & மாணவர்கள்',
        readTime: '6 நிமிட வாசிப்பு',
        date: 'ஜூன் 01, 2026',
        color: 'primary'
      },
      {
        title: 'புதிய நாட்டில் முதல்முறை வந்தால் என்ன செய்வது: தமிழ் சமூக வழிகாட்டி',
        excerpt: 'வீட்டு வசதி கண்டுபிடிப்பது, வங்கி கணக்கு திறப்பது, சிம் கார்டு வாங்குவது மற்றும் உள்ளூர் தமிழ் சமூகத்துடன் இணைவது — சுமூகமான தொடக்கத்திற்கு தேவையான அனைத்தும்.',
        category: 'நாட்டு சமூகங்கள்',
        readTime: '7 நிமிட வாசிப்பு',
        date: 'மே 20, 2026',
        color: 'violet'
      },
      {
        title: 'இந்த ஆண்டு ஐரோப்பாவில் நடைபெறும் முக்கிய தமிழ் திருவிழாக்கள் மற்றும் நிகழ்வுகள்',
        excerpt: 'பொங்கல் கொண்டாட்டங்கள், தமிழ் புத்தாண்டு கூட்டங்கள், கலாச்சார நிகழ்வுகள் — இந்த ஆண்டு ஐரோப்பாவில் தவிர்க்கக்கூடாத தமிழ் நிகழ்வுகள்.',
        category: 'நிகழ்வுகள் & திருவிழாக்கள்',
        readTime: '4 நிமிட வாசிப்பு',
        date: 'மே 10, 2026',
        color: 'green'
      }
    ],

    marqueeItems: [
      { icon: 'bi-people-fill',         text: 'சமூகங்கள்' },
      { icon: 'bi-calendar-event-fill', text: 'நிகழ்வுகள்' },
      { icon: 'bi-briefcase-fill',      text: 'வேலைகள்' },
      { icon: 'bi-shop',                text: 'வணிகங்கள்' },
      { icon: 'bi-chat-dots-fill',      text: 'இடுகைகள்' },
      { icon: 'bi-bell-fill',           text: 'அறிவிப்புகள்' },
      { icon: 'bi-people-fill',         text: 'சமூகங்கள்' },
      { icon: 'bi-calendar-event-fill', text: 'நிகழ்வுகள்' },
      { icon: 'bi-briefcase-fill',      text: 'வேலைகள்' },
      { icon: 'bi-shop',                text: 'வணிகங்கள்' },
      { icon: 'bi-chat-dots-fill',      text: 'இடுகைகள்' },
      { icon: 'bi-bell-fill',           text: 'அறிவிப்புகள்' }
    ],

    contactSubjectOptions: [
      { value: 'general',     label: 'பொது விசாரணை' },
      { value: 'question',    label: 'தளத்தைப் பற்றிய கேள்விகள்' },
      { value: 'feedback',    label: 'கருத்துக்கள் மற்றும்  பரிந்துரைகள்' },
      { value: 'partnership', label: 'இணைவு அல்லது ஒத்துழைப்பு' },
      { value: 'other',       label: 'மற்றவை' },
    ] as SelectOption[],
  }
};

type Lang = 'en' | 'ta';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, SearchableSelectComponent],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss']
})
export class LandingComponent implements OnInit, OnDestroy, AfterViewInit {

  constructor(
    @Inject(PLATFORM_ID) private platformId: object,
    private el: ElementRef,
    private zone: NgZone,
    private translate: TranslateService
  ) {}

  // ── Language ──
  currentLang: Lang = 'en';

  /** Active translation object — use {{ t.key }} in the template. */
  get t() {
    return this.currentLang === 'en' ? TRANSLATIONS.en : TRANSLATIONS.ta;
  }

  toggleLanguage(): void {
    this.currentLang = this.currentLang === 'en' ? 'ta' : 'en';
    this.translate.use(this.currentLang);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('landing-lang', this.currentLang);
    }
  }

  private loadLanguage(): void {
    if (isPlatformBrowser(this.platformId)) {
      const saved = localStorage.getItem('landing-lang') as Lang | null;
      if (saved === 'en' || saved === 'ta') {
        this.currentLang = saved;
        this.translate.use(this.currentLang);
      }
    }
  }

  // ── Theme ──
  currentTheme: 'dark' | 'light' = 'light';

  @HostBinding('attr.data-theme')
  get theme(): string { return this.currentTheme; }

  /** Exposes lang="en"|"ta" on the host so :host[lang="ta"] SCSS rules apply. */
  @HostBinding('attr.lang')
  get langAttr(): string { return this.currentLang; }

  toggleTheme(): void {
    this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('landing-theme', this.currentTheme);
    }
  }

  private loadTheme(): void {
    if (isPlatformBrowser(this.platformId)) {
      const saved = localStorage.getItem('landing-theme') as 'dark' | 'light' | null;
      if (saved) this.currentTheme = saved;
    }
  }

  // ── Navbar ──
  navScrolled = false;
  mobileOpen = false;
  activeSection = 'home';

  @HostListener('window:scroll')
  onScroll(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.navScrolled = window.scrollY > 40;
    }
  }

  toggleMobile(): void { this.mobileOpen = !this.mobileOpen; }
  closeMobile(): void { this.mobileOpen = false; }
  setActive(s: string): void { this.activeSection = s; }

  applicationName = 'TamilConnect';

  // ── Communities Showcase (proper nouns — not translated) ──
  @ViewChild('commScroll') commScrollRef!: ElementRef<HTMLElement>;
  @ViewChild('testiScroll') testiScrollRef!: ElementRef<HTMLElement>;

  communities = [
    { code: 'gb', country: 'United Kingdom',  name: 'UK Tamils Community',          members: 3240, color: 'primary' },
    { code: 'de', country: 'Germany',          name: 'Germany Tamils Community',     members: 2180, color: 'violet' },
    { code: 'fr', country: 'France',           name: 'France Tamils Community',      members: 1450, color: 'pink'   },
    { code: 'ca', country: 'Canada',           name: 'Canada Tamils Community',      members: 2890, color: 'green'  },
    { code: 'au', country: 'Australia',        name: 'Australia Tamils Community',   members: 2640, color: 'yellow' },
    { code: 'ch', country: 'Switzerland',      name: 'Switzerland Tamils Community', members: 980,  color: 'accent' },
    { code: 'nl', country: 'Netherlands',      name: 'Netherlands Tamils Community', members: 1230, color: 'primary'},
    { code: 'no', country: 'Norway',           name: 'Norway Tamils Community',      members: 760,  color: 'violet' },
    { code: 'se', country: 'Sweden',           name: 'Sweden Tamils Community',      members: 1120, color: 'green'  },
    { code: 'dk', country: 'Denmark',          name: 'Denmark Tamils Community',     members: 890,  color: 'pink'   },
    { code: 'it', country: 'Italy',            name: 'Italy Tamils Community',       members: 1680, color: 'yellow' },
    { code: 'be', country: 'Belgium',          name: 'Belgium Tamils Community',     members: 720,  color: 'accent' },
    { code: 'at', country: 'Austria',          name: 'Austria Tamils Community',     members: 560,  color: 'primary'},
    { code: 'sg', country: 'Singapore',        name: 'Singapore Tamils Community',   members: 4120, color: 'violet' },
    { code: 'us', country: 'United States',    name: 'USA Tamils Community',         members: 5380, color: 'green'  },
    { code: 'nz', country: 'New Zealand',      name: 'New Zealand Tamils Community', members: 890,  color: 'pink'   },
    { code: 'ie', country: 'Ireland',          name: 'Ireland Tamils Community',     members: 670,  color: 'accent' },
    { code: 'es', country: 'Spain',            name: 'Spain Tamils Community',       members: 540,  color: 'yellow' },
    { code: 'pt', country: 'Portugal',         name: 'Portugal Tamils Community',    members: 420,  color: 'primary'},
    { code: 'fi', country: 'Finland',          name: 'Finland Tamils Community',     members: 380,  color: 'violet' },
  ];

  scrollCommunities(direction: 'left' | 'right'): void {
    const el = this.commScrollRef?.nativeElement;
    if (!el) return;
    const scrollAmount = 280;
    el.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
  }

  scrollTestimonials(direction: 'left' | 'right'): void {
    const el = this.testiScrollRef?.nativeElement;
    if (!el) return;
    const scrollAmount = 400;
    el.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
  }

  // ── Contact Form ──
  contact = { firstName: '', lastName: '', email: '', subject: '', message: '' };
  contactSubmitted = false;

  submitContact(): void {
    this.contactSubmitted = true;
  }

  resetContactForm(): void {
    this.contact = { firstName: '', lastName: '', email: '', subject: '', message: '' };
    this.contactSubmitted = false;
  }

  // ── Counter animation ──
  counterValues: Record<string, string> = {};
  private countersAnimated = false;

  // ── Observers & lifecycle ──
  private sectionObserver!: IntersectionObserver;
  private revealObserver!: IntersectionObserver;
  private readonly sectionIds = ['home', 'features', 'communities', 'how-it-works', 'testimonials', 'about', 'blog', 'contact'];

  ngOnInit(): void {
    this.loadTheme();
    this.loadLanguage();
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.setupSectionObserver();
      this.setupRevealObserver();
      this.setupCounterObserver();
    }
  }

  ngOnDestroy(): void {
    this.sectionObserver?.disconnect();
    this.revealObserver?.disconnect();
  }

  private setupSectionObserver(): void {
    this.sectionObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length) {
          this.zone.run(() => {
            this.activeSection = visible[0].target.id;
          });
        }
      },
      { threshold: [0.2, 0.5], rootMargin: '-60px 0px -30% 0px' }
    );
    this.sectionIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) this.sectionObserver.observe(el);
    });
  }

  private setupRevealObserver(): void {
    this.revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            this.revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -50px 0px' }
    );
    const els = this.el.nativeElement.querySelectorAll('.rv, .rvl, .rvr, .rvs');
    els.forEach((e: Element) => this.revealObserver.observe(e));
  }

  private setupCounterObserver(): void {
    const target = this.el.nativeElement.querySelector('.lp-about-stats');
    if (!target) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !this.countersAnimated) {
            this.countersAnimated = true;
            this.animateCounters();
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    obs.observe(target);
  }

  private animateCounters(): void {
    const items = [
      { key: '100%', target: 100, suffix: '%' },
      { key: '40+', target: 40, suffix: '+' },
      { key: '100%', target: 100, suffix: '%' },
      { key: '100%', target: 100, suffix: '%' }
    ];
    items.forEach(item => {
      const duration = 2000;
      const startTime = performance.now();
      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // easeOutQuart
        const eased = 1 - Math.pow(1 - progress, 4);
        const current = eased * item.target;
        if (item.suffix === '%') {
          this.counterValues[item.key] =
            `${Math.round(current)}${item.suffix}`;
        } else {
          this.counterValues[item.key] =
            `${Math.floor(current)}${item.suffix}`;
        }
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      requestAnimationFrame(animate);
    });
  }

  getCounterValue(stat: { value: string; label: string }): string {
    return this.counterValues[stat.value] || '0';
  }

}
