import {policyDates} from './cancellation.ts';
import {businessDate} from './task-workflow.ts';

export function withinCurrentTerm(policy:any,today=businessDate()):boolean {
 const {start,end}=policyDates(policy);
 return !!start&&!!end&&start<=today&&today<end;
}
export function isCurrentPolicy(policy:any,today=businessDate()):boolean {
 const status=String(policy.status??'').toLowerCase();
 return withinCurrentTerm(policy,today)&&['active','pending cancellation','in force','in-force'].includes(status);
}
