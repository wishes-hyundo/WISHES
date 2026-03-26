import Link from 'next/link';
import { MapPin, Mail, Clock, MapIcon, BookOpen, Instagram } from 'lucide-react';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#0c1220] text-white">
      <div className="max-w-7xl mx-auto px-4 pt-16 pb-8">
        {/* 메인 그리드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-12 mb-12">
          {/* 브랜드 정보 */}
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-wishes-secondary to-wishes-accent flex items-center justify-center">
                <MapPin className="w-5 h-5 text-white" />
              </div>
              <p className="text-base font-bold tracking-wide">WISHES</p>
            </div>
