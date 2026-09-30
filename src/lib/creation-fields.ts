import type {Field} from './change-form.ts';
export const quoteFields:Field[]=[
 {key:'full_name',label:'客户姓名',required:true},{key:'dob',label:'出生日期',kind:'date'},
 {key:'phone',label:'电话'},{key:'email',label:'邮箱'},{key:'address',label:'联系地址'},
 {key:'auto_eff_date',label:'车险期望生效日期',kind:'date'},{key:'vin',label:'VIN'},
 {key:'vehicle_year',label:'车辆年份'},{key:'make',label:'品牌'},{key:'model',label:'车型'},
 {key:'licence_num',label:'驾照号码'},{key:'marital',label:'婚姻状况'},
 ...['g1','g2','g','cert'].map(key=>({key:key+'_date',label:{g1:'G1 日期',g2:'G2 日期',g:'G 日期',cert:'全科证书日期'}[key]!,kind:'date' as const})),
 {key:'annual_km',label:'年行驶公里数'},{key:'commute_km',label:'单程通勤公里数'},
 {key:'ownership',label:'购车方式',kind:'select',options:{own:'全款',finance:'贷款',lease:'租赁'}},
 {key:'snow_tires',label:'冬季轮胎',kind:'select',options:{yes:'是',no:'否'}},
 {key:'tickets',label:'近三年罚单'},{key:'accidents',label:'近六年责任事故'},
 {key:'prev_auto_insurer',label:'上一家车险公司'},{key:'auto_cov_years',label:'连续车险年数'},
 {key:'prop_address',label:'房屋地址'},{key:'home_eff_date',label:'房险期望生效日期',kind:'date'},
 {key:'prop_use',label:'房屋用途',kind:'select',options:{owner:'自住',rental:'出租',vacation:'度假屋'}},
 ...['mortgage','basement','prior_claims'].map(key=>({key,label:{mortgage:'贷款',basement:'装修地下室',prior_claims:'房险理赔历史'}[key]!,kind:'select' as const,options:{yes:'是',no:'否'}})),
 {key:'bedrooms',label:'卧室'},{key:'bathrooms',label:'卫生间'},{key:'area',label:'面积'},
 {key:'area_unit',label:'面积单位',kind:'select',options:{sqft:'平方英尺',sqm:'平方米'}},
 {key:'prev_home_insurer',label:'上一家房险公司'},{key:'home_cov_years',label:'连续房险年数'},
 ...['roof','furnace','plumbing','electrical'].map(key=>({key,label:{roof:'屋顶更新年份',furnace:'暖炉更新年份',plumbing:'水管更新年份',electrical:'电线更新年份'}[key]!}))
];
export const generalFields:Field[]=[{key:'title',label:'任务标题',required:true},{key:'description',label:'任务说明',kind:'long'},{key:'dueDate',label:'截止日期',kind:'date'}];
