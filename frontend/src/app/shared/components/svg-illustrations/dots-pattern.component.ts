import { Component, input } from '@angular/core';

@Component({
  selector: 'app-dots-pattern',
  standalone: true,
  template: `
    <svg
      class="dots-pattern-svg"
      viewBox="0 0 400 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="presentation"
      aria-hidden="true"
    >
      <!-- Floating dots at various positions -->
      <circle cx="50" cy="40" r="3" [attr.fill]="primaryColor()" opacity="0.15" class="dot d-1"/>
      <circle cx="150" cy="30" r="2" [attr.fill]="secondaryColor()" opacity="0.12" class="dot d-2"/>
      <circle cx="280" cy="50" r="2.5" [attr.fill]="primaryColor()" opacity="0.1" class="dot d-3"/>
      <circle cx="370" cy="80" r="2" [attr.fill]="accentColor()" opacity="0.15" class="dot d-4"/>
      <circle cx="30" cy="130" r="2" [attr.fill]="secondaryColor()" opacity="0.1" class="dot d-5"/>
      <circle cx="120" cy="110" r="3.5" [attr.fill]="primaryColor()" opacity="0.08" class="dot d-6"/>
      <circle cx="230" cy="120" r="2" [attr.fill]="accentColor()" opacity="0.12" class="dot d-7"/>
      <circle cx="340" cy="150" r="3" [attr.fill]="primaryColor()" opacity="0.1" class="dot d-8"/>
      <circle cx="70" cy="220" r="2.5" [attr.fill]="accentColor()" opacity="0.12" class="dot d-9"/>
      <circle cx="180" cy="200" r="2" [attr.fill]="secondaryColor()" opacity="0.1" class="dot d-10"/>
      <circle cx="300" cy="230" r="3" [attr.fill]="primaryColor()" opacity="0.08" class="dot d-11"/>
      <circle cx="380" cy="260" r="2" [attr.fill]="secondaryColor()" opacity="0.12" class="dot d-12"/>
      <circle cx="40" cy="310" r="2" [attr.fill]="primaryColor()" opacity="0.1" class="dot d-13"/>
      <circle cx="160" cy="300" r="3" [attr.fill]="accentColor()" opacity="0.08" class="dot d-14"/>
      <circle cx="260" cy="320" r="2" [attr.fill]="secondaryColor()" opacity="0.12" class="dot d-15"/>
      <circle cx="350" cy="350" r="2.5" [attr.fill]="primaryColor()" opacity="0.1" class="dot d-16"/>
      <circle cx="100" cy="370" r="2" [attr.fill]="accentColor()" opacity="0.12" class="dot d-17"/>
      <circle cx="220" cy="380" r="3" [attr.fill]="primaryColor()" opacity="0.08" class="dot d-18"/>

      <!-- Subtle connection lines between some dots -->
      <line x1="50" y1="40" x2="150" y2="30" stroke="#4f46e5" stroke-width="0.5" opacity="0.06" class="conn"/>
      <line x1="150" y1="30" x2="280" y2="50" stroke="#7c3aed" stroke-width="0.5" opacity="0.06" class="conn"/>
      <line x1="120" y1="110" x2="230" y2="120" stroke="#4f46e5" stroke-width="0.5" opacity="0.05" class="conn"/>
      <line x1="70" y1="220" x2="180" y2="200" stroke="#0891b2" stroke-width="0.5" opacity="0.06" class="conn"/>
      <line x1="180" y1="200" x2="300" y2="230" stroke="#7c3aed" stroke-width="0.5" opacity="0.05" class="conn"/>
      <line x1="160" y1="300" x2="260" y2="320" stroke="#4f46e5" stroke-width="0.5" opacity="0.06" class="conn"/>
    </svg>
  `,
  styles: [`
    :host {
      display: block;
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 0;
      overflow: hidden;
    }

    .dots-pattern-svg {
      width: 100%;
      height: 100%;
    }

    .dot {
      animation: dotFloat 5s ease-in-out infinite;
    }

    .d-1 { animation-duration: 4.5s; }
    .d-2 { animation-duration: 5.2s; animation-delay: 0.3s; }
    .d-3 { animation-duration: 4.8s; animation-delay: 0.7s; }
    .d-4 { animation-duration: 5.5s; animation-delay: 0.1s; }
    .d-5 { animation-duration: 4.3s; animation-delay: 0.9s; }
    .d-6 { animation-duration: 5s; animation-delay: 0.4s; }
    .d-7 { animation-duration: 4.7s; animation-delay: 0.6s; }
    .d-8 { animation-duration: 5.3s; animation-delay: 0.2s; }
    .d-9 { animation-duration: 4.6s; animation-delay: 0.8s; }
    .d-10 { animation-duration: 5.1s; animation-delay: 0.5s; }
    .d-11 { animation-duration: 4.4s; animation-delay: 1s; }
    .d-12 { animation-duration: 5.4s; animation-delay: 0.3s; }
    .d-13 { animation-duration: 4.9s; animation-delay: 0.7s; }
    .d-14 { animation-duration: 5.2s; animation-delay: 0.1s; }
    .d-15 { animation-duration: 4.7s; animation-delay: 0.4s; }
    .d-16 { animation-duration: 5s; animation-delay: 0.6s; }
    .d-17 { animation-duration: 4.5s; animation-delay: 0.9s; }
    .d-18 { animation-duration: 5.3s; animation-delay: 0.2s; }

    @keyframes dotFloat {
      0%, 100% { transform: translate(0, 0); }
      33% { transform: translate(4px, -6px); }
      66% { transform: translate(-3px, 4px); }
    }

    .conn {
      animation: connFade 4s ease-in-out infinite;
    }

    @keyframes connFade {
      0%, 100% { opacity: 0.06; }
      50% { opacity: 0.02; }
    }

    @media (prefers-reduced-motion: reduce) {
      .dot, .conn {
        animation: none;
      }
    }
  `],
})
export class DotsPatternComponent {
  primaryColor = input<string>('#4f46e5');
  secondaryColor = input<string>('#7c3aed');
  accentColor = input<string>('#0891b2');
}
