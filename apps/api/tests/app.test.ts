import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config/index.js';

const app = createApp();

describe('GET /health', () => {
  it('คืน 200 เมื่อเชื่อมต่อฐานข้อมูลได้', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'ok' });
  });
});

describe('error format', () => {
  it('เส้นทางที่ไม่มีอยู่คืน 404 ในรูปแบบ error มาตรฐาน', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } });
  });

  it('JSON ผิดรูปแบบคืน 400 โดยไม่เปิดเผยรายละเอียดภายใน', async () => {
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: 'BAD_REQUEST', message: expect.any(String) } });
    expect(JSON.stringify(res.body)).not.toContain('stack');
  });
});

describe('CORS', () => {
  it('อนุญาต origin ของ web พร้อม credentials', async () => {
    const res = await request(app).get('/health').set('Origin', config.corsOrigin);
    expect(res.headers['access-control-allow-origin']).toBe(config.corsOrigin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('ไม่ส่ง header CORS ให้ origin อื่น', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example.com');
  });
});
