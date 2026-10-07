import { uid, now } from './constants.js';
import { assert } from './state.js';
import { chooseMatch } from './matchmaking.js';
import { freeCourts } from './courts.js';
export function validateTeams(s, teams, ignoreId = null, completed = false) {
  assert(Array.isArray(teams) && teams.length === 2 && teams.every(t => Array.isArray(t) && t.length === 2), 'Select two players per team.');
  const ids = teams.flat();
  assert(new Set(ids).size === 4, 'Select four different players.');
  for (const id of ids) {
    const p = s.players.find(p => p.id === id); assert(p, 'Select an existing player for every position.');
    if (!completed) {
      assert(p.status === 'Active', `${p.name} is not active.`);
      assert(![...s.queue, ...s.activeMatches].some(m => m.id !== ignoreId && m.teams.flat().includes(id)), `${p.name} is already reserved in another match.`);
    }
  }
}
export function saveMatch(s, teams, matchId = null, completed = false, winner = null) {
  validateTeams(s, teams, matchId, completed);
  if (matchId) {
    const m = (completed ? s.completedMatches : s.queue).find(m => m.id === matchId);
    assert(m, 'This match can no longer be edited here.'); m.teams = teams;
    if (completed) { assert([0, 1].includes(winner), 'Choose the winning team.'); m.winner = winner; }
  } else {
    assert(!completed, 'Create a queued match first.');
    s.queue.push({ id: uid(), teams, courtId: null, createdAt: now(), startedAt: null, completedAt: null, winner: null });
  }
}
export function generateQueue(s, mode) {
  let count = 0, reason = '';
  while (true) {
    try { saveMatch(s, chooseMatch(s, mode)); count++; }
    catch (error) { reason = error.message; break; }
  }
  assert(count, reason); return { count, reason };
}
export function startMatch(s, id, courtId = null) {
  const m = s.queue.find(m => m.id === id); assert(m, 'Match is no longer queued.');
  validateTeams(s, m.teams, id);
  let court;
  if (courtId) {
    court = s.courts.find(c => c.id === courtId); assert(court, 'Choose an existing court.');
    assert(!s.activeMatches.some(match => match.courtId === courtId), `${court.name} is already in use.`);
  } else {
    court = freeCourts(s)[0];
    assert(court, s.courts.length ? 'All courts are currently in use.' : 'Add a court before starting a match.');
  }
  s.queue = s.queue.filter(match => match.id !== id); m.courtId = court.id; m.startedAt = now(); s.activeMatches.push(m);
  return court;
}
export function finishMatch(s, id, winner) {
  const m = s.activeMatches.find(m => m.id === id); assert(m, 'Match is no longer playing.');
  assert([0, 1].includes(winner), 'Choose the winning team.');
  m.winner = winner; m.completedAt = now(); s.activeMatches = s.activeMatches.filter(m => m.id !== id); s.completedMatches.push(m);
}
export function removeMatch(s, id, completed = false) {
  const key = completed ? 'completedMatches' : 'queue';
  assert(s[key].some(m => m.id === id), 'Match no longer exists.'); s[key] = s[key].filter(m => m.id !== id);
}
export function moveMatch(s, id, direction) {
  const i = s.queue.findIndex(m => m.id === id), j = i + direction;
  assert(i >= 0 && j >= 0 && j < s.queue.length, 'Match is already at the end of the queue.');
  [s.queue[i], s.queue[j]] = [s.queue[j], s.queue[i]];
}
