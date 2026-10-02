import { logger } from '../logger.js';

/**
 * งานตามรอบใน process ของ API: ทำทุก intervalMs ไม่ซ้อนรอบ (รอบก่อนยังไม่จบ = ข้าม)
 * คืนฟังก์ชัน stop ที่รอรอบปัจจุบันจบก่อน (ใช้ตอน graceful shutdown ก่อนปิด pool)
 * error ของรอบใดรอบหนึ่ง log แล้วทำรอบถัดไปตามปกติ
 */
export function startPeriodicJob(name: string, run: () => Promise<number>, intervalMs: number): () => Promise<void> {
  let running: Promise<void> | null = null;
  const tick = () => {
    if (running) return;
    running = run()
      .then((count) => {
        if (count > 0) logger.info({ job: name, count }, 'job: ทำงานตามรอบ');
      })
      .catch((err: unknown) => logger.error({ err, job: name }, 'job: ผิดพลาด'))
      .finally(() => {
        running = null;
      });
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
  return async () => {
    clearInterval(timer);
    await running;
  };
}
