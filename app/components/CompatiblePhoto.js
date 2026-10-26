"use client";

import { useEffect, useState } from 'react';
import { convertHeicBlob, isHeicPhoto } from '../../lib/heicPhoto.mjs';

// Keep signed access to the original private object; JPEG previews stay on this device.
export default function CompatiblePhoto({ src, storagePath, alt, style }) {
  const heic = isHeicPhoto(storagePath || src);
  const [preview, setPreview] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setPreview(null);
    setFailed(false);
    if (!heic || !src) return;
    const controller = new AbortController();
    let active = true;
    let objectUrl;
    (async () => {
      const response = await fetch(src, { signal: controller.signal });
      if (!response.ok) throw new Error('사진을 불러오지 못했습니다.');
      const blob = await response.blob();
      if (!active) return;
      const jpeg = await convertHeicBlob(blob);
      if (!active) return;
      objectUrl = URL.createObjectURL(jpeg);
      setPreview({ source: src, url: objectUrl });
    })().catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, heic, attempt]);

  const displayUrl = heic ? (preview?.source === src ? preview.url : null) : src;
  if (failed || !displayUrl) return (
    <div role="status" style={{ display: 'grid', placeContent: 'center', height: '100%', gap: 12, textAlign: 'center', padding: 12 }}>
      <span>{failed ? '사진을 표시하지 못했습니다.' : '사진을 변환하고 있습니다…'}</span>
      {failed && <><button type="button" onClick={() => { setFailed(false); setAttempt(n => n + 1); }}>다시 시도</button><a href={src} target="_blank" rel="noreferrer">원본 사진 열기</a></>}
    </div>
  );
  return <a href={displayUrl} target="_blank" rel="noreferrer" style={{ display: 'block', width: '100%', height: '100%' }}>
    <img src={displayUrl} alt={alt} loading="lazy" onError={() => setFailed(true)} style={style} />
  </a>;
}
