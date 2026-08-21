import { HttpContextToken } from '@angular/common/http';

// Marks a request as a silent/background auth check (e.g. session revalidation on
// app boot). A 401 on these requests should clear the stale session but must not
// force-navigate the user away from whatever public page they're currently on.
export const SKIP_AUTH_REDIRECT = new HttpContextToken<boolean>(() => false);
