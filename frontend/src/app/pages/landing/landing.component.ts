import {
  Component, OnInit, OnDestroy, AfterViewInit, ViewChild,
  Inject, PLATFORM_ID, ElementRef, HostBinding, HostListener, NgZone
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SearchableSelectComponent, SelectOption } from '../../shared/components/searchable-select/searchable-select.component';

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
    private zone: NgZone
  ) {}

  // ── Theme ──
  currentTheme: 'dark' | 'light' = 'light';

  @HostBinding('attr.data-theme')
  get theme(): string { return this.currentTheme; }

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

  // ── Features (Bento Grid) ──
  features = [
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
  ];

  // ── Communities Showcase ──
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

  // ── How It Works Timeline ──
  steps = [
    {
      num: '01',
      title: 'Sign Up',
      desc: 'Create your profile easily by adding your name, country, city, and profession or field of study. It\'s completely free.',
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
      desc: 'Find the help you need — whether it\'s for jobs, studies, legal assistance, or shared items. Support others in the community by offering your knowledge and resources.',
      color: 'green'
    },
    {
      num: '04',
      title: 'Grow Your Network',
      desc: 'Make new friends, join events, and build meaningful connections with the Tamil community wherever you are.',
      color: 'pink'
    }
  ];

  // ── Why Choose Us ──
  whyCards = [
    { icon: 'bi-shield-check', title: 'Privacy First', desc: 'Your data stays yours. End-to-end encryption and transparent privacy controls.', stat: '100%', statLabel: 'Secure', color: 'primary' },
    // { icon: 'bi-lightning-charge-fill', title: 'Real-time Everything', desc: 'WebSocket-powered notifications, posts, and updates delivered instantly.', stat: '<1s', statLabel: 'Latency', color: 'violet' },
    { icon: 'bi-globe2', title: 'Available Worldwide', desc: 'Connect with communities across the globe, regardless of geography.', stat: '190+', statLabel: 'Countries', color: 'green' },
    { icon: 'bi-heart-fill', title: 'Free Forever', desc: 'No hidden fees, no premium tiers. Every feature is available to everyone.', stat: '$0', statLabel: 'Always', color: 'pink' },
    // { icon: 'bi-phone-fill', title: 'Mobile Friendly', desc: 'Responsive design that works perfectly on any device, any screen size.', stat: '100%', statLabel: 'Responsive', color: 'yellow' },
    // { icon: 'bi-gear-fill', title: 'Easy to Use', desc: 'Intuitive interface that anyone can navigate. No learning curve required.', stat: '5min', statLabel: 'Setup', color: 'accent' }
  ];

  // ── Testimonials (Real Stories) ──
  testimonials = [
    {
      name: 'Murugan Selvam',
      location: 'Manchester, UK',
      category: 'Housing & Jobs',
      initial: 'M',
      quote: 'When I first moved to the UK, I didn\'t know anyone and felt completely alone. Through TamilConnect, I connected with other Tamils living in Manchester. They helped me find accommodation, guided me through local procedures, and even shared job opportunities. What could have taken months became much easier because of the community.',
      color: 'primary',
      rating: 5
    },
    {
      name: 'Kavitha Rajan',
      location: 'Berlin, Germany',
      category: 'Student Support',
      initial: 'K',
      quote: 'While studying in Germany, I struggled to find a part-time job and didn\'t know where to start. Through the Students Section, I connected with a Tamil senior who guided me through the local job market and university resources. Today, I work part-time at a café and have a strong support network around me.',
      color: 'violet',
      rating: 5
    },
    {
      name: 'Arjun Kumar',
      location: 'Toronto, Canada',
      category: 'Community Networking',
      initial: 'A',
      quote: 'Moving to Canada was exciting but challenging. TamilConnect helped me meet other Tamils in Toronto, attend community events, and build friendships. It made settling into a new country much easier.',
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
  ];

  // ── About Stats ──
  aboutStats = [
    { value: '10K+', label: 'Active Members' },
    { value: '500+', label: 'Communities' },
    { value: '1K+', label: 'Events Hosted' },
    { value: '99.9%', label: 'Uptime' }
  ];

  aboutChips = ['Open Source', 'Community Driven', 'Privacy First', 'Real-time', 'Free Forever'];

  // ── Trust & Safety Cards ──
  trustCards = [
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
  ];

  // ── Footer Platform Metrics ──
  footerMetrics = [
    { icon: 'bi-briefcase-fill',      value: '1,240+', label: 'Jobs Posted' },
    { icon: 'bi-mortarboard-fill',    value: '3,800+', label: 'Students Connected' },
    { icon: 'bi-hand-thumbs-up-fill', value: '9,500+', label: 'Help Requests Resolved' },
    { icon: 'bi-globe2',              value: '40+',    label: 'Countries Covered' },
  ];

  // ── Blog Preview ──
  blogPosts = [
    {
      title: '10 Tips for Building a Thriving Online Community',
      excerpt: 'Learn the proven strategies that successful community leaders use to foster engagement and growth.',
      category: 'Community Tips',
      readTime: '5 min read',
      date: 'Mar 28, 2026',
      color: 'primary'
    },
    {
      title: 'Platform Updates: New Event RSVP Features',
      excerpt: 'We have shipped calendar integration, automated reminders, and a brand new event discovery page.',
      category: 'Platform Updates',
      readTime: '3 min read',
      date: 'Mar 22, 2026',
      color: 'violet'
    },
    {
      title: 'Getting Started: Your First Community in 5 Minutes',
      excerpt: 'A step-by-step walkthrough for creating, customizing, and growing your very first community.',
      category: 'Getting Started',
      readTime: '4 min read',
      date: 'Mar 15, 2026',
      color: 'green'
    }
  ];

  // ── Contact Form ──
  contact = { firstName: '', lastName: '', email: '', subject: '', message: '' };
  contactSubmitted = false;

  readonly contactSubjectOptions: SelectOption[] = [
    { value: 'general',     label: 'General Inquiry' },
    { value: 'support',     label: 'Technical Support' },
    { value: 'feedback',    label: 'Feedback & Suggestions' },
    { value: 'partnership', label: 'Partnership' },
    { value: 'other',       label: 'Other' },
  ];

  submitContact(): void {
    this.contactSubmitted = true;
  }

  resetContactForm(): void {
    this.contact = { firstName: '', lastName: '', email: '', subject: '', message: '' };
    this.contactSubmitted = false;
  }

  // ── Marquee items ──
  marqueeItems = [
    { icon: 'bi-people-fill', text: 'Communities' },
    { icon: 'bi-calendar-event-fill', text: 'Events' },
    { icon: 'bi-briefcase-fill', text: 'Jobs' },
    { icon: 'bi-shop', text: 'Businesses' },
    { icon: 'bi-chat-dots-fill', text: 'Posts' },
    { icon: 'bi-bell-fill', text: 'Notifications' },
    { icon: 'bi-people-fill', text: 'Communities' },
    { icon: 'bi-calendar-event-fill', text: 'Events' },
    { icon: 'bi-briefcase-fill', text: 'Jobs' },
    { icon: 'bi-shop', text: 'Businesses' },
    { icon: 'bi-chat-dots-fill', text: 'Posts' },
    { icon: 'bi-bell-fill', text: 'Notifications' }
  ];

  // ── Counter animation ──
  counterValues: Record<string, string> = {};
  private countersAnimated = false;

  // ── Observers & lifecycle ──
  private sectionObserver!: IntersectionObserver;
  private revealObserver!: IntersectionObserver;
  private readonly sectionIds = ['home', 'features', 'communities', 'how-it-works', 'testimonials', 'about', 'blog', 'contact'];

  ngOnInit(): void {
    this.loadTheme();
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
      { key: '10K+', target: 10, suffix: 'K+' },
      { key: '500+', target: 500, suffix: '+' },
      { key: '1K+', target: 1, suffix: 'K+' },
      { key: '99.9%', target: 99.9, suffix: '%' }
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
          this.counterValues[item.key] = current.toFixed(1) + item.suffix;
        } else {
          this.counterValues[item.key] = Math.floor(current) + item.suffix;
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
