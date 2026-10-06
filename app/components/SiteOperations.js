"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { supabase } from "../../lib/supabase";

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
  onTrackingChange,
  onPendingChange,
  disabled = false,
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState({});

  useEffect(() => {
    onPendingChange?.(
      busy || Object.keys(values).length > 0
    );
  }, [busy, values, onPendingChange]);

  const lock = useRef(false);
  const serial = useRef(0);
  const requests = useRef({});
  const returnVersions = useRef({});
  const callback = useRef(onTrackingChange);
  callback.current = onTrackingChange;

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
            ? { body: JSON.stringify({ ...body, siteId }) }
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
    if (lock.current) return;

    const version = ++serial.current;

    try {
      const result = await call();

      if (version !== serial.current) return;

      setData(result);
      setError("");

      callback.current?.(
        result.materials.some((material) => material.issued > 0)
      );
    } catch (error) {
      if (version === serial.current) {
        setError(error.message);
      }
    }
  }, [call]);

  useEffect(() => {
    setData(null);
    setValues({});
    requests.current = {};
    returnVersions.current = {};

    refresh();

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }, 30000);

    const focus = () => refresh();
    window.addEventListener("focus", focus);

    return () => {
      serial.current++;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);

  async function act(body, clearKey) {
    if (lock.current || disabled) return;

    lock.current = true;
    serial.current++;
    setBusy(true);
    setError("");

    try {
      const result = await call(body);

      setData(result);

      callback.current?.(
        result.materials.some((material) => material.issued > 0)
      );

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
      setError(error.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const materialsMode = mode === "materials";

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
            : "🔔 변경사항 확인"}
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
              보고서 제출·승인 또는 현장 취소로
              수량이 잠겨 있습니다.
            </p>
          )}

          {!data.materials.length && (
            <p>관리자가 예정 자재를 먼저 등록해주세요.</p>
          )}

          {data.materials.map((material) => {
            const issueKey = `issue:${material.id}`;
            const returnKey = `return:${material.id}`;

            return (
              <div
                key={material.id}
                style={{ ...card, background: "#f8fafc" }}
              >
                <strong>
                  {material.brand}{" "}
                  {material.code || material.name}
                </strong>

                <p>
                  반출 {material.issued}{material.unit}
                  {" · "}
                  반입{" "}
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
                    반입 저장: {date(material.returnUpdatedAt)}
                  </small>
                )}

                {data.owner &&
                  material.issued > 0 &&
                  material.unitPrice == null && (
                    <p style={{ color: "#b91c1c" }}>
                      예정 자재 수정에서 원가 단가를 입력해주세요.
                    </p>
                  )}

                {!data.locked && data.owner && (
                  <div style={{ marginTop: 12 }}>
                    <label>
                      추가 반출량 ({material.unit})

                      <input
                        aria-label={`${
                          material.code || material.name
                        } 추가 반출량`}
                        style={input}
                        type="number"
                        min="0.001"
                        step="any"
                        disabled={busy || disabled}
                        value={values[issueKey] ?? ""}
                        onChange={(event) => {
                          setValues({
                            ...values,
                            [issueKey]: event.target.value,
                          });
                          delete requests.current[issueKey];
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      style={btn}
                      disabled={busy || disabled}
                      onClick={() => {
                        requests.current[issueKey] ||=
                          crypto.randomUUID();

                        act(
                          {
                            action: "issue",
                            materialId: material.id,
                            quantity: values[issueKey],
                            requestId: requests.current[issueKey],
                          },
                          issueKey
                        );
                      }}
                    >
                      반출 등록
                    </button>
                  </div>
                )}

                {!data.locked &&
                  data.canReturn &&
                  material.issued > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <label>
                        최종 반입량 ({material.unit})

                        <input
                          aria-label={`${
                            material.code || material.name
                          } 최종 반입량`}
                          style={input}
                          type="number"
                          min="0"
                          max={material.issued}
                          step="any"
                          disabled={busy || disabled}
                          placeholder="남은 자재가 없으면 0"
                          value={
                            values[returnKey] ??
                            material.returned ??
                            ""
                          }
                          onChange={(event) => {
                            returnVersions.current[returnKey] ||= {
                              issued: material.issued,
                              returnUpdatedAt: material.returnUpdatedAt,
                            };

                            setValues({
                              ...values,
                              [returnKey]: event.target.value,
                            });
                          }}
                        />
                      </label>

                      <button
                        type="button"
                        style={btn}
                        disabled={busy || disabled}
                        onClick={() =>
                          act(
                            {
                              action: "return",
                              materialId: material.id,
                              quantity:
                                values[returnKey] ??
                                material.returned ??
                                "",
                              ...(
                                returnVersions.current[returnKey] || {
                                  issued: material.issued,
                                  returnUpdatedAt:
                                    material.returnUpdatedAt,
                                }
                              ),
                            },
                            returnKey
                          )
                        }
                      >
                        반입량 저장
                      </button>
                    </div>
                  )}

                <details style={{ marginTop: 12 }}>
                  <summary>반출 이력</summary>

                  {data.issues
                    .filter((issue) => issue.materialId === material.id)
                    .map((issue) => (
                      <p key={issue.id}>
                        {date(issue.at)}
                        {" · "}
                        {issue.quantity}{material.unit}
                        {" "}
                        {issue.voided ? "(취소됨)" : ""}

                        {data.owner &&
                          !data.locked &&
                          !issue.voided && (
                            <button
                              type="button"
                              style={btn}
                              disabled={busy || disabled}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "이 반출 기록을 취소할까요? 반입량은 다시 입력해야 합니다."
                                  )
                                ) {
                                  act({
                                    action: "void",
                                    materialId: material.id,
                                    issueId: issue.id,
                                  });
                                }
                              }}
                            >
                              반출 취소
                            </button>
                          )}
                      </p>
                    ))}
                </details>
              </div>
            );
          })}
        </>
      ) : (
        <>
          <p style={{ color: "#64748b", fontSize: 13 }}>
            최근 변경사항 최대 100건입니다.
            내용을 확인한 뒤 확인 버튼을 눌러주세요.
          </p>

          {!data.events.length && (
            <p>확인할 변경사항이 없습니다.</p>
          )}

          {data.events.map((event) => (
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

                  {event.receipts.map((receipt, index) => (
                    <p key={index}>
                      {receipt.name}:{" "}
                      {receipt.confirmedAt
                        ? `확인 · ${date(receipt.confirmedAt)}`
                        : "미확인"}
                    </p>
                  ))}
                </>
              ) : event.receipts.every(
                  (receipt) => receipt.confirmedAt
                ) ? (
                <b>확인 완료</b>
              ) : (
                <button
                  type="button"
                  style={btn}
                  disabled={busy || disabled}
                  onClick={() =>
                    act({
                      action: "confirm",
                      eventId: event.id,
                    })
                  }
                >
                  확인했습니다
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  );
                  }
