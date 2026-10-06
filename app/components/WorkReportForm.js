"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import SiteOperations from "./SiteOperations";
import {
  reportRequest, draftStore, compressReportPhoto, uploadReportPhotos,
} from "../utils/reportClient";

const box = {
  padding: 16, border: "1px solid #dbe3ee", borderRadius: 14,
  background: "white", margin: "12px 0", overflowWrap: "anywhere",
};
const input = {
  width: "100%", boxSizing: "border-box", padding: 12, fontSize: 16,
  border: "1px solid #cbd5e1", borderRadius: 10, marginTop: 6,
};
const button = {
  padding: "11px 14px", border: "1px solid #cbd5e1", borderRadius: 10,
  background: "#eff6ff", color: "#1e40af", fontWeight: 700, cursor: "pointer",
};
const types = {
  parking: "주차비", meal: "식비", fuel: "유류비",
  toll: "통행료", material: "추가 자재비", other: "기타",
};
const num = v => v !== "" && v != null && Number.isFinite(Number(v));
const won = v => v == null ? "확인 필요" : `${Math.round(v).toLocaleString("ko-KR")}원`;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const material = () => ({
  brand: "", product_code: "", product_name: "", quantity: "",
  unit: "m", unit_price: "", memo: "",
});
const empty = site => ({
  requestId: crypto.randomUUID(),
  work_region: site?.region || "",
  work_summary: site?.work_description || site?.work_type || "",
  memo: "", materials: [], expenses: [], labor: [], photos: [], returns: {},
});

