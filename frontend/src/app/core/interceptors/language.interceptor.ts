import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { LanguageService } from '../services/language.service';

/**
 * Tags every API call with the active language.
 *
 * The backend has no stored language preference, so this header is how it
 * knows which language to compose outbound text in — OTP emails in
 * particular, which are triggered by a request but delivered outside the app.
 * See `parseAcceptLanguage` in backend `services/request-context.ts`.
 */
export const languageInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.clone({ setHeaders: { 'Accept-Language': inject(LanguageService).currentLang() } }));
