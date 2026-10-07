import { uid, now } from './constants.js';
import { assert } from './state.js';

export function freeCourts(s) {
  const occupied = new Set(s.activeMatches.map(m => m.courtId).filter(Boolean));
  return s.courts.filter(c => !occupied.has(c.id));
}

export function addCourt(s, requestedName = '') {
  let name = String(requestedName || '').trim();
  if (!name) {
    let n = 1;
    const used = new Set(s.courts.map(c => c.name.toLowerCase()));
    while (used.has(`court ${n}`)) n++;
    name = `Court ${n}`;
  }
  assert(name.length <= 40, 'Court name must be 40 characters or fewer.');
  assert(!s.courts.some(c => c.name.toLowerCase() === name.toLowerCase()), 'A court with that name already exists.');
  const court = { id: uid(), name, createdAt: now() };
  s.courts.push(court);
  return court;
}

export function removeCourt(s, courtId) {
  const court = s.courts.find(c => c.id === courtId);
  assert(court, 'Court no longer exists.');
  assert(!s.activeMatches.some(m => m.courtId === courtId), 'Finish the active match before removing this court.');
  s.courts = s.courts.filter(c => c.id !== courtId);
  return court;
}
