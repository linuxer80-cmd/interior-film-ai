import WorkerConnection from './WorkerConnection';
export default async function Page({params}){const {code}=await params;return <WorkerConnection code={code}/>;}
