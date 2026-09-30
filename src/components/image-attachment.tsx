'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Expand, Loader2, Paperclip, RotateCcw, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react';
import styles from './image-attachment.module.css';

export default function Attachment({ id }: { id: string }) {
  const [url, setUrl] = useState('');
  const [extension, setExtension] = useState('png');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const load = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setLoading(true); setError('');
    try {
      const ticket = await fetch(`/api/media/${encodeURIComponent(id)}?ticket=new`, { signal: request.signal, cache: 'no-store' });
      if (!ticket.ok) throw new Error('附件不可用，请重新打开或联系管理员');
      const { url: signedUrl } = await ticket.json();
      const response = await fetch(signedUrl, { signal: request.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('附件加载失败，请重试');
      const blob = await response.blob();
      const suffix = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' }[blob.type];
      if (!suffix) throw new Error('此附件格式不受支持');
      if (request.signal.aborted) return;
      setExtension(suffix); setUrl(URL.createObjectURL(blob));
    } catch (err) {
      if (!request.signal.aborted) setError(err instanceof Error ? err.message : '附件加载失败，请重试');
    } finally { if (!request.signal.aborted) setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); return () => controller.current?.abort(); }, [load]);
  if (url && extension === 'pdf') return <div className="attachment"><p><Paperclip size={15} /> PDF 附件</p><a className="secondary" href={url} target="_blank" rel="noopener noreferrer">打开 PDF</a> <a className="secondary" href={url} download={`附件-${id}.pdf`}><Download size={15} /> 下载 PDF</a></div>;
  return <div className="attachment">
    {url ? <button type="button" className={styles.thumbnail} aria-label="放大查看图片附件" onClick={() => { setOpen(true); void load(); }}><img src={url} alt="转发的图片资料" /><span><Expand size={14} /> 点击放大</span></button>
      : <button type="button" className="secondary" disabled={loading} onClick={() => { setOpen(true); void load(); }}>{loading ? <Loader2 size={15} /> : <Paperclip size={15} />}{loading ? '正在加载缩略图…' : error ? '附件不可用，点击重试' : '查看转发图片'}</button>}
    {open && <ImageViewer url={url} loading={loading} error={error} filename={`图片附件-${id}.${extension}`} onRetry={load} onClose={() => setOpen(false)} />}
  </div>;
}

function ImageViewer({ url, loading, error, filename, onRetry, onClose }: { url: string; loading: boolean; error: string; filename: string; onRetry: () => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [natural, setNatural] = useState({ width: 1, height: 1 });
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null);
  const [decodeFailed, setDecodeFailed] = useState(false);
  useEffect(() => {
    const element = dialog.current!; const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    element.showModal();
    return () => { element.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => { setDecodeFailed(false); }, [url]);
  useEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver(() => setSize({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  const sideways = rotation % 180 !== 0;
  const width = sideways ? natural.height : natural.width;
  const height = sideways ? natural.width : natural.height;
  const fit = Math.max(0.01, Math.min((size.width - 32) / width, (size.height - 32) / height, 1));
  const scale = zoom ?? fit;
  const unavailable = loading || !!error || decodeFailed || !url;
  const changeZoom = (factor: number) => setZoom(Math.max(0.05, Math.min(4, scale * factor)));
  return createPortal(<dialog ref={dialog} className={styles.viewer} aria-label="图片附件预览" onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => event.stopPropagation()}>
    <header className={styles.header}><div><strong>图片附件</strong><small>旋转仅用于查看，另存为保留原图</small></div><button type="button" aria-label="关闭图片预览" onClick={onClose}><X size={22} /></button></header>
    <div className={styles.toolbar} role="toolbar" aria-label="图片操作">
      <button type="button" disabled={unavailable} onClick={() => setRotation(value => (value + 270) % 360)}><RotateCcw size={18} /> 向左旋转</button>
      <button type="button" disabled={unavailable} onClick={() => setRotation(value => (value + 90) % 360)}><RotateCw size={18} /> 向右旋转</button>
      <button type="button" aria-label="缩小图片" disabled={unavailable || scale <= 0.05} onClick={() => changeZoom(0.8)}><ZoomOut size={18} /></button>
      <output aria-live="polite" aria-label="图片缩放比例">{Math.round(scale * 100)}%</output>
      <button type="button" aria-label="放大图片" disabled={unavailable || scale >= 4} onClick={() => changeZoom(1.25)}><ZoomIn size={18} /></button>
      <button type="button" disabled={unavailable} onClick={() => setZoom(null)}>适应窗口</button>
      <button type="button" disabled={unavailable} onClick={() => setZoom(1)}>原始尺寸</button>
      {!unavailable && <a href={url} download={filename}><Download size={18} /> 另存为原图</a>}
    </div>
    <div ref={viewport} className={styles.viewport} onPointerDown={event => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || unavailable) return;
      const element = event.currentTarget; drag.current = { x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop }; element.setPointerCapture(event.pointerId); event.preventDefault();
    }} onPointerMove={event => { if (!drag.current) return; event.currentTarget.scrollLeft = drag.current.left + drag.current.x - event.clientX; event.currentTarget.scrollTop = drag.current.top + drag.current.y - event.clientY; }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
      {loading ? <div className={styles.message} role="status"><Loader2 size={24} /> 正在加载图片…</div> : error || decodeFailed ? <div className={styles.message} role="alert"><p>{error || '图片无法显示，请重试'}</p><button type="button" onClick={onRetry}>重新加载</button></div> : url && <div className={styles.stage} style={{ width: Math.max(size.width, width * scale + 32), height: Math.max(size.height, height * scale + 32) }}><img src={url} alt="放大的图片附件" draggable={false} onLoad={event => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setDecodeFailed(true)} style={{ width: natural.width * scale, height: natural.height * scale, transform: `translate(-50%, -50%) rotate(${rotation}deg)` }} /></div>}
    </div>
    <footer className={styles.footer}>旋转 {rotation}° · 放大后可拖动或滚动查看 · Esc 关闭预览</footer>
  </dialog>, document.body);
}
