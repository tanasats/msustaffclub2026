// ค่า env ที่ใช้ฝั่ง server เท่านั้น (ห้าม import ใน Client Component)
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`ต้องกำหนด ${name} ใน apps/web/.env.local`);
  }
  return value;
}

export const serverEnv = {
  apiUrl: requireEnv('API_URL'),
  sessionCookieName: requireEnv('SESSION_COOKIE_NAME'),
};
