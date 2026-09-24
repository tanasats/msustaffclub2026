import { z } from 'zod';

// แปลงข้อความ "true"/"false" จาก env เป็น boolean (z.coerce.boolean จะถือว่า "false" เป็น true จึงไม่ใช้)
const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

// แปลงรายการคั่นด้วยจุลภาค เช่น "msu.ac.th, example.com" เป็น array (ว่าง = ไม่จำกัด)
const commaSeparatedList = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0),
  );

const requiredString = z.string().trim().min(1);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  WEB_URL: z.url(),
  CORS_ORIGIN: z.url(),
  DATABASE_URL: z.url(),

  GOOGLE_CLIENT_ID: requiredString,
  GOOGLE_CLIENT_SECRET: requiredString,
  GOOGLE_REDIRECT_URI: z.url(),
  SESSION_COOKIE_NAME: requiredString,
  SESSION_TTL_DAYS: z.coerce.number().int().positive(),
  ALLOWED_EMAIL_DOMAINS: commaSeparatedList,
  // ใช้เฉพาะ seed:super-admin ครั้งแรก จึงไม่บังคับ
  INITIAL_SUPER_ADMIN_EMAIL: z.preprocess((value) => (value === '' ? undefined : value), z.email().optional()),

  S3_ENDPOINT: z.url(),
  S3_PUBLIC_ENDPOINT: z.url(),
  S3_REGION: requiredString,
  S3_ACCESS_KEY: requiredString,
  S3_SECRET_KEY: requiredString,
  S3_BUCKET: requiredString,
  S3_FORCE_PATH_STYLE: booleanString,
});

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // แสดงเฉพาะชื่อตัวแปรและเหตุผล ห้ามแสดงค่า (อาจเป็น secret)
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`ค่า env ไม่ถูกต้องหรือขาดหาย:\n${problems}`);
  }

  const env = parsed.data;
  return {
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    port: env.PORT,
    logLevel: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
    webUrl: env.WEB_URL,
    corsOrigin: env.CORS_ORIGIN,
    databaseUrl: env.DATABASE_URL,
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_REDIRECT_URI,
      allowedEmailDomains: env.ALLOWED_EMAIL_DOMAINS,
    },
    initialSuperAdminEmail: env.INITIAL_SUPER_ADMIN_EMAIL?.toLowerCase(),
    session: {
      cookieName: env.SESSION_COOKIE_NAME,
      ttlDays: env.SESSION_TTL_DAYS,
    },
    s3: {
      endpoint: env.S3_ENDPOINT,
      publicEndpoint: env.S3_PUBLIC_ENDPOINT,
      region: env.S3_REGION,
      accessKey: env.S3_ACCESS_KEY,
      secretKey: env.S3_SECRET_KEY,
      bucket: env.S3_BUCKET,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    },
  } as const;
}

// ตรวจ env ครั้งเดียวตอนเริ่มระบบ ถ้าผิดจะ throw ทันทีและระบบไม่เริ่มทำงาน
export const config = loadConfig();
export type AppConfig = typeof config;
