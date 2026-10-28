'use client';
import {useEffect,useRef,useState} from 'react';
import {createClient} from '@supabase/supabase-js';

// This isolated anonymous client never changes the app's signed-in session.
export default function useVisitorChatRealtime(topic,onChange){
 const [connected,setConnected]=useState(false);
 const callback=useRef(onChange);callback.current=onChange;
 useEffect(()=>{
  setConnected(false);
  if(!topic)return;
  let alive=true,channel=null;
  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{
   auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
  });
  (async()=>{
   try{
    await client.realtime.setAuth();
    if(!alive)return;
    channel=client.channel(topic,{config:{private:true}})
     .on('broadcast',{event:'changed'},()=>{if(alive)callback.current();})
     .subscribe(status=>{
      if(!alive)return;
      const isConnected=status==='SUBSCRIBED';setConnected(isConnected);
      if(isConnected)callback.current();
     });
   }catch{if(alive)setConnected(false);}
  })();
  return()=>{alive=false;if(channel)void client.removeChannel(channel);};
 },[topic]);
 return connected;
}
