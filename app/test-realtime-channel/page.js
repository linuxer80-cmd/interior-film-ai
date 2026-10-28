'use client';
import {useState} from 'react';
import {createClient} from '@supabase/supabase-js';
export default function RealtimeCheck(){
 const [topic,setTopic]=useState(''),[status,setStatus]=useState('준비'),[count,setCount]=useState(0);
 async function connect(){
  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  try{await client.realtime.setAuth();client.channel(topic,{config:{private:true}}).on('broadcast',{event:'changed'},()=>setCount(v=>v+1)).subscribe(s=>setStatus(s));}
  catch{setStatus('오류');}
 }
 return <main><h1>알림 연결 시험</h1><label>시험 주소<input value={topic} onChange={e=>setTopic(e.target.value)}/></label><button onClick={connect}>연결</button><p>연결 상태: {status}</p><p>받은 시험 알림: {count}</p></main>;
}
