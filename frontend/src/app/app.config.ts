import { ApplicationConfig, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';

/** Inline translation strings for shared UI components (dropdown).
 *  Only keys used by shared components like searchable-select need to live here.
 *  All landing-page text is handled directly in LandingComponent's TRANSLATIONS const.
 */
const DROPDOWN_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    'dropdown.search':     'Search...',
    'dropdown.no_results': 'No results found',
    'dropdown.select':     'Select...',
  },
  ta: {
    'dropdown.search':     'தேடுங்கள்...',
    'dropdown.no_results': 'முடிவுகள் இல்லை',
    'dropdown.select':     'தேர்ந்தெடுங்கள்...',
  },
};

class StaticTranslateLoader implements TranslateLoader {
  getTranslation(lang: string): Observable<Record<string, string>> {
    return of(DROPDOWN_TRANSLATIONS[lang] ?? DROPDOWN_TRANSLATIONS['en']);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    provideAnimationsAsync(),
    importProvidersFrom(
      TranslateModule.forRoot({
        loader: { provide: TranslateLoader, useClass: StaticTranslateLoader },
        defaultLanguage: 'en',
      }),
    ),
  ],
};
