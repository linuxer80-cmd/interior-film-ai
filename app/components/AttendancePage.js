"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

const koreaDay = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const time = (value) =>
  value
    ? new Date(value).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "미기록";

const won = (value) =>
  `${Number(value || 0).toLocaleString("ko-KR")}원`;

const card = {
  padding: 18,
  borderRadius: 18,
  border: "1px solid #e2e8f0",
  background: "white",
  marginBottom: 14,
};

const field = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  minHeight: 44,
  padding: 10,
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  margin: "6px 0 12px",
  fontSize: 15,
};

const button = {
  minHeight: 44,
  padding: "10px 15px",
  border: "1px solid #bfdbfe",
  borderRadius: 12,
  background: "#eff6ff",
  color: "#1d4ed8",
  fontWeight: 700,
  margin: "4px 6px 4px 0",
};

async function request(method, body, mode, month) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) throw Error("로그인 후 이용해주세요.");

  const response = await fetch(
    `/api/attendance?mode=${mode}&month=${month}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    },
  );

  const result = await response.json().catch(() => ({
    error: "서버 응답을 확인하지 못했습니다.",
  }));

  if (!response.ok) {
    throw Error(result.error || "처리 실패");
  }

  return result;
}

function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(
        Error("이 브라우저는 위치 확인을 지원하지 않습니다."),
      );
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      (error) =>
        reject(
          Error(
            error.code === 1
              ? "위치 권한이 거부되었습니다."
              : "GPS 위치를 확인하지 못했습니다. 야외에서 다시 시도해주세요.",
          ),
        ),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      },
    );
  });
}

function Gps({ gps, distance, verified }) {
  return (
    <span>
      {verified ? "현장 반경 확인" : "위치 확인 필요"}
      {distance != null ? ` · 현장까지 ${distance}m` : ""}
      {gps?.accuracy != null
        ? ` · 오차 ±${Math.round(gps.accuracy)}m`
        : ""}
      {gps?.reason ? ` · ${gps.reason}` : ""}
      {gps?.latitude != null && (
        <>
          {" · "}
          <a
            href={`https://www.google.com/maps?q=${gps.latitude},${gps.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            기록 위치
          </a>
        </>
      )}
    </span>
  );
}

