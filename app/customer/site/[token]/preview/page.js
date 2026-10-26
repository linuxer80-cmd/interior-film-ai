import {notFound} from 'next/navigation';
import {resolvePortal} from '../../../../../lib/customerPortal.mjs';
import CustomerVirtualInstall from '../virtual-install';
export const dynamic='force-dynamic';
export const metadata={title:'우리 집 미리시공',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Page({params}){
 const {token}=await params;
 const portal=await resolvePortal(token);
 if(!portal)notFound();
 return <CustomerVirtualInstall token={token} company={portal.company} remaining={3-portal.used}/>;
}
