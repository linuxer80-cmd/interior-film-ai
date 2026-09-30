"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ui from "./AdminUi.module.css";
import { QUICK_REGISTER_CATEGORIES as categories } from "../utils/quickRegisterCategories";
import { buildBulkSites, bulkGroupKey, chooseBulkReferences, firstBulkError, focusBulkField, parseBulkMoney, resolveBulkBatch, retainBulkPrices } from "../utils/quickRegisterGroups";
import { prepareBulkPhoto } from "./quickRegisterFiles";
import { supabase } from "../../lib/supabase";
import { PROJECT_ID } from "./adminConstants";
import { createEmbedding } from "./aiUtils";
import { inputStyle, primaryButtonStyle, sectionStyle } from "./adminStyles";

const types = [["unknown", "전후 확인 필요"], ["before", "시공 전"], ["after", "시공 후"]];
const review = (photo) => photo.type === "unknown" || photo.confidence === "low" || photo.groupingReview || photo.fileError;
function siteHint(photo) {
  const date = photo.takenAt?.slice(0, 10) || "날짜 미상";
  const latitude = photo.latitude == null ? "" : Math.round(photo.latitude * 500) / 500;
  const longitude = photo.longitude == null ? "" : Math.round(photo.longitude * 500) / 500;
  return latitude === "" ? date : `${date} · 위치 ${latitude}, ${longitude}`;
}

