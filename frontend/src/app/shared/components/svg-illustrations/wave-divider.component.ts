import { Component, input } from '@angular/core';

@Component({
  selector: 'app-wave-divider',
  standalone: true,
  template: `
    <svg
      viewBox="0 0 1440 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class="wave-divider-svg"
      [class.flipped]="flip()"
      preserveAspectRatio="none"
      role="presentation"
      aria-hidden="true"
    >
      <path
        class="wave wave-back"
        [attr.fill]="color()"
        fill-opacity="0.3"
        d="M0,60 C240,120 480,0 720,60 C960,120 1200,0 1440,60 L1440,120 L0,120Z"
      />
      <path
        class="wave wave-mid"
        [attr.fill]="color()"
        fill-opacity="0.5"
        d="M0,80 C200,20 400,100 720,60 C1040,20 1240,100 1440,80 L1440,120 L0,120Z"
      />
      <path
        class="wave wave-front"
        [attr.fill]="color()"
        fill-opacity="0.8"
        d="M0,90 C360,50 720,110 1080,70 C1260,50 1380,90 1440,90 L1440,120 L0,120Z"
      />
    </svg>
  `,
  styles: [`
    :host {
      display: block;
      line-height: 0;
      overflow: hidden;
    }

    .wave-divider-svg {
      display: block;
      width: 100%;
      height: 80px;
    }

    .wave-divider-svg.flipped {
      transform: rotate(180deg);
    }

    .wave-back {
      animation: waveShift1 8s ease-in-out infinite;
    }

    .wave-mid {
      animation: waveShift2 6s ease-in-out infinite;
    }

    .wave-front {
      animation: waveShift3 7s ease-in-out infinite;
    }

    @keyframes waveShift1 {
      0%, 100% { d: path("M0,60 C240,120 480,0 720,60 C960,120 1200,0 1440,60 L1440,120 L0,120Z"); }
      50% { d: path("M0,70 C240,10 480,100 720,50 C960,10 1200,100 1440,70 L1440,120 L0,120Z"); }
    }

    @keyframes waveShift2 {
      0%, 100% { d: path("M0,80 C200,20 400,100 720,60 C1040,20 1240,100 1440,80 L1440,120 L0,120Z"); }
      50% { d: path("M0,70 C200,100 400,20 720,70 C1040,100 1240,20 1440,70 L1440,120 L0,120Z"); }
    }

    @keyframes waveShift3 {
      0%, 100% { d: path("M0,90 C360,50 720,110 1080,70 C1260,50 1380,90 1440,90 L1440,120 L0,120Z"); }
      50% { d: path("M0,85 C360,110 720,50 1080,90 C1260,100 1380,70 1440,85 L1440,120 L0,120Z"); }
    }

    @media (prefers-reduced-motion: reduce) {
      .wave-back, .wave-mid, .wave-front {
        animation: none;
      }
    }

    @media (max-width: 768px) {
      .wave-divider-svg {
        height: 50px;
      }
    }
  `],
})
export class WaveDividerComponent {
  color = input<string>('#4f46e5');
  flip = input<boolean>(false);
}
