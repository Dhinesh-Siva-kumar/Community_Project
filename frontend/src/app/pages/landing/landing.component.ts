import {
  Component, OnInit, OnDestroy, AfterViewInit, ViewChild,
  Inject, PLATFORM_ID, ElementRef, HostBinding, HostListener, NgZone
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ThemeService } from '../../core/services/theme.service';
import { LanguageService } from '../../core/services/language.service';
import { LanguageToggleComponent } from '../../shared/components/language-toggle/language-toggle.component';
import { SearchableSelectComponent, SelectOption } from '../../shared/components/searchable-select/searchable-select.component';

/** One entry of the animated `landing.aboutStats` counter deck. */
interface AboutStat {
  value: string;
  displayValue: string;
  label: string;
  suffix: string;
}

// All visible landing-page text lives in the shared catalogs under the
// `landing.*` namespace — see public/assets/i18n/{en,ta}.json. The card decks
// (features, steps, testimonials, …) are arrays of objects there, so switching
// language swaps titles, descriptions, tags and labels in one shot. Their
// `icon`/`color` fields are presentation, not text: `npm run check:i18n`
// enforces that those stay identical across catalogs.

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, SearchableSelectComponent, TranslatePipe, LanguageToggleComponent],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss']
})
export class LandingComponent implements OnInit, OnDestroy, AfterViewInit {

  constructor(
    @Inject(PLATFORM_ID) private platformId: object,
    private el: ElementRef,
    private zone: NgZone,
    private languageService: LanguageService,
    private translate: TranslateService,
    private themeService: ThemeService,
  ) {}

  // ── Theme — delegates to the shared ThemeService (see theme.service.ts);
  // this page still binds its own host attribute since landing.component.scss's
  // --lp-* palette is :host[data-theme]-scoped. ──────────────────────────
  get currentTheme(): 'dark' | 'light' { return this.themeService.theme(); }

  @HostBinding('attr.data-theme')
  get theme(): string { return this.currentTheme; }

  /** Exposes lang="en"|"ta" on the host so :host[lang="ta"] SCSS rules apply. */
  @HostBinding('attr.lang')
  get langAttr(): string { return this.languageService.currentLang(); }

  toggleTheme(): void {
    this.themeService.toggleTheme();
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

  // ── Waitlist Form ──
  waitlistEmail = '';
  waitlistSubmitted = false;

  submitWaitlist(): void {
    if (this.waitlistEmail && this.waitlistEmail.includes('@')) {
      this.waitlistSubmitted = true;
    }
  }

  // ── Counter animation ──
  counterValues: Record<string, string> = {};
  private countersAnimated = false;

  // ── Observers & lifecycle ──
  private sectionObserver!: IntersectionObserver;
  private revealObserver!: IntersectionObserver;
  private readonly sectionIds = ['home', 'features', 'communities', 'how-it-works', 'testimonials', 'about', 'blog', 'contact'];

  ngOnInit(): void {
    this.themeService.applyDefaultIfUnset('light');
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
    const stats = this.translate.instant('landing.aboutStats') as AboutStat[];
    stats.forEach((stat) => {
      if (stat.value === 'growing') {
        // Non-numeric stat — just set it immediately
        this.counterValues[stat.value] = stat.displayValue;
        return;
      }
      const numericTarget = stat.value === '100free' || stat.value === '100safe' ? 100 : parseInt(stat.value, 10);
      const duration = 2000;
      const startTime = performance.now();
      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 4);
        const current = eased * numericTarget;
        this.counterValues[stat.value] =
          `${stat.suffix === '+' ? Math.floor(current) : Math.round(current)}${stat.suffix}`;
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      requestAnimationFrame(animate);
    });
  }

  getCounterValue(stat: AboutStat): string {
    return this.counterValues[stat.value] || stat.displayValue;
  }

}
