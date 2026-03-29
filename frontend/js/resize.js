// ── PANEL RESIZE LOGIC ──
import { drawEdges } from './graph.js';

let resizeDrag = null;

export function startResize(e, side) {
  e.preventDefault();
  const handle = e.currentTarget;
  handle.classList.add('dragging');
  resizeDrag = { side, startX: e.clientX, handle };
  document.addEventListener('mousemove', doResize);
  document.addEventListener('mouseup', stopResize);
}

function doResize(e) {
  if (!resizeDrag) return;
  const delta = e.clientX - resizeDrag.startX;
  resizeDrag.startX = e.clientX;

  if (resizeDrag.side === 'left') {
    const panel = document.getElementById('panelLeft');
    const newW = Math.max(220, Math.min(460, panel.offsetWidth + delta));
    panel.style.width = newW + 'px';
  } else {
    const panel = document.getElementById('panelRight');
    const newW = Math.max(220, Math.min(460, panel.offsetWidth - delta));
    panel.style.width = newW + 'px';
  }
  drawEdges();
}

function stopResize() {
  if (resizeDrag) {
    resizeDrag.handle.classList.remove('dragging');
    resizeDrag = null;
  }
  document.removeEventListener('mousemove', doResize);
  document.removeEventListener('mouseup', stopResize);
}
