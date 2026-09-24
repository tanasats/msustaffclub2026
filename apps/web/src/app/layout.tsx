import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ระบบจัดการชมรมกีฬาบุคลากร มหาวิทยาลัยมหาสารคาม',
  description: 'ระบบบริหารจัดการชมรมกีฬาบุคลากร มหาวิทยาลัยมหาสารคาม',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
