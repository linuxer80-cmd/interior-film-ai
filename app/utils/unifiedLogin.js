import { supabase } from "../../lib/supabase";
import { loadMyWorkerSites, workerDestination } from "./workerSites";

// Only paths already supported by the worker app may be used after login.
export function loginDestination(value) {
  if (!value) return null;
  const safe = workerDestination(value);
  return safe === "/worker" && value !== "/worker" ? null : safe;
}

export function invitationDestination(value) {
  const safe = loginDestination(value);
  return safe && /^\/worker\/(connect|direct-invite|invite)\//.test(safe) ? safe : null;
}

export async function resolveLoginDestination({ next, preference, userId }) {
  const invitation = invitationDestination(next);
  if (invitation) return invitation;
  const { data, error } = await supabase.rpc("get_my_company");
  if (error) throw error;
  const company = Array.isArray(data) ? data[0] : data;
  const owner = !!(company?.company_id && company.role === "owner" && company.is_active !== false);
  let worker = false;
  try {
    const result = await loadMyWorkerSites({ profileOnly: true });
    worker = !!(result.worker?.worker_id && result.worker.worker_is_active !== false);
  } catch (cause) {
    if (cause?.status !== 403) throw cause;
  }
  let recent = null;
  try { recent = localStorage.getItem(`film-last-home:${userId}`); } catch {}
  const preferred = preference === "worker" || preference === "owner" ? preference : recent;
  if (worker && (!owner || preferred === "worker")) return loginDestination(next) || "/worker";
  if (owner) return "/admin";
  return null;
}
