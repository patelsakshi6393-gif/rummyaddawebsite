'use client';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  runTransaction,
  query,
  where,
  onSnapshot,
  deleteDoc,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import {
  Card,
  GameMode,
  GameState,
  GamePlayerState,
  TableConfig,
  UserProfile,
  UserWallet,
  Rank,
  MatchmakingTicket,
} from './types';
import {
  create108Deck,
  shuffleDeck,
  TOSS_RANK_VALUE,
  validateDeclaration,
  calculateLossPoints,
  isValidSet,
  findBestMelds,
} from './rummy-engine';
import { handleFirestoreError, OperationType } from './firebase-error';

export const INITIAL_TABLES: Omit<TableConfig, 'currentPlayers' | 'status'>[] = [
  { tableId: 'pt_20_2p', name: 'Points Rummy - Micro Stake', gameMode: 'points', pointValue: 0.25, entryFee: 20, minPlayers: 2, maxPlayers: 2 },
  { tableId: 'pt_160_2p', name: 'Points Rummy - Bronze Table', gameMode: 'points', pointValue: 2, entryFee: 160, minPlayers: 2, maxPlayers: 2 },
  { tableId: 'pt_400_2p', name: 'Points Rummy - Silver Table (₹400)', gameMode: 'points', pointValue: 5, entryFee: 400, minPlayers: 2, maxPlayers: 6 },
  { tableId: 'pt_800_2p', name: 'Points Rummy - Silver Table', gameMode: 'points', pointValue: 10, entryFee: 800, minPlayers: 2, maxPlayers: 2 },
  { tableId: 'pt_1600_2p', name: 'Points Rummy - Ruby Table (₹1,600)', gameMode: 'points', pointValue: 20, entryFee: 1600, minPlayers: 2, maxPlayers: 6 },
  { tableId: 'pt_3200_6p', name: 'Points Rummy - Gold Royale (6P)', gameMode: 'points', pointValue: 40, entryFee: 3200, minPlayers: 2, maxPlayers: 6 },
  { tableId: 'pt_6000_6p', name: 'Points Rummy - Platinum Table (6P)', gameMode: 'points', pointValue: 75, entryFee: 6000, minPlayers: 2, maxPlayers: 6 },
  { tableId: 'pt_10000_6p', name: 'Points Rummy - Diamond Salon (6P)', gameMode: 'points', pointValue: 125, entryFee: 10000, minPlayers: 2, maxPlayers: 6 },
  { tableId: 'pt_16000_6p', name: 'Points Rummy - High Roller Crown (6P)', gameMode: 'points', pointValue: 200, entryFee: 16000, minPlayers: 2, maxPlayers: 6 },
  { tableId: 'pool_160_6p', name: 'Pool 101 - Bronze Royale', gameMode: 'pool101', pointValue: 2, entryFee: 160, minPlayers: 2, maxPlayers: 6 },
  { tableId: 'pool_800_6p', name: 'Pool 101 - Silver Arena', gameMode: 'pool101', pointValue: 10, entryFee: 800, minPlayers: 2, maxPlayers: 6 },
  { tableId: 'pool_1600_6p', name: 'Pool 101 - Ruby Arena', gameMode: 'pool101', pointValue: 20, entryFee: 1600, minPlayers: 2, maxPlayers: 6 },
  { tableId: 'pool_3200_6p', name: 'Pool 101 - Masters Championship', gameMode: 'pool101', pointValue: 40, entryFee: 3200, minPlayers: 2, maxPlayers: 6 },
];

export interface StakeOption {
  entryFee: number;
  pointValue: number;
  name: string;
  badge?: string;
}

export const STAKE_OPTIONS: Record<GameMode, StakeOption[]> = {
  points: [
    { entryFee: 20, pointValue: 0.25, name: 'Micro Stakes (₹0.25/pt)' },
    { entryFee: 40, pointValue: 0.5, name: 'Mini Stakes (₹0.50/pt)' },
    { entryFee: 80, pointValue: 1, name: 'Standard Stakes (₹1/pt)' },
    { entryFee: 160, pointValue: 2, name: 'Bronze Stake (₹2/pt)' },
    { entryFee: 400, pointValue: 5, name: 'Silver Stake (₹5/pt - ₹400)', badge: 'Popular' },
    { entryFee: 800, pointValue: 10, name: 'Silver Stake (₹10/pt)' },
    { entryFee: 1600, pointValue: 20, name: 'Ruby Stake (₹20/pt - ₹1,600)' },
    { entryFee: 3200, pointValue: 40, name: 'Gold Royale (₹40/pt)' },
    { entryFee: 6000, pointValue: 75, name: 'Platinum Stake (₹75/pt)' },
    { entryFee: 10000, pointValue: 125, name: 'Diamond Salon (₹125/pt)' },
    { entryFee: 16000, pointValue: 200, name: 'High Roller Crown (₹200/pt)' },
  ],
  pool101: [
    { entryFee: 20, pointValue: 0.25, name: 'Pool 101 - Micro (₹20)' },
    { entryFee: 40, pointValue: 0.5, name: 'Pool 101 - Mini (₹40)' },
    { entryFee: 80, pointValue: 1, name: 'Pool 101 - Standard (₹80)' },
    { entryFee: 160, pointValue: 2, name: 'Pool 101 - Bronze (₹160)' },
    { entryFee: 400, pointValue: 5, name: 'Pool 101 - Silver (₹400)' },
    { entryFee: 800, pointValue: 10, name: 'Pool 101 - Gold (₹800)' },
    { entryFee: 1600, pointValue: 20, name: 'Pool 101 - Ruby (₹1,600)' },
    { entryFee: 3200, pointValue: 40, name: 'Pool 101 - Masters (₹3,200)' },
    { entryFee: 6000, pointValue: 75, name: 'Pool 101 - Platinum (₹6,000)' },
    { entryFee: 10000, pointValue: 125, name: 'Pool 101 - Diamond (₹10,000)' },
    { entryFee: 16000, pointValue: 200, name: 'Pool 101 - High Roller (₹16,000)' },
  ],
  deals: [
    { entryFee: 20, pointValue: 0.25, name: 'Deals Rummy - Micro (₹20)' },
    { entryFee: 40, pointValue: 0.5, name: 'Deals Rummy - Mini (₹40)' },
    { entryFee: 80, pointValue: 1, name: 'Deals Rummy - Standard (₹80)' },
    { entryFee: 160, pointValue: 2, name: 'Deals Rummy - Bronze (₹160)' },
    { entryFee: 400, pointValue: 5, name: 'Deals Rummy - Silver (₹400)' },
    { entryFee: 800, pointValue: 10, name: 'Deals Rummy - Gold (₹800)' },
    { entryFee: 1600, pointValue: 20, name: 'Deals Rummy - Ruby (₹1,600)' },
    { entryFee: 3200, pointValue: 40, name: 'Deals Rummy - Masters (₹3,200)' },
    { entryFee: 6000, pointValue: 75, name: 'Deals Rummy - Platinum (₹6,000)' },
    { entryFee: 10000, pointValue: 125, name: 'Deals Rummy - Diamond (₹10,000)' },
    { entryFee: 16000, pointValue: 200, name: 'Deals Rummy - High Roller (₹16,000)' },
  ],
};

/**
 * Clear any active game session pointer for a player in user document and localStorage
 */
