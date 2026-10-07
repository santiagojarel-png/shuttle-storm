import { newState } from './state.js';
export function startNewSession(s, clearRoster = false) {
  const fresh = newState();
  fresh.revision = s.revision;
  fresh.settings = structuredClone(s.settings);
  fresh.finance.currency = s.finance.currency;
  if (!clearRoster) fresh.players = s.players.map(p => ({ ...p, status: 'Standby', checkedInAt: fresh.session.startedAt, availableSince: fresh.session.startedAt, paid: false, gamesPlayed: 0, wins: 0, losses: 0, lastPlayedAt: null, currentMatchId: null }));
  return fresh;
}
