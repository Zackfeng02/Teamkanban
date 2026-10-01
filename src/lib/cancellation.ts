import type {ChangeBaseline} from './change-form.ts';

/** Older single-policy requests retain their original snapshot and workflow. */
export function cancellationPolicies(baseline:ChangeBaseline):any[] {
  return baseline.policies ?? (baseline.policy ? [baseline.policy] : []);
}
export function policyNumber(policy:any):string {
  return policy.policy_number ?? policy.policyNumber ?? '未记录保单号';
}
export function policyLine(policy:any):'auto'|'home'|'other' {
  const line=String(policy.line ?? policy.policyType ?? '').toLowerCase();
  if(['auto','automobile','automobile insurance'].includes(line))return 'auto';
  if(['home','home insurance','homeowners','house','condo','tenant','tenants','rental'].includes(line))return 'home';
  return 'other';
}
export function policyDates(policy:any) {
  return {start:policy.effectiveDate ?? policy.effective_date ?? '',end:policy.expiryDate ?? policy.expiry_date ?? ''};
}
function text(value:any):string {
  if(typeof value==='string'||typeof value==='number')return String(value);
  return '';
}
function address(value:any):string {
  if(typeof value==='string')return value;
  if(!value||typeof value!=='object')return '';
  return ['line1','unit','line2','city','province','postalCode','country'].map(key=>text(value[key])).filter(Boolean).join(', ');
}
function field(details:any,label:string):string {
  return Array.isArray(details)?text(details.find((item:any)=>String(item.label).toLowerCase()===label)?.value):'';
}
export function policySummary(policy:any) {
  const details=policy.riskDetails ?? [];
  const covered=policy.currentSubjects ?? policy.subjects;
  const vehicles=policy.vehicleDetails?.vehicles;
  const risks=Array.isArray(covered)?covered:Array.isArray(vehicles)?vehicles.map((vehicle:any)=>({
    kind:'vehicle',id:vehicle.vin,name:[vehicle.year,vehicle.make,vehicle.model].filter(Boolean).join(' '),
    description:vehicle.vin?`VIN: ${vehicle.vin}`:'',address:vehicle.garaging,
  })):[];
  // Do not derive occupancy/type from mailing addresses, ownership or free-text descriptions.
  const type=text(policy.propertyType)||text(details.propertyType)||field(details,'property type');
  const use=text(policy.use)||text(details.use)||text(details.occupancy)||field(details,'occupancy')||field(details,'property use');
  const types:Record<string,string>={house:'House',condo:'Condo',tenant:'Tenant',tenants:'Tenant',unknown:'未记录'};
  const uses:Record<string,string>={owner_occupied:'自住',rented:'出租',tenant:'Tenant',unknown:'未记录'};
  return {
    number:policyNumber(policy),insurer:text(policy.insurer)||'未记录',...policyDates(policy),
    propertyType:types[type.toLowerCase()] ?? (type||'未记录'),
    use:uses[use.toLowerCase()] ?? (use||'未记录'),
    address:address(policy.policyAddress)||address(details.propertyAddress)||field(details,'property address')||'未记录',
    risks:Array.isArray(risks)?risks.filter((risk:any)=>['vehicle','property'].includes(risk.kind)).map((risk:any)=>({
      id:text(risk.id),kind:risk.kind,name:text(risk.name)||'未记录',
      description:text(risk.description),address:address(risk.address),
      propertyType:types[String(risk.propertyType).toLowerCase()] ?? (text(risk.propertyType)||''),
      use:uses[String(risk.use).toLowerCase()] ?? (text(risk.use)||''),
    })):[],
  };
}

/** A source request can only bind to its reviewed source-to-term link, never a similar number. */
export function cancellationTargetId(policyKey:string,sourcePolicies:any[]):string|null {
  if(policyKey.startsWith('term:'))return policyKey.slice(5);
  if(policyKey.startsWith('source:'))return sourcePolicies.find(p=>'source:'+p.sourceId===policyKey)?.workflowTermId ?? null;
  return null;
}
export function assertCancellationTarget(policyKey:string,termId:string,sourcePolicies:any[]) {
  const expected=cancellationTargetId(policyKey,sourcePolicies);
  if(!expected)throw new Error('该导入保单尚未关联办理年度，请先在 ClientCoreBMS 核对并关联；不会自动建单。');
  if(expected!==termId)throw new Error('此确认节点必须对应创建申请时选择的保单年度。');
}