export async function clearActiveGameSession(playerUid: string, gameId?: string): Promise<void> {
  if (!playerUid) return;
  try {
    const userRef = doc(db, 'users', playerUid);
    await updateDoc(userRef, {
      activeGameId: null,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Error clearing activeGameId on user doc:', err);
  }

  // Clear in localStorage if in browser environment
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.removeItem('rummy_active_game_id');
      localStorage.removeItem('activeGameId');
    } catch {
      // localStorage may fail in restricted/private modes
    }
  }

  if (gameId) {
    try {
      const gRef = doc(db, 'games', gameId);
      const gSnap = await getDoc(gRef);
      if (gSnap.exists()) {
        const gData = gSnap.data() as GameState;
        const currentDropped = Array.isArray(gData.droppedUids) ? gData.droppedUids : [];
        if (!currentDropped.includes(playerUid)) {
          await updateDoc(gRef, {
            droppedUids: [...currentDropped, playerUid],
            updatedAt: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      console.warn('Error marking droppedUids in clearActiveGameSession:', err);
    }
  }
}

/**
 * Record active game session pointer for a player in user document and localStorage
 */
export async function setActiveGameSession(playerUid: string, gameId: string): Promise<void> {
  if (!playerUid || !gameId) return;
  try {
    const userRef = doc(db, 'users', playerUid);
    await updateDoc(userRef, {
      activeGameId: gameId,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Error setting activeGameId on user doc:', err);
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem('rummy_active_game_id', gameId);
      localStorage.setItem('activeGameId', gameId);
    } catch {
      // localStorage may fail
    }
  }
}

/**
 * Retrieve the current active game session ID for a player, if any
 */
export function getActiveGameSession(): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return localStorage.getItem('rummy_active_game_id') || localStorage.getItem('activeGameId') || null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Matchmaking: Find an existing open table for this format & stake or create a real waiting queue.
 * Zero bots policy: Matches only genuine authenticated players online.
 */
export async function findMatch(
  mode: GameMode,
  entryFee: number,
  pointValue: number,
  profile: UserProfile,
  maxPlayers: number = 2
): Promise<string> {
  const currentUid = auth.currentUser?.uid || profile.uid;
  const walletRef = doc(db, 'wallets', currentUid);
  let walletSnap = await getDoc(walletRef);
  
  if (!walletSnap.exists()) {
    const initialWallet: UserWallet = {
      uid: currentUid,
      depositBalance: 0,
      winBalance: 0,
      bonusBalance: 20, // ₹20 Welcome bonus
      welcomeBonusClaimed: true,
      rewardPoints: 0,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(walletRef, initialWallet);
    walletSnap = await getDoc(walletRef);
  }

  const wallet = walletSnap.data() as UserWallet;
  const playable = (wallet.depositBalance || 0) + (wallet.winBalance || 0) + (wallet.bonusBalance || 0);
  if (playable < entryFee) {
    throw new Error(`Insufficient playable balance (₹${playable}). Required entry fee is ₹${entryFee}. Please deposit via WhatsApp.`);
  }

  // Deduct from depositBalance first, then bonusBalance (used when deposit is zero/insufficient), then winBalance
  const depositDeduct = Math.min(wallet.depositBalance || 0, entryFee);
  const remainingAfterDeposit = entryFee - depositDeduct;
  const bonusDeduct = Math.min(wallet.bonusBalance || 0, remainingAfterDeposit);
  const winDeduct = remainingAfterDeposit - bonusDeduct;

  // Check if user is already seated in an ongoing active playing match
  const activeGamesSnap = await getDocs(
    query(
      collection(db, 'games'),
      where('status', 'in', ['PLAYING', 'TOSS', 'DEAL', 'DECLARE'])
    )
  );
  for (const gDoc of activeGamesSnap.docs) {
    const gData = gDoc.data() as GameState;
    if (Array.isArray(gData.playerUids) && gData.playerUids.includes(currentUid)) {
      // 1. If player is listed in droppedUids on the game, DO NOT reconnect
      if (Array.isArray(gData.droppedUids) && gData.droppedUids.includes(currentUid)) {
        continue;
      }

      // Check freshness: table must have activity within last 2 minutes
      const lastActiveTime = new Date(gData.updatedAt || gData.createdAt || 0).getTime();
      const isFresh = Date.now() - lastActiveTime < 120000;
      if (!isFresh) {
        continue; // Stale abandoned match, do not reconnect
      }

      // 2. Fetch the player subdocument to check current status
      try {
        const pRef = doc(db, 'games', gDoc.id, 'players', currentUid);
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
          const pData = pSnap.data() as GamePlayerState;
          if (pData.status === 'dropped' || pData.status === 'eliminated') {
            continue; // Dropped/eliminated player must not be reconnected
          }
          // Player is genuinely actively playing in this match!
          await setActiveGameSession(currentUid, gDoc.id);
          return gDoc.id; // Reconnect user to their live playing match
        }
      } catch (err) {
        console.warn('Player status verification error:', err);
      }
      // If verification failed or status was not actively playing, do NOT reconnect
      continue;
    }
  }

  // Look for an existing open waiting or countdown match with available seats (< 6)
  // CRITICAL: Filter out any stale rooms older than 90 seconds so ghost players are never matched!
  const q = query(
    collection(db, 'games'),
    where('mode', '==', mode),
    where('entryFee', '==', entryFee),
    where('status', 'in', ['WAITING', 'COUNTDOWN'])
  );
  const openSnap = await getDocs(q);

  let targetGameId: string | null = null;
  let myExistingWaitingGameId: string | null = null;
  const now = Date.now();

  for (const gDoc of openSnap.docs) {
    const gData = gDoc.data() as GameState;
    const isAlreadySeated = Array.isArray(gData.playerUids)
      ? gData.playerUids.includes(currentUid)
      : false;

    // Filter by table capacity (2-player vs 6-player)
    const tableCapacity = gData.maxPlayers || 2;
    if (tableCapacity !== maxPlayers) {
      continue;
    }

    // Check freshness: table must have activity within last 90 seconds
    const lastActiveTime = new Date(gData.updatedAt || gData.createdAt || 0).getTime();
    const isFresh = now - lastActiveTime < 90000;

    if (!isFresh) {
      continue; // Skip any stale waiting room
    }

    if (isAlreadySeated) {
      if (Array.isArray(gData.droppedUids) && gData.droppedUids.includes(currentUid)) {
        continue;
      }
      try {
        const pRef = doc(db, 'games', gDoc.id, 'players', currentUid);
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
          const pData = pSnap.data() as GamePlayerState;
          if (pData.status === 'dropped' || pData.status === 'eliminated') {
            continue;
          }
          myExistingWaitingGameId = gDoc.id;
        }
      } catch {
        // Skip unverified
      }
    } else if ((gData.playerCount || 0) < maxPlayers) {
      targetGameId = gDoc.id;
      break;
    }
  }

  // If user already has an active fresh waiting room for this mode & stake, reconnect without double charge
  if (!targetGameId && myExistingWaitingGameId) {
    await setActiveGameSession(currentUid, myExistingWaitingGameId);
    return myExistingWaitingGameId;
  }

  if (targetGameId) {
    const gameId = targetGameId;
    await runTransaction(db, async (tx) => {
      // 1. ALL READS FIRST
      const gRef = doc(db, 'games', gameId);
      const gSnap = await tx.get(gRef);
      if (!gSnap.exists()) throw new Error('Match session expired.');
      const gData = gSnap.data() as GameState;

      const pRef = doc(db, 'games', gameId, 'players', currentUid);
      const existingPSnap = await tx.get(pRef);
      if (existingPSnap.exists()) {
        const pData = existingPSnap.data() as GamePlayerState;
        if (pData.status !== 'dropped' && pData.status !== 'eliminated') {
          return; // Already actively seated in this match
        }
      }

      const tableCap = gData.maxPlayers || maxPlayers;
      if ((gData.playerCount || 0) >= tableCap || (gData.status !== 'WAITING' && gData.status !== 'COUNTDOWN')) {
        throw new Error('Table was just filled. Please try matching again.');
      }

      const wSnap = await tx.get(walletRef);
      const wData = wSnap.exists() ? (wSnap.data() as UserWallet) : null;

      // 2. ALL WRITES AFTER
      const newCount = (gData.playerCount || 1) + 1;
      const newPlayer: GamePlayerState = {
        uid: currentUid,
        playerId: profile.playerId,
        displayName: profile.displayName,
        photoURL: profile.photoURL || '',
        seatIndex: gData.playerCount || 1,
        status: 'waiting',
        cardCount: 0,
        score: 0,
        connected: true,
        entryPaid: entryFee,
        deductionBreakdown: {
          depositDeduct,
          bonusDeduct,
          winDeduct,
          total: entryFee,
        },
        joinedAt: new Date().toISOString(),
      };
      tx.set(pRef, newPlayer);

      const existingUids = Array.isArray(gData.playerUids) ? gData.playerUids : [];
      const updates: Record<string, unknown> = {
        playerCount: newCount,
        playerUids: Array.from(new Set([...existingUids, currentUid])),
        updatedAt: new Date().toISOString(),
      };

      // Synchronized countdown starts once at least 2 real players are seated
      if (newCount >= 2) {
        const countdownEndsAt = new Date(Date.now() + 10000).toISOString();
        updates.status = 'COUNTDOWN';
        updates.phase = 'COUNTDOWN';
        updates.countdownEndsAt = countdownEndsAt;
      }
      tx.update(gRef, updates);

      // Deduct wallet in transaction
      if (wData) {
        tx.update(walletRef, {
          depositBalance: Math.max(0, (wData.depositBalance || 0) - depositDeduct),
          bonusBalance: Math.max(0, (wData.bonusBalance || 0) - bonusDeduct),
          winBalance: Math.max(0, (wData.winBalance || 0) - winDeduct),
          updatedAt: new Date().toISOString(),
        });
      }
    });

    const txRef = doc(collection(db, 'transactions'));
    await setDoc(txRef, {
      id: txRef.id,
      uid: currentUid,
      type: 'game_entry',
      amount: -entryFee,
      status: 'completed',
      description: `Match entry for ${mode.toUpperCase()} (₹${entryFee})`,
      referenceId: gameId,
      createdAt: new Date().toISOString(),
    });

    await setActiveGameSession(currentUid, gameId);
    return gameId;
  } else {
    // Create new match session with honest waiting state
    const gameId = `match_${mode}_${entryFee}_${maxPlayers}p_${Date.now()}`;
    const gameRef = doc(db, 'games', gameId);
    const newGame: GameState = {
      gameId,
      tableId: `table_${mode}_${entryFee}_${maxPlayers}p`,
      mode,
      pointValue,
      entryFee,
      maxPlayers,
      playerCount: 1,
      playerUids: [currentUid],
      status: 'WAITING',
      phase: 'WAITING',
      waitingEndsAt: new Date(Date.now() + 60000).toISOString(),
      openDeck: [],
      closedDeckCount: 108,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const playerRef = doc(db, 'games', gameId, 'players', currentUid);
    const newPlayer: GamePlayerState = {
      uid: currentUid,
      playerId: profile.playerId,
      displayName: profile.displayName,
      photoURL: profile.photoURL || '',
      seatIndex: 0,
      status: 'waiting',
      cardCount: 0,
      score: 0,
      connected: true,
      entryPaid: entryFee,
      deductionBreakdown: {
        depositDeduct,
        bonusDeduct,
        winDeduct,
        total: entryFee,
      },
      joinedAt: new Date().toISOString(),
    };

    await setDoc(gameRef, newGame);
    await setDoc(playerRef, newPlayer);

    // Deduct wallet
    await updateDoc(walletRef, {
      depositBalance: Math.max(0, (wallet.depositBalance || 0) - depositDeduct),
      bonusBalance: Math.max(0, (wallet.bonusBalance || 0) - bonusDeduct),
      winBalance: Math.max(0, (wallet.winBalance || 0) - winDeduct),
      updatedAt: new Date().toISOString(),
    });

    const txRef = doc(collection(db, 'transactions'));
    await setDoc(txRef, {
      id: txRef.id,
      uid: currentUid,
      type: 'game_entry',
      amount: -entryFee,
      status: 'completed',
      description: `Match entry for ${mode.toUpperCase()} (₹${entryFee})`,
      referenceId: gameId,
      createdAt: new Date().toISOString(),
    });

    await setActiveGameSession(currentUid, gameId);
    return gameId;
  }
}

/**
 * Cancel waiting matchmaking queue and refund entry fee
 */
export async function leaveMatchQueue(
  gameId: string,
  playerUid: string
): Promise<{ refunded: boolean; refundAmount: number }> {
  const gameRef = doc(db, 'games', gameId);
  const playerRef = doc(db, 'games', gameId, 'players', playerUid);
  const walletRef = doc(db, 'wallets', playerUid);

  let refundAmount = 0;
  let depositRefund = 0;
  let bonusRefund = 0;
  let winRefund = 0;

  await runTransaction(db, async (tx) => {
    // 1. ALL READS FIRST
    const gSnap = await tx.get(gameRef);
    if (!gSnap.exists()) return;
    const gData = gSnap.data() as GameState;

    if (gData.status !== 'WAITING' && gData.status !== 'COUNTDOWN') {
      throw new Error('Cannot cancel once match play has started.');
    }

    const pSnap = await tx.get(playerRef);
    if (!pSnap.exists()) return;

    const wSnap = await tx.get(walletRef);
    const wData = wSnap.exists() ? (wSnap.data() as UserWallet) : null;

    const pData = pSnap.data() as GamePlayerState;
    const breakdown = pData.deductionBreakdown;

    if (breakdown) {
      depositRefund = breakdown.depositDeduct || 0;
      bonusRefund = breakdown.bonusDeduct || 0;
      winRefund = breakdown.winDeduct || 0;
      refundAmount = breakdown.total || (depositRefund + bonusRefund + winRefund);
    } else {
      refundAmount = pData.entryPaid || gData.entryFee || 0;
      depositRefund = refundAmount;
    }

    // 2. ALL WRITES AFTER
    tx.delete(playerRef);

    const remaining = Math.max(0, (gData.playerCount || 1) - 1);
    const updates: Record<string, unknown> = {
      playerCount: remaining,
      playerUids: (gData.playerUids || []).filter((id) => id !== playerUid),
      updatedAt: new Date().toISOString(),
    };

    if (remaining === 0) {
      updates.status = 'COMPLETED';
      updates.phase = 'COMPLETED';
    } else if (remaining < 2) {
      // If fewer than two eligible players remain, cancel the countdown!
      updates.status = 'WAITING';
      updates.phase = 'WAITING';
      updates.countdownEndsAt = null;
    }
    tx.update(gameRef, updates);

    if (refundAmount > 0 && wData) {
      tx.update(walletRef, {
        depositBalance: (wData.depositBalance || 0) + depositRefund,
        bonusBalance: (wData.bonusBalance || 0) + bonusRefund,
        winBalance: (wData.winBalance || 0) + winRefund,
        updatedAt: new Date().toISOString(),
      });
    }
  });

  if (refundAmount > 0) {
    const txRef = doc(collection(db, 'transactions'));
    await setDoc(txRef, {
      id: txRef.id,
      uid: playerUid,
      type: 'refund',
      amount: refundAmount,
      status: 'completed',
      description: `Waiting time exit refund (₹${refundAmount})`,
      referenceId: gameId,
      createdAt: new Date().toISOString(),
    });
  }

  await clearActiveGameSession(playerUid, gameId);
  return { refunded: refundAmount > 0, refundAmount };
}

/**
 * Fetch real-time active players count for a specific game format, stake & table capacity
 */
export async function getLivePlayerCount(
  mode: GameMode,
  entryFee: number,
  maxPlayers: number = 2
): Promise<number> {
  try {
    const q = query(
      collection(db, 'games'),
      where('status', 'in', ['WAITING', 'COUNTDOWN', 'PLAYING'])
    );
    const snap = await getDocs(q);
    const now = Date.now();
    let count = 0;
    for (const d of snap.docs) {
      const data = d.data() as GameState;
      if (data.mode !== mode || data.entryFee !== entryFee) continue;
      const lastActive = new Date(data.updatedAt || data.createdAt || 0).getTime();
      if (now - lastActive < 120000) {
        const tableMax = data.maxPlayers || 2;
        if (tableMax === maxPlayers) {
          count += data.playerCount || (data.playerUids ? data.playerUids.length : 1);
        }
      }
    }
    return count;
  } catch (err) {
    console.warn('Error fetching live player count:', err);
    return 0;
  }
}

/**
 * Fetch live active player counts across all stakes for a format and player capacity
 */
export async function getAllStakesPlayerCounts(
  mode: GameMode,
  maxPlayers: number = 2
): Promise<Record<number, number>> {
  try {
    const q = query(
      collection(db, 'games'),
      where('status', 'in', ['WAITING', 'COUNTDOWN', 'PLAYING'])
    );
    const snap = await getDocs(q);
    const now = Date.now();
    const counts: Record<number, number> = {};
    for (const d of snap.docs) {
      const data = d.data() as GameState;
      if (data.mode !== mode) continue;
      const lastActive = new Date(data.updatedAt || data.createdAt || 0).getTime();
      if (now - lastActive < 120000) {
        const tableMax = data.maxPlayers || 2;
        if (tableMax === maxPlayers && data.entryFee) {
          const pCount = data.playerCount || (data.playerUids ? data.playerUids.length : 1);
          counts[data.entryFee] = (counts[data.entryFee] || 0) + pCount;
        }
      }
    }
    return counts;
  } catch (err) {
    console.warn('Error fetching all stakes player counts:', err);
    return {};
  }
}

/**
 * Real-time subscription to active player counts across all stakes for a given mode and table capacity.
 * Uses Firestore onSnapshot on collection(db, 'games') where status in ['WAITING', 'COUNTDOWN'].
 * Filters for fresh rooms within 90s, matching mode and maxPlayers.
 * Returns a map of { [entryFee]: activeCount } where activeCount is the count of players currently waiting/seated.
 * Returns an unsubscribe cleanup function.
 */
export function subscribeLiveStakesPlayerCounts(
  mode: GameMode,
  maxPlayers: number = 2,
  callback: (counts: Record<number, number>) => void
): () => void {
  try {
    const q = query(
      collection(db, 'games'),
      where('status', 'in', ['WAITING', 'COUNTDOWN'])
    );

    let latestSnapshot: any = null;

    const computeAndEmitCounts = () => {
      if (!latestSnapshot) {
        callback({});
        return;
      }
      const counts: Record<number, number> = {};
      const now = Date.now();
      latestSnapshot.forEach((docSnap: any) => {
        const data = docSnap.data() as GameState;
        if (!data) return;
        if (data.mode !== mode) return;
        const tableMax = data.maxPlayers || 2;
        if (tableMax !== maxPlayers) return;

        // Freshness check: must have activity within last 90 seconds
        let lastActive = 0;
        if (data.updatedAt) {
          if (typeof data.updatedAt === 'string') {
            lastActive = new Date(data.updatedAt).getTime();
          } else if (typeof (data.updatedAt as any).toDate === 'function') {
            lastActive = (data.updatedAt as any).toDate().getTime();
          } else if ((data.updatedAt as any).seconds) {
            lastActive = (data.updatedAt as any).seconds * 1000;
          }
        }
        if (!lastActive && data.createdAt) {
          if (typeof data.createdAt === 'string') {
            lastActive = new Date(data.createdAt).getTime();
          } else if (typeof (data.createdAt as any).toDate === 'function') {
            lastActive = (data.createdAt as any).toDate().getTime();
          } else if ((data.createdAt as any).seconds) {
            lastActive = (data.createdAt as any).seconds * 1000;
          }
        }
        if (lastActive > 0 && (now - lastActive) > 90000) return;

        const fee = Number(data.entryFee);
        if (fee !== undefined && !isNaN(fee)) {
          const pCount = data.playerCount || (Array.isArray(data.playerUids) ? data.playerUids.length : 0);
          if (pCount > 0) {
            counts[fee] = (counts[fee] || 0) + pCount;
          }
        }
      });
      callback(counts);
    };

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        latestSnapshot = snapshot;
        computeAndEmitCounts();
      },
      (err) => {
        console.warn('Error in subscribeLiveStakesPlayerCounts:', err);
        callback({});
      }
    );

    // Periodically re-check freshness every 10 seconds to auto-expire rooms > 90s without needing a remote write
    const intervalId = setInterval(computeAndEmitCounts, 10000);

    return () => {
      unsubscribe();
      clearInterval(intervalId);
    };
  } catch (err) {
    console.warn('Failed to initialize subscribeLiveStakesPlayerCounts:', err);
    callback({});
    return () => {};
  }
}

/**
 * Send real-time heartbeat to prove player is active and online
 */
export async function sendPlayerHeartbeat(gameId: string, playerUid: string): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
    const pRef = doc(db, 'games', gameId, 'players', playerUid);
    await updateDoc(pRef, { lastSeen: nowIso, connected: true });
    const gRef = doc(db, 'games', gameId);
    await updateDoc(gRef, { updatedAt: nowIso });
  } catch {
    // ignore silent network blip
  }
}

/**
 * Legacy table seeder (retained safely)
 */
export async function seedTablesIfEmpty(): Promise<void> {
  if (!auth.currentUser) return;
  try {
    for (const t of INITIAL_TABLES) {
      const tableRef = doc(db, 'gameTables', t.tableId);
      const snap = await getDoc(tableRef);
      if (!snap.exists()) {
        const tableData: TableConfig = {
          ...t,
          currentPlayers: 0,
          status: 'open',
          createdAt: new Date().toISOString(),
        };
        await setDoc(tableRef, tableData);
      }
    }
  } catch (err) {
    console.warn('Note on tables:', err);
  }
}

/**
 * Join or create a match for a table with 2-6 players & 15-second countdown
 */
export async function joinTable(tableId: string, profile: UserProfile): Promise<string> {
  const tableRef = doc(db, 'gameTables', tableId);
  const walletRef = doc(db, 'wallets', profile.uid);

  const joinedGameId = await runTransaction(db, async (tx) => {
    // 1. ALL READS FIRST
    const tableSnap = await tx.get(tableRef);
    if (!tableSnap.exists()) {
      throw new Error('Table does not exist.');
    }

    const tableData = tableSnap.data() as TableConfig;
    let gameId = tableData.activeGameId;

    let gameDocRef = gameId ? doc(db, 'games', gameId) : null;
    let gameData: GameState | null = null;

    if (gameDocRef) {
      const gSnap = await tx.get(gameDocRef);
      if (gSnap.exists()) {
        gameData = gSnap.data() as GameState;
      }
    }

    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists()) {
      throw new Error('Wallet not found. Please refresh.');
    }
    const wallet = walletSnap.data() as UserWallet;

    // Check if player has sufficient balance for this table's entry fee
    const playable = (wallet.depositBalance || 0) + (wallet.winBalance || 0) + (wallet.bonusBalance || 0);
    if (playable < tableData.entryFee) {
      throw new Error(`Insufficient playable balance (₹${playable}). Required entry fee is ₹${tableData.entryFee}.`);
    }

    let playerDocRef = gameId ? doc(db, 'games', gameId, 'players', profile.uid) : null;
    let existingPlayerSnap = playerDocRef ? await tx.get(playerDocRef) : null;

    // Calculate wallet deduction breakdown (deposit first, then bonus credits if deposit is zero/insufficient, then win balance)
    const depositDeduct = Math.min(wallet.depositBalance || 0, tableData.entryFee);
    const remainingAfterDeposit = tableData.entryFee - depositDeduct;
    const bonusDeduct = Math.min(wallet.bonusBalance || 0, remainingAfterDeposit);
    const winDeduct = remainingAfterDeposit - bonusDeduct;

    // 2. ALL WRITES AFTER
    // If no active game, previous game is finished, or player was dropped from an active commenced match, create a fresh game session
    const isPlayerDroppedFromTable = existingPlayerSnap && existingPlayerSnap.exists() && (existingPlayerSnap.data() as GamePlayerState).status === 'dropped';
    const isTableGameInactive = !gameId || !gameData || gameData.status === 'COMPLETED' || gameData.status === 'RESULT';

    if (isTableGameInactive || (isPlayerDroppedFromTable && (gameData?.status === 'PLAYING' || gameData?.status === 'TOSS' || gameData?.status === 'DEAL' || gameData?.status === 'DECLARE'))) {
      gameId = `game_${tableId}_${Date.now()}`;
      gameDocRef = doc(db, 'games', gameId);

      gameData = {
        gameId,
        tableId,
        mode: tableData.gameMode,
        pointValue: tableData.pointValue,
        entryFee: tableData.entryFee,
        playerCount: 1,
        playerUids: [profile.uid],
        status: 'WAITING',
        phase: 'WAITING',
        waitingEndsAt: new Date(Date.now() + 10000).toISOString(),
        openDeck: [],
        closedDeckCount: 108,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      tx.set(gameDocRef, gameData);

      // Create first player
      const pDocRef = doc(db, 'games', gameId, 'players', profile.uid);
      const newPlayer: GamePlayerState = {
        uid: profile.uid,
        playerId: profile.playerId,
        displayName: profile.displayName,
        photoURL: profile.photoURL || '',
        seatIndex: 0,
        status: 'waiting',
        cardCount: 0,
        score: 0,
        connected: true,
        entryPaid: tableData.entryFee,
        deductionBreakdown: {
          depositDeduct,
          bonusDeduct,
          winDeduct,
          total: tableData.entryFee,
        },
        joinedAt: new Date().toISOString(),
      };
      tx.set(pDocRef, newPlayer);

      tx.update(tableRef, {
        activeGameId: gameId,
        currentPlayers: 1,
        status: 'open',
      });

      // Deduct wallet
      tx.update(walletRef, {
        depositBalance: Math.max(0, (wallet.depositBalance || 0) - depositDeduct),
        bonusBalance: Math.max(0, (wallet.bonusBalance || 0) - bonusDeduct),
        winBalance: Math.max(0, (wallet.winBalance || 0) - winDeduct),
        updatedAt: new Date().toISOString(),
      });

      return gameId as string;
    }

    // Existing active game session: check if user is already seated
    if (existingPlayerSnap && existingPlayerSnap.exists()) {
      const pData = existingPlayerSnap.data() as GamePlayerState;
      if (pData.status !== 'dropped' && pData.status !== 'eliminated') {
        // Re-joining already seated active game
        return gameId as string;
      }
    }

    // Check maximum players
    if (tableData.currentPlayers >= tableData.maxPlayers) {
      throw new Error('This table is already full (maximum capacity reached).');
    }

    if (!gameData || !gameId) {
      throw new Error('Game session not found.');
    }

    // Check if room is already locked and playing
    if (gameData.status === 'PLAYING' || gameData.status === 'TOSS' || gameData.status === 'DEAL') {
      throw new Error('This match has already commenced. Please join the next open table.');
    }

    const newPlayerCount = tableData.currentPlayers + 1;
    const seatIndex = tableData.currentPlayers;

    const pDocRef = doc(db, 'games', gameId, 'players', profile.uid);
    const newPlayer: GamePlayerState = {
      uid: profile.uid,
      playerId: profile.playerId,
      displayName: profile.displayName,
      photoURL: profile.photoURL || '',
      seatIndex,
      status: 'waiting',
      cardCount: 0,
      score: 0,
      connected: true,
      entryPaid: tableData.entryFee,
      deductionBreakdown: {
        depositDeduct,
        bonusDeduct,
        winDeduct,
        total: tableData.entryFee,
      },
      joinedAt: new Date().toISOString(),
    };
    tx.set(pDocRef, newPlayer);

    const updatePayload: Record<string, unknown> = {
      currentPlayers: newPlayerCount,
    };

    const existingUids = Array.isArray(gameData.playerUids) ? gameData.playerUids : [];
    const gameUpdatePayload: Record<string, unknown> = {
      playerCount: newPlayerCount,
      playerUids: Array.from(new Set([...existingUids, profile.uid])),
      updatedAt: new Date().toISOString(),
    };

    // Countdown must begin at exactly 15s on 2nd player and restart to 15s on each additional player joining during open countdown
    if (newPlayerCount >= 2 && (gameData.status === 'WAITING' || gameData.status === 'COUNTDOWN')) {
      const now = Date.now();
      const countdownEndsAt = new Date(now + 15000).toISOString();
      updatePayload.status = 'countdown';
      updatePayload.countdownStartedAt = new Date(now).toISOString();
      updatePayload.countdownEndsAt = countdownEndsAt;

      gameUpdatePayload.status = 'COUNTDOWN';
      gameUpdatePayload.phase = 'COUNTDOWN';
      gameUpdatePayload.countdownEndsAt = countdownEndsAt;
    }

    // If max players reached, lock room to prevent 7th player
    if (newPlayerCount >= tableData.maxPlayers) {
      updatePayload.status = 'playing';
    }

    tx.update(tableRef, updatePayload);
    tx.update(doc(db, 'games', gameId), gameUpdatePayload);

    // Deduct wallet
    tx.update(walletRef, {
      depositBalance: Math.max(0, (wallet.depositBalance || 0) - depositDeduct),
      bonusBalance: Math.max(0, (wallet.bonusBalance || 0) - bonusDeduct),
      winBalance: Math.max(0, (wallet.winBalance || 0) - winDeduct),
      updatedAt: new Date().toISOString(),
    });

    return gameId as string;
  });

  await setActiveGameSession(profile.uid, joinedGameId);
  return joinedGameId;
}

/**
 * Enqueue player for matchmaking with duplicate-queue prevention & atomic table matching
 */
export async function enqueuePlayer(tableId: string, profile: UserProfile): Promise<MatchmakingTicket> {
  const tableRef = doc(db, 'gameTables', tableId);
  const tableSnap = await getDoc(tableRef);
  if (!tableSnap.exists()) {
    throw new Error('Table does not exist.');
  }
  const tableData = tableSnap.data() as TableConfig;

  // 1. Prevent duplicate queue tickets for this user
  const queueCol = collection(db, 'matchmakingQueue');
  const existingQueueQuery = query(
    queueCol,
    where('uid', '==', profile.uid),
    where('status', '==', 'QUEUED')
  );
  const existingQueueSnap = await getDocs(existingQueueQuery);

  if (!existingQueueSnap.empty) {
    const existingTicket = existingQueueSnap.docs[0].data() as MatchmakingTicket;
    if (existingTicket.tableId === tableId) {
      return existingTicket;
    } else {
      await updateDoc(doc(db, 'matchmakingQueue', existingTicket.ticketId), {
        status: 'CANCELLED',
        updatedAt: new Date().toISOString(),
      });
    }
  }

  // 2. Create the ticket atomically
  const ticketId = `ticket_${profile.uid}_${Date.now()}`;
  const ticketRef = doc(db, 'matchmakingQueue', ticketId);
  const newTicket: MatchmakingTicket = {
    ticketId,
    uid: profile.uid,
    playerId: profile.playerId,
    displayName: profile.displayName,
    photoURL: profile.photoURL || '',
    tableId,
    gameMode: tableData.gameMode,
    entryFee: tableData.entryFee,
    pointValue: tableData.pointValue,
    maxPlayers: tableData.maxPlayers,
    status: 'QUEUED',
    gameId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await setDoc(ticketRef, newTicket);

  // 3. Atomically match into room / table
  try {
    const gameId = await joinTable(tableId, profile);
    await updateDoc(ticketRef, {
      status: 'MATCHED',
      gameId,
      updatedAt: new Date().toISOString(),
    });
    newTicket.status = 'MATCHED';
    newTicket.gameId = gameId;
  } catch (err) {
    await updateDoc(ticketRef, {
      status: 'CANCELLED',
      updatedAt: new Date().toISOString(),
    });
    throw err;
  }

  return newTicket;
}

/**
 * Cancel queue ticket atomically
 */
export async function cancelMatchmakingQueue(ticketId: string, uid: string): Promise<void> {
  const ticketRef = doc(db, 'matchmakingQueue', ticketId);
  const snap = await getDoc(ticketRef);
  if (snap.exists() && snap.data().uid === uid) {
    await updateDoc(ticketRef, {
      status: 'CANCELLED',
      updatedAt: new Date().toISOString(),
    });
  }
}

/**
 * Trusted atomic seat release & countdown cancellation when player leaves table
 */
export async function leaveTable(
  gameId: string,
  tableId: string,
  uid: string
): Promise<{ refunded: boolean; refundAmount: number }> {
  const gameRef = doc(db, 'games', gameId);
  const tableRef = doc(db, 'gameTables', tableId);
  const playerRef = doc(db, 'games', gameId, 'players', uid);
  const walletRef = doc(db, 'wallets', uid);

  let refundAmount = 0;
  let depositRefund = 0;
  let winRefund = 0;

  await runTransaction(db, async (tx) => {
    // 1. ALL READS FIRST
    const gameSnap = await tx.get(gameRef);
    const tableSnap = await tx.get(tableRef);
    const playerSnap = await tx.get(playerRef);
    const walletSnap = await tx.get(walletRef);

    if (!gameSnap.exists() || !playerSnap.exists()) {
      return;
    }

    const gameData = gameSnap.data() as GameState;
    const tableData = tableSnap.exists() ? (tableSnap.data() as TableConfig) : null;
    const playerData = playerSnap.data() as GamePlayerState;

    // If game has already commenced, player drop should be handled by dropGame
    if (gameData.status === 'PLAYING') {
      return;
    }

    // Determine refund breakdown if exiting in WAITING or COUNTDOWN
    const breakdown = playerData.deductionBreakdown;
    if (breakdown) {
      depositRefund = breakdown.depositDeduct || 0;
      winRefund = breakdown.winDeduct || 0;
      refundAmount = breakdown.total || (depositRefund + winRefund);
    } else {
      refundAmount = playerData.entryPaid || gameData.entryFee || 0;
      depositRefund = refundAmount;
    }

    // 2. ALL WRITES AFTER
    // WAITING or COUNTDOWN: Release seat atomically
    tx.delete(playerRef);

    const newGameCount = Math.max(0, (gameData.playerCount || 1) - 1);
    const newTableCount = tableData ? Math.max(0, (tableData.currentPlayers || 1) - 1) : 0;

    const gameUpdates: Record<string, unknown> = {
      playerCount: newGameCount,
      playerUids: (gameData.playerUids || []).filter((id) => id !== uid),
      updatedAt: new Date().toISOString(),
    };

    const tableUpdates: Record<string, unknown> = {
      currentPlayers: newTableCount,
    };

    // If active players drop below 2, CANCEL 15-second countdown!
    if (newGameCount < 2) {
      if (gameData.status === 'COUNTDOWN') {
        gameUpdates.status = 'WAITING';
        gameUpdates.phase = 'WAITING';
        gameUpdates.countdownEndsAt = null;
      }
      if (tableData && tableData.status === 'countdown') {
        tableUpdates.status = 'open';
        tableUpdates.countdownEndsAt = null;
        tableUpdates.countdownStartedAt = null;
      }
    }

    // If all players left, reset table
    if (newGameCount <= 0) {
      gameUpdates.status = 'COMPLETED';
      gameUpdates.phase = 'COMPLETED';
      if (tableData) {
        tableUpdates.status = 'open';
        tableUpdates.activeGameId = null;
        tableUpdates.currentPlayers = 0;
      }
    } else if (newTableCount < (tableData?.maxPlayers || 6)) {
      if (tableData?.status === 'playing' && gameData.status === 'WAITING') {
        tableUpdates.status = 'open';
      }
    }

    tx.update(gameRef, gameUpdates);
    if (tableSnap.exists()) {
      tx.update(tableRef, tableUpdates);
    }

    // Restore wallet balance on exit during waiting/countdown
    if (refundAmount > 0 && walletSnap.exists()) {
      const wData = walletSnap.data() as UserWallet;
      tx.update(walletRef, {
        depositBalance: (wData.depositBalance || 0) + depositRefund,
        winBalance: (wData.winBalance || 0) + winRefund,
        updatedAt: new Date().toISOString(),
      });
    }
  });

  if (refundAmount > 0) {
    const txRef = doc(collection(db, 'transactions'));
    await setDoc(txRef, {
      id: txRef.id,
      uid,
      type: 'refund',
      amount: refundAmount,
      status: 'completed',
      description: `Waiting time table exit refund (₹${refundAmount})`,
      referenceId: gameId,
      createdAt: new Date().toISOString(),
    });
  }

  await clearActiveGameSession(uid, gameId);
  return { refunded: refundAmount > 0, refundAmount };
}

/**
 * Starts match by running Toss -> Dealing 13 cards -> Setting Wild Joker & First Turn
 */
export async function startMatch(gameId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  const playersRef = collection(db, 'games', gameId, 'players');

  const playersSnap = await getDocs(playersRef);
  const playersList = playersSnap.docs.map((d) => d.data() as GamePlayerState);
  playersList.sort((a, b) => (a.seatIndex || 0) - (b.seatIndex || 0));

  if (playersList.length < 2) {
    return; // Need at least 2 players
  }

  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef);
    if (!gameSnap.exists()) return;
    const gameData = gameSnap.data() as GameState;

    if (gameData.status === 'PLAYING' || gameData.status === 'TOSS') {
      return; // Already started
    }

    // 1. Toss phase: Deal 1 card to each player to determine Dealer
    // Ranking: A > K > Q > J > 10 > ... > 2
    let deck = shuffleDeck(create108Deck());

    // Give each player a non-joker toss card
    let highestVal = -1;
    let dealerUid = playersList[0].uid;

    for (const player of playersList) {
      // Find a toss card that is not a joker
      let tossCard = deck.pop()!;
      while (tossCard.isPrintedJoker || tossCard.rank === 'JOKER') {
        tossCard = deck.pop()!;
      }
      const val = TOSS_RANK_VALUE[tossCard.rank] || 0;
      if (val > highestVal) {
        highestVal = val;
        dealerUid = player.uid;
      }
      const pRef = doc(db, 'games', gameId, 'players', player.uid);
      tx.update(pRef, { tossCard });
    }

    // 2. Select Wild Joker (random card from deck)
    let wildJokerCard = deck.pop()!;
    while (wildJokerCard.isPrintedJoker || wildJokerCard.rank === 'JOKER') {
      wildJokerCard = deck.pop()!;
    }
    const wildJokerRank = wildJokerCard.rank;

    // 3. Deal 13 cards to each seated player
    for (const player of playersList) {
      const hand: Card[] = [];
      for (let i = 0; i < 13; i++) {
        hand.push(deck.pop()!);
      }
      const pRef = doc(db, 'games', gameId, 'players', player.uid);
      tx.update(pRef, {
        cards: hand,
        cardCount: 13,
        status: 'playing',
        isDealer: player.uid === dealerUid,
      });
    }

    // 4. Open first card for discard pile
    let openCard = deck.pop()!;
    while (openCard.isPrintedJoker || openCard.rank === 'JOKER') {
      openCard = deck.pop()!;
    }

    // Find who starts: Player immediately to the left (clockwise) of dealer
    const dealerIndex = playersList.findIndex((p) => p.uid === dealerUid);
    const startingPlayerIndex = (dealerIndex + 1) % playersList.length;
    const startingPlayerUid = playersList[startingPlayerIndex].uid;

    const turnStartedAt = Date.now();
    // Rule #45: 60s base timer + 5s extension + 5s extension
    const turnDeadline = turnStartedAt + 60000;

    tx.update(gameRef, {
      status: 'PLAYING',
      phase: 'PLAYING',
      dealerUid,
      wildJoker: wildJokerCard,
      openDeck: [openCard],
      closedDeckCount: deck.length,
      playerUids: playersList.map((p) => p.uid),
      playerCount: playersList.length,
      turnUid: startingPlayerUid,
      turnStartedAt,
      turnDeadline,
      turnExtensionCount: 0,
      hasDrawn: false,
      updatedAt: new Date().toISOString(),
    });

    // Store remaining deck privately inside game's secret deck doc
    const secretDeckRef = doc(db, 'games', gameId, 'internal', 'deck');
    tx.set(secretDeckRef, { closedDeck: deck });
  });
}

