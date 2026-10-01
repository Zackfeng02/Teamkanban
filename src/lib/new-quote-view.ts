import type {Task} from './model.ts';
export function isNewQuote(task:Task) {return task.type==='lead'&&!task.customerRef;}
