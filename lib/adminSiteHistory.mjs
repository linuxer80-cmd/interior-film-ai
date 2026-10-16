// Keep native Android/browser Back inside the administrator screen while a site is open.
export function guardAdminSiteHistory(win, {canClose, onClose}) {
 const base = new URL(win.location.href);
 base.searchParams.set('tab', 'sites');
 base.searchParams.delete('site');
 base.searchParams.delete('section');
 const state = {...win.history.state};
 const marker = 'filmAdminSiteModal';
 delete state[marker];
 win.history.replaceState(state, '', base);
 const modalState = {...state, [marker]:true};
 win.history.pushState(modalState, '', base);
 let approved = false;
 function pop() {
  if (!approved && !canClose()) {
   win.history.pushState(modalState, '', base);
   return;
  }
  approved = false;
  onClose();
 }
 win.addEventListener('popstate', pop);
 return {
  close() {
   if (!canClose()) return;
   approved = true;
   win.history.back();
  },
  dispose() {
   win.removeEventListener('popstate', pop);
   if (win.history.state?.[marker]) {
    const current = {...win.history.state};
    delete current[marker];
    win.history.replaceState(current, '', win.location.href);
   }
  },
 };
}
