import { config } from '../config/index.js';
import { createMailTransport } from './transport.js';

// ตัวส่งอีเมลตัวเดียวของแอป (ตาม MAIL_TRANSPORT) ใช้ร่วมกันระหว่าง worker และปุ่มส่งอีเมลทดสอบ
export const mailTransport = createMailTransport(config.mail);
