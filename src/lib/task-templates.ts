import type { DraftTask } from './model.ts';
export const taskTypeLabels = { lead: '新报价', policy: '保单变更', other: '其他事项', renewal:'续保／换保', address:'搬家／地址变更', vehicle_add:'增加车辆', vehicle_replace:'更换车辆', vehicle_remove:'移除车辆', property_add:'购买／增加房产', property_remove:'出售／移除房产', coverage_change:'其他保障变更', cancellation:'保单取消', reinstatement:'保单恢复', documents:'资料／文件服务' };
const templates: Partial<Record<DraftTask['type'], readonly string[]>> = {
  lead: ['确认客户联系方式与报价需求', '收集报价所需资料', '核对现有保障、预算与期望生效日期', '获取并比较保险公司报价', '向客户说明保障范围、免赔额与保费', '记录客户选择并跟进投保'],
  policy: ['确认客户及需变更的保单', '核对变更内容与期望生效日期', '收集所需证明和客户确认', '向保险公司提交变更申请', '核对批单、保费差额与生效日期', '向客户发送确认文件并更新记录'],
  other: [],
};
export function defaultChecklist(type: DraftTask['type']): string[] { return [...(templates[type] ?? [])]; }
export function changeTaskType(task: DraftTask, type: DraftTask['type']): DraftTask {
  const previous = templates[task.type] ?? [];
  const untouched = !task.checklist.length || task.checklist.length === previous.length && task.checklist.every((text, index) => text === previous[index]);
  return { ...task, type, checklist: untouched ? defaultChecklist(type) : task.checklist };
}
