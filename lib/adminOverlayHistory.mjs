const managers = new WeakMap();
const marker = 'filmAdminOverlay';
export function registerAdminOverlay(win, {canClose=()=>true,onClose,priority=0}) {
 let manager=managers.get(win);
 if(!manager){
  manager={entries:[],pending:false};
  manager.push=()=>win.history.pushState({...win.history.state,[marker]:true},'',win.location.href);
  manager.pop=()=>{
   manager.pending=false;
   const top=[...manager.entries].sort((a,b)=>a.priority-b.priority||a.order-b.order).at(-1);
   if(!top)return;
   if(!top.approved&&!top.canClose()){manager.push();return;}
   top.approved=false;
   manager.entries=manager.entries.filter(e=>e!==top);
   // Re-arm before React updates so a second Back closes only the next window.
   if(manager.entries.length)manager.push();
   top.onClose();
  };
  managers.set(win,manager);
  win.addEventListener('popstate',manager.pop);
  manager.push();
 }
 const entry={canClose,onClose,priority,order:manager.entries.length,approved:false};
 manager.entries.push(entry);
 return {
  close(){
   if(manager.pending||!manager.entries.includes(entry))return;
   const top=[...manager.entries].sort((a,b)=>a.priority-b.priority||a.order-b.order).at(-1);
   if(top!==entry||!entry.canClose())return;
   entry.approved=true;manager.pending=true;win.history.back();
  },
  dispose(){
   manager.entries=manager.entries.filter(e=>e!==entry);
   if(manager.entries.length)return;
   win.removeEventListener('popstate',manager.pop);
   managers.delete(win);
   if(win.history.state?.[marker]){
    const state={...win.history.state};delete state[marker];
    win.history.replaceState(state,'',win.location.href);
   }
  },
 };
}
