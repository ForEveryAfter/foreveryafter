'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Settings, User, LogOut } from 'lucide-react';
import { useAuth, userInitials } from '@/lib/auth-context';
import { getNotifications, markNotificationsRead, type NotificationItem } from '@/lib/api';

const CHILD_LINKS = [
  { href: '/dashboard/child/overview', label: 'Dashboard' },
  { href: '/dashboard/learn', label: 'Learn' },
  { href: '/dashboard/child/billing', label: 'Billing' },
];

const PARENT_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/family', label: 'Family & Friends' },
  { href: '/dashboard/payments', label: 'Payments' },
  { href: '/dashboard/learn', label: 'Learn' },
];

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export type DashboardMode = 'child' | 'parent';

export function useDashboardMode() {
  const [mode, setModeState] = useState<DashboardMode>('parent');

  useEffect(() => {
    const stored = localStorage.getItem('le_active_mode') as DashboardMode | null;
    if (stored === 'child' || stored === 'parent') setModeState(stored);
  }, []);

  const setMode = (m: DashboardMode) => {
    setModeState(m);
    localStorage.setItem('le_active_mode', m);
  };

  return { mode, setMode };
}

export default function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { mode, setMode } = useDashboardMode();
  const { user, logout } = useAuth();
  const [bellOpen, setBellOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const bellRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getNotifications().then(setNotifications).catch(() => {});
  }, []);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Opening the bell marks everything read (clears the counter) and persists it.
  const openBell = () => {
    const opening = !bellOpen;
    setBellOpen(opening);
    setAvatarOpen(false);
    if (opening && unreadCount > 0) {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      markNotificationsRead().catch(() => {});
    }
  };
  const isChildMode = mode === 'child';
  const navBg = isChildMode ? 'bg-[#1E3A5F]' : 'bg-primary';
  const pillBg = isChildMode ? 'bg-[#1E3A5F]' : 'bg-primary';
  const links = isChildMode ? CHILD_LINKS : PARENT_LINKS;
  const avatar = userInitials(user) || (isChildMode ? 'ML' : 'HL');

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) setAvatarOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 text-white h-16 transition-colors duration-200 ${navBg}`}>
      <div className="max-w-7xl mx-auto h-full px-6 flex items-center justify-between">
        {/* Left: Logo + Role Switcher + Nav Links */}
        <div className="flex items-center gap-4">
          <Link href={isChildMode ? '/dashboard/child/overview' : '/dashboard'} className="flex items-center gap-2.5 shrink-0">
            {/* Logo image contains the wordmark — no adjacent text span needed.
                `brightness-0 invert` turns the whole logo pure white so it sits
                on the dark nav; the wordmark comes along for the ride. */}
            <img src="/logo.png" alt="ForEveryAfter" className="h-7 w-auto object-contain brightness-0 invert" />
          </Link>

          {/* Role Switcher Pill */}
          <div className="flex items-center bg-white/10 rounded-full p-0.5 ml-2">
            <button
              onClick={() => { setMode('child'); router.push('/dashboard/child/overview'); }}
              className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold transition-all duration-200 whitespace-nowrap ${
                isChildMode ? `${pillBg} text-white shadow-sm` : 'text-white/50 hover:text-white/80'
              }`}
            >
              My parents&apos; guides
            </button>
            <button
              onClick={() => { setMode('parent'); router.push('/dashboard'); }}
              className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold transition-all duration-200 whitespace-nowrap ${
                !isChildMode ? `${pillBg} text-white shadow-sm` : 'text-white/50 hover:text-white/80'
              }`}
            >
              My guide
            </button>
          </div>

          {/* Nav Links */}
          <div className="flex items-center gap-1 ml-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? 'bg-primary text-white'
                    : 'bg-white text-zinc-500 border border-zinc-100 hover:bg-zinc-50'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Right: Bell, Settings, Avatar */}
        <div className="flex items-center gap-3">
          {/* Bell */}
          <div ref={bellRef} className="relative">
            <button
              onClick={openBell}
              className="relative p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <Bell className="w-5 h-5 text-white/80" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-gold text-[9px] font-black text-white rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {bellOpen && (
              <div className="absolute right-0 top-12 w-80 bg-white text-navy rounded-2xl shadow-2xl border border-zinc-100 overflow-hidden z-50">
                <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">Notifications</span>
                  <span className="text-[10px] text-gold font-bold">{unreadCount} new</span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-zinc-400">No notifications yet.</div>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} className={`px-5 py-4 border-b border-zinc-50 last:border-b-0 ${!n.is_read ? 'bg-gold/5' : ''}`}>
                        <p className="text-sm text-navy leading-snug">{n.content}</p>
                        <p className="text-[10px] text-zinc-400 mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="w-px h-6 bg-white/20" />

          <Link
            href="/dashboard/settings"
            className={`text-sm font-medium transition-colors px-3 py-1.5 rounded-full ${
              pathname.startsWith('/dashboard/settings') ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            Settings
          </Link>

          <div className="w-px h-6 bg-white/20" />

          <div ref={avatarRef} className="relative">
            <button
              onClick={() => { setAvatarOpen(!avatarOpen); setBellOpen(false); }}
              className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center text-sm font-bold hover:bg-white/30 transition-colors"
            >
              {avatar}
            </button>

            {avatarOpen && (
              <div className="absolute right-0 top-12 w-56 bg-white text-navy rounded-2xl shadow-2xl border border-zinc-100 overflow-hidden z-50">
                {user && (
                  <div className="px-5 py-4 border-b border-zinc-100">
                    <p className="text-sm font-bold truncate">{user.name || user.email}</p>
                    {user.name && <p className="text-xs text-zinc-400 truncate">{user.email}</p>}
                  </div>
                )}
                <Link href="/dashboard/settings" className="flex items-center gap-3 px-5 py-4 hover:bg-zinc-50 transition-colors border-b border-zinc-50">
                  <User className="w-4 h-4 text-zinc-400" />
                  <span className="text-sm font-medium">My account</span>
                </Link>
                <Link href="/dashboard/settings" className="flex items-center gap-3 px-5 py-4 hover:bg-zinc-50 transition-colors border-b border-zinc-50">
                  <Settings className="w-4 h-4 text-zinc-400" />
                  <span className="text-sm font-medium">Settings</span>
                </Link>
                <button
                  onClick={() => logout()}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-zinc-50 transition-colors text-left"
                >
                  <LogOut className="w-4 h-4 text-zinc-400" />
                  <span className="text-sm font-medium">Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
