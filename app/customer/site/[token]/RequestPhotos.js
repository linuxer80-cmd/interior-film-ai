'use client';
import {useCallback, useEffect, useRef, useState} from 'react';
import {prepareCustomerPhoto} from '../../../../lib/prepareCustomerPhoto.mjs';
import styles from './portal.module.css';

export default function RequestPhotos({token}) {
  const [photos, setPhotos] = useState([]), [note, setNote] = useState('');
  const [busy, setBusy] = useState(false), [preparing, setPreparing] = useState(false);
  const [error, setError] = useState(''), [success, setSuccess] = useState('');
  const [history, setHistory] = useState([]), [historyError, setHistoryError] = useState('');
  const [retry, setRetry] = useState(false), [historyLoading, setHistoryLoading] = useState(false);
  const gallery = useRef(null), camera = useRef(null), pending = useRef(null);
  const filesRef = useRef([]), lock = useRef(false), mounted = useRef(true), urls = useRef(new Set());
  const historyRequest = useRef(0);
  const headers = {Authorization: 'Bearer ' + token};
  const loadHistory = useCallback(async () => {
    const generation = ++historyRequest.current;
    setHistoryLoading(true); setHistoryError('');
    try {
      const response = await fetch('/api/customer-portal/photos', {headers: {Authorization: 'Bearer ' + token}, cache: 'no-store', signal: AbortSignal.timeout(15000)});
      const data = await response.json(); if (!response.ok) throw Error(data.error || '보낸 사진을 불러오지 못했습니다.');
      if (mounted.current && generation === historyRequest.current) setHistory(data.batches || []);
    } catch { if (mounted.current && generation === historyRequest.current) setHistoryError('보낸 사진을 불러오지 못했습니다. 다시 확인해주세요.'); }
    finally { if (mounted.current && generation === historyRequest.current) setHistoryLoading(false); }
  }, [token]);
  useEffect(() => { mounted.current = true; void loadHistory(); return () => {mounted.current = false; for (const url of urls.current) URL.revokeObjectURL(url); urls.current.clear();}; }, [loadHistory]);

  async function selectFiles(event) {
    const selected = Array.from(event.target.files || []); event.target.value = '';
    if (lock.current || retry || !selected.length) return;
    if (filesRef.current.length + selected.length > 10) {setError('사진은 한 번에 10장까지 선택해주세요.'); return;}
    lock.current = true; setPreparing(true); setError(''); setSuccess('');
    const added = [], errors = [];
    try {
      for (const file of selected) {
        try {
          const prepared = await prepareCustomerPhoto(file); if (!mounted.current) return;
          const url = URL.createObjectURL(prepared); urls.current.add(url);
          added.push({file: prepared, url, id: crypto.randomUUID()});
        } catch (e) {errors.push(e.message || '사진을 다시 선택해주세요.');}
      }
      filesRef.current = [...filesRef.current, ...added]; setPhotos(filesRef.current); setError([...new Set(errors)].join(' ')); pending.current = null;
    } finally {lock.current = false; if (mounted.current) setPreparing(false);}
  }
  function remove(id) {
    if (lock.current || retry) return;
    const photo = filesRef.current.find(p => p.id === id); if (photo) {URL.revokeObjectURL(photo.url); urls.current.delete(photo.url);}
    filesRef.current = filesRef.current.filter(p => p.id !== id); setPhotos(filesRef.current); pending.current = null;
  }
  async function send() {
    if (lock.current || !filesRef.current.length) return;
    lock.current = true; setBusy(true); setError(''); setSuccess('');
    // Keep the exact request after a lost response so retry cannot send duplicates.
    pending.current ||= {id: crypto.randomUUID(), photos: [...filesRef.current], note: note.trim()};
    const batch = pending.current, form = new FormData();
    form.append('requestId', batch.id); form.append('note', batch.note);
    batch.photos.forEach(p => form.append('photos', p.file));
    try {
      const response = await fetch('/api/customer-portal/photos', {method: 'POST', headers, body: form, signal: AbortSignal.timeout(65000)});
      const data = await response.json();
      if (!response.ok) throw Object.assign(Error(data.error || '사진을 보내지 못했습니다.'), {status: response.status});
      if (!mounted.current) return;
      batch.photos.forEach(p => {URL.revokeObjectURL(p.url); urls.current.delete(p.url);});
      filesRef.current = []; setPhotos([]); setNote(''); pending.current = null; setRetry(false);
      setSuccess(`사진 ${data.count}장을 보냈어요. 추가 사진도 이어서 보낼 수 있어요.`);
      void loadHistory();
    } catch (e) {
      if (!mounted.current) return;
      // A definite validation/access rejection did not save photos. Other failures may have committed.
      const uncertain = ![400, 403, 409, 413, 429].includes(e.status);
      setRetry(uncertain); if (!uncertain) pending.current = null;
      setError(uncertain ? '전송 결과를 확인하지 못했습니다. 아래 버튼을 다시 누르면 중복 없이 확인·전송합니다.' : e.message);
    } finally {lock.current = false; if (mounted.current) setBusy(false);}
  }
  const total = history.reduce((sum, b) => sum + b.photos.length, 0);
  return <section className={styles.card} aria-labelledby="customer-photo-title">
    <h2 id="customer-photo-title">시공할 부위 사진 보내기</h2>
    <p className={styles.muted}>전체 모습과 가까이 찍은 사진을 보내주세요.</p>
    <div className={styles.photoActions}>
      <button className={styles.secondary} type="button" disabled={busy || preparing || retry} onClick={() => camera.current?.click()}>사진 찍기</button>
      <button className={styles.secondary} type="button" disabled={busy || preparing || retry} onClick={() => gallery.current?.click()}>사진 선택</button>
    </div>
    <input ref={camera} className={styles.hiddenPhotoInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" capture="environment" onChange={selectFiles} tabIndex={-1} aria-hidden="true" />
    <input ref={gallery} className={styles.hiddenPhotoInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple onChange={selectFiles} tabIndex={-1} aria-hidden="true" />
    <small className={styles.muted}>얼굴·개인정보가 보이지 않는 사진을 선택해주세요.</small>
    {preparing && <p role="status">사진을 준비하고 있습니다…</p>}
    {!!photos.length && <>
      <p><strong>선택한 사진 {photos.length}장</strong> <small className={styles.muted}>· 최대 10장</small></p>
      <div className={styles.requestPhotoGrid}>{photos.map((photo, index) => <div className={styles.requestPhotoTile} key={photo.id}>
        <img src={photo.url} alt={`선택한 사진 ${index + 1}`} />
        <button type="button" aria-label={`사진 ${index + 1} 삭제`} disabled={busy || preparing || retry} onClick={() => remove(photo.id)}>×</button>
      </div>)}</div>
      <label className={styles.requestPhotoNote}>요청사항 <small className={styles.muted}>(선택)</small>
        <textarea value={note} maxLength={500} disabled={busy || preparing || retry} onChange={e => {setNote(e.target.value); pending.current = null;}} placeholder="예: 주방 하부장과 냉장고장 측면을 바꾸고 싶어요." />
      </label>
      <button className={`${styles.primary} ${styles.requestPhotoSend}`} type="button" disabled={busy || preparing} onClick={send}>{busy ? '사진 보내는 중…' : retry ? '전송 확인·다시 보내기' : `사진 ${photos.length}장 보내기`}</button>
      <small className={styles.muted}>담당 업체의 현장 요청사진으로 전달됩니다.</small>
    </>}
    {error && <p className={styles.requestPhotoError} role="alert">{error}</p>}
    {success && <p className={styles.requestPhotoSuccess} role="status">{success}</p>}
    {(total > 0 || historyError || historyLoading) && <details className={styles.requestPhotoHistory}>
      <summary>보낸 사진 {total ? `${total}장` : ''}</summary>
      <button type="button" className={styles.secondary} disabled={historyLoading} onClick={loadHistory}>{historyLoading ? '불러오는 중…' : '새로고침'}</button>
      {historyError && <p role="status">{historyError}</p>}
      {history.map(batch => <div className={styles.requestPhotoBatch} key={batch.id}>
        <small className={styles.muted}>{new Date(batch.createdAt).toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'})}</small>
        <div className={styles.requestPhotoGrid}>{batch.photos.map((photo, index) => photo.url ? <a href={photo.url} target="_blank" rel="noopener noreferrer" key={photo.id}><img src={photo.url} alt={`보낸 사진 ${index + 1}`} loading="lazy" /></a> : <p key={photo.id}>사진 링크를 새로고침해주세요.</p>)}</div>
        {batch.note && <p className={styles.requestPhotoMemo}>{batch.note}</p>}
      </div>)}
    </details>}
  </section>;
}
