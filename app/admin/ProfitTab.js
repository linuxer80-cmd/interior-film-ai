"use client";

import LaborPayments from "./LaborPayments";
import LaborCostSettings from "./LaborCostSettings";
import ToolIllustration from "../components/ui/ToolIllustration";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

const won = (value) =>
  `${Number(value || 0).toLocaleString("ko-KR")}원`;

const today = () => {
  const date = new Date();

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1,
  ).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
};

const monthStart = () => `${today().slice(0, 7)}-01`;

const kinds = {
  labor: "시공자 인건비",
  material: "추가 자재비",
  expense: "기타 경비",
};

const costLabels = kinds;

const colors = {
  labor: "#2563eb",
  material: "#7c3aed",
  expense: "#ea580c",
};

const MENUS = [
  { id: "summary", label: "요약", kind: "report" },
  { id: "cost", label: "비용분석", kind: "money" },
  { id: "sites", label: "현장별 수익", kind: "home" },
  { id: "payments", label: "인건비 지급", kind: "money" },
];

const group = (rows, key) =>
  Object.entries(
    (rows || []).reduce((map, row) => {
      const label = row[key] || "미분류";

      if (!map[label]) {
        map[label] = { amount: 0, rows: [] };
      }

      map[label].amount += Number(row.amount || 0);
      map[label].rows.push(row);
      return map;
    }, {}),
  )
    .map(([label, value]) => ({ label, ...value }))
    .sort((a, b) => b.amount - a.amount);

