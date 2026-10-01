import type {ChangeBaseline} from '../lib/change-form';
import {cancellationPolicies,policySummary,policyLine} from '../lib/cancellation';
import styles from './change-task-form.module.css';

export default function CancellationSummary({baseline}:{baseline:ChangeBaseline}) {
  return <div className={styles.policySummaries}>{cancellationPolicies(baseline).map((policy,index)=>{
    const summary=policySummary(policy),line=policyLine(policy);
    return <article className={styles.policySummary} key={policy.key??index}>
      <header><strong>{summary.number}</strong><span>{summary.insurer}</span></header>
      <dl><div><dt>保单生效日期</dt><dd>{summary.start||'未记录'}</dd></div><div><dt>保单到期日期</dt><dd>{summary.end||'未记录'}</dd></div></dl>
      {summary.risks.length?<ul>{summary.risks.map((risk,i)=><li key={risk.id||i}>
        <strong>{risk.kind==='vehicle'?'车辆':'房产／地址'}：{risk.name}</strong>
        {risk.address&&<p>{risk.address}</p>}
        {risk.description&&<p>{risk.description}</p>}
        {risk.kind==='property'&&<p>类型：{risk.propertyType||summary.propertyType} · 用途：{risk.use||summary.use}</p>}
      </li>)}</ul>:<p>该保单的车辆／房产资料未记录。</p>}
      {(line==='home'||summary.risks.some(r=>r.kind==='property'))&&<dl>
        <div><dt>承保地址</dt><dd>{summary.address}</dd></div>
        <div><dt>房产类型</dt><dd>{summary.propertyType}</dd></div>
        <div><dt>房产用途</dt><dd>{summary.use}</dd></div>
      </dl>}
    </article>;
  })}</div>;
}
