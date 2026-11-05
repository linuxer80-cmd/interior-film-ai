import { processAccountDeletionRequest } from '../../../../lib/accountDeletionProcessor.mjs';
import { handleDeletionRequest } from '../../../../lib/accountDeletionRequestHandler.mjs';
import { createClient } from '@supabase/supabase-js';
import { assessDeletionRequest } from '../../../../lib/accountDeletionPreflight.mjs';
export const runtime = 'nodejs';
// Company cleanup includes verified Storage/Auth calls; stay within the 5-minute DB lease.
export const maxDuration = 240;
async function authenticate(request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return { db, userId: data.user.id };
}
export const GET = request => handleDeletionRequest(request, false, {authenticate, assessDeletionRequest});
export const POST = request => handleDeletionRequest(request, true, {
  authenticate, assessDeletionRequest,
  // Activate only after the database release has been installed and verified.
  processRequest:process.env.ACCOUNT_DELETION_EXECUTION_ENABLED==='true' ? processAccountDeletionRequest : undefined,
});
