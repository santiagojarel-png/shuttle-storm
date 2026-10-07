import { uid, now } from './constants.js';
import { assert } from './state.js';
export const assignment = (s, id) => [...s.queue, ...s.activeMatches].find(m => m.teams.flat().includes(id));
export const eligible = s => s.players.filter(p => p.status === 'Active' && !assignment(s, p.id));
export function savePlayer(s, data, playerId, allowDuplicate = false) {
  const name = String(data.name ?? '').trim();
  assert(name && name.length <= 80, 'Enter a name of 1–80 characters.');
  assert(allowDuplicate || !s.players.some(p => p.id !== playerId && p.name.toLocaleLowerCase() === name.toLocaleLowerCase()), 'A player with this name exists. Select “Allow duplicate name” if they are different people.');
  if (playerId) {
    const p = s.players.find(p => p.id === playerId); assert(p, 'Player no longer exists.');
    Object.assign(p, { name, gender: data.gender, skillLevel: Number(data.skillLevel) });
  } else {
    const time = now();
    s.players.push({ id: uid(), name, gender: data.gender, skillLevel: Number(data.skillLevel), status: 'Active', checkedInAt: time, availableSince: time, gamesPlayed: 0, wins: 0, losses: 0, currentMatchId: null, paid: false });
  }
}
export function setStatus(s, id, status) {
  const p = s.players.find(p => p.id === id); assert(p, 'Player no longer exists.');
  assert(!assignment(s, id), 'Remove this player from their queued match, or finish their playing match first.');
  if (status === 'Active' && p.status !== 'Active') { p.availableSince = now(); p.checkedInAt = p.availableSince; }
  p.status = status;
}
export function deletePlayer(s, id) {
  assert(!assignment(s, id), 'Remove this player from their match first.');
  assert(!s.completedMatches.some(m => m.teams.flat().includes(id)), 'This player has match history. Check them out to preserve it; delete their profile after starting a new session.');
  s.players = s.players.filter(p => p.id !== id);
}
