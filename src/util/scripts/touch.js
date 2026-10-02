// Touch has no right-click: a long press on a book, a shelf name or a chapter
// heading opens the same menu. Not inside the text itself — there a long
// press belongs to the system's own selection handles.
let timer = null;
let start = null;
let swallowClick = false;
let armed = false; // held long enough; the menu opens when the finger lifts
document.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) return;
  const target = e.target;
  if (!target.closest) return;
  // shelf names are editable on tap, but a long press on one is a menu
  if (target.closest('[contenteditable="true"], input, textarea')) return;
  if (target.closest('#pocket-chapters')) return;
  const p = e.touches[0];
  start = { x: p.clientX, y: p.clientY, target };
  armed = false;
  clearTimeout(timer);
  timer = setTimeout(() => { timer = null; armed = true; }, 550);
}, { passive: true });
const cancel = () => { clearTimeout(timer); timer = null; armed = false; };
document.addEventListener('touchmove', (e) => {
  if (!start) return;
  const p = e.touches[0];
  if (Math.hypot(p.clientX - start.x, p.clientY - start.y) > 10) cancel();
}, { passive: true });
document.addEventListener('touchend', () => {
  if (armed && start) {
    // iOS usually sends no click after a long press; when it does, it
    // comes at once — so the guard lifts itself before the menu's first tap
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 300);
    const { target, x, y } = start;
    setTimeout(() => target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y })), 30);
  }
  cancel();
}, { passive: true });
document.addEventListener('touchcancel', cancel, { passive: true });
// the tap that ends a long press must not also open the book
document.addEventListener('click', (e) => {
  if (!swallowClick) return;
  swallowClick = false;
  e.stopPropagation();
  e.preventDefault();
}, true);