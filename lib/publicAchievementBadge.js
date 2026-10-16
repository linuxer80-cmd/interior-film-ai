import {badgeImageUrl} from './achievementServer';
// Call only for profiles already filtered by explicit directory consent.
export async function directoryBadges(db,profiles){
 const ids=profiles.map(p=>p.user_id);if(!ids.length)return profiles;
 const preferences=await db.from('achievement_preferences').select('user_id,subject_key,featured_badge').in('user_id',ids).in('subject_key',ids.map(id=>`user:${id}`));
 if(preferences.error)return profiles;
 const valid=(preferences.data||[]).filter(p=>p.subject_key===`user:${p.user_id}`&&p.featured_badge);
 const selected=[...new Set(valid.map(p=>p.featured_badge))];if(!selected.length)return profiles;
 const definitions=await db.from('achievement_definitions').select('id,title,art_key,image_path,tier').eq('audience','worker').in('id',selected);
 if(definitions.error)return profiles;
 const defs=new Map((definitions.data||[]).map(b=>[b.id,{id:b.id,title:b.title,art_key:b.art_key,tier:b.tier,image_url:badgeImageUrl(db,b.image_path)}]));
 const selectedByUser=new Map(valid.map(p=>[p.user_id,defs.get(p.featured_badge)||null]));
 return profiles.map(p=>({...p,featured_badge:selectedByUser.get(p.user_id)||null}));
}
