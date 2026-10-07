import { DEFAULT_WEIGHTS, GENDERS, STATUSES, uid, now } from './constants.js';
import { recalculate } from './stats.js';

export function newState() {
  return { schemaVersion: 1, revision: 0, session: { id: uid(), startedAt: now() }, players: [], courts: [], queue: [], activeMatches: [], completedMatches: [],
    finance: { sessionCost: 0, shuttleCost: 0, shuttleCount: 0, otherCost: 0, feeMode: 'equal', flatFee: 0, perGame: 0, currency: 'PHP' },
    settings: { weights: { ...DEFAULT_WEIGHTS }, theme: 'dark' } };
}
export function assert(condition, message) { if (!condition) throw new Error(message); }
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const date = v => typeof v === 'string' && v.length <= 30 && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const id = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(v);
const nonnegative = v => Number.isFinite(v) && v >= 0 && v <= 1e9;

// Validate all authoritative fields before recalculating derived fields. Never trust imported stats.
export function validateState(input) {
  input = structuredClone(input);
  if (!Array.isArray(input.courts)) input.courts = [];
  for (const bucket of ['queue', 'activeMatches', 'completedMatches']) {
    if (Array.isArray(input[bucket])) for (const m of input[bucket]) if (plain(m) && !('courtId' in m)) m.courtId = null;
  }
  assert(plain(input) && input.schemaVersion === 1, 'This is not a supported Shuttle Storm backup.');
  assert(Number.isSafeInteger(input.revision) && input.revision >= 0, 'Invalid session revision.');
  assert(plain(input.session) && id(input.session.id) && date(input.session.startedAt), 'Invalid session information.');
  for (const key of ['players', 'courts', 'queue', 'activeMatches', 'completedMatches']) assert(Array.isArray(input[key]) && input[key].length <= 10000, `Invalid ${key} list.`);
  assert(input.players.length <= 500, 'A session supports up to 500 players.');
  const ids = new Set();
  for (const p of input.players) {
    assert(plain(p) && id(p.id) && !ids.has(p.id), 'Player IDs must be unique.'); ids.add(p.id);
    assert(typeof p.name === 'string' && p.name.trim().length > 0 && p.name.length <= 80, 'Player names must contain 1–80 characters.');
    assert(GENDERS.includes(p.gender) && STATUSES.includes(p.status), 'Invalid player gender or status.');
    assert(Number.isInteger(p.skillLevel) && p.skillLevel >= 1 && p.skillLevel <= 5, 'Invalid player skill level.');
    assert(date(p.checkedInAt) && date(p.availableSince) && typeof p.paid === 'boolean', 'Invalid player check-in or payment.');
  }
  const courtIds = new Set();
  for (const c of input.courts) {
    assert(plain(c) && id(c.id) && !courtIds.has(c.id), 'Court IDs must be unique.'); courtIds.add(c.id);
    assert(typeof c.name === 'string' && c.name.trim().length > 0 && c.name.length <= 40, 'Court names must contain 1–40 characters.');
    assert(date(c.createdAt), 'Invalid court creation time.');
  }
  const matchIds = new Set(), assigned = new Set(), occupiedCourts = new Set();
  for (const bucket of ['queue', 'activeMatches', 'completedMatches']) {
    for (const m of input[bucket]) {
      assert(plain(m) && id(m.id) && !matchIds.has(m.id), 'Match IDs must be unique.'); matchIds.add(m.id);
      assert(Array.isArray(m.teams) && m.teams.length === 2 && m.teams.every(t => Array.isArray(t) && t.length === 2), 'A doubles match requires two teams of two.');
      const members = m.teams.flat();
      assert(new Set(members).size === 4 && members.every(p => ids.has(p)), 'Each match needs four unique, existing players.');
      assert(date(m.createdAt), 'Invalid match creation time.');
      if (bucket !== 'queue') assert(date(m.startedAt) && m.startedAt >= m.createdAt, 'Invalid match start time.');
      else assert(m.startedAt === null, 'A queued match cannot have a start time.');
      assert(m.courtId === null || id(m.courtId), 'Invalid court assignment.');
      if (bucket === 'queue') assert(m.courtId === null, 'A queued match cannot already occupy a court.');
      if (bucket === 'activeMatches' && m.courtId !== null) {
        assert(courtIds.has(m.courtId), 'An active match references a missing court.');
        assert(!occupiedCourts.has(m.courtId), 'A court cannot host multiple active matches.'); occupiedCourts.add(m.courtId);
      }
      if (bucket === 'completedMatches') assert(date(m.completedAt) && m.completedAt >= m.startedAt && [0, 1].includes(m.winner), 'Invalid match result or finish time.');
      else {
        assert(m.completedAt === null && m.winner === null, 'An unfinished match cannot have a result.');
        for (const pid of members) {
          assert(!assigned.has(pid), 'A player cannot be assigned to multiple queued or playing matches.'); assigned.add(pid);
          assert(input.players.find(p => p.id === pid).status === 'Active', 'Standby and checked-out players cannot be assigned to matches.');
        }
      }
    }
  }
  const f = input.finance;
  assert(plain(f), 'Invalid finance settings.');
  for (const key of ['sessionCost', 'shuttleCost', 'shuttleCount', 'otherCost', 'flatFee', 'perGame']) assert(nonnegative(f[key]), `Invalid finance value: ${key}.`);
  assert(Number.isInteger(f.shuttleCount) && f.shuttleCount <= 10000, 'Shuttlecock quantity must be a whole number up to 10,000.');
  assert(['equal', 'flat', 'per-game', 'combined'].includes(f.feeMode) && ['PHP', 'SGD', 'USD'].includes(f.currency), 'Invalid fee mode or currency.');
  assert(plain(input.settings) && plain(input.settings.weights) && ['dark', 'light'].includes(input.settings.theme), 'Invalid application settings.');
  for (const key of Object.keys(DEFAULT_WEIGHTS)) assert(nonnegative(input.settings.weights[key]) && input.settings.weights[key] <= 1000, `Invalid matchmaking weight: ${key}.`);
  return recalculate(structuredClone(input));
}
