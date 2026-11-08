import {connectionRow,publicConnection,withMarketingLock,sealKey,openKey} from './onlineSalesServer';
import {MARKETING_COMPANY_ID} from './onlineSales.mjs';
import {PLACE_ID,loadPlaceSearch} from './naverPlace.mjs';
export function publicPlaceConnection(row){
  const state=publicConnection(row);
  return {...state,advertiserId:PLACE_ID,autoSync:!!row.api_key_ciphertext&&row.snapshot?.autoSync===true};
}
export async function syncPlace(db,credentials,autoSync){
  return withMarketingLock(db,async token=>{
    try{
      const row=await connectionRow(db,'naver_place');
      const creds=credentials||(row.api_key_ciphertext?JSON.parse(openKey(row.api_key_ciphertext,PLACE_ID,'naver_place')):null);
      if(!creds)throw Object.assign(Error('지역 검색 API를 먼저 연결해주세요.'),{status:400,publicMessage:'지역 검색 API를 먼저 연결해주세요.'});
      const search=await loadPlaceSearch(creds);
      const snapshot={...search,autoSync:typeof autoSync==='boolean'?autoSync:row.snapshot?.autoSync===true};
      const update={snapshot,last_synced_at:search.queriedAt,last_error:null};
      if(credentials)Object.assign(update,{advertiser_id:PLACE_ID,api_key_ciphertext:sealKey(JSON.stringify(creds),PLACE_ID,'naver_place')});
      const {data,error}=await db.from('online_sales_connections').update(update).eq('company_id',MARKETING_COMPANY_ID).eq('platform','naver_place').eq('lock_token',token).select('company_id');
      if(error)throw error;if(!data?.length)throw Error('connection update missing');
      return publicPlaceConnection(await connectionRow(db,'naver_place'));
    }catch(e){
      await db.from('online_sales_connections').update({last_error:e.publicMessage||'지역 검색 결과를 갱신하지 못했습니다. 기존 결과를 유지합니다.'}).eq('company_id',MARKETING_COMPANY_ID).eq('platform','naver_place').eq('lock_token',token);
      throw e;
    }
  },'naver_place');
}
