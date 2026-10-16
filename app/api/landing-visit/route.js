import { createClient } from '@supabase/supabase-js';
import { uuid } from '../../../lib/workerPrivate';
export const runtime = 'nodejs';
export async function POST(request) {
 const origin = request.headers.get('origin');
 if (!origin || origin !== new URL(request.url).origin) return new Response(null, {status:403});
 if (/bot|crawler|spider|facebookexternalhit|preview/i.test(request.headers.get('user-agent') || '')) return new Response(null, {status:204});
 try {
  const raw = await request.text();
  if (raw.length > 100) return new Response(null, {status:400});
  const {visitorId} = JSON.parse(raw);
  if (!uuid(visitorId)) return new Response(null, {status:400});
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
  // Database assigns the Korean date and enforces one record per browser/day.
  const {error} = await db.from('landing_visitors').upsert({visitor_id:visitorId}, {onConflict:'visit_day,visitor_id',ignoreDuplicates:true});
  if (error) throw error;
  return new Response(null, {status:204,headers:{'Cache-Control':'no-store'}});
 } catch { return new Response(null, {status:503}); }
}
