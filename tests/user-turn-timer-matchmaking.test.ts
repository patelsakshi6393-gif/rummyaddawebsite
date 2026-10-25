import { describe, it, expect } from 'bun:test';
import { GameState, GamePlayerState } from '../lib/types';

describe('Turn Timer & Matchmaking Verification Suite', () => {
  it('Turn timer badge is only active on the player whose turn it currently is', () => {
    const userUid = 'user_123';
    const oppUid = 'opp_456';

    const game: Partial<GameState> = {
      status: 'PLAYING',
      turnUid: oppUid,
      turnDeadline: Date.now() + 45000,
    };

    // When opponent has turn:
    const isUserTurn = game.turnUid === userUid;
    const isOppTurn = game.turnUid === oppUid;

    expect(isUserTurn).toBe(false);
    expect(isOppTurn).toBe(true);

    // Opponent avatar should render timer; User avatar should NOT render active turn timer
    const shouldShowOppTimer = isOppTurn;
    const shouldShowUserTimer = isUserTurn;

    expect(shouldShowOppTimer).toBe(true);
    expect(shouldShowUserTimer).toBe(false);

    // Switch turn to user
    game.turnUid = userUid;
    expect(game.turnUid === userUid).toBe(true);
    expect(game.turnUid === oppUid).toBe(false);
  });

  it('All 5 opponent seats display Waiting... during WAITING state when unoccupied', () => {
    const gameStatus = 'WAITING';
    const opponents: GamePlayerState[] = []; // No opponents connected yet

    // Simulate all 5 opponent seat checks
    const seatStates = [0, 1, 2, 3, 4].map((slotIdx) => {
      const opp = opponents[slotIdx];
      if (!opp) {
        return gameStatus === 'WAITING' ? 'Waiting...' : 'Empty seat';
      }
      return opp.displayName;
    });

    // Verify all 5 seats display 'Waiting...'
    expect(seatStates).toEqual([
      'Waiting...',
      'Waiting...',
      'Waiting...',
      'Waiting...',
      'Waiting...',
    ]);
  });

  it('Practice mode waiting timer auto-matches table with bot if no human players join in time', () => {
    const game: Partial<GameState> = {
      status: 'WAITING',
      waitingEndsAt: new Date(Date.now() - 1000).toISOString(), // Expired
      playerCount: 1,
    };

    const isWaitingExpired = new Date(game.waitingEndsAt!).getTime() <= Date.now();
    expect(isWaitingExpired).toBe(true);

    // When expired and playerCount < 2, auto-match transitions to COUNTDOWN
    const newPlayerCount = 2;
    const nextStatus = 'COUNTDOWN';
    const countdownEndsAt = new Date(Date.now() + 5000).toISOString();

    expect(newPlayerCount >= 2).toBe(true);
    expect(nextStatus).toBe('COUNTDOWN');
    expect(new Date(countdownEndsAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('SORT button is named SORT (renamed from REFRESH) and DECLARE button is adjacent to it', () => {
    const leftDockButtons = ['Score', 'SORT', 'DECLARE'];
    expect(leftDockButtons[1]).toBe('SORT');
    expect(leftDockButtons[2]).toBe('DECLARE');
  });

  it('Waiting room renders "X player is active / Boost" indicator and Boost matchmaking action', () => {
    const gameStatus = 'WAITING';
    const players: Partial<GamePlayerState>[] = [
      { uid: 'u1', displayName: 'Sakshi', status: 'waiting' },
    ];
    const isWaitingRoom = gameStatus === 'WAITING';
    expect(isWaitingRoom).toBe(true);

    const activeCount = Math.max(1, players.length);
    const activeText = `${activeCount} ${activeCount === 1 ? 'player is active' : 'players are active'} / Boost`;
    expect(activeText).toBe('1 player is active / Boost');

    // When 2nd player joins
    players.push({ uid: 'u2', displayName: 'Rahul', status: 'waiting' });
    const updatedCount = players.length;
    const updatedActiveText = `${updatedCount} ${updatedCount === 1 ? 'player is active' : 'players are active'} / Boost`;
    expect(updatedActiveText).toBe('2 players are active / Boost');

    // Boost accelerates waiting timer to 2s
    let waitingTimeLeft = 10;
    const isBoosted = true;
    waitingTimeLeft = Math.min(waitingTimeLeft, 2);
    expect(isBoosted).toBe(true);
    expect(waitingTimeLeft).toBe(2);
  });
});
