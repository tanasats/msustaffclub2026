import { pool } from '../db/pool.js';

// ตรวจว่าเชื่อมต่อฐานข้อมูลได้ ด้วย query ที่เบาที่สุด (ไม่แตะตารางใด)
export async function pingDatabase(): Promise<void> {
  await pool.query('SELECT 1');
}
