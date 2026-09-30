'use client';
import {useEffect,useRef,useState} from 'react';
import styles from './renewal-csr.module.css';
export default function CsrSnapshot({src,title,pages}:{src:string;title:string;pages?:number[]}) {
 const canvas=useRef<HTMLCanvasElement>(null),[page,setPage]=useState(0),[count,setCount]=useState(0),[error,setError]=useState('');
 useEffect(()=>{setPage(0);setCount(0);},[src,JSON.stringify(pages)]);
 useEffect(()=>{let stopped=false,loading:any,render:any;setError('');
  void(async()=>{try{
   const pdf=await import('pdfjs-dist');if(stopped)return;pdf.GlobalWorkerOptions.workerSrc='/api/pdf-worker?v=6.3.289';
   loading=pdf.getDocument({url:src});const doc=await loading.promise;if(stopped)return;
   setCount(pages?.length??doc.numPages);const sheet=await doc.getPage(pages?.[page]??page+1),viewport=sheet.getViewport({scale:1.25}),c=canvas.current;if(stopped||!c)return;
   c.width=Math.ceil(viewport.width);c.height=Math.ceil(viewport.height);render=sheet.render({canvas:c,canvasContext:c.getContext('2d')!,viewport});await render.promise;
  }catch(e){if(!stopped)setError(e instanceof Error?e.message:'Snapshot could not be loaded.');}})();
  return()=>{stopped=true;render?.cancel();void loading?.destroy();};
 },[src,page,JSON.stringify(pages)]);
 return <section className={styles.snapshot}><header><strong>{title}</strong><a href={src} target="_blank" rel="noreferrer">Open original</a></header><div className={styles.pdfControls}><button type="button" aria-label={title+' previous page'} disabled={page===0} onClick={()=>setPage(p=>p-1)}>Previous</button><span>{page+1} / {count||'…'}{pages?.[page]?` · Original page ${pages[page]}`:''}</span><button type="button" aria-label={title+' next page'} disabled={page+1>=count} onClick={()=>setPage(p=>p+1)}>Next</button></div>{error?<p role="alert">{error}</p>:<div className={styles.canvas}><canvas ref={canvas} aria-label={title}/></div>}</section>;
}
