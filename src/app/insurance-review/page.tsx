import InsuranceReview from '../../components/insurance-review';
import NewQuotes from '../../components/new-quotes';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {authenticate,requireMember} from '../../lib/security';
import {readTeam} from '../../lib/store';
import './review.css';
export const metadata={title:'新客报价 · Team Kanban'};
export default async function Page({searchParams}:{searchParams:Promise<{taskId?:string;mode?:string}>}) {
 const {taskId,mode}=await searchParams;
 // Keep existing saved renewal URLs working while moving their navigation to Renewals.
 if(taskId){let renewal=false;try{const actor=await authenticate((await cookies()).get('kanban_session')?.value),team=await readTeam(actor.teamId);if(team){requireMember(team,actor);const task=team.tasks.find(t=>t.id===taskId);renewal=task?.type==='renewal'||!!task?.billingFollowup;}}catch{}
  if(renewal)redirect('/renewals?taskId='+encodeURIComponent(taskId)+(mode==='operations'?'&mode=operations':''));}
 if(mode==='manual'&&!taskId)return <InsuranceReview/>;
 return <NewQuotes taskId={taskId}/>;
}
