// ── SVG GRAPH, EDGES, PARTICLES, NODES ──

let edgeIds = {};

export function getNodePos(id) {
  const area = document.getElementById('graphArea');
  const W = area.offsetWidth, H = area.offsetHeight;
  const map = {
    contract: { x: W * 0.5, y: H * 0.20 },
    usage:    { x: W * 0.27, y: H * 0.54 },
    billing:  { x: W * 0.73, y: H * 0.54 },
    orch:     { x: W * 0.5, y: H * 0.81 },
  };
  return map[id];
}

export function drawEdges() {
  const svg = document.getElementById('graph-svg');
  const area = document.getElementById('graphArea');
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
