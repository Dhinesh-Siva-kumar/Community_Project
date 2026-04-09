import { Component, input } from '@angular/core';

@Component({
  selector: 'app-community-activity',
  standalone: true,
  template: `
    <svg
      [attr.width]="width()"
      [attr.height]="height()"
      viewBox="0 0 600 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class="community-activity-svg"
      role="img"
      aria-label="Community activity illustration"
    >
      <!-- Outer ring -->
      <circle cx="300" cy="150" r="120" stroke="#4f46e5" stroke-width="1" opacity="0.15" class="outer-ring"/>
      <circle cx="300" cy="150" r="80" stroke="#7c3aed" stroke-width="1" opacity="0.12" class="inner-ring"/>

      <!-- Network connection lines -->
      <g class="network-lines" opacity="0.2">
        <line x1="200" y1="100" x2="300" y2="70" stroke="#4f46e5" stroke-width="1" class="net-line"/>
        <line x1="300" y1="70" x2="400" y2="100" stroke="#7c3aed" stroke-width="1" class="net-line"/>
        <line x1="400" y1="100" x2="420" y2="180" stroke="#4f46e5" stroke-width="1" class="net-line"/>
        <line x1="420" y1="180" x2="370" y2="240" stroke="#0891b2" stroke-width="1" class="net-line"/>
        <line x1="370" y1="240" x2="230" y2="240" stroke="#7c3aed" stroke-width="1" class="net-line"/>
        <line x1="230" y1="240" x2="180" y2="180" stroke="#0891b2" stroke-width="1" class="net-line"/>
        <line x1="180" y1="180" x2="200" y2="100" stroke="#4f46e5" stroke-width="1" class="net-line"/>
        <!-- Cross lines -->
        <line x1="200" y1="100" x2="420" y2="180" stroke="#7c3aed" stroke-width="0.5" class="net-line"/>
        <line x1="400" y1="100" x2="230" y2="240" stroke="#4f46e5" stroke-width="0.5" class="net-line"/>
        <line x1="300" y1="70" x2="300" y2="240" stroke="#0891b2" stroke-width="0.5" class="net-line"/>
      </g>

      <!-- People nodes on the network -->
      <!-- Person top -->
      <g class="node node-1" transform="translate(285, 45)">
        <circle cx="15" cy="10" r="10" fill="#7c3aed" opacity="0.85"/>
        <path d="M15 22 C6 22 0 30 0 38 L30 38 C30 30 24 22 15 22Z" fill="#7c3aed" opacity="0.7"/>
      </g>

      <!-- Person top-left -->
      <g class="node node-2" transform="translate(180, 78)">
        <circle cx="14" cy="9" r="9" fill="#4f46e5" opacity="0.85"/>
        <path d="M14 20 C6 20 0 27 0 34 L28 34 C28 27 22 20 14 20Z" fill="#4f46e5" opacity="0.7"/>
      </g>

      <!-- Person top-right -->
      <g class="node node-3" transform="translate(385, 78)">
        <circle cx="14" cy="9" r="9" fill="#4f46e5" opacity="0.85"/>
        <path d="M14 20 C6 20 0 27 0 34 L28 34 C28 27 22 20 14 20Z" fill="#4f46e5" opacity="0.7"/>
      </g>

      <!-- Person right -->
      <g class="node node-4" transform="translate(405, 160)">
        <circle cx="14" cy="9" r="9" fill="#0891b2" opacity="0.85"/>
        <path d="M14 20 C6 20 0 27 0 34 L28 34 C28 27 22 20 14 20Z" fill="#0891b2" opacity="0.7"/>
      </g>

      <!-- Person bottom-right -->
      <g class="node node-5" transform="translate(355, 222)">
        <circle cx="14" cy="9" r="9" fill="#7c3aed" opacity="0.85"/>
        <path d="M14 20 C6 20 0 27 0 34 L28 34 C28 27 22 20 14 20Z" fill="#7c3aed" opacity="0.7"/>
      </g>

      <!-- Person bottom-left -->
      <g class="node node-6" transform="translate(215, 222)">
        <circle cx="14" cy="9" r="9" fill="#7c3aed" opacity="0.85"/>
        <path d="M14 20 C6 20 0 27 0 34 L28 34 C28 27 22 20 14 20Z" fill="#7c3aed" opacity="0.7"/>
      </g>

      <!-- Person left -->
      <g class="node node-7" transform="translate(163, 160)">
        <circle cx="14" cy="9" r="9" fill="#0891b2" opacity="0.85"/>
        <path d="M14 20 C6 20 0 27 0 34 L28 34 C28 27 22 20 14 20Z" fill="#0891b2" opacity="0.7"/>
      </g>

      <!-- Center emblem -->
      <g class="center-emblem">
        <circle cx="300" cy="155" r="22" fill="#4f46e5" opacity="0.12" class="emblem-glow"/>
        <circle cx="300" cy="155" r="14" fill="#4f46e5" opacity="0.2"/>
        <path d="M293 152 L300 145 L307 152 M293 158 L300 165 L307 158" stroke="#4f46e5" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
      </g>

      <!-- Floating accent dots -->
      <circle cx="130" cy="60" r="2" fill="#4f46e5" opacity="0.3" class="accent-dot ad-1"/>
      <circle cx="470" cy="60" r="2" fill="#7c3aed" opacity="0.3" class="accent-dot ad-2"/>
      <circle cx="130" cy="260" r="1.5" fill="#0891b2" opacity="0.25" class="accent-dot ad-3"/>
      <circle cx="470" cy="260" r="1.5" fill="#4f46e5" opacity="0.25" class="accent-dot ad-4"/>
      <circle cx="540" cy="150" r="2" fill="#7c3aed" opacity="0.2" class="accent-dot ad-5"/>
      <circle cx="60" cy="150" r="2" fill="#0891b2" opacity="0.2" class="accent-dot ad-6"/>
    </svg>
  `,
  styles: [`
    :host {
      display: block;
      line-height: 0;
    }

    .community-activity-svg {
      width: 100%;
      height: auto;
      max-width: 100%;
    }

    .outer-ring {
      animation: ringPulse 4s ease-in-out infinite;
    }

    .inner-ring {
      animation: ringPulse 4s ease-in-out infinite 1s;
    }

    @keyframes ringPulse {
      0%, 100% { opacity: 0.15; }
      50% { opacity: 0.08; }
    }

    .net-line {
      stroke-dasharray: 300;
      stroke-dashoffset: 300;
      animation: drawNet 1.2s ease forwards;
    }

    .net-line:nth-child(1) { animation-delay: 0.1s; }
    .net-line:nth-child(2) { animation-delay: 0.2s; }
    .net-line:nth-child(3) { animation-delay: 0.3s; }
    .net-line:nth-child(4) { animation-delay: 0.4s; }
    .net-line:nth-child(5) { animation-delay: 0.5s; }
    .net-line:nth-child(6) { animation-delay: 0.6s; }
    .net-line:nth-child(7) { animation-delay: 0.7s; }
    .net-line:nth-child(8) { animation-delay: 0.8s; }
    .net-line:nth-child(9) { animation-delay: 0.9s; }
    .net-line:nth-child(10) { animation-delay: 1.0s; }

    @keyframes drawNet {
      to { stroke-dashoffset: 0; }
    }

    .node {
      opacity: 0;
      animation: nodeAppear 0.6s ease forwards;
    }
    .node-1 { animation-delay: 0.3s; }
    .node-2 { animation-delay: 0.5s; }
    .node-3 { animation-delay: 0.5s; }
    .node-4 { animation-delay: 0.7s; }
    .node-5 { animation-delay: 0.9s; }
    .node-6 { animation-delay: 0.9s; }
    .node-7 { animation-delay: 0.7s; }

    @keyframes nodeAppear {
      from { opacity: 0; transform: scale(0.5); }
      to { opacity: 1; transform: scale(1); }
    }

    .emblem-glow {
      animation: emblemPulse 3s ease-in-out infinite;
    }

    @keyframes emblemPulse {
      0%, 100% { r: 22; opacity: 0.12; }
      50% { r: 28; opacity: 0.06; }
    }

    .accent-dot {
      animation: accentFloat 3.5s ease-in-out infinite;
    }
    .ad-1 { animation-duration: 3s; }
    .ad-2 { animation-duration: 3.8s; animation-delay: 0.5s; }
    .ad-3 { animation-duration: 3.2s; animation-delay: 0.8s; }
    .ad-4 { animation-duration: 4s; animation-delay: 0.3s; }
    .ad-5 { animation-duration: 3.5s; animation-delay: 1s; }
    .ad-6 { animation-duration: 3.7s; animation-delay: 0.6s; }

    @keyframes accentFloat {
      0%, 100% { transform: translate(0, 0); }
      50% { transform: translate(3px, -6px); }
    }

    @media (prefers-reduced-motion: reduce) {
      .outer-ring, .inner-ring, .net-line, .node, .emblem-glow, .accent-dot {
        animation: none;
        opacity: 1;
        stroke-dashoffset: 0;
      }
    }
  `],
})
export class CommunityActivityComponent {
  width = input<string>('600');
  height = input<string>('300');
}
