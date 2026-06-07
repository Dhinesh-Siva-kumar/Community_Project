import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap, catchError, of, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User, AuthResponse, UserRegister } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  currentUser = signal<User | null>(null);
  isAuthenticated = signal<boolean>(false);

  private authState$ = new BehaviorSubject<User | null>(null);
  authStateChanges$ = this.authState$.asObservable();

  private readonly ACCESS_TOKEN_KEY = 'accessToken';
  private readonly REFRESH_TOKEN_KEY = 'refreshToken';

  constructor() {
    this.loadStoredAuth();
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/auth/login`, { identifier: email, password }).pipe(
      tap((response) => this.handleAuthResponse(response))
    );
  }

  register(userData: UserRegister): Observable<AuthResponse> {
  return this.http.post<AuthResponse>(`${this.baseUrl}/auth/register`, userData).pipe(
    tap((response) => this.handleAuthResponse(response))
  );
  }

  // NOTE: No backend routes exist for the methods below — commented out until backend is implemented

  getCountries() {
    return this.http.get<any>(`${this.baseUrl}/master-data/countries`);
  }

  getInterests() {
    return this.http.get<any>(`${this.baseUrl}/master-data/interests`);
  }

  checkUsername(username: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/auth/check-username/${username}`);
  }

  sendOtp(data: { mobile: string }): Observable<any> {
    return this.http.post(`${this.baseUrl}/send-otp`, data);
  }

  verifyOtp(data: { mobile: string; otp: string }): Observable<any> {
    return this.http.post(`${this.baseUrl}/verify-otp`, data);
  }

  adminLogin(identifier: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/auth/admin/login`, { identifier, password }).pipe(
      tap((response) => this.handleAuthResponse(response))
    );
  }

  lookupUser(q: string): Observable<{ found: boolean; dialCode?: string; countryName?: string }> {
    return this.http.get<{ found: boolean; dialCode?: string; countryName?: string }>(
      `${this.baseUrl}/auth/lookup-user`, { params: { q } }
    );
  }

  forgotPasswordSendOTP(data: { usernameOrEmail: string; phoneNumber: string }): Observable<{ message: string; devOtp?: string }> {
    return this.http.post<{ message: string; devOtp?: string }>(`${this.baseUrl}/auth/forgot-password/send-otp`, data);
  }

  verifyResetOtp(data: { usernameOrEmail: string; phoneNumber: string; otp: string; newPassword: string }): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/auth/reset-password/verify`, data);
  }

  googleInitiate(data: { credential: string; countryId?: number; allowExistingLogin?: boolean }): Observable<any> {
    const { credential, countryId, allowExistingLogin = true } = data;
    return this.http.post<any>(`${this.baseUrl}/auth/google/initiate`, {
      credential,
      ...(countryId != null ? { country_id: countryId } : {}),
    }).pipe(
      tap((response: any) => {
        if (!response.needsUsername && response.accessToken) {
          // When allowExistingLogin is false (register page), skip storing tokens
          // for an account that already exists — the component will show an error
          // and redirect to /auth/login without authenticating the session.
          const isExistingAccount = response.isNewUser === false;
          if (!isExistingAccount || allowExistingLogin) {
            this.handleAuthResponse(response as AuthResponse);
          }
        }
      })
    );
  }

  googleComplete(data: { credential: string; username: string; countryId?: number }): Observable<any> {
    const { credential, username, countryId } = data;
    return this.http.post<any>(`${this.baseUrl}/auth/google/complete`, {
      credential,
      username,
      ...(countryId != null ? { country_id: countryId } : {}),
    }).pipe(
      tap((response) => this.handleAuthResponse(response))
    );
  }

  logout(): void {
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    this.currentUser.set(null);
    this.isAuthenticated.set(false);
    this.authState$.next(null);
  }

  refreshToken(): Observable<AuthResponse> {
    const refreshToken = localStorage.getItem(this.REFRESH_TOKEN_KEY);
    return this.http.post<AuthResponse>(`${this.baseUrl}/auth/refresh`, { refreshToken }).pipe(
      tap((response) => this.handleAuthResponse(response)),
      catchError((error) => {
        this.logout();
        throw error;
      })
    );
  }

  getCurrentUser(): Observable<User> {
    return this.http.get<User>(`${this.baseUrl}/auth/me`).pipe(
      tap((user) => {
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
        this.authState$.next(user);
      })
    );
  }

  getAccessToken(): string | null {
    return localStorage.getItem(this.ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  isLoggedIn(): boolean {
    return !!this.getAccessToken();
  }

  private handleAuthResponse(response: AuthResponse): void {
    localStorage.setItem(this.ACCESS_TOKEN_KEY, response.accessToken);
    localStorage.setItem(this.REFRESH_TOKEN_KEY, response.refreshToken);
    localStorage.setItem('auth_user', JSON.stringify(response.user));
    this.currentUser.set(response.user);
    this.isAuthenticated.set(true);
    this.authState$.next(response.user);
  }

  private loadStoredAuth(): void {
    if (typeof window === 'undefined') return;

    const token = localStorage.getItem(this.ACCESS_TOKEN_KEY);
    const storedUser = localStorage.getItem('auth_user');

    if (!token) return;

    // Immediately restore from localStorage so UI never sees an empty currentUser on refresh
    if (storedUser) {
      try {
        const user: User = JSON.parse(storedUser);
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
        this.authState$.next(user);
      } catch {
        // corrupted stored data — clear it
        localStorage.removeItem('auth_user');
      }
    }

    // Validate token with server in background and refresh the user data
    // this.getCurrentUser().pipe( // need to uncommand once user api is ready
    //   catchError(() => {
    //     this.logout();
    //     return of(null);
    //   })
    // ).subscribe();
  }
}
