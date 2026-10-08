"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { reportRequest } from "../utils/reportClient";
import FilmThumbnail from "../worker/cutting/FilmThumbnail";

const labels = {
  available: "보관 중",
  on_site: "현장 반출",
  supplier_returned: "자재상 반납",
  used_up: "전량 사용",
};
const actions = {
  receive: "입고",
  issue: "현장 반출",
  return: "현장 반입",
  supplier_return: "자재상 반납",
};
const same = (a, b) =>
  String(a || "").trim().toUpperCase() ===
  String(b || "").trim().toUpperCase();

const valid = (value, max = 1000000) =>
  String(value).trim() !== "" &&
  Number.isFinite(Number(value)) &&
  Number(value) >= 0 &&
  Number(value) <= max;

const initial = {
  label: "",
  brand: "",
  code: "",
  length: "50",
  supplier: "",
  location: "창고",
  memo: "",
};

export default function FilmRollInventory({
  siteId,
  disabled = false,
  onTracked,
  onChanged,
}) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(initial);
  const [returns, setReturns] = useState({});
  const [choices, setChoices] = useState({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("available");
  const [returnLocation, setReturnLocation] = useState("창고");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const lock = useRef(false);
  const mounted = useRef(false);
  const serial = useRef(0);
  const request = useRef(null);
  const callbacks = useRef({ onTracked, onChanged });
  callbacks.current = { onTracked, onChanged };

  const accept = useCallback(result => {
    setData(result);
    callbacks.current.onTracked?.([
      ...new Set(result.trips.map(t => t.material_id)),
    ]);
  }, []);

  const refresh = useCallback(async () => {
    if (lock.current) return;
    const version = ++serial.current;
    setLoading(true);

    try {
      const result = await reportRequest(
        `/api/film-stock${siteId ? `?siteId=${encodeURIComponent(siteId)}` : ""}`
      );
      if (!mounted.current || serial.current !== version) return;
      accept(result);
      setError("");
    } catch (cause) {
      if (mounted.current && serial.current === version) {
        setError(cause.message);
      }
    } finally {
      if (mounted.current && serial.current === version) {
        setLoading(false);
      }
    }
  }, [siteId, accept]);

  useEffect(() => {
    mounted.current = true;
    refresh();

    const { data: auth } = supabase.auth.onAuthStateChange(event => {
      if (["SIGNED_OUT", "SIGNED_IN", "USER_UPDATED"].includes(event)) {
        serial.current++;
        setData(null);
        setReturns({});
        setChoices({});
        setForm(initial);
        request.current = null;
        callbacks.current.onTracked?.([]);
        if (!lock.current) refresh();
      }
    });

    return () => {
      mounted.current = false;
      serial.current++;
      auth.subscription.unsubscribe();
    };
  }, [refresh]);

  async function act(action, fields) {
    if (lock.current || disabled) return;

    const body = {
      action,
      ...(siteId ? { siteId } : {}),
      ...fields,
    };
    const signature = JSON.stringify(body);

    if (request.current?.signature !== signature) {
      request.current = {
        signature,
        id: crypto.randomUUID(),
      };
    }

    lock.current = true;
    const version = ++serial.current;
    setBusy(true);
    setLoading(false);
    setError("");
    setMessage("");

    try {
      const result = await reportRequest("/api/film-stock", {
        ...body,
        requestId: request.current.id,
      });

      if (!mounted.current || serial.current !== version) return;

      accept(result);
      request.current = null;
      setMessage(`${actions[action]} 저장 완료`);

      if (action === "receive") {
        setForm(f => ({ ...f, label: "", memo: "" }));
      }

      if (action === "return") {
        setReturns(previous => {
          const next = { ...previous };
          delete next[fields.rollId];
          return next;
        });
      }

      callbacks.current.onChanged?.();
    } catch (cause) {
      if (mounted.current) setError(cause.message);
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const blocked = disabled || busy || loading;
  const patch = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const query = search.trim().toUpperCase();

  const rolls = (data?.rolls || []).filter(r =>
    (
      !query ||
      `${r.brand} ${r.product_code} ${r.label} ${r.supplier} ${r.location}`
        .toUpperCase().includes(query)
    ) &&
    (siteId || filter === "all" || r.status === filter)
  );

  const groups = new Map();

  for (const r of data?.rolls || []) {
    if (r.status !== "available") continue;
    const key = `${r.brand} / ${r.product_code}`;
    const old = groups.get(key) || { count: 0, length: 0 };
    groups.set(key, {
      count: old.count + 1,
      length: old.length + Number(r.remaining),
    });
  }

  return (
    <section className="roll-stock" aria-busy={busy || loading}>
      <div className="heading">
        <h2>{siteId ? "롤 재고 · 반출/반입" : "필름 롤 재고"}</h2>
        <button type="button" disabled={blocked} onClick={refresh}>
          새로고침
        </button>
      </div>

      <p>
        {siteId
          ? "반출할 롤을 통째로 선택하고, 작업 후 남은 길이를 입력하세요. 모든 롤을 반입하면 보고서 사용량에 자동 반영됩니다."
          : "한 롤씩 등록하세요. 기존 보유 롤은 메모에 ‘시작 재고’를 적고 현재 잔량으로 등록하면 됩니다."}
      </p>

      {error && <p role="alert" className="error">{error}</p>}
      {message && <p role="status" className="success">{message}</p>}
      {loading && <p>재고 확인 중…</p>}

      {data && (
        <>
          {!siteId && data.owner && (
            <>
              <details>
                <summary>＋ 자재상 입고 / 시작 재고 등록</summary>
                <div className="grid">
                  {[
                    ["label", "롤 이름·번호 (중복 불가)"],
                    ["brand", "브랜드 (현장 등록명과 동일)"],
                    ["code", "제품 번호"],
                    ["length", "현재 롤 길이 (m)"],
                    ["supplier", "자재상"],
                    ["location", "보관 위치"],
                    ["memo", "메모"],
                  ].map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <input
                        disabled={blocked}
                        type={key === "length" ? "number" : "text"}
                        min={key === "length" ? "0.001" : undefined}
                        step={key === "length" ? "any" : undefined}
                        maxLength={150}
                        value={form[key]}
                        onChange={e => patch(key, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={
                    blocked ||
                    !valid(form.length) ||
                    Number(form.length) <= 0 ||
                    ![form.label, form.brand, form.code, form.supplier]
                      .every(v => v.trim())
                  }
                  onClick={() => act("receive", form)}
                >
                  롤 1개 입고 저장
                </button>
              </details>

              <div className="summary">
                <b>보관 중인 재고</b>
                {[...groups].map(([key, value]) => (
                  <p key={key}>
                    {key} · {Number(value.length.toFixed(3))}m · {value.count}롤
                  </p>
                ))}
                {!groups.size && <p>보관 중인 롤이 없습니다.</p>}
              </div>

              <p>
                현장 반출 중: {data.rolls.filter(r => r.status === "on_site").length}롤
                {" · "}반출 당시{" "}
                {data.rolls.filter(r => r.status === "on_site")
                  .reduce((sum, r) => sum + Number(r.remaining), 0)}m
                {" "}(실사용량은 반입 시 확정)
              </p>
            </>
          )}

          {siteId && data.canEdit && (
            <label>
              반입 후 보관 위치
              <input
                value={returnLocation}
                disabled={blocked}
                onChange={e => setReturnLocation(e.target.value)}
                placeholder="창고 또는 차량"
              />
            </label>
          )}

          {siteId && !data.canEdit && (
            <p>현재 보고서 상태 또는 담당 권한으로 재고를 수정할 수 없습니다.</p>
          )}

          <label>
            제품·롤·자재상 검색
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="PS156 또는 롤 번호"
            />
          </label>

          {!siteId && (
            <select
              aria-label="재고 상태"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            >
              <option value="all">전체 이력</option>
              {Object.entries(labels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          )}

          {!rolls.length && (
            <p>
              해당하는 롤이 없습니다.
              {siteId &&
                " 관리자가 재고를 등록하고 현장에 같은 브랜드·제품 번호의 사용 필름을 등록해주세요."}
            </p>
          )}

          {rolls.map(r => {
            const materials = (data.materials || []).filter(m =>
              same(m.brand, r.brand) && same(m.code, r.product_code)
            );
            const selected =
              choices[r.id] ||
              (materials.length === 1 ? materials[0].id : "");
            const trip = data.trips.find(t =>
              t.roll_id === r.id &&
              t.returned == null &&
              t.site_id === siteId
            );
            const remainder = returns[r.id] ?? "";

            return (
              <article key={r.id}>
                <div className="heading">
                  <div className="identity">
                    <FilmThumbnail material={r} size={54} />
                    <div>
                      <strong>{r.label}</strong>
                      <p>{r.brand} / {r.product_code}</p>
                    </div>
                  </div>
                  <b>{r.remaining}m</b>
                </div>

                <p>
                  {labels[r.status]} ·{" "}
                  {r.status === "on_site"
                    ? r.site_name || "현장"
                    : r.status === "supplier_returned"
                      ? r.supplier
                      : r.location}
                  {" · "}입고처 {r.supplier}
                </p>

                {!siteId && r.status === "available" && (
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => {
                      if (confirm(
                        `${r.label} 남은 ${r.remaining}m 롤 전체를 ${r.supplier}에 반납할까요?`
                      )) {
                        act("supplier_return", {
                          rollId: r.id,
                          revision: r.revision,
                        });
                      }
                    }}
                  >
                    자재상에 남은 롤 전체 반납
                  </button>
                )}

                {siteId && data.canEdit && r.status === "available" && (
                  <>
                    <select
                      aria-label={`${r.label} 연결할 현장 자재`}
                      disabled={blocked}
                      value={selected}
                      onChange={e =>
                        setChoices(p => ({ ...p, [r.id]: e.target.value }))
                      }
                    >
                      <option value="">연결할 현장 자재 선택</option>
                      {materials.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.code || m.name} · {m.unit} · {m.id.slice(0, 6)}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={blocked || !selected}
                      onClick={() => {
                        if (confirm(
                          `${r.label} ${r.remaining}m 롤 전체를 이 현장에 반출할까요?`
                        )) {
                          act("issue", {
                            rollId: r.id,
                            revision: r.revision,
                            materialId: selected,
                          });
                        }
                      }}
                    >
                      이 롤 전체 반출 ({r.remaining}m)
                    </button>
                  </>
                )}

                {trip && data.canEdit && (
                  <>
                    <label>
                      작업 후 남은 롤 길이 (m)
                      <input
                        type="number"
                        min="0"
                        max={trip.issued}
                        step="any"
                        disabled={blocked}
                        value={remainder}
                        onChange={e =>
                          setReturns(p => ({ ...p, [r.id]: e.target.value }))
                        }
                      />
                    </label>

                    <p>
                      이번 반출 {trip.issued}m · 사용량{" "}
                      {valid(remainder, Number(trip.issued))
                        ? Number(
                            (Number(trip.issued) - Number(remainder)).toFixed(3)
                          )
                        : "미정"}m
                    </p>

                    <button
                      type="button"
                      disabled={
                        blocked || !valid(remainder, Number(trip.issued))
                      }
                      onClick={() => {
                        if (confirm(
                          `잔량 ${remainder}m로 반입할까요? 0m이면 전량 사용 처리합니다.`
                        )) {
                          act("return", {
                            rollId: r.id,
                            revision: r.revision,
                            remaining: remainder,
                            location: returnLocation,
                          });
                        }
                      }}
                    >
                      남은 롤 반입 저장
                    </button>
                  </>
                )}
              </article>
            );
          })}

          {siteId && (
            <details>
              <summary>이 현장 롤 이동 이력 ({data.trips.length}건)</summary>
              {data.trips.map(t => (
                <p key={t.id}>
                  {t.label} · {t.product_code} · 반출 {t.issued}m → 반입{" "}
                  {t.returned == null ? "대기" : `${t.returned}m`}
                  {t.returned != null &&
                    `· 사용 ${Number(
                      (Number(t.issued) - Number(t.returned)).toFixed(3)
                    )}m`}
                </p>
              ))}
            </details>
          )}

          {!siteId && (
            <details>
              <summary>최근 입출고 이력 (최대 100건)</summary>
              {data.events.map(e => (
                <p key={e.id}>
                  {new Date(e.created_at).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })}
                  {" · "}{e.label} · {actions[e.action]} · {e.after_qty}m
                  {e.memo && `· ${e.memo}`}
                </p>
              ))}
            </details>
          )}
        </>
      )}

      <style jsx>{`
        .roll-stock {
          padding: 16px;
          border: 1px solid #dfd4c4;
          border-radius: 16px;
          margin: 12px 0;
          background: #fffdfa;
          color: #243648;
          overflow-wrap: anywhere;
        }
        .heading, .identity {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .identity { justify-content: flex-start; }
        h2 { font-size: 19px; margin: 0; }
        p { font-size: 13px; line-height: 1.7; }
        label { display: block; font-size: 13px; margin: 10px 0; }
        input, select {
          width: 100%;
          box-sizing: border-box;
          padding: 12px;
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          font-size: 16px;
          margin: 5px 0;
          background: white;
        }
        button {
          padding: 11px 13px;
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          background: #edf5ff;
          color: #23445e;
          font-weight: 700;
          margin: 5px 0;
          cursor: pointer;
        }
        button:disabled { opacity: .5; cursor: default; }
        article, .summary {
          padding: 14px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          margin: 12px 0;
          background: white;
        }
        summary { padding: 12px 0; cursor: pointer; font-weight: 700; }
        .error { color: #b91c1c; }
        .success { color: #166534; }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit,minmax(180px,1fr));
          gap: 10px;
        }
      `}</style>
    </section>
  );
    }
