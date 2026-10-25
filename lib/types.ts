export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'JOKER';

export interface Card {
  id: string; // unique card id in 108 deck e.g. "s_A_1", "joker_printed_1"
  suit: Suit | 'joker';
  rank: Rank;
  isPrintedJoker?: boolean;
}

export type GameMode = 'points' | 'pool101' | 'deals';

export type GameStatus =
  | 'WAITING'
  | 'COUNTDOWN'
  | 'TOSS'
  | 'DEAL'
  | 'PLAYING'
  | 'DECLARE'
  | 'RESULT'
  | 'COMPLETED';

export type PlayerGameStatus = 'waiting' | 'playing' | 'dropped' | 'declared' | 'eliminated';

export interface UserProfile {
  uid: string;
  playerId: string; // "RA-XXXXXX"
  referralCode?: string; // "REFXXXXXX"
  referredBy?: string; // referrer's uid
  referredByCode?: string; // referral code used upon signup
  referredAt?: string;
  totalReferrals?: number;
  referralEarnings?: number;
  displayName: string;
  email?: string;
  phone?: string;
  photoURL?: string;
  role: 'player' | 'admin' | 'support';
  accountStatus: 'active' | 'suspended' | 'verified';
  activeGameId?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface ReferralRecord {
  id: string;
  referrerUid: string;
  referrerCode: string;
  refereeUid: string;
  refereePhone?: string;
  refereeName?: string;
  referrerChips: number; // 50 chips
  refereeChips: number; // 20 chips (1-time welcome bonus)
  status: 'completed';
  createdAt: string;
}

export interface UserWallet {
  uid: string;
  depositBalance: number;
  winBalance: number;
  bonusBalance: number;
  rewardPoints: number;
  welcomeBonusClaimed?: boolean;
  updatedAt: string;
}

export function getPlayableBalance(wallet: UserWallet | null | undefined): number {
  if (!wallet) return 0;
  return (wallet.depositBalance || 0) + (wallet.winBalance || 0) + (wallet.bonusBalance || 0);
}

export function getWithdrawableBalance(wallet: UserWallet | null | undefined): number {
  if (!wallet) return 0;
  return wallet.winBalance || 0;
}

export interface WalletTransaction {
  id: string;
  uid: string;
  type: 'deposit' | 'withdrawal' | 'game_entry' | 'game_win' | 'game_loss' | 'reward' | 'refund' | 'adjustment' | 'bonus';
  amount: number;
  currency?: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  description: string;
  referenceId?: string;
  createdAt: string;
}

export interface DepositRequest {
  depositId: string;
  uid: string;
  playerId: string;
  playerName?: string;
  requestedAmount: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  whatsappOpenedAt?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  adminNote?: string;
  utr?: string;
}

export interface WithdrawalRequest {
  withdrawalId: string;
  uid: string;
  playerId: string;
  playerName?: string;
  amount: number; // Requested gross withdrawal
  feePercent?: number; // Withdrawal fee percentage (0% - no fee at withdrawal)
  platformFee?: number; // 0% platform fee on cashout
  netPayableAmount?: number; // "Dene wala balance" (100% payout, no fee at withdrawal)
  method: 'upi' | 'bank';
  maskedDestination: string;
  rawDestination?: string;
  status: 'pending' | 'processing' | 'paid' | 'rejected' | 'failed';
  createdAt: string;
  processedAt?: string;
  processedBy?: string;
  adminNote?: string;
  rejectionReason?: string;
  utr?: string;
}

export interface TableConfig {
  tableId: string;
  name: string;
  gameMode: GameMode;
  pointValue: number; // e.g. ₹0.25, ₹2, ₹10, etc.
  entryFee: number; // ₹20, ₹160, ₹800, ₹3200, ₹6000, ₹10000, ₹16000
  minPlayers: number; // 2
  maxPlayers: number; // 2 or 6
  currentPlayers: number;
  status: 'open' | 'countdown' | 'playing' | 'finished';
  activeGameId?: string;
  countdownStartedAt?: string;
  countdownEndsAt?: string;
  createdAt?: string;
}

export interface GamePlayerState {
  uid: string;
  playerId: string;
  displayName: string;
  photoURL?: string;
  seatIndex: number;
  status: PlayerGameStatus;
  isDealer?: boolean;
  cardCount: number;
  score: number;
  connected: boolean;
  isBot?: boolean;
  tossCard?: Card;
  cards?: Card[]; // Only visible to the local player / authenticated player!
  joinedAt: string;
  dropPenalty?: number;
  dropPenaltyRupees?: number;
  isFirstDrop?: boolean;
  turnsCount?: number;
  missedTurns?: number;
  entryPaid?: number;
  isSettled?: boolean;
  droppedAt?: string;
  deductionBreakdown?: {
    depositDeduct: number;
    bonusDeduct?: number;
    winDeduct: number;
    total: number;
  };
}

export interface GameState {
  gameId: string;
  tableId: string;
  mode: GameMode;
  pointValue: number;
  entryFee: number;
  playerCount: number;
  maxPlayers?: number;
  playerUids?: string[];
  droppedUids?: string[];
  status: GameStatus;
  phase: GameStatus;
  countdownEndsAt?: string;
  waitingEndsAt?: string;
  isBoosted?: boolean;
  dealerUid?: string;
  wildJoker?: Card;
  turnUid?: string;
  turnStartedAt?: number;
  turnDeadline?: number; // 60s base + extensions
  turnExtensionCount?: number; // 0, 1, 2
  hasDrawn?: boolean;
  openDeck: Card[]; // top card is openDeck[openDeck.length - 1]
  closedDeckCount: number;
  winnerUid?: string;
  resultData?: {
    winnerUid: string;
    scores: Record<string, number>;
    penalties: Record<string, string>;
    payouts: Record<string, number>;
    grossWin?: number;
    platformFee?: number; // 14% platform fee automatically deducted from winnings
    feePercent?: number; // 14%
    playerNetShare?: number; // Net winnings credited to winner wallet
    adminShare?: number;
    winnerBuyInRefund?: number;
    winnerSets?: number;
    winnerSetPoints?: number;
    settlementStatus?: string;
    completedAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface TournamentData {
  id: string;
  title: string;
  type: 'freeroll' | 'cash' | 'mega';
  prizePool: number;
  entryFee: number;
  startTime: string;
  status: 'upcoming' | 'registering' | 'running' | 'completed';
  registeredCount: number;
  maxParticipants: number;
  description: string;
  rules: string[];
}

export interface MatchmakingTicket {
  ticketId: string;
  uid: string;
  playerId: string;
  displayName: string;
  photoURL?: string;
  tableId: string;
  gameMode: GameMode;
  entryFee: number;
  pointValue: number;
  maxPlayers: number;
  status: 'QUEUED' | 'MATCHED' | 'CANCELLED';
  gameId?: string | null;
  createdAt: string;
  updatedAt: string;
}
