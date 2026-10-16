import {registerAdminOverlay} from './adminOverlayHistory.mjs';
export function guardAdminSiteHistory(win, options) {
 const base=new URL(win.location.href);
 base.searchParams.set('tab','sites');
 base.searchParams.delete('site');base.searchParams.delete('section');
 win.history.replaceState({...win.history.state},'',base);
 return registerAdminOverlay(win,{...options,priority:1001});
}
