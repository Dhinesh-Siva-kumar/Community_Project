/**
 * Bootstrap Icons class (without the shared `bi` prefix) for each community
 * category (`interest_master.interest_name`). Keep in sync with the seeded
 * category list in `backend/seeds/01_seed.ts`.
 */
const CATEGORY_ICONS: Record<string, string> = {
  'Art & Culture': 'bi-palette-fill',
  'Business & Entrepreneurship': 'bi-graph-up-arrow',
  'Community Development': 'bi-people-fill',
  'Education & Learning': 'bi-mortarboard-fill',
  'Emergency & Safety': 'bi-exclamation-triangle-fill',
  'Environment & Sustainability': 'bi-tree-fill',
  'Events & Entertainment': 'bi-calendar-event-fill',
  'Family & Parenting': 'bi-house-heart-fill',
  'Finance & Investment': 'bi-cash-coin',
  'Food & Dining': 'bi-cup-hot-fill',
  'Health & Wellness': 'bi-heart-pulse-fill',
  'Housing & Real Estate': 'bi-building-fill',
  'Immigration & Visa': 'bi-passport-fill',
  'Items & Exchange': 'bi-arrow-left-right',
  'Jobs & Careers': 'bi-briefcase-fill',
  'Language & Communication': 'bi-chat-dots-fill',
  'Legal & Rights': 'bi-bank',
  'Mental Health & Support': 'bi-emoji-smile-fill',
  'Networking': 'bi-diagram-3-fill',
  'Politics & Governance': 'bi-flag-fill',
  'Religion & Spirituality': 'bi-moon-stars-fill',
  'Sports & Fitness': 'bi-trophy-fill',
  'Technology & Innovation': 'bi-cpu-fill',
  'Transportation': 'bi-truck',
  'Travel & Tourism': 'bi-airplane-fill',
  'Volunteering & Social Work': 'bi-person-hearts',
  'Women & Gender': 'bi-gender-ambiguous',
  'Youth & Students': 'bi-backpack-fill',
};

const DEFAULT_CATEGORY_ICON = 'bi-tag-fill';

/** Looks up the Bootstrap Icons class for a category name, falling back to a generic tag icon. */
export function getCategoryIcon(categoryName?: string | null): string {
  if (!categoryName) return DEFAULT_CATEGORY_ICON;
  return CATEGORY_ICONS[categoryName] ?? DEFAULT_CATEGORY_ICON;
}
