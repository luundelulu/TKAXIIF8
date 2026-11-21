/* Haptic ringan lewat Vibration API. Android/Chrome mendukung; iOS Safari tidak (diabaikan diam-diam).
   Dapat dimatikan di Pengaturan; preferensi disimpan di localStorage. */
const KEY = 'tka-haptic';
let on = true;
try { on = localStorage.getItem(KEY) !== '0'; } catch { /* abaikan */ }
export const hapticOn = () => on;
export function setHaptic(v) { on = !!v; try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* abaikan */ } if (on) haptic(12); }
export function haptic(p = 10) {
  if (!on || !navigator.vibrate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try { navigator.vibrate(p); } catch { /* diabaikan */ }
}
/* Satu listener untuk semua kontrol interaktif */
export function initHaptics() {
  document.addEventListener('click', e => {
    const t = e.target.closest?.('button, [role=tab], [role=radio], [role=option], summary, a[href], label.ck, label.qc, .lnk, tr[data-goto]');
    if (!t || t.disabled) return;
    if (t.dataset.act === 'clear' || t.dataset.act === 'theme-reset' || t.dataset.act === 'unpin') haptic([12, 40, 12]);
    else if (t.matches('[data-preset], [role=tab]')) haptic(16);
    else if (t.matches('label.ck, label.qc, [data-asp]')) haptic(8);
    else haptic(10);
  }, true);
  document.addEventListener('change', e => { if (e.target.matches?.('input[type=color], input[type=range], select')) haptic(6); }, true);
}
