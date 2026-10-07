import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, validateState } from '../js/state.js';
import { savePlayer, setStatus, deletePlayer, eligible } from '../js/players.js';
import { chooseMatch, priority } from '../js/matchmaking.js';
import { generateQueue, saveMatch, startMatch, finishMatch, removeMatch, moveMatch } from '../js/queue.js';
import { recalculate, csv } from '../js/stats.js';
import { createStore, loadState, parseBackup } from '../js/storage.js';
import { startNewSession } from '../js/session.js';
import { playerFees, financeSummary } from '../js/finance.js';
import { STORAGE_KEY } from '../js/constants.js';
const roster = (n = 8) => { const s = newState(); for (let i = 0; i < n; i++) savePlayer(s, { name: `Player ${i + 1}`, gender: i % 2 ? 'Female' : 'Male', skillLevel: i % 5 + 1 }); return s; };
const memory = () => { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }; };
const completed = s => { generateQueue(s, 'Balanced'); const id = s.queue[0].id; startMatch(s, id); finishMatch(s, id, 0); recalculate(s); return s.completedMatches[0]; };

test('8 players generate two valid disjoint doubles matches', () => {
  const s = roster(); assert.equal(generateQueue(s, 'Balanced').count, 2);
  assert.equal(new Set(s.queue.flatMap(m => m.teams.flat())).size, 8);
  assert.equal(eligible(s).length, 0); validateState(s);
});
test('fewer games dominate normal differences in waiting time', () => {
  const s = roster(4), at = Date.now(); const [a, b] = s.players;
  a.gamesPlayed = 4; b.gamesPlayed = 1;
  a.availableSince = new Date(at - 60 * 60000).toISOString();
  assert.ok(priority(b, s.settings.weights, at) < priority(a, s.settings.weights, at));
});
test('waiting players beat newly arrived players with equal games; arrival penalty fades', () => {
  const s = roster(4), at = Date.now(), [a, b] = s.players;
  a.availableSince = a.checkedInAt = new Date(at - 20 * 60000).toISOString();
  assert.ok(priority(a, s.settings.weights, at) < priority(b, s.settings.weights, at));
  a.availableSince = b.availableSince; a.checkedInAt = new Date(at - 30 * 60000).toISOString(); b.checkedInAt = new Date(at - 15 * 60000).toISOString();
  assert.equal(priority(a, s.settings.weights, at), priority(b, s.settings.weights, at));
});
test('active and queued players cannot be generated into another match', () => {
  const s = roster(); saveMatch(s, chooseMatch(s)); startMatch(s, s.queue[0].id);
  generateQueue(s, 'Balanced');
  assert.equal(new Set([...s.queue, ...s.activeMatches].flatMap(m => m.teams.flat())).size, 8);
  assert.throws(() => generateQueue(s, 'Balanced'), /Four available/); validateState(s);
});
test('standby and checkout exclude players, activation permits selection', () => {
  const s = roster(4), id = s.players[0].id;
  for (const status of ['Standby', 'Checked Out']) { setStatus(s, id, status); assert.throws(() => chooseMatch(s), /Four available/); }
  setStatus(s, id, 'Active'); assert.ok(chooseMatch(s).flat().includes(id));
});
test('finish updates all stats once and releases active assignments', () => {
  const s = roster(4), m = completed(s);
  for (const p of s.players) { assert.equal(p.gamesPlayed, 1); assert.equal(p.wins, m.teams[0].includes(p.id) ? 1 : 0); assert.equal(p.losses, 1 - p.wins); assert.equal(p.currentMatchId, null); }
  assert.throws(() => finishMatch(s, m.id, 0), /no longer playing/); assert.equal(eligible(s).length, 4); validateState(s);
});
test('finished players fall behind unused players', () => {
  const s = roster(), m = completed(s); s.queue = [];
  const next = chooseMatch(s).flat(); assert.ok(next.every(id => !m.teams.flat().includes(id)));
});
test('refresh restores queue, active matches, history, settings, finance and stats', async () => {
  const storage = memory(), store = createStore(storage);
  await store.update(() => roster(12));
  await store.update(s => { completed(s); startMatch(s, s.queue[0].id); s.players[0].paid = true; s.finance.flatFee = 100; s.settings.weights.partner = 20; });
  assert.deepEqual(loadState(storage), store.get());
  assert.equal(loadState(storage).queue.length, 1); assert.equal(loadState(storage).activeMatches.length, 1); assert.equal(loadState(storage).completedMatches.length, 1);
});
test('completed corrections and deletions derive stats, including player replacements', () => {
  const s = roster(), m = completed(s); saveMatch(s, m.teams, m.id, true, 1); recalculate(s);
  m.teams[1].forEach(id => assert.equal(s.players.find(p => p.id === id).wins, 1));
  const replaced = m.teams[0][0], fresh = s.players.find(p => !m.teams.flat().includes(p.id)).id;
  const teams = structuredClone(m.teams); teams[0][0] = fresh; saveMatch(s, teams, m.id, true, 0); recalculate(s);
  assert.equal(s.players.find(p => p.id === replaced).gamesPlayed, 0); assert.equal(s.players.find(p => p.id === fresh).wins, 1);
  removeMatch(s, m.id, true); recalculate(s); assert.ok(s.players.every(p => p.gamesPlayed === 0)); validateState(s);
});
test('manual edits reject duplicate players and simultaneous assignments', () => {
  const s = roster(); generateQueue(s, 'Balanced'); startMatch(s, s.queue[0].id);
  assert.throws(() => saveMatch(s, s.activeMatches[0].teams), /already reserved/);
  const teams = structuredClone(s.queue[0].teams); teams[1][0] = teams[0][0];
  assert.throws(() => saveMatch(s, teams, s.queue[0].id), /four different/);
  assert.throws(() => setStatus(s, s.activeMatches[0].teams[0][0], 'Standby'), /finish/);
});
test('mixed doubles enforces one male and one female per team', () => {
  const s = roster(); const teams = chooseMatch(s, 'Mixed Doubles');
  teams.forEach(team => assert.deepEqual(team.map(id => s.players.find(p => p.id === id).gender).sort(), ['Female', 'Male']));
  s.players.forEach(p => { p.gender = 'Male'; }); assert.throws(() => chooseMatch(s, 'Mixed Doubles'), /two available male and two available female/);
});
test('same gender mode and balanced skill optimization', () => {
  const s = roster(); const team = chooseMatch(s, 'Same Gender Balanced');
  assert.equal(new Set(team.flat().map(id => s.players.find(p => p.id === id).gender)).size, 1);
  const small = roster(4); [5, 1, 4, 3].forEach((n, i) => { small.players[i].skillLevel = n; });
  const teams = chooseMatch(small); const sums = teams.map(t => t.reduce((n, id) => n + small.players.find(p => p.id === id).skillLevel, 0));
  assert.equal(Math.abs(sums[0] - sums[1]), 1);
  assert.throws(() => chooseMatch(roster(4), 'Same Gender Balanced'), /four available players/);
});
test('recent partner penalties change an otherwise equally balanced pairing', () => {
  const s = roster(4); s.players.forEach(p => { p.skillLevel = 2; }); const m = completed(s);
  const next = chooseMatch(s); const pairs = m.teams.map(t => [...t].sort().join(','));
  assert.ok(next.every(t => !pairs.includes([...t].sort().join(','))));
});
test('JSON round trip rebuilds untrusted stats and preserves all authoritative state', () => {
  const s = roster(); completed(s); s.players[0].gamesPlayed = 9999;
  const restored = parseBackup(JSON.stringify(s)); assert.equal(restored.players[0].gamesPlayed, s.completedMatches[0].teams.flat().includes(s.players[0].id) ? 1 : 0);
  assert.deepEqual(parseBackup(JSON.stringify(restored)), restored);
});
test('malformed imports reject bad identities, statuses, timestamps and finance', () => {
  const valid = roster(); generateQueue(valid, 'Balanced');
  const mutations = [s => { s.players[1].id = s.players[0].id; }, s => { s.queue[0].teams[0][0] = 'missing'; }, s => { s.players[0].status = 'Checked Out'; }, s => { s.queue[0].teams[0][0] = s.queue[0].teams[0][1]; }, s => { s.settings.weights.games = -1; }, s => { s.finance.shuttleCount = 2.5; }, s => { s.queue[0].createdAt = 'yesterday'; }, s => { s.players[0].name = ' '; }, s => { s.activeMatches.push({ ...s.queue[0], id: 'another', startedAt: new Date().toISOString() }); }];
  for (const mutate of mutations) { const s = structuredClone(valid); mutate(s); assert.throws(() => parseBackup(JSON.stringify(s))); }
});
test('failed writes and failed validation do not mutate the live state', async () => {
  const storage = memory(), store = createStore(storage); await store.update(() => roster()); const before = store.get();
  await assert.rejects(store.update(s => { s.players[0].name = ''; })); assert.deepEqual(store.get(), before);
  storage.setItem = () => { throw new Error('Quota exceeded'); };
  await assert.rejects(store.update(s => { s.players[0].paid = true; }), /Quota/); assert.deepEqual(store.get(), before);
});
test('stale tabs reject changes and reload latest state', async () => {
  const storage = memory(), first = createStore(storage); await first.update(() => roster()); const second = createStore(storage);
  await first.update(s => { s.players[0].paid = true; });
  await assert.rejects(second.update(s => { s.players[1].paid = true; }), /Another tab/);
  assert.deepEqual(second.get(), first.get());
});
test('new session keeps profiles in standby; clear roster is separate', () => {
  const s = roster(); completed(s); s.players[0].paid = true;
  const fresh = startNewSession(s); assert.equal(fresh.players.length, 8); assert.notEqual(fresh.session.id, s.session.id);
  assert.equal(fresh.players[0].name, s.players[0].name); assert.equal(fresh.completedMatches.length, 0);
  assert.ok(fresh.players.every(p => !p.paid && p.gamesPlayed === 0 && p.status === 'Standby')); validateState(fresh);
  assert.equal(startNewSession(s, true).players.length, 0);
});
test('payment flags do not change availability; equal split distributes exact cents', () => {
  const s = roster(3); s.finance.sessionCost = 100; s.players[0].paid = true;
  assert.equal(playerFees(s).reduce((n, p) => n + p.cents, 0), 10000);
  assert.equal(financeSummary(s).collected, 3334); assert.equal(eligible(s).length, 3);
  s.finance.feeMode = 'combined'; s.finance.flatFee = 5; s.finance.perGame = 3; s.players[0].gamesPlayed = 2;
  assert.equal(playerFees(s)[0].cents, 1100);
});
test('duplicates require override; deletion preserves history; queue reorder works', () => {
  const s = roster(); assert.throws(() => savePlayer(s, { name: 'Player 1', gender: 'Male', skillLevel: 1 }), /name exists/);
  savePlayer(s, { name: 'Player 1', gender: 'Male', skillLevel: 1 }, null, true); assert.equal(s.players.length, 9);
  generateQueue(s, 'Balanced'); const id = s.queue[0].id; moveMatch(s, id, 1); assert.equal(s.queue[1].id, id);
  startMatch(s, id); finishMatch(s, id, 0); assert.throws(() => deletePlayer(s, s.completedMatches[0].teams[0][0]), /history/);
});
test('CSV escapes formulas and quoted names; corrupt storage is never silently reset', () => {
  assert.match(csv([['=1+2', 'A "quote"', 'line\nbreak']]), /"'=1\+2","A ""quote"""/);
  const storage = memory(); storage.setItem(STORAGE_KEY, '{bad json'); assert.throws(() => loadState(storage)); assert.equal(storage.getItem(STORAGE_KEY), '{bad json');
});
