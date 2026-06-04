import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // OTP
  OTP_TOKEN_SECRET: z.string().min(32),
  OTP_TOKEN_EXPIRES_IN: z.string().default('10m'),
  OTP_EXPIRES_MINUTES: z.coerce.number().default(5),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),

  // CORS / URLs
  CORS_ORIGIN: z.string().default('http://localhost:4200'),
  APP_URL: z.string().default('http://localhost:3000'),
  FRONTEND_URL: z.string().default('http://localhost:4200'),

  // File uploads
  UPLOADS_PATH: z.string().default('uploads'),

  // Email (optional)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  ADMIN_EMAIL: z.string().optional(),

  // Twilio (optional)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),

  // OpenAI (optional)
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
});

let env: z.infer<typeof envSchema>;

try {
  env = envSchema.parse(process.env);
} catch (err) {
  if (err instanceof z.ZodError) {
    console.error('[Config] Environment validation failed:');
    for (const issue of err.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
  } else {
    console.error('[Config] Unknown error during env validation:', err);
  }
  process.exit(1);
}

export { env };
