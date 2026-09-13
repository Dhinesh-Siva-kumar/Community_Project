import { Component, Input } from '@angular/core';

/**
 * Verification-state avatar ring used on the Student Connect card and
 * profile header (STUDENT_CONNECT_SPEC.md §6) — solid green for a verified
 * student, dashed amber for pending. Shape differs, not just color, so the
 * state still reads without relying on color alone.
 */
@Component({
  selector: 'app-avatar-ring',
  standalone: true,
  template: `
    <div class="avatar-ring" [class.avatar-ring--verified]="status === 'verified'" [class.avatar-ring--pending]="status !== 'verified'"
      [style.width.px]="size" [style.height.px]="size">
      <div class="avatar-ring__inner" [style.width.px]="innerSize" [style.height.px]="innerSize" [style.font-size.px]="fontSize">
        {{ initial }}
      </div>
    </div>
  `,
  styles: [`
    @use '../../../../assets/styles/index' as *;

    .avatar-ring {
      border-radius: $radius-full; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
      border: 2.5px solid $color-border; box-sizing: border-box;
    }
    .avatar-ring--verified { border-color: $color-success; border-style: solid; }
    .avatar-ring--pending { border-color: $color-primary-dark; border-style: dashed; }
    .avatar-ring__inner {
      border-radius: $radius-full; display: flex; align-items: center; justify-content: center;
      font-family: $font-family-header; font-weight: $font-weight-bold; color: $color-on-primary;
      background: $gradient-primary; flex-shrink: 0;
    }
  `],
})
export class AvatarRingComponent {
  @Input({ required: true }) initial!: string;
  @Input({ required: true }) status!: 'verified' | 'pending';
  @Input() size = 54;

  get innerSize(): number {
    return Math.round(this.size * 0.86);
  }

  get fontSize(): number {
    return Math.round(this.size * 0.32);
  }
}