export default function QuickRegisterTab({ companyId, loadJobs }) {
  const [photos, setPhotos] = useState([]);
  const [prices, setPrices] = useState({});
  const [siteNames, setSiteNames] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [fieldError, setFieldError] = useState(null);
  const [confirmReanalysis, setConfirmReanalysis] = useState(false);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const fields = useRef(new Map());
  const urls = useRef(new Set());
  const working = useRef(false);
  const sites = useMemo(() => buildBulkSites(photos), [photos]);

  useEffect(() => {
    const active = urls.current;
    return () => { active.forEach((url) => URL.revokeObjectURL(url)); active.clear(); };
  }, []);
  useEffect(() => {
    if (fieldError && !busy) focusBulkField(fields.current.get(fieldError.field));
  }, [fieldError, busy]);

  function release(photo) {
    if (photo.url) { URL.revokeObjectURL(photo.url); urls.current.delete(photo.url); }
  }
  function preview(file) {
    const url = URL.createObjectURL(file);
    urls.current.add(url);
    return url;
  }
  function showError(error) {
    setFieldError(error); setMessage(`⚠️ ${error.message}`);
    // Synchronous focus also keeps mobile keyboard activation within the tap.
    if (!working.current) focusBulkField(fields.current.get(error.field));
  }
  function fieldProps(field) {
    return {
      ref: (element) => { if (element) fields.current.set(field, element); else fields.current.delete(field); },
      "aria-invalid": fieldError?.field === field || undefined,
      "aria-describedby": fieldError?.field === field ? "bulk-field-error" : undefined,
      className: fieldError?.field === field ? ui.bulkInvalid : undefined,
    };
  }
  function errorText(field) {
    return fieldError?.field === field ? <p id="bulk-field-error" role="alert" className={ui.bulkError}>{fieldError.message}</p> : null;
  }
  function update(id, patch) {
    const next = photos.map((photo) => photo.id === id ? { ...photo, ...patch } : photo);
    const retained = retainBulkPrices(photos, next, prices);
    if (Object.keys(retained).length < Object.keys(prices).length) setMessage("묶음이 바뀐 항목의 금액을 다시 입력해주세요. 나머지 금액은 유지됩니다.");
    setPhotos(next); setPrices(retained); setFieldError(null);
  }

  async function selectFiles(event) {
    if (working.current) return;
    const input = event.target;
    const files = Array.from(input.files || []);
    if (!files.length) return;
    working.current = true; setBusy(true); setFieldError(null); setConfirmReanalysis(false);
    const selected = [];
    try {
      // Sequential preparation bounds memory usage on phones with large originals.
      for (const file of files) {
        setMessage(`사진 준비 중: ${selected.length + 1}/${files.length}장 · ${file.name}`);
        const id = crypto.randomUUID();
        const photo = { id, objectId: id, name: file.name, file: null, url: "", site: "1", category: "기타", subCategory: "", type: "unknown", confidence: "low", groupingReview: true, description: "", tags: [] };
        try { Object.assign(photo, await prepareBulkPhoto(file)); photo.url = preview(photo.file); }
        catch { photo.fileError = "사진을 읽지 못했습니다. 휴대폰에 저장된 JPG/PNG 사진을 다시 선택해주세요."; }
        selected.push(photo);
      }
      // Only release the picker after its bytes have been copied into owned files.
      input.value = "";
      photos.forEach(release);
      setPhotos(selected); setPrices({}); setSiteNames({});
      await analyze(selected);
    } finally { working.current = false; setBusy(false); }
  }

  async function replaceFile(photo, event) {
    if (working.current) return;
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    working.current = true; setBusy(true);
    try {
      const prepared = await prepareBulkPhoto(file);
      const url = preview(prepared.file);
      release(photo);
      update(photo.id, { ...prepared, url });
      setMessage("사진을 다시 준비했습니다. 기존 금액·묶음·시공 전후 선택은 유지됩니다. 사진이 맞는지 확인해주세요.");
    } catch {
      showError({ field: `file:${photo.id}`, photoId: photo.id, message: `${file.name}: 사진을 읽지 못했습니다. 휴대폰에 저장된 JPG/PNG 사진을 선택해주세요.` });
    } finally { input.value = ""; working.current = false; setBusy(false); }
  }

  async function analyze(selected) {
    const ready = selected.filter((photo) => photo.file && !photo.fileError);
    const failed = selected.filter((photo) => !photo.file || photo.fileError);
    if (!ready.length) {
      if (failed[0]) showError({ field: `file:${failed[0].id}`, photoId: failed[0].id, message: `${failed[0].name}: 사진을 읽지 못했습니다. 이 사진을 다시 선택해주세요.` });
      return;
    }
    setMessage(`사진 ${ready.length}장을 AI로 분류하고 있습니다...`);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("로그인이 필요합니다.");
      const classified = [];
      let nextSite = 1;
      for (let offset = 0; offset < ready.length;) {
        const references = chooseBulkReferences(classified, ready.slice(offset, offset + 8));
        const batch = [];
        let bytes = references.reduce((sum, p) => sum + p.file.size, 0);
        for (const photo of ready.slice(offset, offset + 12 - references.length)) {
          if (batch.length && bytes + photo.file.size > 3_500_000) break;
          batch.push(photo); bytes += photo.file.size;
        }
        const input = [...references, ...batch];
        setMessage(`AI 분류 중: ${offset}/${ready.length}장 완료`);
        const form = new FormData();
        input.forEach((photo) => form.append("images", photo.file));
        form.append("metadata", JSON.stringify(input.map((photo, index) => ({
          takenAt: photo.takenAt, latitude: photo.latitude, longitude: photo.longitude,
          referenceSite: index < references.length ? photo.site : null,
          referenceObject: index < references.length ? photo.objectId : null,
        }))));
        const response = await fetch("/api/quick-register/analyze", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: form });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "분석 실패");
        classified.push(...resolveBulkBatch(batch, references, data.photos, () => String(nextSite++), () => crypto.randomUUID()));
        offset += batch.length;
        setPhotos([...classified, ...ready.slice(offset), ...failed]);
      }
      setMessage(`✅ ${classified.length}장 자동 분류 완료. 같은 시공 대상끼리 묶였는지 확인하고 묶음별 금액을 입력해주세요.${failed.length ? ` 읽지 못한 ${failed.length}장은 다시 선택해주세요.` : ""}`);
      if (failed[0]) showError({ field: `file:${failed[0].id}`, photoId: failed[0].id, message: `${failed[0].name}: 사진을 읽지 못했습니다. 이 사진을 다시 선택해주세요.` });
    } catch (error) { setMessage(`❌ ${error.message} 준비된 사진은 유지됩니다. 다시 분류하거나 직접 분류해주세요.`); }
  }

  async function reanalyze() {
    if (working.current) return;
    working.current = true; setBusy(true); setConfirmReanalysis(false); setFieldError(null);
    const reset = photos.map((photo) => ({ ...photo, site: "1", objectId: photo.id, groupingReview: true, category: "기타", subCategory: "", type: "unknown", confidence: "low", description: "", tags: [] }));
    setPhotos(reset); setPrices({}); setSiteNames({});
    try { await analyze(reset); }
    finally { working.current = false; setBusy(false); }
  }

  async function save() {
    if (working.current || saveBlocked || !companyId || !photos.length) return;
    const invalid = firstBulkError(photos, prices);
    if (invalid) { showError(invalid); return; }
    working.current = true; setBusy(true); setFieldError(null);
    const completed = new Set();
    let activePhoto = null;
    let cleanupFailed = false;
    try {
      for (const { site, items, groups } of sites) {
        const siteName = String(siteNames[site] || `현장 ${site} · ${siteHint(items[0])}`).trim();
        for (const group of groups) {
          const { category, subCategory } = group;
          activePhoto = group.photos[0];
          setMessage(`${siteName} / ${category} ${subCategory} 저장 중...`);
          const { data: item, error: itemError } = await supabase.from("work_items").insert({
            company_id: companyId, project_id: PROJECT_ID, category, sub_category: subCategory,
            actual_cost: parseBulkMoney(prices[group.key]), memo: `[빠른등록 현장] ${siteName}`,
          }).select("id").single();
          if (itemError) throw itemError;
          const uploaded = [];
          try {
            for (const photo of group.photos) {
              activePhoto = photo;
              // Reuse the JPEG and hash prepared at selection; never reopen the original.
              const path = `history/${companyId}/${crypto.randomUUID()}.jpg`;
              uploaded.push(path);
              const { error: uploadError } = await supabase.storage.from("work-photos").upload(path, photo.file, { contentType: "image/jpeg", upsert: false });
              if (uploadError) throw uploadError;
              let embedding = null;
              try { embedding = await createEmbedding([category, subCategory, photo.description, ...photo.tags].filter(Boolean).join(" ")); } catch (error) { console.error("임베딩:", error); }
              const { error: photoError } = await supabase.from("work_photos").insert({
                company_id: companyId, project_id: PROJECT_ID, work_item_id: item.id,
                photo_type: photo.type, category, sub_category: subCategory, storage_path: path, photo_url: null,
                ai_description: photo.description || null, ai_tags: photo.tags.length ? photo.tags : null,
                embedding, image_hash: photo.imageHash,
              });
              if (photoError) throw photoError;
            }
            group.photos.forEach((photo) => completed.add(photo.id));
          } catch (error) {
            // A failed group is kept in the editor; stop retries if rollback fails.
            try {
              const photoCleanup = await supabase.from("work_photos").delete().eq("work_item_id", item.id);
              if (photoCleanup.error) throw photoCleanup.error;
              const fileCleanup = uploaded.length ? await supabase.storage.from("work-photos").remove(uploaded) : {};
              if (fileCleanup.error) throw fileCleanup.error;
              const itemCleanup = await supabase.from("work_items").delete().eq("id", item.id);
              if (itemCleanup.error) throw itemCleanup.error;
            } catch {
              cleanupFailed = true;
              setSaveBlocked(true);
              throw new Error(`실패한 묶음의 정리가 끝나지 않았습니다. 중복 저장을 막기 위해 등록을 중단했습니다. 시공 DB에서 항목 ${item.id}를 확인해주세요.`);
            }
            throw error;
          }
        }
      }
      photos.forEach(release);
      setPhotos([]); setPrices({}); setSiteNames({});
      setMessage(`✅ ${completed.size}장 저장 완료`);
      try { await loadJobs?.(1, ""); } catch { setMessage(`✅ ${completed.size}장 저장 완료. 시공 DB 목록을 새로고침해주세요.`); }
    } catch (error) {
      const remaining = photos.filter((photo) => !completed.has(photo.id));
      photos.filter((photo) => completed.has(photo.id)).forEach(release);
      setPhotos(remaining); setPrices(retainBulkPrices(photos, remaining, prices));
      const progress = cleanupFailed ? `완료된 ${completed.size}장 외에 실패한 묶음의 저장 상태 확인이 필요합니다.` : completed.size ? `저장된 ${completed.size}장은 목록에서 제외했습니다.` : "저장된 사진은 없습니다.";
      const detail = `${activePhoto?.name || "등록"}: ${error.message || "저장 실패"} ${progress} 남은 입력 내용은 유지됩니다.`;
      if (activePhoto) showError({ field: `file:${activePhoto.id}`, photoId: activePhoto.id, message: detail });
      else setMessage(`❌ ${detail}`);
    } finally { working.current = false; setBusy(false); }
  }

  return <section style={sectionStyle}>
    <h1 style={{ margin: "0 0 12px", fontSize: 21 }}>시공 데이터 대량 등록</h1>
    <p className={ui.help}>사진 일괄 선택 → 현장·시공 대상·전후 자동 분류 → 묶음별 가격 입력 → 일괄 등록</p>
    <fieldset disabled={busy || saveBlocked} className={ui.bulkFields}>
      <label htmlFor="bulk-photos" className={ui.bulkLabel}>여러 현장 사진 한 번에 올리기</label>
      <input id="bulk-photos" type="file" accept="image/*" multiple onChange={selectFiles} style={inputStyle} />
      <p className={ui.help}>시공 전·후 사진을 함께 선택하세요. 새로운 사진을 선택하면 현재 목록을 교체합니다. 같은 현장에서도 서로 다른 장·문은 각각 금액을 입력합니다.</p>
      {!!photos.length && <button type="button" onClick={() => setConfirmReanalysis(true)} className={ui.secondary}>전체 사진 다시 분류</button>}
      {confirmReanalysis && <div className={ui.bulkNotice}>
        <p>다시 분류하면 수정한 현장·묶음·전후 선택과 금액이 초기화됩니다.</p>
        <div className={ui.actionRow}><button type="button" className={ui.secondary} onClick={reanalyze}>초기화하고 다시 분류</button><button type="button" className={ui.secondary} onClick={() => setConfirmReanalysis(false)}>취소</button></div>
      </div>}
      {sites.map(({ site, items, groups }) => <div key={items[0].id} className={ui.bulkSite}>
        <h3>현장 {site || "미지정"} · {items.length}장</h3>
        <input aria-label={`현장 ${site} 이름`} style={inputStyle} placeholder={siteHint(items[0])} value={siteNames[site] || ""} onChange={(e) => setSiteNames((s) => ({ ...s, [site]: e.target.value }))} />
        {groups.map((group, groupIndex) => <div key={group.photos[0].id} className={ui.bulkGroup}>
          <strong>묶음 {groupIndex + 1} · {group.category} / {group.subCategory} · {group.photos.length}장</strong>
          <input {...fieldProps(`price:${group.key}`)} aria-label={`현장 ${site} 묶음 ${groupIndex + 1} 실제금액`} inputMode="numeric" placeholder="이 묶음 실제금액 (원)" style={{ ...inputStyle, margin: "8px 0" }} value={prices[group.key] ?? ""} onChange={(e) => { setPrices((s) => ({ ...s, [group.key]: e.target.value })); if (fieldError?.field === `price:${group.key}`) setFieldError(null); }} />
          {errorText(`price:${group.key}`)}
          <details open={group.photos.some(review) || group.photos.some((p) => fieldError?.photoId === p.id)}>
            <summary className={ui.bulkSummary}>사진·분류 확인{group.photos.some(review) ? " · 확인 필요" : " · 펼쳐보기"}</summary>
            {group.photos.map((photo) => <div key={photo.id} className={ui.bulkPhoto}>
              <div className={ui.bulkPhotoInfo}>
                {photo.url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={photo.url} alt={photo.name} width={80} height={80} style={{ objectFit: "cover" }} />}
                <div>{photo.name}<br />{photo.takenAt?.slice(0, 10) || "촬영일 없음"} · {photo.latitude == null ? "위치 없음" : "GPS 있음"}<br />{photo.confidence === "low" ? "⚠️ 분류 확인" : `AI 신뢰도 ${photo.confidence}`}</div>
              </div>
              {photo.groupingReview && <p className={ui.help}>같은 대상인지 확실하지 않아 별도 묶음으로 두었습니다. 같은 대상이면 아래에서 묶음을 옮겨주세요.</p>}
              {photo.objectEvidence && <p className={ui.help}>대상 구분: {photo.objectEvidence}</p>}
              <div className={ui.bulkGrid}>
                <label>현장 번호<input {...fieldProps(`site:${photo.id}`)} title="같은 번호는 같은 현장" key={`site-${photo.site}`} defaultValue={photo.site} onBlur={(e) => { if (e.target.value.trim() !== photo.site) update(photo.id, { site: e.target.value.trim(), objectId: photo.id, groupingReview: true }); }} />{errorText(`site:${photo.id}`)}</label>
                <label>시공 부위<select value={photo.category} onChange={(e) => update(photo.id, { category: e.target.value, subCategory: "" })}>{categories.map((c) => <option key={c}>{c}</option>)}</select></label>
                <label>세부 부위<input placeholder="세부 부위" key={`sub-${photo.subCategory}`} defaultValue={photo.subCategory} onBlur={(e) => { if (e.target.value.trim() !== photo.subCategory) update(photo.id, { subCategory: e.target.value.trim() }); }} /></label>
                <label>시공 전후<select {...fieldProps(`type:${photo.id}`)} value={photo.type} onChange={(e) => update(photo.id, { type: e.target.value })}>{types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{errorText(`type:${photo.id}`)}</label>
              </div>
              <label className={ui.bulkLabel}>금액 묶음<select value={bulkGroupKey(photo)} onChange={(e) => {
                const target = groups.find((g) => g.key === e.target.value);
                if (target) update(photo.id, { objectId: target.objectId, category: target.category, subCategory: target.subCategory, groupingReview: false });
              }}>{groups.map((g, i) => <option key={g.key} value={g.key}>묶음 {i + 1} · {g.category} / {g.subCategory}</option>)}</select></label>
              <div className={ui.actionRow}>
                {group.photos.length > 1 && <button type="button" className={ui.secondary} onClick={() => update(photo.id, { objectId: crypto.randomUUID(), groupingReview: false })}>이 사진을 별도 묶음으로 분리</button>}
              </div>
              <div className={ui.bulkFileRepair}>
                {photo.fileError && <p className={ui.bulkError}>{photo.fileError}</p>}
                <label className={ui.bulkLabel}>이 사진 다시 선택<input {...fieldProps(`file:${photo.id}`)} type="file" accept="image/*" onChange={(e) => replaceFile(photo, e)} /></label>
                {errorText(`file:${photo.id}`)}
              </div>
            </div>)}
          </details>
        </div>)}
      </div>)}
      {!!photos.length && <button type="button" onClick={save} style={{ ...primaryButtonStyle, marginTop: 16 }}>{busy ? "처리 중..." : "입력한 시공 데이터 일괄 등록"}</button>}
    </fieldset>
    {message && <p role="status" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message}</p>}
  </section>;
}
