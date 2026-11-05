import {createClient} from '@supabase/supabase-js';
import {handleDeletionRetry} from '../../../../../lib/accountDeletionRetryWorker.mjs';

export const runtime='nodejs';
export const maxDuration=240;
export const GET=request=>handleDeletionRetry(request,{
  secret:process.env.CRON_SECRET,
  enabled:process.env.ACCOUNT_DELETION_EXECUTION_ENABLED==='true' && process.env.ACCOUNT_DELETION_RETRY_ENABLED==='true',
  createDb:()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,
    {auth:{persistSession:false,autoRefreshToken:false}}),
});
