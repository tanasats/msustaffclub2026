import http from 'node:http';
import type { AddressInfo } from 'node:net';
import supertest from 'supertest';

/**
 * ใช้แทน supertest(app) ในทุก test
 *
 * ปัญหาของ supertest(app): เปิด server ที่ '::' (dual-stack) แต่ส่ง request ไปที่ 127.0.0.1
 * ถ้าโปรแกรมอื่นในเครื่องฟังเฉพาะ 127.0.0.1 บน port เดียวกัน (เช่น VS Code, DBeaver) request จะไปถึงโปรแกรมนั้นแทน
 * ทำให้ test ล้มแบบสุ่ม (ได้ 401 แปลก ๆ, body ผิด, หรือค้างจน timeout)
 *
 * วิธีแก้: เปิด server แบบ IPv6 อย่างเดียว (ipv6Only) แล้วส่ง request ไปที่ [::1]
 * listen แบบไม่ระบุ host จะได้ port ทันที (ไม่ต้องรอ DNS lookup) จึงคืน supertest แบบ synchronous ได้เหมือนเดิม
 */
const servers = new Set<http.Server>();

export function request(app: http.RequestListener) {
  const server = http.createServer(app);
  server.listen({ port: 0, ipv6Only: true });
  servers.add(server);
  const { port } = server.address() as AddressInfo;
  return supertest(`http://[::1]:${port}`);
}

// ปิด server ทั้งหมดที่เปิดในไฟล์ test นี้ (เรียกจาก afterAll ใน setup-env)
export async function closeTestServers(): Promise<void> {
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
  servers.clear();
}
