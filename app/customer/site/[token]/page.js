import {portalDb} from '../../../../lib/customerPortal.mjs';
import {loadCustomerStage} from '../../../../lib/loadCustomerStage.mjs';
import {notFound} from 'next/navigation';
import {resolvePortal} from '../../../../lib/customerPortal.mjs';
import {loadCustomerHomepage} from '../../../../lib/loadCustomerHomepage';
import CustomerPortal from './portal';
export const dynamic='force-dynamic';
export const metadata={title:'내 시공 안내',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Page({params,searchParams}){
 const {token}=await params;const portal=await resolvePortal(token);if(!portal)notFound();
 const [home,stage,query]=await Promise.all([loadCustomerHomepage(portal.company.slug),loadCustomerStage(portalDb(),portal.company_id,portal.site_id),searchParams]);if(!home)notFound();
 // Explicit customer projection: never serialize internal site memos or financial data.
 return <CustomerPortal stageData={stage} requestedStage={query?.stage} token={token} site={portal.site} company={home.company} profile={home.profile} cases={home.cases} remaining={3-portal.used} expiresAt={portal.expires_at}/>;
}
