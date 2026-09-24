import { NextResponse, type NextRequest } from 'next/server';

// เพื่อ UX เท่านั้น: ไม่มี cookie session → ส่งไปหน้า login ทันที
// (ไม่ได้ตรวจว่า session ใช้ได้จริง การตรวจจริงและตรวจสิทธิ์อยู่ที่ API เสมอ)
const PUBLIC_PATHS = ['/login'];

export function proxy(request: NextRequest) {
  const cookieName = process.env.SESSION_COOKIE_NAME;
  const { pathname } = request.nextUrl;

  if (!cookieName || PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }
  if (!request.cookies.has(cookieName)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  // ไม่ต้องตรวจไฟล์ static และไฟล์ภายในของ Next
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)'],
};
