const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function teamChatPage(url) {
 const before=url.searchParams.get('before'),messageId=url.searchParams.get('messageId');
 const invalid=()=>{throw Object.assign(Error('대화 조회 위치를 확인해주세요.'),{status:400});};
 if(messageId){if(before||!uuid.test(messageId))invalid();return {messageId};}
 if(!before)return {};
 const parts=before.split('|');
 if(parts.length!==2||!uuid.test(parts[1])||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(parts[0])||!Number.isFinite(Date.parse(parts[0])))invalid();
 return {before:parts[0],id:parts[1]};
}
export function teamChatCursor(row) {return row?`${row.created_at}|${row.id}`:null;}
