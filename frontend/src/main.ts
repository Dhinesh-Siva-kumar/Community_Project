import { registerLocaleData } from '@angular/common';
import localeTa from '@angular/common/locales/ta';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// Required before LocalizedDatePipe / LocalizedNumberPipe can format with 'ta'.
registerLocaleData(localeTa, 'ta');

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
