export interface PasswordStrength {
  minLength: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  special: boolean;
  score: number;
}

export function computePasswordStrength(password: string): PasswordStrength {
  const criteria = {
    minLength: password.length >= 8,
    // Tamil is unicameral (no case distinction) — a Tamil letter satisfies
    // both the uppercase and lowercase checks on its own.
    uppercase: /[A-Z஀-௿]/.test(password),
    lowercase: /[a-z஀-௿]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9஀-௿]/.test(password),
  };
  return {
    ...criteria,
    score: Object.values(criteria).filter(Boolean).length,
  };
}
