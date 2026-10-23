'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { RummyAddaLogo } from '@/components/RummyAddaLogo';

export default function LandingEntryPage() {
  const router = useRouter();
  const { user } = useAuth();

  const apkDownloadUrl =
    'https://github.com/patelsakshi6393-gif/rummy-adda/releases/download/apk/DOC-20261014-WA0003.apk';

  const handlePlayNow = (e: React.MouseEvent) => {
    e.preventDefault();
    if (user) {
      router.push('/lobby');
    } else {
      router.push('/login');
    }
  };

  return (
    <main className="min-h-[100dvh] w-full bg-[#121829] flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden select-none">
      {/* Background radial atmosphere */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#18213a_0%,_#121829_65%,_#0c101c_100%)] pointer-events-none" />

      {/* Main Content Container matching reference design */}
      <div className="relative z-10 w-full max-w-[360px] sm:max-w-[400px] flex flex-col items-center justify-center my-auto">
        {/* Brand Emblem / Logo */}
        <div className="w-full flex justify-center mb-10 sm:mb-14">
          <RummyAddaLogo size={240} className="sm:scale-110 transition-transform" />
        </div>

        {/* Action Buttons */}
        <div className="w-full flex flex-col gap-4 sm:gap-4.5">
          {/* Button 1: Android App (Triggers APK Download) */}
          <a
            href={apkDownloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            download="DOC-20261014-WA0003.apk"
            className="w-full py-4 sm:py-4.5 px-6 rounded-2xl bg-[#e1a800] hover:bg-[#f0b400] active:scale-[0.98] text-[#0a0c10] font-black text-xl sm:text-2xl text-center shadow-lg shadow-black/40 hover:shadow-amber-500/10 transition-all cursor-pointer flex items-center justify-center tracking-wide"
          >
            Android App
          </a>

          {/* Button 2: Play Now (Opens Login Screen) */}
          <Link
            href={user ? '/lobby' : '/login'}
            onClick={handlePlayNow}
            className="w-full py-4 sm:py-4.5 px-6 rounded-2xl bg-[#e1a800] hover:bg-[#f0b400] active:scale-[0.98] text-[#0a0c10] font-black text-xl sm:text-2xl text-center shadow-lg shadow-black/40 hover:shadow-amber-500/10 transition-all cursor-pointer flex items-center justify-center tracking-wide"
          >
            Play Now
          </Link>
        </div>
      </div>
    </main>
  );
}
