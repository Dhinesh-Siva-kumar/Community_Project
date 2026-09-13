import { Component, OnInit, OnDestroy, inject, signal, computed, PLATFORM_ID, HostListener } from '@angular/core';
import { isPlatformBrowser, CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';
import { UserService } from '../../../core/services/user.service';
import { CommunityService } from '../../../core/services/community.service';
import { PostService } from '../../../core/services/post.service';
import { JobService } from '../../../core/services/job.service';
import { EventService } from '../../../core/services/event.service';
import { BusinessService } from '../../../core/services/business.service';
import { ToastService } from '../../../core/services/toast.service';
import { OnboardingService } from '../../../core/services/onboarding.service';
import { DiscoveryService } from '../../../core/services/discovery.service';
import { AuthPromptService } from '../../../core/services/auth-prompt.service';
import { CountryPreferenceService } from '../../../core/services/country-preference.service';
import { GeographyService } from '../../../core/services/geography.service';
import {
  User,
  DashboardStats,
  Community,
  Post,
  Comment,
  Job,
  Business,
  Event,
  GeoCountry,
  JobPreview,
  BusinessPreview,
  EventPreview,
  CommunityPreview,
  PostPreview,
  DiscoveryPlatformStats,
  DiscoverySearchResult,
  PaginatedResponse,
} from '../../../core/models';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { ImageErrorHandlerDirective } from '../../../shared/directives/image-error-handler.directive';
import { ScrollLockDirective } from '../../../shared/directives/scroll-lock.directive';
import { ProfileTabsComponent, ProfileTab } from '../../../shared/components/profile-tabs/profile-tabs.component';
import { EventDateBadgeComponent } from '../../../shared/components/event-date-badge/event-date-badge.component';
import { environment } from '../../../../environments/environment';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../../core/services/language.service';
import { RelativeTimeService } from '../../../core/services/relative-time.service';
import { PostVideoComponent } from '../../../shared/components/post-video/post-video.component';

type SharePlatform = 'whatsapp' | 'facebook' | 'x' | 'telegram' | 'linkedin' | 'email' | 'pinterest';

type PostTab = 'ALL' | 'POPULAR' | 'HELP' | 'EMERGENCY' | 'ENQUIRY';

type WelcomeLang = 'en' | 'ta';

// The guest country-filter pills show only these countries (in this order),
// matched against GeoCountry.name from the geography API — everything else
// falls under the "Other" pill's dropdown so the row doesn't list 100+ pills.
const PRIORITY_COUNTRY_NAMES = [
  'United Kingdom',
  'Germany',
  'Canada',
  'Australia',
  'New Zealand',
  'United States',
  'United Arab Emirates',
  'India',
  'Sri Lanka',
  'France',
];

// Mirrors the en/ta convention used by the landing and register pages
// (see landing.component.ts / register.component.ts), reading the same
// 'landing-lang' preference so the banner matches whatever language the
// user was already browsing in.
const WELCOME_BANNER_TEXT: Record<WelcomeLang, { subtitle: string; steps: [string, string, string] }> = {
  en: {
    subtitle: 'Get started in 3 simple steps:',
    steps: [
      'Complete your profile',
      "Join your country's Tamil community",
      'Make your first post',
    ],
  },
  ta: {
    subtitle: 'தொடங்க 3 எளிய படிகள்:',
    steps: [
      'உங்கள் சுயவிவரத்தை முழுமைப்படுத்துங்கள்',
      'உங்கள் நாட்டு தமிழ் சமூகத்தில் இணையுங்கள்',
      'உங்கள் முதல் பதிவை பகிருங்கள்',
    ],
  },
};

interface AnimatedStat {
  label: string;
  value: number;
  displayValue: number;
  icon: string;
  iconColor: string;
  bgColor: string;
  accentColor: string;
  route: string;
  queryParams?: Record<string, string>;
}

@Component({
  selector: 'app-user-dashboard',
  standalone: true,
  imports: [PostVideoComponent, CommonModule, RouterLink, FormsModule, ReactiveFormsModule, DatePipe, ImageUrlPipe, ImageErrorHandlerDirective, ScrollLockDirective, ProfileTabsComponent, EventDateBadgeComponent, TranslatePipe],
  templateUrl: './user-dashboard.component.html',
  styleUrls: ['./user-dashboard.component.scss'],
})
export class UserDashboardComponent implements OnInit, OnDestroy {
  // Hero background photo — a bundled frontend asset (public/assets/), not
  // a backend upload, so it's referenced directly in the template WITHOUT
  // the `imageUrl` pipe: that pipe prepends the backend origin to any
  // relative path, which is correct for actual /uploads/* files but would
  // wrongly point this at the backend's origin in dev (it only exists on
  // the Angular dev server / same-origin prod build).
  readonly guestHeroImage = '/assets/worldimages.png';

  private translate = inject(TranslateService);
  language = inject(LanguageService);
  private relativeTime  = inject(RelativeTimeService);
  authService = inject(AuthService);
  private userService = inject(UserService);
  private communityService = inject(CommunityService);
  private postService = inject(PostService);
  private jobService = inject(JobService);
  private eventService = inject(EventService);
  private businessService = inject(BusinessService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);
  private platformId = inject(PLATFORM_ID);
  private onboardingService = inject(OnboardingService);
  private discoveryService = inject(DiscoveryService);
  authPromptService = inject(AuthPromptService);
  private countryPreferenceService = inject(CountryPreferenceService);
  private geographyService = inject(GeographyService);

  // Loading states
  loading = signal(true);
  loadingPosts = signal(true);
  loadingCommunities = signal(true);
  loadingJobs = signal(true);
  loadingUpcomingEvents = signal(true);

  upcomingEvents = signal<Event[]>([]);

  // Core data
  user = signal<User | null>(null);
  stats = signal<DashboardStats | null>(null);
  today = signal(new Date());

  // Post feed
  activeTab = signal<PostTab>('ALL');
  allPosts = signal<Post[]>([]);
  expandedPostContent = signal<Set<string>>(new Set());
  readonly postContentPreviewLimit = 220;

  // Image lightbox
  lightboxOpen = signal(false);
  lightboxImages = signal<string[]>([]);
  activeImageIndex = signal(0);

  // Share modal
  shareModalOpen = signal(false);
  shareTargetPost = signal<Post | null>(null);
  sharePopupBlocked = signal(false);
  blockedShareUrl = signal<string | null>(null);

  // Post interactions (like / comment / share / save)
  likingPost = signal<string | null>(null);
  savingPost = signal<string | null>(null);
  expandedComments = signal<Set<string>>(new Set());
  loadingComments = signal<Set<string>>(new Set());
  postComments = signal<Map<string, Comment[]>>(new Map());
  submittingComment = signal<string | null>(null);
  commentForms: Map<string, FormGroup> = new Map();

  // Communities, Events, Jobs
  joinedCommunities = signal<Community[]>([]);
  recentJobs = signal<Job[]>([]);
  suggestedCommunities = signal<Community[]>([]);
  joiningCommunity = signal<string | null>(null);
  featuredBusinesses = signal<Business[]>([]);
  loadingSuggestedCommunities = signal(true);
  loadingFeaturedBusinesses = signal(true);

  // ── Guest-only discovery state ─────────────────────────────
  // Mirrors the registered signals above one-for-one (guestPosts ~ allPosts,
  // guestJobs ~ recentJobs, etc.) but sourced from the public /discovery/*
  // endpoints instead of the authenticated APIs — see loadGuestData().
  guestPosts = signal<PostPreview[]>([]);
  guestJobs = signal<JobPreview[]>([]);
  guestEvents = signal<EventPreview[]>([]);
  guestCommunities = signal<CommunityPreview[]>([]);
  guestBusinesses = signal<BusinessPreview[]>([]);
  countries = signal<GeoCountry[]>([]);
  selectedCountryId = signal<number | null>(null);
  platformStats = signal<DiscoveryPlatformStats | null>(null);

  // ── Hero search bar (guest) ────────────────────────────────
  searchQuery = signal('');
  searchResults = signal<DiscoverySearchResult | null>(null);
  searching = signal(false);

  // ── Hero country combobox (guest) — free-text input the user types
  // directly into (no click-to-open trigger/arrow); typing filters the
  // dropdown list live, matching a plain autocomplete combobox rather than
  // a traditional select. countryQuery holds the raw input text (kept in
  // sync with the selected country's name when the dropdown closes without
  // a new pick — see closeCountryDropdown()).
  countryQuery = signal('');
  countryDropdownOpen = signal(false);

  // Computed
  firstName = computed(() => this.user()?.displayName ?? this.user()?.userName ?? 'User');
  currentUser = computed(() => this.user());

  // Curated PRIORITY_COUNTRY_NAMES countries first, then everything else
  // alphabetically — the browsing order shown before the user types anything.
  orderedCountries = computed<GeoCountry[]>(() => {
    const all = this.countries();
    const byName = new Map(all.map((c) => [c.name, c]));
    const priority = PRIORITY_COUNTRY_NAMES.map((name) => byName.get(name)).filter(
      (c): c is GeoCountry => !!c,
    );
    const priorityIds = new Set(priority.map((c) => c.id));
    const rest = all
      .filter((c) => !priorityIds.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...priority, ...rest];
  });

  // What the dropdown actually renders — filtered live by countryQuery.
  filteredCountries = computed<GeoCountry[]>(() => {
    const q = this.countryQuery().trim().toLowerCase();
    const list = this.orderedCountries();
    return q ? list.filter((c) => c.name.toLowerCase().includes(q)) : list;
  });

  greeting = computed(() => {
    // Recompute these labels when the reader switches language.
    this.language.currentLang();
    const hour = this.today().getHours();
    if (hour < 12) return this.translate.instant('user.dashboard.greetingMorning');
    if (hour < 17) return this.translate.instant('user.dashboard.greetingAfternoon');
    return this.translate.instant('user.dashboard.greetingEvening');
  });

  // Time-of-day icon for the hero — deliberately not another copy of the
  // user's avatar, which already appears in the navbar and the composer
  // directly below; repeating it a third time in the same viewport read
  // as redundant clutter.
  greetingIcon = computed(() => {
    const hour = this.today().getHours();
    if (hour < 12) return 'bi-sunrise';
    if (hour < 17) return 'bi-sun';
    return 'bi-moon-stars';
  });

  // ── Post-registration welcome banner ──────────────────────
  // Shown once, right after the user's first registration (flagged by
  // OnboardingService), then dismissed for good — see markWelcomeBanner-
  // Pending() in register.component.ts and dismissWelcomeBanner() below.
  showWelcomeBanner = signal(false);
  private welcomeLang: WelcomeLang = 'en';
  welcomeBannerText = computed(() => WELCOME_BANNER_TEXT[this.welcomeLang]);

  // allPosts() is loaded latest-first (see loadPostsFromCommunities), and a
  // filter preserves that relative order — but each case sorts explicitly
  // by createdAt anyway so this doesn't silently depend on that assumption.
  filteredPosts = computed(() => {
    const posts = this.allPosts();
    const tab = this.activeTab();
    switch (tab) {
      case 'POPULAR':
        // Engagement score = likes + comments, most-engaged first; ties
        // (e.g. brand-new posts with no interactions yet) fall back to
        // most recent first.
        return [...posts].sort((a, b) => {
          const scoreA = (a._count?.likes ?? 0) + (a._count?.comments ?? 0);
          const scoreB = (b._count?.likes ?? 0) + (b._count?.comments ?? 0);
          if (scoreB !== scoreA) return scoreB - scoreA;
          return this.byLatest(a, b);
        });
      case 'HELP':
        return posts.filter((p) => p.type === 'HELP').sort((a, b) => this.byLatest(a, b));
      case 'EMERGENCY':
        return posts.filter((p) => p.type === 'EMERGENCY').sort((a, b) => this.byLatest(a, b));
      case 'ENQUIRY':
        return posts.filter((p) => p.type === 'ENQUIRY').sort((a, b) => this.byLatest(a, b));
      default:
        return [...posts].sort((a, b) => this.byLatest(a, b));
    }
  });

  private byLatest(a: { createdAt: string }, b: { createdAt: string }): number {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }

  // Same tab-filter logic as filteredPosts, over the guest preview feed
  // (PostPreview has no isLiked/isSaved — nothing to gate here, since a
  // guest can only ever read this list, never react to it).
  filteredGuestPosts = computed(() => {
    const posts = this.guestPosts();
    const tab = this.activeTab();
    switch (tab) {
      case 'POPULAR':
        return [...posts].sort((a, b) => {
          const scoreA = (a.likeCount ?? 0) + (a.commentCount ?? 0);
          const scoreB = (b.likeCount ?? 0) + (b.commentCount ?? 0);
          if (scoreB !== scoreA) return scoreB - scoreA;
          return this.byLatest(a, b);
        });
      case 'HELP':
        return posts.filter((p) => p.type === 'HELP').sort((a, b) => this.byLatest(a, b));
      case 'EMERGENCY':
        return posts.filter((p) => p.type === 'EMERGENCY').sort((a, b) => this.byLatest(a, b));
      default:
        return [...posts].sort((a, b) => this.byLatest(a, b));
    }
  });

  // Matches the "Your Activity" stat row exactly (Communities/Businesses/
  // Events/Jobs) — Posts intentionally omitted to match the new layout.
  animatedStats = signal<AnimatedStat[]>([
    { label: 'user.dashboard.stat.communities', value: 0, displayValue: 0, icon: 'bi-people-fill',         iconColor: 'var(--stat-communities, #16A34A)', bgColor: 'var(--stat-communities-bg, #DCFCE7)', accentColor: 'var(--stat-communities, #16A34A)', route: '/user/community' },
    { label: 'user.dashboard.stat.businesses',  value: 0, displayValue: 0, icon: 'bi-shop',                iconColor: 'var(--stat-businesses, #2563EB)', bgColor: 'var(--stat-businesses-bg, #DBEAFE)', accentColor: 'var(--stat-businesses, #2563EB)', route: '/user/business' },
    { label: 'user.dashboard.stat.events',      value: 0, displayValue: 0, icon: 'bi-calendar-event-fill', iconColor: 'var(--stat-events, #7C3AED)', bgColor: 'var(--stat-events-bg, #EDE9FE)', accentColor: 'var(--stat-events, #7C3AED)', route: '/user/events' },
    { label: 'user.dashboard.stat.jobs',        value: 0, displayValue: 0, icon: 'bi-briefcase-fill',      iconColor: 'var(--stat-jobs, #0D9488)', bgColor: 'var(--stat-jobs-bg, #CCFBF1)', accentColor: 'var(--stat-jobs, #0D9488)', route: '/user/jobs' },
  ]);

  private animationFrameId: number | null = null;

  // `color` is used both as text-on-tint (hover) AND as a solid icon-chip
  // fill with a white icon on top (active) — kept as a fixed literal so
  // that white-on-fill contrast can't degrade if it were ever swapped for
  // a dark-mode-lightened variant. `bgColor` (the sliding active-tab
  // indicator, a pure light tint) is reactive.
  tabs: ProfileTab[] = [
    { id: 'ALL',       label: 'user.dashboard.tab.all',     icon: 'bi-grid-fill',                  color: '#0284C7', bgColor: 'var(--color-info-light, #E0F2FE)' },
    { id: 'POPULAR',   label: 'user.dashboard.tab.popular',       icon: 'bi-fire',                       color: '#EA580C', bgColor: 'var(--color-badge-orange-bg, #FFEDD5)' },
    { id: 'HELP',      label: 'user.dashboard.tab.help', icon: 'bi-question-circle-fill',       color: '#CA8A04', bgColor: 'var(--tab-help-bg, #FEF9C3)' },
    { id: 'EMERGENCY', label: 'user.dashboard.tab.emergency', icon: 'bi-exclamation-triangle-fill',  color: '#DC2626', bgColor: 'var(--tab-emergency-bg, #FEE2E2)' },
    { id: 'ENQUIRY',   label: 'user.dashboard.tab.enquiry',       icon: 'bi-patch-question-fill',        color: '#7C3AED', bgColor: 'var(--color-badge-violet-bg, #EDE9FE)' },
  ];

  // Same as `tabs` minus Enquire — matches the guest Stitch mockup, which
  // only shows All/Popular/Help Requests/Emergency (Enquire posts are a
  // registered-member feature).
  guestTabs: ProfileTab[] = this.tabs.filter((t) => t.id !== 'ENQUIRY');

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.loadUserData();
      this.loadDashboardStats();
      this.loadJoinedCommunities();
      this.loadRecentJobs();
      this.loadUpcomingEventsCheck();
      this.loadSuggestedCommunities();
      this.loadFeaturedBusinesses();
      this.initWelcomeBanner();
    } else {
      this.loading.set(false);
      this.initGuestCountry();
    }
  }

  ngOnDestroy(): void {
    if (this.animationFrameId !== null && isPlatformBrowser(this.platformId)) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  // ── Welcome banner ────────────────────────────────────────

  private initWelcomeBanner(): void {
    if (isPlatformBrowser(this.platformId)) {
      const saved = localStorage.getItem('landing-lang');
      if (saved === 'en' || saved === 'ta') this.welcomeLang = saved;
    }

    const userId = this.authService.currentUser()?.id;
    if (userId != null && this.onboardingService.shouldShowWelcome(userId)) {
      this.showWelcomeBanner.set(true);
    }
  }

  dismissWelcomeBanner(): void {
    this.showWelcomeBanner.set(false);
    const userId = this.authService.currentUser()?.id;
    if (userId != null) this.onboardingService.dismissWelcome(userId);
  }

  // ── Data Loading ──────────────────────────────────────────

  loadUserData(): void {
    const currentUser = this.authService.currentUser();
    if (currentUser) {
      this.user.set(currentUser);
    }
    this.authService.getCurrentUser().subscribe({
      next: (user) => this.user.set(user),
      error: () => {},
    });
  }

  loadDashboardStats(): void {
    this.loading.set(true);
    this.userService.getDashboardStats().subscribe({
      next: (data) => {
        this.stats.set(data);
        this.loading.set(false);
        this.startCounterAnimation(data);
      },
      error: () => this.loading.set(false),
    });
  }

  loadJoinedCommunities(): void {
    this.loadingCommunities.set(true);
    const timeout = window.setTimeout(() => {
      console.warn('[Dashboard] communities timeout fired');
      this.loadingCommunities.set(false);
      this.loadingPosts.set(false);
    }, 8000);
    this.communityService.getJoinedCommunities().subscribe({
      next: (communities) => {
        clearTimeout(timeout);
        console.log('[Dashboard] communities loaded:', communities.length, communities);
        this.joinedCommunities.set(communities);
        this.loadPostsFromCommunities(communities);
        this.loadingCommunities.set(false);
      },
      error: (err) => {
        clearTimeout(timeout);
        console.error('[Dashboard] communities error:', err);
        this.loadingCommunities.set(false);
        this.loadingPosts.set(false);
      },
    });
  }

  loadPostsFromCommunities(communities: Community[]): void {
    if (communities.length === 0) {
      this.allPosts.set([]);
      this.loadingPosts.set(false);
      return;
    }

    const requests = communities.map((c) =>
      this.postService.getPosts(c.id, { limit: 10 }).pipe(
        catchError(() => of({ data: [], total: 0, page: 1, limit: 10, totalPages: 0 } as PaginatedResponse<Post>))
      )
    );

    forkJoin(requests).subscribe({
      next: (results) => {
        const merged = results
          .flatMap((r) => r.data)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        this.allPosts.set(merged);
        this.loadingPosts.set(false);
      },
      error: () => {
        this.allPosts.set([]);
        this.loadingPosts.set(false);
      },
    });
  }

  loadRecentJobs(): void {
    this.loadingJobs.set(true);
    this.jobService.getJobs().subscribe({
      next: (res) => {
        const recent = res.data
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 4);
        this.recentJobs.set(recent);
        this.loadingJobs.set(false);
      },
      error: () => this.loadingJobs.set(false),
    });
  }

  /** Drives the "Your Events" rail card's empty state — is there anything upcoming in the user's own country? */
  loadUpcomingEventsCheck(): void {
    this.loadingUpcomingEvents.set(true);
    this.eventService.getEvents({
      status: 'upcoming',
      country: this.authService.currentUser()?.country,
      limit: 3,
      sortBy: 'eventDate',
      sortDir: 'asc',
    }).subscribe({
      next: (res) => {
        this.upcomingEvents.set(res.data);
        this.loadingUpcomingEvents.set(false);
      },
      error: () => this.loadingUpcomingEvents.set(false),
    });
  }

  /** Ranked by country + interest match + popularity, already excludes communities the caller has joined — see communities.service.ts getSuggested(). */
  loadSuggestedCommunities(): void {
    this.loadingSuggestedCommunities.set(true);
    this.communityService.getSuggestedCommunities(3).subscribe({
      next: (data) => { this.suggestedCommunities.set(data); this.loadingSuggestedCommunities.set(false); },
      error: () => this.loadingSuggestedCommunities.set(false),
    });
  }

  joinSuggestedCommunity(community: Community): void {
    if (this.joiningCommunity() === community.id) return;
    this.joiningCommunity.set(community.id);
    this.communityService.joinCommunity(community.id).subscribe({
      next: () => {
        this.suggestedCommunities.update((list) => list.filter((c) => c.id !== community.id));
        this.joiningCommunity.set(null);
        this.toast.success('user.dashboard.toast.joinedCommunity');
      },
      error: () => {
        this.toast.error('user.dashboard.toast.failedJoinCommunity');
        this.joiningCommunity.set(null);
      },
    });
  }

  loadFeaturedBusinesses(): void {
    this.loadingFeaturedBusinesses.set(true);
    this.businessService.getBusinesses({ limit: 3, sortBy: 'joined' }).subscribe({
      next: (res) => { this.featuredBusinesses.set(res.data); this.loadingFeaturedBusinesses.set(false); },
      error: () => this.loadingFeaturedBusinesses.set(false),
    });
  }

  // ── Guest discovery (public /discovery/* previews) ─────────

  private initGuestCountry(): void {
    this.geographyService.getCountries().subscribe((countries) => {
      this.countries.set(countries);
      // No IP/locale-based guess exists in this app — a returning guest's
      // last pick is honored, otherwise the country stays unselected rather
      // than silently assuming one (see country-preference.service.ts).
      this.selectedCountryId.set(this.countryPreferenceService.getSelected());
      this.syncCountryQueryToSelection();
      this.loadGuestData();
    });

    // Platform-wide totals — unaffected by the country filter, so this is
    // fetched once rather than being part of loadGuestData()'s re-fetch.
    this.discoveryService.getPlatformStats().subscribe({
      next: (res) => this.platformStats.set(res.data),
      error: () => this.platformStats.set(null),
    });
  }

  /** Text the input's displayed value reverts to once the dropdown closes
   * without a fresh pick — keeps it consistent with selectedCountryId
   * instead of leaving behind whatever the user last typed. */
  private syncCountryQueryToSelection(): void {
    const id = this.selectedCountryId();
    const match = id == null ? null : this.countries().find((c) => c.id === id);
    this.countryQuery.set(match?.name ?? '');
  }

  /** Picking a country only stages it — it doesn't reload anything on its
   * own. The banner's filter (text + country together) only takes effect
   * when Search is actually clicked (or Enter is pressed in the search
   * field), via applyGuestFilters() below. */
  selectCountry(country: GeoCountry | null): void {
    if (country) {
      this.selectedCountryId.set(country.id);
      this.countryQuery.set(country.name);
    } else {
      this.selectedCountryId.set(null);
      this.countryQuery.set('');
    }
    this.countryDropdownOpen.set(false);
  }

  onCountryQueryChange(value: string): void {
    this.countryQuery.set(value);
    if (!this.countryDropdownOpen()) this.countryDropdownOpen.set(true);
  }

  onCountryQueryKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      const top = this.filteredCountries()[0];
      if (top) this.selectCountry(top);
    } else if (event.key === 'Escape') {
      this.countryDropdownOpen.set(false);
      this.syncCountryQueryToSelection();
    }
  }

  // Closes on any outside click — the country picker's own root div stops
  // propagation on click (see template) so clicks inside it never reach
  // here while the dropdown is open.
  @HostListener('document:click')
  closeCountryDropdown(): void {
    if (!this.countryDropdownOpen()) return;
    this.countryDropdownOpen.set(false);
    this.syncCountryQueryToSelection();
  }

  /** The banner's one actual "apply" trigger — bound to the Search button
   * and to Enter in the text field. Neither typing text nor picking a
   * country (selectCountry() above) does anything by itself; this is what
   * commits the staged country (persisting it + reloading the guest feed
   * sections) and runs the free-text search together, in one step. */
  applyGuestFilters(): void {
    const countryId = this.selectedCountryId();
    if (countryId == null) {
      this.countryPreferenceService.clearSelected();
    } else {
      this.countryPreferenceService.setSelected(countryId);
    }
    this.loadGuestData();
    this.runGuestSearch();
  }

  private runGuestSearch(): void {
    const q = this.searchQuery().trim();
    if (!q) { this.searchResults.set(null); return; }
    this.searching.set(true);
    this.discoveryService.search(q, this.selectedCountryId() ?? undefined).subscribe({
      next: (res) => { this.searchResults.set(res); this.searching.set(false); },
      error: () => this.searching.set(false),
    });
  }

  clearGuestSearch(): void {
    this.searchQuery.set('');
    this.searchResults.set(null);
  }

  guestSearchResultCount(r: DiscoverySearchResult): number {
    return r.jobs.length + r.businesses.length + r.events.length + r.communities.length;
  }

  private loadGuestData(): void {
    const countryId = this.selectedCountryId() ?? undefined;

    this.loadingPosts.set(true);
    this.discoveryService.getPostsPreview({ countryId, limit: 8 }).subscribe({
      next: (res) => { this.guestPosts.set(res.data); this.loadingPosts.set(false); },
      error: () => this.loadingPosts.set(false),
    });

    this.loadingJobs.set(true);
    this.discoveryService.getJobsPreview({ countryId, limit: 4 }).subscribe({
      next: (res) => { this.guestJobs.set(res.data); this.loadingJobs.set(false); },
      error: () => this.loadingJobs.set(false),
    });

    this.loadingUpcomingEvents.set(true);
    this.discoveryService.getEventsPreview({ countryId, limit: 4 }).subscribe({
      next: (res) => { this.guestEvents.set(res.data); this.loadingUpcomingEvents.set(false); },
      error: () => this.loadingUpcomingEvents.set(false),
    });

    this.loadingSuggestedCommunities.set(true);
    this.discoveryService.getCommunitiesPreview({ countryId, limit: 4 }).subscribe({
      next: (res) => { this.guestCommunities.set(res.data); this.loadingSuggestedCommunities.set(false); },
      error: () => this.loadingSuggestedCommunities.set(false),
    });

    this.loadingFeaturedBusinesses.set(true);
    this.discoveryService.getBusinessesPreview({ countryId, limit: 4 }).subscribe({
      next: (res) => { this.guestBusinesses.set(res.data); this.loadingFeaturedBusinesses.set(false); },
      error: () => this.loadingFeaturedBusinesses.set(false),
    });
  }

  /** Guest CTA gate — jobs "Apply Now", RSVP/Get Tickets, community Join,
   * business Enquire, and post replies all funnel through this instead of a
   * real action. */
  promptAuth(message?: string): void {
    this.authPromptService.prompt(message);
  }

  // ── Tab Switching ─────────────────────────────────────────

  switchTab(tab: PostTab): void {
    this.activeTab.set(tab);
    if (typeof window === 'undefined') return;

    // .stream-card__feed now scrolls independently of the page (its own
    // overflow-y:auto region) — reset its internal scroll first so a new
    // tab never opens mid-scroll into the previous tab's list.
    document.querySelector('.stream-card__feed')?.scrollTo({ top: 0 });

    // Then, same as before: if the reader had scrolled the *page* deep past
    // the stream card, bring the tab bar back into view rather than leaving
    // them stranded against unrelated content below it.
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => this.scrollFeedToTop()));
  }

  // Note: .feed-tabs is itself `position: sticky`, so once it's stuck,
  // getBoundingClientRect().top always reports the sticky offset (80)
  // regardless of actual scroll depth — it can't be used to recover how
  // far down the document you are. Its next sibling — whichever of the
  // skeleton / empty state / post list is currently rendered right after
  // it — is a plain, non-sticky element that scrolls normally, so *its*
  // position is what we measure; .feed-tabs itself is only used for its
  // (scroll-independent) sticky offset + height.
  private scrollFeedToTop(attempt = 0): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const tabs = document.querySelector<HTMLElement>('.feed-tabs');
    const anchor = tabs?.nextElementSibling as HTMLElement | null;
    if (!tabs || !anchor) {
      if (attempt < 6) window.setTimeout(() => this.scrollFeedToTop(attempt + 1), 16);
      return;
    }

    const stickyTop = parseFloat(window.getComputedStyle(tabs).top) || 0;
    const tabsHeight = tabs.offsetHeight;
    const breathingSpace = 10;
    const desiredAnchorTop = stickyTop + tabsHeight + breathingSpace;

    const anchorTop = anchor.getBoundingClientRect().top;
    const targetScrollY = Math.max(0, window.scrollY + anchorTop - desiredAnchorTop);

    if (Math.abs(window.scrollY - targetScrollY) <= 2) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: targetScrollY, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  }

  // ── Save / Bookmark ───────────────────────────────────────

  toggleSavePost(post: Post, event: MouseEvent): void {
    event.stopPropagation();
    if (this.savingPost() === post.id) return;

    this.savingPost.set(post.id);
    const wasSaved = post.isSaved;
    const action$ = wasSaved ? this.postService.unsavePost(post.id) : this.postService.savePost(post.id);

    // Optimistic update — matches toggleLike's pattern.
    this.allPosts.update((posts) => posts.map((p) => (p.id === post.id ? { ...p, isSaved: !wasSaved } : p)));

    action$.subscribe({
      next: () => this.savingPost.set(null),
      error: () => {
        this.toast.error(wasSaved ? 'Failed to unsave post' : 'Failed to save post');
        this.allPosts.update((posts) => posts.map((p) => (p.id === post.id ? { ...p, isSaved: wasSaved } : p)));
        this.savingPost.set(null);
      },
    });
  }

  // ── Like / Comment / Share ─────────────────────────────────

  toggleLike(post: Post): void {
    this.likingPost.set(post.id);
    const action$ = post.isLiked ? this.postService.unlikePost(post.id) : this.postService.likePost(post.id);
    const likeDelta = post.isLiked ? -1 : 1;

    action$.subscribe({
      next: () => {
        this.allPosts.update((posts) =>
          posts.map((p) =>
            p.id === post.id
              ? { ...p, isLiked: !post.isLiked, _count: { ...p._count!, likes: Math.max(0, (p._count?.likes ?? 0) + likeDelta), comments: p._count?.comments ?? 0 } }
              : p
          )
        );
        this.likingPost.set(null);
      },
      error: () => { this.toast.error('user.dashboard.toast.failedUpdateLike'); this.likingPost.set(null); },
    });
  }

  toggleComments(postId: string): void {
    this.expandedComments.update((set) => {
      const next = new Set(set);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
        if (!this.postComments().has(postId)) { this.loadComments(postId); }
      }
      return next;
    });
  }

  isCommentsExpanded(postId: string): boolean { return this.expandedComments().has(postId); }

  loadComments(postId: string): void {
    this.loadingComments.update((set) => { const s = new Set(set); s.add(postId); return s; });
    this.postService.getComments(postId).subscribe({
      next: (comments) => {
        this.postComments.update((map) => { const m = new Map(map); m.set(postId, comments); return m; });
        this.loadingComments.update((set) => { const s = new Set(set); s.delete(postId); return s; });
      },
      error: () => {
        this.loadingComments.update((set) => { const s = new Set(set); s.delete(postId); return s; });
      },
    });
  }

  getComments(postId: string): Comment[] { return this.postComments().get(postId) ?? []; }
  isLoadingComments(postId: string): boolean { return this.loadingComments().has(postId); }

  getCommentForm(postId: string): FormGroup {
    if (!this.commentForms.has(postId)) {
      this.commentForms.set(
        postId,
        this.fb.group({
          content: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(500)]],
        })
      );
    }
    return this.commentForms.get(postId)!;
  }

  submitComment(postId: string): void {
    const form = this.getCommentForm(postId);
    if (form.invalid) return;

    this.submittingComment.set(postId);
    const content = form.get('content')!.value;

    this.postService.addComment(postId, content).subscribe({
      next: (comment) => {
        this.postComments.update((map) => {
          const m = new Map(map);
          m.set(postId, [...(m.get(postId) ?? []), comment]);
          return m;
        });
        this.allPosts.update((posts) =>
          posts.map((p) =>
            p.id === postId
              ? { ...p, _count: { ...p._count!, comments: (p._count?.comments ?? 0) + 1, likes: p._count?.likes ?? 0 } }
              : p
          )
        );
        form.reset();
        this.submittingComment.set(null);
      },
      error: () => { this.toast.error('user.dashboard.toast.failedAddComment'); this.submittingComment.set(null); },
    });
  }

  async sharePost(post: Post): Promise<void> {
    const shareUrl = this.getShareUrl(post.id);
    const postText = this.getShareContentText(post);
    const shareTitle = `${post.community?.name ?? 'Community'} Post`;

    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      this.openShareModal(post);
      return;
    }

    try {
      const files = await this.buildShareFiles(post.images);

      if (files.length > 0) {
        // The Web Share API rejects `url` combined with `files` (canShare()
        // returns false), so the link is folded into `text` instead — this
        // way the image and the link still travel together in one share.
        const withFiles: ShareData = {
          title: shareTitle,
          text: `${postText}\n\n${shareUrl}`,
          files,
        };
        if (typeof navigator.canShare === 'function' && navigator.canShare(withFiles)) {
          await navigator.share(withFiles);
          return;
        }
      }

      await navigator.share({ title: shareTitle, text: postText, url: shareUrl });
    } catch (error: unknown) {
      const err = error as { name?: string };
      if (err?.name === 'AbortError') return;
      this.openShareModal(post);
    }
  }

  openShareModal(post: Post): void {
    this.shareTargetPost.set(post);
    this.sharePopupBlocked.set(false);
    this.blockedShareUrl.set(null);
    this.shareModalOpen.set(true);
  }

  closeShareModal(): void {
    this.shareModalOpen.set(false);
    this.shareTargetPost.set(null);
    this.sharePopupBlocked.set(false);
    this.blockedShareUrl.set(null);
  }

  shareVia(platform: SharePlatform): void {
    const post = this.shareTargetPost();
    if (!post) return;

    const shareUrl = this.getShareUrl(post.id);
    const text = this.getShareContentText(post);
    const imageUrl = post.images?.[0] ? this.resolveImageUrl(post.images[0]) : null;
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(text);
    const encodedTextWithUrl = encodeURIComponent(`${shareUrl}\n\n${text}`);
    const encodedImage = imageUrl ? encodeURIComponent(imageUrl) : '';

    let target = '';
    switch (platform) {
      case 'whatsapp':
        target = `https://wa.me/?text=${encodedTextWithUrl}`;
        break;
      case 'facebook':
        target = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
        break;
      case 'x':
        target = `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`;
        break;
      case 'telegram':
        target = `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`;
        break;
      case 'linkedin':
        target = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
        break;
      case 'email':
        target = `mailto:?subject=${encodeURIComponent(`${post.community?.name ?? 'Community'} Post`)}&body=${encodedTextWithUrl}`;
        break;
      case 'pinterest':
        target = imageUrl
          ? `https://pinterest.com/pin/create/button/?url=${encodedUrl}&media=${encodedImage}&description=${encodedText}`
          : `https://pinterest.com/pin/create/button/?url=${encodedUrl}&description=${encodedText}`;
        break;
    }

    if (platform === 'email') {
      window.location.href = target;
      return;
    }

    this.openShareTarget(target, platform);
  }

  private openShareTarget(target: string, platform: SharePlatform): void {
    const popupFeatures = platform === 'whatsapp'
      ? 'width=980,height=760'
      : 'width=680,height=720';

    const popup = window.open(target, '_blank', popupFeatures);
    if (!popup) {
      this.sharePopupBlocked.set(true);
      this.blockedShareUrl.set(target);
      return;
    }

    this.sharePopupBlocked.set(false);
    this.blockedShareUrl.set(null);
    popup.opener = null;
  }

  openShareInSameTab(): void {
    const target = this.blockedShareUrl();
    if (!target) return;
    window.location.href = target;
  }

  copyShareLink(): void {
    const post = this.shareTargetPost();
    if (!post) return;

    const shareUrl = this.getShareUrl(post.id);
    navigator.clipboard.writeText(shareUrl)
      .then(() => this.toast.success('user.dashboard.toast.shareLinkCopied'))
      .catch(() => this.toast.error('user.dashboard.toast.failedCopyShareLink'));
  }

  private getShareUrl(postId: string): string {
    const base = this.getShareBaseOrigin();
    return `${base}/share/post/${postId}`;
  }

  getShareText(post: Post): string {
    const compact = this.getCompactPostContent(post);
    if (!compact) return `${post.community?.name ?? 'Community'} shared a post`;

    const previewLimit = 220;
    if (compact.length <= previewLimit) return compact;
    return `${compact.slice(0, previewLimit - 1).trimEnd()}...`;
  }

  private getShareContentText(post: Post): string {
    const communityName = post.community?.name ?? 'Community';
    const compact = this.getCompactPostContent(post);
    return compact ? `${communityName}: ${compact}` : `${communityName} shared a post`;
  }

  private getCompactPostContent(post: Post): string {
    return (post.content || '').replace(/\s+/g, ' ').trim();
  }

  private async buildShareFiles(images: string[] | undefined): Promise<File[]> {
    if (!images || images.length === 0) return [];

    const results = await Promise.all(
      images.slice(0, 4).map(async (image, index) => {
        try {
          const imageUrl = this.resolveImageUrl(image);
          const response = await fetch(imageUrl, { mode: 'cors' });
          if (!response.ok) return null;

          const blob = await response.blob();
          const mime = blob.type || 'image/jpeg';
          const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
          return new File([blob], `post-${index + 1}.${ext}`, { type: mime });
        } catch {
          return null;
        }
      })
    );

    return results.filter((file): file is File => file !== null);
  }

  private resolveImageUrl(pathOrUrl: string): string {
    if (/^(https?:)?\/\//i.test(pathOrUrl) || pathOrUrl.startsWith('data:')) {
      return pathOrUrl;
    }
    const base = environment.wsUrl || window.location.origin;
    const normalized = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
    return `${base.replace(/\/$/, '')}${normalized}`;
  }

  private getShareBaseOrigin(): string {
    const wsOrigin = (environment.wsUrl || '').trim();
    if (wsOrigin) return wsOrigin.replace(/\/$/, '');

    const apiUrl = (environment.apiUrl || '').trim();
    if (apiUrl) {
      try {
        return new URL(apiUrl, window.location.origin).origin;
      } catch {
        // ignore and fall back to current origin
      }
    }

    return window.location.origin.replace(/\/$/, '');
  }

  // ── Counter Animation ─────────────────────────────────────

  private startCounterAnimation(data: DashboardStats): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const targets = [
      data.joinedCommunities ?? data.totalCommunities ?? 0,
      data.userBusinesses ?? data.totalBusinesses ?? 0,
      data.userEvents ?? data.totalEvents ?? 0,
      data.userJobs ?? data.totalJobs ?? 0,
    ];

    const duration = 1500;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      this.animatedStats.update((stats) =>
        stats.map((stat, i) => ({
          ...stat,
          value: targets[i],
          displayValue: Math.round(eased * targets[i]),
        }))
      );

      if (progress < 1) {
        this.animationFrameId = requestAnimationFrame(animate);
      }
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  // ── Helpers ───────────────────────────────────────────────

  shouldTruncatePost(content: string | undefined | null): boolean {
    return (content?.length ?? 0) > this.postContentPreviewLimit;
  }

  isPostExpanded(postId: string): boolean {
    return this.expandedPostContent().has(postId);
  }

  togglePostExpanded(postId: string): void {
    this.expandedPostContent.update((current) => {
      const next = new Set(current);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  }

  getPostPreview(content: string | undefined | null): string {
    const text = content ?? '';
    if (!this.shouldTruncatePost(text)) return text;
    return `${text.slice(0, this.postContentPreviewLimit).trimEnd()}...`;
  }

  // ── Image lightbox ───────────────────────────────────────────

  openImagePreview(images: string[], startIndex = 0): void {
    if (!images?.length) return;
    this.lightboxImages.set(images);
    this.activeImageIndex.set(Math.max(0, Math.min(startIndex, images.length - 1)));
    this.lightboxOpen.set(true);
  }

  closeImagePreview(): void {
    this.lightboxOpen.set(false);
    this.lightboxImages.set([]);
    this.activeImageIndex.set(0);
  }

  nextPreviewImage(): void {
    const images = this.lightboxImages();
    if (!images.length) return;
    this.activeImageIndex.update((current) => (current + 1) % images.length);
  }

  prevPreviewImage(): void {
    const images = this.lightboxImages();
    if (!images.length) return;
    this.activeImageIndex.update((current) => (current - 1 + images.length) % images.length);
  }

  getActivePreviewImage(): string | null {
    const images = this.lightboxImages();
    const index = this.activeImageIndex();
    if (!images.length || index < 0 || index >= images.length) return null;
    return images[index] ?? null;
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent): void {
    if (this.lightboxOpen()) {
      event.preventDefault();
      this.closeImagePreview();
      return;
    }
    if (this.shareModalOpen()) {
      event.preventDefault();
      this.closeShareModal();
    }
  }

  @HostListener('document:keydown.arrowright', ['$event'])
  onArrowRightKey(event: KeyboardEvent): void {
    if (!this.lightboxOpen()) return;
    event.preventDefault();
    this.nextPreviewImage();
  }

  @HostListener('document:keydown.arrowleft', ['$event'])
  onArrowLeftKey(event: KeyboardEvent): void {
    if (!this.lightboxOpen()) return;
    event.preventDefault();
    this.prevPreviewImage();
  }

  getPostTypeBadge(type: string): { label: string; class: string; icon: string } {
    switch (type) {
      case 'EMERGENCY':
        return { label: 'user.dashboard.postType.emergency', class: 'badge-emergency', icon: 'bi-exclamation-triangle-fill' };
      case 'HELP':
        return { label: 'user.dashboard.postType.help', class: 'badge-help', icon: 'bi-question-circle-fill' };
      case 'ENQUIRY':
        return { label: 'user.dashboard.postType.enquiry', class: 'badge-enquire', icon: 'bi-patch-question-fill' };
      default:
        return { label: 'user.dashboard.postType.general', class: 'badge-general', icon: 'bi-chat-fill' };
    }
  }

  getNotificationIcon(type: string): string {
    switch (type) {
      case 'POST_APPROVED': return 'bi-check-circle-fill';
      case 'POST_REJECTED': return 'bi-x-circle-fill';
      case 'NEW_COMMENT': return 'bi-chat-dots-fill';
      case 'NEW_LIKE': return 'bi-heart-fill';
      case 'NEW_MEMBER': return 'bi-person-plus-fill';
      case 'COMMUNITY_UPDATE': return 'bi-megaphone-fill';
      case 'EVENT_REMINDER': return 'bi-calendar-check-fill';
      default: return 'bi-bell-fill';
    }
  }

  getNotificationIconColor(type: string): string {
    switch (type) {
      case 'POST_APPROVED':    return '#16A34A';
      case 'POST_REJECTED':    return '#EF4444';
      case 'NEW_COMMENT':      return '#D97706';
      case 'NEW_LIKE':         return '#F59E0B';
      case 'NEW_MEMBER':       return '#16A34A';
      case 'COMMUNITY_UPDATE': return '#B45309';
      case 'EVENT_REMINDER':   return '#D97706';
      default:                 return '#9CA3AF';
    }
  }

  getTimeAgo(dateString: string): string {
    return this.relativeTime.format(dateString);
  }

  getUserInitials(user?: User): string {
    if (!user) return '?';
    const first = user.displayName?.charAt(0) ?? '';
    return first.toUpperCase() || user.userName?.charAt(0)?.toUpperCase() || '?';
  }

  isCommentByPostAuthor(post: Post, comment: Comment): boolean {
    return post.userId === comment.userId;
  }
}
