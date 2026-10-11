"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

const emptyJob = {
  title: "",
  region: "",
  address: "",
  work_content: "",
  work_date: "",
  end_date: "",
  daily_wage: 250000,
  headcount: 1,
  skills: [],
  min_experience: 0,
  publish_address: false,
};

const labels = {
  invited: "구인 제안 도착",
  applied: "지원 완료",
  accepted: "채용 확정",
  rejected: "채용 불가",
  withdrawn: "취소",
};

export default function JobsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const [filters, setFilters] = useState({
    region: "",
    skill: "",
    date: "",
    wage: "",
    experience: "",
    mine: "",
  });

  const [appliedFilters, setAppliedFilters] = useState({});
  const [page, setPage] = useState(0);
  const [job, setJob] = useState(emptyJob);
  const [skills, setSkills] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedJob, setSelectedJob] = useState("");
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(event => {
      if (["SIGNED_OUT", "SIGNED_IN", "USER_UPDATED"].includes(event)) {
        setData(null);
        setConsent(false);
        setSelectedJob("");
        setAttempt(n => n + 1);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function api(path, body, signal) {
    const { data: s } = await supabase.auth.getSession();

    if (!s.session) {
      throw Error("시공자 또는 관리자 계정으로 로그인해주세요.");
    }

    const response = await fetch(path, {
      method: body ? "POST" : "GET",
      cache: "no-store",
      signal,
      headers: {
        Authorization: `Bearer ${s.session.access_token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const result = await response.json();

    if (!response.ok) {
      throw Error(result.error || "요청에 실패했습니다.");
    }

    return result;
  }

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setData(null);

    api(
      `/api/labor-market?${new URLSearchParams({
        ...appliedFilters,
        page: String(page),
      })}`,
      null,
      controller.signal
    )
      .then(r => {
        if (!controller.signal.aborted) setData(r);
      })
      .catch(e => {
        if (!controller.signal.aborted) setError(e.message);
      });

    return () => controller.abort();
  }, [attempt, appliedFilters, page]);

  async function act(body) {
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      await api("/api/labor-market", body);

      if (body.action === "job") {
        setJob(emptyJob);
        setSkills("");
        setShowForm(false);
      }

      setAttempt(n => n + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const jobField = (label, key, type = "text") => (
    <label>
      {label}
      <input
        required
        type={type}
        value={job[key]}
        min={type === "number" ? 0 : undefined}
        onChange={e => setJob(j => ({
          ...j,
          [key]: e.target.value,
        }))}
      />
    </label>
  );

  const myJobs = data?.jobs.filter(j =>
    j.company_id === data.companyId && j.status === "open"
  ) || [];

  return (
    <main>
      <nav>
        <Link href={data?.manager ? "/admin" : "/worker"}>홈</Link>
        <Link href="/worker/account">시공자 가입·개인설정</Link>
        <Link href="/login">관리자 로그인</Link>
      </nav>

      <h1>구인·구직</h1>

      <p>
        {data?.manager
          ? "원하는 조건으로 시공자를 찾고 구인을 등록하세요."
          : "현장 주소와 작업 내용을 확인하고 지원하세요."}
      </p>

      <form onSubmit={e => {
        e.preventDefault();
        setPage(0);
        setAppliedFilters({ ...filters });
      }}>
        <label>
          지역
          <input
            value={filters.region}
            maxLength={100}
            placeholder="인천, 서구"
            onChange={e => setFilters(f => ({
              ...f, region: e.target.value,
            }))}
          />
        </label>

        {data?.manager && (
          <>
            <label>
              전문 분야
              <input
                value={filters.skill}
                placeholder="문·문틀"
                onChange={e => setFilters(f => ({
                  ...f, skill: e.target.value,
                }))}
              />
            </label>

            <label>
              필요한 날짜
              <input
                type="date"
                value={filters.date}
                onChange={e => setFilters(f => ({
                  ...f, date: e.target.value,
                }))}
              />
            </label>

            <label>
              희망 일당 상한 (원)
              <input
                type="number"
                min="0"
                max="2000000"
                value={filters.wage}
                onChange={e => setFilters(f => ({
                  ...f, wage: e.target.value,
                }))}
              />
            </label>

            <label>
              최소 경력 (년)
              <input
                type="number"
                min="0"
                max="70"
                value={filters.experience}
                onChange={e => setFilters(f => ({
                  ...f, experience: e.target.value,
                }))}
              />
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={filters.mine === "1"}
                onChange={e => setFilters(f => ({
                  ...f, mine: e.target.checked ? "1" : "",
                }))}
              />
              우리 업체 공고만 보기
            </label>
          </>
        )}

        <button>조건 검색</button>
        <button type="button" onClick={() => setAttempt(n => n + 1)}>
          새로고침
        </button>
      </form>

      {error && <p role="alert" className="error">{error}</p>}
      {!data && !error && <p>불러오는 중…</p>}

      {data?.manager && (
        <>
          <button onClick={() => setShowForm(v => !v)}>
            구인 공고 {showForm ? "닫기" : "등록"}
          </button>

          {showForm && (
            <form onSubmit={e => {
              e.preventDefault();
              act({
                action: "job",
                job: {
                  ...job,
                  skills: skills.split(",").map(s => s.trim()).filter(Boolean),
                },
              });
            }}>
              <fieldset disabled={busy}>
                <h2>구인 등록</h2>
                {jobField("공고 제목", "title")}
                {jobField("지역", "region")}
                {jobField("현장 주소", "address")}

                <label>
                  작업 내용·근무 시간·지급 조건
                  <textarea
                    required
                    value={job.work_content}
                    maxLength={2000}
                    onChange={e => setJob(j => ({
                      ...j, work_content: e.target.value,
                    }))}
                  />
                </label>

                {jobField("시작일", "work_date", "date")}
                {jobField("종료일", "end_date", "date")}
                {jobField("제시 일당 (원)", "daily_wage", "number")}
                {jobField("모집 인원", "headcount", "number")}
                {jobField("최소 경력 (년)", "min_experience", "number")}

                <label>
                  필요한 전문 분야 (쉼표로 구분)
                  <input
                    value={skills}
                    onChange={e => setSkills(e.target.value)}
                  />
                </label>

                <label className="check">
                  <input
                    type="checkbox"
                    required
                    checked={job.publish_address}
                    onChange={e => setJob(j => ({
                      ...j, publish_address: e.target.checked,
                    }))}
                  />
                  현장 주소·작업 내용을 시공자에게 공개합니다.
                </label>

                <small>
                  고객 이름·전화번호·출입 비밀번호는 입력하지 마세요.
                </small>

                <button disabled={busy}>구인 등록</button>
              </fieldset>
            </form>
          )}

          <h2>구직 중인 시공자</h2>
          <p>구직 공개에 동의한 시공자를 모든 관리자가 볼 수 있습니다.</p>

          <label>
            제안할 우리 업체 공고
            <select
              value={selectedJob}
              onChange={e => setSelectedJob(e.target.value)}
            >
              <option value="">공고를 선택하세요</option>
              {myJobs.map(j => (
                <option key={j.id} value={j.id}>{j.title}</option>
              ))}
            </select>
          </label>

          {!myJobs.length && (
            <small>
              구인을 등록하거나 ‘우리 업체 공고만 보기’로 검색해주세요.
            </small>
          )}

          {!data.candidates.length && (
            <p>조건에 맞는 공개 구직자가 없습니다.</p>
          )}

          {data.candidates.map(p => (
            <article key={p.user_id}>
              {p.photo_url && (
                <img
                  src={p.photo_url}
                  alt={`${p.name} 프로필`}
                  width={72}
                  height={72}
                />
              )}

              <h3>{p.name}{p.age ? ` · ${p.age}세` : ""}</h3>
              <p>
                {p.region} · 경력 {p.experience_years}년 ·
                희망 일당 {p.daily_wage.toLocaleString()}원
              </p>
              <p>{p.skills.join(" · ")}</p>
              <p>{p.introduction}</p>
              <p>가능한 날짜: {p.available_dates.join(", ")}</p>

              <button
                disabled={
                  busy ||
                  !selectedJob ||
                  !myJobs.some(j => j.id === selectedJob)
                }
                onClick={() => act({
                  action: "invite",
                  jobId: selectedJob,
                  userId: p.user_id,
                })}
              >
                구인 제안 보내기
              </button>
            </article>
          ))}
        </>
      )}

      {data && (
        <>
          <h2>구인 공고</h2>

          {!data.manager && (
            <label className="check">
              <input
                type="checkbox"
                checked={consent}
                onChange={e => setConsent(e.target.checked)}
              />
              지원할 업체에 내 이름·프로필·전화번호 공유
            </label>
          )}

          {!data.jobs.length && <p>등록된 공고가 없습니다.</p>}

          {data.jobs.map(j => (
            <article key={j.id}>
              <h3>
                {j.title} · {j.status === "open" ? "모집 중" : "마감"}
              </h3>
              <p>{j.company_name || "등록 업체"} · {j.region}</p>
              <p>현장 주소: {j.address}</p>
              <p className="multiline">{j.work_content}</p>
              <p>
                {j.work_date} ~ {j.end_date} ·
                일당 {j.daily_wage.toLocaleString()}원 · {j.headcount}명
              </p>
              <p>
                경력 {j.min_experience}년 이상 ·{" "}
                {j.skills.join(" · ") || "전문 분야 제한 없음"}
              </p>

              {data.manager
                ? j.company_id === data.companyId &&
                  j.status === "open" && (
                    <button
                      disabled={busy}
                      onClick={() => act({ action: "close", jobId: j.id })}
                    >
                      모집 마감
                    </button>
                  )
                : j.status === "open" && (
                    <button
                      disabled={
                        busy ||
                        !consent ||
                        data.applications.some(a =>
                          a.job_id === j.id &&
                          !["invited", "withdrawn"].includes(a.status)
                        )
                      }
                      onClick={() => act({
                        action: "apply",
                        jobId: j.id,
                        share_phone: consent,
                      })}
                    >
                      지원하기
                    </button>
                  )}
            </article>
          ))}

          <div>
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              이전
            </button>
            <span>{page + 1}페이지</span>
            <button
              disabled={
                data.jobs.length < 30 && data.candidates.length < 30
              }
              onClick={() => setPage(p => p + 1)}
            >
              다음
            </button>
          </div>

          <h2>
            {data.manager
              ? "최근 우리 공고 지원·제안 현황"
              : "최근 내 지원·받은 구인 제안"}
          </h2>

          {!data.applications.length && <p>지원·제안 내역이 없습니다.</p>}

          {data.applications.map(a => {
            const j = [...data.jobs, ...data.applicationJobs]
              .find(j => j.id === a.job_id);

            return (
              <article key={a.id}>
                <h3>
                  {j?.title || "구인 공고"} · {labels[a.status]}
                </h3>

                {j && (
                  <>
                    <p>{j.work_date} ~ {j.end_date} · {j.address}</p>
                    <p className="multiline">{j.work_content}</p>
                    <p>일당 {j.daily_wage.toLocaleString()}원</p>
                  </>
                )}

                {data.manager ? (
                  <>
                    <p>
                      {a.profile?.name} · {a.profile?.region} ·{" "}
                      {a.profile?.skills?.join(" · ")}
                    </p>

                    {a.phone && (
                      <a href={`tel:${a.phone}`}>전화: {a.phone}</a>
                    )}

                    {a.status === "applied" && (
                      <>
                        <button
                          disabled={busy}
                          onClick={() => act({
                            action: "accept",
                            jobId: a.job_id,
                            userId: a.user_id,
                          })}
                        >
                          채용 확정
                        </button>

                        <button
                          disabled={busy}
                          onClick={() => act({
                            action: "reject",
                            jobId: a.job_id,
                            userId: a.user_id,
                          })}
                        >
                          채용 불가
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {a.status === "invited" && (
                      <button
                        disabled={busy || !consent}
                        onClick={() => act({
                          action: "apply",
                          jobId: a.job_id,
                          share_phone: consent,
                        })}
                      >
                        제안에 지원하기
                      </button>
                    )}

                    {["invited", "applied", "accepted"].includes(a.status) && (
                      <button
                        disabled={busy}
                        onClick={() => act({
                          action: "withdraw",
                          jobId: a.job_id,
                        })}
                      >
                        지원·제안 취소
                      </button>
                    )}
                  </>
                )}

                {a.status === "accepted" && (
                  <small>
                    채용 확정 후 업체 관리자가 시공자 등록·초대와
                    현장 배정을 진행해주세요.
                  </small>
                )}
              </article>
            );
          })}
        </>
      )}

      <style jsx>{`
        main {
          max-width: 760px;
          margin: auto;
          padding: 24px 18px 80px;
          background: #f8f7f3;
          color: #243648;
          min-height: 100vh;
        }
        nav { display: flex; flex-wrap: wrap; gap: 16px; }
        form, article {
          padding: 18px;
          background: white;
          border: 1px solid #e0d5c5;
          border-radius: 18px;
          margin: 14px 0;
        }
        fieldset { border: 0; padding: 0; min-width: 0; }
        label { display: block; font-weight: 700; margin: 12px 0; }
        input, textarea, select {
          display: block;
          width: 100%;
          box-sizing: border-box;
          padding: 11px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          margin-top: 6px;
          font: inherit;
        }
        textarea { min-height: 110px; }
        button {
          padding: 11px 14px;
          margin: 8px 8px 8px 0;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          background: #eff6ff;
          color: #243648;
          font: inherit;
        }
        button:disabled { opacity: .45; }
        .check { display: flex; gap: 10px; align-items: center; }
        .check input { width: auto; }
        p, small { line-height: 1.7; overflow-wrap: anywhere; }
        small { display: block; color: #687588; }
        .error { color: #b91c1c; }
        .multiline { white-space: pre-wrap; }
        img { border-radius: 50%; object-fit: cover; }
      `}</style>
    </main>
  );
                  }
