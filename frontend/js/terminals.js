// ── TERMINAL PANEL HELPERS ──
import { state } from './state.js';

export function log(id, msg, cls = '') {
  const body = document.getElementById('tb-' + id);
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const line = document.createElement('div');
  line.className = 'log-line';
  const span = `<span class="log-msg ${cls}">${msg}</span>`;
  line.innerHTML = `<span class="log-ts">${ts}</span>${span}`;
  if (cls === 'dim' && state.viewMode === 'summary') line.style.display = 'none';
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

export function logWithTimestamp(id, ts, msg, cls = '') {
  const body = document.getElementById('tb-' + id);
  if (!body) return;
  const line = document.createElement('div');
  line.className = 'log-line';
  const span = `<span class="log-msg ${cls}">${msg}</span>`;
  line.innerHTML = `<span class="log-ts">${ts}</span>${span}`;
  if (cls === 'dim' && state.viewMode === 'summary') line.style.display = 'none';
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

export function setTermState(id, termState, label) {
  document.getElementById('td-' + id).className = 'term-dot ' + termState;
  document.getElementById('ts-' + id).className = 'term-state ' + termState;
  document.getElementById('ts-' + id).textContent = label;
  const pane = document.getElementById('tp-' + id);
  pane.className = 'term-pane clickable ' + (termState === 'done' ? 'done' : termState === 'idle' ? '' : 'active');
}

export function setTermOut(id, text, cls = '') {
  const el = document.getElementById('to-' + id);
  el.textContent = text;
  el.className = 'term-output ' + cls;
}

export function setConfidence(id, pct, color = '#3ecfaa') {
  const wrap = document.getElementById('cb-' + id);
  if (wrap) {
    wrap.classList.add('show');
    const fill = document.getElementById('cf-' + id);
    const val = document.getElementById('cv-' + id);
    if (fill) { fill.style.width = (pct * 100) + '%'; fill.style.background = color; }
    if (val) val.textContent = Math.round(pct * 100) + '%';
  }
}

export function setStatus(text, dotState) {
  document.getElementById('statusText').textContent = text;
  const colors = { live: 'var(--acid)', alert: 'var(--hot)', done: 'var(--cool)' };
  document.getElementById('statusText').style.color = colors[dotState] || 'var(--dim)';
  document.getElementById('pulseDot').className = 'pulse-dot ' + (dotState || '');
}

export function setSB(id, text, cls = '') {
  const el = document.getElementById(id);
  if (el) { el.textContent = text; el.className = 'sb-item ' + cls; }
}
