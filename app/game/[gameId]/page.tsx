'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { AuthGuard } from '@/components/AuthGuard';
import { PlayingCard } from '@/components/PlayingCard';
import { soundManager } from '@/lib/sound';
import {
  Card,
  GameState,
  GamePlayerState,
  TableConfig,
} from '@/lib/types';
import {
  startMatch,
  drawCard,
  discardCard,
  handleTurnTimeout,
  dropGame,
  declareHand,
  autoConcludeSoloSurvivor,
  leaveMatchQueue,
  leaveTable,
  sendPlayerHeartbeat,
  clearActiveGameSession,
  startPracticeBotMatch,
  playBotTurn,
  calculateDropPenalty,
  autoMatchWithBots,
  canInjectBotIntoGame,
} from '@/lib/game-service';
import {
  isPureSequence,
  isImpureSequence,
  isValidSet,
  getGroupMeldStatus,
  GroupMeldStatus,
  calculateLossPoints,
  calculateLiveHandScore,
  findBestMelds,
  validateDeclaration,
} from '@/lib/rummy-engine';
import {
  doc,
  collection,
  onSnapshot,
  getDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import confetti from 'canvas-confetti';
import {
  Loader2,
  Users,
  Clock,
  RotateCcw,
  RotateCw,
  Maximize2,
  Volume2,
  VolumeX,
  AlertCircle,
  Trophy,
  ArrowLeft,
  ShieldAlert,
  Sparkles,
  Layers,
  ArrowUpDown,
  X,
  Copy,
  Check,
  Share2,
  BookOpen,
  HelpCircle,
  Smartphone,
  Bot,
  Play,
  LogOut,
  Zap,
} from 'lucide-react';
import { HowToPlayModal } from '@/components/HowToPlayModal';

function getCardPenaltyPoints(card: Card, wildJokerRank?: string): number {
  if (card.isPrintedJoker || card.suit === 'joker' || card.rank === 'JOKER') return 0;
  if (wildJokerRank && card.rank.toLowerCase() === wildJokerRank.toLowerCase()) return 0;
  if (card.rank === 'A' || card.rank === 'K' || card.rank === 'Q' || card.rank === 'J' || card.rank === '10') {
    return 10;
  }
  const num = parseInt(card.rank, 10);
  return isNaN(num) ? 10 : num;
}

function getGroupPoints(cards: Card[], wildJokerRank?: string): number {
  return cards.reduce((sum, c) => sum + getCardPenaltyPoints(c, wildJokerRank), 0);
}

export default function GameRoomPage() {
  const params = useParams();
  const gameId = params?.gameId as string;
  const router = useRouter();
  const { user, profile, wallet } = useAuth();

  const [game, setGame] = useState<GameState | null>(null);
  const [players, setPlayers] = useState<GamePlayerState[]>([]);
  const [myPlayer, setMyPlayer] = useState<GamePlayerState | null>(null);
  const [playersLoaded, setPlayersLoaded] = useState(false);
  const wildJokerRank = game?.wildJoker?.rank;
  // Multiple card selection & grouping for Sets
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const selectedCardId = selectedCardIds[0] || null;
  const setSelectedCardId = (id: string | null) => setSelectedCardIds(id ? [id] : []);
  const [handGroups, setHandGroups] = useState<Card[][]>([]);
  const [draggedCardInfo, setDraggedCardInfo] = useState<{
    cardId: string;
    fromGroupIdx: number;
    fromCardIdx: number;
  } | null>(null);
  const [dragOverGroupIdx, setDragOverGroupIdx] = useState<number | null>(null);
  const [toastNotification, setToastNotification] = useState<string | null>(null);
  const [touchDragCard, setTouchDragCard] = useState<{
    cardId: string;
    fromGroupIdx: number;
    fromCardIdx: number;
  } | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isTouchDraggingRef = useRef<boolean>(false);

  // Time remaining on active turn (seconds)
  const [turnTimeLeft, setTurnTimeLeft] = useState<number>(45);
  const [countdownLeft, setCountdownLeft] = useState<number>(15);

  // Action states
  const [actionLoading, setActionLoading] = useState(false);
  const [optimisticHasDrawn, setOptimisticHasDrawn] = useState<boolean | null>(null);
  const [isDrawingCard, setIsDrawingCard] = useState<boolean>(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [showDropModal, setShowDropModal] = useState(false);
  const [showDeclareModal, setShowDeclareModal] = useState(false);
  const [showHowToPlayModal, setShowHowToPlayModal] = useState(false);
  const [declareGroups, setDeclareGroups] = useState<Card[][]>([[], [], [], []]);
  const [declareFinishCard, setDeclareFinishCard] = useState<Card | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

  // Reconnection & sync
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [leavingQueue, setLeavingQueue] = useState(false);

  // Reference to prevent firing turn timeout repeatedly
  const timeoutHandledRef = useRef(false);
  const isBotExecutingRef = useRef(false);

  // Device orientation state for mobile/tablet responsive layout
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      if (typeof window !== 'undefined') {
        setIsPortrait(window.innerHeight > window.innerWidth && window.innerWidth < 850);
      }
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  // Auto-rotate: Attempt automatic screen orientation locking when entering game
  useEffect(() => {
    const attemptAutoRotate = async () => {
      try {
        if (typeof window !== 'undefined' && 'screen' in window && window.screen.orientation) {
          const orientation = window.screen.orientation as any;
          if (typeof orientation.lock === 'function') {
            await orientation.lock('landscape');
          }
        }
      } catch {
        // Silently handled if browser policy requires user gesture
      }
    };
    attemptAutoRotate();
  }, []);

  const handleToggleAutoRotate = async () => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      if (window.screen?.orientation && 'lock' in window.screen.orientation) {
        await (window.screen.orientation as any).lock('landscape');
      }
    } catch (e) {
      console.warn('Orientation lock attempt:', e);
    }
  };

  // Automated bot turn execution when playing practice match
  useEffect(() => {
    if (!game || game.status !== 'PLAYING' || !game.turnUid) return;
    const isBotTurn = game.turnUid.startsWith('bot_') || Boolean(players.find((p) => p.uid === game.turnUid)?.isBot);
    if (isBotTurn) {
      if (isBotExecutingRef.current) return;
      isBotExecutingRef.current = true;
      const timer = setTimeout(async () => {
        try {
          soundManager.playCardDraw();
          await playBotTurn(game.gameId, game.turnUid!);
          soundManager.playCardDiscard();
        } catch (e) {
          console.warn('Bot turn play error:', e);
        } finally {
          isBotExecutingRef.current = false;
        }
      }, 900);
      return () => {
        clearTimeout(timer);
        isBotExecutingRef.current = false;
      };
    }
  }, [game?.turnUid, game?.status, game?.gameId, players]);

  // 1. Send player heartbeat every 30 seconds to keep room alive (throttled for performance)
  useEffect(() => {
    if (!gameId || !user) return;
    sendPlayerHeartbeat(gameId, user.uid);
    const interval = setInterval(() => {
      sendPlayerHeartbeat(gameId, user.uid);
    }, 30000);
    return () => clearInterval(interval);
  }, [gameId, user]);

  const handleCopyInvite = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    }
  };

  const handleLeaveQueue = async () => {
    if (!user || !gameId) return;
    setLeavingQueue(true);
    try {
      await leaveMatchQueue(gameId, user.uid);
      router.push('/lobby');
    } catch (err) {
      console.error(err);
      setErrorToast('Could not leave queue. Please refresh.');
      setLeavingQueue(false);
    }
  };

  // 2. Real-time listener for Game doc
  useEffect(() => {
    if (!gameId) return;
    const gameRef = doc(db, 'games', gameId);
    const unsub = onSnapshot(
      gameRef,
      (snap) => {
        if (snap.exists()) {
          setGame(snap.data() as GameState);
          setIsReconnecting(false);
        }
      },
      () => {
        setIsReconnecting(true);
      }
    );
    return () => unsub();
  }, [gameId]);

  // 3. Real-time listener for Players subcollection
  useEffect(() => {
    if (!gameId || !user) return;
    const playersRef = collection(db, 'games', gameId, 'players');
    const unsub = onSnapshot(
      playersRef,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as GamePlayerState);
        list.sort((a, b) => a.seatIndex - b.seatIndex);
        setPlayers(list);

        const me = list.find((p) => p.uid === user.uid) || null;
        setMyPlayer(me);
        setPlayersLoaded(true);
      },
      (err) => {
        console.warn('Game players listener:', err);
        setPlayersLoaded(true);
      }
    );
    return () => unsub();
  }, [gameId, user]);

  // 3.5. Waiting countdown timer (10s) and auto-matchmaking handler
  // "ek waiting time rakho usme agar players nhi aye to matchmaking ho jayega timer chalega or game start"
  const [waitingTimeLeft, setWaitingTimeLeft] = useState<number>(10);
  const [isBoosted, setIsBoosted] = useState<boolean>(false);
  const autoMatchCalledRef = useRef(false);

  useEffect(() => {
    if (!game || game.status !== 'WAITING' || !user || !myPlayer) return;
    autoMatchCalledRef.current = false;

    const getTargetTime = () => {
      if (game.waitingEndsAt) {
        return new Date(game.waitingEndsAt).getTime();
      }
      if (game.createdAt) {
        const createdMs = new Date(game.createdAt).getTime();
        if (Date.now() - createdMs < 12000) {
          return createdMs + 10000;
        }
      }
      return Date.now() + 10000;
    };

    const targetTime = getTargetTime();

    const calculateWaitDiff = () => {
      const now = Date.now();
      return Math.max(0, Math.ceil((targetTime - now) / 1000));
    };

    setWaitingTimeLeft(calculateWaitDiff());

    const interval = setInterval(async () => {
      const remaining = calculateWaitDiff();
      setWaitingTimeLeft(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        if (!autoMatchCalledRef.current) {
          autoMatchCalledRef.current = true;
          // Zero-Bot Policy: Strict check ensuring bots are ONLY used for zero-fee practice tables
          if (canInjectBotIntoGame(game)) {
            try {
              await autoMatchWithBots(game.gameId, user.uid);
            } catch (err) {
              console.error('Auto match error:', err);
            }
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [game?.status, game?.gameId, game?.createdAt, game?.waitingEndsAt, user?.uid, !!myPlayer]);

  // 4. Countdown timer handler — uses stable deps
  const countdownGameId = game?.gameId;
  const countdownStatus = game?.status;
  const countdownPhase = game?.phase;
  const countdownEndsAtVal = game?.countdownEndsAt;
  const hasMyPlayer = !!myPlayer;

  useEffect(() => {
    if (!countdownGameId || !hasMyPlayer) return;

    if (countdownStatus === 'COUNTDOWN' && countdownPhase === 'COUNTDOWN') {
      const startMatchCalled = { current: false };

      const calculateTimeLeft = () => {
        if (countdownEndsAtVal) {
          const endsAt = new Date(countdownEndsAtVal).getTime();
          const now = Date.now();
          return Math.max(0, Math.ceil((endsAt - now) / 1000));
        }
        return 5;
      };

      setCountdownLeft(calculateTimeLeft());

      const interval = setInterval(async () => {
        const diff = calculateTimeLeft();
        setCountdownLeft(diff);

        if (diff <= 0 && !startMatchCalled.current) {
          startMatchCalled.current = true;
          clearInterval(interval);
          try {
            await startMatch(countdownGameId);
          } catch (err) {
            console.error('Error starting match after countdown:', err);
          }
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [countdownGameId, countdownStatus, countdownPhase, countdownEndsAtVal, hasMyPlayer]);

  // 5. Turn timer clock (60s base turn timer) — Uses stable values to avoid recreating on every snapshot
  const turnDeadlineRef = useRef<number | undefined>(undefined);
  const turnUidRef = useRef<string | undefined>(undefined);
  const gameStatusRef = useRef<string | undefined>(undefined);
  const gameIdRef = useRef<string | undefined>(undefined);

  // Keep refs up to date without triggering effect re-runs
  useEffect(() => {
    turnDeadlineRef.current = game?.turnDeadline;
    gameStatusRef.current = game?.status;
    gameIdRef.current = game?.gameId;
  }, [game?.turnDeadline, game?.status, game?.gameId]);

  useEffect(() => {
    if (!game || game.status !== 'PLAYING' || !game.turnDeadline) return;

    timeoutHandledRef.current = false;
    turnUidRef.current = game.turnUid;

    const deadline = game.turnDeadline;
    const currentGameId = game.gameId;
    const currentTurnUid = game.turnUid || '';

    const isMyTurn = currentTurnUid === user?.uid;

    // Immediately calculate diff so UI updates with 0 lag
    const initialDiff = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    setTurnTimeLeft(initialDiff);

    const interval = setInterval(() => {
      const now = Date.now();
      const rawDiff = Math.ceil((deadline - now) / 1000);
      const displayDiff = Math.max(0, rawDiff);
      setTurnTimeLeft(displayDiff);

      if (displayDiff === 10) {
        soundManager.playCountdownTick();
      }

      // If it is my turn: trigger timeout immediately when diff <= 0
      // If it is opponent's turn: ONLY trigger timeout after a safe grace period (rawDiff <= -8)
      // to prevent clock desync/lag on opponent device from prematurely timing out the active player!
      const shouldTrigger = isMyTurn ? rawDiff <= 0 : rawDiff <= -8;

      if (shouldTrigger && !timeoutHandledRef.current) {
        timeoutHandledRef.current = true;
        clearInterval(interval);
        handleTurnTimeout(currentGameId, currentTurnUid, user?.uid);
      }
    }, 1000);

    return () => clearInterval(interval);
  // Only re-run when the actual turn changes (new deadline or new turn player)
  }, [game?.turnDeadline, game?.turnUid, game?.status, user?.uid]);

  // 6. Turn notification chime & optimistic state reset
  useEffect(() => {
    setOptimisticHasDrawn(null);
    if (game?.status === 'PLAYING' && game.turnUid === user?.uid) {
      soundManager.playTurnNotification();
    }
  }, [game?.turnUid, game?.status, user?.uid]);

  // 7. Fanfare and confetti on match victory
  useEffect(() => {
    if (game?.status === 'RESULT' && game.resultData) {
      soundManager.playWinFanfare();
      if (game.winnerUid === user?.uid) {
        confetti({
          particleCount: 150,
          spread: 90,
          origin: { y: 0.6 },
        });
      }
    }
  }, [game?.status, game?.resultData, game?.winnerUid, user?.uid]);

  // 8. Auto-conclude solo survivor when all opponents have dropped
  useEffect(() => {
    if (!game || game.status !== 'PLAYING' || !user || !myPlayer) return;
    if (myPlayer.status === 'playing') {
      const matchUids = (game.playerUids || []).filter(Boolean);
      const otherSeated = players.filter((p) => p.uid !== user.uid && matchUids.includes(p.uid));
      if (otherSeated.length > 0) {
        const stillActive = otherSeated.filter((p) => p.status === 'playing');
        if (stillActive.length === 0) {
          // All seated opponents have dropped or left! Conclude match immediately!
          autoConcludeSoloSurvivor(game.gameId, user.uid);
        }
      }
    }
  }, [game?.status, game?.playerUids, game?.gameId, players, user?.uid, myPlayer?.status]);

  // Synchronize player hand groups when myPlayer?.cards updates
  useEffect(() => {
    if (!myPlayer?.cards || myPlayer.cards.length === 0) {
      setHandGroups([]);
      return;
    }

    const currentCards = myPlayer.cards;
    const flatCurrent = handGroups.flat();
    const currentIds = new Set(currentCards.map((c) => c.id));
    const flatIds = new Set(flatCurrent.map((c) => c.id));

    const needsSync =
      currentCards.length !== flatCurrent.length ||
      currentCards.some((c) => !flatIds.has(c.id));

    if (needsSync) {
      if (handGroups.length === 0) {
        // "sab ek hi group mai honge set ban jane ke baad wo uss group se alag ho jayenge"
        // Initially keep all cards together in 1 single group
        setHandGroups([currentCards]);
      } else {
        const pruned = handGroups
          .map((grp) => grp.filter((c) => currentIds.has(c.id)))
          .filter((grp) => grp.length > 0);

        const prunedIds = new Set(pruned.flat().map((c) => c.id));
        const newDrawn = currentCards.filter((c) => !prunedIds.has(c.id));

        if (newDrawn.length > 0) {
          if (pruned.length > 0) {
            pruned[pruned.length - 1] = [...pruned[pruned.length - 1], ...newDrawn];
          } else {
            pruned.push(newDrawn);
          }
        }
        setHandGroups(pruned);
      }
    }
  }, [myPlayer?.cards, wildJokerRank]);

  // Last card click reference for double-tap discard
  const lastCardClickRef = useRef<{ id: string; time: number } | null>(null);

  // Toggle card selection on tap with double-tap instant discard support
  const toggleSelectCard = (cardId: string) => {
    setSelectedCardIds((prev) =>
      prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId]
    );
  };

  const handleCardClick = (cardId: string) => {
    const now = Date.now();
    if (
      isMyTurn &&
      hasDrawn &&
      lastCardClickRef.current &&
      lastCardClickRef.current.id === cardId &&
      now - lastCardClickRef.current.time < 450
    ) {
      handleDiscard(cardId);
      lastCardClickRef.current = null;
      return;
    }
    lastCardClickRef.current = { id: cardId, time: now };
    toggleSelectCard(cardId);
  };

  // Group selected cards into a Set / Group
  // "तीन कार्ड सेलेक्ट करेंगे, सेट का ऑप्शन मिल जाएगा, सेट कर लेंगे कार्ड। इससे हम सेट्स बना सकते हैं।"
  // "Joker ke through 4, 5, 6 cards ke set bhi banane ka option hona chahiye."
  const handleCreateSetFromSelection = () => {
    if (selectedCardIds.length === 0) return;

    const selectedCardsList: Card[] = [];
    const remainingGroups = handGroups
      .map((grp) =>
        grp.filter((c) => {
          if (selectedCardIds.includes(c.id)) {
            selectedCardsList.push(c);
            return false;
          }
          return true;
        })
      )
      .filter((grp) => grp.length > 0);

    if (selectedCardsList.length > 0) {
      const updated = [...remainingGroups, selectedCardsList];
      setHandGroups(updated);
      setSelectedCardIds([]);
      soundManager.playCardDraw();
    }
  };

  // Dissolve/ungroup a group
  const handleUngroup = (groupIdx: number) => {
    if (handGroups.length <= 1) return;
    const targetGroup = handGroups[groupIdx];
    const otherGroups = handGroups.filter((_, idx) => idx !== groupIdx);
    if (otherGroups.length > 0) {
      otherGroups[0] = [...otherGroups[0], ...targetGroup];
    }
    setHandGroups(otherGroups);
    soundManager.playCardDraw();
  };

  // Move card between groups or reorder within group
  // "कार्ड को उठाकर अपने आप दूसरी साइड प्लेस कर सकते हैं। दूसरे कार्ड को उठाकर दूसरी साइड प्लेस कर सकते हैं।"
  const moveCardBetweenGroups = (
    fromGroupIdx: number,
    fromCardIdx: number,
    toGroupIdx: number,
    toCardIdx?: number
  ) => {
    if (fromGroupIdx < 0 || fromGroupIdx >= handGroups.length) return;
    // Guard against accidental drop on same group without valid new position
    if (toGroupIdx === fromGroupIdx && (typeof toCardIdx !== 'number' || toCardIdx === fromCardIdx)) {
      return;
    }

    const sourceGroup = [...handGroups[fromGroupIdx]];
    const [cardToMove] = sourceGroup.splice(fromCardIdx, 1);
    if (!cardToMove) return;

    const newGroups = [...handGroups];

    if (toGroupIdx === -1) {
      // Create new group on the side
      newGroups[fromGroupIdx] = sourceGroup;
      newGroups.push([cardToMove]);
    } else if (toGroupIdx === fromGroupIdx) {
      // Reordering within the same group
      const targetIdx = typeof toCardIdx === 'number' ? toCardIdx : sourceGroup.length;
      sourceGroup.splice(targetIdx, 0, cardToMove);
      newGroups[fromGroupIdx] = sourceGroup;
    } else {
      // Move to another group
      newGroups[fromGroupIdx] = sourceGroup;
      const targetGroup = [...(newGroups[toGroupIdx] || [])];
      const targetIdx = typeof toCardIdx === 'number' ? toCardIdx : targetGroup.length;
      targetGroup.splice(targetIdx, 0, cardToMove);
      newGroups[toGroupIdx] = targetGroup;
    }

    const filtered = newGroups.filter((g) => g.length > 0);
    setHandGroups(filtered);
    soundManager.playCardDraw();
  };

  // Move selected card to left side or right side
  const handleMoveSelectedCard = (direction: 'left' | 'right') => {
    if (selectedCardIds.length !== 1) return;
    const cardId = selectedCardIds[0];
    let foundGroupIdx = -1;
    let foundCardIdx = -1;

    for (let g = 0; g < handGroups.length; g++) {
      const cIdx = handGroups[g].findIndex((c) => c.id === cardId);
      if (cIdx !== -1) {
        foundGroupIdx = g;
        foundCardIdx = cIdx;
        break;
      }
    }

    if (foundGroupIdx === -1) return;

    if (direction === 'left') {
      if (foundCardIdx > 0) {
        moveCardBetweenGroups(foundGroupIdx, foundCardIdx, foundGroupIdx, foundCardIdx - 1);
      } else if (foundGroupIdx > 0) {
        moveCardBetweenGroups(foundGroupIdx, foundCardIdx, foundGroupIdx - 1);
      }
    } else {
      const curLen = handGroups[foundGroupIdx].length;
      if (foundCardIdx < curLen - 1) {
        moveCardBetweenGroups(foundGroupIdx, foundCardIdx, foundGroupIdx, foundCardIdx + 1);
      } else if (foundGroupIdx < handGroups.length - 1) {
        moveCardBetweenGroups(foundGroupIdx, foundCardIdx, foundGroupIdx + 1, 0);
      } else {
        moveCardBetweenGroups(foundGroupIdx, foundCardIdx, -1);
      }
    }
  };

  // Drag and Drop handlers
  const handleDragStartCard = (
    e: React.DragEvent,
    cardId: string,
    fromGroupIdx: number,
    fromCardIdx: number
  ) => {
    e.dataTransfer.setData('text/plain', cardId);
    setDraggedCardInfo({ cardId, fromGroupIdx, fromCardIdx });
  };

  const handleDragOverGroup = (e: React.DragEvent, groupIdx: number) => {
    e.preventDefault();
    setDragOverGroupIdx(groupIdx);
  };

  const handleDropOnGroup = (e: React.DragEvent, toGroupIdx: number) => {
    e.preventDefault();
    setDragOverGroupIdx(null);
    if (!draggedCardInfo) return;
    moveCardBetweenGroups(
      draggedCardInfo.fromGroupIdx,
      draggedCardInfo.fromCardIdx,
      toGroupIdx
    );
    setDraggedCardInfo(null);
  };

  // Touch drag and drop handlers for mobile devices
  const handleTouchStartCard = (
    e: React.TouchEvent,
    cardId: string,
    fromGroupIdx: number,
    fromCardIdx: number
  ) => {
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    isTouchDraggingRef.current = false;
    setTouchDragCard({ cardId, fromGroupIdx, fromCardIdx });
  };

  const handleTouchMoveCard = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
    if (dx > 12 || dy > 12) {
      isTouchDraggingRef.current = true;
    }
  };

  const handleTouchEndCard = (e: React.TouchEvent) => {
    if (!touchDragCard || !isTouchDraggingRef.current) {
      setTouchDragCard(null);
      touchStartPosRef.current = null;
      isTouchDraggingRef.current = false;
      return;
    }

    const touch = e.changedTouches[0];
    const elem = document.elementFromPoint(touch.clientX, touch.clientY);
    const discardTarget = elem?.closest('[data-drop-discard]');
    const dropTarget = elem?.closest('[data-drop-group]');

    if (discardTarget && isMyTurn && hasDrawn) {
      handleDiscard(touchDragCard.cardId);
    } else if (dropTarget) {
      const targetGroup = parseInt(dropTarget.getAttribute('data-drop-group') || '0', 10);
      if (targetGroup !== touchDragCard.fromGroupIdx) {
        moveCardBetweenGroups(
          touchDragCard.fromGroupIdx,
          touchDragCard.fromCardIdx,
          targetGroup
        );
      }
    }
    setTouchDragCard(null);
    touchStartPosRef.current = null;
    isTouchDraggingRef.current = false;
  };

  // Open Declare Modal with grouped hand
  const handleOpenDeclare = (specificFinishCardId?: string) => {
    if (!game || !user || actionLoading) return;
    if (!isMyTurn) {
      const turnPlayer = players.find((p) => p.uid === game.turnUid);
      const turnPlayerName = turnPlayer?.displayName || 'Opponent';
      setToastNotification(`👉 Declare / Show ke liye aapki turn honi chahiye! (Abhi ${turnPlayerName} ki turn hai)`);
      setTimeout(() => setToastNotification(null), 3500);
      return;
    }
    if (!myPlayer?.cards || myPlayer.cards.length === 0) return;
    const cards = handGroups.flat().length > 0 ? handGroups.flat() : [...myPlayer.cards];
    let finishCard: Card | null = null;
    let meldCards = cards;

    // In 13-card Indian Rummy, declaring requires exactly 13 cards.
    // If the player has drawn (14 cards in hand), 1 card is discarded to the finish slot.
    if (cards.length >= 14) {
      let finishIdx = -1;
      const targetCardId = specificFinishCardId || (selectedCardIds.length > 0 ? selectedCardIds[0] : null);
      if (targetCardId) {
        const candidateIdx = cards.findIndex((c) => c.id === targetCardId);
        if (candidateIdx !== -1) {
          const testRemaining = cards.filter((_, idx) => idx !== candidateIdx);
          const val = validateDeclaration(findBestMelds(testRemaining, wildJokerRank), wildJokerRank);
          if (val.isValid) {
            finishIdx = candidateIdx;
          }
        }
      }
      if (finishIdx === -1) {
        // Automatically check if any card, when removed, leaves a valid winning 13-card hand
        for (let i = cards.length - 1; i >= 0; i--) {
          const testRemaining = cards.filter((_, idx) => idx !== i);
          const testMelds = findBestMelds(testRemaining, wildJokerRank);
          const val = validateDeclaration(testMelds, wildJokerRank);
          if (val.isValid) {
            finishIdx = i;
            break;
          }
        }
      }
      if (finishIdx === -1) {
        const candidateIdx = targetCardId ? cards.findIndex((c) => c.id === targetCardId) : -1;
        finishIdx = candidateIdx !== -1 ? candidateIdx : cards.length - 1;
      }
      finishCard = cards[finishIdx];
      meldCards = cards.filter((_, idx) => idx !== finishIdx);
    }

    setDeclareFinishCard(finishCard);

    // Check if player's current groups form 13 cards
    const userGroupsWithoutFinish = handGroups
      .map((g) => (finishCard ? g.filter((c) => c.id !== finishCard.id) : g))
      .filter((g) => g.length > 0);
    const totalCount = userGroupsWithoutFinish.reduce((acc, g) => acc + g.length, 0);

    let chosenGroups: Card[][] = [];
    if (totalCount === 13 && userGroupsWithoutFinish.length >= 2) {
      const userVal = validateDeclaration(userGroupsWithoutFinish, wildJokerRank);
      if (userVal.isValid) {
        chosenGroups = userGroupsWithoutFinish;
      } else {
        const bestMelds = findBestMelds(meldCards, wildJokerRank);
        const bestVal = validateDeclaration(bestMelds, wildJokerRank);
        chosenGroups = bestVal.isValid ? bestMelds : userGroupsWithoutFinish;
      }
    } else {
      chosenGroups = findBestMelds(meldCards, wildJokerRank);
    }
    setDeclareGroups(chosenGroups);
    setShowDeclareModal(true);
  };

  const isMyTurn = game?.status === 'PLAYING' && game.turnUid === user?.uid;
  // If player has drawn or hand has 14+ cards, hasDrawn is guaranteed true
  const hasDrawn =
    optimisticHasDrawn !== null
      ? optimisticHasDrawn
      : Boolean(game?.hasDrawn) || Boolean(myPlayer?.cards && myPlayer.cards.length >= 14);

  const liveHandEvaluation = useMemo(() => {
    if (handGroups.length > 0) {
      return calculateLiveHandScore(handGroups, wildJokerRank);
    }
    if (myPlayer?.cards && myPlayer.cards.length > 0) {
      const best = findBestMelds(myPlayer.cards, wildJokerRank);
      return calculateLiveHandScore(best, wildJokerRank);
    }
    return {
      score: 80,
      pureSequenceCount: 0,
      totalSequenceCount: 0,
      validSetsCount: 0,
      totalMeldPoints: 0,
      hasPureSeq: false,
      hasTwoSeq: false,
      isWinningHand: false,
      unmatchedCardCount: 0,
    };
  }, [handGroups, myPlayer?.cards, wildJokerRank]);

  const currentHandPenalty = liveHandEvaluation.score;

  const handleLeaveTable = async () => {
    if (!game || !user) {
      if (user) {
        await clearActiveGameSession(user.uid, gameId);
      }
      router.push('/lobby');
      return;
    }
    // If player already dropped or eliminated, do not prompt for drop; leave immediately
    if (game.status === 'PLAYING' && myPlayer?.status !== 'dropped' && myPlayer?.status !== 'eliminated') {
      setShowDropModal(true);
      return;
    }
    setActionLoading(true);
    try {
      await leaveTable(game.gameId, game.tableId, user.uid);
      await clearActiveGameSession(user.uid, game.gameId);
    } catch (err) {
      console.warn('Seat release notice:', err);
    } finally {
      setActionLoading(false);
      router.push('/lobby');
    }
  };

  const handleReturnToLobbyFromDrop = async () => {
    if (user && game) {
      await clearActiveGameSession(user.uid, game.gameId);
    }
    router.push('/lobby');
  };

  const handlePlayNewMatchFromDrop = async () => {
    if (user && game) {
      await clearActiveGameSession(user.uid, game.gameId);
    }
    router.push(`/match/stakes?format=${game?.mode || 'points'}`);
  };

  // Actions
  const handleDraw = async (source: 'open' | 'closed') => {
    if (!game || !user || !isMyTurn || hasDrawn || actionLoading || isDrawingCard) return;
    setIsDrawingCard(true);
    setErrorToast(null);
    soundManager.playCardDraw();

    const prevOpenDeck = game.openDeck ? [...game.openDeck] : [];
    const prevClosedCount = game.closedDeckCount;
    const prevHandGroups = handGroups;
    const prevMyPlayer = myPlayer;

    if (source === 'open' && prevOpenDeck.length > 0) {
      const drawnCard = prevOpenDeck[prevOpenDeck.length - 1];
      const nextOpenDeck = prevOpenDeck.slice(0, -1);
      // Immediately reflect open card drawn in player's hand and deck
      setGame((prev) => (prev ? { ...prev, openDeck: nextOpenDeck, hasDrawn: true } : prev));
      setOptimisticHasDrawn(true);

      if (myPlayer) {
        const nextCards = [...(myPlayer.cards || []), drawnCard];
        setMyPlayer({ ...myPlayer, cards: nextCards, cardCount: nextCards.length });
      }
      if (handGroups.length > 0) {
        const nextGroups = handGroups.map((grp, idx) =>
          idx === handGroups.length - 1 ? [...grp, drawnCard] : grp
        );
        setHandGroups(nextGroups);
      } else {
        setHandGroups([[drawnCard]]);
      }
    } else {
      // Immediate feedback for closed deck draw: decrement count, mark drawn
      setOptimisticHasDrawn(true);
      setGame((prev) => (prev ? { ...prev, closedDeckCount: Math.max(0, (prev.closedDeckCount || 1) - 1), hasDrawn: true } : prev));
    }

    try {
      await drawCard(game.gameId, user.uid, source);
    } catch (err: unknown) {
      // Revert optimistic updates on error
      setOptimisticHasDrawn(null);
      setHandGroups(prevHandGroups);
      setMyPlayer(prevMyPlayer);
      setGame((prev) => (prev ? { ...prev, openDeck: prevOpenDeck, closedDeckCount: prevClosedCount, hasDrawn: false } : prev));
      setErrorToast(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDrawingCard(false);
    }
  };

  const handleDiscard = async (specificCardId?: string) => {
    if (!game || !user || actionLoading) return;

    if (!isMyTurn) {
      setToastNotification('👉 Opponent ki turn chal rahi hai, wait karein!');
      setTimeout(() => setToastNotification(null), 3000);
      return;
    }

    if (!hasDrawn) {
      setToastNotification('👉 Pehle Closed Deck ya Open Pile se card draw karein!');
      setTimeout(() => setToastNotification(null), 3000);
      return;
    }

    const allCards = handGroups.flat().length > 0 ? handGroups.flat() : (myPlayer?.cards || []);
    const targetId =
      specificCardId ||
      (selectedCardIds.length > 0 ? selectedCardIds[selectedCardIds.length - 1] : null);

    let cardObj = targetId ? allCards.find((c) => c.id === targetId) : null;
    if (!cardObj && allCards.length >= 14) {
      // If player has 14 cards and clicked Discard without explicit selection, use the last card
      cardObj = allCards[allCards.length - 1];
    }

    if (!cardObj) {
      setToastNotification('👉 Discard karne ke liye kisi card par tap karein!');
      setTimeout(() => setToastNotification(null), 3000);
      return;
    }

    // Optimistic UI update: Remove discarded card from local state immediately
    const prevHandGroups = handGroups;
    const prevMyPlayer = myPlayer;
    const prevGame = game;
    const discardedId = cardObj.id;

    const optimisticGroups = handGroups
      .map((grp) => grp.filter((c) => c.id !== discardedId))
      .filter((grp) => grp.length > 0);
    setHandGroups(optimisticGroups);

    if (myPlayer) {
      const remainingCards = (myPlayer.cards || []).filter((c) => c.id !== discardedId);
      setMyPlayer({
        ...myPlayer,
        cards: remainingCards,
        cardCount: remainingCards.length,
      });
    }

    // Immediately push discarded card to open pile (0ms perceived latency)
    setGame((prev) => (prev ? {
      ...prev,
      openDeck: [...(prev.openDeck || []), cardObj!],
      hasDrawn: false,
    } : prev));
    setOptimisticHasDrawn(false);

    setSelectedCardIds([]);
    soundManager.playCardDiscard();
    setActionLoading(true);
    setErrorToast(null);
    const safetyTimer = setTimeout(() => setActionLoading(false), 4000);

    try {
      await discardCard(game.gameId, user.uid, cardObj);
    } catch (err: unknown) {
      // Revert optimistic update on failure
      setHandGroups(prevHandGroups);
      setMyPlayer(prevMyPlayer);
      setGame(prevGame);
      setOptimisticHasDrawn(null);
      setErrorToast(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(safetyTimer);
      setActionLoading(false);
    }
  };

  const handleManualDrop = async () => {
    if (!game || !user || actionLoading) return;
    setActionLoading(true);
    setErrorToast(null);
    try {
      soundManager.playDropSound();
      await dropGame(game.gameId, user.uid);
      setShowDropModal(false);
    } catch (err: unknown) {
      setErrorToast(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleAutoSortHand = () => {
    if (!myPlayer?.cards) return;
    const sortedMelds = findBestMelds(myPlayer.cards, wildJokerRank);
    const validMelds = sortedMelds.length > 0 ? sortedMelds : [myPlayer.cards];
    setHandGroups(validMelds);
    setSelectedCardIds([]);
    soundManager.playCardDraw();

    const evalResult = calculateLiveHandScore(validMelds, wildJokerRank);
    if (evalResult.score === 0 || evalResult.isWinningHand) {
      if (isMyTurn) {
        setToastNotification('🎉 Hand sorted! Score: 0 • Declare window khul raha hai...');
        setTimeout(() => {
          handleOpenDeclare();
        }, 250);
      } else {
        const turnPlayer = players.find((p) => p.uid === game?.turnUid);
        const turnPlayerName = turnPlayer?.displayName || 'Opponent';
        setToastNotification(`🎉 Hand sorted! Score: 0 • ${turnPlayerName} ke baad aapki turn aate hi "DECLARE" daba kar win karein!`);
      }
      setTimeout(() => setToastNotification(null), 4000);
    }
  };

  const handleConfirmDeclare = async () => {
    if (!game || !user || actionLoading) return;
    setActionLoading(true);
    setErrorToast(null);

    try {
      const res = await declareHand(game.gameId, user.uid, declareGroups);
      if (!res.isValid) {
        setErrorToast(`Invalid Declaration: ${res.message}. 80 points penalty incurred.`);
      }
      setShowDeclareModal(false);
    } catch (err: unknown) {
      setErrorToast(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(false);
    }
  };

  // Up to 5 opponent slots for a 6-player table
  const opponents = players.filter((p) => p.uid !== user?.uid);
  const opponentSlots = [0, 1, 2, 3, 4]; // 5 potential opponent seats

  // Helper to render any opponent seat with accurate turn indicator, timer badge and waiting state
  const renderOpponentSeat = (opp: GamePlayerState | undefined, slotIdx: number, orientation: 'left' | 'right' | 'center') => {
    const isOppTurn = Boolean(opp && game?.status === 'PLAYING' && game?.turnUid === opp.uid);
    const isWaitingRoom = game?.status === 'WAITING';

    if (!opp) {
      if (isWaitingRoom) {
        return (
          <div className="flex items-center gap-1 sm:gap-1.5 opacity-85 animate-pulse">
            {orientation === 'right' ? (
              <>
                <div className="bg-black/80 border border-amber-500/40 rounded-full px-2 py-0.5 text-amber-300 text-[8px] sm:text-[9px] font-bold shadow flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping shrink-0" />
                  <span>Waiting...</span>
                </div>
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-amber-500/20 border border-amber-400/50 shadow-md flex items-center justify-center">
                  <Users className="w-3.5 h-3.5 text-amber-300" />
                </div>
              </>
            ) : (
              <>
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-amber-500/20 border border-amber-400/50 shadow-md flex items-center justify-center">
                  <Users className="w-3.5 h-3.5 text-amber-300" />
                </div>
                <div className="bg-black/80 border border-amber-500/40 rounded-full px-2 py-0.5 text-amber-300 text-[8px] sm:text-[9px] font-bold shadow flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping shrink-0" />
                  <span>Waiting...</span>
                </div>
              </>
            )}
          </div>
        );
      }

      return (
        <div className="flex items-center gap-1 opacity-45 pointer-events-none">
          {orientation === 'right' ? (
            <>
              <div className="bg-black/80 border border-white/10 rounded-full px-2 py-0.5 text-white/70 text-[8px] sm:text-[9px] font-medium shadow">
                Empty seat
              </div>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/10 border border-white/20 shadow-md flex items-center justify-center">
                <Users className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </>
          ) : (
            <>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/10 border border-white/20 shadow-md flex items-center justify-center">
                <Users className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="bg-black/80 border border-white/10 rounded-full px-2 py-0.5 text-white/70 text-[8px] sm:text-[9px] font-medium shadow">
                Empty seat
              </div>
            </>
          )}
        </div>
      );
    }

    // Player is seated!
    const avatarSize = slotIdx === 0 ? 'w-9 h-9 sm:w-11 sm:h-11' : 'w-7 h-7 sm:w-8 sm:h-8';
    const avatarRing = isOppTurn
      ? 'bg-[#00e676] ring-4 ring-[#00e676]/60 shadow-lg shadow-emerald-500/50 scale-105 animate-pulse'
      : 'bg-[#00e676]';

    const avatarContent = (
      <div className="relative shrink-0">
        <div className={`${avatarSize} rounded-full p-[2px] shadow-lg transition-all ${avatarRing}`}>
          <div className="w-full h-full rounded-full overflow-hidden bg-[#1a2233] flex items-center justify-center text-white font-black text-[10px] sm:text-xs">
            {opp.photoURL ? (
              <img src={opp.photoURL} alt={opp.displayName} className="w-full h-full object-cover" />
            ) : (
              <span>{opp.displayName?.slice(0, 2).toUpperCase() || 'P'}</span>
            )}
          </div>
        </div>

        {/* Dealer "D" Badge */}
        {opp.isDealer && (
          <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-[#f59e0b] border border-black/40 text-black font-black text-[8px] sm:text-[9px] flex items-center justify-center shadow absolute -top-1 -right-1 z-20">
            D
          </div>
        )}

        {/* Active Turn Countdown Timer Badge: ONLY when isOppTurn! */}
        {isOppTurn && (
          <div
            className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[#1e293b] border-2 font-mono font-black text-[8px] sm:text-[10px] flex items-center justify-center absolute -bottom-1 -left-1 sm:-bottom-1.5 sm:-left-1.5 shadow-lg z-20 ${
              turnTimeLeft <= 10 ? 'border-rose-500 text-rose-400 animate-pulse' : 'border-cyan-400 text-cyan-300'
            }`}
          >
            {turnTimeLeft}
          </div>
        )}
      </div>
    );

    const infoPill = (
      <div
        className={`bg-black/85 backdrop-blur border rounded-md sm:rounded-lg px-1.5 sm:px-2 py-0.5 min-w-[65px] sm:min-w-[75px] shadow text-left shrink-0 ${
          isOppTurn ? 'border-emerald-400 ring-1 ring-emerald-400/40' : 'border-white/10'
        }`}
      >
        <span className="block text-[8px] sm:text-[10px] font-bold text-white max-w-[80px] truncate leading-tight">
          {opp.displayName || 'Player'}
        </span>
        <span className="block text-[7px] sm:text-[9px] font-mono text-white/70 leading-tight">
          {opp.status === 'dropped' ? (
            <span className="text-rose-400 font-bold">Dropped</span>
          ) : opp.status === 'eliminated' ? (
            <span className="text-rose-400 font-bold">Eliminated</span>
          ) : isOppTurn ? (
            <span className="text-emerald-400 font-bold">Turn: {turnTimeLeft}s</span>
          ) : (
            <span>{opp.cardCount || 13} Cards</span>
          )}
        </span>
      </div>
    );

    return (
      <div className="flex items-center gap-1 sm:gap-1.5 relative pointer-events-auto">
        {orientation === 'right' ? (
          <>
            {infoPill}
            {avatarContent}
          </>
        ) : (
          <>
            {avatarContent}
            {infoPill}
          </>
        )}
      </div>
    );
  };

  if (playersLoaded && !myPlayer && game && game.status !== 'RESULT' && game.status !== 'COMPLETED') {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-[#07070a] text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md bg-[#12131e] border border-rose-500/30 rounded-3xl p-8 space-y-5 shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-black text-rose-400">Seat Not Found</h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                You are not seated in this <strong className="text-white">{game.mode.toUpperCase()}</strong> match table.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/lobby"
                className="inline-block w-full py-3 px-6 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-black font-extrabold text-xs uppercase shadow-lg hover:from-amber-300 hover:to-amber-400 transition-all cursor-pointer"
              >
                Return to Lobby
              </Link>
            </div>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      {/* Main Game Table (Adaptive for Phone, Tablet, & Desktop) */}
      <div className="h-[100dvh] max-h-[100dvh] bg-[#06070a] text-slate-100 flex flex-col select-none overflow-hidden relative">
        {/* Table Top Header Bar (Crimson Burgundy matching screenshot) */}
        <div className="bg-gradient-to-r from-[#70050d] via-[#870a14] to-[#70050d] border-b border-black/40 px-3 sm:px-5 py-1 flex items-center justify-between z-30 shrink-0 h-9 sm:h-11 shadow-lg">
          <div className="flex items-center gap-2">
            <button
              onClick={handleLeaveTable}
              className="p-1 rounded text-white/90 hover:text-white hover:bg-black/20 transition-colors flex items-center"
              title="Leave / Exit Table"
              aria-label="Leave Table"
            >
              <LogOut className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Match Info: # 20261021103657-49057-1 | Points (10) : Entry : 800 | 🪙 100000 */}
          <div className="flex items-center gap-2 sm:gap-4 text-[10px] sm:text-xs font-bold text-white tracking-wide">
            <span className="font-mono text-white/90">
              # {game?.gameId ? game.gameId.replace(/[^0-9]/g, '').slice(-16) || game.gameId.slice(-14) : '20261021103657-49057-1'}
            </span>
            <span className="text-white/40">|</span>
            <span className="text-white font-semibold">
              Points ({game?.pointValue || 10})
            </span>
            <span className="text-white/60">:</span>
            <span className="text-white font-semibold">
              Entry : {game?.entryFee || 800}
            </span>
            <span className="text-white/40">|</span>
            <span className="flex items-center gap-1 font-mono font-black text-white">
              <span className="text-amber-300">🪙</span>
              <span>
                {((wallet?.depositBalance || 0) + (wallet?.winBalance || 0) + (wallet?.bonusBalance || 0) || 100000).toLocaleString()}
              </span>
            </span>
          </div>

          {/* Right Controls: Mute, Rules, Auto-Rotate */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                soundManager.enabled = next;
              }}
              className="p-1 text-white/80 hover:text-white"
              title="Audio"
              aria-label={soundEnabled ? 'Mute Game Audio' : 'Unmute Game Audio'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-amber-300" /> : <VolumeX className="w-4 h-4 text-white/40" />}
            </button>

            <button
              onClick={() => setShowHowToPlayModal(true)}
              className="p-1 text-white/80 hover:text-white hidden sm:block"
              title="Game Rules"
              aria-label="Game Rules"
            >
              <BookOpen className="w-4 h-4 text-amber-300" />
            </button>

            <button
              onClick={handleToggleAutoRotate}
              className="p-1 text-white/80 hover:text-white"
              title="Rotate Screen"
              aria-label="Rotate Screen"
            >
              <RotateCw className="w-4 h-4 text-white/90" />
            </button>
          </div>
        </div>

        {/* Mobile Portrait Rotation Notification Bar */}
        {isPortrait && (
          <div className="bg-amber-500/25 border-b border-amber-500/40 px-3 py-0.5 flex items-center justify-between text-xs text-amber-100 z-30 shrink-0">
            <div className="flex items-center gap-1.5">
              <Smartphone className="w-3 h-3 text-amber-400 rotate-90 shrink-0" />
              <span className="text-[9px] sm:text-xs font-bold">
                📱 Hold phone sideways for full casino table view
              </span>
            </div>
            <button
              onClick={handleToggleAutoRotate}
              className="py-0.5 px-2 rounded bg-amber-400 hover:bg-amber-300 text-black text-[8px] font-black uppercase shadow shrink-0"
              aria-label="Rotate table view"
            >
              Rotate
            </button>
          </div>
        )}

        {/* Error Toast */}
        {errorToast && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 bg-rose-950/95 border border-rose-500/60 text-rose-200 text-xs px-3 py-1.5 rounded-xl shadow-2xl flex items-center gap-2 animate-bounce max-w-sm sm:max-w-md">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="truncate text-[10px] sm:text-xs">{errorToast}</span>
            <button onClick={() => setErrorToast(null)} className="ml-2 hover:text-white shrink-0">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* 
          6-PLAYER CIRCULAR/OVAL LUXURY CASINO TABLE (Exact Match to Screenshot)
        */}
        <div className="flex-1 relative flex flex-col items-center justify-between p-1 sm:p-2 w-full h-full max-h-[calc(100dvh-40px)] overflow-hidden">
          {/* Main Oval Table with Charcoal Rail & Casino Green Felt */}
          <div className="w-full max-w-6xl flex-1 max-h-[calc(100dvh-100px)] rounded-[32px] sm:rounded-[50px] md:rounded-[70px] bg-[#141518] p-1.5 sm:p-2.5 shadow-2xl relative border-4 border-[#22242a] flex items-center justify-center my-auto">
            {/* Emerald Green Felt Surface */}
            <div className="w-full h-full rounded-[24px] sm:rounded-[42px] md:rounded-[60px] bg-[#158045] border-2 border-[#1fa357]/60 shadow-inner relative flex flex-col justify-between p-1.5 sm:p-2.5 overflow-hidden">
              {/* Felt Watermark */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
                <span className="text-4xl sm:text-7xl md:text-9xl font-black text-white">♠ RUMMYADDA</span>
              </div>

              {/* 
                1. TOP SEATS & EMPTY SEATS ROW (Exact Placement matching luxury table layout)
              */}
              <div className="w-full relative z-20 flex items-center justify-between px-2 sm:px-6 pt-0.5 shrink-0">
                {/* Top-Left Seat (Opponent 2) */}
                <div className="flex items-center">
                  {renderOpponentSeat(opponents[1], 1, 'left')}
                </div>

                {/* Top-Center Main Opponent Seat (Opponent 1) */}
                <div className="flex items-center">
                  {renderOpponentSeat(opponents[0], 0, 'left')}
                </div>

                {/* Top-Right Seat (Opponent 3) */}
                <div className="flex items-center">
                  {renderOpponentSeat(opponents[2], 2, 'right')}
                </div>
              </div>

              {/* Middle Table Side Seats (Mid-Left & Mid-Right Seats) */}
              <div className="absolute inset-y-0 left-1 sm:left-3 flex items-center z-10">
                {renderOpponentSeat(opponents[3], 3, 'left')}
              </div>

              <div className="absolute inset-y-0 right-1 sm:right-3 flex items-center z-10">
                {renderOpponentSeat(opponents[4], 4, 'right')}
              </div>

              {/* 
                2. CENTER PLAY AREA (Closed Deck + Wild Joker under + FINISH SLOT + Open Deck + Blue Badge)
              */}
              <div className="flex-1 flex items-center justify-center gap-4 sm:gap-8 md:gap-12 relative z-20 my-auto py-1">
                {/* WAITING ROOM (when waiting for players) */}
                {game?.status === 'WAITING' && (
                  <div className="bg-black/90 backdrop-blur-md border border-amber-500/40 px-5 sm:px-8 py-3 sm:py-4 rounded-2xl text-center space-y-2.5 shadow-2xl max-w-xs sm:max-w-sm w-full animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      {/* Active Player and Boost Indicator */}
                      <div className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-black shadow-inner">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                        <span>
                          {players.length || 1} {players.length === 1 || !players.length ? 'player is active' : 'players are active'}
                        </span>
                        <span className="text-amber-400 font-black">/ Boost</span>
                      </div>

                      <div className="flex items-center justify-center gap-2 text-amber-400">
                        <Users className="w-3.5 h-3.5 animate-pulse" />
                        <span className="font-extrabold text-[11px] uppercase tracking-wider">
                          Matchmaking ({players.length}/{game?.maxPlayers || 2} Players)
                        </span>
                      </div>
                    </div>

                    {/* Circular Countdown Timer */}
                    <div className="py-1 flex flex-col items-center justify-center gap-1">
                      <div className="w-12 h-12 flex items-center justify-center relative">
                        <div className="absolute inset-0 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin" />
                        <span className="font-mono font-black text-lg text-amber-300 relative z-10">
                          {waitingTimeLeft > 0 ? waitingTimeLeft : '...'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-200 font-semibold mt-1">
                        {isBoosted
                          ? '⚡ Matchmaking Boosted! Searching priority queue...'
                          : waitingTimeLeft > 0
                          ? 'Searching for online players...'
                          : 'Waiting for real players to join...'}
                      </p>
                      <p className="text-[10px] text-emerald-400 font-medium">
                        100% Real Players Online • Zero Bots
                      </p>
                    </div>

                    {/* Boost Matchmaking Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsBoosted(true);
                        try {
                          soundManager.playTurnNotification();
                        } catch {}
                        setWaitingTimeLeft((prev) => Math.min(prev, 2));
                        if (canInjectBotIntoGame(game) && user) {
                          autoMatchWithBots(game.gameId, user.uid).catch((err) =>
                            console.error('Boost auto-match error:', err)
                          );
                        }
                      }}
                      disabled={isBoosted}
                      className={`w-full py-2 px-3 rounded-xl font-black text-xs transition-all cursor-pointer shadow-lg flex items-center justify-center gap-1.5 ${
                        isBoosted
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border border-emerald-400/50 shadow-emerald-500/20'
                          : 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 active:scale-95 text-slate-950 border border-amber-300 shadow-amber-500/30'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5 fill-current text-current animate-pulse" />
                      <span>
                        {isBoosted
                          ? '⚡ Boost Active • Fast Matching'
                          : '⚡ Boost Matchmaking'}
                      </span>
                    </button>

                    {/* Optional Practice Table Bot Match Button (STRICTLY restricted to practice tables, NEVER rendered on cash tables) */}
                    {canInjectBotIntoGame(game) && !isBoosted && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!user || !game) return;
                          try {
                            await autoMatchWithBots(game.gameId, user.uid);
                          } catch (err) {
                            console.error('Bot match error:', err);
                          }
                        }}
                        className="w-full py-1.5 px-3 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-bold text-[10px] border border-amber-500/30 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <span>🤖 Add AI Opponent (Practice Mode)</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleLeaveQueue}
                      disabled={leavingQueue}
                      className="w-full py-2 px-3 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold text-xs border border-rose-500/30 transition-colors cursor-pointer shadow-md"
                    >
                      {leavingQueue ? 'Refunding...' : 'Cancel Table (Full Refund)'}
                    </button>
                  </div>
                )}

                {/* 15-SECOND SYNCHRONIZED COUNTDOWN */}
                {game?.status === 'COUNTDOWN' && (
                  <div className="bg-black/85 backdrop-blur-md border border-amber-400 px-6 sm:px-8 py-3 rounded-2xl text-center space-y-1 shadow-2xl animate-pulse">
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                      Match Starting ({players.length}/{game?.maxPlayers || 2} Players)
                    </span>
                    <div className="text-3xl sm:text-4xl font-black text-amber-300 font-mono">
                      {countdownLeft}s
                    </div>
                    <p className="text-[10px] text-slate-300">Dealing 13 cards...</p>
                  </div>
                )}

                {/* ACTIVE PLAYING CENTER DECK DISPLAY */}
                {game?.status === 'PLAYING' && (
                  <div className="flex items-center justify-center gap-4 sm:gap-7 md:gap-10">
                    {/* Left: Closed Deck with Wild Joker Underneath */}
                    <div className="relative flex items-center justify-center">
                      {/* Wild Joker peeking horizontally underneath */}
                      {game.wildJoker && (
                        <div className="absolute -left-7 sm:-left-9 -top-1 sm:top-0 z-0 transform -rotate-12 hover:-rotate-6 transition-transform shadow-lg pointer-events-none">
                          <PlayingCard card={game.wildJoker} size="sm" disabled />
                        </div>
                      )}
                      {/* Closed Deck */}
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Draw card from closed deck. ${game.closedDeckCount} cards remaining.`}
                        onClick={() => handleDraw('closed')}
                        className={`relative z-10 w-11 h-16 min-[390px]:w-12 min-[390px]:h-17 sm:w-15 sm:h-21 rounded-lg bg-gradient-to-br from-[#721019] via-[#4d070d] to-[#721019] border-2 border-amber-400/90 shadow-2xl flex flex-col items-center justify-center cursor-pointer transition-all active:scale-95 ${
                          isMyTurn && !hasDrawn
                            ? 'ring-4 ring-amber-400 shadow-amber-400/50 scale-105 animate-pulse'
                            : 'hover:scale-102'
                        }`}
                      >
                        <div className="w-8 h-13 min-[390px]:w-9 min-[390px]:h-14 sm:w-11 sm:h-17 rounded border border-amber-300/40 flex flex-col items-center justify-center bg-black/25 p-0.5 text-center">
                          <span className="text-[6px] sm:text-[8px] font-black text-amber-300 tracking-wider uppercase leading-none">RUMMY</span>
                          <span className="text-[5px] sm:text-[7px] font-bold text-amber-200/80 uppercase leading-none">LEAGUE</span>
                          <span className="text-xs sm:text-base text-amber-400 mt-0.5">♠</span>
                        </div>
                      </div>
                    </div>

                    {/* Middle: FINISH / DECLARE SLOT */}
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label="Finish slot. Declare or show hand here."
                      onClick={() => handleOpenDeclare()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const cardId = e.dataTransfer.getData('text/plain');
                        if (cardId) {
                          setSelectedCardIds([cardId]);
                        }
                        handleOpenDeclare(cardId || undefined);
                      }}
                      className={`w-11 h-16 min-[390px]:w-12 min-[390px]:h-17 sm:w-15 sm:h-21 rounded-lg bg-[#0b3319] border-2 border-dashed shadow-xl flex flex-col items-center justify-center cursor-pointer transition-all active:scale-95 group ${
                        currentHandPenalty === 0 && isMyTurn
                          ? 'border-emerald-300 ring-4 ring-emerald-400/60 shadow-emerald-400/50 animate-pulse bg-[#104222]'
                          : 'border-emerald-400/60 hover:border-emerald-300 hover:bg-[#104222]'
                      }`}
                      title="FINISH SLOT - Click or Drag Card Here to Declare Hand"
                    >
                      <span className="text-[8px] sm:text-[10px] text-amber-300 mb-0.5">🏆</span>
                      <span className="text-[7px] sm:text-[9px] font-black text-emerald-300 group-hover:text-white uppercase tracking-wider leading-tight">
                        DECLARE
                      </span>
                      <span className="text-[6px] sm:text-[8px] font-bold text-emerald-400/80 group-hover:text-emerald-200 uppercase tracking-widest leading-tight">
                        FINISH
                      </span>
                    </div>

                    {/* Right: Open Deck with Blue ">> Open Card" Badge */}
                    <div className="relative flex items-center justify-center">
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={isMyTurn && hasDrawn ? 'Discard card to open deck' : 'Draw from open deck'}
                        onClick={() => {
                          if (isMyTurn && !hasDrawn) {
                            handleDraw('open');
                          } else if (isMyTurn && hasDrawn && selectedCardIds.length > 0) {
                            handleDiscard(selectedCardIds[selectedCardIds.length - 1]);
                          }
                        }}
                        className={`relative z-10 rounded-lg cursor-pointer transition-all active:scale-95 ${
                          isMyTurn && !hasDrawn
                            ? 'ring-4 ring-amber-400 shadow-xl shadow-amber-400/50 scale-105'
                            : isMyTurn && hasDrawn
                            ? 'ring-2 ring-amber-400 shadow-lg'
                            : ''
                        }`}
                      >
                        {game.openDeck && game.openDeck.length > 0 ? (
                          <PlayingCard
                            card={game.openDeck[game.openDeck.length - 1]}
                            wildJokerRank={wildJokerRank}
                            size="sm"
                            disabled={!isMyTurn}
                          />
                        ) : (
                          <div className="w-11 h-16 min-[390px]:w-12 min-[390px]:h-17 sm:w-15 sm:h-21 rounded-lg border-2 border-dashed border-white/30 flex items-center justify-center text-xs text-slate-400 bg-black/20">
                            Empty
                          </div>
                        )}
                      </div>

                      {/* Blue Open Card Badge (attached to top-right) */}
                      <div className="absolute -top-1 -right-8 sm:-right-9 z-20 bg-[#1976d2] text-white text-[7px] sm:text-[8px] font-black px-1.5 py-0.5 rounded shadow flex flex-col items-center leading-tight pointer-events-none">
                        <span>&gt;&gt;</span>
                        <span>Open</span>
                        <span>Card</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 
                3. PLAYER HAND & GROUPS (Arranged across lower felt with Status Pills)
              */}
              <div className="w-full relative z-30 shrink-0 flex flex-col items-center gap-0.5 pb-0.5">
                {/* Floating Toast Notification */}
                {toastNotification && (
                  <div className="absolute -top-9 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-amber-400 to-amber-500 text-black font-black text-xs px-4 py-1 rounded-full shadow-2xl animate-bounce">
                    {toastNotification}
                  </div>
                )}

                {/* 0-Score Winning Hand Announcement Banner with Direct Declare Trigger */}
                {currentHandPenalty === 0 && myPlayer?.status !== 'dropped' && game?.status === 'PLAYING' && (
                  <div className="mb-1 z-40 bg-gradient-to-r from-emerald-600/90 via-teal-600/90 to-emerald-600/90 backdrop-blur-md border border-emerald-300/70 text-white px-3 py-1 rounded-full shadow-xl shadow-emerald-500/30 flex items-center gap-2 animate-pulse">
                    <span className="text-xs">🏆</span>
                    <span className="text-[10px] sm:text-xs font-black tracking-wide">
                      {isMyTurn ? 'Hand Complete! Score: 0' : 'Score: 0 — Ready to Win!'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenDeclare()}
                      className="ml-1 px-2.5 py-0.5 rounded-full bg-amber-400 hover:bg-amber-300 text-black font-black text-[9px] sm:text-[10px] uppercase shadow active:scale-95 transition-transform cursor-pointer"
                    >
                      DECLARE NOW ➜
                    </button>
                  </div>
                )}

                {/* Multi-Card Selection Actions Bar */}
                {selectedCardIds.length >= 2 && (
                  <div className="flex items-center gap-2 mb-1 z-40">
                    <button
                      type="button"
                      onClick={handleCreateSetFromSelection}
                      className="py-1 px-4 rounded-full font-black text-xs uppercase shadow-xl flex items-center gap-1.5 cursor-pointer bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-black ring-1 ring-amber-300 hover:scale-105 active:scale-95 transition-all"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>GROUP ({selectedCardIds.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCardIds([])}
                      className="py-1 px-3 rounded-full bg-black/80 hover:bg-black text-slate-300 hover:text-white text-xs font-bold border border-white/20 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Single Card Actions Bar */}
                {selectedCardIds.length === 1 && (
                  <div className="flex items-center gap-1 mb-0.5 z-40 bg-black/85 backdrop-blur px-2.5 py-0.5 rounded-full border border-amber-500/30 shadow-lg text-[9px]">
                    {isMyTurn && hasDrawn && (
                      <button
                        onClick={() => handleDiscard(selectedCardIds[0])}
                        className="py-0.5 px-2.5 rounded bg-gradient-to-r from-amber-400 to-amber-500 text-black font-black uppercase text-[9px] shadow animate-pulse flex items-center gap-1 cursor-pointer active:scale-95"
                      >
                        <span>🗑️ Discard</span>
                      </button>
                    )}
                    {isMyTurn && (
                      <button
                        type="button"
                        onClick={() => handleOpenDeclare(selectedCardIds[0])}
                        className="py-0.5 px-2 rounded bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-black uppercase text-[9px] shadow flex items-center gap-1 cursor-pointer active:scale-95"
                        title="Declare hand using this card as finish discard"
                      >
                        <span>🏆 Declare</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleMoveSelectedCard('left')}
                      className="py-0.5 px-1.5 rounded bg-white/10 hover:bg-white/20 text-white font-bold text-[8px]"
                    >
                      ← Left
                    </button>
                    <button
                      onClick={() => handleMoveSelectedCard('right')}
                      className="py-0.5 px-1.5 rounded bg-white/10 hover:bg-white/20 text-white font-bold text-[8px]"
                    >
                      Right →
                    </button>
                    <button
                      onClick={() => moveCardBetweenGroups(-1, 0, -1)}
                      className="py-0.5 px-1.5 rounded bg-amber-500/25 hover:bg-amber-500/40 text-amber-300 font-bold text-[8px]"
                    >
                      + Group
                    </button>
                    <button
                      onClick={() => setSelectedCardIds([])}
                      className="py-0.5 px-1 text-slate-400 hover:text-white text-[8px]"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Hand Groups with Status Pills matching screenshot */}
                {handGroups.length > 0 && (
                  <div className="w-full max-w-full px-1 flex items-end justify-center gap-1 sm:gap-2.5 overflow-x-hidden pt-1 pb-0.5">
                    {handGroups.map((group, groupIdx) => {
                      const meldStatus = getGroupMeldStatus(group, wildJokerRank);
                      const isOver = dragOverGroupIdx === groupIdx;
                      const groupScore = getGroupPoints(group, wildJokerRank);

                      return (
                        <div
                          key={`group-${groupIdx}`}
                          data-drop-group={groupIdx}
                          onDragOver={(e) => handleDragOverGroup(e, groupIdx)}
                          onDragLeave={() => setDragOverGroupIdx(null)}
                          onDrop={(e) => handleDropOnGroup(e, groupIdx)}
                          className={`relative rounded-lg p-0.5 transition-all flex flex-col items-center gap-0.5 shrink-0 ${
                            isOver ? 'ring-2 ring-amber-400 bg-amber-500/20 scale-105' : ''
                          }`}
                        >
                          {/* Floating Group Status Pill (Exact match to screenshot) */}
                          <div className="mb-0.5 flex items-center justify-center">
                            {meldStatus.type === 'pure_seq' ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white font-bold text-[8px] sm:text-[9px] shadow flex items-center gap-1 leading-none">
                                ✓ Pure Seq (0)
                              </span>
                            ) : meldStatus.type === 'impure_seq' ? (
                              <span className="px-2 py-0.5 rounded-full bg-teal-600 text-white font-bold text-[8px] sm:text-[9px] shadow flex items-center gap-1 leading-none">
                                ⭐ Joker Seq (0)
                              </span>
                            ) : meldStatus.type === 'set' ? (
                              <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white font-bold text-[8px] sm:text-[9px] shadow flex items-center gap-1 leading-none">
                                ✓ Valid Set (0)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-black/90 text-white font-bold text-[8px] sm:text-[9px] border border-white/20 shadow flex items-center gap-1 leading-none">
                                <span className="w-3 h-3 rounded-full bg-red-600 text-white flex items-center justify-center text-[7px] font-black leading-none">
                                  ✕
                                </span>
                                <span>Invalid ({groupScore})</span>
                              </span>
                            )}
                          </div>

                          {/* Horizontally Overlapping Cards in Group */}
                          <div className="flex items-center -space-x-[22px] min-[390px]:-space-x-[24px] min-[420px]:-space-x-[26px] sm:-space-x-[30px] md:-space-x-[32px] overflow-visible px-0.5 py-0.5">
                            {group.map((card, cardIdx) => {
                              const isSelected = selectedCardIds.includes(card.id);

                              return (
                                <div
                                  key={card.id}
                                  className="relative group/c shrink-0"
                                  style={{
                                    zIndex: isSelected ? 40 : cardIdx + 1,
                                  }}
                                  draggable={true}
                                  onDragStart={(e) => handleDragStartCard(e, card.id, groupIdx, cardIdx)}
                                  onTouchStart={(e) => handleTouchStartCard(e, card.id, groupIdx, cardIdx)}
                                  onTouchMove={handleTouchMoveCard}
                                  onTouchEnd={handleTouchEndCard}
                                >
                                  <PlayingCard
                                    card={card}
                                    wildJokerRank={wildJokerRank}
                                    isSelected={isSelected}
                                    onClick={() => handleCardClick(card.id)}
                                    size="hand"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {/* Button to Create New Group (if < 5 groups) */}
                    {handGroups.length < 5 && (
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label="Create new card group"
                        data-drop-group={-1}
                        onDragOver={(e) => handleDragOverGroup(e, -1)}
                        onDrop={(e) => handleDropOnGroup(e, -1)}
                        className="rounded-lg border border-dashed border-white/30 hover:border-amber-400 p-0.5 flex flex-col items-center justify-center text-[7px] text-white/70 hover:text-amber-300 cursor-pointer w-6 min-[390px]:w-7 sm:w-8 h-[58px] min-[390px]:h-[64px] min-[420px]:h-[70px] sm:h-[82px] md:h-[94px] shrink-0 transition-colors"
                        title="Drag card here or click to create new group"
                      >
                        <span className="text-xs font-bold leading-none">+</span>
                        <span className="text-[6px]">Grp</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Fallback Single Flat Hand if handGroups empty */}
                {handGroups.length === 0 && myPlayer?.cards && myPlayer.cards.length > 0 && (
                  <div className="flex items-center justify-center -space-x-[22px] min-[390px]:-space-x-[24px] min-[420px]:-space-x-[26px] sm:-space-x-[30px] md:-space-x-[32px] max-w-full overflow-x-hidden pt-1 pb-0.5 px-1">
                    {myPlayer.cards.map((card, cardIdx) => {
                      const isSelected = selectedCardIds.includes(card.id);
                      return (
                        <div
                          key={card.id}
                          className="relative group shrink-0"
                          style={{
                            zIndex: isSelected ? 40 : cardIdx + 1,
                          }}
                        >
                          <PlayingCard
                            card={card}
                            wildJokerRank={wildJokerRank}
                            isSelected={isSelected}
                            onClick={() => handleCardClick(card.id)}
                            size="hand"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 
            4. BOTTOM BAR / CONTROL DOCK (Exact match to screenshot)
            Score pill + REFRESH button on left | User seat in center | DISCARD + DROP on right
          */}
          <div className="w-full bg-[#0a0a0c]/95 border-t border-white/10 px-2 sm:px-4 py-1 sm:py-1.5 flex items-center justify-between z-40 shrink-0 h-12 sm:h-14">
            {/* Left: Score Pill, Golden SORT Button & Quick DECLARE Button right beside it */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {/* Score : XX Pill */}
              <div
                className={`px-2 sm:px-3 py-1 rounded-full border text-[10px] sm:text-xs font-bold shadow flex items-center gap-1 transition-all ${
                  currentHandPenalty === 0
                    ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300 ring-2 ring-emerald-500/40'
                    : 'bg-black/90 border-white/40 text-white'
                }`}
                title="Current penalty score. Goal is 0 points to declare."
              >
                <span className={currentHandPenalty === 0 ? 'text-emerald-300' : 'text-white/80'}>Score :</span>
                <span className="font-mono font-black text-white">{currentHandPenalty}</span>
              </div>

              {/* SORT Button (previously named REFRESH) */}
              <button
                type="button"
                onClick={handleAutoSortHand}
                disabled={actionLoading || myPlayer?.status === 'dropped'}
                className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg bg-gradient-to-b from-[#fcd34d] to-[#f59e0b] border border-amber-300 text-black font-black text-[10px] sm:text-xs uppercase shadow hover:brightness-105 active:scale-95 transition-all cursor-pointer disabled:opacity-40"
                title="Sort & Group Hand"
              >
                SORT
              </button>

              {/* 🏆 DECLARE Button: Placed right next to SORT */}
              {game?.status === 'PLAYING' && myPlayer?.status !== 'dropped' && (
                <button
                  type="button"
                  onClick={() => handleOpenDeclare()}
                  disabled={actionLoading}
                  className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg font-black text-[10px] sm:text-xs uppercase shadow transition-all cursor-pointer flex items-center gap-1 ${
                    currentHandPenalty === 0 && isMyTurn
                      ? 'bg-gradient-to-r from-emerald-500 via-green-400 to-teal-400 border border-emerald-300 text-black shadow-lg shadow-emerald-500/50 animate-pulse hover:scale-105 active:scale-95'
                      : isMyTurn && hasDrawn
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 border border-emerald-400 text-white hover:brightness-110 active:scale-95 shadow-md'
                      : currentHandPenalty === 0
                      ? 'bg-emerald-700/80 border border-emerald-400/60 text-emerald-100 hover:brightness-110 animate-pulse'
                      : 'bg-emerald-950/70 border border-emerald-600/40 text-emerald-300 hover:text-white hover:border-emerald-500 active:scale-95'
                  }`}
                  title={
                    currentHandPenalty === 0
                      ? 'Score is 0! Click to Declare Hand and Win'
                      : isMyTurn
                      ? 'Declare Hand Show'
                      : 'Declare Hand (Available on your turn)'
                  }
                >
                  <span className="text-xs">🏆</span>
                  <span>DECLARE</span>
                </button>
              )}
            </div>

            {/* Center: Bottom User Seat with Green Ring Avatar & Circular Countdown Timer (ONLY when isMyTurn) */}
            <div className="flex items-center gap-1 sm:gap-1.5 relative shrink min-w-0">
              <div className="relative shrink-0">
                {/* Neon Green Circular Ring Avatar */}
                <div
                  className={`w-8 h-8 sm:w-11 sm:h-11 rounded-full p-[2px] shadow-lg transition-all ${
                    isMyTurn ? 'bg-[#00e676] ring-4 ring-[#00e676]/60 shadow-lg shadow-emerald-500/50 animate-pulse scale-105' : 'bg-[#00e676]'
                  }`}
                >
                  <div className="w-full h-full rounded-full overflow-hidden bg-[#1a2233] flex items-center justify-center text-white font-black text-xs sm:text-sm">
                    {user?.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={profile?.displayName || user?.displayName || 'User'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>{(profile?.displayName || user?.displayName || 'U').slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                </div>

                {/* Dealer "D" Badge */}
                {myPlayer?.isDealer && (
                  <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-[#f59e0b] border border-black/40 text-black font-black text-[8px] sm:text-[9px] flex items-center justify-center shadow absolute -top-1 -right-1 z-20">
                    D
                  </div>
                )}

                {/* Circular Countdown Timer Badge at Bottom-Left: ONLY when isMyTurn! */}
                {isMyTurn && (
                  <div
                    className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[#1e293b] border-2 font-mono font-black text-[8px] sm:text-[10px] flex items-center justify-center absolute -bottom-1 -left-1 shadow-lg z-20 ${
                      turnTimeLeft <= 10 ? 'border-rose-500 text-rose-400 animate-pulse' : 'border-cyan-400 text-cyan-300'
                    }`}
                  >
                    {turnTimeLeft}
                  </div>
                )}
              </div>

              {/* Dark Pill with Username & Chip Balance / Turn status */}
              <div
                className={`hidden min-[400px]:block bg-black/85 backdrop-blur border rounded-md sm:rounded-lg px-1.5 sm:px-2 py-0.5 max-w-[65px] sm:max-w-[85px] shadow text-left shrink min-w-0 ${
                  isMyTurn ? 'border-emerald-400 ring-1 ring-emerald-400/40' : 'border-white/10'
                }`}
              >
                <span className="block text-[8px] sm:text-[10px] font-bold text-white max-w-[85px] truncate leading-tight">
                  {profile?.displayName || user?.displayName || 'User'}
                </span>
                <span className="block text-[7px] sm:text-[9px] font-mono text-white/80 leading-tight truncate">
                  {isMyTurn ? (
                    <span className="text-emerald-400 font-bold">Your Turn</span>
                  ) : game?.status === 'WAITING' ? (
                    <span className="text-emerald-400 font-bold">1 Active / Boost</span>
                  ) : (
                    ((wallet?.depositBalance || 0) + (wallet?.winBalance || 0) + (wallet?.bonusBalance || 0) || 100000).toLocaleString()
                  )}
                </span>
              </div>
            </div>

            {/* Right: DISCARD & Coral DROP Button */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {isMyTurn && hasDrawn && (
                <button
                  type="button"
                  onClick={() => handleDiscard()}
                  disabled={actionLoading || myPlayer?.status === 'dropped'}
                  className="px-2 sm:px-3.5 py-1 sm:py-1.5 rounded-lg bg-gradient-to-b from-amber-400 to-yellow-500 border border-yellow-300 text-black font-black text-[10px] sm:text-xs uppercase shadow hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  title="Discard Selected Card"
                >
                  DISCARD
                </button>
              )}

              {/* Coral / Salmon DROP Button */}
              <button
                type="button"
                onClick={() => setShowDropModal(true)}
                disabled={actionLoading || game?.status !== 'PLAYING' || myPlayer?.status === 'dropped'}
                className="px-2 sm:px-3.5 py-1 sm:py-1.5 rounded-lg bg-gradient-to-b from-[#e06d53] to-[#c84b31] border border-rose-300/60 text-white font-black text-[10px] sm:text-xs uppercase shadow hover:brightness-105 active:scale-95 transition-all cursor-pointer disabled:opacity-40"
                title="Drop Match"
              >
                DROP
              </button>
            </div>
          </div>
        </div>

        {/* 
          HOW TO PLAY TUTORIAL MODAL
        */}
        <HowToPlayModal
          isOpen={showHowToPlayModal}
          onClose={() => setShowHowToPlayModal(false)}
        />

        {/* 
          DECLARATION REVIEW MODAL 
        */}
        {showDeclareModal && (() => {
          const declareValidation = validateDeclaration(declareGroups, wildJokerRank);
          return (
            <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
              <div className="bg-[#12131e] border border-amber-500/40 rounded-3xl p-5 sm:p-6 max-w-2xl w-full space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                      <span>Declare Hand Show</span>
                      {declareValidation.isValid ? (
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-full font-black">
                          VALID SHOW ✓
                        </span>
                      ) : (
                        <span className="text-[10px] bg-rose-500/20 text-rose-400 border border-rose-500/40 px-2 py-0.5 rounded-full font-black">
                          INCOMPLETE ⚠️
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Valid show requires at least 2 sequences (including at least 1 Pure Sequence without jokers).
                    </p>
                  </div>
                  <button
                    onClick={() => setShowDeclareModal(false)}
                    className="p-1 rounded-lg hover:bg-white/10 text-slate-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Finish / Discard Card (if drawn 14th card) */}
                {declareFinishCard && (
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-black/60 border border-amber-500/30">
                    <span className="text-xs font-bold text-amber-300">Finish / Discard Card:</span>
                    <PlayingCard card={declareFinishCard} wildJokerRank={wildJokerRank} size="sm" disabled />
                    <span className="text-[10px] text-slate-400">Discarded to finish hand declaration</span>
                  </div>
                )}

                {/* Live Meld Validation Banner */}
                {declareValidation.isValid ? (
                  <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>Valid Show!</strong> All 13 cards form valid melds ({declareValidation.pureSequenceCount} Pure Seq, {declareValidation.totalSequenceCount} Total Seq). You will win this match!
                    </span>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>
                      <strong>Warning:</strong> {declareValidation.message} Declaring an invalid hand incurs an <strong>80 points penalty</strong>!
                    </span>
                  </div>
                )}

                {/* Grouping Area */}
                <div className="space-y-2.5">
                  <p className="text-xs text-amber-300 font-semibold">Your Grouped Cards (13 Cards):</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {declareGroups.map((grp, gIdx) => {
                      const grpStatus = getGroupMeldStatus(grp, wildJokerRank);

                      return (
                        <div key={gIdx} className="p-2.5 rounded-xl bg-[#090a12] border border-white/5 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-bold">
                            <span className="text-slate-400">Group {gIdx + 1} ({grp.length} Cards)</span>
                            <span className={
                              grpStatus.type === 'pure_seq'
                                ? 'text-emerald-400'
                                : grpStatus.type === 'impure_seq'
                                ? 'text-teal-300'
                                : grpStatus.type === 'set'
                                ? 'text-amber-300'
                                : 'text-rose-400'
                            }>
                              {grpStatus.type === 'pure_seq'
                                ? 'Pure Sequence ✓'
                                : grpStatus.type === 'impure_seq'
                                ? `Joker Sequence ⭐ (${grp.length})`
                                : grpStatus.type === 'set'
                                ? (grpStatus.hasJoker ? `Joker Set ⭐ (${grp.length})` : `Valid Set ✓ (${grp.length})`)
                                : 'Unmelded ✕'}
                            </span>
                          </div>
                          <div className="flex -space-x-2 overflow-x-auto py-0.5">
                            {grp.map((c) => (
                              <PlayingCard key={c.id} card={c} wildJokerRank={wildJokerRank} size="sm" disabled />
                            ))}
                          </div>
                          {grpStatus.hasJoker && grpStatus.isValid && grpStatus.detailText && (
                            <div className="text-[9px] text-amber-300 font-medium">
                              💡 {grpStatus.detailText}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                  <button
                    onClick={() => setShowDeclareModal(false)}
                    className="py-2 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-slate-300"
                  >
                    Cancel / Keep Playing
                  </button>
                  <button
                    onClick={handleConfirmDeclare}
                    disabled={actionLoading}
                    className={`py-2.5 px-6 rounded-xl font-black text-xs uppercase shadow-md transition-all ${
                      declareValidation.isValid
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-black hover:scale-105 shadow-emerald-500/30'
                        : 'bg-rose-600/80 hover:bg-rose-600 text-white'
                    }`}
                  >
                    {declareValidation.isValid ? 'Confirm & Win Match 🏆' : 'Submit Anyway (Risk 80 Pts)'}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 
          DROP CONFIRMATION MODAL 
        */}
        {showDropModal && (() => {
          const entryFee = game?.entryFee || 20;
          const dropInfo = calculateDropPenalty(
            entryFee,
            game?.pointValue || (entryFee / 80),
            myPlayer?.turnsCount || 0,
            isMyTurn && Boolean(hasDrawn)
          );
          const refundAmount = Math.max(0, entryFee - dropInfo.penaltyRupees);

          return (
            <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-[#12131e] border border-rose-500/50 rounded-3xl p-5 sm:p-6 max-w-sm w-full space-y-4 shadow-2xl text-center">
                <div className="w-12 h-12 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 mx-auto text-xl font-bold">
                  ⚠️
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">
                    {dropInfo.isFirstDrop ? 'Confirm First Drop?' : 'Confirm Middle Drop?'}
                  </h3>
                  <span className="inline-block mt-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    {dropInfo.isFirstDrop ? 'First Drop: 20 Points (25%)' : 'Middle Drop: 40 Points (50%)'}
                  </span>
                </div>

                <div className="bg-black/60 border border-white/10 rounded-2xl p-3.5 space-y-2 text-xs text-left">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Table Entry Buy-in:</span>
                    <span className="font-mono font-bold text-white">₹{entryFee}</span>
                  </div>
                  <div className="flex items-center justify-between text-rose-400 font-bold">
                    <span>Drop Penalty ({dropInfo.isFirstDrop ? '25%' : '50%'}):</span>
                    <span className="font-mono text-sm font-black">-₹{dropInfo.penaltyRupees}</span>
                  </div>
                  <div className="flex items-center justify-between text-emerald-400 font-bold pt-1.5 border-t border-white/10">
                    <span>Refunded to Wallet:</span>
                    <span className="font-mono text-sm font-black">+₹{refundAmount}</span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {dropInfo.isFirstDrop
                    ? `First drop penalty ₹${dropInfo.penaltyRupees} will be deducted and remaining ₹${refundAmount} will be returned to your wallet.`
                    : `Middle drop penalty ₹${dropInfo.penaltyRupees} will be deducted and remaining ₹${refundAmount} will be returned to your wallet.`}
                </p>

                <div className="flex items-center justify-center gap-3 pt-1">
                  <button
                    onClick={() => setShowDropModal(false)}
                    className="py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-slate-300 transition-colors"
                  >
                    Keep Playing
                  </button>
                  <button
                    onClick={handleManualDrop}
                    disabled={actionLoading}
                    className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white text-xs font-black uppercase shadow-lg shadow-rose-600/30 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {actionLoading ? 'Dropping...' : `Confirm Drop (-₹${dropInfo.penaltyRupees})`}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 
          DROPPED PLAYER OVERLAY (Displayed when player drops from active match)
        */}
        {myPlayer?.status === 'dropped' && game?.status !== 'RESULT' && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-[#12131e] border border-rose-500/50 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
              <div className="w-14 h-14 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 mx-auto text-2xl">
                🏳️
              </div>
              <div>
                <h3 className="text-lg font-black text-white">You Dropped From Match</h3>
                <p className="text-xs text-rose-300 font-semibold mt-1">
                  {myPlayer.dropPenaltyRupees
                    ? `Penalty: -₹${myPlayer.dropPenaltyRupees} (${myPlayer.score || (myPlayer.isFirstDrop ? 20 : 40)} Pts)`
                    : `${myPlayer.score || 20} Points Drop Penalty Incurred`}
                </p>
              </div>
              <p className="text-[11px] text-slate-400">
                Your drop penalty has been deducted and any remaining buy-in has been refunded to your wallet.
              </p>
              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handlePlayNewMatchFromDrop}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-black text-xs uppercase shadow-lg shadow-emerald-500/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" /> Play New Match
                </button>
                <button
                  type="button"
                  onClick={handleReturnToLobbyFromDrop}
                  className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" /> Return to Lobby
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 
          MATCH RESULT OVERLAY 
        */}
        {game?.status === 'RESULT' && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-gradient-to-b from-[#161726] to-[#0c0d15] border border-amber-500/40 rounded-3xl p-5 sm:p-7 max-w-xl w-full shadow-2xl space-y-5 text-center max-h-[92vh] overflow-y-auto">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-400 to-yellow-300 p-0.5 mx-auto shadow-xl shadow-amber-500/30">
                <div className="w-full h-full bg-[#150a0f] rounded-[14px] flex items-center justify-center text-2xl font-black text-amber-400">
                  <Trophy className="w-7 h-7" />
                </div>
              </div>

              <div>
                <span className="text-xs font-extrabold tracking-widest uppercase text-amber-400">
                  Match Result
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-white mt-0.5">
                  {game.winnerUid === user?.uid ? '🏆 Congratulations! You Won!' : 'Match Concluded'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Hand #{game.gameId.slice(-8)} • Table {game.mode.toUpperCase()} (₹{game.entryFee} Stake)
                </p>
              </div>

              {/* Player Standings */}
              <div className="bg-[#090a12] border border-white/5 rounded-2xl p-4 text-xs divide-y divide-white/5">
                {players.map((p) => {
                  const isWinner = p.uid === game.winnerUid;
                  const pts = game.resultData?.scores[p.uid] ?? p.score ?? 0;
                  const entryFee = game.entryFee || 20;
                  const loserMoneyLoss = pts === 20
                    ? Math.round(entryFee * 0.25 * 100) / 100
                    : pts === 40
                    ? Math.round(entryFee * 0.50 * 100) / 100
                    : Math.min(
                        entryFee,
                        Math.max(1, Math.round(pts * (game.pointValue || (entryFee / 80)) * 100) / 100)
                      );
                  const loserRefund = Math.max(0, (p.entryPaid || entryFee) - loserMoneyLoss);

                  return (
                    <div key={p.uid} className="py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-[11px] ${
                          isWinner ? 'bg-amber-400 text-black shadow-lg shadow-amber-400/40' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {isWinner ? 'W' : 'L'}
                        </span>
                        <div className="text-left">
                          <p className="font-bold text-white flex items-center gap-1.5">
                            <span>{p.displayName}</span>
                            {isWinner && <span className="text-[9px] bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded font-black">WINNER 🏆</span>}
                          </p>
                          <p className="text-[10px] font-mono text-slate-400">{p.playerId}</p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className={`font-black text-sm ${isWinner ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isWinner ? `+${pts} Pts (Won)` : `-${pts} Pts (${p.status === 'dropped' ? (pts === 20 ? 'First Drop' : 'Middle Drop') : 'Loss'})`}
                        </p>
                        {isWinner && game.resultData?.payouts[p.uid] ? (
                          <div>
                            <span className="text-[11px] text-amber-300 font-bold block">
                              +₹{game.resultData.payouts[p.uid].toLocaleString('en-IN')} Net Winnings
                            </span>
                            <span className="text-[10px] text-emerald-400 font-semibold block">
                              +₹{(game.resultData.winnerBuyInRefund || entryFee).toLocaleString('en-IN')} Buy-in Refunded
                            </span>
                          </div>
                        ) : (
                          <div>
                            <span className="text-[11px] text-rose-400 font-bold block">
                              -₹{loserMoneyLoss.toLocaleString('en-IN')} Penalty
                            </span>
                            {loserRefund > 0 && (
                              <span className="text-[10px] text-emerald-400 font-semibold block">
                                +₹{loserRefund.toLocaleString('en-IN')} Refunded from Buy-in
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Loser wallet deduction confirmation banner */}
              {game.winnerUid !== user?.uid && (() => {
                const myPts = game.resultData?.scores[user?.uid || ''] ?? myPlayer?.score ?? 20;
                const entryFee = game.entryFee || 20;
                const myLoss = myPts === 20
                  ? Math.round(entryFee * 0.25 * 100) / 100
                  : myPts === 40
                  ? Math.round(entryFee * 0.50 * 100) / 100
                  : Math.min(entryFee, Math.max(1, Math.round(myPts * (game.pointValue || (entryFee / 80)) * 100) / 100));
                const myRefund = Math.max(0, (myPlayer?.entryPaid || entryFee) - myLoss);

                return (
                  <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-3 text-xs text-rose-300 text-left flex items-center gap-2.5">
                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                    <div>
                      <p className="font-bold text-white">Loss Settled</p>
                      <p className="text-[11px] text-slate-300">
                        ₹{myLoss} penalty deducted for {myPts} points. Remaining ₹{myRefund} from your ₹{entryFee} buy-in has been refunded to your wallet.
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Winning Amount & 14% Platform Fee Breakdown */}
              {game.resultData && (game.resultData.grossWin || 0) > 0 && (
                <div className="bg-[#090a12] border border-amber-500/20 rounded-2xl p-4 text-xs space-y-2 text-left">
                  <div className="flex items-center justify-between font-bold text-amber-300 pb-1 border-b border-white/5">
                    <span>🏆 Points Won:</span>
                    <span className="font-mono text-base font-black text-emerald-400">
                      +{(game.winnerUid && game.resultData.scores[game.winnerUid]) || (game.resultData.winnerUid && game.resultData.scores[game.resultData.winnerUid]) || 0} Points
                    </span>
                  </div>
                  {Boolean(game.resultData?.winnerSetPoints && game.resultData.winnerSetPoints > 0) && (
                    <div className="flex items-center justify-between text-amber-300 text-[11px]">
                      <span>⭐ Set Bonus Points:</span>
                      <span className="font-mono font-bold">
                        +{game.resultData.winnerSetPoints} Pts ({game.resultData.winnerSets} sets × 20 Pts)
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between font-bold text-slate-300">
                    <span>Total Pot Won from Opponents:</span>
                    <span className="font-mono text-white">₹{game.resultData.grossWin?.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex items-center justify-between text-rose-300">
                    <span>Platform Fee (14% automatic cut):</span>
                    <span className="font-mono font-bold text-rose-400">-₹{game.resultData.platformFee?.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex items-center justify-between text-cyan-300 font-bold pt-1 border-t border-white/5">
                    <span>Entry Buy-in Returned (100% Refunded):</span>
                    <span className="font-mono text-base font-black text-cyan-300">+₹{(game.resultData.winnerBuyInRefund || game.entryFee)?.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex items-center justify-between text-emerald-400 font-bold pt-1.5 border-t border-white/10">
                    <span className="text-sm">Total Added to Your Balance:</span>
                    <span className="font-mono text-base font-black text-emerald-300">
                      +₹{((game.resultData.playerNetShare || 0) + (game.resultData.winnerBuyInRefund || game.entryFee || 0))?.toLocaleString('en-IN')} (Net Profit: +₹{game.resultData.playerNetShare?.toLocaleString('en-IN')})
                    </span>
                  </div>
                  <p className="text-[10px] text-emerald-300/90 pt-1">
                    💡 आपकी एंट्री फीस (₹{game.resultData.winnerBuyInRefund || game.entryFee}) पूरी वापस कर दी गई है और शुद्ध जीत (₹{game.resultData.playerNetShare}) Winnings वॉलेट में जमा हो चुकी है!
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-center gap-3 pt-2">
                <Link
                  href="/lobby"
                  className="py-2.5 px-5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs"
                >
                  Return to Lobby
                </Link>
                <Link
                  href="/lobby"
                  className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black font-black text-xs uppercase shadow-lg shadow-amber-500/20"
                >
                  Play Another Match
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
