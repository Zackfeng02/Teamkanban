import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mediaMime} from './media.ts';
import {Problem} from './security.ts';
const execute=promisify(execFile);
async function imageText(buffer:Buffer):Promise<{text:string;warning:string}>{
 const dir=await mkdtemp(join(tmpdir(),'kanban-chat-'));try{
  const file=join(dir,'image');await writeFile(file,buffer);
  try{
   if(process.platform==='win32'&&process.env.LOCAL_PREVIEW==='true'){
    const result=await execute('powershell.exe',['-NoProfile','-NonInteractive','-File',resolve('scripts/ocr-chat.ps1'),'-ImagePath',file],{windowsHide:true,timeout:30000,maxBuffer:256000,encoding:'utf8'});
    return {text:result.stdout.trim(),warning:'文字由本机 OCR 提取，请对照原图核对。'};
   }
   const args=[file,'stdout','-l',process.env.OCR_LANGUAGES||'eng',...process.env.OCR_TESSDATA_DIR?['--tessdata-dir',process.env.OCR_TESSDATA_DIR]:[]];
   const result=await execute(process.env.OCR_COMMAND||'tesseract',args,{timeout:30000,maxBuffer:256000,encoding:'utf8'});
   return {text:result.stdout.trim(),warning:'文字由本机 OCR 提取，请对照原图核对。'};
  }catch{return {text:'',warning:'本机 OCR 未能读取附件或未配置对应语言；原文件已保留，请粘贴原文或手工填写。'};}
 }finally{await rm(dir,{recursive:true,force:true});}
}
export async function chatFileText(buffer:Buffer,name:string):Promise<{text:string;mime:string;warning:string}>{
 if(buffer.length>12*1024*1024)throw new Problem(413,'聊天附件限 12 MB');
 if(/\.txt$/i.test(name)){let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{throw new Problem(400,'请将聊天文字保存为 UTF-8 TXT');}if(text.includes('\0')||text.length>60000)throw new Problem(400,'聊天文本格式不正确或过长');return {text,mime:'text/plain',warning:''};}
 const mime=mediaMime(buffer);let text='';const warnings:string[]=[];
 if(mime==='application/pdf'){
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const loading=getDocument({data:new Uint8Array(buffer),useSystemFonts:true});const doc=await loading.promise;
  try{
   if(doc.numPages>25)throw new Problem(400,'请每次上传不超过 25 页的聊天 PDF');
   let scanned=0;
   for(let pageNumber=1;pageNumber<=doc.numPages;pageNumber++){
    const page=await doc.getPage(pageNumber),content=await page.getTextContent();let pageText=content.items.map((item:any)=>item.str??'').join(' ').trim();
    if(pageText.length<4){
     if(++scanned>5){warnings.push('扫描页超过 5 页，其余扫描页未识别，请拆分 PDF 或手工补充。');continue;}
     // PDF.js uses its bundled optional canvas backend; rasterization is bounded.
     const viewport=page.getViewport({scale:1.5});if(viewport.width*viewport.height>12000000){warnings.push(`第 ${pageNumber} 页尺寸过大，未识别。`);continue;}
     const factory=doc.canvasFactory as {create:(width:number,height:number)=>{canvas:any;context:any};destroy:(canvas:any)=>void};const canvas=factory.create(Math.ceil(viewport.width),Math.ceil(viewport.height));
     try{await page.render({canvasContext:canvas.context,viewport,canvas:canvas.canvas}).promise;const result=await imageText(canvas.canvas.toBuffer('image/png'));pageText=result.text;if(result.warning)warnings.push(`第 ${pageNumber} 页：${result.warning}`);}finally{factory.destroy(canvas);}
    }
    if(pageText)text+=`\n[第 ${pageNumber} 页]\n`+pageText;
    if(text.length>60000)throw new Problem(413,'聊天文本过长');
   }
  }finally{await loading.destroy();}
  if(!text.trim())warnings.push('此 PDF 没有可读文字，请粘贴原文或手工填写。');
 }else{const result=await imageText(buffer);text=result.text;warnings.push(result.warning);}
 return {text:text.slice(0,60000),mime,warning:[...new Set(warnings)].join(' ')};
}
