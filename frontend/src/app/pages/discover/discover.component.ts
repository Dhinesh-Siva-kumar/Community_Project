import {
  Component, OnInit, OnDestroy, AfterViewInit, ViewChild,
  Inject, PLATFORM_ID, ElementRef, HostBinding, HostListener
} from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { CommonModule, Location, isPlatformBrowser } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { ThemeService } from '../../core/services/theme.service';
import { LanguageService } from '../../core/services/language.service';
import { LanguageToggleComponent } from '../../shared/components/language-toggle/language-toggle.component';

// Each of the 9 topics here (Jobs/Opportunities, Community Q&A, Quick Start
// Guide, Blog & Updates, Business Directory, For Everyone, Platform Features,
// Country Communities, Real Stories) was moved off the landing page to keep
// it short — see landing.component.html's "More to Explore" teaser.
// This page shows exactly ONE topic at a time, selected by the `:topic`
// route param (matching each teaser card's `fragment` value) — not all 9
// stacked together. Copy/arrays still live in the shared i18n catalogs
// under `landing.*`, unchanged.

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe, LanguageToggleComponent],
  templateUrl: './discover.component.html',
  styleUrls: ['./discover.component.scss']
})
export class DiscoverComponent implements OnInit, AfterViewInit, OnDestroy {

  constructor(
    @Inject(PLATFORM_ID) private platformId: object,
    private el: ElementRef,
    private route: ActivatedRoute,
    private location: Location,
    private languageService: LanguageService,
    private themeService: ThemeService,
  ) {}

  // Real browser-back navigation (not a fixed redirect to /landing) — returns
  // the visitor to whatever page/scroll position they came from.
  goBack(): void {
    this.location.back();
  }

  get currentTheme(): 'dark' | 'light' { return this.themeService.theme(); }

  @HostBinding('attr.data-theme')
  get theme(): string { return this.currentTheme; }

  @HostBinding('attr.lang')
  get langAttr(): string { return this.languageService.currentLang(); }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  applicationName = 'Tamilya';

  // ── Country Communities (proper nouns — not translated) ──
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

  // ── Navbar — same look/behaviour as the landing page's, minus scroll-spy
  // (its links point back to the landing page's sections, not to anchors
  // on this page). ──
  navScrolled = false;
  mobileOpen = false;

  // "Back to top" — appears once the page has been scrolled down far enough
  // that jumping back up manually would be tedious.
  showScrollTop = false;

  @HostListener('window:scroll')
  onScroll(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.navScrolled = window.scrollY > 40;
      this.showScrollTop = window.scrollY > 600;
    }
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  toggleMobile(): void { this.mobileOpen = !this.mobileOpen; }
  closeMobile(): void { this.mobileOpen = false; }

  // Which single topic to render — one of the teaser cards' `fragment`
  // values (opportunities/ask/first30/blog/business-directory).
  topic = '';
  private paramSub?: Subscription;
  private revealObserver?: IntersectionObserver;

  ngOnInit(): void {
    this.themeService.applyDefaultIfUnset('light');
    this.paramSub = this.route.paramMap.subscribe(params => {
      this.topic = params.get('topic') ?? '';
      if (isPlatformBrowser(this.platformId)) {
        // Re-scan for reveal targets whenever the topic changes in place
        // (Angular reuses this component instance across :topic navigations).
        setTimeout(() => this.setupRevealObserver());
      }
    });
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.setupRevealObserver();
    }
  }

  ngOnDestroy(): void {
    this.paramSub?.unsubscribe();
    this.revealObserver?.disconnect();
  }

  private setupRevealObserver(): void {
    this.revealObserver?.disconnect();
    this.revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            this.revealObserver!.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -50px 0px' }
    );
    const els = this.el.nativeElement.querySelectorAll('.rv, .rvl, .rvr, .rvs');
    els.forEach((e: Element) => this.revealObserver!.observe(e));
  }
}
