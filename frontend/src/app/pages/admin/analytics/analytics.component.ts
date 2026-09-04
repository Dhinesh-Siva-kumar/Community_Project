import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type ApexCharts from 'apexcharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AnalyticsService, AnalyticsOverview, AnalyticsGranularity,
} from '../../../core/services/analytics.service';
import { ToastService } from '../../../core/services/toast.service';
import { ApexChartComponent } from '../../../shared/components/apex-chart/apex-chart.component';
import { SelectOption, SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { DateInputComponent } from '../../../shared/components/date-input/date-input.component';
import { TranslateLoader, TranslatePipe, TranslateService, TranslationObject } from '@ngx-translate/core';

type ApexOptions = ApexCharts.ApexOptions;
type DatePreset = '7d' | '30d' | '90d' | '365d' | 'custom';

const AMBER   = '#F59E0B';
const INDIGO  = '#4F46E5';
const GREEN   = '#16A34A';
const ROSE    = '#DB2777';
const PURPLE  = '#7C3AED';
const CYAN    = '#0891B2';
const SLATE   = '#64748B';
const RED     = '#DC2626';

@Component({
  selector: 'app-admin-analytics',
  standalone: true,
  imports: [DateInputComponent, CommonModule, FormsModule, ApexChartComponent, SearchableSelectComponent, TranslatePipe],
  templateUrl: './analytics.component.html',
  styleUrls: ['./analytics.component.scss'],
})
export class AdminAnalyticsComponent implements OnInit {
  private analyticsService = inject(AnalyticsService);
  private toast = inject(ToastService);
  private translate = inject(TranslateService);
  private translateLoader = inject(TranslateLoader);

  /** ApexCharts options are plain objects, so series names/labels can't use the
   * translate pipe. They are resolved with `instant()` inside computed(), which
   * is not reactive on its own — this signal re-runs those computeds when the
   * user switches language. */
  private lang = signal(this.translate.currentLang);

  /** Resolve a catalog key in the active language, tracking `lang` so callers
   * inside computed() re-evaluate on switch. */
  private t(key: string): string {
    this.lang();
    return this.translate.instant(key) as string;
  }

  loading  = signal(true);
  exporting = signal<'pdf' | 'excel' | null>(null);
  overview = signal<AnalyticsOverview | null>(null);

  // ── Date range + granularity ────────────────────────────────
  datePreset  = signal<DatePreset>('30d');
  dateFrom    = signal<string>(this.isoDaysAgo(29));
  dateTo      = signal<string>(this.isoDaysAgo(0));
  granularity = signal<AnalyticsGranularity>('daily');
  rangeMax    = this.isoDaysAgo(0);

  readonly granularityOptions: SelectOption[] = [
    { value: 'daily',   label: 'admin.analytics.label.daily' },
    { value: 'weekly',  label: 'admin.analytics.label.weekly' },
    { value: 'monthly', label: 'admin.analytics.label.monthly' },
    { value: 'yearly',  label: 'admin.analytics.label.yearly' },
  ];

  ngOnInit(): void {
    this.translate.onLangChange.subscribe((e) => this.lang.set(e.lang));
    // Pre-load the English catalog so the PDF export (which cannot render
    // Tamil) has English strings available synchronously — see englishResolver().
    this.translateLoader.getTranslation('en').subscribe((c: TranslationObject) => {
      this.enCatalog = c as Record<string, unknown>;
    });
    this.load();
  }

  private isoDaysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }

  load(): void {
    this.loading.set(true);
    this.analyticsService.getOverview({
      from: this.dateFrom(),
      to: this.dateTo(),
      granularity: this.granularity(),
    }).subscribe({
      next: (res) => {
        this.overview.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('admin.analytics.toast.failedLoadAnalytics');
        this.loading.set(false);
      },
    });
  }

  applyPreset(preset: DatePreset): void {
    this.datePreset.set(preset);
    const days: Record<Exclude<DatePreset, 'custom'>, number> = { '7d': 6, '30d': 29, '90d': 89, '365d': 364 };
    if (preset !== 'custom') {
      this.dateFrom.set(this.isoDaysAgo(days[preset]));
      this.dateTo.set(this.isoDaysAgo(0));
    }
    this.load();
  }

  onDateFromChange(value: string): void {
    this.datePreset.set('custom');
    this.dateFrom.set(value);
    this.load();
  }

  onDateToChange(value: string): void {
    this.datePreset.set('custom');
    this.dateTo.set(value);
    this.load();
  }

  onGranularityChange(v: string | number): void {
    this.granularity.set(v as AnalyticsGranularity);
    this.load();
  }

  rangeLabel = computed(() => {
    const r = this.overview()?.range;
    return r ? `${r.from} to ${r.to}` : '';
  });

  // ── At-a-glance KPI strip — the single most important numbers from
  // every section, so an admin gets the full picture before reading
  // a single chart. ─────────────────────────────────────────────
  kpiCards = computed(() => {
    const ov = this.overview();
    if (!ov) return [];
    const newUsers = ov.userGrowth.data.reduce((sum, n) => sum + n, 0);
    const topCountry = ov.countryDistribution[0];
    const fmt = (n: number) => n.toLocaleString('en-GB');
    return [
      { icon: 'bi-person-plus-fill',    label: 'admin.analytics.label.newUsers',           value: fmt(newUsers),                   accent: 'amber'  },
      { icon: 'bi-person-check-fill',   label: 'admin.analytics.label.activeToday',        value: fmt(ov.activeUsers.today),       accent: 'indigo' },
      { icon: 'bi-arrow-repeat',        label: 'admin.analytics.label.retentionRate',      value: `${ov.retentionRate.rate}%`,     accent: 'green'  },
      { icon: 'bi-briefcase-fill',      label: 'admin.analytics.label.activeJobs',         value: fmt(ov.jobActivity.active),      accent: 'cyan'   },
      { icon: 'bi-patch-check-fill',    label: 'admin.analytics.label.verifiedBusinesses', value: fmt(ov.businessGrowth.verified), accent: 'rose'   },
      { icon: 'bi-globe-americas',      label: 'admin.analytics.label.topCountry',         value: topCountry?.country ?? '—',      accent: 'purple', sub: topCountry ? `${fmt(topCountry.count)} ${this.t('admin.analytics.series.users').toLowerCase()}` : '' },
    ];
  });

  // ── Label formatting for chart x-axes, based on current granularity ──
  formatLabel(iso: string): string {
    const d = new Date(iso);
    switch (this.granularity()) {
      case 'yearly':  return d.getUTCFullYear().toString();
      case 'monthly': return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
      default:        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }
  }

  private baseChart(type: 'line' | 'bar' | 'donut', height: number): ApexOptions['chart'] {
    return { type, height, toolbar: { show: false }, fontFamily: 'inherit', animations: { speed: 300 } };
  }

  // ── 1. User Growth — line chart ─────────────────────────────
  userGrowthChart = computed<ApexOptions | undefined>(() => {
    const s = this.overview()?.userGrowth;
    if (!s) return undefined;
    return {
      chart: this.baseChart('line', 280),
      series: [{ name: this.t('admin.analytics.series.newUsers'), data: s.data }],
      xaxis: { categories: s.labels.map((l) => this.formatLabel(l)) },
      colors: [AMBER],
      stroke: { curve: 'smooth', width: 3 },
      dataLabels: { enabled: false },
      grid: { borderColor: '#eee' },
    };
  });

  // ── 3. Country Distribution — bar chart (top 10) ────────────
  countryChart = computed<ApexOptions | undefined>(() => {
    const rows = this.overview()?.countryDistribution;
    if (!rows) return undefined;
    const top = rows.slice(0, 10);
    return {
      chart: this.baseChart('bar', 280),
      series: [{ name: this.t('admin.analytics.series.users'), data: top.map((r) => r.count) }],
      xaxis: { categories: top.map((r) => r.country) },
      plotOptions: { bar: { horizontal: true, borderRadius: 4, distributed: true } },
      colors: [INDIGO, AMBER, GREEN, ROSE, PURPLE, CYAN, SLATE, RED, '#0D9488', '#C026D3'],
      legend: { show: false },
      dataLabels: { enabled: true },
    };
  });

  // ── 4. Job Activity — bar chart (Active vs Inactive) ────────
  jobPostedChart = computed<ApexOptions | undefined>(() => {
    const s = this.overview()?.jobActivity.posted;
    if (!s) return undefined;
    return {
      chart: this.baseChart('bar', 220),
      series: [{ name: this.t('admin.analytics.series.jobsPosted'), data: s.data }],
      xaxis: { categories: s.labels.map((l) => this.formatLabel(l)) },
      colors: [CYAN],
      plotOptions: { bar: { borderRadius: 4, columnWidth: '55%' } },
      dataLabels: { enabled: false },
    };
  });

  // ── 5. Business Growth — line chart ─────────────────────────
  businessGrowthChart = computed<ApexOptions | undefined>(() => {
    const s = this.overview()?.businessGrowth.registered;
    if (!s) return undefined;
    return {
      chart: this.baseChart('line', 220),
      series: [{ name: this.t('admin.analytics.series.businessesRegistered'), data: s.data }],
      xaxis: { categories: s.labels.map((l) => this.formatLabel(l)) },
      colors: [ROSE],
      stroke: { curve: 'smooth', width: 3 },
      dataLabels: { enabled: false },
      grid: { borderColor: '#eee' },
    };
  });

  // ── 6. Community Engagement — multi-series line ─────────────
  engagementChart = computed<ApexOptions | undefined>(() => {
    const e = this.overview()?.communityEngagement;
    if (!e) return undefined;
    return {
      chart: this.baseChart('line', 280),
      series: [
        { name: this.t('admin.analytics.series.posts'), data: e.posts.data },
        { name: this.t('admin.analytics.series.comments'), data: e.comments.data },
        { name: this.t('admin.analytics.series.reactions'), data: e.reactions.data },
      ],
      xaxis: { categories: e.posts.labels.map((l) => this.formatLabel(l)) },
      colors: [AMBER, INDIGO, GREEN],
      stroke: { curve: 'smooth', width: 2 },
      dataLabels: { enabled: false },
      grid: { borderColor: '#eee' },
      legend: { position: 'top' },
    };
  });

  // ── 7. Retention Rate — donut chart ─────────────────────────
  retentionChart = computed<ApexOptions | undefined>(() => {
    const r = this.overview()?.retentionRate;
    if (!r) return undefined;
    const notReturned = Math.max(0, r.eligible - r.returned);
    return {
      chart: this.baseChart('donut', 220),
      series: [r.returned, notReturned],
      labels: [this.t('admin.analytics.series.returned'), this.t('admin.analytics.series.didNotReturn')],
      colors: [GREEN, SLATE],
      dataLabels: { enabled: true },
      legend: { position: 'bottom' },
    };
  });

  // ── 2. Business verified/active + job active/inactive as simple stat rows,
  // shown alongside their chart (not separate chart types).

  // ── Export ───────────────────────────────────────────────────
  // Shared data shaping for both PDF and Excel exports — one source of
  // truth for what "a report" contains, formatted for each target's needs.
  private buildReportSections(
    ov: AnalyticsOverview,
    tr: (key: string) => string,
  ): { title: string; headers: string[]; rows: (string | number)[][] }[] {
    const seriesRows = (s: { labels: string[]; data: number[] }) =>
      s.labels.map((l, i) => [this.formatLabel(l), s.data[i] ?? 0]);
    const k = (suffix: string) => tr(`admin.analytics.report.${suffix}`);

    return [
      {
        title: k('userGrowth'),
        headers: [k('period'), k('newUsers')],
        rows: seriesRows(ov.userGrowth),
      },
      {
        title: k('activeUsers'),
        headers: [k('window'), k('users')],
        rows: [
          [k('today'), ov.activeUsers.today],
          [k('thisWeek'), ov.activeUsers.thisWeek],
          [k('thisMonth'), ov.activeUsers.thisMonth],
        ],
      },
      {
        title: k('countryDistribution'),
        headers: [k('country'), k('users')],
        rows: ov.countryDistribution.map((r) => [r.country, r.count]),
      },
      {
        title: k('jobActivityPosted'),
        headers: [k('period'), k('jobsPosted')],
        rows: seriesRows(ov.jobActivity.posted),
      },
      {
        title: k('jobActivityStatus'),
        headers: [k('status'), k('count')],
        rows: [
          [k('active'), ov.jobActivity.active],
          [k('inactive'), ov.jobActivity.inactive],
        ],
      },
      {
        title: k('businessGrowthRegistered'),
        headers: [k('period'), k('businessesRegistered')],
        rows: seriesRows(ov.businessGrowth.registered),
      },
      {
        title: k('businessGrowthSummary'),
        headers: [k('metric'), k('count')],
        rows: [
          [k('totalRegistered'), ov.businessGrowth.total],
          [k('verified'), ov.businessGrowth.verified],
          [k('active'), ov.businessGrowth.active],
        ],
      },
      {
        title: k('communityEngagement'),
        headers: [k('period'), k('posts'), k('comments'), k('reactions')],
        rows: ov.communityEngagement.posts.labels.map((l, i) => [
          this.formatLabel(l),
          ov.communityEngagement.posts.data[i] ?? 0,
          ov.communityEngagement.comments.data[i] ?? 0,
          ov.communityEngagement.reactions.data[i] ?? 0,
        ]),
      },
      {
        title: k('retentionRate'),
        headers: [k('metric'), k('value')],
        rows: [
          [k('retentionRate'), `${ov.retentionRate.rate}%`],
          [k('eligibleUsers'), ov.retentionRate.eligible],
          [k('returnedLast30Days'), ov.retentionRate.returned],
        ],
      },
    ];
  }

  /**
   * jsPDF's built-in fonts carry no Tamil glyphs, so a Tamil PDF would render
   * as blank boxes. The PDF export therefore always resolves against the
   * English catalog; the Excel export (UTF-8 HTML) follows the active language.
   */
  private englishResolver(): (key: string) => string {
    const en = this.enCatalog;
    return (key: string) => {
      const value = key.split('.').reduce<unknown>(
        (acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined),
        en,
      );
      return typeof value === 'string' ? value : (this.translate.instant(key) as string);
    };
  }
  private enCatalog: Record<string, unknown> = {};

  exportPdf(): void {
    const ov = this.overview();
    if (!ov) return;
    this.exporting.set('pdf');
    try {
      const tr = this.englishResolver();
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(tr('admin.analytics.report.title'), 14, 18);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`${tr('admin.analytics.report.range')}: ${ov.range.from} ${tr('admin.analytics.report.to')} ${ov.range.to}  ·  ${tr('admin.analytics.report.granularity')}: ${ov.granularity}`, 14, 25);

      let y = 32;
      for (const section of this.buildReportSections(ov, tr)) {
        if (y > 260) { doc.addPage(); y = 20; }
        doc.setFontSize(12);
        doc.setTextColor(20);
        doc.text(section.title, 14, y);
        autoTable(doc, {
          startY: y + 3,
          head: [section.headers],
          body: section.rows.map((r) => r.map((c) => String(c))),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [217, 119, 6] },
          margin: { left: 14, right: 14 },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
      }

      doc.save(`analytics-${ov.range.from}_to_${ov.range.to}.pdf`);
      this.toast.success('admin.analytics.toast.pdfReportDownloaded');
    } catch {
      this.toast.error('admin.analytics.toast.failedGeneratePdf');
    } finally {
      this.exporting.set(null);
    }
  }

  exportExcel(): void {
    const ov = this.overview();
    if (!ov) return;
    this.exporting.set('excel');
    try {
      const escapeHtml = (v: string | number) =>
        String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const tr = (key: string) => this.translate.instant(key) as string;
      const sectionsHtml = this.buildReportSections(ov, tr).map((section) => {
        const headerRow = `<tr>${section.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
        const bodyRows = section.rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('');
        return `<h3>${escapeHtml(section.title)}</h3><table border="1">${headerRow}${bodyRows}</table><br/>`;
      }).join('');

      const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head>
        <body><h2>${tr('admin.analytics.report.title')} (${ov.range.from} ${tr('admin.analytics.report.to')} ${ov.range.to})</h2>${sectionsHtml}</body></html>`;

      const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-${ov.range.from}_to_${ov.range.to}.xls`;
      a.click();
      URL.revokeObjectURL(url);
      this.toast.success('admin.analytics.toast.excelReportDownloaded');
    } catch {
      this.toast.error('admin.analytics.toast.failedGenerateExcelFile');
    } finally {
      this.exporting.set(null);
    }
  }
}
