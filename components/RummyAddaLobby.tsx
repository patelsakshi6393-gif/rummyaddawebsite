'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  Wallet,
  Coins,
  ChevronDown,
  Headphones,
  Trophy,
  User,
  Users,
  Minus,
  Plus,
  Play,
  Sparkles,
  Loader2,
  Megaphone,
  Gamepad2,
  Layers,
  ArrowDownToLine,
  Menu as MenuIcon,
  X,
  CreditCard,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  LogOut,
  Share2,
  History,
  Settings,
  ExternalLink,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { GameMode, getPlayableBalance, getWithdrawableBalance } from '@/lib/types';
import {
  STAKE_OPTIONS,
  StakeOption,
  findMatch,
  createPracticeMatch,
} from '@/lib/game-service';
import { HowToPlayModal } from '@/components/HowToPlayModal';

export function RummyAddaLobby() {
  const router = useRouter();
  const { user, profile, wallet, logout } = useAuth();

  // Mode Selection: CASH, TOURNAMENTS, PRACTICE
  const [modeTab, setModeTab] = useState<'CASH' | 'TOURNAMENTS' | 'PRACTICE'>('CASH');

  // Format Selection: POINT, POOL, DEAL
  const [format, setFormat] = useState<GameMode>('points');

  // Player count selection: 2 or 6
  const [playerCount, setPlayerCount] = useState<2 | 6>(2);

  // Selected stake index within the format's STAKE_OPTIONS
  const currentStakes = useMemo(() => {
    return STAKE_OPTIONS[format] || STAKE_OPTIONS.points;
  }, [format]);

  const [stakeIndex, setStakeIndex] = useState<number>(0);
  const [isLoadingMatch, setIsLoadingMatch] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals & Drawers
  const [showWalletDropdown, setShowWalletDropdown] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showMenuDrawer, setShowMenuDrawer] = useState(false);
  const [showAllStakesModal, setShowAllStakesModal] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  // Safe bounds check on stakeIndex
  const currentStake: StakeOption = currentStakes[stakeIndex] || currentStakes[0] || {
    entryFee: 20,
    pointValue: 0.25,
    name: 'Micro Stakes',
  };

  const playableBalance = getPlayableBalance(wallet);
  const withdrawableBalance = getWithdrawableBalance(wallet);
  const redeemPoints = wallet?.rewardPoints !== undefined ? wallet.rewardPoints : (wallet?.bonusBalance !== undefined ? wallet.bonusBalance : 134.05);

  // Adjust stakeIndex when format changes
  useEffect(() => {
    if (stakeIndex >= currentStakes.length) {
      setStakeIndex(0);
    }
  }, [currentStakes, stakeIndex]);

  // Handlers for Entry Fee Min, Max, Minus, Plus
  const handleMin = () => {
    setStakeIndex(0);
  };

  const handleMax = () => {
    setStakeIndex(currentStakes.length - 1);
  };

  const handleMinus = () => {
    setStakeIndex((prev) => Math.max(0, prev - 1));
  };

  const handlePlus = () => {
    setStakeIndex((prev) => Math.min(currentStakes.length - 1, prev + 1));
  };

  // Play Now Action
  const handlePlayNow = async () => {
    if (!profile) {
      router.push('/login');
      return;
    }
    setErrorMessage(null);

    // PRACTICE MODE: Launch practice match against AI bot
    if (modeTab === 'PRACTICE') {
      setIsLoadingMatch(true);
      try {
        const gameId = await createPracticeMatch(profile, format, playerCount);
        router.push(`/game/${gameId}`);
      } catch (err) {
        console.error('Error starting practice match:', err);
        setErrorMessage('Failed to start practice table. Please try again.');
        setIsLoadingMatch(false);
      }
      return;
    }

    // TOURNAMENTS MODE: Redirect to Tournaments
    if (modeTab === 'TOURNAMENTS') {
      router.push('/tournaments');
      return;
    }

    // CASH MODE: Check playable balance
    if (playableBalance < currentStake.entryFee) {
      setErrorMessage(
        `Insufficient balance (₹${playableBalance.toFixed(2)}). Entry fee is ₹${currentStake.entryFee}. Please deposit cash to proceed.`
      );
      return;
    }

    setIsLoadingMatch(true);
    try {
      const gameId = await findMatch(
        format,
        currentStake.entryFee,
        currentStake.pointValue,
        profile,
        playerCount
      );
      router.push(`/game/${gameId}`);
    } catch (err: unknown) {
      console.error('Find match error:', err);
      const msg = err instanceof Error ? err.message : 'Error finding match. Please try again.';
      setErrorMessage(msg);
      setIsLoadingMatch(false);
    }
  };

  // WhatsApp Support redirect
  const handleOpenSupport = () => {
    setShowContactModal(true);
  };

  return (
    <div className="min-h-screen bg-[#1a0205] text-white flex flex-col justify-between select-none pb-24 font-sans antialiased">
      {/* =========================================================================
          1. TOP GOLDEN HEADER
          ========================================================================= */}
      <header className="relative bg-gradient-to-b from-[#e3a830] via-[#c98e21] to-[#b37814] text-slate-950 shadow-xl rounded-b-[28px] px-4 pt-3 pb-3 z-30 border-b border-amber-600/40">
        {/* Top Row: User Avatar, Name, Rank, and Contact Us Button */}
        <div className="flex items-center justify-between gap-3">
          {/* User profile & level */}
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12 rounded-full border-2 border-white/90 overflow-hidden shadow-md bg-[#2b080d] flex items-center justify-center shrink-0">
              {profile?.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.photoURL}
                  alt={profile.displayName || 'Player'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-tr from-[#991b1b] to-[#f59e0b] flex items-center justify-center text-white font-black text-lg">
                  {(profile?.displayName || 'P').charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="flex flex-col">
              <span className="text-base font-black tracking-tight text-slate-950 leading-tight truncate max-w-[140px] sm:max-w-[200px]">
                {profile?.displayName || profile?.playerId || 'Aaaaaaa'}
              </span>
              <div className="flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-900/90 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-950" />
                <span>BEGINNER</span>
              </div>
            </div>
          </div>

          {/* Contact Us Button (Deep red pill button matching screenshot) */}
          <button
            onClick={handleOpenSupport}
            type="button"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#870814] hover:bg-[#a10b1d] active:scale-95 text-white font-extrabold text-xs shadow-md shadow-red-950/40 transition-transform cursor-pointer"
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>Contact Us</span>
          </button>
        </div>

        {/* Divider */}
        <div className="my-2.5 border-t border-slate-950/15" />

        {/* Bottom Row: Wallet Balance & Redeem Points */}
        <div className="flex items-center justify-between text-xs">
          {/* Wallet Balance (with dropdown chevron) */}
          <div
            onClick={() => setShowWalletDropdown((v) => !v)}
            className="flex items-center gap-2 cursor-pointer py-1 px-2 rounded-xl hover:bg-black/5 transition-colors"
          >
            <div className="w-7 h-7 rounded-lg bg-slate-950 flex items-center justify-center text-amber-400 shadow">
              <Wallet className="w-4 h-4 fill-amber-400 text-amber-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-800 leading-none">
                Wallet Balance
              </span>
              <div className="flex items-center gap-1 font-black text-sm text-[#8f0b16] leading-tight">
                <span>{playableBalance.toFixed(2)}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-800 transition-transform ${showWalletDropdown ? 'rotate-180' : ''}`} />
              </div>
            </div>
          </div>

          {/* Redeem Points */}
          <div className="flex items-center gap-2 py-1 px-2">
            <div className="w-7 h-7 rounded-lg bg-slate-950 flex items-center justify-center text-amber-300 shadow">
              <Coins className="w-4 h-4 text-amber-300" />
            </div>
            <div className="flex flex-col text-right">
              <span className="text-[10px] font-bold text-slate-800 leading-none">
                Redeem Points
              </span>
              <span className="font-black text-sm text-[#8f0b16] leading-tight">
                {Number(redeemPoints).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Wallet Dropdown Panel */}
        {showWalletDropdown && (
          <div className="absolute top-full left-4 right-4 mt-1 bg-[#141525] border border-amber-500/40 rounded-2xl p-4 shadow-2xl text-white space-y-3 animate-in fade-in slide-in-from-top-2 duration-200 z-50">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                Wallet Breakdown
              </span>
              <button
                onClick={() => setShowWalletDropdown(false)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕ Close
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-white/5 p-2 rounded-xl">
                <span className="text-[10px] text-slate-400 block">Deposit</span>
                <span className="font-bold text-white">₹{(wallet?.depositBalance || 0).toFixed(2)}</span>
              </div>
              <div className="bg-white/5 p-2 rounded-xl">
                <span className="text-[10px] text-slate-400 block">Winnings</span>
                <span className="font-bold text-emerald-400">₹{(wallet?.winBalance || 0).toFixed(2)}</span>
              </div>
              <div className="bg-white/5 p-2 rounded-xl">
                <span className="text-[10px] text-slate-400 block">Bonus</span>
                <span className="font-bold text-amber-400">₹{(wallet?.bonusBalance || 0).toFixed(2)}</span>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Link
                href="/wallet/deposit"
                className="flex-1 py-2 text-center rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs transition-colors"
              >
                + Add Cash
              </Link>
              <Link
                href="/wallet/withdraw"
                className="flex-1 py-2 text-center rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors"
              >
                Withdraw
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* =========================================================================
          MAIN CONTENT AREA
          ========================================================================= */}
      <main className="flex-1 max-w-md mx-auto w-full px-3 py-3 space-y-3.5">
        {/* =======================================================================
            2. PROMOTIONAL BANNER (Matching screenshot)
            ======================================================================= */}
        <div className="relative w-full rounded-2xl overflow-hidden border border-amber-500/30 shadow-xl bg-gradient-to-r from-[#200105] via-[#4d0711] to-[#200105] p-3 sm:p-4 flex items-center justify-between">
          {/* Ambient card art & glowing badges */}
          <div className="space-y-1 z-10 max-w-[65%]">
            <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-black text-[9px] uppercase tracking-wider border border-amber-500/30">
              Championship Season
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight uppercase leading-tight drop-shadow">
              PLAY &amp; WIN!
            </h2>
            <p className="text-amber-400 font-extrabold text-xs sm:text-sm tracking-wide">
              RUMMY LEAGUE
            </p>
            <p className="text-[10px] text-slate-300">
              100% Real Players • Instant UPI Settlements
            </p>
          </div>

          {/* Cards & Chips Visual */}
          <div className="relative w-24 h-20 shrink-0 flex items-center justify-center">
            <div className="absolute w-12 h-16 rounded-lg bg-gradient-to-tr from-amber-400 to-yellow-100 border border-amber-500 shadow-xl transform -rotate-12 flex items-center justify-center text-rose-600 font-black text-lg">
              ♥ A
            </div>
            <div className="absolute w-12 h-16 rounded-lg bg-gradient-to-tr from-slate-100 to-slate-300 border border-slate-400 shadow-xl transform rotate-12 translate-x-3 flex items-center justify-center text-slate-900 font-black text-lg">
              ♠ K
            </div>
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-amber-500 border border-yellow-200 flex items-center justify-center text-[10px] font-black text-black shadow-lg">
              ₹
            </div>
          </div>
        </div>

        {/* =======================================================================
            3. MODE SELECTION TABS: CASH, TOURNAMENTS, PRACTICE
            ======================================================================= */}
        <div className="grid grid-cols-3 gap-2">
          {/* CASH */}
          <button
            type="button"
            onClick={() => setModeTab('CASH')}
            className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow transition-all cursor-pointer ${
              modeTab === 'CASH'
                ? 'bg-gradient-to-r from-[#ffe49e] via-[#f5ad18] to-[#e69806] text-slate-950 scale-[1.02] shadow-amber-500/25 ring-2 ring-amber-400/60'
                : 'bg-[#4a0812] hover:bg-[#600b18] text-white/90 border border-amber-900/40'
            }`}
          >
            <span>₹ CASH</span>
          </button>

          {/* TOURNAMENTS */}
          <button
            type="button"
            onClick={() => setModeTab('TOURNAMENTS')}
            className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow transition-all cursor-pointer ${
              modeTab === 'TOURNAMENTS'
                ? 'bg-gradient-to-r from-[#ffe49e] via-[#f5ad18] to-[#e69806] text-slate-950 scale-[1.02] shadow-amber-500/25 ring-2 ring-amber-400/60'
                : 'bg-[#4a0812] hover:bg-[#600b18] text-white/90 border border-amber-900/40'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>TOURNAMENTS</span>
          </button>

          {/* PRACTICE */}
          <button
            type="button"
            onClick={() => setModeTab('PRACTICE')}
            className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow transition-all cursor-pointer ${
              modeTab === 'PRACTICE'
                ? 'bg-gradient-to-r from-[#ffe49e] via-[#f5ad18] to-[#e69806] text-slate-950 scale-[1.02] shadow-amber-500/25 ring-2 ring-amber-400/60'
                : 'bg-[#4a0812] hover:bg-[#600b18] text-white/90 border border-amber-900/40'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>PRACTICE</span>
          </button>
        </div>

        {/* =======================================================================
            4. FORMAT SELECTION TABS: POINT, POOL, DEAL
            ======================================================================= */}
        <div className="grid grid-cols-3 gap-2">
          {/* POINT */}
          <button
            type="button"
            onClick={() => setFormat('points')}
            className={`py-2 px-2 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider shadow transition-all cursor-pointer ${
              format === 'points'
                ? 'bg-gradient-to-b from-[#ffe5a3] to-[#e8b136] text-slate-950 font-black shadow-md'
                : 'bg-gradient-to-b from-[#e2e4e9] to-[#b3b6c2] text-slate-900 font-extrabold hover:brightness-105'
            }`}
          >
            POINT
          </button>

          {/* POOL */}
          <button
            type="button"
            onClick={() => setFormat('pool101')}
            className={`py-2 px-2 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider shadow transition-all cursor-pointer ${
              format === 'pool101'
                ? 'bg-gradient-to-b from-[#ffe5a3] to-[#e8b136] text-slate-950 font-black shadow-md'
                : 'bg-gradient-to-b from-[#e2e4e9] to-[#b3b6c2] text-slate-900 font-extrabold hover:brightness-105'
            }`}
          >
            POOL
          </button>

          {/* DEAL */}
          <button
            type="button"
            onClick={() => setFormat('deals')}
            className={`py-2 px-2 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider shadow transition-all cursor-pointer ${
              format === 'deals'
                ? 'bg-gradient-to-b from-[#ffe5a3] to-[#e8b136] text-slate-950 font-black shadow-md'
                : 'bg-gradient-to-b from-[#e2e4e9] to-[#b3b6c2] text-slate-900 font-extrabold hover:brightness-105'
            }`}
          >
            DEAL
          </button>
        </div>

        {/* Error notification banner if insufficient balance or find error */}
        {errorMessage && (
          <div className="p-3 rounded-2xl bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs flex items-start gap-2.5 shadow-lg">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1.5">
              <p className="leading-snug">{errorMessage}</p>
              {playableBalance < currentStake.entryFee && modeTab === 'CASH' && (
                <Link
                  href="/wallet/deposit"
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-amber-400 text-black font-black text-xs hover:bg-amber-300"
                >
                  <span>+ Deposit via WhatsApp</span>
                </Link>
              )}
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-white font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* =======================================================================
            5. MAIN SELECTION CARD (Matching user reference screenshot)
            ======================================================================= */}
        <div className="relative rounded-3xl bg-gradient-to-b from-[#5c0612] via-[#43030b] to-[#250106] border border-amber-400/70 shadow-[0_12px_40px_rgba(0,0,0,0.8)] p-6 sm:p-7 space-y-6 overflow-hidden">
          {/* Subtle card suit watermarks in corners */}
          <div className="absolute top-2 left-3 text-white/5 text-4xl select-none pointer-events-none font-serif">
            ♣
          </div>
          <div className="absolute bottom-2 right-3 text-white/5 text-4xl select-none pointer-events-none font-serif">
            ♠
          </div>

          {/* Section: Player Selector [ 2 | 6 ] */}
          <div className="text-center space-y-2">
            <h3 className="text-white text-base sm:text-lg font-bold tracking-wide">
              Player
            </h3>

            {/* Toggle Pill */}
            <div className="inline-flex items-center bg-[#290308] border border-amber-500/30 rounded-full p-1 shadow-inner">
              <button
                type="button"
                onClick={() => setPlayerCount(2)}
                className={`py-1.5 px-6 rounded-full text-sm font-black transition-all cursor-pointer ${
                  playerCount === 2
                    ? 'bg-gradient-to-b from-[#ffe5a3] to-[#e5a019] text-slate-950 shadow-md scale-105'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                2
              </button>

              <button
                type="button"
                onClick={() => setPlayerCount(6)}
                className={`py-1.5 px-6 rounded-full text-sm font-black transition-all cursor-pointer ${
                  playerCount === 6
                    ? 'bg-gradient-to-b from-[#ffe5a3] to-[#e5a019] text-slate-950 shadow-md scale-105'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                6
              </button>
            </div>
          </div>

          {/* Section: Entry Fee Selector */}
          <div className="text-center space-y-3">
            <h3 className="text-white text-xl sm:text-2xl font-black tracking-wide">
              Entry Fee
            </h3>

            {/* Control Row: Min, [-], Amount, [+], Max */}
            <div className="flex items-center justify-between gap-2 max-w-xs mx-auto">
              {/* Min Button */}
              <button
                type="button"
                onClick={handleMin}
                className="text-white/80 hover:text-white active:scale-95 text-xs sm:text-sm font-black uppercase cursor-pointer select-none transition-transform"
              >
                Min
              </button>

              {/* Minus [-] Button (Grey/silver rounded square) */}
              <button
                type="button"
                onClick={handleMinus}
                disabled={stakeIndex <= 0}
                className="w-11 h-11 rounded-xl bg-gradient-to-b from-[#f3f4f6] to-[#9ca3af] hover:from-white hover:to-slate-300 disabled:opacity-40 text-slate-950 font-black text-2xl flex items-center justify-center shadow-md active:scale-90 transition-transform cursor-pointer select-none"
                aria-label="Decrease entry fee"
              >
                <Minus className="w-5 h-5 stroke-[3]" />
              </button>

              {/* Amount Display */}
              <div className="flex-1 py-2 px-3 rounded-xl bg-black/40 border border-white/10 text-center shadow-inner">
                <span className="text-xl sm:text-2xl font-black text-white tracking-wide">
                  ₹ {currentStake.entryFee}
                </span>
              </div>

              {/* Plus [+] Button (Golden rounded square) */}
              <button
                type="button"
                onClick={handlePlus}
                disabled={stakeIndex >= currentStakes.length - 1}
                className="w-11 h-11 rounded-xl bg-gradient-to-b from-[#ffe58f] via-[#f5ad18] to-[#d48806] hover:from-[#fff0ad] hover:to-[#e09205] disabled:opacity-40 text-slate-950 font-black text-2xl flex items-center justify-center shadow-md shadow-amber-500/20 active:scale-90 transition-transform cursor-pointer select-none"
                aria-label="Increase entry fee"
              >
                <Plus className="w-5 h-5 stroke-[3]" />
              </button>

              {/* Max Button */}
              <button
                type="button"
                onClick={handleMax}
                className="text-white/80 hover:text-white active:scale-95 text-xs sm:text-sm font-black uppercase cursor-pointer select-none transition-transform"
              >
                Max
              </button>
            </div>

            {/* Sub-details: Point Value */}
            <div className="space-y-1 pt-1">
              {/* Point Value */}
              <p className="text-xs sm:text-sm text-slate-200 font-semibold">
                Point Value: {currentStake.pointValue}
              </p>

              {/* Quick link to see all available player counts across stakes */}
              <button
                type="button"
                onClick={() => setShowAllStakesModal(true)}
                className="text-[11px] text-amber-400 hover:text-amber-300 underline font-semibold transition-colors mt-1"
              >
                📊 View All Stakes
              </button>
            </div>
          </div>

          {/* PLAY NOW Button */}
          <div className="pt-2 flex justify-center">
            <button
              type="button"
              onClick={handlePlayNow}
              disabled={isLoadingMatch}
              className="w-full max-w-xs py-3.5 px-8 rounded-full bg-gradient-to-b from-[#ffe082] via-[#f5b027] to-[#d88900] hover:from-[#ffeb99] hover:to-[#e59400] active:scale-95 text-slate-950 font-black text-base sm:text-lg tracking-wider uppercase shadow-xl shadow-amber-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isLoadingMatch ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-black" />
                  <span>1 Player is active / Boost...</span>
                </span>
              ) : (
                <span>PLAY NOW</span>
              )}
            </button>
          </div>
        </div>

        {/* 100% Real Players Trust Badge */}
        <div className="text-center py-2 space-y-0.5">
          <p className="text-[11px] text-amber-400/90 font-bold flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>100% Real Multiplayer • Zero Bots in Cash Games</span>
          </p>
          <p className="text-[10px] text-slate-400">
            Fair Play Certified • Instant WhatsApp Wallet Settlements
          </p>
        </div>
      </main>

      {/* =========================================================================
          6. BOTTOM NAVIGATION BAR (Matching reference screenshot)
          ========================================================================= */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#3a040b] border-t border-amber-500/30 shadow-[0_-8px_25px_rgba(0,0,0,0.7)] px-2 py-1.5">
        <div className="max-w-md mx-auto flex items-end justify-around relative">
          {/* 1. Promotions */}
          <Link
            href="/promotions"
            className="flex flex-col items-center justify-center gap-0.5 text-slate-300 hover:text-amber-400 transition-colors py-1 px-2"
          >
            <Megaphone className="w-5 h-5 text-amber-400" />
            <span className="text-[10px] font-bold">Promotions</span>
          </Link>

          {/* 2. My Games */}
          <Link
            href="/my-games"
            className="flex flex-col items-center justify-center gap-0.5 text-slate-300 hover:text-amber-400 transition-colors py-1 px-2"
          >
            <Gamepad2 className="w-5 h-5 text-amber-400" />
            <span className="text-[10px] font-bold">My Games</span>
          </Link>

          {/* 3. Lobby (Elevated Golden Card Icon - Exact screenshot match) */}
          <Link
            href="/lobby"
            className="flex flex-col items-center justify-center relative -top-3 z-10 group"
          >
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-[#ffe5a3] via-[#f5ad18] to-[#d48806] shadow-xl shadow-amber-500/30 border-2 border-amber-300/80 flex flex-col items-center justify-center transition-transform group-hover:scale-105 active:scale-95">
              {/* Playing cards icon */}
              <div className="relative w-7 h-7 flex items-center justify-center">
                <span className="text-xl font-black text-[#8a0817]">♠</span>
                <span className="text-xs font-black text-[#8a0817] absolute -top-0.5 -right-0.5">♥</span>
              </div>
            </div>
            <span className="text-[10px] font-black text-amber-300 mt-0.5">Lobby</span>
          </Link>

          {/* 4. Withdraw */}
          <Link
            href="/wallet/withdraw"
            className="flex flex-col items-center justify-center gap-0.5 text-slate-300 hover:text-amber-400 transition-colors py-1 px-2"
          >
            <ArrowDownToLine className="w-5 h-5 text-amber-400" />
            <span className="text-[10px] font-bold">Withdraw</span>
          </Link>

          {/* 5. Menu */}
          <button
            type="button"
            onClick={() => setShowMenuDrawer(true)}
            className="flex flex-col items-center justify-center gap-0.5 text-slate-300 hover:text-amber-400 transition-colors py-1 px-2 cursor-pointer"
          >
            <MenuIcon className="w-5 h-5 text-amber-400" />
            <span className="text-[10px] font-bold">Menu</span>
          </button>
        </div>
      </nav>

      {/* =========================================================================
          7. ALL STAKES & LIVE PLAYERS MODAL
          ========================================================================= */}
      {showAllStakesModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#1a0205] border border-amber-500/50 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h4 className="font-black text-base text-white">All Stakes</h4>
                <p className="text-[11px] text-slate-400">
                  {format.toUpperCase()} • {playerCount} Players Table
                </p>
              </div>
              <button
                onClick={() => setShowAllStakesModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              {currentStakes.map((stake, idx) => {
                const isSelected = idx === stakeIndex;
                return (
                  <div
                    key={stake.entryFee}
                    onClick={() => {
                      setStakeIndex(idx);
                      setShowAllStakesModal(false);
                    }}
                    className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-400 shadow-lg'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-white text-base">₹ {stake.entryFee}</span>
                        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                          Pt: {stake.pointValue}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">{stake.name}</span>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-semibold text-slate-400">
                        {isSelected ? '✓ Selected' : 'Tap to Select'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          8. CONTACT SUPPORT MODAL
          ========================================================================= */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#1a0205] border border-amber-500/50 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <Headphones className="w-6 h-6" />
            </div>

            <div>
              <h4 className="font-black text-lg text-white">RummyAdda Support</h4>
              <p className="text-xs text-slate-300 mt-1">
                24x7 Instant WhatsApp Assistance for Deposits, Withdrawals &amp; Gameplay.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <a
                href="https://wa.me/919999999999?text=Hello%20RummyAdda%20Support%2C%20I%20need%20assistance."
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-colors"
              >
                <span>Chat on WhatsApp</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <Link
                href="/contact"
                onClick={() => setShowContactModal(false)}
                className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 font-bold text-xs block transition-colors"
              >
                Contact Page &amp; FAQs
              </Link>

              <button
                type="button"
                onClick={() => setShowContactModal(false)}
                className="w-full py-2 text-slate-400 hover:text-white text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          9. SLIDE-OVER SIDE MENU DRAWER
          ========================================================================= */}
      {showMenuDrawer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-xs bg-[#160205] border-l border-amber-500/30 h-full p-5 flex flex-col justify-between shadow-2xl overflow-y-auto">
            <div className="space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-300 p-0.5">
                    <div className="w-full h-full bg-[#180307] rounded-[10px] flex items-center justify-center text-amber-400 font-black">
                      ♠
                    </div>
                  </div>
                  <div>
                    <h4 className="font-black text-sm text-white">RUMMYADDA</h4>
                    <span className="text-[10px] text-amber-400 uppercase font-bold">Menu</span>
                  </div>
                </div>
                <button
                  onClick={() => setShowMenuDrawer(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300"
                >
                  ✕
                </button>
              </div>

              {/* Profile Card */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Logged In As</span>
                <p className="font-black text-white text-sm">{profile?.displayName || user?.displayName || 'Player'}</p>
                <p className="text-xs text-amber-400 font-mono">ID: {profile?.playerId || 'ADDA-1000'}</p>
                <p className="text-xs text-slate-300">Playable: ₹{playableBalance.toFixed(2)}</p>
              </div>

              {/* Nav Links */}
              <div className="space-y-1">
                <Link
                  href="/profile"
                  onClick={() => setShowMenuDrawer(false)}
                  className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-white/10 text-slate-200 font-bold text-xs transition-colors"
                >
                  <User className="w-4 h-4 text-amber-400" />
                  <span>My Profile &amp; Account</span>
                </Link>

                <Link
                  href="/wallet"
                  onClick={() => setShowMenuDrawer(false)}
                  className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-white/10 text-slate-200 font-bold text-xs transition-colors"
                >
                  <CreditCard className="w-4 h-4 text-amber-400" />
                  <span>Wallet &amp; Deposits</span>
                </Link>

                <Link
                  href="/my-games"
                  onClick={() => setShowMenuDrawer(false)}
                  className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-white/10 text-slate-200 font-bold text-xs transition-colors"
                >
                  <History className="w-4 h-4 text-amber-400" />
                  <span>Game History &amp; Hand Replay</span>
                </Link>

                <button
                  type="button"
                  onClick={() => {
                    setShowMenuDrawer(false);
                    setShowHowToPlay(true);
                  }}
                  className="w-full flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-white/10 text-slate-200 font-bold text-xs text-left transition-colors cursor-pointer"
                >
                  <HelpCircle className="w-4 h-4 text-amber-400" />
                  <span>How to Play &amp; Rummy Rules</span>
                </button>

                <Link
                  href="/profile/referrals"
                  onClick={() => setShowMenuDrawer(false)}
                  className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-white/10 text-slate-200 font-bold text-xs transition-colors"
                >
                  <Share2 className="w-4 h-4 text-amber-400" />
                  <span>Refer &amp; Earn ₹50 Chips</span>
                </Link>

                <Link
                  href="/fair-play"
                  onClick={() => setShowMenuDrawer(false)}
                  className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-white/10 text-slate-200 font-bold text-xs transition-colors"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Fair Play &amp; RNG Certification</span>
                </Link>

                <Link
                  href="/contact"
                  onClick={() => setShowMenuDrawer(false)}
                  className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-white/10 text-slate-200 font-bold text-xs transition-colors"
                >
                  <Headphones className="w-4 h-4 text-rose-400" />
                  <span>Customer Support</span>
                </Link>
              </div>
            </div>

            {/* Logout button */}
            <div className="pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={async () => {
                  setShowMenuDrawer(false);
                  await logout();
                  router.push('/login');
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-black text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* How to Play Modal */}
      <HowToPlayModal
        isOpen={showHowToPlay}
        onClose={() => setShowHowToPlay(false)}
      />
    </div>
  );
}
