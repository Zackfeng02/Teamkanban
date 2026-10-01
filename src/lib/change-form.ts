export const changeTypes=['address','vehicle_add','vehicle_replace','vehicle_remove','property_add','property_remove','coverage_change','cancellation','reinstatement','policy'] as const;
export type ChangeType=typeof changeTypes[number];
export type Field={key:string;label:string;kind?:'date'|'select'|'long';options?:Record<string,string>;required?:boolean};
const date:Field={key:'effectiveDate',label:'期望生效日期',kind:'date',required:true};
const reason:Field={key:'reason',label:'变更原因／客户要求',kind:'long',required:true};
const address:Field[]=[{key:'line1',label:'新地址',required:true},{key:'line2',label:'单元／补充地址'},{key:'city',label:'城市'},{key:'province',label:'省份'},{key:'postalCode',label:'邮编'},{key:'country',label:'国家'}];
const vehicle:Field[]=[{key:'year',label:'新车辆年份',required:true},{key:'make',label:'新车辆品牌',required:true},{key:'model',label:'新车辆型号',required:true},{key:'vin',label:'新车辆 VIN',required:true},{key:'ownership',label:'购车方式',kind:'select',options:{owned:'全款',financed:'贷款',leased:'租赁'}},{key:'annualKm',label:'年行驶公里数'},{key:'commuteKm',label:'单程通勤公里数'},{key:'use',label:'车辆用途'},{key:'driver',label:'主要驾驶人'}];
const property:Field[]=[...address,{key:'propertyType',label:'房屋类型',kind:'select',options:{house:'House',condo:'Condo',other:'其他'},required:true},{key:'use',label:'房屋用途',kind:'select',options:{owner_occupied:'自住',rented:'出租',other:'其他'},required:true},{key:'mortgagee',label:'贷款公司'},{key:'closingDate',label:'交割日期',kind:'date'}];
export const changeFields:Record<ChangeType,Field[]>={
 address:[date,{key:'scope',label:'地址变更范围',kind:'select',options:{mailing:'仅通讯地址',risk:'承保／车辆停放地址',both:'通讯和承保地址'},required:true},...address,reason],
 vehicle_add:[date,...vehicle,{key:'coverage',label:'拟申请保障',kind:'long'},reason],
 vehicle_replace:[date,...vehicle,{key:'oldDisposition',label:'旧车处理',kind:'select',options:{sold:'出售',trade_in:'置换',retained:'保留',unknown:'待确认'}},{key:'coverage',label:'拟申请保障',kind:'long'},reason],
 vehicle_remove:[date,{key:'disposition',label:'移除原因',kind:'select',options:{sold:'出售',stored:'停驶／存放',other:'其他'},required:true},reason],
 property_add:[date,...property,{key:'coverage',label:'拟申请保障',kind:'long'},reason],
 property_remove:[date,{key:'scope',label:'办理范围',kind:'select',options:{risk:'仅移除该房产',policy:'取消整张保单'},required:true},{key:'soldDate',label:'出售／交割日期',kind:'date'},reason],
 coverage_change:[date,{key:'coverage',label:'拟调整保障及限额',kind:'long',required:true},{key:'deductible',label:'拟调整免赔额'},reason],
 cancellation:[{...date,label:'取消日期'},{key:'replacement',label:'替代保障／新保单资料',kind:'long'},{...reason,required:false}],
 reinstatement:[date,{key:'gap',label:'保障中断期间及恢复要求',kind:'long',required:true},reason],
 policy:[date,{key:'changes',label:'拟变更项目及新内容',kind:'long',required:true},reason]
};
export type ChangeBaseline={client:any;policy:any|null;policies?:any[];assets:any[];selectedRisk:any|null;selection:{clientId:string;policyKey:string;policyKeys?:string[];assetId:string;riskIndex:number|null;addressIndex:number|null};oldValues:Record<string,string>};
export type ChangeDraft={id:string;ownerId:string;type:ChangeType;baseline:ChangeBaseline;fingerprint:string;capturedAt:string;taskId?:string;saveHash?:string};
export type ChangeForm={type:ChangeType;baseline:ChangeBaseline;capturedAt:string;proposed:Record<string,string>;evidence:Record<string,string>;reviewedAt:string;extraction:string};
export function isChangeType(value:string):value is ChangeType{return (changeTypes as readonly string[]).includes(value);}
