'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { NavItem } from '@/lib/navigation';
import { setNavGroupCollapsed, useCollapsedNavGroups } from '@/lib/nav-group-preference';
import { setSidebarCollapsed, useSidebarCollapsed } from '@/lib/sidebar-preference';
import { Avatar } from '@/components/ui/Avatar';
import { Icon, LogoMark } from '@/components/ui/icons';
import { DeveloperCredit } from '@/components/DeveloperCredit';

export interface ShellUser {
  name: string | null;
  email: string;
  pictureUrl: string | null;
  subtitle: string;
  // การแจ้งเตือนในระบบที่ยังไม่อ่าน
  unreadNotifications: number;
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

// กระดิ่งการแจ้งเตือน: ลิงก์ไปหน้าการแจ้งเตือน พร้อมจำนวนที่ยังไม่อ่าน
function NotificationBell({ count, size, onNavigate }: { count: number; size: 'sm' | 'md'; onNavigate?: () => void }) {
  const label = count > 0 ? `การแจ้งเตือน (ยังไม่อ่าน ${count} รายการ)` : 'การแจ้งเตือน';
  return (
    <Link
      href="/notifications"
      onClick={onNavigate}
      aria-label={label}
      title={label}
      className={`relative inline-flex items-center justify-center rounded-lg text-stone transition hover:bg-ink/[0.04] hover:text-ink ${
        size === 'sm' ? 'size-9' : 'size-11 rounded-xl'
      }`}
    >
      <Icon name="bell" className="size-5" />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute top-0.5 right-0 inline-flex min-w-5 items-center justify-center rounded-full bg-beni px-1.5 text-[0.6875rem] leading-5 font-semibold text-white tabular-nums"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}

// ตัวเลขงานค้างบนเมนู: พื้นทึบ ตัวอักษรตัดกันชัด (compact = วางมุมไอคอนสำหรับเมนูแบบย่อ/แถบล่าง)
function NavBadge({ count, onDark, compact = false }: { count?: number; onDark: boolean; compact?: boolean }) {
  if (!count) return null;
  const tone = onDark ? 'bg-washi text-matcha-900' : 'bg-beni text-white';
  const position = compact ? 'absolute -top-1.5 -right-2.5' : '';
  return (
    <span className={`${position} ${tone} inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[0.6875rem] leading-5 font-semibold tabular-nums`}>
      {count > 99 ? '99+' : count}
      <span className="sr-only"> งานค้าง</span>
    </span>
  );
}

const GROUPS: { key: NavItem['group']; label: string; collapsible: boolean }[] = [
  { key: 'main', label: 'เมนู', collapsible: false },
  { key: 'work', label: 'งานที่รับผิดชอบ', collapsible: true },
  { key: 'admin', label: 'ผู้ดูแลระบบ', collapsible: true },
];

/**
 * รายการเมนูแบ่งกลุ่ม: กลุ่ม "งานที่รับผิดชอบ" และ "ผู้ดูแลระบบ" ย่อ/ขยายได้ (จำไว้ในเบราว์เซอร์)
 * กลุ่มที่มีหน้าที่กำลังเปิดอยู่จะขยายเสมอ, ย่ออยู่ = แสดงจำนวนงานค้างรวมที่หัวกลุ่ม
 * collapsed (sidebar แบบไอคอน) ไม่มีหัวกลุ่ม ใช้เส้นคั่นแทน
 * dense = PC (ปุ่มสูง 40px) / มือถือใช้ 44px เพื่อให้แตะง่าย
 */
function NavList({
  nav,
  active,
  collapsed,
  dense,
  onNavigate,
}: {
  nav: NavItem[];
  active: string | null;
  collapsed: boolean;
  dense: boolean;
  onNavigate?: () => void;
}) {
  const collapsedGroups = useCollapsedNavGroups();
  const visibleGroups = GROUPS.filter((group) => nav.some((item) => item.group === group.key));
  return (
    <nav aria-label="เมนูหลัก" className={`flex flex-col ${dense ? 'gap-3' : 'gap-5'}`}>
      {visibleGroups.map((group, index) => {
        const items = nav.filter((item) => item.group === group.key);
        const containsActive = items.some((item) => item.href === active);
        const open = collapsed || !group.collapsible || containsActive || !collapsedGroups.includes(group.key);
        const listId = `nav-group-${group.key}`;
        const groupBadge = items.reduce((sum, item) => sum + (item.badge ?? 0), 0);
        return (
          <div key={group.key}>
            {collapsed ? (
              index > 0 && <hr className="mx-2 mb-3 border-ink/[0.08]" />
            ) : group.collapsible ? (
              <button
                type="button"
                onClick={() => setNavGroupCollapsed(group.key, open)}
                disabled={containsActive}
                aria-expanded={open}
                aria-controls={listId}
                className="mb-1 flex min-h-8 w-full items-center gap-2 rounded-lg px-3 text-left text-xs text-stone transition hover:bg-ink/[0.04] hover:text-ink disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-stone"
              >
                <span className="flex-1">{group.label}</span>
                {!open && <NavBadge count={groupBadge} onDark={false} />}
                {!containsActive && (
                  <Icon name="chevronDown" className={`size-4 transition-transform ${open ? '' : '-rotate-90'}`} />
                )}
              </button>
            ) : (
              <p className="mb-1 flex min-h-8 items-center px-3 text-xs text-stone">{group.label}</p>
            )}
            {open && (
              <ul id={listId} className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const isActive = item.href === active;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        title={collapsed ? item.label : undefined}
                        aria-current={isActive ? 'page' : undefined}
                        className={`group flex ${dense ? 'min-h-10' : 'min-h-11'} items-center gap-3 rounded-xl px-3 text-[0.9375rem] transition ${
                          collapsed ? 'justify-center' : ''
                        } ${isActive ? 'bg-matcha-800 text-washi shadow-sm shadow-matcha-900/15' : 'text-stone hover:bg-matcha-50 hover:text-matcha-800'}`}
                      >
                        <span className="relative shrink-0">
                          <Icon name={item.icon} className="size-5" />
                          {collapsed && <NavBadge count={item.badge} onDark={isActive} compact />}
                        </span>
                        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                        {!collapsed && <NavBadge count={item.badge} onDark={isActive} />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/**
 * พื้นที่เลื่อนของรายการเมนู (หัว/ท้าย sidebar คงที่) — แสดงเส้นคั่นบน/ล่างเมื่อมีเมนูซ่อนอยู่นอกจอ
 * ใช้เส้นทึบแทนเงาโปร่งแสง เพื่อความชัดเจน
 */
function NavScroll({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setEdges({ top: el.scrollTop > 0, bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1 });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, []);
  return (
    <div
      ref={ref}
      className={`-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain border-y px-1 py-2 [scrollbar-width:thin] ${
        edges.top ? 'border-t-ink/[0.08]' : 'border-t-transparent'
      } ${edges.bottom ? 'border-b-ink/[0.08]' : 'border-b-transparent'}`}
    >
      {children}
    </div>
  );
}

function ProfileFooter({ user, collapsed, onNavigate }: { user: ShellUser; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border border-ink/[0.06] bg-cream p-2.5 ${collapsed ? 'flex-col' : ''}`}>
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
  // งานค้างของเมนูที่ไม่อยู่ในแถบล่าง (มือถือ) แสดงรวมที่ปุ่มเปิดเมนูแทน
  const hiddenBadge = nav.slice(MAX_TAB_ITEMS).reduce((sum, item) => sum + (item.badge ?? 0), 0);
  const currentLabel = nav.find((item) => item.href === active)?.label ?? (pathname.startsWith('/settings') ? 'การตั้งค่า' : '');

  return (
    <div className="min-h-dvh">
      {/* ---------- Sidebar (จอใหญ่) ---------- */}
      <aside
        className={`fixed inset-y-3 left-3 z-30 hidden flex-col gap-3 rounded-bento print:!hidden border border-ink/[0.08] bg-white p-3 transition-[width] duration-300 lg:flex ${
          collapsed ? 'w-[4.75rem]' : 'w-[16.5rem]'
        }`}
      >
        {/* หัว (คงที่) / รายการเมนู (เลื่อนได้เมื่อยาวเกินจอ) / ผู้ใช้ (คงที่) */}
        <div className={`flex shrink-0 items-center ${collapsed ? 'flex-col gap-3' : 'justify-between'} px-1 pt-1`}>
          <Brand collapsed={collapsed} />
          <div className={`flex items-center ${collapsed ? 'flex-col gap-1' : 'gap-0.5'}`}>
            <NotificationBell count={user.unreadNotifications} size="sm" />
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
        </div>
        <NavScroll>
          <NavList nav={nav} active={active} collapsed={collapsed} dense />
        </NavScroll>
        <div className="shrink-0">
          <ProfileFooter user={user} collapsed={collapsed} />
        </div>
      </aside>

      {/* ---------- แถบบน (มือถือ/แท็บเล็ต) ---------- */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-ink/[0.06] bg-washi px-4 py-2 lg:hidden print:hidden">
        <Brand collapsed={false} />
        <div className="flex items-center gap-1">
          <NotificationBell count={user.unreadNotifications} size="md" />
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={hiddenBadge > 0 ? `เปิดเมนู (มีงานค้าง ${hiddenBadge} รายการ)` : 'เปิดเมนู'}
            aria-expanded={drawerOpen}
            className="relative inline-flex size-11 items-center justify-center rounded-xl text-ink transition hover:bg-ink/[0.04]"
          >
            <Icon name="menu" />
            {hiddenBadge > 0 && (
              <span aria-hidden="true" className="absolute top-1 right-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-beni px-1.5 text-[0.6875rem] leading-5 font-semibold text-white tabular-nums">
                {hiddenBadge > 99 ? '99+' : hiddenBadge}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ---------- ลิ้นชักเมนู (มือถือ) ---------- */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="เมนู">
          <button type="button" aria-label="ปิดเมนู" onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]" />
          <div className="absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col gap-3 bg-washi p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl">
            <div className="flex shrink-0 items-center justify-between">
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
            <NavScroll>
              <NavList nav={nav} active={active} collapsed={false} dense={false} onNavigate={() => setDrawerOpen(false)} />
            </NavScroll>
            <div className="shrink-0">
              <ProfileFooter user={user} collapsed={false} onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        </div>
      )}

      {/* ---------- เนื้อหา ---------- */}
      <main
        className={`pb-safe-nav transition-[padding] duration-300 lg:pb-10 print:!p-0 ${collapsed ? 'lg:pl-[6.25rem]' : 'lg:pl-[18rem]'}`}
        aria-label={currentLabel || undefined}
      >
        <div className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6 lg:px-8 lg:pt-8 print:max-w-none print:!p-0">{children}</div>
        {/* เครดิตผู้พัฒนาท้ายทุกหน้า (ไม่พิมพ์ติดไปกับเอกสาร) */}
        <footer className="mx-auto mt-10 w-full max-w-6xl px-4 sm:px-6 lg:px-8 print:hidden">
          <div className="border-t border-ink/[0.08] pt-4 pb-2">
            <DeveloperCredit />
          </div>
        </footer>
      </main>

      {/* ---------- แถบเมนูล่าง (มือถือ) ---------- */}
      <nav
        aria-label="เมนูลัด"
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid print:!hidden auto-cols-fr grid-flow-col rounded-bento border border-ink/[0.08] bg-white p-1.5 shadow-lg shadow-ink/5 lg:hidden"
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
              <span className="relative">
                <Icon name={item.icon} className="size-5" />
                <NavBadge count={item.badge} onDark={isActive} compact />
              </span>
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
