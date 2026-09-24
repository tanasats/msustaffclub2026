import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import { loadTestDatabaseUrl } from './helpers/test-env.js';

// รันครั้งเดียวก่อน test ทั้งหมด: ทำให้ schema ของ app_test เป็นปัจจุบันตาม migration
export default async function setup(): Promise<void> {
  await runner({
    databaseUrl: loadTestDatabaseUrl(),
    dir: fileURLToPath(new URL('../migrations', import.meta.url)),
    direction: 'up',
    migrationsTable: 'pgmigrations',
    count: Infinity,
    log: () => {},
  });
}
