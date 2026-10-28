'use client';
import {useEffect,useRef,useState} from 'react';
import {supabase} from '../../../lib/supabase';

// Broadcast contains no customer data; every refresh uses the existing owner API.
export default function useAdminCustomerRealtime(identity,onChange){
 const [connected,setConnected]=useState(false);
 const callback=useRef(onChange);callback.current=onChange;
 const companyId=identity?.companyId,userId=identity?.userId;
 useEffect(()=>{
  setConnected(false);
  if(!companyId||!userId)return;
  let alive=true,invalid=false,channel=null;
  function invalidate(){
   if(!alive||invalid)return;
   invalid=true;setConnected(false);
   if(channel){void supabase.removeChannel(channel);channel=null;}
   // Supabase auth callbacks must not await other Supabase operations.
   setTimeout(()=>{if(alive)callback.current('auth');},0);
  }
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
   if(session?.user?.id!==userId)invalidate();
  });
  (async()=>{
   try{
    const {data}=await supabase.auth.getSession();
    if(!alive||invalid)return;
    if(data?.session?.user?.id!==userId){invalidate();return;}
    await supabase.realtime.setAuth();
    if(!alive||invalid)return;
    channel=supabase.channel('customer-chat-admin:'+companyId,{config:{private:true}})
     .on('broadcast',{event:'changed'},()=>{if(alive&&!invalid)callback.current('changed');})
     .subscribe(status=>{
      if(!alive||invalid)return;
      const isConnected=status==='SUBSCRIBED';setConnected(isConnected);
      if(isConnected)callback.current('changed');
     });
   }catch{if(alive)setConnected(false);}
  })();
  return()=>{alive=false;subscription.unsubscribe();if(channel)void supabase.removeChannel(channel);};
 },[companyId,userId]);
 return connected;
}
