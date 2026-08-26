import { ApplicationConfig, provideAppInitializer, provideZoneChangeDetection, inject } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import {
  provideMissingTranslationHandler,
  provideTranslateLoader,
  provideTranslateService,
} from '@ngx-translate/core';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { languageInterceptor } from './core/interceptors/language.interceptor';
import { JsonTranslateLoader } from './core/i18n/json-translate.loader';
import { WarnMissingTranslationHandler } from './core/i18n/missing-translation.handler';
import { FALLBACK_LANG, LanguageService, readStoredLang } from './core/services/language.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
    ),
    provideHttpClient(withInterceptors([languageInterceptor, authInterceptor, errorInterceptor])),
    provideAnimationsAsync(),
    provideTranslateService({
      lang: readStoredLang(),
      fallbackLang: FALLBACK_LANG,
      loader: provideTranslateLoader(JsonTranslateLoader),
      missingTranslationHandler: provideMissingTranslationHandler(WarnMissingTranslationHandler),
    }),
    // Loads the fallback catalog and then the active one before the app renders,
    // so `translate.instant()` is safe to call from TypeScript (ToastService,
    // option arrays, validation messages) from the very first paint.
    provideAppInitializer(() => inject(LanguageService).init()),
  ],
};
