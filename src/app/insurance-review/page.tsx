import InsuranceReview from '../../components/insurance-review';
import './review.css';
import RenewalReview from '../../components/renewal-review';
import RenewalCsr from '../../components/renewal-csr';
export const metadata = { title: 'Renewal comparison · Team Kanban' };
export default async function Page({searchParams}:{searchParams:Promise<{taskId?:string;mode?:string}>}) {
 const {taskId,mode}=await searchParams;
 if(taskId&&mode==='operations')return <RenewalReview taskId={taskId}/>;
 if(!taskId&&mode==='manual')return <InsuranceReview/>;
 return <RenewalCsr taskId={taskId}/>;
}