export default function WorkReportForm({
  site, siteId, owner = false, saving = false, message = "",
  onSave, onCancel, onSubmitted,
}) {
  const [form, setForm] = useState(null);
  const [context, setContext] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [ready, setReady] = useState(false);
  const [candidate, setCandidate] = useState(null);
  const [error, setError] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState("");
  const [pendingReturns, setPendingReturns] = useState(false);

  const root = useRef(null);
  const current = useRef(null);
  const draftKey = useRef(null);
  const queue = useRef(Promise.resolve());
  const stopped = useRef(false);
  const lock = useRef(false);
  const userId = useRef(null);
  const mounted = useRef(true);
  current.current = form;

  const persist = useCallback(value => {
    if (stopped.current || !draftKey.current || !value) return Promise.resolve();
    const key = draftKey.current;

    queue.current = queue.current.catch(() => {}).then(() =>
      draftStore(key, "put", { form: value, at: Date.now() })
    );

    return queue.current.then(() => {
      if (mounted.current) {
        setDraftMessage("이 기기에 임시저장됨 · " + new Date().toLocaleTimeString("ko-KR"));
      }
    }).catch(() => {
      if (mounted.current) {
        setDraftMessage(
          "임시저장 실패: 기기 저장공간 또는 브라우저 설정을 확인해주세요. 화면을 닫으면 내용이 사라질 수 있습니다."
        );
      }
    });
  }, []);

  const refresh = useCallback(async () => {
    const data = await reportRequest(`/api/report-support?siteId=${encodeURIComponent(siteId)}`);
    if (mounted.current) setContext(data);
    return data;
  }, [siteId]);

  useEffect(() => {
    mounted.current = true;
    let active = true;

    async function init() {
      try {
        const auth = await supabase.auth.getSession();
        if (!auth.data.session) throw Error("다시 로그인해주세요.");
        userId.current = auth.data.session.user.id;

        const data = await refresh();
        if (!active) return;
        if (owner && !data.owner) throw Error("현재 계정의 작성 화면을 다시 열어주세요.");

        let people = [];
        if (!owner) {
          const access = await reportRequest(
            `/api/worker/site-work-report?siteId=${encodeURIComponent(siteId)}`
          );
          if (!access.canSubmit) throw Error("책임 팀장 또는 지정 담당자만 작성할 수 있습니다.");
          people = access.laborWorkers || [];
        }
        if (!active) return;
        setWorkers(people);

        const base = empty(site);
        if (data.report?.review_status === "rejected") Object.assign(base, data.seed);
        setForm(base);

        draftKey.current =
          `v1:${userId.current}:${siteId}:${owner ? "owner" : "worker"}:${data.report?.updated_at || "new"}`;

        try {
          const saved = await draftStore(draftKey.current, "get");
          if (!active) return;
          if (saved?.form) setCandidate(saved);
          else setReady(true);
        } catch {
          setDraftMessage("이 브라우저에서 임시저장을 사용할 수 없습니다.");
          setReady(true);
        }
      } catch (error) {
        if (active) setError(error.message);
      }
    }

    init();

    const changed = e => {
      if (e.detail?.siteId === siteId) refresh().catch(e => setError(e.message));
    };
    window.addEventListener("site-materials-changed", changed);

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (userId.current && session?.user.id !== userId.current) {
        stopped.current = true;
        setReady(false);
        setCandidate(null);
        setForm(null);
        setError("계정이 변경되었습니다. 화면을 닫고 다시 열어주세요.");
      }
    });

    return () => {
      active = false;
      mounted.current = false;
      window.removeEventListener("site-materials-changed", changed);
      authListener.subscription.unsubscribe();
    };
  }, [siteId, owner, refresh]);

  useEffect(() => {
    if (!ready || !form) return;
    const timer = setTimeout(() => persist(form), 600);
    return () => clearTimeout(timer);
  }, [form, ready, persist]);

  useEffect(() => {
    if (!ready) return;
    const flush = () => persist(current.current);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [ready, persist]);

  const setReturns = useCallback(
    value => setForm(f => f ? { ...f, returns: value } : f), []
  );
  const setOperations = useCallback(
    data => setContext(c => c ? { ...c, operations: data } : c), []
  );
  const patch = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const rowPatch = (group, index, key, value) => setForm(f => ({
    ...f,
    [group]: f[group].map((r, i) => i === index ? { ...r, [key]: value } : r),
  }));
  const remove = (group, index) => patch(group, form[group].filter((_, i) => i !== index));
  const add = (group, row) => patch(group, [...form[group], row]);
  const tracked = context?.operations.materials.some(m => Number(m.issued) > 0);

  function issues(data = context) {
    const list = [];
    if (!form?.work_summary.trim()) {
      list.push({ label: "시공 내용 미입력", target: "content" });
    }
    if (!(data?.afterCount > 0) && !form?.photos.some(p => p.type === "after")) {
      list.push({ label: "완료사진 없음", target: "photos" });
    }
    if (pendingReturns) {
      list.push({ label: "반입량 변경사항 저장 필요", target: "materials" });
    }
    if (data?.operations.locked) {
      list.push({
        label: "이미 제출·승인되었거나 취소된 현장입니다. 현장 화면을 다시 열어주세요.",
        target: "content",
      });
    }

    const trackedNow = data?.operations.materials.some(m => Number(m.issued) > 0);
    if (trackedNow) {
      for (const m of data.operations.materials.filter(m => Number(m.issued) > 0)) {
        if (m.returned == null) {
          list.push({
            label: `${m.code || m.name}: 반입량 미입력`,
            target: "materials", id: m.id,
          });
        }
        if (data.missingPrices.includes(m.id)) {
          list.push({
            label: `${m.code || m.name}: 원가 단가 미입력${
              owner ? " · 자재 메뉴에서 입력" : " · 관리자에게 입력 요청"
            }`,
            target: "materials", id: m.id,
          });
        }
      }
    }

    if (!trackedNow) {
      form?.materials.forEach((m, i) => {
        if (
          !(m.product_code?.trim() || m.product_name?.trim()) ||
          !num(m.quantity) || Number(m.quantity) <= 0 ||
          !num(m.unit_price) || Number(m.unit_price) < 0
        ) {
          list.push({ label: `자재 ${i + 1}: 제품·사용량·단가 확인`, target: "materials" });
        }
      });
    }

    form?.expenses.forEach((e, i) => {
      if (
        !num(e.amount) || Number(e.amount) <= 0 ||
        !Number.isSafeInteger(Number(e.amount)) || !e.expense_date
      ) {
        list.push({ label: `경비 ${i + 1}: 금액·날짜 확인`, target: "expenses" });
      }
    });

    const seen = new Set();
    if (!owner) {
      form?.labor.forEach((r, i) => {
        if (
          !workers.some(w => w.id === r.worker_id) || seen.has(r.worker_id) ||
          !num(r.days) || Number(r.days) <= 0 || Number(r.days) > 366 ||
          !num(r.daily_wage) || Number(r.daily_wage) < 0 ||
          !Number.isSafeInteger(Number(r.daily_wage)) ||
          !num(r.allowance) || Number(r.allowance) < 0
        ) {
          list.push({ label: `인건비 ${i + 1}: 시공자·일수·일당·수당 확인`, target: "labor" });
        }
        seen.add(r.worker_id);
      });
    }
    return list;
  }

  function jump(item) {
    const section = root.current?.querySelector(`[data-section="${item.target}"]`);
    const target = item.id
      ? section?.querySelector(`[data-material-id="${item.id}"]`) || section
      : section;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    target?.querySelector(
      "input:not(:disabled),textarea:not(:disabled),button:not(:disabled)"
    )?.focus({ preventScroll: true });
  }

  async function selectPhotos(event, type) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    setPreparing(true);
    setError("");

    try {
      if (files.length + form.photos.length > 30) {
        throw Error("한 번에 사진 30장까지 선택해주세요.");
      }
      const entries = [];
      for (const file of files) {
        setProgress(`${entries.length + 1}/${files.length}장 용량 줄이는 중`);
        const reduced = await compressReportPhoto(file);
        if (reduced.size > 15 * 1024 * 1024) {
          throw Error(`${file.name}: 15MB 이하 사진이 필요합니다.`);
        }
        entries.push({
          id: crypto.randomUUID(), type, file: reduced, uploaded: false,
        });
      }
      setForm(f => ({ ...f, photos: [...f.photos, ...entries] }));
      setProgress("사진 준비 완료");
    } catch (e) {
      setError(e.message);
    } finally {
      setPreparing(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (lock.current || saving || preparing || !ready) return;
    lock.current = true;
    setBusy(true);
    setError("");

    try {
      const latest = await refresh();
      const missing = issues(latest);
      if (missing.length) {
        jump(missing[0]);
        throw Error("아래 누락 항목을 먼저 확인해주세요.");
      }

      await persist(current.current);
      await uploadReportPhotos({
        entries: current.current.photos,
        siteId,
        owner,
        onProgress: setProgress,
        onUploaded: async id => {
          const next = {
            ...current.current,
            photos: current.current.photos.map(p =>
              p.id === id ? { ...p, uploaded: true } : p
            ),
          };
          current.current = next;
          setForm(next);
          await persist(next);
        },
      });

      const f = current.current;
      const payload = {
        siteId,
        requestId: f.requestId,
        work_region: f.work_region,
        work_summary: f.work_summary,
        memo: f.memo,
        materials: latest.operations.materials.some(m => Number(m.issued) > 0)
          ? [] : f.materials,
        expenses: f.expenses,
        labor: f.labor,
      };

      setProgress("완료보고 저장 중…");
      const success = owner
        ? await onSave(payload)
        : await reportRequest("/api/worker/site-work-report", payload);
      if (!success) return;

      stopped.current = true;
      await queue.current.catch(() => {});
      try {
        await draftStore(draftKey.current, "delete");
      } catch {}

      setProgress("완료보고 저장 완료");
      if (!owner) {
        try {
          await onSubmitted?.(success);
        } catch {
          setError("저장은 완료했습니다. 현장 화면을 새로고침해주세요.");
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const disabled = saving || busy || preparing;

  if (!form || !context) {
    return (
      <div style={box}>
        <p role="alert">{error || "완료보고 점검 중…"}</p>
        <button type="button" style={button} onClick={() => window.location.reload()}>
          새로고침
        </button>
      </div>
    );
  }

  if (candidate) {
    return (
      <div style={box}>
        <b>이 현장에 임시저장된 보고서가 있습니다.</b>
        <p>
          {new Date(candidate.at).toLocaleString("ko-KR")}
          {" · "}사진 {candidate.form.photos?.length || 0}장
        </p>
        <button type="button" style={button} onClick={() => {
          setForm(candidate.form);
          setCandidate(null);
          setReady(true);
        }}>
          이어서 작성
        </button>{" "}
        <button type="button" style={button} onClick={async () => {
          if (!confirm("임시저장 내용을 지우고 새로 작성할까요?")) return;
          try {
            await draftStore(draftKey.current, "delete");
            setCandidate(null);
            setReady(true);
          } catch {
            setError("임시저장을 삭제하지 못했습니다.");
          }
        }}>
          임시저장 삭제
        </button>
        <p>{error}</p>
      </div>
    );
  }

  if (!ready) return <p role="alert">{error || "준비 중…"}</p>;

  const missing = issues();
  const materialCost = tracked
    ? context.operations.materials.filter(m => Number(m.issued) > 0)
        .reduce((s, m) => s + Number(m.used || 0) * Number(m.unitPrice || 0), 0)
    : form.materials.reduce(
        (s, m) => s + Number(m.quantity || 0) * Number(m.unit_price || 0), 0
      );
  const preview = context.preview;
  const newMaterial = form.expenses.filter(e => e.expense_type === "material")
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const newExpense = form.expenses.filter(e => e.expense_type !== "material")
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const previewReady = preview && preview.revenue != null &&
    !preview.laborPending &&
    !missing.some(i => i.target === "materials" || i.target === "expenses");

  const field = (key, label, props = {}) => (
    <label style={{ display: "block", margin: "10px 0" }}>
      {label}
      <input style={input} value={form[key]}
        onChange={e => patch(key, e.target.value)} {...props} />
    </label>
  );
  const rowField = (group, index, key, label, props = {}) => (
    <label style={{ display: "block", margin: "8px 0" }}>
      {label}
      <input style={input} value={form[group][index][key] ?? ""}
        onChange={e => rowPatch(group, index, key, e.target.value)} {...props} />
    </label>
  );

  return (
    <form ref={root} onSubmit={submit} noValidate>
      <section style={{ ...box, background: "#eff6ff" }}>
        <h3>완료 전 확인 · {missing.length}건</h3>
        <p>{draftMessage || "임시저장 준비 중"}</p>
        <small>
          사진과 작성 내용은 현재 기기·브라우저에 저장됩니다.
          브라우저 데이터 삭제 시 사라집니다.
        </small>
        {missing.map((item, i) => (
          <div key={i}>
            <button type="button"
              style={{ ...button, marginTop: 8, textAlign: "left" }}
              onClick={() => jump(item)}>
              {item.label} →
            </button>
          </div>
        ))}
        {!missing.length && <p>필수 입력 확인 완료</p>}
        <button type="button" disabled={disabled} style={button}
          onClick={() => refresh().catch(e => setError(e.message))}>
          점검 새로고침
        </button>
      </section>

      {(error || message) && (
        <p role="alert" style={{ ...box, color: "#b91c1c" }}>{error || message}</p>
      )}

      <fieldset disabled={disabled} style={{ border: 0, padding: 0, minWidth: 0 }}>
        <section style={box} data-section="content">
          <h3>시공 내용 · {site?.site_name}</h3>
          {field("work_region", "시공 지역")}
          <label>
            실제 시공 내용 *
            <textarea style={input} rows={4} value={form.work_summary}
              onChange={e => patch("work_summary", e.target.value)} />
          </label>
          <label>
            작업 메모
            <textarea style={input} rows={3} value={form.memo}
              onChange={e => patch("memo", e.target.value)} />
          </label>
        </section>

        <section style={box} data-section="photos">
          <h3>시공 사진</h3>
          <p>
            등록된 완료사진 {context.afterCount}장 · 새 사진은 긴 변 최대 2048px로 용량을 줄입니다.
          </p>
          {!owner && (
            <label style={{ display: "block", margin: 12 }}>
              시공 전 사진
              <input type="file" accept="image/*" multiple
                onChange={e => selectPhotos(e, "before")} />
            </label>
          )}
          <label style={{ display: "block", margin: 12 }}>
            시공 완료 사진
            <input type="file" accept="image/*" multiple
              onChange={e => selectPhotos(e, "after")} />
          </label>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8,
          }}>
            {form.photos.map((p, i) => (
              <Photo key={p.id} entry={p} onRemove={() => remove("photos", i)} />
            ))}
          </div>
        </section>

        <section data-section="materials" style={{ scrollMarginTop: 16 }}>
          <SiteOperations siteId={siteId} mode="materials" disabled={disabled}
            initialDraft={form.returns} onDraftChange={setReturns}
            onPendingChange={setPendingReturns} onDataChange={setOperations} />
          {owner && (
            <p>
              원가 단가는 상단의 자재 메뉴에서 수정하고 돌아온 뒤
              ‘점검 새로고침’을 눌러주세요.
            </p>
          )}
          {!tracked && (
            <div style={box}>
              <h3>실제 사용 자재</h3>
              {form.materials.map((m, i) => (
                <div key={i} style={box}>
                  <b>자재 {i + 1}</b>
                  {rowField("materials", i, "brand", "브랜드")}
                  {rowField("materials", i, "product_code", "제품코드")}
                  {rowField("materials", i, "product_name", "제품명")}
                  {rowField("materials", i, "quantity", "사용량",
                    { type: "number", min: 0, step: "any" })}
                  {rowField("materials", i, "unit", "단위")}
                  {rowField("materials", i, "unit_price", "원가 단가 · 필수, 무상이면 0",
                    { type: "number", min: 0 })}
                  {rowField("materials", i, "memo", "메모")}
                  <button type="button" style={button}
                    onClick={() => remove("materials", i)}>삭제</button>
                </div>
              ))}
              <button type="button" style={button}
                onClick={() => add("materials", material())}>＋ 자재 추가</button>
            </div>
          )}
        </section>

        {!owner && (
          <section style={box} data-section="labor">
            <h3>인건비</h3>
            <p>직접 입력하지 않으면 기존 배정·일당 기준 자동 계산을 사용합니다.</p>
            {form.labor.map((r, i) => (
              <div key={i} style={box}>
                <select style={input} value={r.worker_id}
                  onChange={e => rowPatch("labor", i, "worker_id", e.target.value)}>
                  <option value="">시공자 선택</option>
                  {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                {rowField("labor", i, "days", "근무일수",
                  { type: "number", min: 0, step: "any" })}
                {rowField("labor", i, "daily_wage", "일당", { type: "number", min: 0 })}
                {rowField("labor", i, "allowance", "팀장수당 합계",
                  { type: "number", min: 0 })}
                <button type="button" style={button}
                  onClick={() => remove("labor", i)}>삭제</button>
              </div>
            ))}
            <button type="button" style={button}
              onClick={() => add("labor", {
                worker_id: "", days: 1, daily_wage: "", allowance: 0,
              })}>
              ＋ 인건비 추가
            </button>
          </section>
        )}

        <section style={box} data-section="expenses">
          <h3>완료보고 경비</h3>
          <p>
            경비 메뉴에 이미 등록한 금액은 다시 입력하지 마세요.
            기존 현장 경비는 유지됩니다.
          </p>
          {form.expenses.map((e, i) => (
            <div key={i} style={box}>
              <select style={input} value={e.expense_type}
                onChange={ev => rowPatch("expenses", i, "expense_type", ev.target.value)}>
                {Object.entries(types).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              {rowField("expenses", i, "amount", "금액", { type: "number", min: 0 })}
              {rowField("expenses", i, "expense_date", "날짜", { type: "date" })}
              {rowField("expenses", i, "description", "내용")}
              <button type="button" style={button}
                onClick={() => remove("expenses", i)}>삭제</button>
            </div>
          ))}
          <button type="button" style={button}
            onClick={() => add("expenses", {
              expense_type: "parking", amount: "", description: "", expense_date: today(),
            })}>
            ＋ 경비 추가
          </button>
        </section>

        {owner && preview && (
          <section style={{ ...box, background: "#f0fdf4" }}>
            <h3>관리자 정산 미리보기</h3>
            <p>계약금액: {won(preview.revenue)}</p>
            <p>인건비: {preview.laborPending ? "일당·수당 확인 필요" : won(preview.labor)}</p>
            <p>
              자재비: {missing.some(i => i.target === "materials")
                ? "사용량·단가 확인 필요"
                : won(materialCost + preview.extraMaterial + newMaterial)}
            </p>
            <p>경비: {won(preview.expense + newExpense)}</p>
            <strong>
              예상수익: {previewReady
                ? won(preview.revenue - preview.labor - materialCost -
                    preview.extraMaterial - newMaterial - preview.expense - newExpense)
                : "미입력 항목 확인 후 계산"}
            </strong>
            <p><small>
              배정·일당과 현재 입력 기준 예상 금액입니다.
              저장 시 서버에서 자재 사용량을 다시 확인합니다.
            </small></p>
          </section>
        )}
      </fieldset>

      {progress && <p role="status" style={box}>{progress}</p>}
      <div style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        {onCancel && (
          <button type="button" style={button} disabled={disabled}
            onClick={async () => {
              await persist(current.current);
              onCancel();
            }}>
            임시저장 후 닫기
          </button>
        )}
        <button type="submit" disabled={disabled}
          style={{ ...button, background: "#142238", color: "white", flex: 1 }}>
          {disabled ? "처리 중…" : "완료보고 저장"}
        </button>
      </div>
    </form>
  );
}

function Photo({ entry, onRemove }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(entry.file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [entry.file]);

  return (
    <div>
      <img src={url} alt={entry.type === "after" ? "완료사진" : "시공 전 사진"}
        style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10 }} />
      <small>
        {entry.uploaded ? "등록 완료" : `${Math.round(entry.file.size / 1024)}KB`}
      </small>
      {!entry.uploaded && <button type="button" onClick={onRemove}>삭제</button>}
    </div>
  );
    }
