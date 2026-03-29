// ── ARIA TOAST NOTIFICATION SYSTEM ──
// Slide-in notifications for key pipeline events.

const ICONS = {
  alert:   '⚡',
  success: '✓',
  info:    '◆',
  warn:    '△',
};

let _container = null;

function _getContainer() {
  if (!_container) {
    _container = document.createElement('div');
    _container.id = '_aria_toast_container';
    _container.style.cssText = [
      'position:fixed',
      'top:16px',
      'right:16px',
      'z-index:9999',
      'display:flex',
      'flex-direction:column',
      'gap:8px',
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(_container);
  }
  return _container;
}

/**
 * Show a toast notification.
 * @param {string} message  - Text to display
 * @param {'alert'|'success'|'info'|'warn'} type - Visual style
 * @param {number} duration - Auto-dismiss in ms (default 4500)
 */
export function showToast(message, type = 'info', duration = 4500) {
  const container = _getContainer();
  const icon = ICONS[type] || '◆';

  const toast = document.createElement('div');
  toast.className = `aria-toast aria-toast-${type}`;
  toast.innerHTML =
    `<span class="toast-icon">${icon}</span>` +
    `<span class="toast-msg">${message}</span>`;

  container.appendChild(toast);

  // Double rAF to ensure the element is painted before the transition kicks in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}
