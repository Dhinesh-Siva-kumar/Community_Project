import {
  AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild,
} from '@angular/core';
import ApexCharts from 'apexcharts';

// Thin wrapper around vanilla ApexCharts (not the `ng-apexcharts` package —
// that wrapper requires Angular >=20 and can't install on this project's
// Angular 19). Pass a full ApexCharts options object; it renders on init
// and calls updateOptions() on subsequent changes.
@Component({
  selector: 'app-apex-chart',
  standalone: true,
  template: `<div #chartEl></div>`,
})
export class ApexChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('chartEl', { static: true }) chartEl!: ElementRef<HTMLDivElement>;
  @Input() options: ApexCharts.ApexOptions | undefined;

  private chart: ApexCharts | null = null;

  ngAfterViewInit(): void {
    if (this.options) {
      this.chart = new ApexCharts(this.chartEl.nativeElement, this.options);
      this.chart.render();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    const change = changes['options'];
    if (!change || change.firstChange || !this.options) return;
    if (this.chart) {
      this.chart.updateOptions(this.options, true, true);
    }
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}
