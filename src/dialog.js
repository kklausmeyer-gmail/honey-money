let lockedDialog = null;
let scrollPosition = 0;
let previousStyle = null;

export function releaseDialogScroll() {
  if (!lockedDialog) return;
  const position = scrollPosition;
  lockedDialog = null;
  Object.assign(document.body.style, previousStyle);
  document.documentElement.classList.remove('modal-open');
  window.scrollTo(0, position);
}

export function openDialog(dialog) {
  if (lockedDialog && lockedDialog !== dialog) releaseDialogScroll();
  if (!lockedDialog) {
    scrollPosition = window.scrollY;
    previousStyle = Object.fromEntries(['position','top','left','right','width'].map(key => [key, document.body.style[key]]));
    lockedDialog = dialog;
    document.documentElement.classList.add('modal-open');
    Object.assign(document.body.style, { position: 'fixed', top: `-${scrollPosition}px`, left: '0', right: '0', width: '100%' });
    dialog.addEventListener('close', () => { if (lockedDialog === dialog) releaseDialogScroll(); }, { once: true });
  }
  dialog.showModal();
  dialog.scrollTop = 0;
}

// Auth routing replaces the entire dashboard, including an open dialog.
new MutationObserver(() => {
  if (lockedDialog && (!lockedDialog.isConnected || !lockedDialog.open)) releaseDialogScroll();
}).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
