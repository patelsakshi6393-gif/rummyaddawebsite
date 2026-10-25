'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { AuthGuard } from '@/components/AuthGuard';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import {
  ArrowLeft,
  ShieldCheck,
  Users,
  Coins,
  Loader2,
  Sparkles,
  Play,
  AlertCircle,
  Clock,
  Award,
} from 'lucide-react';
import { GameMode } from '@/lib/types';
import { findMatch } from '@/lib/game-service';

function FindMatchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, wallet } = useAuth();

  const formatParam = (searchParams.get('format') || 'points') as GameMode;
  const currentFormat: GameMode = ['points', 'pool101', 'deals'].includes(formatParam)
    ? formatParam
    : 'points';

  const entryFee = parseInt(searchParams.get('entryFee') || '20', 10);
  const pointValue = parseFloat(searchParams.get('pointValue') || '0.25');
  const maxPlayers = parseInt(searchParams.get('players') || '2', 10) === 6 ? 6 : 2;

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const depositBal = wallet?.depositBalance || 0;
  const winBal = wallet?.winBalance || 0;
  const bonusBal = wallet?.bonusBalance || 0;
  const totalPlayable = (depositBal || 0) + (winBal || 0) + (bonusBal || 0);

  const formatTitles: Record<GameMode, { title: string; icon: string }> = {
    points: { title: 'Points Rummy', icon: '♠' },
    pool101: { title: 'Pool 101 Rummy', icon: '🏊' },
    deals: { title: 'Deals Rummy', icon: '🤝' },
  };

  const currentInfo = formatTitles[currentFormat];
  const hasEnoughBalance = totalPlayable >= entryFee;

  const handleStartFinding = async () => {
    if (!profile) return;
    setErrorMsg(null);

    if (!hasEnoughBalance) {
      setErrorMsg(
        `Insufficient balance for this match! Entry fee is ₹${entryFee}, but your playable balance is ₹${totalPlayable}. Please add cash via WhatsApp deposit first.`
      );
      return;
    }

    setLoading(true);
    try {
      const gameId = await findMatch(currentFormat, entryFee, pointValue, profile, maxPlayers);
      router.push(`/game/${gameId}`);
    } catch (err: unknown) {
      console.error('Find match error:', err);
      const msg = err instanceof Error ? err.message : 'Error finding match. Please try again.';
      setErrorMsg(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#07070a] text-slate-100">
      <Navbar />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Back navigation to Screen 2 */}
        <div className="flex items-center justify-between">
          <Link
            href={`/match/stakes?format=${currentFormat}`}
            className="inline-flex items-center gap-2 text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors bg-white/5 py-2 px-3.5 rounded-xl border border-white/10"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>← Change Stake Tier</span>
          </Link>

          {/* User Balance */}
          <div className="flex items-center gap-2.5 bg-[#11121d] border border-white/10 py-1.5 px-3.5 rounded-xl text-xs">
            <Coins className="w-4 h-4 text-amber-400" />
            <span className="text-slate-400">Playable Balance:</span>
            <span className="font-black text-amber-300">
              ₹{totalPlayable.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Header Indicator */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Screen 3 : Match Confirmation</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white">
            FIND MATCH
          </h1>
          <p className="text-xs sm:text-sm text-slate-300">
            Click the button below to join or create a table with genuine live players.
          </p>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
            <div className="space-y-2 flex-1">
              <p className="font-semibold leading-relaxed">{errorMsg}</p>
              {!hasEnoughBalance && (
                <Link
                  href="/wallet/deposit"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-black font-black text-xs hover:bg-amber-400 transition-colors"
                >
                  <span>+ Deposit Cash via WhatsApp</span>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Active Player and Boost Status */}
        <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-black text-emerald-400">1 Player is active / Boost</span>
          </div>
          <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider">Fast Matchmaking</span>
        </div>

        {/* Selected Match Card */}
        <div className="bg-gradient-to-b from-[#141525] to-[#0c0d16] border border-amber-500/40 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-300 p-0.5 shadow-lg shadow-amber-500/20">
                <div className="w-full h-full bg-[#120a10] rounded-[14px] flex items-center justify-center text-2xl font-black text-amber-400">
                  {currentInfo.icon}
                </div>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">
                  Selected Game Format
                </span>
                <h3 className="text-lg sm:text-xl font-black text-white">
                  {currentInfo.title}
                </h3>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                Entry Fee
              </span>
              <p className="text-2xl font-black text-amber-300">
                ₹{entryFee.toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          {/* Table Specs Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-[#0b0c14] border border-white/5 p-3.5 rounded-xl">
              <span className="text-slate-400 text-[11px] block">Table Capacity</span>
              <p className="font-black text-white mt-0.5 flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-amber-400" />
                <span>2 to 6 Real Players</span>
              </p>
            </div>

            <div className="bg-[#0b0c14] border border-white/5 p-3.5 rounded-xl">
              <span className="text-slate-400 text-[11px] block">Point Value / Rule</span>
              <p className="font-black text-amber-300 mt-0.5 font-mono">
                {currentFormat === 'points' ? `₹${pointValue}/pt` : currentFormat === 'pool101' ? '101 Pool Knockout' : 'Deals Rule'}
              </p>
            </div>

            <div className="bg-[#0b0c14] border border-white/5 p-3.5 rounded-xl col-span-2 sm:col-span-1">
              <span className="text-slate-400 text-[11px] block">Countdown Rule</span>
              <p className="font-black text-emerald-400 mt-0.5 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>15s when 2nd player joins</span>
              </p>
            </div>
          </div>

          {/* Real Players Guarantee Banner */}
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3 text-xs">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-emerald-300">100% Real Players & Zero Bots Guarantee</p>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Rummy Adda enforces an authentic multiplayer policy with zero bots. You will play exclusively with verified human players. Tables support 2 to 6 players.
              </p>
            </div>
          </div>

          {/* Bonus balance payment alert */}
          {depositBal === 0 && bonusBal >= entryFee && (
            <div className="p-3.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-xs text-purple-200 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span>🎁</span>
                <span>Entry fee will be covered by your <strong>₹{entryFee} Welcome Bonus</strong>!</span>
              </span>
              <span className="text-[10px] text-purple-300 font-bold uppercase tracking-wider">
                Winnings Withdrawable ✓
              </span>
            </div>
          )}

          {/* Main Action: FIND MATCH Button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleStartFinding}
              disabled={loading || !hasEnoughBalance}
              className={`w-full py-5 px-6 rounded-2xl font-black text-base sm:text-lg flex items-center justify-center gap-3 transition-all duration-200 active:scale-95 shadow-2xl ${
                hasEnoughBalance
                  ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 shadow-amber-500/30 hover:scale-[1.02]'
                  : 'bg-white/10 text-slate-500 cursor-not-allowed'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin text-black" />
                  <span>1 Player is active / Boost (Joining Table...)</span>
                </>
              ) : hasEnoughBalance ? (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  <span>FIND MATCH (Entry: ₹{entryFee})</span>
                </>
              ) : (
                <span>Insufficient Balance (Requires ₹{entryFee})</span>
              )}
            </button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default function FindMatchPage() {
  return (
    <AuthGuard>
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#07070a] flex items-center justify-center text-amber-400">
            Loading match setup...
          </div>
        }
      >
        <FindMatchContent />
      </Suspense>
    </AuthGuard>
  );
}
