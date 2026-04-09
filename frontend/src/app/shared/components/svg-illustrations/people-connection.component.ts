import { Component, input } from '@angular/core';

@Component({
  selector: 'app-people-connection',
  standalone: true,
  template: `
    <svg
      [attr.width]="width()"
      [attr.height]="height()"
      viewBox="0 0 600 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class="people-connection-svg"
      role="img"
      aria-label="People connecting illustration"
    >
      <!-- Animated connection lines -->
      <g class="connection-lines" opacity="0.3">
        <line x1="150" y1="180" x2="300" y2="140" stroke="#4f46e5" stroke-width="1.5" class="conn-line line-1"/>
        <line x1="300" y1="140" x2="450" y2="180" stroke="#7c3aed" stroke-width="1.5" class="conn-line line-2"/>
        <line x1="150" y1="180" x2="220" y2="280" stroke="#4f46e5" stroke-width="1.5" class="conn-line line-3"/>
        <line x1="450" y1="180" x2="380" y2="280" stroke="#7c3aed" stroke-width="1.5" class="conn-line line-4"/>
        <line x1="220" y1="280" x2="380" y2="280" stroke="#0891b2" stroke-width="1.5" class="conn-line line-5"/>
        <line x1="300" y1="140" x2="300" y2="260" stroke="#0891b2" stroke-width="1" class="conn-line line-6"/>
      </g>

      <!-- Connection dots at intersections -->
      <g class="connection-dots">
        <circle cx="150" cy="180" r="4" fill="#4f46e5" class="conn-dot dot-1"/>
        <circle cx="300" cy="140" r="5" fill="#7c3aed" class="conn-dot dot-2"/>
        <circle cx="450" cy="180" r="4" fill="#4f46e5" class="conn-dot dot-3"/>
        <circle cx="220" cy="280" r="4" fill="#0891b2" class="conn-dot dot-4"/>
        <circle cx="380" cy="280" r="4" fill="#0891b2" class="conn-dot dot-5"/>
        <circle cx="300" cy="260" r="3" fill="#7c3aed" class="conn-dot dot-6"/>
      </g>

      <!-- Person 1 (left) -->
      <g class="person person-1" transform="translate(120, 120)">
        <circle cx="30" cy="20" r="18" fill="#4f46e5" opacity="0.9"/>
        <path d="M30 42 C10 42 0 58 0 72 L60 72 C60 58 50 42 30 42Z" fill="#4f46e5" opacity="0.8"/>
      </g>

      <!-- Person 2 (center top) -->
      <g class="person person-2" transform="translate(270, 80)">
        <circle cx="30" cy="20" r="20" fill="#7c3aed" opacity="0.9"/>
        <path d="M30 44 C8 44 -2 62 -2 78 L62 78 C62 62 52 44 30 44Z" fill="#7c3aed" opacity="0.8"/>
      </g>

      <!-- Person 3 (right) -->
      <g class="person person-3" transform="translate(420, 120)">
        <circle cx="30" cy="20" r="18" fill="#4f46e5" opacity="0.9"/>
        <path d="M30 42 C10 42 0 58 0 72 L60 72 C60 58 50 42 30 42Z" fill="#4f46e5" opacity="0.8"/>
      </g>

      <!-- Person 4 (bottom left) -->
      <g class="person person-4" transform="translate(190, 225)">
        <circle cx="30" cy="20" r="16" fill="#0891b2" opacity="0.9"/>
        <path d="M30 40 C12 40 2 54 2 66 L58 66 C58 54 48 40 30 40Z" fill="#0891b2" opacity="0.8"/>
      </g>

      <!-- Person 5 (bottom right) -->
      <g class="person person-5" transform="translate(350, 225)">
        <circle cx="30" cy="20" r="16" fill="#0891b2" opacity="0.9"/>
        <path d="M30 40 C12 40 2 54 2 66 L58 66 C58 54 48 40 30 40Z" fill="#0891b2" opacity="0.8"/>
      </g>

      <!-- Center connection hub -->
      <g class="center-hub" transform="translate(280, 240)">
        <circle cx="20" cy="20" r="12" fill="none" stroke="#7c3aed" stroke-width="2" opacity="0.5" class="hub-ring"/>
        <circle cx="20" cy="20" r="6" fill="#7c3aed" opacity="0.6" class="hub-core"/>
      </g>

      <!-- Floating particles -->
      <circle cx="100" cy="100" r="2" fill="#4f46e5" opacity="0.4" class="particle p-1"/>
      <circle cx="500" cy="120" r="2.5" fill="#7c3aed" opacity="0.3" class="particle p-2"/>
      <circle cx="80" cy="300" r="2" fill="#0891b2" opacity="0.4" class="particle p-3"/>
      <circle cx="520" cy="320" r="2" fill="#4f46e5" opacity="0.3" class="particle p-4"/>
      <circle cx="300" cy="50" r="2" fill="#0891b2" opacity="0.3" class="particle p-5"/>
      <circle cx="200" cy="350" r="1.5" fill="#7c3aed" opacity="0.3" class="particle p-6"/>
      <circle cx="430" cy="350" r="1.5" fill="#4f46e5" opacity="0.3" class="particle p-7"/>
    </svg>
  `,
  styles: [`
    :host {
      display: block;
      line-height: 0;
    }

    .people-connection-svg {
      width: 100%;
      height: auto;
      max-width: 100%;
    }

    /* Connection lines draw in */
    .conn-line {
      stroke-dasharray: 400;
      stroke-dashoffset: 400;
      animation: drawLine 1.5s ease forwards;
    }
    .line-1 { animation-delay: 0.2s; }
    .line-2 { animation-delay: 0.4s; }
    .line-3 { animation-delay: 0.6s; }
    .line-4 { animation-delay: 0.8s; }
    .line-5 { animation-delay: 1.0s; }
    .line-6 { animation-delay: 1.2s; }

    @keyframes drawLine {
      to { stroke-dashoffset: 0; }
    }

    /* Connection dots pulse in */
    .conn-dot {
      opacity: 0;
      animation: dotAppear 0.5s ease forwards;
    }
    .dot-1 { animation-delay: 0.3s; }
    .dot-2 { animation-delay: 0.5s; }
    .dot-3 { animation-delay: 0.7s; }
    .dot-4 { animation-delay: 0.9s; }
    .dot-5 { animation-delay: 1.1s; }
    .dot-6 { animation-delay: 1.3s; }

    @keyframes dotAppear {
      0% { opacity: 0; r: 0; }
      60% { opacity: 1; }
      100% { opacity: 1; }
    }

    /* People fade in with slight rise */
    .person {
      opacity: 0;
      animation: personAppear 0.7s ease forwards;
    }
    .person-1 { animation-delay: 0.2s; }
    .person-2 { animation-delay: 0.4s; }
    .person-3 { animation-delay: 0.6s; }
    .person-4 { animation-delay: 0.8s; }
    .person-5 { animation-delay: 1.0s; }

    @keyframes personAppear {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Center hub pulsing */
    .hub-ring {
      animation: hubPulse 2.5s ease-in-out infinite;
    }

    @keyframes hubPulse {
      0%, 100% { r: 12; opacity: 0.5; }
      50% { r: 16; opacity: 0.2; }
    }

    .hub-core {
      animation: hubCorePulse 2.5s ease-in-out infinite;
    }

    @keyframes hubCorePulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }

    /* Floating particles */
    .particle {
      animation: floatParticle 4s ease-in-out infinite;
    }
    .p-1 { animation-duration: 3.5s; }
    .p-2 { animation-duration: 4.2s; animation-delay: 0.5s; }
    .p-3 { animation-duration: 3.8s; animation-delay: 1s; }
    .p-4 { animation-duration: 4.5s; animation-delay: 0.3s; }
    .p-5 { animation-duration: 3.3s; animation-delay: 0.8s; }
    .p-6 { animation-duration: 4s; animation-delay: 1.2s; }
    .p-7 { animation-duration: 3.6s; animation-delay: 0.6s; }

    @keyframes floatParticle {
      0%, 100% { transform: translate(0, 0); }
      25% { transform: translate(5px, -8px); }
      50% { transform: translate(-3px, -12px); }
      75% { transform: translate(4px, -5px); }
    }

    @media (prefers-reduced-motion: reduce) {
      .conn-line, .conn-dot, .person, .hub-ring, .hub-core, .particle {
        animation: none;
        opacity: 1;
        stroke-dashoffset: 0;
      }
    }
  `],
})
export class PeopleConnectionComponent {
  width = input<string>('600');
  height = input<string>('400');
}
