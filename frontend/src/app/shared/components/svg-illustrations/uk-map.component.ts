import { Component, input } from '@angular/core';

@Component({
  selector: 'app-uk-map',
  standalone: true,
  template: `
    <svg
      [attr.width]="width()"
      [attr.height]="height()"
      viewBox="0 0 300 450"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class="uk-map-svg"
      role="img"
      aria-label="UK map illustration"
    >
      <!-- UK Simplified silhouette -->
      <path
        class="uk-outline"
        d="M140,20 L155,25 L165,15 L175,30 L185,28 L190,40 L180,55 L190,65 L185,80
           L195,90 L190,105 L200,115 L195,130 L205,140 L200,155 L210,165 L205,180
           L215,195 L205,210 L210,225 L200,235 L195,250 L200,265 L190,275 L185,290
           L175,295 L170,310 L180,320 L175,335 L165,340 L170,355 L160,365 L155,375
           L145,380 L140,395 L130,390 L125,380 L115,375 L110,365 L100,370 L95,360
           L105,350 L100,340 L90,335 L95,320 L85,310 L90,295 L80,285 L85,270
           L95,265 L90,250 L100,240 L95,225 L105,215 L100,200 L110,190 L105,175
           L115,165 L110,150 L120,140 L115,125 L125,115 L120,100 L130,90 L125,75
           L135,65 L130,50 L140,40Z"
        fill="#4f46e5"
        opacity="0.08"
        stroke="#4f46e5"
        stroke-width="1.5"
        stroke-opacity="0.3"
      />

      <!-- Scotland hint (top area) -->
      <path
        class="scotland-area"
        d="M120,20 L130,10 L140,20 L135,30 L125,25Z"
        fill="#7c3aed"
        opacity="0.06"
      />

      <!-- Location pins with pulse -->
      <!-- London -->
      <g class="pin pin-1" transform="translate(160, 330)">
        <circle cx="0" cy="0" r="8" fill="#4f46e5" opacity="0.15" class="pin-pulse"/>
        <circle cx="0" cy="0" r="4" fill="#4f46e5" opacity="0.8"/>
        <circle cx="0" cy="0" r="2" fill="white" opacity="0.9"/>
      </g>

      <!-- Birmingham -->
      <g class="pin pin-2" transform="translate(145, 270)">
        <circle cx="0" cy="0" r="7" fill="#7c3aed" opacity="0.15" class="pin-pulse"/>
        <circle cx="0" cy="0" r="3.5" fill="#7c3aed" opacity="0.8"/>
        <circle cx="0" cy="0" r="1.5" fill="white" opacity="0.9"/>
      </g>

      <!-- Manchester -->
      <g class="pin pin-3" transform="translate(135, 220)">
        <circle cx="0" cy="0" r="7" fill="#0891b2" opacity="0.15" class="pin-pulse"/>
        <circle cx="0" cy="0" r="3.5" fill="#0891b2" opacity="0.8"/>
        <circle cx="0" cy="0" r="1.5" fill="white" opacity="0.9"/>
      </g>

      <!-- Edinburgh -->
      <g class="pin pin-4" transform="translate(130, 115)">
        <circle cx="0" cy="0" r="6" fill="#4f46e5" opacity="0.15" class="pin-pulse"/>
        <circle cx="0" cy="0" r="3" fill="#4f46e5" opacity="0.8"/>
        <circle cx="0" cy="0" r="1.5" fill="white" opacity="0.9"/>
      </g>

      <!-- Bristol -->
      <g class="pin pin-5" transform="translate(125, 320)">
        <circle cx="0" cy="0" r="6" fill="#7c3aed" opacity="0.15" class="pin-pulse"/>
        <circle cx="0" cy="0" r="3" fill="#7c3aed" opacity="0.8"/>
        <circle cx="0" cy="0" r="1.5" fill="white" opacity="0.9"/>
      </g>

      <!-- City labels -->
      <text x="172" y="335" fill="#4f46e5" font-size="9" font-family="Inter, sans-serif" opacity="0.7" class="city-label cl-1">London</text>
      <text x="157" y="275" fill="#7c3aed" font-size="8" font-family="Inter, sans-serif" opacity="0.6" class="city-label cl-2">Birmingham</text>
      <text x="147" y="225" fill="#0891b2" font-size="8" font-family="Inter, sans-serif" opacity="0.6" class="city-label cl-3">Manchester</text>
      <text x="142" y="120" fill="#4f46e5" font-size="8" font-family="Inter, sans-serif" opacity="0.6" class="city-label cl-4">Edinburgh</text>
      <text x="80" y="326" fill="#7c3aed" font-size="8" font-family="Inter, sans-serif" opacity="0.6" class="city-label cl-5">Bristol</text>

      <!-- Connection lines between cities -->
      <g class="city-connections" opacity="0.15">
        <line x1="160" y1="330" x2="145" y2="270" stroke="#4f46e5" stroke-width="0.8" stroke-dasharray="4 3" class="city-line"/>
        <line x1="145" y1="270" x2="135" y2="220" stroke="#7c3aed" stroke-width="0.8" stroke-dasharray="4 3" class="city-line"/>
        <line x1="135" y1="220" x2="130" y2="115" stroke="#0891b2" stroke-width="0.8" stroke-dasharray="4 3" class="city-line"/>
        <line x1="160" y1="330" x2="125" y2="320" stroke="#7c3aed" stroke-width="0.8" stroke-dasharray="4 3" class="city-line"/>
      </g>
    </svg>
  `,
  styles: [`
    :host {
      display: block;
      line-height: 0;
    }

    .uk-map-svg {
      width: 100%;
      height: auto;
      max-width: 100%;
    }

    .uk-outline {
      animation: outlineDraw 2s ease forwards;
      stroke-dasharray: 2000;
      stroke-dashoffset: 2000;
    }

    @keyframes outlineDraw {
      to { stroke-dashoffset: 0; }
    }

    .pin {
      opacity: 0;
      animation: pinDrop 0.5s ease forwards;
    }
    .pin-1 { animation-delay: 1s; }
    .pin-2 { animation-delay: 1.3s; }
    .pin-3 { animation-delay: 1.6s; }
    .pin-4 { animation-delay: 1.9s; }
    .pin-5 { animation-delay: 2.2s; }

    @keyframes pinDrop {
      0% { opacity: 0; transform: translateY(-10px) scale(0.5); }
      60% { transform: translateY(2px) scale(1.1); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }

    .pin-pulse {
      animation: pinPulseAnim 2s ease-in-out infinite 2.5s;
    }

    @keyframes pinPulseAnim {
      0%, 100% { r: 8; opacity: 0.15; }
      50% { r: 12; opacity: 0.05; }
    }

    .city-label {
      opacity: 0;
      animation: labelFade 0.4s ease forwards;
    }
    .cl-1 { animation-delay: 1.2s; }
    .cl-2 { animation-delay: 1.5s; }
    .cl-3 { animation-delay: 1.8s; }
    .cl-4 { animation-delay: 2.1s; }
    .cl-5 { animation-delay: 2.4s; }

    @keyframes labelFade {
      from { opacity: 0; transform: translateX(5px); }
      to { opacity: 0.6; transform: translateX(0); }
    }

    .city-line {
      stroke-dasharray: 200;
      stroke-dashoffset: 200;
      animation: lineReveal 1s ease forwards;
    }
    .city-line:nth-child(1) { animation-delay: 1.5s; }
    .city-line:nth-child(2) { animation-delay: 1.8s; }
    .city-line:nth-child(3) { animation-delay: 2.1s; }
    .city-line:nth-child(4) { animation-delay: 2.4s; }

    @keyframes lineReveal {
      to { stroke-dashoffset: 0; }
    }

    @media (prefers-reduced-motion: reduce) {
      .uk-outline, .pin, .city-label, .city-line, .pin-pulse {
        animation: none;
        opacity: 1;
        stroke-dashoffset: 0;
      }
      .city-label { opacity: 0.6; }
    }
  `],
})
export class UkMapComponent {
  width = input<string>('300');
  height = input<string>('450');
}
