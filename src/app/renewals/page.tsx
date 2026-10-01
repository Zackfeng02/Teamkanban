import RenewalCsr from '../../components/renewal-csr';
import RenewalReview from '../../components/renewal-review';
export const metadata={title:'Renewal comparison · Team Kanban'};
export default async function Page({searchParams}:{searchParams:Promise<{taskId?:string;mode?:string}>}){const {taskId,mode}=await searchParams;return taskId&&mode==='operations'?<RenewalReview taskId={taskId}/>:<RenewalCsr taskId={taskId}/>;}
