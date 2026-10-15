"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FilmFireBadge, { filmFireLabel } from "./FilmFireBadge";
import { reportRequest } from "../utils/reportClient";

const same = (a, b) =>
  String(a || "").trim().toUpperCase() ===
  String(b || "").trim().toUpperCase();

const matchesMaterial = (roll, material) =>
  Array.isArray(roll.matching_material_ids)
    ? roll.matching_material_ids.includes(material.id)
    : same(roll.brand, material.brand) &&
      same(roll.product_code, material.code);

const metres = value => Number(Number(value || 0).toFixed(3));

const valid = (value, max) =>
  String(value).trim() !== "" &&
  Number.isFinite(Number(value)) &&
  Number(value) >= 0 &&
  Number(value) <= Number(max);

export default function FilmRollInventory({
  siteId,
  active = true,
  disabled = false,
  onTracked,
  onChanged,
  selectionRequest,
}) {
  const [data, setData] = useState(null);
  const [materialId, setMaterialId] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("issue");
  const [checked, setChecked] = useState([]);
  const [remaining, setRemaining] = useState({});
  const [location, setLocation] = useState("창고");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [editingReturn, setEditingReturn] = useState(null);
  const [corrected, setCorrected] = useState("");

  const activeRef = useRef(active);
  activeRef.current = active;
  const previousActive = useRef(active);
  const mounted = useRef(false);
  const lock = useRef(false);
  const epoch = useRef(0);
  const batch = useRef(null);
  const callbacks = useRef({ onTracked, onChanged });
  callbacks.current = { onTracked, onChanged };

  useEffect(() => {
    if (!selectionRequest?.materialId) return;
    if (lock.current || batch.current) {
      setError("진행 중인 반출을 완료하거나 재시도한 후 제품을 선택해주세요.");
      return;
    }
    setMaterialId(selectionRequest.materialId);
    setTab("issue");
    setChecked([]);
    setSearch("");
  }, [selectionRequest]);

  const accept = useCallback(result => {
    setData(result);
    callbacks.current.onTracked?.([
      ...new Set((result.trips || []).map(t => t.material_id)),
    ]);
  }, []);

  const refresh = useCallback(async () => {
    if (!siteId || lock.current || !activeRef.current) return;

    const version = ++epoch.current;
    setLoading(true);

    try {
      const result = await reportRequest(
        `/api/film-stock?siteId=${encodeURIComponent(siteId)}`
      );

      if (!mounted.current || version !== epoch.current) return;

      accept(result);
      setChecked([]);
      setError("");
    } catch (cause) {
      if (mounted.current && version === epoch.current) {
        setError(cause.message);
      }
    } finally {
      if (mounted.current && version === epoch.current) {
        setLoading(false);
      }
    }
  }, [siteId, accept]);

  useEffect(() => {
    if (active && !previousActive.current && !batch.current) refresh();
    previousActive.current = active;
  }, [active, refresh]);

  useEffect(() => {
    mounted.current = true;
    refresh();

    const resume = () => {
      if (
        document.visibilityState === "visible" &&
        !batch.current
      ) {
        refresh();
      }
    };

    const warn = event => {
      if (batch.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("beforeunload", warn);

    return () => {
      mounted.current = false;
      epoch.current++;
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("beforeunload", warn);
    };
  }, [refresh]);

  async function run(jobs) {
    if (lock.current || disabled) return;

    if (!batch.current) {
      batch.current = { jobs, index: 0 };
    }

    const work = batch.current;
    if (!work?.jobs?.length) return;

    lock.current = true;
    epoch.current++;

    setPending(true);
    setBusy(true);
    setLoading(false);
    setError("");
    setMessage("");

    try {
      while (work.index < work.jobs.length) {
        const job = work.jobs[work.index];
        const result = await reportRequest("/api/film-stock", job);
        work.index++;

        if (!mounted.current) return;

        accept(result);
        setChecked(ids => ids.filter(id => id !== job.rollId));

        if (job.action === "return") {
          setRemaining(values => {
            const next = { ...values };
            delete next[job.rollId];
            return next;
          });
        }

        callbacks.current.onChanged?.();
      }

      batch.current = null;
      setEditingReturn(null);
      setCorrected("");
      setPending(false);
      setMessage(
        `${work.jobs.length}롤 저장 완료. 창고 재고와 현장 사용량에 반영했습니다.`
      );
    } catch (cause) {
      if (mounted.current) {
        setError(
          `${work.index}/${work.jobs.length}롤 처리 완료. ${cause.message}`
        );
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const materials = data?.materials || [];
  const selectedId =
    materialId || (materials.length === 1 ? materials[0].id : "");
  const material = materials.find(m => m.id === selectedId);

  const stock = (data?.rolls || []).filter(
    r =>
      r.status === "available" &&
      Number(r.remaining) > 0 &&
      material &&
      matchesMaterial(r, material)
  );

  const picked = stock.filter(r => checked.includes(r.id));
  const query = search.trim().toLowerCase();
  const matchesSearch = (...values) => !query || values.filter(value => value != null).join(" ").toLowerCase().includes(query);
  const visibleMaterials = materials.filter(m => matchesSearch(m.brand, m.code, m.name));
  const visibleStock = stock.filter(r => matchesSearch(material?.brand, material?.code, material?.name, r.supplier, r.location, r.remaining));

  const trips = (data?.trips || []).filter(
    t => t.site_id === siteId && t.returned == null
  );

  const canIssue = data?.canIssue ?? data?.canEdit;
  const canReturnRoll = data?.canReturnRoll ?? data?.canEdit;

  const blocked =
    disabled || busy || loading || pending ||
    !(tab === "issue" ? canIssue : canReturnRoll);

  const sum = rows =>
    metres(
      rows.reduce((total, r) => total + Number(r.remaining), 0)
    );

  if (!siteId) {
    return <a href="/admin/inventory">필름 재고 관리 열기</a>;
  }

  return (
    <section className="stock" aria-busy={busy || loading}>
      <header>
        <h3>롤 반출 · 자재 반납</h3>
        <button
          type="button"
          disabled={busy || pending || loading}
          onClick={refresh}
        >
          새로고침
        </button>
      </header>

      <nav>
        <button
          type="button"
          disabled={busy || pending}
          aria-pressed={tab === "issue"}
          onClick={() => setTab("issue")}
        >
          창고 → 현장
        </button>
        <button
          type="button"
          disabled={busy || pending}
          aria-pressed={tab === "return"}
          onClick={() => setTab("return")}
        >
          자재 반납 ({trips.length})
        </button>
      </nav>

      {error && <p className="error" role="alert">{error}</p>}
      {message && (
        <p className="success" role="status">{message}</p>
      )}
      {loading && <p role="status">재고 확인 중…</p>}

      {pending && (
        <div className="notice">
          <p>
            처리 중에는 이 화면을 유지해주세요.
            재시도는 같은 요청 번호를 사용해 중복 반출을 방지합니다.
          </p>
          <button
            type="button"
            disabled={busy || disabled}
            onClick={() => run()}
          >
            {busy ? "저장 중…" : "남은 요청 다시 확인"}
          </button>

          {!busy && (
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    "이미 저장된 이동은 유지됩니다. 재고를 다시 조회한 뒤 남은 롤을 확인할까요?"
                  )
                ) {
                  batch.current = null;
                  setPending(false);
                  setMessage("");
                  refresh();
                  callbacks.current.onChanged?.();
                }
              }}
            >
              재고 다시 조회
            </button>
          )}
        </div>
      )}

      {data && (
        <>
          {!(tab === "issue" ? canIssue : canReturnRoll) && (
            <p>
              현재 메뉴의 처리 권한이 없습니다.
              보고서 제출 후에는 새 반출이 제한되며,
              반납은 관리자·팀장 또는 팀장이 없는 현장의 담당자가 처리합니다.
            </p>
          )}

          {tab === "issue" ? (
            <>
              <p>
                현장에 사용할 필름을 누르면 가져갈 수 있는 롤이 표시됩니다.
              </p>

              <div className="materials">
                <label style={{ display: "block", width: "100%" }}>
                  창고 재고 검색
                  <input type="search" value={search} placeholder="필름 번호 · 대리점 · 보관 위치 · 길이"
                    onChange={event => setSearch(event.target.value)}
                    style={{ width: "100%", boxSizing: "border-box", padding: 12, fontSize: 16 }} />
                </label>
                {visibleMaterials.map(m => {
                  const available = (data.rolls || []).filter(
                    r =>
                      r.status === "available" &&
                      Number(r.remaining) > 0 &&
                      matchesMaterial(r, m)
                  );

                  return (
                    <button
                      type="button"
                      key={m.id}
                      disabled={busy || pending || loading}
                      aria-pressed={selectedId === m.id}
                      onClick={() => {
                        setMaterialId(m.id);
                        setChecked([]);
                      }}
                    >
                      <strong>{m.brand} / {m.code || m.name}<FilmFireBadge type={m.price_type} /></strong>
                      {m.name && <small>{m.name}</small>}
                      <small>
                        {available.length
                          ? `창고 ${available.length}롤 · ${sum(available)}m`
                          : "창고 재고 없음"}
                      </small>
                    </button>
                  );
                })}
              </div>

              {!materials.length && (
                <p>관리자가 현장에 사용할 필름을 먼저 등록해주세요.</p>
              )}

              {material && (
                <>
                  <p>
                    <b>보관 재고 {stock.length}롤 · {sum(stock)}m</b>
                  </p>
                  <p>
                    가져갈 롤을 체크하세요.
                    선택한 롤 전체가 현장으로 이동합니다.
                  </p>

                  <div className="rolls">
                    {visibleStock.map(r => (
                      <label className="roll" key={r.id}>
                        <input
                          type="checkbox"
                          disabled={blocked}
                          checked={checked.includes(r.id)}
                          onChange={e =>
                            setChecked(ids =>
                              e.target.checked
                                ? [...ids, r.id]
                                : ids.filter(id => id !== r.id)
                            )
                          }
                        />
                        <span>
                          <b>{r.brand} {r.product_code} · {r.remaining}m</b>
                          <FilmFireBadge type={r.price_type} />
                          <small>{r.label}</small>
                          <small>{r.supplier} · {r.location}</small>
                        </span>
                      </label>
                    ))}
                  </div>

                  {!!stock.length && !visibleStock.length && <p>검색 조건에 맞는 재고가 없습니다. 검색어를 지우거나 바꿔주세요.</p>}

                  {!stock.length && (
                    <p>
                      반출 가능한 롤이 없습니다.
                      대리점 입고와 현장 필름의 브랜드·제품 번호를 확인해주세요.
                    </p>
                  )}

                  <p>
                    반출량은 선택한 롤의 남은 길이로 자동 입력됩니다.
                    반출 후 이 제품의 창고 잔량:{" "}
                    <b>{metres(sum(stock) - sum(picked))}m</b>
                  </p>

                  <div className="total">
                    <strong>
                      반출량 {picked.length}롤 · {sum(picked)}m
                    </strong>
                    <button
                      type="button"
                      disabled={blocked || !picked.length}
                      onClick={() => {
                        if (
                          confirm(
                            `${material.brand} ${material.code} ${picked.length}롤, 총 ${sum(picked)}m를 반출할까요?\n${picked.map(r => `${r.product_code} · ${filmFireLabel(r.price_type)} · ${r.remaining}m`).join("\n")}`
                          )
                        ) {
                          run(
                            picked.map(r => ({
                              action: "issue",
                              siteId,
                              rollId: r.id,
                              revision: r.revision,
                              materialId: selectedId,
                              requestId: crypto.randomUUID(),
                            }))
                          );
                        }
                      }}
                    >
                      반출 완료
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <label>
                반납 후 보관 위치
                <input
                  disabled={blocked}
                  value={location}
                  maxLength={100}
                  onChange={e => setLocation(e.target.value)}
                />
              </label>

              <p>남은 길이를 입력하고 반납하세요. 전량 사용했으면 0m를 입력하세요.</p>

              {!trips.length && (
                <p>이 현장에 반출 중인 롤이 없습니다.</p>
              )}

              {trips.map(t => {
                const value = remaining[t.roll_id] ?? "";

                return (
                  <article key={t.id}>
                    <strong>
                      {t.brand} / {t.product_code} · 반출 {t.issued}m
                      <FilmFireBadge type={t.price_type} />
                    </strong>

                    <div className="return-row">
                      <input
                        aria-label={`${t.brand} ${t.product_code} 반출 ${t.issued}m 남은 길이`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max={t.issued}
                        step="any"
                        placeholder="남은 길이"
                        disabled={blocked}
                        value={value}
                        onChange={e =>
                          setRemaining(p => ({
                            ...p,
                            [t.roll_id]: e.target.value,
                          }))
                        }
                      />
                      <span>m</span>
                      <button
                        type="button"
                        disabled={blocked || !valid(value, t.issued)}
                        onClick={() => {
                          if (
                            confirm(
                              Number(value) === 0
                                ? "이 롤을 전량 사용 처리할까요? 창고에 복귀하는 길이는 0m입니다."
                                : `자재 반납을 완료하고 남은 ${value}m를 창고 재고에 복귀시킬까요?`
                            )
                          ) {
                            run([{
                              action: "return",
                              siteId,
                              rollId: t.roll_id,
                              revision: t.revision,
                              remaining: value,
                              location,
                              requestId: crypto.randomUUID(),
                            }]);
                          }
                        }}
                      >
                        자재 반납 완료
                      </button>
                    </div>

                    <small>
                      실제 사용량{" "}
                      {valid(value, t.issued)
                        ? `${metres(Number(t.issued) - Number(value))}m`
                        : "미입력"}
                    </small>
                  </article>
                );
              })}
            </>
          )}

          <section aria-label="반납 완료 내역">
            <h3>반납 완료</h3>
            {data.locked && <p>보고서 제출·승인 후에는 관리자가 보고서를 반려한 뒤 수정할 수 있습니다.</p>}
            {data.trips.filter(t => t.returned != null).map(t => (
              <article key={t.id} className="returned-roll">
                <strong>{t.brand} / {t.product_code}<FilmFireBadge type={t.price_type} /></strong>
                <span>사용 {metres(Number(t.issued) - Number(t.returned))}m</span>
                {editingReturn?.id === t.id ? (
                  <div className="return-editor">
                    <p>반출 {t.issued}m · 반납 {t.returned}m</p>
                    <label>
                      수정할 반납 길이 (m)
                      <input type="number" inputMode="decimal" min="0" max={t.issued} step="any"
                        value={corrected} disabled={busy || pending || disabled}
                        onChange={e => setCorrected(e.target.value)} />
                    </label>
                    <button type="button" disabled={busy || pending || disabled || loading ||
                      data.locked || !canReturnRoll || !valid(corrected,t.issued)}
                      onClick={() => {
                        if (confirm(`반납량을 ${editingReturn.returned}m에서 ${corrected}m로 수정할까요?`)) run([{
                          action:"correct_return",siteId,rollId:t.roll_id,tripId:t.id,
                          revision:editingReturn.revision,expectedReturned:editingReturn.returned,
                          remaining:corrected,requestId:crypto.randomUUID(),
                        }]);
                      }}>수정 저장</button>
                    <button type="button" disabled={busy || pending} onClick={() => setEditingReturn(null)}>취소</button>
                  </div>
                ) : (
                  <button type="button" disabled={busy || pending || disabled || loading || data.locked || !canReturnRoll}
                    onClick={() => { setEditingReturn({...t}); setCorrected(String(t.returned)); setError(""); }}>
                    수정
                  </button>
                )}
              </article>
            ))}
            {!data.trips.some(t => t.returned != null) && <p>반납 완료한 롤이 없습니다.</p>}
          </section>

          <details>
            <summary>
              이 현장 이동 이력 ({data.trips.length}건)
            </summary>
            {data.trips.map(t => (
              <p key={t.id}>
                {t.brand} / {t.product_code}<FilmFireBadge type={t.price_type} />
                <br />
                반출 {t.issued}m → 반입{" "}
                {t.returned == null
                  ? "대기"
                  : `${t.returned}m · 사용 ${metres(
                      Number(t.issued) - Number(t.returned)
                    )}m`}
              </p>
            ))}
          </details>

          <details>
            <summary>자재 반출·반납 도움말</summary>
          <small>
            반출 즉시 보관 재고에서 제외됩니다.
            반납 완료한 길이만 창고 재고로 복귀합니다.
            시공 완료만으로 자동 반납되지 않습니다.
            모든 롤을 반납하면 현장 사용량이 확정됩니다.
          </small>
          </details>
        </>
      )}

      <style jsx>{`
        .materials {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 8px;
          margin: 12px 0;
        }
        .materials button { text-align: left; }
        .materials small { color: inherit; }
        .stock {
          padding: 14px;
          margin: 12px 0;
          border: 1px solid #dfd4c4;
          border-radius: 16px;
          background: #fffdfa;
          color: #243648;
          overflow-wrap: anywhere;
        }
        header, nav, .total, .return-row {
          display: flex;
          align-items: center;
          gap: 8px;
          justify-content: space-between;
        }
        h3 { font-size: 17px; margin: 0; }
        nav { margin: 12px 0; }
        nav button { flex: 1; }
        button {
          padding: 11px;
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          background: #edf5ff;
          color: #243648;
          font-weight: 700;
          cursor: pointer;
        }
        button[aria-pressed="true"] {
          background: #243648;
          color: white;
        }
        button:disabled { opacity: 0.5; cursor: default; }
        p { font-size: 13px; line-height: 1.6; }
        label { display: block; font-size: 13px; }
        select, input:not([type="checkbox"]) {
          box-sizing: border-box;
          width: 100%;
          padding: 12px;
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          background: white;
          font-size: 16px;
          margin: 6px 0;
        }
        .rolls { max-height: 300px; overflow: auto; }
        .roll {
          display: flex;
          gap: 12px;
          align-items: center;
          padding: 12px 4px;
          border-bottom: 1px solid #e5e7eb;
        }
        .roll input {
          width: 22px;
          height: 22px;
          flex-shrink: 0;
        }
        .roll span { min-width: 0; }
        small {
          display: block;
          color: #64748b;
          font-size: 11px;
          line-height: 1.6;
        }
        .total {
          position: sticky;
          bottom: 8px;
          padding: 12px 8px;
          margin: 10px 0;
          background: #f0ece4;
          border-radius: 10px;
          z-index: 2;
          font-size: 13px;
        }
        .return-row input { min-width: 0; flex: 1; }
        .return-row button { white-space: nowrap; }
        article {
          padding: 12px 0;
          border-bottom: 1px solid #e5e7eb;
        }
        article strong { font-size: 14px; }
        .returned-roll { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
        .returned-roll strong { flex: 1; min-width: 120px; }
        .returned-roll > span { font-size: 13px; white-space: nowrap; }
        .returned-roll > button { min-height: 44px; }
        .return-editor { flex-basis: 100%; }
        .return-editor p { margin: 4px 0; }
        summary {
          padding: 14px 0;
          cursor: pointer;
          font-size: 13px;
          font-weight: 700;
        }
        .error { color: #b91c1c; }
        .success { color: #166534; }
        .notice {
          padding: 10px;
          background: #fff3d6;
          border-radius: 10px;
        }
      `}</style>
    </section>
  );
}


