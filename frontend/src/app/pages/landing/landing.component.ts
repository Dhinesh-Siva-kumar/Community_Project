import {
  Component, OnInit, OnDestroy, AfterViewInit, ViewChild,
  Inject, PLATFORM_ID, ElementRef, HostBinding, HostListener, NgZone
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
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
  currentTheme: 'dark' | 'light' = 'dark';

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

  applicationName = 'Community HUB';

  // ── Features (Bento Grid) ──
  features = [
    {
      icon: 'bi-people-fill', title: 'Community Building',
      desc: 'Create and join thriving communities around any interest. Share posts, spark discussions, and grow together.',
      tags: ['Create Groups', 'Member Roles', 'Discussions'],
      color: 'primary', featured: false
    },
    {
      icon: 'bi-calendar-event-fill', title: 'Event Management',
      desc: 'Organize meetups, workshops, and virtual events with built-in RSVP tracking and reminders.',
      tags: ['RSVP', 'Reminders', 'Virtual'],
      color: 'violet', featured: false
    },
    {
      icon: 'bi-briefcase-fill', title: 'Job Board',
      desc: 'Post and discover job opportunities within your communities. Connect talent with employers.',
      tags: ['Post Jobs', 'Apply', 'Network'],
      color: 'green', featured: false
    },
    {
      icon: 'bi-shop', title: 'Business Directory',
      desc: 'List your business, discover local services, and support community entrepreneurs.',
      tags: ['List Business', 'Find Services', 'Reviews'],
      color: 'yellow', featured: false
    },
    {
      icon: 'bi-chat-dots-fill', title: 'Real-time Posts',
      desc: 'Share updates, ask for help, flag emergencies with instant delivery to your community.',
      tags: ['Posts', 'Help Requests', 'Alerts'],
      color: 'pink', featured: false
    },
    {
      icon: 'bi-bell-fill', title: 'Smart Notifications',
      desc: 'WebSocket-powered real-time notifications. Never miss an update, event, or opportunity.',
      tags: ['Real-time', 'Push Alerts', 'Custom'],
      color: 'accent', featured: false
    }
  ];

  // ── Communities Showcase ──
  @ViewChild('commScroll') commScrollRef!: ElementRef<HTMLElement>;

  communities = [
    { name: 'Tech Innovators', members: 2340, category: 'Technology', color: 'primary', icon: 'bi-cpu-fill' },
    { name: 'Local Foodies', members: 1850, category: 'Food & Drink', color: 'pink', icon: 'bi-cup-hot-fill' },
    { name: 'Fitness Warriors', members: 3100, category: 'Health', color: 'green', icon: 'bi-heart-pulse-fill' },
    { name: 'Art Collective', members: 960, category: 'Creative', color: 'violet', icon: 'bi-palette-fill' },
    { name: 'Startup Hub', members: 1520, category: 'Business', color: 'yellow', icon: 'bi-rocket-takeoff-fill' },
    { name: 'Book Worms', members: 780, category: 'Education', color: 'accent', icon: 'bi-book-fill' },
    { name: 'Photography', members: 2100, category: 'Creative', color: 'pink', icon: 'bi-camera-fill' },
    { name: 'Dev Community', members: 4200, category: 'Technology', color: 'primary', icon: 'bi-code-slash' }
  ];

  scrollCommunities(direction: 'left' | 'right'): void {
    const el = this.commScrollRef?.nativeElement;
    if (!el) return;
    const scrollAmount = 280; // card width + gap
    el.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
  }

  // ── How It Works Timeline ──
  steps = [
    { num: '01', title: 'Create Your Account', desc: 'Sign up free in seconds. No credit card needed, ever.', color: 'primary' },
    { num: '02', title: 'Discover Communities', desc: 'Browse and join communities that match your interests and location.', color: 'violet' },
    { num: '03', title: 'Engage & Connect', desc: 'Share updates, attend events, and build meaningful connections with members.', color: 'green' },
    { num: '04', title: 'Grow Your Network', desc: 'Find jobs, explore businesses, and make a real impact in your community.', color: 'pink' }
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

  // ── Testimonials (Multi-card) ──
  testimonials = [
    { name: 'Priya Sharma', role: 'Community Organizer', initial: 'P', quote: 'Community HUB transformed how I organize local events. The RSVP tracking and notifications make everything effortless. Our meetups have doubled in attendance!', color: 'primary', rating: 5 },
    { name: 'Arjun Mehta', role: 'Small Business Owner', initial: 'A', quote: 'Listing my bakery on the business directory brought in so many new customers from the neighbourhood. The community exposure is incredible.', color: 'violet', rating: 5 },
    { name: 'Sarah Johnson', role: 'Software Developer', initial: 'S', quote: 'Found my current job through a community post. The community-based approach made the whole process feel personal and trustworthy.', color: 'green', rating: 5 },
    { name: 'David Chen', role: 'Tech Community Lead', initial: 'D', quote: 'Managing a 5,000-member tech community is seamless. Post moderation, member roles, and real-time notifications keep everything smooth.', color: 'pink', rating: 5 },
    { name: 'Kavitha Raj', role: 'Event Coordinator', initial: 'K', quote: 'From charity runs to coding workshops, I have organized over 50 events on this platform. The tools are powerful yet intuitive.', color: 'accent', rating: 5 }
  ];

  // ── About Stats ──
  aboutStats = [
    { value: '10K+', label: 'Active Members' },
    { value: '500+', label: 'Communities' },
    { value: '1K+', label: 'Events Hosted' },
    { value: '99.9%', label: 'Uptime' }
  ];

  aboutChips = ['Open Source', 'Community Driven', 'Privacy First', 'Real-time', 'Free Forever'];

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
