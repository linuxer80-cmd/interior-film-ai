import { privateAuth, privateJson } from '../../../../../lib/workerPrivate';
import { resolveTeamSite } from '../../../../../lib/teamSiteAccess.mjs';
import { teamUnread } from '../../../../../lib/teamUnread.mjs';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  try {
    const auth = await privateAuth(request, false);
    if (auth.error) return privateJson({ error: auth.error }, auth.status);
    const { site } = await resolveTeamSite(auth.db, auth.user.id, new URL(request.url).searchParams.get('siteId'));
    return privateJson(await teamUnread(auth.db, auth.user.id, site));
  } catch (error) {
    return privateJson({ error: error.status ? error.message : '새 채팅 수를 확인하지 못했습니다.' }, error.status || 500);
  }
}
