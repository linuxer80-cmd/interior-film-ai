"use client";

import { useMemo, useState } from "react";
import * as exifr from "exifr";
import { supabase } from "../../lib/supabase";
import { PROJECT_ID } from "./adminConstants";
import { resizeImage, getImageHash } from "./imageUtils";
import { createEmbedding } from "./aiUtils";
import { inputStyle, primaryButtonStyle, sectionStyle } from "./adminStyles";

const categories = ["싱크대", "문·문틀", "중문", "붙박이장", "신발장", "현관문", "기타"];
const types = [["unknown", "전후 확인 필요"], ["before", "시공 전"], ["after", "시공 후"]];
const money = (value) => Number(String(value || "").replace(/,/g, ""));

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
  const update = (id, patch) => setPhotos((current) => current.map((photo) => photo.id === id ? { ...photo, ...patch } : photo));

  async function selectFiles(event) {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/"));
    event.target.value = "";
    if (!files.length) return;
    setMessage("원본 사진의 촬영 정보 확인 중...");
    const selected = await Promise.all(files.map(async (file) => {
      let exif = {};
      try { exif = await exifr.parse(file, { gps: true, pick: ["DateTimeOriginal", "CreateDate", "GPSLatitude", "GPSLongitude", "latitude", "longitude"] }) || {}; } catch {}
      const taken = exif.DateTimeOriginal || exif.CreateDate;
      return {
        id: crypto.randomUUID(), file, url: URL.createObjectURL(file),
        takenAt: taken instanceof Date && !Number.isNaN(taken.getTime()) ? taken.toISOString() : null,
        latitude: Number.isFinite(exif.latitude) ? exif.latitude : null,
        longitude: Number.isFinite(exif.longitude) ? exif.longitude : null,
        site: "1", category: "기타", subCategory: "", type: "unknown", confidence: "low", description: "", tags: [],
      };
    }));
    // A second selection replaces the batch, so the AI can compare all photos together.
    photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    setPhotos(selected);
    setPrices({}); setSiteNames({});
    await analyze(selected);
  }

  async function analyze(selected = photos) {
    if (!selected.length) return;
    setBusy(true); setMessage(`사진 ${selected.length}장을 AI로 분류하고 있습니다...`);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("로그인이 필요합니다.");
      const classified = [];
      let nextSite = 1;
      for (let offset = 0; offset < selected.length;) {
        // Include examples from earlier groups so site numbers remain consistent across requests.
        const references = [...new Map(classified.map((p) => [p.site, p])).values()].slice(-3);
        const batch = selected.slice(offset, offset + 12 - references.length);
        const input = [...references, ...batch];
        setMessage(`AI 분류 중: ${offset}/${selected.length}장 완료`);
        const form = new FormData();
        for (const photo of input) form.append("images", await resizeImage(photo.file, 1100, 0.65));
        form.append("metadata", JSON.stringify(input.map(({ takenAt, latitude, longitude, site }, index) => ({ takenAt, latitude, longitude, referenceSite: index < references.length ? site : null }))));
        const response = await fetch("/api/quick-register/analyze", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: form });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "분석 실패");
        const labels = new Map();
        references.forEach((photo, index) => labels.set(String(data.photos.find((p) => p.index === index)?.site_key), photo.site));
        const resolved = batch.map((photo, index) => {
          const found = data.photos.find((item) => item.index === index + references.length);
          const key = String(found.site_key || `new-${index}`);
          if (!labels.has(key)) labels.set(key, String(nextSite++));
          return { ...photo, site: labels.get(key),
          category: categories.includes(found.category) ? found.category : "기타",
          subCategory: String(found.sub_category || "").slice(0, 80),
          type: ["before", "after"].includes(found.photo_type) ? found.photo_type : "unknown",
          confidence: ["high", "medium"].includes(found.confidence) ? found.confidence : "low",
          description: String(found.description || "").slice(0, 500),
          tags: Array.isArray(found.tags) ? found.tags.filter((tag) => typeof tag === "string").slice(0, 12) : [] };
        });
        classified.push(...resolved);
        offset += batch.length;
        setPhotos([...classified, ...selected.slice(offset)]);
      }
      setMessage(`✅ ${classified.length}장 자동 분류 완료. '분류 확인' 표시가 있는 사진만 확인하고 실제금액을 입력해주세요.`);
    } catch (error) { setMessage(`❌ ${error.message}`); }
    finally { setBusy(false); }
  }

  const sites = useMemo(() => {
    const map = new Map();
    for (const photo of photos) {
      if (!map.has(photo.site)) map.set(photo.site, []);
      map.get(photo.site).push(photo);
    }
    return [...map.entries()].map(([site, items]) => {
      const groups = new Map();
      for (const photo of items) {
        const key = `${photo.category}||${photo.subCategory || photo.category}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(photo);
      }
      return { site, items, groups: [...groups.entries()] };
    });
  }, [photos]);

  async function save() {
    if (!companyId || !photos.length) return;
    if (photos.some((p) => p.type === "unknown")) { setMessage("⚠️ 전후 확인 필요 사진을 먼저 시공 전/후로 지정해주세요."); return; }
    const missing = sites.flatMap(({ site, groups }) => groups.map(([key]) => `${site}||${key}`)).filter((key) => !Number.isFinite(money(prices[key])) || money(prices[key]) <= 0);
    if (missing.length) { setMessage("⚠️ 모든 부위에 실제 시공금액을 입력해주세요. 같은 부위의 사진 여러 장은 한 금액으로 저장됩니다."); return; }
    setBusy(true);
    const completed = [];
    try {
      for (const { site, items, groups } of sites) {
        const siteName = String(siteNames[site] || `현장 ${site} · ${siteHint(items[0])}`).trim();
        for (const [key, group] of groups) {
          const [category, subCategory] = key.split("||");
          setMessage(`${siteName} / ${category} ${subCategory} 저장 중...`);
          const { data: item, error: itemError } = await supabase.from("work_items").insert({
            company_id: companyId, project_id: PROJECT_ID, category, sub_category: subCategory,
            actual_cost: money(prices[`${site}||${key}`]), memo: `[빠른등록 현장] ${siteName}`,
          }).select("id").single();
          if (itemError) throw itemError;
          const uploaded = [];
          try {
          for (let index = 0; index < group.length; index++) {
            const photo = group[index];
            const file = await resizeImage(photo.file);
            const path = `history/${companyId}/${crypto.randomUUID()}.jpg`;
            const { error: uploadError } = await supabase.storage.from("work-photos").upload(path, file, { contentType: "image/jpeg", upsert: false });
            if (uploadError) throw uploadError;
            uploaded.push(path);
            let embedding = null;
            try { embedding = await createEmbedding([category, subCategory, photo.description, ...photo.tags].filter(Boolean).join(" ")); } catch (error) { console.error("임베딩:", error); }
            const { error: photoError } = await supabase.from("work_photos").insert({
              company_id: companyId, project_id: PROJECT_ID, work_item_id: item.id,
              photo_type: photo.type, category, sub_category: subCategory, storage_path: path, photo_url: null,
              ai_description: photo.description || null, ai_tags: photo.tags.length ? photo.tags : null,
              embedding, image_hash: await getImageHash(file),
            });
            if (photoError) { await supabase.storage.from("work-photos").remove([path]); throw photoError; }
          }
          completed.push(...group.map((photo) => photo.id));
          } catch (error) {
            await supabase.from("work_photos").delete().eq("work_item_id", item.id);
            if (uploaded.length) await supabase.storage.from("work-photos").remove(uploaded);
            await supabase.from("work_items").delete().eq("id", item.id);
            throw error;
          }
        }
      }
      photos.forEach((photo) => URL.revokeObjectURL(photo.url));
      setPhotos([]); setPrices({}); setSiteNames({});
      setMessage(`✅ ${completed.length}장 저장 완료`);
      await loadJobs?.(1, "");
    } catch (error) {
      setPhotos((current) => {
        current.filter((photo) => completed.includes(photo.id)).forEach((photo) => URL.revokeObjectURL(photo.url));
        return current.filter((photo) => !completed.includes(photo.id));
      });
      setMessage(`❌ ${error.message}. 저장된 ${completed.length}장은 목록에서 제외했습니다. 남은 사진과 금액을 확인해주세요.`);
    } finally { setBusy(false); }
  }

  return <section style={sectionStyle}>
    <h2 style={{ marginTop: 0 }}>⚡ 빠른 시공등록</h2>
    <p>원본 사진을 여러 장 선택하면 AI가 자동으로 현장·부위·전후를 분류합니다. 불확실한 사진만 확인해주세요.</p>
    <input type="file" accept="image/*" multiple disabled={busy} onChange={selectFiles} style={inputStyle} />
    <button type="button" disabled={busy || !photos.length} onClick={analyze} style={{ ...primaryButtonStyle, marginTop: 12 }}>AI 현장·부위·전후 분류</button>
    {!busy && sites.map(({ site, items, groups }) => <div key={site} style={{ border: "1px solid #d1d5db", borderRadius: 12, padding: 12, marginTop: 16 }}>
      <h3>현장 {site} · {items.length}장</h3>
      <input aria-label={`현장 ${site} 이름`} style={inputStyle} placeholder={siteHint(items[0])} value={siteNames[site] || ""} onChange={(e) => setSiteNames((s) => ({ ...s, [site]: e.target.value }))} />
      {groups.map(([key, group]) => <div key={key} style={{ borderTop: "1px solid #eee", marginTop: 14, paddingTop: 10 }}>
        <strong>{key.replace("||", " / ")} · {group.length}장</strong>
        <input aria-label={`${site} ${key} 실제금액`} inputMode="numeric" placeholder="이 부위 실제금액 (원)" style={{ ...inputStyle, margin: "8px 0" }} value={prices[`${site}||${key}`] || ""} onChange={(e) => setPrices((s) => ({ ...s, [`${site}||${key}`]: e.target.value }))} />
        {group.map((photo) => <div key={photo.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 0" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}<img src={photo.url} alt="시공 사진" style={{ width: 75, height: 75, objectFit: "cover" }} />
          <div style={{ flex: "1 1 180px", fontSize: 12 }}>{photo.file.name}<br />{photo.takenAt?.slice(0, 10) || "촬영일 없음"} · {photo.latitude == null ? "위치 없음" : "GPS 있음"}<br />{photo.confidence === "low" ? "⚠️ 분류 확인" : `AI 신뢰도 ${photo.confidence}`}</div>
          <input aria-label="현장 번호" title="같은 번호는 같은 현장" style={{ width: 56 }} value={photo.site} onChange={(e) => update(photo.id, { site: e.target.value })} />
          <select aria-label="시공 부위" value={photo.category} onChange={(e) => update(photo.id, { category: e.target.value })}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
          <input aria-label="세부 부위" placeholder="세부 부위" style={{ width: 95 }} value={photo.subCategory} onChange={(e) => update(photo.id, { subCategory: e.target.value })} />
          <select aria-label="전후 구분" value={photo.type} onChange={(e) => update(photo.id, { type: e.target.value })}>{types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </div>)}
      </div>)}
    </div>)}
    {!!photos.length && <button type="button" disabled={busy} onClick={save} style={{ ...primaryButtonStyle, marginTop: 16 }}>{busy ? "처리 중..." : "확인 후 전체 저장"}</button>}
    {message && <p role="status" style={{ whiteSpace: "pre-wrap" }}>{message}</p>}
  </section>;
}
