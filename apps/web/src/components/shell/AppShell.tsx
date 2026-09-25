'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { NavItem } from '@/lib/navigation';
import { setSidebarCollapsed, useSidebarCollapsed } from '@/lib/sidebar-preference';
import { Avatar } from '@/components/ui/Avatar';
import { Icon, LogoMark } from '@/components/ui/icons';

export interface ShellUser {
  name: string | null;
  email: string;
  pictureUrl: string | null;
  subtitle: string;
}

interface AppShellProps {
  user: ShellUser;
  nav: NavItem[];
  children: React.ReactNode;
}

const MAX_TAB_ITEMS = 3;

// เมนูที่ path ตรงที่สุด (ยาวที่สุด) ถือว่ากำลังเปิดอยู่
function activeHref(pathname: string, nav: NavItem[]): string | null {
  const matches = nav.filter((item) => (item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`)));
  return matches.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link href="/" className="flex min-h-11 items-center gap-3 rounded-xl" aria-label="หน้าหลัก ระบบบริหารจัดการชมรมบุคลากร">
      <LogoMark className="size-10 shrink-0" />
      {!collapsed && (
        <span className="leading-tight">
          <span className="block font-serif text-[0.9375rem] font-medium text-ink">ชมรมบุคลากร</span>
          <span className="block text-[0.6875rem] tracking-[0.16em] text-stone">MSU · CLUB</span>
        </span>
      )}
    </Link>
  );
}

function NavList({ nav, active, collapsed, onNavigate }: { nav: NavItem[]; active: string | null; collapsed: boolean; onNavigate?: () => void }) {
  const groups: { key: NavItem['group']; label: string }[] = [
    { key: 'main', label: 'เมนู' },
    { key: 'admin', label: 'ผู้ดูแลระบบ' },
  ];
  return (
    <nav aria-label="เมนูหลัก" className="flex flex-col gap-6">
      {groups.map((group) => {
        const items = nav.filter((item) => item.group === group.key);
        if (items.length === 0) return null;
        return (
          <div key={group.key}>
            {!collapsed && <p className="mb-2 px-3 text-xs text-mist">{group.label}</p>}
            <ul className="flex flex-col gap-1">
              {items.map((item) => {
                const isActive = item.href === active;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      aria-current={isActive ? 'page' : undefined}
                      className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.9375rem] transition ${
                        collapsed ? 'justify-center' : ''
                      } ${isActive ? 'bg-matcha-800 text-washi shadow-sm shadow-matcha-900/15' : 'text-stone hover:bg-matcha-50 hover:text-matcha-800'}`}
                    >
                      <Icon name={item.icon} className="size-5 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function ProfileFooter({ user, collapsed, onNavigate }: { user: ShellUser; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border border-ink/[0.06] bg-cream/60 p-2.5 ${collapsed ? 'flex-col' : ''}`}>
      <Avatar name={user.name} email={user.email} pictureUrl={user.pictureUrl} size="sm" />
      {!collapsed && (
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium text-ink">{user.name ?? user.email}</p>
          <p className="truncate text-xs text-stone">{user.subtitle}</p>
        </div>
      )}
      <Link
        href="/settings"
        onClick={onNavigate}
        aria-label="การตั้งค่า"
        title="การตั้งค่า"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-stone transition hover:bg-white hover:text-matcha-800"
      >
        <Icon name="settings" />
      </Link>
    </div>
  );
}

export function AppShell({ user, nav, children }: AppShellProps) {
  const pathname = usePathname();
  const active = activeHref(pathname, nav);
  const collapsed = useSidebarCollapsed();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ปิดลิ้นชักด้วยปุ่ม Esc และล็อกการเลื่อนหน้าขณะเปิด
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const tabItems = nav.slice(0, MAX_TAB_ITEMS);
  const currentLabel = nav.find((item) => item.href === active)?.label ?? (pathname.startsWith('/settings') ? 'การตั้งค่า' : '');

  return (
    <div className="min-h-dvh">
      {/* ---------- Sidebar (จอใหญ่) ---------- */}
      <aside
        className={`fixed inset-y-3 left-3 z-30 hidden flex-col justify-between rounded-bento border border-ink/[0.08] bg-white/70 p-3 backdrop-blur-md transition-[width] duration-300 lg:flex ${
          collapsed ? 'w-[4.75rem]' : 'w-[16.5rem]'
        }`}
      >
        <div className="flex flex-col gap-8">
          <div className={`flex items-center ${collapsed ? 'flex-col gap-3' : 'justify-between'} px-1 pt-1`}>
            <Brand collapsed={collapsed} />
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!collapsed)}
              aria-label={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
              title={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
              className="inline-flex size-9 items-center justify-center rounded-lg text-mist transition hover:bg-ink/[0.04] hover:text-ink"
            >
              <Icon name={collapsed ? 'expand' : 'collapse'} className="size-[1.125rem]" />
            </button>
          </div>
          <NavList nav={nav} active={active} collapsed={collapsed} />
        </div>
        <ProfileFooter user={user} collapsed={collapsed} />
      </aside>

      {/* ---------- แถบบน (มือถือ/แท็บเล็ต) ---------- */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-ink/[0.06] bg-washi/85 px-4 py-2 backdrop-blur-md lg:hidden">
        <Brand collapsed={false} />
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="เปิดเมนู"
          aria-expanded={drawerOpen}
          className="inline-flex size-11 items-center justify-center rounded-xl text-ink transition hover:bg-ink/[0.04]"
        >
          <Icon name="menu" />
        </button>
      </header>

      {/* ---------- ลิ้นชักเมนู (มือถือ) ---------- */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="เมนู">
          <button type="button" aria-label="ปิดเมนู" onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]" />
          <div className="absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col justify-between bg-washi p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl">
            <div className="flex flex-col gap-8">
              <div className="flex items-center justify-between">
                <Brand collapsed={false} />
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="ปิดเมนู"
                  className="inline-flex size-11 items-center justify-center rounded-xl text-stone hover:bg-ink/[0.04]"
                >
                  <Icon name="close" />
                </button>
              </div>
              <NavList nav={nav} active={active} collapsed={false} onNavigate={() => setDrawerOpen(false)} />
            </div>
            <ProfileFooter user={user} collapsed={false} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* ---------- เนื้อหา ---------- */}
      <main
        className={`pb-safe-nav transition-[padding] duration-300 lg:pb-10 ${collapsed ? 'lg:pl-[6.25rem]' : 'lg:pl-[18rem]'}`}
        aria-label={currentLabel || undefined}
      >
        <div className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6 lg:px-8 lg:pt-8">{children}</div>
      </main>

      {/* ---------- แถบเมนูล่าง (มือถือ) ---------- */}
      <nav
        aria-label="เมนูลัด"
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid auto-cols-fr grid-flow-col rounded-bento border border-ink/[0.08] bg-white/85 p-1.5 shadow-lg shadow-ink/5 backdrop-blur-md lg:hidden"
      >
        {tabItems.map((item) => {
          const isActive = item.href === active;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[0.6875rem] transition ${
                isActive ? 'bg-matcha-800 text-washi' : 'text-stone'
              }`}
            >
              <Icon name={item.icon} className="size-5" />
              {item.shortLabel}
            </Link>
          );
        })}
        <Link
          href="/settings"
          aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
          className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[0.6875rem] transition ${
            pathname.startsWith('/settings') ? 'bg-matcha-800 text-washi' : 'text-stone'
          }`}
        >
          <Icon name="settings" className="size-5" />
          ตั้งค่า
        </Link>
      </nav>
    </div>
  );
}
