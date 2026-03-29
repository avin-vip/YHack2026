// ── SVG GRAPH, EDGES, PARTICLES, NODES ──

let edgeIds = {};

const BASELINE_LEFT_WIDTH = 250;
const BASELINE_RIGHT_WIDTH = 230;
const NODE_X_RATIO = {
  contract: 0.5,
  usage: 0.27,
  billing: 0.73,
  orch: 0.5,
};
const NODE_Y_RATIO = {
  contract: 0.2,
  usage: 0.54,
  billing: 0.54,
  orch: 0.81,
};

function getGraphLayoutMetrics() {
  const area = document.getElementById('graphArea');
  const leftPanel = document.getElementById('panelLeft');
  const rightPanel = document.getElementById('panelRight');

  if (!area) return null;

  const W = area.offsetWidth;
  const H = area.offsetHeight;
  const leftW = leftPanel ? leftPanel.offsetWidth : BASELINE_LEFT_WIDTH;
  const rightW = rightPanel ? rightPanel.offsetWidth : BASELINE_RIGHT_WIDTH;
  const totalW = leftW + W + rightW;
  const baselineCenterW = Math.max(1, totalW - BASELINE_LEFT_WIDTH - BASELINE_RIGHT_WIDTH);

  return { W, H, leftW, baselineCenterW };
}

export function getNodePos(id) {
  const metrics = getGraphLayoutMetrics();
  if (!metrics) return { x: 0, y: 0 };

  const { W, H, leftW, baselineCenterW } = metrics;
  const xRatio = NODE_X_RATIO[id] ?? 0.5;
  const yRatio = NODE_Y_RATIO[id] ?? 0.5;

  // Preserve prior screen-space node x positions even when side panel widths change.
  const baselineAbsX = BASELINE_LEFT_WIDTH + baselineCenterW * xRatio;
  const x = Math.max(0, Math.min(W, baselineAbsX - leftW));
  const y = H * yRatio;

  return { x, y };
}

function layoutNodes() {
  ['contract', 'usage', 'billing', 'orch'].forEach(id => {
    const node = document.getElementById('node-' + id);
    if (!node) return;
    const pos = getNodePos(id);
    node.style.left = `${pos.x}px`;
    node.style.top = `${pos.y}px`;
  });
}

export function drawEdges() {
  const svg = document.getElementById('graph-svg');
  const area = document.getElementById('graphArea');
  layoutNodes();
  const W = area.offsetWidth, H = area.offsetHeight;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const edges = [
    ['contract', 'usage'],
    ['contract', 'billing'],
    ['usage', 'orch'],
    ['billing', 'orch'],
  ];

  svg.innerHTML = '';
  edgeIds = {};

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  filter.setAttribute('id', 'glow');
  filter.innerHTML = `<feGaussianBlur stdDeviation="2.5" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>`;
  defs.appendChild(filter);
  svg.appendChild(defs);

  edges.forEach(([a, b]) => {
    const na = getNodePos(a), nb = getNodePos(b);
    const id = `edge-${a}-${b}`;

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    bg.setAttribute('x1', na.x); bg.setAttribute('y1', na.y);
    bg.setAttribute('x2', nb.x); bg.setAttribute('y2', nb.y);
    bg.setAttribute('stroke', '#22222e'); bg.setAttribute('stroke-width', '1');
    svg.appendChild(bg);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('id', id);
    line.setAttribute('x1', na.x); line.setAttribute('y1', na.y);
    line.setAttribute('x2', nb.x); line.setAttribute('y2', nb.y);
    line.setAttribute('stroke', '#c8f040'); line.setAttribute('stroke-width', '1.5');
    line.setAttribute('opacity', '0'); line.setAttribute('filter', 'url(#glow)');
    svg.appendChild(line);

    edgeIds[id] = line;
  });
}

export function activateEdge(a, b, color = '#c8f040') {
  const id = `edge-${a}-${b}`;
  const line = edgeIds[id];
  if (!line) return;
  line.setAttribute('stroke', color);
  line.setAttribute('opacity', '1');
  animateParticle(a, b, color);
}

export function animateParticle(a, b, color) {
  const svg = document.getElementById('graph-svg');
  const na = getNodePos(a), nb = getNodePos(b);
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('r', '4'); circle.setAttribute('fill', color);
  circle.setAttribute('filter', 'url(#glow)');
  svg.appendChild(circle);
  const dur = 750, start = performance.now();
  function frame(now) {
    const t = Math.min((now - start) / dur, 1);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    circle.setAttribute('cx', na.x + (nb.x - na.x) * ease);
    circle.setAttribute('cy', na.y + (nb.y - na.y) * ease);
    if (t < 1) requestAnimationFrame(frame); else circle.remove();
  }
  requestAnimationFrame(frame);
}

export function setNode(id, nodeState, val = '') {
  const el = document.getElementById('node-' + id);
  el.className = 'node-label ' + nodeState;
  if (val) document.getElementById('nv-' + id).textContent = val;
}

export function resetEdges() {
  Object.values(edgeIds).forEach(l => l.setAttribute('opacity', '0'));
}
