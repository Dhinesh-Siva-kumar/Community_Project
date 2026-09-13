import {
  Component, OnInit, OnDestroy, AfterViewInit,
  Inject, PLATFORM_ID, ElementRef, HostBinding, HostListener
} from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { CommonModule, Location, isPlatformBrowser } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { ThemeService } from '../../core/services/theme.service';
import { LanguageService } from '../../core/services/language.service';
import { LanguageToggleComponent } from '../../shared/components/language-toggle/language-toggle.component';

// Each of the 5 topics here (Jobs/Opportunities, Community Q&A, Quick Start
// Guide, Blog & Updates, Business Directory) was moved off the landing page
// to keep it short — see landing.component.html's "More to Explore" teaser.
// This page shows exactly ONE topic at a time, selected by the `:topic`
// route param (matching each teaser card's `fragment` value) — not all 5
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