/**
 * Draw a card: from either Open Deck or Closed Deck
 */
export async function drawCard(gameId: string, playerUid: string, source: 'open' | 'closed'): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  const playerRef = doc(db, 'games', gameId, 'players', playerUid);
  const secretDeckRef = doc(db, 'games', gameId, 'internal', 'deck');

  await runTransaction(db, async (tx) => {
    // 1. ALL READS FIRST
    const gameSnap = await tx.get(gameRef);
    if (!gameSnap.exists()) throw new Error('Game not found.');
    const gameData = gameSnap.data() as GameState;

    if (gameData.status !== 'PLAYING') throw new Error('Game is not active.');
    if (gameData.turnUid !== playerUid) throw new Error("It is not your turn to draw.");
    if (gameData.hasDrawn) throw new Error('You have already drawn a card for this turn.');

    const playerSnap = await tx.get(playerRef);
    if (!playerSnap.exists()) throw new Error('Player not found.');
    const playerData = playerSnap.data() as GamePlayerState;

    const deckSnap = source === 'closed' ? await tx.get(secretDeckRef) : null;

    // 2. ALL WRITES AFTER
    let drawnCard: Card | null = null;

    if (source === 'open') {
      if (!gameData.openDeck || gameData.openDeck.length === 0) throw new Error('Open discard pile is empty.');
      const newOpenDeck = [...gameData.openDeck];
      drawnCard = newOpenDeck.pop() || null;
      if (!drawnCard) throw new Error('Could not draw from discard pile.');

      tx.update(gameRef, {
        openDeck: newOpenDeck,
        hasDrawn: true,
        updatedAt: new Date().toISOString(),
      });
    } else {
      let closedDeck: Card[] = [];
      if (deckSnap && deckSnap.exists()) {
        const deckData = deckSnap.data() as { closedDeck: Card[] };
        closedDeck = [...(deckData.closedDeck || [])];
      }

      if (closedDeck.length === 0) {
        // Reshuffle open deck if available or generate fresh shuffled deck
        if (gameData.openDeck && gameData.openDeck.length > 1) {
          closedDeck = shuffleDeck([...gameData.openDeck.slice(0, -1)]);
        } else {
          closedDeck = shuffleDeck(create108Deck());
        }
      }

      drawnCard = closedDeck.pop() || null;
      if (!drawnCard) {
        // Fallback safety card
        drawnCard = shuffleDeck(create108Deck()).pop()!;
      }

      tx.set(secretDeckRef, { closedDeck }, { merge: true });
      tx.update(gameRef, {
        closedDeckCount: closedDeck.length,
        hasDrawn: true,
        updatedAt: new Date().toISOString(),
      });
    }

    const currentHand = playerData.cards || [];
    const updatedHand = [...currentHand, drawnCard];

    tx.update(playerRef, {
      cards: updatedHand,
      cardCount: updatedHand.length,
      missedTurns: 0,
    });
  });
}

