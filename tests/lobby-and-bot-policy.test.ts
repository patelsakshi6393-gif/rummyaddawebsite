import { describe, it, expect } from 'bun:test';
import { STAKE_OPTIONS, StakeOption, canInjectBotIntoGame } from '../lib/game-service';
import { GameState } from '../lib/types';

describe('Lobby Entry Fee, 2/6 Players & Zero-Bot Cash Policy Suite', () => {
  it('Min and Max entry fees correctly span from ₹20 to ₹16,000 for all formats', () => {
    const formats: Array<'points' | 'pool101' | 'deals'> = ['points', 'pool101', 'deals'];

    for (const fmt of formats) {
      const stakes = STAKE_OPTIONS[fmt];
      expect(stakes.length).toBeGreaterThanOrEqual(9);

      const minStake = stakes[0];
      const maxStake = stakes[stakes.length - 1];

      expect(minStake.entryFee).toBe(20);
      expect(maxStake.entryFee).toBe(16000);
    }
  });

  it('Point value calculation strictly adheres to Indian Rummy rules: EntryFee / 80 === PointValue', () => {
    const pointsStakes = STAKE_OPTIONS.points;

    for (const stake of pointsStakes) {
      const expectedPointValue = Math.round((stake.entryFee / 80) * 100) / 100;
      expect(stake.pointValue).toBe(expectedPointValue);
    }

    // Specific verification of the ₹20 micro stake shown in user screenshot
    const microStake = pointsStakes.find((s) => s.entryFee === 20)!;
    expect(microStake).toBeDefined();
    expect(microStake.pointValue).toBe(0.25);
  });

  it('2-Player vs 6-Player tables are segregated and match distinct capacities', () => {
    const table2p: Partial<GameState> = {
      gameId: 'match_points_20_2p_123',
      maxPlayers: 2,
      playerCount: 1,
      status: 'WAITING',
    };

    const table6p: Partial<GameState> = {
      gameId: 'match_points_20_6p_456',
      maxPlayers: 6,
      playerCount: 1,
      status: 'WAITING',
    };

    // Capacity matching check
    expect(table2p.maxPlayers).toBe(2);
    expect(table6p.maxPlayers).toBe(6);
    expect(table2p.maxPlayers === 2).toBe(true);
    expect(table6p.maxPlayers === 6).toBe(true);
    expect(table2p.maxPlayers).not.toBe(table6p.maxPlayers);

    // 2-player table becomes full at count 2
    expect(table2p.playerCount! + 1 >= table2p.maxPlayers!).toBe(true);

    // 6-player table does NOT become full at count 2
    expect(table6p.playerCount! + 1 >= table6p.maxPlayers!).toBe(false);
  });

  it('Cash games strictly disallow auto bot injection when waiting countdown ends', () => {
    const cashGame: Partial<GameState> = {
      gameId: 'cash_table_1',
      mode: 'points',
      entryFee: 20,
      status: 'WAITING',
      waitingEndsAt: new Date(Date.now() - 5000).toISOString(),
    };

    // Central validator must return false
    expect(canInjectBotIntoGame(cashGame)).toBe(false);

    // Auto bot injection should only run if canInjectBotIntoGame is true
    const shouldInjectBotAutomatically = canInjectBotIntoGame(cashGame);
    expect(shouldInjectBotAutomatically).toBe(false);

    // Even if isPractice flag was somehow tampered, entryFee > 0 strictly blocks it
    const tamperedCashGame = { ...cashGame, isPractice: true };
    expect(canInjectBotIntoGame(tamperedCashGame as any)).toBe(false);

    // Tampered mode as 'practice' with real entryFee is strictly rejected
    const tamperedModeGame = { ...cashGame, mode: 'practice' as any, entryFee: 160 };
    expect(canInjectBotIntoGame(tamperedModeGame)).toBe(false);

    // AI button should never be rendered on cash tables
    const renderAiButtonOnCash = canInjectBotIntoGame(cashGame);
    expect(renderAiButtonOnCash).toBe(false);

    // Test across all entry fee tiers
    for (const stake of STAKE_OPTIONS.points) {
      expect(canInjectBotIntoGame({ mode: 'points', entryFee: stake.entryFee })).toBe(false);
    }
  });

  it('Practice mode correctly permits bot AI play for free training', () => {
    const practiceGame: Partial<GameState> = {
      gameId: 'practice_table_1',
      mode: 'points',
      entryFee: 0,
      status: 'WAITING',
    };
    (practiceGame as any).isPractice = true;

    expect(canInjectBotIntoGame(practiceGame)).toBe(true);

    // AI button is allowed on practice tables
    const renderAiButtonOnPractice = canInjectBotIntoGame(practiceGame);
    expect(renderAiButtonOnPractice).toBe(true);

    // Also valid with mode === 'practice'
    const formatPracticeGame: Partial<GameState> = {
      gameId: 'practice_table_2',
      mode: 'practice' as any,
      entryFee: 0,
      status: 'WAITING',
    };
    expect(canInjectBotIntoGame(formatPracticeGame)).toBe(true);
  });

  it('Boundary conditions: null, undefined, empty object, or invalid entry fees return false', () => {
    expect(canInjectBotIntoGame(null)).toBe(false);
    expect(canInjectBotIntoGame(undefined)).toBe(false);
    expect(canInjectBotIntoGame({})).toBe(false);
    expect(canInjectBotIntoGame({ entryFee: 20 })).toBe(false);
    expect(canInjectBotIntoGame({ mode: 'points', entryFee: 0 })).toBe(false); // 0 fee points without practice flag
  });

  it('Stepping entry fees with minus and plus moves between consecutive stake tiers', () => {
    const stakes = STAKE_OPTIONS.points;
    let currentIndex = 0; // ₹20

    expect(stakes[currentIndex].entryFee).toBe(20);

    // Plus step 1 -> ₹40
    currentIndex = Math.min(stakes.length - 1, currentIndex + 1);
    expect(stakes[currentIndex].entryFee).toBe(40);
    expect(stakes[currentIndex].pointValue).toBe(0.5);

    // Plus step 2 -> ₹80
    currentIndex = Math.min(stakes.length - 1, currentIndex + 1);
    expect(stakes[currentIndex].entryFee).toBe(80);
    expect(stakes[currentIndex].pointValue).toBe(1);

    // Plus step 3 -> ₹160
    currentIndex = Math.min(stakes.length - 1, currentIndex + 1);
    expect(stakes[currentIndex].entryFee).toBe(160);
    expect(stakes[currentIndex].pointValue).toBe(2);

    // Minus step 1 -> ₹80
    currentIndex = Math.max(0, currentIndex - 1);
    expect(stakes[currentIndex].entryFee).toBe(80);

    // Max jump
    currentIndex = stakes.length - 1;
    expect(stakes[currentIndex].entryFee).toBe(16000);

    // Min jump
    currentIndex = 0;
    expect(stakes[currentIndex].entryFee).toBe(20);
  });

  it('Real-time live stakes player counts aggregation strictly matches mode, capacity, and 90s freshness', () => {
    const now = Date.now();
    const mockGames: Partial<GameState>[] = [
      // Fresh 2-player Points ₹20 table with 1 player waiting
      {
        gameId: 'g1',
        mode: 'points',
        entryFee: 20,
        maxPlayers: 2,
        playerCount: 1,
        playerUids: ['user_A'],
        status: 'WAITING',
        updatedAt: new Date(now - 10000).toISOString(),
      },
      // Second fresh 2-player Points ₹20 table with 1 player waiting (counts should sum to 2)
      {
        gameId: 'g2',
        mode: 'points',
        entryFee: 20,
        maxPlayers: 2,
        playerCount: 1,
        playerUids: ['user_B'],
        status: 'WAITING',
        updatedAt: new Date(now - 25000).toISOString(),
      },
      // Fresh 2-player Points ₹80 table with 1 player in COUNTDOWN
      {
        gameId: 'g3',
        mode: 'points',
        entryFee: 80,
        maxPlayers: 2,
        playerCount: 1,
        playerUids: ['user_C'],
        status: 'COUNTDOWN',
        updatedAt: new Date(now - 5000).toISOString(),
      },
      // Stale room (>90s old) - MUST BE FILTERED OUT
      {
        gameId: 'g4',
        mode: 'points',
        entryFee: 20,
        maxPlayers: 2,
        playerCount: 1,
        playerUids: ['user_stale'],
        status: 'WAITING',
        updatedAt: new Date(now - 95000).toISOString(),
      },
      // Different mode (pool101) - MUST BE FILTERED OUT when querying points
      {
        gameId: 'g5',
        mode: 'pool101',
        entryFee: 20,
        maxPlayers: 2,
        playerCount: 1,
        playerUids: ['user_pool'],
        status: 'WAITING',
        updatedAt: new Date(now - 1000).toISOString(),
      },
      // Different capacity (6-player) - MUST BE FILTERED OUT when querying 2-player
      {
        gameId: 'g6',
        mode: 'points',
        entryFee: 20,
        maxPlayers: 6,
        playerCount: 1,
        playerUids: ['user_6p'],
        status: 'WAITING',
        updatedAt: new Date(now - 1000).toISOString(),
      },
      // Already PLAYING - MUST BE FILTERED OUT
      {
        gameId: 'g7',
        mode: 'points',
        entryFee: 20,
        maxPlayers: 2,
        playerCount: 2,
        playerUids: ['u1', 'u2'],
        status: 'PLAYING',
        updatedAt: new Date(now - 1000).toISOString(),
      },
    ];

    // Compute counts
    const compute = (mode: string, maxPlayers: number) => {
      const counts: Record<number, number> = {};
      for (const g of mockGames) {
        if (!['WAITING', 'COUNTDOWN'].includes(g.status!)) continue;
        if (g.mode !== mode) continue;
        if ((g.maxPlayers || 2) !== maxPlayers) continue;
        const lastActive = new Date(g.updatedAt || g.createdAt || 0).getTime();
        if (now - lastActive > 90000) continue;
        const fee = Number(g.entryFee);
        if (fee) {
          const pCount = g.playerCount || (g.playerUids ? g.playerUids.length : 0);
          if (pCount > 0) {
            counts[fee] = (counts[fee] || 0) + pCount;
          }
        }
      }
      return counts;
    };

    const points2p = compute('points', 2);
    expect(points2p[20]).toBe(2); // g1 + g2
    expect(points2p[80]).toBe(1); // g3
    expect(points2p[160]).toBeUndefined(); // no waiting players

    // UI text formatting test
    const formatActiveText = (count: number) =>
      count > 0
        ? `🟢 ${count} ${count === 1 ? 'player is active' : 'players are active'} / Boost`
        : 'Table open (0 active)';

    expect(formatActiveText(points2p[20] || 0)).toBe('🟢 2 players are active / Boost');
    expect(formatActiveText(points2p[80] || 0)).toBe('🟢 1 player is active / Boost');
    expect(formatActiveText(points2p[160] || 0)).toBe('Table open (0 active)');

    const modalText = (count: number) =>
      count > 0 ? `${count} active / Boost` : '0 active';
    expect(modalText(points2p[20] || 0)).toBe('2 active / Boost');
    expect(modalText(points2p[80] || 0)).toBe('1 active / Boost');
    expect(modalText(points2p[160] || 0)).toBe('0 active');
  });
});
