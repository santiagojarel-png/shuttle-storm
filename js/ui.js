import { SKILLS } from './constants.js';
export const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const skill = p => SKILLS[p.skillLevel - 1];
export const name = (s, id) => escape(s.players.find(p => p.id === id)?.name || 'Unknown player');
export const button = (text, action, id = '', cls = '', disabled = false) => `<button type="button" class="${cls}" data-action="${action}" data-id="${escape(id)}" ${disabled ? 'disabled' : ''}>${text}</button>`;
export const options = (values, selected) => values.map(v => { const [value, label] = Array.isArray(v) ? v : [v, v]; return `<option value="${escape(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escape(label)}</option>`; }).join('');
export const field = (label, input) => `<label>${label}${input}</label>`;
export const select = (name, values, selected) => `<select name="${name}">${options(values, selected)}</select>`;
export const number = (name, value, step = '0.01', max = 1000000000) => `<input name="${name}" type="number" min="0" max="${max}" step="${step}" value="${value}" required>`;
export const empty = (title, text, action = '') => `<div class="empty"><div class="empty-mark" aria-hidden="true">ϟ</div><h3>${title}</h3><p>${text}</p>${action}</div>`;
export const money = (cents, currency) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
export const time = value => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type })), a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
let toastTimer;
export function toast(message) { const el = document.querySelector('#toast'); el.textContent = message; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 6500); }
export function modal(title, content) {
  const dialog = document.querySelector('#dialog');
  document.querySelector('#dialog-content').innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${title}</h2>${button('Close', 'close', '', 'icon-button')}</div>${content}`;
  if (!dialog.open) dialog.showModal();
}
export function closeModal() { document.querySelector('#dialog').close(); }
