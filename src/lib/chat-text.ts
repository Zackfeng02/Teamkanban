import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mediaMime} from './media.ts';
import {Problem} from './security.ts';
export async function chatFileText(buffer:Buffer,name:string):Promise<{text:string;mime:string;warning:string}>{
 if(buffer.length>12*1024*1024)throw new Problem(413,'聊天附件限 12 MB');
 if(/\.txt$/i.test(name)){let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{throw new Problem(400,'请将聊天文字保存为 UTF-8 TXT');}if(text.includes('\0')||text.length>60000)throw new Problem(400,'聊天文本格式不正确或过长');return {text,mime:'text/plain',warning:''};}
 const mime=mediaMime(buffer);let text='',warning='';
 if(mime==='application/pdf'){
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const loading=getDocument({data:new Uint8Array(buffer),useSystemFonts:true});const doc=await loading.promise;try{if(doc.numPages>25)throw new Problem(400,'请每次上传不超过 25 页的聊天 PDF');for(let page=1;page<=doc.numPages;page++){const content=await (await doc.getPage(page)).getTextContent();text+=`\n[第 ${page} 页]\n`+content.items.map((item:any)=>item.str??'').join(' ');if(text.length>60000)throw new Problem(413,'聊天文本过长');}}finally{await loading.destroy();}if(text.replace(/\[第 \d+ 页\]/g,'').trim().length<4)warning='此 PDF 没有可读文字；请上传聊天截图或粘贴原文。';
 }else{
 if(process.platform!=='win32'||process.env.LOCAL_PREVIEW!=='true')warning='当前环境未配置图片 OCR；附件已保留，请粘贴聊天原文。';
 else{const dir=await mkdtemp(join(tmpdir(),'kanban-chat-'));try{const file=join(dir,'image');await writeFile(file,buffer);try{const result=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-File',resolve('scripts/ocr-chat.ps1'),'-ImagePath',file],{windowsHide:true,timeout:30000,maxBuffer:256000,encoding:'utf8'});text=result.stdout.trim();warning='图片文字由本机 OCR 提取，请对照原图核对。';}catch{warning='本机 OCR 未能读取此图；附件已保留，请粘贴聊天原文。';}}finally{await rm(dir,{recursive:true,force:true});}}
 }
 return {text:text.slice(0,60000),mime,warning};
}
