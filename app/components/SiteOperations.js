"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import FilmFireBadge from "./FilmFireBadge";
import FilmRollInventory from "./FilmRollInventory";
import MaterialIssueStatus from "./MaterialIssueStatus";
import FilmThumbnail from "../worker/cutting/FilmThumbnail";

const card = {
  padding: 16,
  border: "1px solid #dbe3ee",
  borderRadius: 14,
  margin: "12px 0",
  background: "#fff",
  overflowWrap: "anywhere",
};

const btn = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "#eff6ff",
  color: "#1e40af",
  fontWeight: 700,
  cursor: "pointer",
};

const input = {
  padding: 10,
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  width: "100%",
  boxSizing: "border-box",
  fontSize: 16,
};

const date = (value) =>
  new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
  });

export default function SiteOperations({
  siteId,
  mode = "notices",
  active = true,
  collapsible = false,
  onTrackingChange,
  onPendingChange,
  onCurrentData,
  onDataChange,
  initialDraft,
  onDraftChange,
  disabled = false,
  reportEditable = false,
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState({});
  const [review, setReview] = useState(null);
  const [trackedRolls, setTrackedRolls] = useState([]);
  const inventoryDetails = useRef(null);
  const [stockSelection, setStockSelection] = useState(null);
  const [historyLimit, setHistoryLimit] = useState(3);
  useEffect(() => setHistoryLimit(3), [siteId]);

  const activeRef = useRef(active);
  activeRef.current = active;
  const previousActive = useRef(active);
  const lock = useRef(false);
  const serial = useRef(0);
  const requests = useRef({});
  const returnVersions = useRef({});
  const draftSeed = useRef(initialDraft);
  const dataCallback = useRef(onDataChange);
  const callback = useRef(onTrackingChange);

  dataCallback.current = onDataChange;
  callback.current = onTrackingChange;

  useEffect(() => {
    onDraftChange?.({
      values,
      versions: returnVersions.current,
    });
  }, [values, onDraftChange]);

  useEffect(() => {
    onPendingChange?.(
      busy || Object.keys(values).length > 0
    );
  }, [busy, values, onPendingChange]);

  const call = useCallback(
    async (body) => {
      const { data: auth, error } =
        await supabase.auth.getSession();

      if (error || !auth.session) {
        throw new Error("다시 로그인해주세요.");
      }

      const response = await fetch(
        body
          ? "/api/site-operations"
          : `/api/site-operations?siteId=${encodeURIComponent(siteId)}`,
        {
          method: body ? "POST" : "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${auth.session.access_token}`,
            "Content-Type": "application/json",
          },
          ...(body
            ? {
                body: JSON.stringify({
                  ...body,
                  siteId,
                }),
              }
            : {}),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "요청을 처리하지 못했습니다."
        );
      }

      return result;
    },
    [siteId]
  );

  const refresh = useCallback(async () => {
    if (lock.current || !activeRef.current) return;

    const version = ++serial.current;

    try {
      const result = await call();

      if (version !== serial.current) return;

      setData(result);

      setValues((previous) => {
        const ids = new Set(
          result.materials.map((material) => `flow:${material.id}`)
        );

        const next = Object.fromEntries(
          Object.entries(previous).filter(([key]) => ids.has(key))
        );

        return Object.keys(next).length ===
          Object.keys(previous).length
          ? previous
          : next;
      });

      dataCallback.current?.(result);
      setError("");
      callback.current?.(result.materials.length > 0);
    } catch (error) {
      if (version === serial.current) {
        setError(error.message);
      }
    }
  }, [call]);

  useEffect(() => {
    if (active && !previousActive.current) refresh();
    previousActive.current = active;
  }, [active, refresh]);

  useEffect(() => {
    setData(null);
    setReview(null);

    setValues(
      Object.fromEntries(
        Object.entries(draftSeed.current?.values || {}).filter(
          ([key]) => key.startsWith("flow:")
        )
      )
    );

    requests.current = {};
    returnVersions.current =
      draftSeed.current?.versions || {};

    refresh();

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }, 30000);

    const focus = () => refresh();

    const materialsChanged = (event) => {
      if (event.detail?.siteId === siteId) refresh();
    };

    window.addEventListener("focus", focus);
    window.addEventListener(
      "site-materials-changed",
      materialsChanged
    );

    return () => {
      serial.current++;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      window.removeEventListener(
        "site-materials-changed",
        materialsChanged
      );
    };
  }, [refresh, siteId]);

  async function act(body, clearKey) {
    if (lock.current || disabled) return;

    lock.current = true;
    serial.current++;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await call(body);

      if (body.action === "latest") {
        await onCurrentData?.(result.snapshot);

        setReview({
          eventId: body.eventId,
          ...result,
        });

        return;
      }

      if (body.action === "confirm") setReview(null);

      setData(result);
      dataCallback.current?.(result);
      callback.current?.(result.materials.length > 0);

      if (
        body.action === "outgoing" ||
        body.action === "settle"
      ) {
        setMessage(
          body.action === "outgoing"
            ? "반출량이 저장되었습니다. 작업이 끝나면 반입량을 입력해주세요. 완료보고는 아직 제출되지 않았습니다."
            : "반출·반입량이 저장되었습니다."
        );
      }

      if (clearKey) {
        setValues((previous) => {
          const next = { ...previous };
          delete next[clearKey];
          return next;
        });

        delete requests.current[clearKey];
        delete returnVersions.current[clearKey];
      }
    } catch (error) {
      if (body.action === "confirm") setReview(null);
      setError(error.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function requestId(key, action) {
    if (requests.current[key]?.action !== action) {
      requests.current[key] = {
        action,
        id: crypto.randomUUID(),
      };
    }

    return requests.current[key].id;
  }

  const handleTrackedRolls = useCallback((ids) => {
    setTrackedRolls(ids);

    const keys = new Set(ids.map((id) => `flow:${id}`));

    setValues((previous) => {
      if (
        !Object.keys(previous).some((key) => keys.has(key))
      ) {
        return previous;
      }

      return Object.fromEntries(
        Object.entries(previous).filter(
          ([key]) => !keys.has(key)
        )
      );
    });

    for (const key of keys) {
      delete requests.current[key];
      delete returnVersions.current[key];
    }
  }, []);

  const materialsMode = mode === "materials";
  const summaryMode = mode === "summary";
  const History = "details";
  const groups = [];
  const groupMap = new Map();
  for (const event of [...(data?.events || [])].sort((a,b) => new Date(b.at)-new Date(a.at))) {
    // Group only identical messages within the same second. Keep every original receipt.
    const time = new Date(event.at).getTime();
    const key = JSON.stringify([Number.isFinite(time) ? Math.floor(time/1000) : event.id, event.message]);
    let group = groupMap.get(key);
    if (!group) { group = {id:event.id, at:event.at, message:event.message, events:[]}; groupMap.set(key,group); groups.push(group); }
    group.events.push(event);
  }
  const pendingEvents = (data?.events || []).filter(event => event.receipts.some(r => !r.confirmedAt)).length;
  const displayedGroups = data?.owner ? groups : [...groups].sort((a,b) =>
    Number(b.events.some(e => e.receipts.some(r => !r.confirmedAt))) - Number(a.events.some(e => e.receipts.some(r => !r.confirmedAt)))
  );
  const shortMessage = message => message?.startsWith("현장 날짜별 배정이 변경") ? "시공자 배정 변경" : message?.startsWith("시공 일정이 변경") ? "시공 일정 변경" : message?.startsWith("현장 메모·전달사항이 변경") ? "현장 메모 변경" : message;

  return (
    <section style={card}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          alignItems: "center",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 17 }}>
          {materialsMode
            ? "📦 반출 · 반입 · 소모량"
            : summaryMode ? "사용 자재" : "📦 현장 자재 · 변경사항"}
        </h3>

        <button
          type="button"
          style={btn}
          disabled={busy || disabled}
          onClick={refresh}
        >
          새로고침
        </button>
      </div>

      {error && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      )}

      {message && (
        <p role="status" style={{ color: "#166534" }}>
          {message}
        </p>
      )}

      {(materialsMode || summaryMode) && (
        <MaterialIssueStatus
          siteId={siteId}
          refreshKey={data}
          compact={summaryMode}
          active={active}
        />
      )}

      {!summaryMode && <details ref={inventoryDetails} style={{ margin: "16px 0" }}>
        <summary style={{ ...btn, listStyle: "none" }}>
          📦 롤 반출 · 자재 반납 완료
        </summary>

        <FilmRollInventory
          key={siteId}
          siteId={siteId}
          disabled={disabled}
          onTracked={handleTrackedRolls}
          active={active}
          onChanged={refresh}
          selectionRequest={stockSelection}
        />
      </details>}

      {!data ? (
        <p>불러오는 중…</p>
      ) : materialsMode ? (
        <>
          <p style={{ color: "#64748b", fontSize: 13 }}>
            소모량 = 총 반출량 − 남은 자재 반입량.
            재단 손실도 포함됩니다.
          </p>

          {data.locked && (
            <p>
              수동 수량 수정은 잠겨 있습니다.
              이미 반출한 롤은 위 메뉴에서 반납 권한을
              확인하고 처리할 수 있습니다.
            </p>
          )}

          {!data.materials.length && (
            <p>관리자가 사용할 필름을 먼저 등록해주세요.</p>
          )}

          {data.materials.map((material) => {
            const flowKey = `flow:${material.id}`;
            const draft = values[flowKey] || {};

            const outgoing =
              draft.outgoing ??
              (material.returned != null ||
              Number(material.issued) > 0
                ? material.issued
                : "");

            const returned =
              draft.returned ?? material.returned ?? "";

            const outgoingValid =
              String(outgoing).trim() !== "" &&
              Number.isFinite(Number(outgoing)) &&
              Number(outgoing) >= 0 &&
              Number(outgoing) <= 1000000;

            const valid =
              String(outgoing).trim() !== "" &&
              String(returned).trim() !== "" &&
              Number.isFinite(Number(outgoing)) &&
              Number.isFinite(Number(returned)) &&
              Number(outgoing) >= 0 &&
              Number(outgoing) <= 1000000 &&
              Number(returned) >= 0 &&
              Number(returned) <= Number(outgoing);

            const change = (field, value) => {
              setMessage("");

              returnVersions.current[flowKey] ||= {
                expectedIssued: material.issued,
                returnUpdatedAt: material.returnUpdatedAt,
              };

              delete requests.current[flowKey];

              setValues((previous) => ({
                ...previous,
                [flowKey]: {
                  outgoing,
                  returned,
                  [field]: value,
                },
              }));
            };

            return (
              <div
                key={material.id}
                data-material-id={material.id}
                style={{
                  ...card,
                  background: "#f8fafc",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <FilmThumbnail
                    material={material}
                    size={64}
                  />
                  <strong>
                    {material.brand}{" "}
                    {material.code || material.name}
                    <FilmFireBadge type={material.price_type} />
                  </strong>
                </div>

                <p>
                  반출 {material.issued}
                  {material.unit} · 반입{" "}
                  {material.returned == null
                    ? "미입력"
                    : `${material.returned}${material.unit}`}
                  <br />
                  <b>
                    소모량{" "}
                    {material.used == null
                      ? "미정"
                      : `${material.used}${material.unit}`}
                  </b>
                </p>

                {material.returnUpdatedAt && (
                  <small>
                    수량 저장: {date(material.returnUpdatedAt)}
                  </small>
                )}

                {data.owner &&
                  Number(material.used) > 0 &&
                  material.unitPrice == null && (
                    <p style={{ color: "#b91c1c" }}>
                      사용 필름의 원가 단가 관리에서
                      단가를 입력해주세요.
                    </p>
                  )}

                {reportEditable &&
                  !trackedRolls.includes(material.id) &&
                  !data.locked &&
                  data.canReturn && (
                    <div style={{ marginTop: 12 }}>
                      {data.owner && (
                        <div style={{ marginBottom: 16 }}>
                          <button type="button" style={btn} disabled={disabled || busy}
                            onClick={() => {
                              setStockSelection({ materialId: material.id });
                              if (inventoryDetails.current) {
                                inventoryDetails.current.open = true;
                                inventoryDetails.current.scrollIntoView({ behavior: "smooth", block: "start" });
                              }
                            }}>
                            창고 재고에서 선택
                          </button>
                          <p style={{ fontSize: 13, color: "#64748b" }}>
                            가져간 롤을 선택하면 반출량이 자동 합산됩니다. 반출 완료를 누르면 창고 재고와 현장 물량에 함께 반영됩니다.
                          </p>
                        </div>
                      )}
                      <p>
                        일 시작 전에는 총 반출량만 먼저 저장하세요.
                        작업이 끝나면 남은 총 반입량을 입력하세요.
                        추가로 가져간 자재는 기존 반출량을 포함한
                        총량으로 수정하세요. 사용하지 않은 필름은
                        둘 다 0으로 저장하세요.
                      </p>

                      <label>
                        총 반출량 ({material.unit})
                        <input
                          style={input}
                          type="number"
                          min="0"
                          max="1000000"
                          step="any"
                          aria-label={`${material.code || material.name} 총 반출량`}
                          disabled={busy || disabled}
                          value={outgoing}
                          onChange={(event) =>
                            change(
                              "outgoing",
                              event.target.value
                            )
                          }
                        />
                      </label>

                      <button
                        type="button"
                        style={{
                          ...btn,
                          margin: "10px 0",
                        }}
                        disabled={
                          busy || disabled || !outgoingValid
                        }
                        onClick={() => {
                          if (
                            String(returned).trim() !== "" &&
                            !confirm(
                              "반출량만 저장합니다. 입력 중인 반입량은 저장하지 않으며, 반출량이 바뀌면 기존 반입량도 다시 입력해야 합니다. 계속할까요?"
                            )
                          ) {
                            return;
                          }

                          act(
                            {
                              action: "outgoing",
                              materialId: material.id,
                              outgoing,
                              requestId: requestId(
                                flowKey,
                                "outgoing"
                              ),
                              ...(returnVersions.current[
                                flowKey
                              ] || {
                                expectedIssued: material.issued,
                                returnUpdatedAt:
                                  material.returnUpdatedAt,
                              }),
                            },
                            flowKey
                          );
                        }}
                      >
                        반출량만 저장
                      </button>

                      <p
                        style={{
                          fontSize: 12,
                          color: "#64748b",
                        }}
                      >
                        반입량·완료사진·시공 내용을 아직
                        입력하지 않아도 반출량만 저장할 수 있습니다.
                      </p>

                      <label>
                        총 반입량 ({material.unit})
                        <input
                          style={input}
                          type="number"
                          min="0"
                          max={outgoing || 0}
                          step="any"
                          aria-label={`${material.code || material.name} 총 반입량`}
                          disabled={busy || disabled}
                          value={returned}
                          onChange={(event) =>
                            change(
                              "returned",
                              event.target.value
                            )
                          }
                        />
                      </label>

                      <p>
                        소모량:{" "}
                        {valid
                          ? `${Number(outgoing) - Number(returned)}${material.unit}`
                          : "수량을 확인해주세요"}
                      </p>

                      <button
                        type="button"
                        style={btn}
                        disabled={busy || disabled || !valid}
                        onClick={() =>
                          act(
                            {
                              action: "settle",
                              materialId: material.id,
                              outgoing,
                              returned,
                              requestId: requestId(
                                flowKey,
                                "settle"
                              ),
                              ...(returnVersions.current[
                                flowKey
                              ] || {
                                expectedIssued: material.issued,
                                returnUpdatedAt:
                                  material.returnUpdatedAt,
                              }),
                            },
                            flowKey
                          )
                        }
                      >
                        반출·반입량 저장
                      </button>

                      {values[flowKey] && (
                        <button
                          type="button"
                          style={btn}
                          disabled={busy || disabled}
                          onClick={() => {
                            delete returnVersions.current[
                              flowKey
                            ];
                            delete requests.current[flowKey];

                            setValues((previous) => {
                              const next = { ...previous };
                              delete next[flowKey];
                              return next;
                            });

                            refresh();
                          }}
                        >
                          저장값으로 되돌리기
                        </button>
                      )}
                    </div>
                  )}

                {trackedRolls.includes(material.id) && (
                  <p>
                    이 자재는 위의 롤 재고에서 반출·반입을
                    처리합니다.
                  </p>
                )}

                {!reportEditable && (
                  <p>반출·반입량은 시공 보고서에서 입력합니다.</p>
                )}

                <details style={{ marginTop: 12 }}>
                  <summary>반입량 수정 이력</summary>
                  <small>
                    최근 이력 100건 중 이 자재의 기록입니다.
                  </small>

                  {(data.returnHistory || [])
                    .filter(
                      (row) => row.materialId === material.id
                    )
                    .map((row) => (
                      <p key={row.id}>
                        {date(row.at)} · {row.name}
                        <br />
                        {row.before == null
                          ? "미입력"
                          : `${row.before}${material.unit}`}
                        {" → "}
                        {row.after == null
                          ? "재확인 필요"
                          : `${row.after}${material.unit}`}
                        <br />
                        <small>{row.reason}</small>
                      </p>
                    ))}
                </details>

                <details style={{ marginTop: 12 }}>
                  <summary>반출 이력</summary>

                  {data.issues
                    .filter(
                      (issue) =>
                        issue.materialId === material.id
                    )
                    .map((issue) => (
                      <p key={issue.id}>
                        {date(issue.at)} · {issue.quantity}
                        {material.unit}{" "}
                        {issue.voided ? "(취소됨)" : ""}
                      </p>
                    ))}
                </details>
              </div>
            );
          })}
        </>
      ) : (
        <>
          <div
            style={{
              ...(summaryMode ? {} : card),
              background: summaryMode ? "transparent" : "#f8fafc",
            }}
          >
            {!summaryMode && <strong>현장 사용 필름</strong>}

            <p
              style={{
                fontSize: 12,
                color: "#64748b",
              }}
            >
              {summaryMode ? "추가·변경은 자재 탭에서 할 수 있습니다." : "전체 반출량에서 반입량을 뺀 사용량입니다."}
            </p>

            {!data.materials.length && (
              <p>등록된 사용 필름이 없습니다.</p>
            )}

            {data.materials.map((material) => (
              <div
                key={material.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginTop: 12,
                }}
              >
                {!summaryMode && <FilmThumbnail
                  material={material}
                  size={72}
                />}

                <div>
                  <strong>
                    {material.brand}{" "}
                    {material.code || material.name}
                    <FilmFireBadge type={material.price_type} />
                  </strong>

                  <p style={{ margin: "6px 0", fontSize: 14, fontWeight: 700, color: "#475569" }}>
                    {material.used == null
                      ? "사용량 · 반입 확인 필요"
                      : `사용량 ${Number(material.used).toLocaleString("ko-KR", { maximumFractionDigits: 3 })}${material.unit}`}
                  </p>

                  {!summaryMode && material.name && (
                    <p
                      style={{
                        margin: "4px 0",
                        fontSize: 13,
                      }}
                    >
                      {material.name}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <History style={{ marginTop: 16 }}>
      {(
        <summary style={{ cursor: "pointer", padding: "12px 0", fontWeight: 700, color: "#243648" }}>
          변경 이력 · {groups.length}개 항목
          {pendingEvents > 0 && (
            <span style={{ marginLeft: 8, color: "#a16207", fontSize: 13 }}>미확인 {pendingEvents}건</span>
          )}
        </summary>
      )}

          {!data.events.length && (
            <p>확인할 변경사항이 없습니다.</p>
          )}

          <p style={{fontSize:12,color:"#64748b"}}>최근 기록 최대 100건 기준 · 동일 시각·내용은 묶어서 표시합니다.{!data.owner && " 미확인 기록을 먼저 표시합니다."}</p>
          {displayedGroups.slice(0, historyLimit).map(group => (
            <details key={group.id} style={{borderTop:"1px solid #e2e8f0",padding:"12px 0"}}>
              <summary style={{cursor:"pointer",lineHeight:1.6}}>
                <small style={{color:"#64748b"}}>{date(group.at)}</small><br />
                <strong>{shortMessage(group.message)}</strong>
                <span style={{display:"block",fontSize:13,color:"#64748b"}}>
                  {group.events.length > 1 ? `관련 기록 ${group.events.length}건 · 미확인 ${group.events.filter(e => e.receipts.some(r => !r.confirmedAt)).length}건` : data.owner ? `확인 ${group.events[0].receipts.filter(r => r.confirmedAt).length}/${group.events[0].receipts.length}명` : group.events[0].receipts.some(r => !r.confirmedAt) ? "확인 필요" : "확인 완료"} · 상세 보기
                </span>
              </summary>
          {group.events.map((event) => (
            <div
              key={event.id}
              style={{
                ...card,
                background: event.receipts.some(
                  (receipt) => !receipt.confirmedAt
                )
                  ? "#fffbeb"
                  : "#f8fafc",
              }}
            >
              <small>{date(event.at)}</small>
              <p>{event.message}</p>

              {data.owner ? (
                <>
                  <b>
                    확인{" "}
                    {
                      event.receipts.filter(
                        (receipt) => receipt.confirmedAt
                      ).length
                    }
                    {" / "}
                    {event.receipts.length}명
                  </b>

                  <details style={{marginTop:8}}>
                    <summary style={{cursor:"pointer",fontSize:13}}>확인 현황 보기</summary>
                    <p style={{fontSize:13,lineHeight:1.6}}>미확인: {event.receipts.filter(r => !r.confirmedAt).map(r => r.name).join(", ") || "없음"}</p>
                  {event.receipts.filter(receipt => receipt.confirmedAt).map((receipt, index) => (
                    <p key={index}>
                      {receipt.name}:{" "}
                      {receipt.confirmedAt
                        ? `확인 · ${date(receipt.confirmedAt)}`
                        : "미확인"}
                    </p>
                  ))}
                  </details>
                </>
              ) : event.receipts.every(
                  (receipt) => receipt.confirmedAt
                ) ? (
                <b>확인 완료</b>
              ) : (
                <div>
                  <button
                    type="button"
                    style={btn}
                    disabled={busy || disabled}
                    onClick={() =>
                      act({
                        action: "latest",
                        eventId: event.id,
                      })
                    }
                  >
                    최신 내용 보기
                  </button>

                  {review?.eventId === event.id && (
                    <div
                      style={{
                        ...card,
                        background: "#fff",
                      }}
                    >
                      <strong>현재 저장된 현장정보</strong>
                      <p>{review.snapshot.site.site_name}</p>

                      <p>
                        일정:{" "}
                        {(
                          review.snapshot.site.work_dates || []
                        ).join(", ") ||
                          review.snapshot.site.schedule_date ||
                          (review.snapshot.site.schedule_start
                            ? date(
                                review.snapshot.site
                                  .schedule_start
                              )
                            : "미정")}
                        {review.snapshot.site.schedule_end
                          ? ` ~ ${date(review.snapshot.site.schedule_end)}`
                          : ""}
                      </p>

                      <p style={{ whiteSpace: "pre-wrap" }}>
                        작업 내용:{" "}
                        {review.snapshot.site
                          .work_description ||
                          review.snapshot.site.work_type ||
                          "없음"}
                      </p>

                      <p style={{ whiteSpace: "pre-wrap" }}>
                        현장 메모:{" "}
                        {review.snapshot.site.memo || "없음"}
                      </p>

                      {review.snapshot.assignments.map(
                        (row, index) => (
                          <p key={index}>
                            {row.date} · {row.name} ·{" "}
                            {row.role === "leader"
                              ? "팀장"
                              : "팀원"}
                          </p>
                        )
                      )}

                      <strong>현재 사용 필름</strong>

                      {!review.snapshot.materials.length && (
                        <p>등록된 자재 없음</p>
                      )}

                      {review.snapshot.materials.map(
                        (row) => (
                          <div
                            key={row.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              marginTop: 12,
                            }}
                          >
                            <FilmThumbnail
                              material={row}
                              size={64}
                            />

                            <p
                              style={{
                                whiteSpace: "pre-wrap",
                              }}
                            >
                              {row.brand}{" "}
                              {row.code || row.name} · {row.unit}
                              <FilmFireBadge type={row.price_type} />
                              <br />
                              {row.memo || ""}
                            </p>
                          </div>
                        )
                      )}

                      <button
                        type="button"
                        style={btn}
                        disabled={busy || disabled}
                        onClick={() =>
                          act({
                            action: "confirm",
                            eventId: event.id,
                            reviewVersion: review.version,
                          })
                        }
                      >
                        최신 내용을 확인했습니다
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
            </details>
          ))}
          {historyLimit < displayedGroups.length && <button type="button" style={{...btn,width:"100%",marginTop:12}} onClick={() => setHistoryLimit(n => n+3)}>이전 내역 더 보기 ({displayedGroups.length-historyLimit})</button>}
          </History>
        </>
      )}
    </section>
  );
                         }


