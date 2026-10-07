import { SKILLS, GENDERS } from './constants.js';
import { createStore, parseBackup } from './storage.js';
import { savePlayer, setStatus, deletePlayer, assignment } from './players.js';
import { saveMatch, generateQueue, startMatch, finishMatch, removeMatch, moveMatch } from './queue.js';
import { addCourt, removeCourt } from './courts.js';
import { startNewSession } from './session.js';
import { csv, winPercentage } from './stats.js';
import { queueView, playersView, statsView, settingsView } from './views.js';
import { escape, button, options, field, select, modal, closeModal, toast, download } from './ui.js';

const main = document.querySelector('#main');
const filters = { search: '', status: '', gender: '', playerSort: 'name', statsSort: 'wins', mode: 'Balanced' };
let store, installPrompt, pendingImport;
const getView = () => ['queue', 'players', 'stats', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'queue';
function render() {
  if (location.hash === '#courts') history.replaceState(null, '', '#queue');
  const s = store.get(), view = getView();
  document.documentElement.dataset.theme = s.settings.theme;
  document.title = `Shuttle Storm · ${view[0].toUpperCase() + view.slice(1)}`;
  document.querySelectorAll('nav a').forEach(a => a.setAttribute('aria-current', a.dataset.view === view ? 'page' : 'false'));
  main.innerHTML = ({ queue: queueView, players: playersView, stats: statsView, settings: settingsView })[view](s, filters);
}
function confirmAction(title, description, action, id = '') {
  modal(title, `<p>${description}</p><p class="form-error" role="alert"></p><div class="dialog-actions">${button('Cancel', 'close')}${button('Confirm', action, id, 'primary')}</div>`);
}
function playerDialog(playerId) {
  const p = store.get().players.find(p => p.id === playerId);
  modal(p ? 'Edit player' : 'Add player', `<form id="player-form" data-id="${p?.id || ''}">${field('Player name', `<input name="name" value="${escape(p?.name || '')}" maxlength="80" required autocomplete="off" autofocus>`)}<div class="form-grid">${field('Gender', select('gender', GENDERS, p?.gender))}${field('Skill level', select('skillLevel', SKILLS.map((label, i) => [i + 1, label]), p?.skillLevel || 1))}</div><label class="checkbox"><input type="checkbox" name="duplicate">Allow duplicate name (different people)</label><p class="form-error" role="alert"></p><div class="dialog-actions">${button('Cancel', 'close')}<button type="submit" class="primary">Save player</button></div></form>`);
}
function matchDialog(id = null, completed = false) {
  const s = store.get(), m = (completed ? s.completedMatches : s.queue).find(m => m.id === id);
  const pool = s.players.filter(p => completed || (p.status === 'Active' && (!assignment(s, p.id) || assignment(s, p.id).id === id)));
  const choices = [['', 'Choose a player'], ...pool.map(p => [p.id, `${p.name} · ${SKILLS[p.skillLevel - 1]} · ${p.id.slice(0, 4)}`])];
  modal(completed ? 'Correct completed match' : id ? 'Edit queued match' : 'Manual match', `<form id="match-form" data-id="${id || ''}" data-completed="${completed}"><p class="muted">Choose four different players. Change any position to replace a player or swap teams.</p>${[0, 1].map(side => `<fieldset><legend>Team ${side + 1}</legend><div class="form-grid">${[0, 1].map(slot => field(`Player ${slot + 1}`, `<select name="p${side}${slot}" required>${options(choices, m?.teams[side][slot] || '')}</select>`)).join('')}</div></fieldset>`).join('')}${completed ? field('Winning team', select('winner', [[0, 'Team 1'], [1, 'Team 2']], m.winner)) : ''}<p class="form-error" role="alert"></p><div class="dialog-actions">${button('Cancel', 'close')}<button type="submit" class="primary">Save match</button></div></form>`);
}
const update = async (fn, message) => { await store.update(fn); if (message) toast(message); };
async function action(target) {
  const id = target.dataset.id, a = target.dataset.action;
  if (a === 'close') return closeModal();
  if (a === 'settings') { location.hash = 'settings'; return; }
  if (a === 'go-players') { location.hash = 'players'; return; }
  if (a === 'add-player' || a === 'edit-player') return playerDialog(id);
  if (a === 'add-court') return modal('Add court', `<form id="court-form">${field('Court name', '<input name="name" maxlength="40" placeholder="Court 1" autofocus>')}<p class="muted">Leave blank to use the next available Court number.</p><p class="form-error" role="alert"></p><div class="dialog-actions">${button('Cancel', 'close')}<button class="primary" type="submit">Add court</button></div></form>`);
  if (a === 'remove-court') return confirmAction('Remove court?', 'Active courts cannot be removed until the match is finished.', 'confirm-remove-court', id);
  if (a === 'confirm-remove-court') { await update(s => removeCourt(s, id), 'Court removed.'); closeModal(); return; }
  if (a === 'bulk') return modal('Bulk add players', `<form id="bulk-form"><p class="muted">One name per line. All players get the selected gender and skill level; edit individual profiles afterwards. Duplicate names are rejected here.</p>${field('Names', '<textarea name="names" rows="7" maxlength="10000" required placeholder="Jarel\nJaz\nDrazen\nTevin"></textarea>')}<div class="form-grid">${field('Gender', select('gender', GENDERS, 'Male'))}${field('Skill level', select('skillLevel', SKILLS.map((x, i) => [i + 1, x]), 1))}</div><p class="form-error" role="alert"></p><div class="dialog-actions">${button('Cancel', 'close')}<button class="primary" type="submit">Add players</button></div></form>`);
  if (a === 'delete-player') return confirmAction('Delete player?', 'This removes their profile. Players with match history must be checked out instead.', 'confirm-delete-player', id);
  if (a === 'confirm-delete-player') { await update(s => deletePlayer(s, id), 'Player deleted.'); closeModal(); return; }
  if (a === 'activate') return update(s => setStatus(s, id, 'Active'), 'Player is active.');
  if (a === 'generate') {
    let result; await update(s => { result = generateQueue(s, filters.mode); });
    toast(`${result.count} match${result.count === 1 ? '' : 'es'} added. ${result.reason}`); return;
  }
  if (a === 'manual' || a === 'edit-match' || a === 'edit-history') return matchDialog(id || null, a === 'edit-history');
  if (a === 'start') { let court; await update(s => { court = startMatch(s, id); }); toast(`Match started on ${court.name}. Good game!`); return; }
  if (a === 'start-next-on-court') { let court; await update(s => { const next = s.queue[0]; if (!next) throw new Error('There is no queued match to start.'); court = startMatch(s, next.id, id); }); toast(`Match started on ${court.name}. Good game!`); return; }
  if (a === 'finish') {
    const s = store.get(), m = s.activeMatches.find(m => m.id === id);
    if (!m) throw new Error('Match is no longer playing.');
    return modal('Who won?', `<p>Select the winning team to finish this match.</p><p class="form-error" role="alert"></p><div class="winner-choices">${m.teams.map((t, i) => button(`<small>TEAM ${i + 1}</small>${t.map(id => escape(s.players.find(p => p.id === id).name)).join(' + ')}`, `winner-${i}`, id, 'winner-choice')).join('')}</div>`);
  }
  if (a === 'winner-0' || a === 'winner-1') { await update(s => finishMatch(s, id, Number(a.slice(-1))), 'Match finished. Statistics updated.'); closeModal(); return; }
  if (a === 'up' || a === 'down') return update(s => moveMatch(s, id, a === 'up' ? -1 : 1));
  if (a === 'remove-match') return update(s => removeMatch(s, id), 'Match removed; players are available again.');
  if (a === 'delete-history') return confirmAction('Delete completed match?', 'This result will be removed and all session statistics recalculated.', 'confirm-delete-history', id);
  if (a === 'confirm-delete-history') { await update(s => removeMatch(s, id, true), 'History corrected.'); closeModal(); return; }
  if (a === 'toggle-paid') return update(s => { const p = s.players.find(p => p.id === id); p.paid = !p.paid; });
  if (a === 'all-paid' || a === 'clear-paid') return confirmAction(a === 'all-paid' ? 'Mark everyone paid?' : 'Clear all payment flags?', 'This changes only payment status. Player availability stays the same.', a === 'all-paid' ? 'confirm-all-paid' : 'confirm-clear-paid');
  if (a === 'confirm-all-paid' || a === 'confirm-clear-paid') { await update(s => { s.players.forEach(p => { p.paid = a === 'confirm-all-paid'; }); }, 'Payments updated.'); closeModal(); return; }
  if (a === 'new-session' || a === 'clear-roster') return confirmAction(a === 'new-session' ? 'Start a new session?' : 'Clear all players?', a === 'new-session' ? 'Keep player names, genders and skill levels. Clear all matches, statistics, costs and payment flags. All players move to standby. Export a backup first if you need this session.' : 'Delete the entire roster, queue, history, statistics and payments. Export a backup first; this cannot be undone.', a === 'new-session' ? 'confirm-new-session' : 'confirm-clear-roster');
  if (a === 'confirm-new-session' || a === 'confirm-clear-roster') { await update(s => startNewSession(s, a === 'confirm-clear-roster'), 'Ready for a fresh session.'); closeModal(); return; }
  if (a === 'export') return download(`shuttle-storm-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(store.get(), null, 2), 'application/json');
  if (a === 'confirm-import') { await update(() => pendingImport, 'Session imported and statistics rebuilt.'); pendingImport = null; closeModal(); return; }
  if (a === 'stats-csv') { const s = store.get(); return download('shuttle-storm-stats.csv', csv([['Name', 'Gender', 'Skill Level', 'Games Played', 'Wins', 'Losses', 'Win Percentage'], ...s.players.map(p => [p.name, p.gender, SKILLS[p.skillLevel - 1], p.gamesPlayed, p.wins, p.losses, winPercentage(p)])]), 'text/csv;charset=utf-8'); }
  if (a === 'matches-csv') { const s = store.get(); return download('shuttle-storm-matches.csv', csv([['Match ID', 'Team 1 Player 1', 'Team 1 Player 2', 'Team 2 Player 1', 'Team 2 Player 2', 'Started At', 'Completed At', 'Winner'], ...s.completedMatches.map(m => [m.id, ...m.teams.flat().map(id => s.players.find(p => p.id === id).name), m.startedAt, m.completedAt, `Team ${m.winner + 1}`])]), 'text/csv;charset=utf-8'); }
  if (a === 'install') {
    if (installPrompt) { await installPrompt.prompt(); installPrompt = null; }
    else modal('Install Shuttle Storm', '<p>On Android, open this app in Chrome and use the browser menu → Install app or Add to Home screen. On iPhone, use Safari → Share → Add to Home Screen.</p><p class="muted">Installation requires HTTPS or localhost and a supported browser. Open the app online once before using it offline.</p>');
  }
}
function report(error) {
  const text = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  const inline = document.querySelector('#dialog[open] .form-error');
  if (inline) inline.textContent = text; else toast(text);
}
document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]'); if (!target || target.disabled || !store) return;
  target.disabled = true;
  try { await action(target); } catch (error) { report(error); } finally { target.disabled = false; }
});
document.addEventListener('submit', async event => {
  event.preventDefault(); if (!store) return;
  const form = event.target, data = Object.fromEntries(new FormData(form)), submit = form.querySelector('[type=submit]');
  if (submit.disabled) return; submit.disabled = true;
  try {
    if (form.id === 'player-form') { await update(s => savePlayer(s, data, form.dataset.id || null, data.duplicate === 'on'), 'Player saved.'); closeModal(); }
    if (form.id === 'court-form') { let court; await update(s => { court = addCourt(s, data.name); }); toast(`${court.name} added.`); closeModal(); }
    if (form.id === 'bulk-form') {
      const names = data.names.split(/\r?\n/).map(n => n.trim()).filter(Boolean);
      if (!names.length) throw new Error('Enter at least one player name.');
      await update(s => { names.forEach(name => savePlayer(s, { ...data, name })); }, `${names.length} players added.`); closeModal();
    }
    if (form.id === 'match-form') {
      await update(s => saveMatch(s, [[data.p00, data.p01], [data.p10, data.p11]], form.dataset.id || null, form.dataset.completed === 'true', Number(data.winner)), 'Match saved.'); closeModal();
    }
    if (form.id === 'finance-form') await update(s => { Object.keys(s.finance).forEach(key => { s.finance[key] = ['feeMode', 'currency'].includes(key) ? data[key] : Number(data[key]); }); }, 'Finance calculations saved.');
    if (form.id === 'settings-form') await update(s => { Object.keys(s.settings.weights).forEach(key => { s.settings.weights[key] = Number(data[key]); }); s.settings.theme = data.theme; }, 'Preferences saved.');
  } catch (error) { report(error); } finally { submit.disabled = false; }
});
document.addEventListener('change', async event => {
  const el = event.target; if (!store) return;
  try {
    const mapping = { mode: 'mode', 'status-filter': 'status', 'gender-filter': 'gender', 'player-sort': 'playerSort', 'stats-sort': 'statsSort' };
    if (mapping[el.id]) { filters[mapping[el.id]] = el.value; render(); }
    if (el.dataset.status) { try { await update(s => setStatus(s, el.dataset.status, el.value)); } finally { render(); } }
    if (el.id === 'import-file' && el.files[0]) {
      if (el.files[0].size > 10000000) throw new Error('Backup is too large (10 MB maximum).');
      pendingImport = parseBackup(await el.files[0].text());
      confirmAction('Replace this session?', `The validated backup contains ${pendingImport.players.length} players and ${pendingImport.completedMatches.length} completed matches. This replaces all current session data. Export your current session first if needed.`, 'confirm-import'); el.value = '';
    }
  } catch (error) { report(error); }
});
document.addEventListener('input', event => {
  if (event.target.id === 'search') {
    const start = event.target.selectionStart; filters.search = event.target.value; render();
    const input = document.querySelector('#search'); input.focus(); try { input.setSelectionRange(start, start); } catch { /* Search inputs vary by browser. */ }
  }
});
window.addEventListener('hashchange', () => { if (store) { closeModal(); render(); main.focus(); } });
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
window.addEventListener('storage', () => { if (store) toast('Another tab changed local data. Your next action will load it before making changes.'); });
function connection() { document.querySelector('#connection').textContent = navigator.onLine ? 'On this device' : 'Offline · on this device'; }
window.addEventListener('online', connection); window.addEventListener('offline', connection); connection();
try { store = createStore(); store.subscribe(render); render(); }
catch (error) {
  main.innerHTML = `<h1>Saved session needs attention</h1><p>Stored data could not be read. It has not been overwritten. Save the raw copy before clearing browser data, or contact the queue manager.</p><p>${escape(error.message)}</p><button id="rescue">Download stored data</button>`;
  document.querySelector('#rescue').onclick = () => { try { download('shuttle-storm-recovery.txt', localStorage.getItem('shuttle-storm.session.v1') || '', 'text/plain'); } catch (error) { report(error); } };
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => toast('Offline shell could not be installed. Session saving still works; retry online.'));