export default function AttendancePage({ mode = "worker" }) {
  const admin = mode === "admin";

  const [month, setMonth] = useState(() => koreaDay().slice(0, 7));
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [siteId, setSiteId] = useState("");
  const [consent, setConsent] = useState(false);
  const [reason, setReason] = useState("");

  const [settings, setSettings] = useState({
    cutoff: "17:00",
    hourlyRate: "",
    radius: 200,
  });

  const [point, setPoint] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [review, setReview] = useState(null);

  const lock = useRef(false);
  const version = useRef(0);

  async function load() {
    const currentVersion = ++version.current;
    setLoading(true);
    setError("");

    try {
      const result = await request("GET", null, mode, month);
      if (currentVersion !== version.current) return;

      setData(result);

      if (result.settings) {
        setSettings({
          cutoff: result.settings.cutoff.slice(0, 5),
          hourlyRate: result.settings.hourly_rate,
          radius: result.settings.radius_m,
        });
      }
    } catch (loadError) {
      if (currentVersion === version.current) {
        setError(loadError.message);
        setData(null);
      }
    } finally {
      if (currentVersion === version.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    load();

    return () => {
      version.current++;
    };
  }, [month, mode]);

  async function run(action) {
    if (lock.current) return;

    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      await action();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function post(body) {
    const result = await request("POST", body, mode, month);
    setMessage(result.message || "저장했습니다.");
    await load();
  }

  const sites = data?.sites || [];
  const selected = sites.find((site) => site.id === siteId);
  const active = (data?.records || []).find(
    (record) => !record.clock_out,
  );

  const siteName = (id) =>
    sites.find((site) => site.id === id)?.site_name || "현장";

  const workerName = (id) =>
    data?.workers.find((worker) => worker.id === id)?.name ||
    "시공자";

  async function punch(action, withoutGps = false) {
    if (!consent) {
      throw Error("위치 기록 안내를 확인해주세요.");
    }

    if (action === "in" && !siteId) {
      throw Error("현장을 선택해주세요.");
    }

    const gps = withoutGps ? null : await locate();

    await post({
      action,
      siteId,
      id: active?.id,
      gps,
      reason,
      consent,
    });
  }

  function selectSite(id) {
    setSiteId(id);
    setPoint(null);
    setCandidates([]);
  }

  return (
    <main
      style={{
        maxWidth: 850,
        margin: "0 auto",
        padding: "20px 16px 100px",
        background: "#faf8f4",
        minHeight: "100vh",
        color: "#183153",
      }}
    >
      <Link
        href={admin ? "/admin" : "/worker"}
        style={{
          ...button,
          display: "inline-block",
          textDecoration: "none",
        }}
      >
        ‹ {admin ? "관리자" : "시공자"} 홈
      </Link>

      <h1 style={{ fontSize: 25 }}>
        {admin ? "출퇴근 관리" : "출근 · 퇴근"}
      </h1>

      <div style={card}>
        <label>
          조회 월
          <input
            style={field}
            type="month"
            value={month}
            disabled={busy}
            onChange={(event) => {
              if (event.target.value) {
                setMonth(event.target.value);
                setReview(null);
              }
            }}
          />
        </label>

        <button
          style={button}
          disabled={busy || loading}
          onClick={load}
        >
          새로 조회
        </button>
      </div>

      {loading && (
        <p role="status">출퇴근 내역 확인 중…</p>
      )}

      {data && admin && (
        <>
          <details style={card}>
            <summary>출퇴근 기준 설정</summary>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                run(() =>
                  post({
                    action: "settings",
                    cutoff: settings.cutoff,
                    hourlyRate: Number(settings.hourlyRate),
                    radius: Number(settings.radius),
                  }),
                );
              }}
            >
              <p>
                설정은 다음 출근부터 적용됩니다. 등록한 시간당
                단가에 추가 배율을 곱하지 않고 분 단위로
                계산합니다.
              </p>

              <label>
                기준 퇴근시각 (한국 시간)
                <input
                  required
                  type="time"
                  style={field}
                  value={settings.cutoff}
                  disabled={busy}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      cutoff: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                연장근무 시간당 금액 (원)
                <input
                  required
                  type="number"
                  min="0"
                  max="1000000"
                  step="1"
                  style={field}
                  value={settings.hourlyRate}
                  disabled={busy}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      hourlyRate: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                현장 인정 반경 (m)
                <input
                  required
                  type="number"
                  min="50"
                  max="2000"
                  step="1"
                  style={field}
                  value={settings.radius}
                  disabled={busy}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      radius: event.target.value,
                    })
                  }
                />
              </label>

              <button style={button} disabled={busy}>
                기준 저장
              </button>
            </form>
          </details>

          <details style={card}>
            <summary>현장 주소·위치 등록</summary>

            <select
              style={field}
              value={siteId}
              disabled={busy}
              onChange={(event) => selectSite(event.target.value)}
            >
              <option value="">현장 선택</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.site_name || site.address}
                </option>
              ))}
            </select>

            {selected && (
              <>
                <p>{selected.address || "주소가 없습니다."}</p>

                <p>
                  {data.locations.some(
                    (location) =>
                      location.site_id === siteId &&
                      location.address === selected.address,
                  )
                    ? "기준 위치 등록됨"
                    : "기준 위치 등록 필요"}
                </p>

                <button
                  style={button}
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const result = await request(
                        "POST",
                        { action: "geocode", siteId },
                        mode,
                        month,
                      );

                      setCandidates(result.candidates);

                      if (!result.candidates.length) {
                        throw Error(
                          "주소 검색 결과가 없습니다. 현장 주소를 확인해주세요.",
                        );
                      }
                    })
                  }
                >
                  주소로 위치 찾기
                </button>

                <button
                  style={button}
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const gps = await locate();

                      if (gps.accuracy > 100) {
                        throw Error(
                          "GPS 오차가 큽니다. 야외에서 다시 확인해주세요.",
                        );
                      }

                      setPoint({
                        ...gps,
                        address: selected.address,
                      });
                    })
                  }
                >
                  현장에서 현재 위치 사용
                </button>

                {candidates.map((candidate, index) => (
                  <button
                    key={index}
                    style={button}
                    disabled={busy}
                    onClick={() => setPoint(candidate)}
                  >
                    {candidate.address}
                  </button>
                ))}

                {point && (
                  <div>
                    <p>
                      선택 위치: {point.address}
                      <br />
                      {point.latitude}, {point.longitude}
                    </p>

                    <a
                      target="_blank"
                      rel="noopener noreferrer"
                      href={`https://www.google.com/maps?q=${point.latitude},${point.longitude}`}
                    >
                      지도에서 위치 확인
                    </a>

                    <p>
                      주소와 지도 위치가 맞는지 확인 후 저장하세요.
                    </p>

                    <button
                      style={button}
                      disabled={busy}
                      onClick={() =>
                        run(() =>
                          post({
                            action: "location",
                            siteId,
                            address: selected.address,
                            latitude: point.latitude,
                            longitude: point.longitude,
                          }),
                        )
                      }
                    >
                      이 위치를 현장 기준으로 저장
                    </button>
                  </div>
                )}
              </>
            )}
          </details>

          <div style={card}>
            승인된 추가 인건비{" "}
            <strong>
              {won(
                data.records.reduce(
                  (sum, record) =>
                    sum +
                    (record.review_status === "approved"
                      ? record.overtime_amount
                      : 0),
                  0,
                ),
              )}
            </strong>

            <p>
              승인한 연장근무 비용은 매출·수익의 현장 인건비와
              인건비 지급 관리에 포함됩니다. 수익 조회는 기존
              현장 시공 시작일 기준입니다.
            </p>
          </div>
        </>
      )}

      {data && !admin && (
        <div style={card}>
          <h2 style={{ fontSize: 20 }}>
            {active ? "현재 출근 중" : "출근 기록"}
          </h2>

          {active ? (
            <p>
              {siteName(active.site_id)} · 출근{" "}
              {time(active.clock_in)}
            </p>
          ) : (
            <select
              style={field}
              disabled={busy}
              value={siteId}
              onChange={(event) => selectSite(event.target.value)}
            >
              <option value="">출근할 현장 선택</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.site_name || site.address}
                </option>
              ))}
            </select>
          )}

          {selected && !active && <p>{selected.address}</p>}

          <p>
            버튼을 누를 때만 위치와 서버 시간을 기록합니다.
            기록은 본인과 소속 관리자가 확인하며 근무·연장비용
            확인에 사용합니다. 계속 위치를 추적하지 않습니다.
          </p>

          <label>
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={(event) => setConsent(event.target.checked)}
            />{" "}
            위치 기록 안내를 확인했습니다.
          </label>

          <br />

          <button
            style={{
              ...button,
              background: "#2563eb",
              color: "white",
            }}
            disabled={busy || loading || !consent}
            onClick={() =>
              run(() => punch(active ? "out" : "in"))
            }
          >
            {busy
              ? "기록 중…"
              : active
                ? "퇴근 기록"
                : "출근 기록"}
          </button>

          <details>
            <summary>
              위치 권한·GPS 문제로 기록할 수 없나요?
            </summary>

            <p>
              사유를 남기면 위치 미확인 기록으로 저장되어 관리자가
              확인합니다.
            </p>

            <input
              style={field}
              placeholder="위치를 기록하지 못한 사유"
              maxLength={300}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={busy}
            />

            <button
              style={button}
              disabled={
                busy || !consent || reason.trim().length < 3
              }
              onClick={() =>
                run(() => punch(active ? "out" : "in", true))
              }
            >
              사유와 시간만 기록
            </button>
          </details>
        </div>
      )}

      {error && (
        <p
          role="alert"
          style={{
            ...card,
            color: "#b91c1c",
            background: "#fff1f2",
          }}
        >
          {error}
        </p>
      )}

      {message && (
        <p
          role="status"
          style={{ ...card, color: "#166534" }}
        >
          {message}
        </p>
      )}

      {data && (
        <>
          <h2 style={{ fontSize: 20 }}>출퇴근 기록</h2>

          {!data.records.length && <p>기록이 없습니다.</p>}

          {data.records.map((record) => (
            <article key={record.id} style={card}>
              <strong>
                {record.work_day} ·{" "}
                {workerName(record.worker_id)} ·{" "}
                {siteName(record.site_id)}
              </strong>

              <p>{record.site_address}</p>

              <p>
                출근 {time(record.clock_in)}
                <br />
                <Gps
                  gps={record.in_gps}
                  distance={record.in_distance_m}
                  verified={record.in_verified}
                />
              </p>

              <p>
                퇴근 {time(record.clock_out)}
                {record.clock_out && (
                  <>
                    <br />
                    <Gps
                      gps={record.out_gps}
                      distance={record.out_distance_m}
                      verified={record.out_verified}
                    />
                  </>
                )}
              </p>

              {record.clock_out && (
                <p>
                  출퇴근 사이 경과시간{" "}
                  {Math.floor(
                    (new Date(record.clock_out) -
                      new Date(record.clock_in)) /
                      3600000,
                  )}
                  시간{" "}
                  {Math.floor(
                    (new Date(record.clock_out) -
                      new Date(record.clock_in)) /
                      60000,
                  ) % 60}
                  분 (휴게 포함)
                </p>
              )}

              <p>
                기준 퇴근 {record.cutoff.slice(0, 5)} · 연장{" "}
                {record.overtime_minutes}분 · 시간당{" "}
                {won(record.hourly_rate)}
              </p>

              {record.clock_out &&
                new Date(record.clock_out) -
                  new Date(record.clock_in) >
                  24 * 3600000 && (
                  <p style={{ color: "#b91c1c" }}>
                    24시간을 초과한 기록입니다. 퇴근 누락 여부를
                    확인해주세요.
                  </p>
                )}

              <p>
                {
                  {
                    pending: "관리자 확인 대기",
                    approved: "승인",
                    rejected: "반려",
                  }[record.review_status]
                }{" "}
                · 추가 비용{" "}
                {record.review_status === "pending"
                  ? `${won(
                      Math.round(
                        (record.overtime_minutes *
                          record.hourly_rate) /
                          60,
                      ),
                    )} (확인 전)`
                  : won(record.overtime_amount)}
              </p>

              {record.review_note && (
                <p>
                  확인 내용: {record.review_note} · 연장 휴게{" "}
                  {record.break_minutes}분
                </p>
              )}

              {admin &&
                record.clock_out &&
                record.review_status === "pending" && (
                  <button
                    style={button}
                    disabled={busy}
                    onClick={() =>
                      setReview({
                        id: record.id,
                        breakMinutes: 0,
                        note: "",
                        max: record.overtime_minutes,
                      })
                    }
                  >
                    기록 확인·승인
                  </button>
                )}

              {review?.id === record.id && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();

                    run(async () => {
                      await post({
                        action: "review",
                        ...review,
                        status: "approved",
                      });
                      setReview(null);
                    });
                  }}
                >
                  <label>
                    연장시간 중 휴게시간 (분)
                    <input
                      style={field}
                      type="number"
                      required
                      min="0"
                      max={review.max}
                      step="1"
                      value={review.breakMinutes}
                      disabled={busy}
                      onChange={(event) =>
                        setReview({
                          ...review,
                          breakMinutes: Number(event.target.value),
                        })
                      }
                    />
                  </label>

                  <label>
                    확인 사유
                    <input
                      style={field}
                      required
                      maxLength={500}
                      value={review.note}
                      disabled={busy}
                      onChange={(event) =>
                        setReview({
                          ...review,
                          note: event.target.value,
                        })
                      }
                    />
                  </label>

                  <p>
                    승인하면 추가 인건비가 반영됩니다. 기존
                    인건비에 같은 연장비용을 이미 넣었다면 중복
                    승인하지 마세요.
                  </p>

                  <button style={button} disabled={busy}>
                    승인·추가 인건비 반영
                  </button>

                  <button
                    style={button}
                    type="button"
                    disabled={busy || !review.note.trim()}
                    onClick={() =>
                      run(async () => {
                        await post({
                          action: "review",
                          ...review,
                          status: "rejected",
                        });
                        setReview(null);
                      })
                    }
                  >
                    반려
                  </button>
                </form>
              )}
            </article>
          ))}
        </>
      )}
    </main>
  );
}
