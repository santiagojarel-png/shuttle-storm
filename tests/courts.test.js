import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, validateState } from '../js/state.js';
import { addCourt, removeCourt, freeCourts } from '../js/courts.js';
import { savePlayer } from '../js/players.js';
import { generateQueue, startMatch, finishMatch } from '../js/queue.js';
import { parseBackup } from '../js/storage.js';
import { queueView, courtsView } from '../js/views.js';

const render = s => queueView(s, { mode: 'Balanced' });
const session = () => {
  const s = newState();
  for (let i = 0; i < 8; i++) savePlayer(s, { name: `Player ${i}`, gender: 'Male', skillLevel: 2 });
  generateQueue(s, 'Balanced');
  return s;
};

test('Queue leads with the court empty state and keeps generation below it', () => {
  const html = render(newState());
  assert.match(html, /No courts yet/);
  assert.match(html, /data-action="add-court"/);
  assert.ok(html.indexOf('Court overview') < html.indexOf('data-action="generate"'));
  assert.doesNotMatch(html, /Now playing/);
});

test('court naming, occupancy protection, completion and backup persistence', () => {
  const s = session();
  assert.throws(() => startMatch(s, s.queue[0].id), /Add a court/);
  const first = addCourt(s), second = addCourt(s);
  assert.equal(first.name, 'Court 1'); assert.equal(second.name, 'Court 2');
  assert.throws(() => addCourt(s, 'court 1'), /already exists/);
  const match = s.queue[0]; startMatch(s, match.id, second.id);
  assert.throws(() => startMatch(s, s.queue[0].id, second.id), /already in use/);
  assert.throws(() => removeCourt(s, second.id), /Finish the active match/);
  assert.deepEqual(freeCourts(s).map(c => c.id), [first.id]);
  assert.deepEqual(parseBackup(JSON.stringify(s)), validateState(s));
  finishMatch(s, match.id, 0);
  const restored = validateState(s);
  assert.equal(freeCourts(restored).length, 2);
  assert.equal(restored.players.filter(p => p.gamesPlayed === 1).length, 4);
  assert.equal(restored.players.filter(p => p.wins === 1).length, 2);
});

test('both views show each live matchup once and offer actions for the correct court', () => {
  const s = session(), first = addCourt(s), second = addCourt(s);
  const m = s.queue[0]; startMatch(s, m.id, first.id);
  s.players.find(p => p.id === m.teams[0][0]).name = '<Charlotte & Jazz>';
  for (const html of [render(s), courtsView(s)]) {
    assert.equal((html.match(/data-action="finish"/g) || []).length, 1);
    assert.match(html, /&lt;Charlotte &amp; Jazz&gt;/);
    assert.ok(html.includes(`data-action="start-next-on-court" data-id="${second.id}"`));
    assert.match(html, /class="versus">VS/);
    assert.match(html, /In play/); assert.match(html, /Available/);
  }
  startMatch(s, s.queue[0].id, second.id);
  assert.doesNotMatch(render(s), /data-action="start-next-on-court"/);
  finishMatch(s, m.id, 0);
  assert.doesNotMatch(render(s), /data-action="start-next-on-court"/);
});

test('legacy active matches without court fields remain visible and finishable', () => {
  const s = session(), court = addCourt(s), m = s.queue[0];
  startMatch(s, m.id, court.id);
  delete s.courts;
  for (const bucket of ['queue', 'activeMatches', 'completedMatches']) for (const match of s[bucket]) delete match.courtId;
  const restored = parseBackup(JSON.stringify(s));
  const html = render(restored);
  assert.match(html, /Playing without a court/);
  assert.ok(html.includes(`data-action="finish" data-id="${m.id}"`));
  finishMatch(restored, m.id, 1);
  assert.equal(validateState(restored).completedMatches.length, 1);
});
