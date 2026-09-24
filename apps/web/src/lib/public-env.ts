// ค่า env ที่ใช้ได้ทั้งฝั่ง browser และ server (ต้องขึ้นต้นด้วย NEXT_PUBLIC_ และเขียนชื่อเต็มเพื่อให้ Next ฝังค่าตอน build)
const publicApiUrl = process.env.NEXT_PUBLIC_API_URL;
if (!publicApiUrl) {
  throw new Error('ต้องกำหนด NEXT_PUBLIC_API_URL ใน apps/web/.env.local');
}

export const publicEnv = {
  apiUrl: publicApiUrl,
};
