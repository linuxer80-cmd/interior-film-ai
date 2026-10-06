"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { supabase } from "../../lib/supabase";

const TYPES = {
  meal: "식비",
  parking: "주차비",
  fuel: "유류비",
  toll: "통행료",
  other: "기타 경비",
};

const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const initial = () => ({
  expense_type: "meal",
  expense_date: today(),
  amount: "",
  description: "",
});

const box = {
  marginTop: 14,
  padding: 16,
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
};

const input = {
  boxSizing: "border-box",
  width: "100%",
  minWidth: 0,
  minHeight: 44,
  marginTop: 6,
  padding: 10,
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  background: "#fff",
  color: "#172b45",
  fontSize: 16,
};

const button = {
  minHeight: 44,
  padding: "10px 14px",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  background: "#fff",
  cursor: "pointer",
  fontWeight: 700,
};

const won = (value) =>
  Number(value || 0).toLocaleString("ko-KR") + "원";

async function api(siteId, method = "GET", body) {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data?.session?.access_token) {
    throw new Error("다시 로그인해주세요.");
  }

  const response = await fetch(
    `/api/site-expenses?siteId=${encodeURIComponent(siteId)}`,
    {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json",
      },
      ...(body
        ? { body: JSON.stringify({ ...body, siteId }) }
        : {}),
    }
  );

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(
      result.error || "경비를 처리하지 못했습니다."
    );
  }

  return result;
}

