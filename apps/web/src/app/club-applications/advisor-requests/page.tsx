import { redirect } from 'next/navigation';

// ย้ายไปรวมที่กล่องงานที่ปรึกษา /advisor (คงเส้นทางเดิมไว้สำหรับลิงก์ที่เคยส่งต่อกัน)
export default function AdvisorRequestsPage() {
  redirect('/advisor');
}
