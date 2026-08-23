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
  imports: [DateInputComponent, CommonModule, FormsModule, ApexChartComponent, SearchableSelectComponent],
  templateUrl: './analytics.component.html',
  styleUrls: ['./analytics.component.scss'],
})
export class AdminAnalyticsComponent implements OnInit {
  private analyticsService = inject(AnalyticsService);
  private toast = inject(ToastService);

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
    { value: 'daily',   label: 'Daily' },
    { value: 'weekly',  label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly',  label: 'Yearly' },
  ];

  ngOnInit(): void {
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
        this.toast.error('Failed to load analytics');
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
      { icon: 'bi-person-plus-fill',    label: 'New Users',           value: fmt(newUsers),                   accent: 'amber'  },
      { icon: 'bi-person-check-fill',   label: 'Active Today',        value: fmt(ov.activeUsers.today),       accent: 'indigo' },
      { icon: 'bi-arrow-repeat',        label: 'Retention Rate',      value: `${ov.retentionRate.rate}%`,     accent: 'green'  },
      { icon: 'bi-briefcase-fill',      label: 'Active Jobs',         value: fmt(ov.jobActivity.active),      accent: 'cyan'   },
      { icon: 'bi-patch-check-fill',    label: 'Verified Businesses', value: fmt(ov.businessGrowth.verified), accent: 'rose'   },
      { icon: 'bi-globe-americas',      label: 'Top Country',         value: topCountry?.country ?? '—',      accent: 'purple', sub: topCountry ? `${fmt(topCountry.count)} users` : '' },
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
      series: [{ name: 'New Users', data: s.data }],
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
      series: [{ name: 'Users', data: top.map((r) => r.count) }],
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
      series: [{ name: 'Jobs Posted', data: s.data }],
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
      series: [{ name: 'Businesses Registered', data: s.data }],
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
        { name: 'Posts',     data: e.posts.data },
        { name: 'Comments',  data: e.comments.data },
        { name: 'Reactions', data: e.reactions.data },
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
      labels: ['Returned', 'Did not return'],
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
  private buildReportSections(ov: AnalyticsOverview): { title: string; headers: string[]; rows: (string | number)[][] }[] {
    const seriesRows = (s: { labels: string[]; data: number[] }) =>
      s.labels.map((l, i) => [this.formatLabel(l), s.data[i] ?? 0]);

    return [
      {
        title: 'User Growth',
        headers: ['Period', 'New Users'],
        rows: seriesRows(ov.userGrowth),
      },
      {
        title: 'Active Users',
        headers: ['Window', 'Users'],
        rows: [
          ['Today', ov.activeUsers.today],
          ['This Week', ov.activeUsers.thisWeek],
          ['This Month', ov.activeUsers.thisMonth],
        ],
      },
      {
        title: 'Country Distribution',
        headers: ['Country', 'Users'],
        rows: ov.countryDistribution.map((r) => [r.country, r.count]),
      },
      {
        title: 'Job Activity — Posted Over Time',
        headers: ['Period', 'Jobs Posted'],
        rows: seriesRows(ov.jobActivity.posted),
      },
      {
        title: 'Job Activity — Status',
        headers: ['Status', 'Count'],
        rows: [
          ['Active', ov.jobActivity.active],
          ['Inactive', ov.jobActivity.inactive],
        ],
      },
      {
        title: 'Business Growth — Registered Over Time',
        headers: ['Period', 'Businesses Registered'],
        rows: seriesRows(ov.businessGrowth.registered),
      },
      {
        title: 'Business Growth — Summary',
        headers: ['Metric', 'Count'],
        rows: [
          ['Total Registered', ov.businessGrowth.total],
          ['Verified', ov.businessGrowth.verified],
          ['Active', ov.businessGrowth.active],
        ],
      },
      {
        title: 'Community Engagement',
        headers: ['Period', 'Posts', 'Comments', 'Reactions'],
        rows: ov.communityEngagement.posts.labels.map((l, i) => [
          this.formatLabel(l),
          ov.communityEngagement.posts.data[i] ?? 0,
          ov.communityEngagement.comments.data[i] ?? 0,
          ov.communityEngagement.reactions.data[i] ?? 0,
        ]),
      },
      {
        title: 'Retention Rate',
        headers: ['Metric', 'Value'],
        rows: [
          ['Retention Rate', `${ov.retentionRate.rate}%`],
          ['Eligible Users (30+ days old)', ov.retentionRate.eligible],
          ['Returned in Last 30 Days', ov.retentionRate.returned],
        ],
      },
    ];
  }

  exportPdf(): void {
    const ov = this.overview();
    if (!ov) return;
    this.exporting.set('pdf');
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Advanced Analytics Report', 14, 18);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Range: ${ov.range.from} to ${ov.range.to}  ·  Granularity: ${ov.granularity}`, 14, 25);

      let y = 32;
      for (const section of this.buildReportSections(ov)) {
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
      this.toast.success('PDF report downloaded');
    } catch {
      this.toast.error('Failed to generate PDF');
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

      const sectionsHtml = this.buildReportSections(ov).map((section) => {
        const headerRow = `<tr>${section.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
        const bodyRows = section.rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('');
        return `<h3>${escapeHtml(section.title)}</h3><table border="1">${headerRow}${bodyRows}</table><br/>`;
      }).join('');

      const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head>
        <body><h2>Advanced Analytics Report (${ov.range.from} to ${ov.range.to})</h2>${sectionsHtml}</body></html>`;

      const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-${ov.range.from}_to_${ov.range.to}.xls`;
      a.click();
      URL.revokeObjectURL(url);
      this.toast.success('Excel report downloaded');
    } catch {
      this.toast.error('Failed to generate Excel file');
    } finally {
      this.exporting.set(null);
    }
  }
}
