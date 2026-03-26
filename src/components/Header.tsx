'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Menu, X, MapPin, User, LogOut, Heart, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const navItems = [
  { label: '매물검색', href: '/listings' },
  { label: '지도검색', href: '/map' },
  { label: '대출계산기', href: '/calculator' },
  { label: '회사소개', href: '/about' },
  { label: '상담문의', href: '/contact' },
];

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { user, loading, signOut, setShowAuthModal } = useAuth();

  // 사용자 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getUserDisplayName = () => {
    if (!user) return '';
    return user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || '회원';
  };

  const getUserAvatar = () => {
    return user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
  };

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 glass border-b border-gray-100/50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* 로고 */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-wishes-secondary to-wishes-accent flex items-center justify-center text-white shadow-lg group-hover:shadow-xl transition-shadow">
              <MapPin className="w-5 h-5" />
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-bold text-wishes-primary leading-none">WISHES</p>
            </div>
            <div className="sm:hidden">
              <p className="text-base font-bold text-wishes-primary">WISHES</p>
            </div>
          </Link>
