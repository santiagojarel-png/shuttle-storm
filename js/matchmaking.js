import { eligible } from './players.js';
import { MODES } from './constants.js';
import { assert } from './state.js';

export function waitingMinutes(p, at = Date.now()) {
  return Math.max(0, (at - Math.max(Date.parse(p.availableSince), Date.parse(p.lastPlayedAt || p.availableSince))) / 60000);
}
export function priority(p, weights, at = Date.now()) {
  const waiting = Math.min(waitingMinutes(p, at), 60);
  // A short, fading arrival penalty prevents immediate jumping without a session-long penalty.
  const arrivalPenalty = Math.max(0, 1 - (at - Date.parse(p.checkedInAt)) / 600000);
  return p.gamesPlayed * weights.games - waiting * weights.waiting + arrivalPenalty * weights.arrival;
}
function historyCounts(matches) {
  const partners = new Map(), opponents = new Map();
  const key = (a, b) => [a, b].sort().join('|');
  const add = (map, a, b) => map.set(key(a, b), (map.get(key(a, b)) || 0) + 1);
  for (const m of matches.slice(-40)) {
    m.teams.forEach(t => add(partners, ...t));
    m.teams[0].forEach(a => m.teams[1].forEach(b => add(opponents, a, b)));
  }
  return { partners, opponents, key };
}
export function chooseMatch(s, mode = 'Balanced', at = Date.now()) {
  assert(MODES.includes(mode), 'Choose a supported matchmaking mode.');
  const w = s.settings.weights;
  const ranked = eligible(s).sort((a, b) => priority(a, w, at) - priority(b, w, at) || a.checkedInAt.localeCompare(b.checkedInAt) || a.id.localeCompare(b.id));
  assert(ranked.length >= 4, 'Four available active players are needed. Playing and queued players are reserved.');
  // Select the fairest feasible group first; team optimization must not starve waiting players.
  let selected;
  if (mode === 'Mixed Doubles') {
    const men = ranked.filter(p => p.gender === 'Male').slice(0, 2), women = ranked.filter(p => p.gender === 'Female').slice(0, 2);
    assert(men.length === 2 && women.length === 2, 'Mixed doubles needs two available male and two available female players.');
    selected = [...men, ...women];
  } else if (mode === 'Same Gender Balanced') {
    const groups = ['Male', 'Female', 'Other'].map(g => ranked.filter(p => p.gender === g).slice(0, 4)).filter(g => g.length === 4);
    assert(groups.length, 'Same gender balanced needs four available players of the same gender.');
    selected = groups.sort((a, b) => a.reduce((n, p) => n + priority(p, w, at), 0) - b.reduce((n, p) => n + priority(p, w, at), 0))[0];
  } else selected = ranked.slice(0, 4);
  const h = historyCounts(s.completedMatches);
  const partitions = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
  const candidates = partitions.map(teams => teams.map(t => t.map(i => selected[i]))).filter(teams => mode !== 'Mixed Doubles' || teams.every(t => new Set(t.map(p => p.gender)).size === 2));
  const score = teams => {
    const strength = t => t.reduce((n, p) => n + p.skillLevel, 0);
    const partnerCost = teams.reduce((n, t) => n + (h.partners.get(h.key(t[0].id, t[1].id)) || 0), 0);
    const opponentCost = teams[0].reduce((n, a) => n + teams[1].reduce((sum, b) => sum + (h.opponents.get(h.key(a.id, b.id)) || 0), 0), 0);
    return Math.abs(strength(teams[0]) - strength(teams[1])) * w.skill + partnerCost * w.partner + opponentCost * w.opponent;
  };
  return candidates.sort((a, b) => score(a) - score(b))[0].map(t => t.map(p => p.id));
}