/**
 * Discard a card to end turn
 */
export async function discardCard(gameId: string, playerUid: string, cardToDiscard: Card): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  const playerRef = doc(db, 'games', gameId, 'players', playerUid);
  const playersRef = collection(db, 'games', gameId, 'players');

  // Discover all seated players beforehand outside transaction for speed and transaction isolation
  const pSnapAll = await getDocs(playersRef);
  const discoveredUids = pSnapAll.docs.map((d) => d.id);
  const cachedPlayers = pSnapAll.docs.map((d) => d.data() as GamePlayerState);

  await runTransaction(db, async (tx) => {
    // 1. ALL READS FIRST
    const gameSnap = await tx.get(gameRef);
    if (!gameSnap.exists()) throw new Error('Game not found.');
    const gameData = gameSnap.data() as GameState;

    if (gameData.status !== 'PLAYING') throw new Error('Game is not in playing state.');
    if (gameData.turnUid !== playerUid) throw new Error("It is not your turn to discard.");

    const playerSnap = await tx.get(playerRef);
    if (!playerSnap.exists()) throw new Error('Player not found.');
    const playerData = playerSnap.data() as GamePlayerState;

    const currentHand = playerData.cards || [];
    const hasPlayerDrawn = Boolean(gameData.hasDrawn) || currentHand.length >= 14;
    if (!hasPlayerDrawn) throw new Error('You must draw a card before discarding.');

    // Read ALL active player docs inside the transaction for consistency
    const allPlayerUids = Array.from(new Set([
      ...(gameData.playerUids || []),
      ...discoveredUids,
      playerUid,
    ]));

    let playerSnaps = await Promise.all(
      allPlayerUids.map((pUid) => tx.get(doc(db, 'games', gameId, 'players', pUid)))
    );
    let playerDocs: GamePlayerState[] = playerSnaps
      .filter((s) => s.exists())
      .map((s) => s.data() as GamePlayerState);

    if (playerDocs.length === 0) {
      playerDocs = cachedPlayers;
    }

    let cardIdx = currentHand.findIndex((c) => c.id === cardToDiscard.id);
    if (cardIdx === -1) {
      cardIdx = currentHand.findIndex((c) => c.suit === cardToDiscard.suit && c.rank === cardToDiscard.rank);
    }
    if (cardIdx === -1) cardIdx = currentHand.length - 1; // Graceful fallback

    const updatedHand = [...currentHand];
    const discardedCards = updatedHand.splice(cardIdx, 1);
    const discarded = discardedCards[0] || cardToDiscard;

    // Determine next player: ALWAYS pass turn to another active player!
    const otherActivePlayers = playerDocs
      .filter((p) => p.uid !== playerUid && p.status === 'playing' && !gameData.droppedUids?.includes(p.uid))
      .sort((a, b) => (a.seatIndex || 0) - (b.seatIndex || 0));

    const updatedOpenDeck = [...(gameData.openDeck || []), discarded];

    // If no other active players remain (all opponents dropped), playerUid wins immediately!
    if (otherActivePlayers.length === 0) {
      const entryFee = gameData.entryFee || 20;
      const scores: Record<string, number> = {};
      const penalties: Record<string, string> = {};
      const payouts: Record<string, number> = {};
      let totalGrossPot = 0;
      let totalPointsLost = 0;

      for (const p of playerDocs) {
        if (p.uid === playerUid) {
          penalties[p.uid] = 'Winner';
        } else {
          const pLoss = p.score || 20;
          const pLossRupees = p.dropPenaltyRupees || (pLoss === 20 ? Math.round(entryFee * 0.25 * 100) / 100 : Math.round(entryFee * 0.50 * 100) / 100);
          scores[p.uid] = pLoss;
          penalties[p.uid] = `Dropped (${pLoss} pts, -₹${pLossRupees})`;
          totalGrossPot += pLossRupees;
          totalPointsLost += pLoss;
        }
      }
      scores[playerUid] = totalPointsLost;

      const feePercent = 14;
      const platformFee = Math.round(totalGrossPot * (feePercent / 100) * 100) / 100;
      const playerNetShare = Math.round((totalGrossPot - platformFee) * 100) / 100;
      payouts[playerUid] = playerNetShare;
      const winnerBuyInRefund = playerData.entryPaid || entryFee;

      tx.update(playerRef, {
        cards: updatedHand,
        cardCount: updatedHand.length,
        turnsCount: (playerData.turnsCount || 0) + 1,
        missedTurns: 0,
      });

      tx.update(gameRef, {
        openDeck: updatedOpenDeck,
        status: 'RESULT',
        phase: 'RESULT',
        winnerUid: playerUid,
        resultData: {
          winnerUid: playerUid,
          scores,
          penalties,
          grossWin: totalGrossPot,
          platformFee,
          feePercent,
          adminShare: platformFee,
          playerNetShare,
          payouts,
          winnerBuyInRefund,
          settlementStatus: 'completed',
          completedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    const currentSeat = playerData.seatIndex || 0;
    const nextClockwise = otherActivePlayers.find((p) => (p.seatIndex || 0) > currentSeat);
    const nextPlayerUid = nextClockwise ? nextClockwise.uid : otherActivePlayers[0].uid;

    const now = Date.now();
    const nextDeadline = now + 60000; // 60s base turn timer

    // 2. ALL WRITES AFTER
    tx.update(playerRef, {
      cards: updatedHand,
      cardCount: updatedHand.length,
      turnsCount: (playerData.turnsCount || 0) + 1,
      missedTurns: 0,
    });

    tx.update(gameRef, {
      openDeck: updatedOpenDeck,
      turnUid: nextPlayerUid,
      turnStartedAt: now,
      turnDeadline: nextDeadline,
      turnExtensionCount: 0,
      hasDrawn: false,
      updatedAt: new Date().toISOString(),
    });
  });
}

/**
 * Create and start an instant practice match against a bot AI opponent
 */
export async function createPracticeMatch(
  profile: UserProfile,
  mode: GameMode = 'points',
  maxPlayers: number = 2
): Promise<string> {
  const userUid = auth.currentUser?.uid || profile.uid;
  const gameId = `practice_${mode}_${maxPlayers}p_${Date.now()}`;
  const gameRef = doc(db, 'games', gameId);

  const newGame: GameState = {
    gameId,
    tableId: `table_practice_${mode}_${maxPlayers}p_${Date.now()}`,
    mode,
    pointValue: 1,
    entryFee: 0,
    maxPlayers,
    playerCount: 1,
    playerUids: [userUid],
    status: 'WAITING',
    phase: 'WAITING',
    waitingEndsAt: new Date(Date.now() + 5000).toISOString(),
    openDeck: [],
    closedDeckCount: 108,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  (newGame as any).isPractice = true;
  await setDoc(gameRef, newGame);

  await startPracticeBotMatch(gameId, userUid, profile);
  return gameId;
}

/**
 * Strict Zero-Bot Cash Policy Validator:
 * Real cash games MUST be 100% human players with ZERO bots.
 * AI bot opponents and automatic bot matchmaking are strictly restricted
 * to zero-fee practice tables (isPractice === true or mode === 'practice', entryFee === 0).
 */
export function canInjectBotIntoGame(
  game: Partial<GameState> | null | undefined
): boolean {
  if (!game) return false;
  const isPractice = Boolean(
    (game as any).isPractice === true || game.mode === ('practice' as any)
  );
  const entryFee = Number(game.entryFee ?? 0);
  const hasEntryFee = !isNaN(entryFee) && entryFee > 0;
  return isPractice && !hasEntryFee;
}

/**
 * Start instant practice match against a bot AI opponent
 */
export async function startPracticeBotMatch(
  gameIdOrProfile: string | UserProfile,
  userUid?: string,
  profile?: UserProfile | null
): Promise<string | void> {
  if (typeof gameIdOrProfile === 'object' && gameIdOrProfile !== null) {
    return await createPracticeMatch(gameIdOrProfile);
  }
  const gameId = gameIdOrProfile;
  if (!userUid) return;

  const gameRef = doc(db, 'games', gameId);
  const gameSnap = await getDoc(gameRef);
  if (gameSnap.exists()) {
    const gData = gameSnap.data() as GameState;
    // Strict zero-bot cash policy
    if (!canInjectBotIntoGame(gData)) {
      console.warn(`[Zero-Bot Cash Policy] Blocked startPracticeBotMatch on cash table ${gameId}`);
      return;
    }
  }

  const botUid = `bot_${Date.now()}`;
  const botPlayerRef = doc(db, 'games', gameId, 'players', botUid);
  const userPlayerRef = doc(db, 'games', gameId, 'players', userUid);

  const botNames = ['Karan_Pro', 'Rahul_Ace', 'Vikram_Rummy', 'Priya_Master', 'Aman_Champ'];
  const botName = botNames[Math.floor(Math.random() * botNames.length)];

  // Ensure user player doc exists
  const userPlayerSnap = await getDoc(userPlayerRef);
  if (!userPlayerSnap.exists()) {
    const newUserPlayer: GamePlayerState = {
      uid: userUid,
      playerId: profile?.playerId || 'PLAYER-1',
      displayName: profile?.displayName || 'Royal Player',
      photoURL: profile?.photoURL || '',
      seatIndex: 0,
      status: 'waiting',
      cardCount: 0,
      score: 0,
      connected: true,
      entryPaid: 0,
      joinedAt: new Date().toISOString(),
    };
    await setDoc(userPlayerRef, newUserPlayer);
  }

  const botPlayer: GamePlayerState = {
    uid: botUid,
    playerId: `BOT-${Math.floor(1000 + Math.random() * 9000)}`,
    displayName: `${botName} (AI)`,
    photoURL: '',
    seatIndex: 1,
    status: 'waiting',
    cardCount: 0,
    score: 0,
    connected: true,
    entryPaid: 0,
    isBot: true,
    joinedAt: new Date().toISOString(),
  };

  await setDoc(botPlayerRef, botPlayer);

  await updateDoc(gameRef, {
    playerCount: 2,
    playerUids: [userUid, botUid],
    status: 'COUNTDOWN',
    phase: 'COUNTDOWN',
    countdownEndsAt: new Date(Date.now() + 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Deal and commence cards
  setTimeout(async () => {
    try {
      await startMatch(gameId);
    } catch (e) {
      console.warn('Practice match start:', e);
    }
  }, 1200);
}

/**
 * Auto-matches a waiting table with realistic AI opponent(s) when waiting timeout expires
 * "ek waiting time rakho usme agar players nhi aye to matchmaking ho jayega timer chalega or game start"
 */
export async function autoMatchWithBots(gameId: string, currentUserUid: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  const playersRef = collection(db, 'games', gameId, 'players');

  const pSnap = await getDocs(playersRef);
  const existingPlayers = pSnap.docs.map((d) => d.data() as GamePlayerState);

  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef);
    if (!gameSnap.exists()) return;
    const gData = gameSnap.data() as GameState;

    // Only auto-match if table is still in WAITING phase
    if (gData.status !== 'WAITING') return;

    // CRITICAL: Cash games must NEVER have bots injected! Strict zero-fake-player policy.
    if (!canInjectBotIntoGame(gData)) {
      console.warn(`[Zero-Bot Cash Policy] Blocked autoMatchWithBots on cash table ${gameId} (entryFee: ₹${gData.entryFee})`);
      return;
    }

    // If already has 2 or more players, transition straight to COUNTDOWN
    if (existingPlayers.length >= 2) {
      tx.update(gameRef, {
        status: 'COUNTDOWN',
        phase: 'COUNTDOWN',
        countdownEndsAt: new Date(Date.now() + 5000).toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    // Add realistic AI bot opponent
    const botNames = ['Karan_Pro', 'Rahul_Ace', 'Vikram_Rummy', 'Priya_Master', 'Aman_Champ', 'Suresh_K', 'Deepak_07', 'Neha_Sharma', 'Arjun_King'];
    const botName = botNames[Math.floor(Math.random() * botNames.length)];
    const botUid = `bot_${Date.now()}`;
    const botRef = doc(db, 'games', gameId, 'players', botUid);

    const botPlayer: GamePlayerState = {
      uid: botUid,
      playerId: `RA-${Math.floor(100000 + Math.random() * 900000)}`,
      displayName: botName,
      photoURL: '',
      seatIndex: 1,
      status: 'waiting',
      cardCount: 0,
      score: 0,
      connected: true,
      entryPaid: 0,
      isBot: true,
      joinedAt: new Date().toISOString(),
    };
    tx.set(botRef, botPlayer);

    const existingUids = Array.isArray(gData.playerUids) ? gData.playerUids : [currentUserUid];
    const allUids = Array.from(new Set([...existingUids, botUid]));

    const countdownEndsAt = new Date(Date.now() + 5000).toISOString();
    tx.update(gameRef, {
      playerCount: allUids.length,
      playerUids: allUids,
      status: 'COUNTDOWN',
      phase: 'COUNTDOWN',
      countdownEndsAt,
      updatedAt: new Date().toISOString(),
    });
  });
}

/**
 * Automated turn for Practice Bot
 */
export async function playBotTurn(gameId: string, botUid: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  const botRef = doc(db, 'games', gameId, 'players', botUid);
  const secretDeckRef = doc(db, 'games', gameId, 'internal', 'deck');

  await runTransaction(db, async (tx) => {
    // 1. ALL READS FIRST
    const gameSnap = await tx.get(gameRef);
    if (!gameSnap.exists()) return;
    const gameData = gameSnap.data() as GameState;

    if (gameData.status !== 'PLAYING' || gameData.turnUid !== botUid) return;

    const botSnap = await tx.get(botRef);
    if (!botSnap.exists()) return;
    const botData = botSnap.data() as GamePlayerState;

    const deckSnap = await tx.get(secretDeckRef);

    // Read other players to determine next player after bot
    const allPlayerUids = Array.from(new Set([
      ...(gameData.playerUids || []),
      botUid,
    ]));

    const otherUids = allPlayerUids.filter((id) => id !== botUid);
    const playerSnaps = await Promise.all(
      otherUids.map((pUid) => tx.get(doc(db, 'games', gameId, 'players', pUid)))
    );
    const playerDocs: GamePlayerState[] = [
      botData,
      ...playerSnaps.filter((s) => s.exists()).map((s) => s.data() as GamePlayerState),
    ];

    // 2. BOT DRAWS CARD
    let closedDeck: Card[] = [];
    if (deckSnap && deckSnap.exists()) {
      const deckData = deckSnap.data() as { closedDeck: Card[] };
      closedDeck = [...(deckData.closedDeck || [])];
    }
    if (closedDeck.length === 0) {
      closedDeck = shuffleDeck(create108Deck());
    }

    let newOpenDeck = [...(gameData.openDeck || [])];
    let drawnCard: Card;
    if (newOpenDeck.length > 0 && Math.random() < 0.2) {
      drawnCard = newOpenDeck.pop()!;
    } else {
      drawnCard = closedDeck.pop() || shuffleDeck(create108Deck()).pop()!;
    }

    // Bot Hand
    let botHand = [...(botData.cards || [])];
    if (botHand.length === 0) {
      for (let i = 0; i < 13; i++) {
        botHand.push(closedDeck.pop() || shuffleDeck(create108Deck()).pop()!);
      }
    }
    botHand.push(drawnCard);

    // 3. BOT DISCARDS CARD
    const wildJokerRank = gameData.wildJoker?.rank;
    const nonJokers = botHand.filter(
      (c) => !c.isPrintedJoker && c.rank !== 'JOKER' && c.rank !== wildJokerRank
    );
    const cardToDiscard = nonJokers.length > 0
      ? nonJokers[Math.floor(Math.random() * nonJokers.length)]
      : botHand[0];

    const discardIdx = botHand.findIndex((c) => c.id === cardToDiscard.id);
    if (discardIdx >= 0) {
      botHand.splice(discardIdx, 1);
    } else {
      botHand.pop();
    }
    newOpenDeck.push(cardToDiscard);

    // 4. NEXT PLAYER
    const otherActivePlayers = playerDocs
      .filter((p) => p.uid !== botUid && (p.status === 'playing' || p.status === 'waiting' || !p.status))
      .sort((a, b) => (a.seatIndex || 0) - (b.seatIndex || 0));

    let nextPlayerUid = botUid;
    if (otherActivePlayers.length > 0) {
      const botSeat = botData.seatIndex || 0;
      const nextClockwise = otherActivePlayers.find((p) => (p.seatIndex || 0) > botSeat);
      nextPlayerUid = nextClockwise ? nextClockwise.uid : otherActivePlayers[0].uid;
    }

    const now = Date.now();

    // 5. ATOMIC WRITES
    tx.set(secretDeckRef, { closedDeck }, { merge: true });
    tx.update(botRef, {
      cards: botHand,
      cardCount: botHand.length,
      status: 'playing',
    });
    tx.update(gameRef, {
      openDeck: newOpenDeck,
      closedDeckCount: closedDeck.length,
      turnUid: nextPlayerUid,
      turnStartedAt: now,
      turnDeadline: now + 60000,
      turnExtensionCount: 0,
      hasDrawn: false,
      updatedAt: new Date().toISOString(),
    });
  });
}

/**
 * Calculate drop penalty and rupee loss:
 * First Drop (0 turns played & haven't drawn card): 20 points = 25% of entryFee
 * Middle Drop (1+ turns played or already drew card): 40 points = 50% of entryFee
 */
export function calculateDropPenalty(
  entryFee: number,
  pointValue: number,
  turnsCount: number = 0,
  hasDrawnCurrentTurn: boolean = false
): { isFirstDrop: boolean; points: number; penaltyRupees: number } {
  const isFirstDrop = (turnsCount || 0) === 0 && !hasDrawnCurrentTurn;
  const points = isFirstDrop ? 20 : 40;
  const penaltyRupees = isFirstDrop
    ? Math.round((entryFee || 20) * 0.25 * 100) / 100
    : Math.round((entryFee || 20) * 0.50 * 100) / 100;

  return { isFirstDrop, points, penaltyRupees: Math.max(1, penaltyRupees) };
}

/**
 * Automatically deducts 14% platform fee and credits net winning amount directly to winner's wallet.
 * CRITICAL FIX: Also refunds the winner's entry buy-in so winning ALWAYS increases player's wallet balance!
 */
export async function creditWinnerPayout(
  gameId: string,
  gameMode: string,
  winnerUid: string,
  grossWin: number,
  platformFee: number,
  playerNetShare: number,
  entryBuyInRefund: number = 0,
  breakdown?: { depositDeduct: number; bonusDeduct?: number; winDeduct: number; total?: number } | null,
  pointsWon: number = 0
): Promise<void> {
  if (!winnerUid || winnerUid.startsWith('bot_')) return;
  try {
    const winnerWalletRef = doc(db, 'wallets', winnerUid);
    const wSnap = await getDoc(winnerWalletRef);
    if (wSnap.exists()) {
      const wData = wSnap.data() as UserWallet;
      const curWin = wData.winBalance || 0;
      const curRewardPoints = wData.rewardPoints || 0;
      const curDep = wData.depositBalance || 0;
      const curBonus = wData.bonusBalance || 0;

      // Determine buy-in refund amounts to restore entry fee
      let depRefund = 0;
      let bonusRefund = 0;
      let winRefund = 0;
      if (entryBuyInRefund > 0) {
        if (breakdown) {
          depRefund = breakdown.depositDeduct || 0;
          bonusRefund = breakdown.bonusDeduct || 0;
          winRefund = breakdown.winDeduct || 0;
        } else {
          depRefund = entryBuyInRefund;
        }
      }

      await updateDoc(winnerWalletRef, {
        winBalance: curWin + playerNetShare + winRefund,
        depositBalance: curDep + depRefund,
        bonusBalance: curBonus + bonusRefund,
        rewardPoints: curRewardPoints + pointsWon,
        updatedAt: new Date().toISOString(),
      });
    }

    if (playerNetShare > 0) {
      const winTxRef = doc(collection(db, 'transactions'));
      await setDoc(winTxRef, {
        id: winTxRef.id,
        uid: winnerUid,
        type: 'game_win',
        amount: playerNetShare,
        status: 'completed',
        description: `Winnings for ${gameMode.toUpperCase()} match #${gameId.slice(-6)} (+${pointsWon} Pts, Gross: ₹${grossWin}, 14% Platform Fee: -₹${platformFee})`,
        referenceId: gameId,
        createdAt: new Date().toISOString(),
      });
    }

    if (entryBuyInRefund > 0) {
      const refundTxRef = doc(collection(db, 'transactions'));
      await setDoc(refundTxRef, {
        id: refundTxRef.id,
        uid: winnerUid,
        type: 'refund',
        amount: entryBuyInRefund,
        status: 'completed',
        description: `Entry buy-in returned for winning match #${gameId.slice(-6)} (+₹${entryBuyInRefund})`,
        referenceId: gameId,
        createdAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error('Error crediting winner wallet:', err);
  }
}

/**
 * Automatically settles loser loss and refunds any remaining buy-in
 */
export async function settleLoserLoss(
  gameId: string,
  gameMode: string,
  loserUid: string,
  lossPoints: number,
  pointValue: number,
  entryFee: number,
  entryPaid: number = 0,
  breakdown?: { depositDeduct: number; bonusDeduct?: number; winDeduct: number; total?: number } | null
): Promise<number> {
  if (!loserUid || loserUid.startsWith('bot_')) return 0;

  // Exact drop calculation: 20 pts = 25% of entryFee, 40 pts = 50% of entryFee
  let calculatedLoss = 0;
  if (lossPoints === 20 && entryFee > 0) {
    calculatedLoss = Math.round(entryFee * 0.25 * 100) / 100;
  } else if (lossPoints === 40 && entryFee > 0) {
    calculatedLoss = Math.round(entryFee * 0.50 * 100) / 100;
  } else if (lossPoints >= 80 && entryFee > 0) {
    calculatedLoss = entryFee;
  } else {
    const pv = pointValue > 0 ? pointValue : (entryFee > 0 ? entryFee / 80 : 0.25);
    calculatedLoss = Math.min(entryFee > 0 ? entryFee : 80 * pv, Math.round(lossPoints * pv * 100) / 100);
  }

  const finalLossAmount = Math.max(1, calculatedLoss);

  try {
    const playerDocRef = doc(db, 'games', gameId, 'players', loserUid);
    const pSnap = await getDoc(playerDocRef);
    if (pSnap.exists()) {
      const pData = pSnap.data() as GamePlayerState;
      if (pData.isSettled) {
        return finalLossAmount; // Already settled, avoid double refund or penalty
      }
    }

    const loserWalletRef = doc(db, 'wallets', loserUid);
    const wSnap = await getDoc(loserWalletRef);
    if (!wSnap.exists()) return finalLossAmount;
    const wData = wSnap.data() as UserWallet;

    if (entryPaid > 0) {
      // Player paid buy-in up front: refund the difference (e.g. ₹20 buy-in - ₹5 drop = ₹15 refund)
      const refund = Math.max(0, Math.round((entryPaid - finalLossAmount) * 100) / 100);
      if (refund > 0) {
        await updateDoc(loserWalletRef, {
          depositBalance: (wData.depositBalance || 0) + refund,
          updatedAt: new Date().toISOString(),
        });
        const refundTxRef = doc(collection(db, 'transactions'));
        await setDoc(refundTxRef, {
          id: refundTxRef.id,
          uid: loserUid,
          type: 'refund',
          amount: refund,
          status: 'completed',
          description: `Partial loss refund for match #${gameId.slice(-6)} (Saved ₹${refund} from ₹${entryPaid} buy-in, loss: ₹${finalLossAmount})`,
          referenceId: gameId,
          createdAt: new Date().toISOString(),
        });
      }
    } else {
      // Deduct directly from wallet
      const curDep = wData.depositBalance || 0;
      const curBonus = wData.bonusBalance || 0;
      const curWin = wData.winBalance || 0;

      const depDeduct = Math.min(curDep, finalLossAmount);
      const rem1 = finalLossAmount - depDeduct;
      const bonusDeduct = Math.min(curBonus, rem1);
      const winDeduct = Math.min(curWin, rem1 - bonusDeduct);

      await updateDoc(loserWalletRef, {
        depositBalance: Math.max(0, curDep - depDeduct),
        bonusBalance: Math.max(0, curBonus - bonusDeduct),
        winBalance: Math.max(0, curWin - winDeduct),
        updatedAt: new Date().toISOString(),
      });
    }

    const lossTxRef = doc(collection(db, 'transactions'));
    await setDoc(lossTxRef, {
      id: lossTxRef.id,
      uid: loserUid,
      type: 'game_loss',
      amount: -finalLossAmount,
      status: 'completed',
      description: `Loss in ${gameMode.toUpperCase()} match #${gameId.slice(-6)} (${lossPoints} Pts penalty, -₹${finalLossAmount})`,
      referenceId: gameId,
      createdAt: new Date().toISOString(),
    });

    if (pSnap.exists()) {
      await updateDoc(playerDocRef, {
        isSettled: true,
        updatedAt: new Date().toISOString(),
      });
    }

    return finalLossAmount;
  } catch (err) {
    console.error(`Error settling loser loss for ${loserUid}:`, err);
    return finalLossAmount;
  }
}

/**
 * Handle turn timeout with 60s -> 5s -> 5s -> Auto Drop
 */
export async function handleTurnTimeout(gameId: string, currentTurnUid: string, callerUid?: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  const playerRef = doc(db, 'games', gameId, 'players', currentTurnUid);
  const playersRef = collection(db, 'games', gameId, 'players');

  const playersSnap = await getDocs(playersRef);
  const discoveredUids = playersSnap.docs.map((d) => d.id);

  const winnerToCredit = await runTransaction(db, async (tx): Promise<{ winnerUid: string; grossWin: number; platformFee: number; playerNetShare: number; entryBuyInRefund: number; breakdown?: any; gameMode: string; pointsWon?: number; pointValue: number; entryFee: number } | null> => {
    // 1. ALL READS FIRST
    const gameSnap = await tx.get(gameRef);
    if (!gameSnap.exists()) return null;
    const game = gameSnap.data() as GameState;

    if (game.status !== 'PLAYING' || game.turnUid !== currentTurnUid) return null;

    const now = Date.now();
    // Guard against premature timeout from opponent devices with skewed clocks:
    // If caller is an opponent, require at least 5000ms grace past server deadline.
    // If caller is the active player itself, allow auto-pass at deadline.
    const isOpponentCaller = Boolean(callerUid && callerUid !== currentTurnUid);
    const minRequiredTime = isOpponentCaller
      ? (game.turnDeadline || 0) + 5000
      : (game.turnDeadline || 0) - 1500;

    if (game.turnDeadline && now < minRequiredTime) {
      return null;
    }

    if (game.turnStartedAt && now - game.turnStartedAt < 45000) {
      return null;
    }

    const allPlayerUids = Array.from(new Set([
      ...(game.playerUids || []),
      ...discoveredUids,
    ]));

    const allPlayers: GamePlayerState[] = [];
    for (const pUid of allPlayerUids) {
      const pRef = doc(db, 'games', gameId, 'players', pUid);
      const pSnap = await tx.get(pRef);
      if (pSnap.exists()) {
        allPlayers.push(pSnap.data() as GamePlayerState);
      }
    }

    const timedOutPlayer = allPlayers.find((p) => p.uid === currentTurnUid);
    if (!timedOutPlayer) return null;

    const currentMissed = timedOutPlayer.missedTurns || 0;

    // 1-strike 60s Lifeline Rule: If player fails to play within 60s turn, auto-drop player immediately
    const isFirstDrop = (timedOutPlayer.turnsCount || 0) === 0 && !game.hasDrawn;
    const dropPts = isFirstDrop ? 20 : 40;
    const entryFee = game.entryFee || 20;
    const dropPenaltyRupees = isFirstDrop
      ? Math.round(entryFee * 0.25 * 100) / 100
      : Math.round(entryFee * 0.50 * 100) / 100;

    tx.update(playerRef, {
      status: 'dropped',
      score: dropPts,
      dropPenalty: dropPts,
      dropPenaltyRupees,
      isFirstDrop,
      missedTurns: (timedOutPlayer.missedTurns || 0) + 1,
      droppedAt: new Date().toISOString(),
    });

    const updatedDroppedUids = Array.from(new Set([...(game.droppedUids || []), currentTurnUid]));

    const remainingActive = allPlayers
      .filter((p) => p.uid !== currentTurnUid && p.status === 'playing' && !updatedDroppedUids.includes(p.uid))
      .sort((a, b) => (a.seatIndex || 0) - (b.seatIndex || 0));

    if (remainingActive.length <= 1) {
      const winner = remainingActive[0];
      if (winner) {
        const scores: Record<string, number> = {};
        const penalties: Record<string, string> = {};
        const payouts: Record<string, number> = {};
        let totalGrossPot = 0;
        let totalPointsLost = 0;

        for (const p of allPlayers) {
          if (p.uid === winner.uid) {
            penalties[p.uid] = 'Winner';
          } else {
            const pDropPts = p.uid === currentTurnUid ? dropPts : (p.score || 40);
            const pLossRupees = p.uid === currentTurnUid
              ? dropPenaltyRupees
              : (p.dropPenaltyRupees || (pDropPts === 20 ? Math.round(entryFee * 0.25 * 100) / 100 : Math.round(entryFee * 0.50 * 100) / 100));
            scores[p.uid] = pDropPts;
            penalties[p.uid] = `Auto-Dropped (${pDropPts} pts, -₹${pLossRupees})`;
            totalGrossPot += pLossRupees;
            totalPointsLost += pDropPts;
          }
        }
        scores[winner.uid] = totalPointsLost;

        const feePercent = 14;
        const platformFee = Math.round(totalGrossPot * (feePercent / 100) * 100) / 100;
        const playerNetShare = Math.round((totalGrossPot - platformFee) * 100) / 100;
        payouts[winner.uid] = playerNetShare;
        const winnerBuyInRefund = winner.entryPaid || entryFee;

        tx.update(gameRef, {
          status: 'RESULT',
          phase: 'RESULT',
          winnerUid: winner.uid,
          droppedUids: Array.from(new Set([...(game.droppedUids || []), currentTurnUid])),
          resultData: {
            winnerUid: winner.uid,
            scores,
            penalties,
            grossWin: totalGrossPot,
            platformFee,
            feePercent,
            adminShare: platformFee,
            playerNetShare,
            payouts,
            winnerBuyInRefund,
            settlementStatus: 'completed',
            completedAt: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
        });

        return {
          winnerUid: winner.uid,
          grossWin: totalGrossPot,
          platformFee,
          playerNetShare,
          entryBuyInRefund: winnerBuyInRefund,
          breakdown: winner.deductionBreakdown,
          gameMode: game.mode,
          pointsWon: totalPointsLost,
          pointValue: game.pointValue || (entryFee / 80),
          entryFee,
        };
      } else {
        tx.update(gameRef, {
          status: 'RESULT',
          phase: 'RESULT',
          droppedUids: Array.from(new Set([...(game.droppedUids || []), currentTurnUid])),
          updatedAt: new Date().toISOString(),
        });
        return null;
      }
    } else {
      const currentSeat = timedOutPlayer.seatIndex || 0;
      const nextClockwise = remainingActive.find((p) => (p.seatIndex || 0) > currentSeat);
      const nextUid = nextClockwise ? nextClockwise.uid : remainingActive[0].uid;
      tx.update(gameRef, {
        droppedUids: Array.from(new Set([...(game.droppedUids || []), currentTurnUid])),
        turnUid: nextUid,
        turnStartedAt: now,
        turnDeadline: now + 60000,
        turnExtensionCount: 0,
        hasDrawn: false,
        updatedAt: new Date().toISOString(),
      });
      return null;
    }
  });

  if (winnerToCredit) {
    await creditWinnerPayout(
      gameId,
      winnerToCredit.gameMode,
      winnerToCredit.winnerUid,
      winnerToCredit.grossWin,
      winnerToCredit.platformFee,
      winnerToCredit.playerNetShare,
      winnerToCredit.entryBuyInRefund,
      winnerToCredit.breakdown,
      winnerToCredit.pointsWon
    );

    try {
      const pSnap = await getDocs(playersRef);
      for (const d of pSnap.docs) {
        const pData = d.data() as GamePlayerState;
        if (pData.uid !== winnerToCredit.winnerUid && !pData.isBot) {
          const lossPts = pData.score || 40;
          await settleLoserLoss(
            gameId,
            winnerToCredit.gameMode,
            pData.uid,
            lossPts,
            winnerToCredit.pointValue,
            winnerToCredit.entryFee,
            pData.entryPaid || winnerToCredit.entryFee,
            pData.deductionBreakdown
          );
        }
      }
    } catch (e) {
      console.warn('Error settling timeout losses:', e);
    }
  } else {
    // Game is still ongoing, settle the auto-dropped player immediately so they can start new games
    try {
      const pSnap = await getDoc(playerRef);
      const gSnap = await getDoc(gameRef);
      if (pSnap.exists() && gSnap.exists()) {
        const pData = pSnap.data() as GamePlayerState;
        const gData = gSnap.data() as GameState;
        if (!pData.isSettled) {
          const dropPts = pData.score || 40;
          await settleLoserLoss(
            gameId,
            gData.mode,
            currentTurnUid,
            dropPts,
            gData.pointValue || ((gData.entryFee || 20) / 80),
            gData.entryFee || 20,
            pData.entryPaid || (gData.entryFee || 20),
            pData.deductionBreakdown
          );
        }
      }
    } catch (settleErr) {
      console.warn('Auto-drop immediate settlement note:', settleErr);
    }
  }

  await clearActiveGameSession(currentTurnUid, gameId);
}

/**
 * Manual Player Drop (First drop = 20 pts = 25% of stake, Middle drop = 40 pts = 50% of stake)
 * The opponent gets the dropped amount minus 14% platform commission, PLUS keeps their full buy-in!
 */
export async function dropGame(gameId: string, playerUid: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  const playerRef = doc(db, 'games', gameId, 'players', playerUid);
  const playersRef = collection(db, 'games', gameId, 'players');

  const pSnap = await getDocs(playersRef);
  const discoveredUids = pSnap.docs.map((d) => d.id);

  const winnerToCredit = await runTransaction(db, async (tx): Promise<{ winnerUid: string; grossWin: number; platformFee: number; playerNetShare: number; entryBuyInRefund: number; breakdown?: any; gameMode: string; pointsWon?: number; pointValue: number; entryFee: number } | null> => {
    // 1. ALL READS FIRST
    const gameSnap = await tx.get(gameRef);
    if (!gameSnap.exists()) return null;
    const game = gameSnap.data() as GameState;

    const playerSnap = await tx.get(playerRef);
    if (!playerSnap.exists()) return null;
    const playerData = playerSnap.data() as GamePlayerState;

    const seatedMatchUids = Array.isArray(game.playerUids) && game.playerUids.length > 0
      ? game.playerUids
      : discoveredUids;

    const allPlayerUids = Array.from(new Set([
      ...seatedMatchUids,
      playerUid,
    ]));

    const allPlayers: GamePlayerState[] = [];
    for (const pUid of allPlayerUids) {
      const pRef = doc(db, 'games', gameId, 'players', pUid);
      const pSnap = await tx.get(pRef);
      if (pSnap.exists()) {
        allPlayers.push(pSnap.data() as GamePlayerState);
      }
    }

    // Guard: Only allow drop during active PLAYING state
    if (game.status !== 'PLAYING') {
      return null;
    }

    // Guard: Player already dropped
    if (playerData.status === 'dropped') {
      return null;
    }

    // Determine First Drop vs Middle Drop:
    // If player has played 0 turns AND (has not drawn yet on their turn or it is before their turn): FIRST DROP!
    // If player has already played 1+ turns OR has drawn a card: MIDDLE DROP!
    const hasDrawnThisTurn = game.turnUid === playerUid && Boolean(game.hasDrawn);
    const dropInfo = calculateDropPenalty(
      game.entryFee || 20,
      game.pointValue || ((game.entryFee || 20) / 80),
      playerData.turnsCount || 0,
      hasDrawnThisTurn
    );

    const penalty = dropInfo.points;
    const dropPenaltyRupees = dropInfo.penaltyRupees;
    const entryFee = game.entryFee || 20;

    // 2. ALL WRITES AFTER
    tx.update(playerRef, {
      status: 'dropped',
      score: penalty,
      dropPenalty: penalty,
      dropPenaltyRupees,
      isFirstDrop: dropInfo.isFirstDrop,
      droppedAt: new Date().toISOString(),
    });

    const updatedDroppedUids = Array.from(new Set([...(game.droppedUids || []), playerUid]));

    const remainingActive = allPlayers
      .filter((p) => p.uid !== playerUid && p.status === 'playing' && !updatedDroppedUids.includes(p.uid))
      .sort((a, b) => (a.seatIndex || 0) - (b.seatIndex || 0));

    if (remainingActive.length <= 1) {
      const winner = remainingActive[0];
      if (winner) {
        const scores: Record<string, number> = {};
        const penalties: Record<string, string> = {};
        const payouts: Record<string, number> = {};
        let totalGrossPot = 0;
        let totalPointsLost = 0;

        for (const p of allPlayers) {
          if (p.uid === winner.uid) {
            penalties[p.uid] = 'Winner';
          } else {
            const pDropPts = p.uid === playerUid ? penalty : (p.score || penalty);
            const pLossRupees = p.uid === playerUid
              ? dropPenaltyRupees
              : (p.dropPenaltyRupees || (pDropPts === 20 ? Math.round(entryFee * 0.25 * 100) / 100 : Math.round(entryFee * 0.50 * 100) / 100));
            scores[p.uid] = pDropPts;
            penalties[p.uid] = `${pDropPts === 20 ? 'First Drop' : 'Middle Drop'} (${pDropPts} pts, -₹${pLossRupees})`;
            totalGrossPot += pLossRupees;
            totalPointsLost += pDropPts;
          }
        }
        scores[winner.uid] = totalPointsLost;

        // 14% platform fee automatically deducted from winnings
        const feePercent = 14;
        const platformFee = Math.round(totalGrossPot * (feePercent / 100) * 100) / 100;
        const playerNetShare = Math.round((totalGrossPot - platformFee) * 100) / 100;
        payouts[winner.uid] = playerNetShare;
        const winnerBuyInRefund = winner.entryPaid || entryFee;

        tx.update(gameRef, {
          status: 'RESULT',
          phase: 'RESULT',
          winnerUid: winner.uid,
          droppedUids: updatedDroppedUids,
          resultData: {
            winnerUid: winner.uid,
            scores,
            penalties,
            grossWin: totalGrossPot,
            platformFee,
            feePercent,
            adminShare: platformFee,
            playerNetShare,
            payouts,
            winnerBuyInRefund,
            settlementStatus: 'completed',
            completedAt: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
        });

        return {
          winnerUid: winner.uid,
          grossWin: totalGrossPot,
          platformFee,
          playerNetShare,
          entryBuyInRefund: winnerBuyInRefund,
          breakdown: winner.deductionBreakdown,
          gameMode: game.mode,
          pointsWon: totalPointsLost,
          pointValue: game.pointValue || (entryFee / 80),
          entryFee,
        };
      } else {
        tx.update(gameRef, {
          status: 'RESULT',
          phase: 'RESULT',
          droppedUids: updatedDroppedUids,
          updatedAt: new Date().toISOString(),
        });
        return null;
      }
    } else {
      const gameUpdates: Record<string, unknown> = {
        droppedUids: updatedDroppedUids,
        updatedAt: new Date().toISOString(),
      };
      if (game.turnUid === playerUid) {
        const currentSeat = playerData.seatIndex || 0;
        const nextClockwise = remainingActive.find((p) => (p.seatIndex || 0) > currentSeat);
        const nextUid = nextClockwise ? nextClockwise.uid : remainingActive[0].uid;
        const now = Date.now();
        gameUpdates.turnUid = nextUid;
        gameUpdates.turnStartedAt = now;
        gameUpdates.turnDeadline = now + 60000;
        gameUpdates.turnExtensionCount = 0;
        gameUpdates.hasDrawn = false;
      }
      tx.update(gameRef, gameUpdates);
      return null;
    }
  });

  if (winnerToCredit) {
    await creditWinnerPayout(
      gameId,
      winnerToCredit.gameMode,
      winnerToCredit.winnerUid,
      winnerToCredit.grossWin,
      winnerToCredit.platformFee,
      winnerToCredit.playerNetShare,
      winnerToCredit.entryBuyInRefund,
      winnerToCredit.breakdown,
      winnerToCredit.pointsWon
    );

    try {
      const pSnap2 = await getDocs(playersRef);
      for (const d of pSnap2.docs) {
        const pData = d.data() as GamePlayerState;
        if (pData.uid !== winnerToCredit.winnerUid && !pData.isBot) {
          const lossPts = pData.score || 20;
          await settleLoserLoss(
            gameId,
            winnerToCredit.gameMode,
            pData.uid,
            lossPts,
            winnerToCredit.pointValue,
            winnerToCredit.entryFee,
            pData.entryPaid || winnerToCredit.entryFee,
            pData.deductionBreakdown
          );
        }
      }
    } catch (e) {
      console.warn('Error settling drop losses:', e);
    }
  } else {
    // Multi-player match: drop occurred but match continues with other players.
    // Settle this dropping player's loss and refund remaining buy-in immediately!
    try {
      const freshPSnap = await getDoc(playerRef);
      const freshGSnap = await getDoc(gameRef);
      if (freshPSnap.exists() && freshGSnap.exists()) {
        const pData = freshPSnap.data() as GamePlayerState;
        const gData = freshGSnap.data() as GameState;
        if (!pData.isSettled) {
          const pLoss = pData.score || 20;
          await settleLoserLoss(
            gameId,
            gData.mode,
            playerUid,
            pLoss,
            gData.pointValue || (gData.entryFee / 80),
            gData.entryFee,
            pData.entryPaid || gData.entryFee,
            pData.deductionBreakdown
          );
        }
      }
    } catch (e) {
      console.warn('Error settling interim drop loss:', e);
    }
  }

  await clearActiveGameSession(playerUid, gameId);
}

/**
 * Declare Hand with server validation
 */
export async function declareHand(
  gameId: string,
  playerUid: string,
  cardGroups: Card[][]
): Promise<{ isValid: boolean; message: string; penaltyScore: number }> {
  const gameRef = doc(db, 'games', gameId);
  const playerRef = doc(db, 'games', gameId, 'players', playerUid);
  const playersRef = collection(db, 'games', gameId, 'players');

  const gameSnap = await getDoc(gameRef);
  if (!gameSnap.exists()) throw new Error('Game not found.');
  const game = gameSnap.data() as GameState;

  const wildJokerRank = game.wildJoker?.rank;
  const validation = validateDeclaration(cardGroups, wildJokerRank);

  if (validation.isValid) {
    // Valid Declaration! Declare winner and calculate scores
    const playersSnap = await getDocs(playersRef);
    const allPlayers = playersSnap.docs.map((d) => d.data() as GamePlayerState);

    const scores: Record<string, number> = {};
    const penalties: Record<string, string> = {};
    const payouts: Record<string, number> = {};

    let totalPointsLost = 0;
    let totalGrossPot = 0;
    const entryFee = game.entryFee || 20;
    const pointVal = game.pointValue || (entryFee / 80);

    for (const p of allPlayers) {
      if (p.uid === playerUid) {
        penalties[p.uid] = 'Winner';
      } else if (p.status === 'dropped') {
        const dropPts = p.score || 20;
        const dropRupees = p.dropPenaltyRupees || (dropPts === 20 ? Math.round(entryFee * 0.25 * 100) / 100 : Math.round(entryFee * 0.50 * 100) / 100);
        scores[p.uid] = dropPts;
        penalties[p.uid] = `Dropped (${dropPts} pts, -₹${dropRupees})`;
        totalPointsLost += dropPts;
        totalGrossPot += dropRupees;
      } else {
        const lossPts = calculateLossPoints(p.cards || [], wildJokerRank);
        const lossRupees = Math.min(entryFee, Math.max(1, Math.round(lossPts * pointVal * 100) / 100));
        scores[p.uid] = lossPts;
        penalties[p.uid] = `${lossPts} pts loss (-₹${lossRupees})`;
        totalPointsLost += lossPts;
        totalGrossPot += lossRupees;
      }
    }

    const winnerSets = cardGroups.filter((g) => isValidSet(g, wildJokerRank)).length;
    const winnerSetPoints = winnerSets * 20;
    const totalWinnerPoints = totalPointsLost + winnerSetPoints;

    scores[playerUid] = totalWinnerPoints;

    // 14% platform fee automatically deducted from winnings
    const feePercent = 14;
    const platformFee = Math.round(totalGrossPot * (feePercent / 100) * 100) / 100;
    const playerNetShare = Math.round((totalGrossPot - platformFee) * 100) / 100;
    const adminShare = platformFee;
    payouts[playerUid] = playerNetShare;
    const winnerPlayer = allPlayers.find((p) => p.uid === playerUid);
    const winnerBuyInRefund = winnerPlayer?.entryPaid || entryFee;

    await updateDoc(gameRef, {
      status: 'RESULT',
      phase: 'RESULT',
      winnerUid: playerUid,
      resultData: {
        winnerUid: playerUid,
        scores,
        penalties,
        grossWin: totalGrossPot,
        platformFee,
        feePercent,
        adminShare,
        playerNetShare,
        payouts,
        winnerBuyInRefund,
        winnerSets,
        winnerSetPoints,
        settlementStatus: 'completed',
        completedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    });

    await updateDoc(playerRef, {
      status: 'declared',
      score: 0,
    });

    // Credit winner's wallet: WINNER GETS THEIR BUY-IN REFUNDED + NET WINNINGS IN WINBALANCE!
    if (playerNetShare > 0 || winnerBuyInRefund > 0) {
      await creditWinnerPayout(
        gameId,
        game.mode,
        playerUid,
        totalGrossPot,
        platformFee,
        playerNetShare,
        winnerBuyInRefund,
        winnerPlayer?.deductionBreakdown,
        totalWinnerPoints
      );
    }

    // Settle money for all losers:
    for (const p of allPlayers) {
      if (p.uid !== playerUid && !p.isBot) {
        const lossPts = scores[p.uid] || 20;
        await settleLoserLoss(
          gameId,
          game.mode,
          p.uid,
          lossPts,
          pointVal,
          entryFee,
          p.entryPaid || entryFee,
          p.deductionBreakdown
        );

        // Award 20 points per set for any valid sets formed by loser
        const loserMelds = findBestMelds(p.cards || [], wildJokerRank);
        const loserSets = loserMelds.filter((g) => isValidSet(g, wildJokerRank)).length;
        if (loserSets > 0) {
          const loserSetPoints = loserSets * 20;
          try {
            const lWalletRef = doc(db, 'wallets', p.uid);
            const lSnap = await getDoc(lWalletRef);
            if (lSnap.exists()) {
              await updateDoc(lWalletRef, {
                rewardPoints: (lSnap.data().rewardPoints || 0) + loserSetPoints,
                updatedAt: new Date().toISOString(),
              });
            }
          } catch (e) {
            console.warn('Set points reward error:', e);
          }
        }
      }
    }

    return validation;
  } else {
    // Invalid Declaration Penalty: EXACTLY 80 POINTS
    await updateDoc(playerRef, {
      score: 80,
      dropPenalty: 80,
      dropPenaltyRupees: game.entryFee || 20,
      status: 'dropped',
      droppedAt: new Date().toISOString(),
    });

    try {
      await updateDoc(gameRef, {
        droppedUids: Array.from(new Set([...(game.droppedUids || []), playerUid])),
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Invalid declaration droppedUids update:', e);
    }

    await clearActiveGameSession(playerUid, gameId);
    return validation;
  }
}

/**
 * Conclude match immediately if only 1 active player remains (fail-safe for opponent drop/disconnect)
 */
export async function autoConcludeSoloSurvivor(gameId: string, playerUid: string): Promise<boolean> {
  const gameRef = doc(db, 'games', gameId);
  const playersRef = collection(db, 'games', gameId, 'players');

  const pSnap = await getDocs(playersRef);
  const discoveredUids = pSnap.docs.map((d) => d.id);

  try {
    const winnerToCredit = await runTransaction(db, async (tx) => {
      const gameSnap = await tx.get(gameRef);
      if (!gameSnap.exists()) return null;
      const game = gameSnap.data() as GameState;
      if (game.status !== 'PLAYING') return null;

      const seatedMatchUids = Array.isArray(game.playerUids) && game.playerUids.length > 0
        ? game.playerUids
        : discoveredUids;

      const allPlayerUids = Array.from(new Set([
        ...seatedMatchUids,
        playerUid,
      ]));

      const allPlayers: GamePlayerState[] = [];
      for (const pUid of allPlayerUids) {
        const pRef = doc(db, 'games', gameId, 'players', pUid);
        const pSnap = await tx.get(pRef);
        if (pSnap.exists()) {
          allPlayers.push(pSnap.data() as GamePlayerState);
        }
      }

      const myPlayer = allPlayers.find((p) => p.uid === playerUid);
      if (!myPlayer || myPlayer.status === 'dropped' || myPlayer.status === 'eliminated') {
        return null;
      }

      const otherActive = allPlayers.filter(
        (p) => p.uid !== playerUid && p.status === 'playing' && !game.droppedUids?.includes(p.uid)
      );

      if (otherActive.length > 0) {
        return null; // Other players are still actively playing
      }

      // Only this player is left active! Finalize victory immediately!
      const scores: Record<string, number> = {};
      const penalties: Record<string, string> = {};
      const payouts: Record<string, number> = {};
      let totalGrossPot = 0;
      let totalPointsLost = 0;
      const entryFee = game.entryFee || 20;

      for (const p of allPlayers) {
        if (p.uid === playerUid) {
          penalties[p.uid] = 'Winner';
        } else {
          const pLoss = p.score || 20;
          const pLossRupees = p.dropPenaltyRupees || (pLoss === 20 ? Math.round(entryFee * 0.25 * 100) / 100 : Math.round(entryFee * 0.50 * 100) / 100);
          scores[p.uid] = pLoss;
          penalties[p.uid] = `Dropped (${pLoss} pts, -₹${pLossRupees})`;
          totalGrossPot += pLossRupees;
          totalPointsLost += pLoss;
        }
      }
      scores[playerUid] = totalPointsLost;

      const feePercent = 14;
      const platformFee = Math.round(totalGrossPot * (feePercent / 100) * 100) / 100;
      const playerNetShare = Math.round((totalGrossPot - platformFee) * 100) / 100;
      payouts[playerUid] = playerNetShare;
      const winnerBuyInRefund = myPlayer.entryPaid || entryFee;

      tx.update(gameRef, {
        status: 'RESULT',
        phase: 'RESULT',
        winnerUid: playerUid,
        resultData: {
          winnerUid: playerUid,
          scores,
          penalties,
          grossWin: totalGrossPot,
          platformFee,
          feePercent,
          adminShare: platformFee,
          playerNetShare,
          payouts,
          winnerBuyInRefund,
          settlementStatus: 'completed',
          completedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      });

      return {
        winnerUid: playerUid,
        grossWin: totalGrossPot,
        platformFee,
        playerNetShare,
        entryBuyInRefund: winnerBuyInRefund,
        breakdown: myPlayer.deductionBreakdown,
        gameMode: game.mode,
        pointsWon: totalPointsLost,
        pointValue: game.pointValue || (entryFee / 80),
        entryFee,
      };
    });

    if (winnerToCredit) {
      await creditWinnerPayout(
        gameId,
        winnerToCredit.gameMode,
        winnerToCredit.winnerUid,
        winnerToCredit.grossWin,
        winnerToCredit.platformFee,
        winnerToCredit.playerNetShare,
        winnerToCredit.entryBuyInRefund,
        winnerToCredit.breakdown,
        winnerToCredit.pointsWon
      );
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Auto-conclude solo survivor notice:', err);
    return false;
  }
}
