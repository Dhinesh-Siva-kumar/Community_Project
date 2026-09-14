import { Injectable } from '@angular/core';
import { GeoCountry } from '../models';

const STORAGE_KEY = 'tamilya_selected_country_id';

/**
 * Guest-only persistence for the homepage country selector. A registered
 * user's country comes from their profile (`authService.currentUser()`),
 * not from here — this is purely a "remember what a logged-out visitor
 * picked last time" cache.
 */
@Injectable({ providedIn: 'root' })
export class CountryPreferenceService {
  getSelected(): number | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    const id = raw ? Number(raw) : NaN;
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  setSelected(countryId: number): void {
    localStorage.setItem(STORAGE_KEY, String(countryId));
  }

  clearSelected(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * No IP/locale-based guess here (no such service exists in this codebase)
   * — deliberately returns null rather than silently assuming one country,
   * so the UI can show an explicit "select your country" prompt instead.
   */
  getDefault(_countries: GeoCountry[]): number | null {
    return this.getSelected();
  }
}