export default function SiteExpenses({ siteId, onSaved }) {
  const [form, setForm] = useState(initial);
  const [items, setItems] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const requestId = useRef(null);
  const locking = useRef(false);
  const version = useRef(0);

  const load = useCallback(async () => {
    const current = ++version.current;

    setLoading(true);
    setError("");

    try {
      const result = await api(siteId);

      if (current !== version.current) return;

      setItems(result.expenses);
      setIsAdmin(result.isAdmin);
      setCanWrite(result.canWrite);
    } catch (err) {
      if (current === version.current) {
        setError(err.message);
        setCanWrite(false);
      }
    } finally {
      if (current === version.current) {
        setLoading(false);
      }
    }
  }, [siteId]);

  useEffect(() => {
    setItems([]);
    setForm(initial());
    setNotice("");
    setCanWrite(false);
    requestId.current = null;

    void load();

    return () => {
      version.current += 1;
    };
  }, [load]);

  function change(key, value) {
    if (locking.current) return;

    requestId.current = null;

    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));

    setNotice("");
  }

  async function save(event) {
    event.preventDefault();

    if (locking.current || !canWrite) return;

    locking.current = true;
    setBusy(true);
    setError("");
    setNotice("");

    const current = version.current;

    try {
      requestId.current ||= crypto.randomUUID();

      const result = await api(siteId, "POST", {
        ...form,
        id: requestId.current,
      });

      if (current !== version.current) return;

      setItems((previous) => [
        result.expense,
        ...previous.filter(
          (row) => row.id !== result.expense.id
        ),
      ]);

      setForm((previous) => ({
        ...previous,
        amount: "",
        description: "",
      }));

      requestId.current = null;
      setNotice("경비를 저장했습니다.");

      Promise.resolve(onSaved?.()).catch(() => {});
    } catch (err) {
      if (current === version.current) {
        setError(err.message);
      }
    } finally {
      locking.current = false;
      setBusy(false);
    }
  }

  async function remove(row) {
    if (
      locking.current ||
      !canWrite ||
      !window.confirm(
        `${row.expense_date} ${won(row.amount)} 경비를 삭제할까요?`
      )
    ) {
      return;
    }

    locking.current = true;
    setBusy(true);
    setError("");
    setNotice("");

    const current = version.current;

    try {
      await api(siteId, "DELETE", { id: row.id });

      if (current !== version.current) return;

      setItems((previous) =>
        previous.filter((item) => item.id !== row.id)
      );

      setNotice("경비를 삭제했습니다.");

      Promise.resolve(onSaved?.()).catch(() => {});
    } catch (err) {
      if (current === version.current) {
        setError(err.message);
      }
    } finally {
      locking.current = false;
      setBusy(false);
    }
  }

  const groups = items.reduce((result, row) => {
    (result[row.expense_date] ||= []).push(row);
    return result;
  }, {});

  return (
    <section style={box} aria-label="현장 경비">
      <h3 style={{ margin: "0 0 8px" }}>
        경비 추가
      </h3>

      <p
        style={{
          color: "#64748b",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        점심 식비와 주차비를 사용한 날짜에 맞춰 저장하세요.
        완료보고 없이 바로 저장됩니다.
        이미 저장한 경비는 완료보고에 다시 입력하지 마세요.
      </p>

      {loading && (
        <p role="status">
          경비를 불러오고 있습니다…
        </p>
      )}

      {error && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      )}

      {notice && (
        <p role="status" style={{ color: "#15803d" }}>
          {notice}
        </p>
      )}

      {!loading && !canWrite && !error && (
        <p>
          취소된 현장입니다. 기존 내역만 확인할 수 있습니다.
        </p>
      )}

      <form onSubmit={save}>
        <fieldset
          disabled={busy || loading || !canWrite}
          style={{
            border: 0,
            padding: 0,
            margin: 0,
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(2, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <label>
              사용일
              <input
                style={input}
                type="date"
                required
                max={today()}
                value={form.expense_date}
                onChange={(event) =>
                  change(
                    "expense_date",
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              구분
              <select
                style={input}
                value={form.expense_type}
                onChange={(event) =>
                  change(
                    "expense_type",
                    event.target.value
                  )
                }
              >
                {Object.entries(TYPES).map(
                  ([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  )
                )}
              </select>
            </label>
          </div>

          <label
            style={{
              display: "block",
              marginTop: 12,
            }}
          >
            금액(원)
            <input
              style={input}
              type="text"
              inputMode="numeric"
              pattern="[0-9]+"
              required
              placeholder="예: 12000"
              value={form.amount}
              onChange={(event) =>
                change(
                  "amount",
                  event.target.value.replace(
                    /[^0-9]/g,
                    ""
                  )
                )
              }
            />
          </label>

          <label
            style={{
              display: "block",
              marginTop: 12,
            }}
          >
            내용(선택)
            <input
              style={input}
              maxLength={200}
              placeholder="예: 점심 2인 / 현장 주차 3시간"
              value={form.description}
              onChange={(event) =>
                change(
                  "description",
                  event.target.value
                )
              }
            />
          </label>

          <button
            style={{
              ...button,
              width: "100%",
              marginTop: 14,
              background: "#1d4ed8",
              color: "#fff",
            }}
            type="submit"
          >
            {busy ? "처리 중…" : "경비 저장"}
          </button>
        </fieldset>
      </form>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginTop: 24,
        }}
      >
        <h4 style={{ margin: 0 }}>
          {isAdmin
            ? "현장 추가 경비"
            : "내가 등록한 경비"}
        </h4>

        <button
          type="button"
          style={button}
          disabled={busy || loading}
          onClick={load}
        >
          새로고침
        </button>
      </div>

      <p
        style={{
          color: "#64748b",
          fontSize: 12,
        }}
      >
        완료보고와 별도로 저장한 경비입니다.
      </p>

      <strong>
        합계{" "}
        {won(
          items.reduce(
            (sum, row) => sum + row.amount,
            0
          )
        )}
      </strong>

      {!loading && !error && !items.length && (
        <p>아직 등록된 경비가 없습니다.</p>
      )}

      {Object.keys(groups)
        .sort()
        .reverse()
        .map((date) => (
          <div
            key={date}
            style={{ marginTop: 18 }}
          >
            <h4
              style={{
                margin: "0 0 8px",
                fontSize: 14,
              }}
            >
              {date} ·{" "}
              {won(
                groups[date].reduce(
                  (sum, row) => sum + row.amount,
                  0
                )
              )}
            </h4>

            {groups[date].map((row) => (
              <div
                key={row.id}
                style={{
                  padding: "12px 0",
                  borderTop: "1px solid #e2e8f0",
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <strong>
                    {TYPES[row.expense_type] || "경비"}
                    {" · "}
                    {won(row.amount)}
                  </strong>

                  <p
                    style={{
                      margin: "5px 0 0",
                      color: "#64748b",
                      fontSize: 13,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {row.description}
                    {isAdmin
                      ? row.mine
                        ? " · 내가 등록"
                        : " · 다른 사용자가 등록"
                      : ""}
                  </p>
                </div>

                {canWrite &&
                  (isAdmin || row.mine) && (
                    <button
                      type="button"
                      style={{
                        ...button,
                        color: "#b91c1c",
                      }}
                      disabled={busy || loading}
                      onClick={() => remove(row)}
                      aria-label={`${date} ${row.description} 경비 삭제`}
                    >
                      삭제
                    </button>
                  )}
              </div>
            ))}
          </div>
        ))}
    </section>
  );
}