function Breakdown({ data, type, title, itemKey }) {
  const [open, setOpen] = useState("");
  const [productOpen, setProductOpen] = useState("");

  const list = group(data.breakdown?.[type], itemKey);
  const total = Number(data.totals[type] || 0);

  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 22,
        padding: 16,
        boxShadow: "var(--film-shadow)",
      }}
    >
      <h3 style={{ margin: "0 0 4px" }}>{title}</h3>

      <strong style={{ color: colors[type], fontSize: 20 }}>
        {won(total)}
      </strong>

      {!list.length && (
        <p style={{ color: "#64748b", fontSize: 13 }}>
          등록된 비용이 없습니다.
        </p>
      )}

      <div
        style={{
          display: "grid",
          gap: 9,
          marginTop: 12,
        }}
      >
        {list.map((entry) => (
          <div key={entry.label}>
            <button
              type="button"
              aria-expanded={open === entry.label}
              onClick={() => {
                setOpen(open === entry.label ? "" : entry.label);
                setProductOpen("");
              }}
              style={{
                display: "flex",
                width: "100%",
                minHeight: 44,
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                border: 0,
                background: "transparent",
                textAlign: "left",
                padding: "4px 0",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              <span>
                {entry.label}{" "}
                <small>({entry.rows.length}건)</small>
              </span>

              <strong>
                {won(entry.amount)}{" "}
                {open === entry.label ? "⌃" : "⌄"}
              </strong>
            </button>

            <div
              role="img"
              aria-label={`${entry.label} ${won(
                entry.amount,
              )}, 전체 ${title}의 ${
                total
                  ? Math.round((entry.amount / total) * 100)
                  : 0
              }%`}
              style={{
                height: 10,
                borderRadius: 10,
                background: "#f1f5f9",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${
                    total
                      ? Math.min(100, (entry.amount / total) * 100)
                      : 0
                  }%`,
                  background: colors[type],
                  borderRadius: 10,
                }}
              />
            </div>

            {open === entry.label && (
              <div
                style={{
                  padding: "8px 4px 8px 12px",
                  borderLeft: `3px solid ${colors[type]}`,
                  fontSize: 13,
                }}
              >
                {type === "material"
                  ? group(entry.rows, "product").map((product) => (
                      <div
                        key={product.label}
                        style={{
                          padding: "5px 0",
                          borderBottom: "1px solid #f1f5f9",
                        }}
                      >
                        <button
                          type="button"
                          aria-expanded={
                            productOpen === product.label
                          }
                          onClick={() =>
                            setProductOpen(
                              productOpen === product.label
                                ? ""
                                : product.label,
                            )
                          }
                          style={{
                            width: "100%",
                            minHeight: 44,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            border: 0,
                            padding: 0,
                            background: "transparent",
                            textAlign: "left",
                            cursor: "pointer",
                          }}
                        >
                          <span>
                            {product.label} ({product.rows.length}건)
                          </span>

                          <strong>
                            {won(product.amount)}{" "}
                            {productOpen === product.label
                              ? "⌃"
                              : "⌄"}
                          </strong>
                        </button>

                        {productOpen === product.label &&
                          product.rows.map((row, index) => (
                            <div
                              key={index}
                              style={{
                                padding: "5px 0 0 10px",
                                color: "#475569",
                              }}
                            >
                              {row.siteName} ·{" "}
                              {row.quantity == null
                                ? "수기 입력"
                                : `${row.quantity.toLocaleString(
                                    "ko-KR",
                                  )}${row.unit}`}{" "}
                              · {won(row.amount)}
                            </div>
                          ))}
                      </div>
                    ))
                  : entry.rows.map((row, index) => (
                      <div
                        key={index}
                        style={{
                          padding: "5px 0",
                          borderBottom: "1px solid #f1f5f9",
                          color: "#475569",
                        }}
                      >
                        {row.siteName} · {row.description} ·{" "}
                        {won(row.amount)}
                      </div>
                    ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function profitView(source, excludedWorkerIds) {
  if (!source || !excludedWorkerIds.length) return source;

  const ownerIds = new Set(excludedWorkerIds);
  if (!ownerIds.size) return source;

  const sites = source.sites.map((site) => {
    const excluded = (source.breakdown.labor || [])
      .filter((row) => row.siteId === site.id)
      .reduce(
        (sum, row) =>
          sum +
          (ownerIds.has(row.workerId)
            ? Number(row.amount) || 0
            : 0),
        0,
      );

    return {
      ...site,
      excludedOwnerLabor: excluded,
      labor: site.labor - excluded,
      profit: site.profit + excluded,
    };
  });

  const excluded = sites.reduce(
    (sum, site) => sum + site.excludedOwnerLabor,
    0,
  );

  return {
    ...source,
    sites,
    excludedOwnerLabor: excluded,
    totals: {
      ...source.totals,
      labor: source.totals.labor - excluded,
      profit: source.totals.profit + excluded,
    },
    breakdown: {
      ...source.breakdown,
      labor: source.breakdown.labor.filter(
        (row) => !ownerIds.has(row.workerId),
      ),
    },
  };
}

export default function ProfitTab() {
  const [view, setView] = useState("summary");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [rawData, setData] = useState(null);

  const [excludedWorkerIds, setExcludedWorkerIds] = useState([]);
  const [exclusionStorageKey, setExclusionStorageKey] =
    useState("");
  const [exclusionMessage, setExclusionMessage] = useState("");

  useEffect(() => {
    let active = true;
    let authChanged = false;

    function restore(session) {
      if (!active) return;

      setExcludedWorkerIds([]);
      setExclusionStorageKey("");
      setExclusionMessage("");

      if (!session?.user?.id) return;

      const key =
        `filmjang:profit-exclusions:v1:${session.user.id}`;

      try {
        const stored = window.localStorage.getItem(key);
        const parsed = stored ? JSON.parse(stored) : [];

        if (
          !Array.isArray(parsed) ||
          parsed.some((id) => typeof id !== "string")
        ) {
          throw new Error("invalid preferences");
        }

        setExcludedWorkerIds([...new Set(parsed)]);
        setExclusionStorageKey(key);

        if (stored) {
          setExclusionMessage(
            "저장된 제외 설정을 불러왔습니다.",
          );
        }
      } catch {
        setExclusionStorageKey(key);
        setExclusionMessage(
          "제외 설정을 불러오지 못했습니다. 다시 선택해주세요.",
        );
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        return;
      }

      authChanged = true;
      restore(session);
    });

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active || authChanged) return;

        if (error) {
          setExclusionMessage(
            "계정 확인에 실패했습니다. 새로고침해주세요.",
          );
          return;
        }

        restore(data.session);
      })
      .catch(() => {
        if (active && !authChanged) {
          setExclusionMessage(
            "계정 확인에 실패했습니다. 새로고침해주세요.",
          );
        }
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  function changeExcludedWorker(workerId, checked) {
    if (!exclusionStorageKey) return;

    const next = checked
      ? [...new Set([...excludedWorkerIds, workerId])]
      : excludedWorkerIds.filter((id) => id !== workerId);

    try {
      window.localStorage.setItem(
        exclusionStorageKey,
        JSON.stringify(next),
      );

      setExcludedWorkerIds(next);
      setExclusionMessage("제외 설정을 저장했습니다.");
    } catch {
      setExclusionMessage(
        "저장하지 못해 선택을 변경하지 않았습니다. 브라우저 저장 공간을 확인해주세요.",
      );
    }
  }

  const data = profitView(rawData, excludedWorkerIds);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [kind, setKind] = useState("labor");
  const [worker, setWorker] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function request(method, payload, query = "") {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      throw new Error("관리자로 다시 로그인해주세요.");
    }

    const response = await fetch(`/api/admin/profit${query}`, {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(payload
          ? { "Content-Type": "application/json" }
          : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
      cache: "no-store",
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "요청에 실패했습니다.");
    }

    return result;
  }

  async function load() {
    if (!from || !to || from > to) {
      setError("조회 기간을 확인해주세요.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      setData(
        await request(
          "GET",
          null,
          `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        ),
      );
    } catch (cause) {
      setError(cause.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const current = data?.sites.find(
    (site) => site.id === selected,
  );

  const assigned = (current?.site_workers || [])
    .map((row) => row.workers)
    .filter(Boolean);

  function chooseWorker(id) {
    setWorker(id);

    const person = assigned.find((item) => item.id === id);

    if (person) {
      setDescription(`${person.name} 인건비`);
      setAmount(
        person.daily_wage ? String(person.daily_wage) : "",
      );
    }
  }

  async function save(event) {
    event.preventDefault();
    if (!current) return;

    setSaving(true);
    setError("");

    try {
      await request("POST", {
        siteId: current.id,
        type: kind,
        amount: Number(String(amount).replaceAll(",", "")),
        description,
      });

      setAmount("");
      setDescription("");
      setWorker("");

      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm("이 비용 내역을 삭제하시겠습니까?")) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      await request("DELETE", { id });
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  const card = {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 22,
    padding: 16,
    boxShadow: "var(--film-shadow)",
  };

  const field = {
    width: "100%",
    minHeight: 44,
    padding: 10,
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    boxSizing: "border-box",
    fontSize: 14,
  };

  const laborWorkers = [
    ...new Map(
      (rawData?.breakdown?.labor || [])
        .filter((row) => row.workerId)
        .map((row) => [row.workerId, row]),
    ).values(),
  ];

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div style={card}>
        <h2 style={{ margin: "0 0 8px" }}>📊 현장 수익</h2>

        <p
          style={{
            color: "#475569",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          시공 시작일 기준 계약금액 − 인건비 − 실제 사용
          자재비 − 경비입니다. 계약금액 기준 예상 수익이며
          입금·세금·본사 공통비는 반영하지 않습니다.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "end",
          }}
        >
          <label>
            시작일
            <input
              aria-label="수익 조회 시작일"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              style={field}
            />
          </label>

          <label>
            종료일
            <input
              aria-label="수익 조회 종료일"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              style={field}
            />
          </label>

          <button
            type="button"
            onClick={load}
            disabled={loading}
            style={{
              ...field,
              width: "auto",
              background: "var(--film-blue, #347fec)",
              color: "#fff",
            }}
          >
            {loading ? "조회 중..." : "조회"}
          </button>
        </div>

        <details
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 14,
            background: "#f8fafc",
          }}
        >
          <summary
            style={{ fontWeight: 800, cursor: "pointer" }}
          >
            수익 계산에서 제외할 시공자{" "}
            {excludedWorkerIds.length > 0
              ? `· ${excludedWorkerIds.length}명 선택`
              : "선택"}
          </summary>

          <p
            style={{
              fontSize: 12,
              color: "#64748b",
              lineHeight: 1.6,
            }}
          >
            관리자 본인의 인건비를 빼려면 해당 시공자를
            체크해주세요. 일당·팀장수당을 수익 계산에서만
            제외하며, 급여·보고서 기록은 유지됩니다.
            선택은 이 브라우저에 관리자 계정별로 자동
            저장됩니다.
          </p>

          {exclusionMessage && (
            <p
              role="status"
              style={{ fontSize: 12, color: "#475569" }}
            >
              {exclusionMessage}
            </p>
          )}

          {laborWorkers.map((row) => (
            <label
              key={row.workerId}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                minHeight: 44,
                padding: "8px 0",
              }}
            >
              <input
                type="checkbox"
                checked={excludedWorkerIds.includes(row.workerId)}
                disabled={
                  loading || saving || !exclusionStorageKey
                }
                onChange={(event) =>
                  changeExcludedWorker(
                    row.workerId,
                    event.target.checked,
                  )
                }
              />

              {row.name} ·{" "}
              {won(
                (rawData.breakdown.labor || [])
                  .filter(
                    (item) => item.workerId === row.workerId,
                  )
                  .reduce(
                    (sum, item) =>
                      sum + Number(item.amount || 0),
                    0,
                  ),
              )}
            </label>
          ))}

          {!laborWorkers.length && (
            <p style={{ fontSize: 12, color: "#64748b" }}>
              조회된 시공자별 인건비가 없습니다.
            </p>
          )}

          {excludedWorkerIds.length > 0 && (
            <strong
              style={{
                display: "block",
                marginTop: 8,
                color: "#1d4ed8",
              }}
            >
              제외한 인건비{" "}
              {won(data?.excludedOwnerLabor || 0)}
            </strong>
          )}

          <p style={{ fontSize: 12, color: "#64748b" }}>
            시공자를 특정하지 않은 현장 인건비는 제외하지
            않습니다.
          </p>
        </details>

        <LaborCostSettings onClose={load} />

        {error && (
          <p role="alert" style={{ color: "#b91c1c" }}>
            ❌ {error}
          </p>
        )}
      </div>

      {data && (
        <>
          <nav
            aria-label="화면 메뉴"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 6,
              padding: "8px 0",
              marginBottom: 12,
            }}
          >
            {MENUS.map((menu) => (
              <button
                key={menu.id}
                type="button"
                aria-pressed={view === menu.id}
                disabled={saving}
                onClick={() => setView(menu.id)}
                style={{
                  minWidth: 0,
                  padding: "12px 8px",
                  borderRadius: 15,
                  border:
                    view === menu.id
                      ? "1px solid #81b4f7"
                      : "1px solid #e2e8f0",
                  background:
                    view === menu.id ? "#edf5ff" : "#fff",
                  color:
                    view === menu.id ? "#1d4ed8" : "#475569",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <ToolIllustration kind={menu.kind} size={34} />
                <span>{menu.label}</span>
              </button>
            ))}
          </nav>

          <div hidden={view !== "summary"}>
            <div
              style={{
                ...card,
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              {[
                ["계약 매출", data.totals.revenue],
                ["인건비", data.totals.labor],
                ["자재비", data.totals.material],
                ["기타 경비", data.totals.expense],
                ["예상 수익", data.totals.profit],
              ].map(([label, value]) => (
                <div key={label}>
                  <div
                    style={{ color: "#64748b", fontSize: 12 }}
                  >
                    {label}
                  </div>

                  <strong
                    style={{
                      color:
                        label === "예상 수익"
                          ? Number(value) < 0
                            ? "#b91c1c"
                            : "#166534"
                          : "#182c47",
                    }}
                  >
                    {won(value)}
                  </strong>
                </div>
              ))}
            </div>

            <div style={{ ...card, marginTop: 14 }}>
              <h3 style={{ margin: "0 0 10px" }}>비용 구성</h3>

              {data.totals.labor +
                data.totals.material +
                data.totals.expense >
              0 ? (
                <>
                  <div
                    role="img"
                    aria-label="인건비, 자재비, 경비 비율"
                    style={{
                      display: "flex",
                      height: 22,
                      borderRadius: 9,
                      overflow: "hidden",
                    }}
                  >
                    {["labor", "material", "expense"].map(
                      (type) => (
                        <div
                          key={type}
                          style={{
                            width: `${
                              (100 * data.totals[type]) /
                              (data.totals.labor +
                                data.totals.material +
                                data.totals.expense)
                            }%`,
                            background: colors[type],
                          }}
                        />
                      ),
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 12,
                      marginTop: 8,
                      fontSize: 12,
                    }}
                  >
                    {[
                      ["labor", "인건비"],
                      ["material", "자재비"],
                      ["expense", "경비"],
                    ].map(([key, label]) => (
                      <span key={key}>
                        <i
                          style={{
                            display: "inline-block",
                            width: 9,
                            height: 9,
                            borderRadius: 2,
                            background: colors[key],
                            marginRight: 4,
                          }}
                        />
                        {label} {won(data.totals[key])}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <span>등록된 비용이 없습니다.</span>
              )}
            </div>
          </div>

          {view === "payments" && <LaborPayments />}

          <div hidden={view !== "cost"}>
            <Breakdown
              data={data}
              type="labor"
              title="시공자별 인건비"
              itemKey="name"
            />

            <div style={{ marginTop: 14 }}>
              <Breakdown
                data={data}
                type="material"
                title="브랜드별 자재비"
                itemKey="brand"
              />
            </div>

            <div style={{ marginTop: 14 }}>
              <Breakdown
                data={data}
                type="expense"
                title="품목별 경비"
                itemKey="category"
              />
            </div>
          </div>

          <div hidden={view !== "sites"}>
            {data.sites.length === 0 && (
              <div style={card}>
                이 기간에 시공 시작일이 등록된 현장이 없습니다.
              </div>
            )}

            {data.sites.map((site) => (
              <div
                key={site.id}
                style={{ ...card, marginBottom: 14 }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <strong>
                    {site.site_name ||
                      site.customer_name ||
                      "이름 없는 현장"}
                  </strong>

                  <span>
                    {String(site.schedule_start).slice(0, 10)}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.7,
                    marginTop: 8,
                  }}
                >
                  계약 {won(site.revenue)} · 인건비{" "}
                  {won(site.labor)}
                  {" · "}자재 {won(site.material)}
                  {" · "}경비 {won(site.expense)}
                </div>

                <strong
                  style={{
                    color:
                      site.profit < 0 ? "#b91c1c" : "#166534",
                  }}
                >
                  예상 수익 {won(site.profit)}
                </strong>

                {site.excludedOwnerLabor > 0 && (
                  <p style={{ fontSize: 12, color: "#1d4ed8" }}>
                    선택한 시공자 인건비{" "}
                    {won(site.excludedOwnerLabor)} 제외 적용
                  </p>
                )}

                {site.missingContract && (
                  <p style={{ color: "#b45309", fontSize: 12 }}>
                    ⚠️ 계약금액 미입력: 매출 0원으로 집계됩니다.
                  </p>
                )}

                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(
                        selected === site.id ? "" : site.id,
                      );
                      setWorker("");
                    }}
                    style={{
                      marginTop: 10,
                      ...field,
                      width: "auto",
                    }}
                  >
                    {selected === site.id
                      ? "비용 입력 닫기"
                      : "인건비·추가 비용 입력"}
                  </button>
                </div>

                {selected === site.id && (
                  <div
                    style={{
                      borderTop: "1px solid #e2e8f0",
                      marginTop: 12,
                      paddingTop: 12,
                    }}
                  >
                    <p
                      style={{ fontSize: 12, color: "#64748b" }}
                    >
                      날짜별 팀장·팀원 배정으로 일당과
                      팀장수당을 자동 계산합니다. 시공자를
                      선택해 인건비를 직접 저장하면 해당
                      시공자의 자동 계산 대신 입력한 총액을
                      사용합니다. 시공자를 특정하지 않은
                      인건비는 현장 전체 합계로 적용됩니다.
                      완료보고의 실제 자재와 경비도 자동
                      합산됩니다.
                    </p>

                    <form
                      onSubmit={save}
                      style={{ display: "grid", gap: 8 }}
                    >
                      <select
                        aria-label="비용 구분"
                        value={kind}
                        onChange={(event) => {
                          setKind(event.target.value);
                          setWorker("");
                          setAmount("");
                          setDescription("");
                        }}
                        style={field}
                      >
                        {Object.entries(kinds).map(
                          ([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>

                      {kind === "labor" && (
                        <select
                          aria-label="담당 시공자"
                          value={worker}
                          onChange={(event) =>
                            chooseWorker(event.target.value)
                          }
                          style={field}
                        >
                          <option value="">
                            시공자 선택 (또는 직접 입력)
                          </option>

                          {assigned.map((person) => (
                            <option
                              key={person.id}
                              value={person.id}
                            >
                              {person.name} · 일당{" "}
                              {won(person.daily_wage)}
                            </option>
                          ))}
                        </select>
                      )}

                      <input
                        aria-label="비용 내용"
                        placeholder="내용 (예: 정근호 2일 인건비)"
                        value={description}
                        maxLength={120}
                        onChange={(event) =>
                          setDescription(event.target.value)
                        }
                        style={field}
                        required
                      />

                      <input
                        aria-label="비용 금액"
                        inputMode="numeric"
                        placeholder="금액 (원)"
                        value={amount}
                        onChange={(event) =>
                          setAmount(
                            event.target.value.replace(
                              /[^\d]/g,
                              "",
                            ),
                          )
                        }
                        style={field}
                        required
                      />

                      <button
                        type="submit"
                        disabled={saving}
                        style={{
                          ...field,
                          background:
                            "var(--film-blue, #347fec)",
                          color: "#fff",
                        }}
                      >
                        {saving ? "저장 중..." : "비용 저장"}
                      </button>
                    </form>

                    {site.entries.map((entry) => (
                      <div
                        key={entry.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                          alignItems: "center",
                          borderBottom: "1px solid #f1f5f9",
                          padding: "8px 0",
                          fontSize: 13,
                        }}
                      >
                        <span>
                          {costLabels[entry.category] || "비용"}
                          {" · "}
                          {entry.description}
                          {" · "}
                          {won(entry.amount)}
                        </span>

                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => remove(entry.id)}
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
        }
