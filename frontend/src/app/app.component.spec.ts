import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';

import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        // AppComponent injects AuthService, which needs HttpClient.
        provideHttpClient(),
        provideHttpClientTesting(),
        // Components render text through `| translate`, so the translate
        // service has to be present. No loader is configured: with an empty
        // catalog every key resolves to itself, which is all a smoke test
        // needs and keeps the spec free of network stubbing.
        provideTranslateService(),
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
