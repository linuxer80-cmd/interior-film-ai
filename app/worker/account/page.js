"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";

const blank = {
  name: "",
  age: "",
  daily_wage: 250000,
  region: "",
  skills: [],
  experience_years: 0,
  introduction: "",
  available_dates: [],
  seeking: false,
  published: false,
};

const privateBlank = {
  phone: "",
  bank_name: "",
  account_number: "",
  account_holder: "",
  departure_address: "",
};

export default function WorkerAccount() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState(blank);
  const [personal, setPersonal] = useState(privateBlank);
  const [skillText, setSkillText] = useState("");
  const [date, setDate] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setReady(true);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setReady(true);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setLoaded(false);
      setSaved(false);
      return;
    }

    const controller = new AbortController();
    setLoaded(false);
    setMessage("");

    (async () => {
      try {
        const response = await fetch("/api/labor-market?mode=me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
          signal: controller.signal,
        });

        const data = await response.json();
        if (!response.ok) throw Error(data.error);

        if (!controller.signal.aborted) {
          setProfile({
            ...blank,
            ...data.defaults,
            ...data.profile,
            age: data.profile?.age ?? "",
          });
          setPersonal({ ...privateBlank, ...data.personal });
          setSkillText((data.profile?.skills || []).join(", "));
          setSaved(Boolean(data.profile));
          setLoaded(true);
        }
      } catch (e) {
        if (!controller.signal.aborted) setMessage(e.message);
      }
    })();

    return () => controller.abort();
  }, [session?.user?.id, session?.access_token]);

  async function login(e) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setMessage("");

    try {
      if (signup) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/worker/account`,
          },
        });

        if (error) throw error;

        setSession(data.session);
        setMessage(data.session
          ? "가입되었습니다. 개인 프로필을 등록해주세요."
          : "인증 메일을 확인한 뒤 이 화면에서 로그인해주세요.");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;
        setSession(data.session);
      }
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    if (busy || !loaded) return;

    setBusy(true);
    setMessage("");

    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw Error("다시 로그인해주세요.");

      const response = await fetch("/api/labor-market", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "profile",
          profile: {
            ...profile,
            skills: skillText
              .split(",")
              .map(s => s.trim())
              .filter(Boolean),
          },
          personal,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw Error(result.error);

      setSaved(true);
      setMessage("저장했습니다. 구직 공개 설정도 반영되었습니다.");
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function photo(e) {
    const file = e.target.files?.[0];
    if (!file || busy) return;

    setBusy(true);
    setMessage("");

    try {
      if (file.size > 2097152) {
        throw Error("사진은 2MB 이하로 올려주세요.");
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) throw Error("다시 로그인해주세요.");

      const form = new FormData();
      form.append("photo", file);

      const response = await fetch("/api/labor-market", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: form,
      });

      const result = await response.json();
      if (!response.ok) throw Error(result.error);

      const me = await fetch("/api/labor-market?mode=me", {
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
        cache: "no-store",
      });

      const info = await me.json();
      if (!me.ok) throw Error(info.error);

      setProfile(p => ({ ...p, photo_url: info.profile?.photo_url }));
      setMessage("프로필 사진을 등록했습니다.");
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  const field = (label, key, type = "text", secret = false) => (
    <label>
      {label}
      <input
        type={type}
        value={(secret ? personal : profile)[key]}
        onChange={e => secret
          ? setPersonal(p => ({ ...p, [key]: e.target.value }))
          : setProfile(p => ({ ...p, [key]: e.target.value }))}
        maxLength={
          key === "departure_address" ? 300 : key === "name" ? 60 : 100
        }
        min={type === "number" ? 0 : undefined}
      />
    </label>
  );

  return (
    <main>
      <nav>
        <Link href="/worker">시공자 홈</Link>
        <Link href="/jobs">구인·구직</Link>
      </nav>

      <h1>{session ? "시공자 개인설정" : "시공자 계정"}</h1>

      {!ready ? (
        <p>계정을 확인하는 중…</p>
      ) : !session ? (
        <form onSubmit={login}>
          <h2>{signup ? "시공자 회원가입" : "시공자 로그인"}</h2>
          <p>소속 업체 없이도 가입하고 구직할 수 있습니다.</p>

          <label>
            이메일
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </label>

          <label>
            비밀번호
            <input
              type="password"
              required
              minLength={8}
              autoComplete={signup ? "new-password" : "current-password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </label>

          <button disabled={busy}>
            {busy ? "처리 중…" : signup ? "가입하기" : "로그인"}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => setSignup(s => !s)}
          >
            {signup ? "로그인으로 돌아가기" : "시공자 회원가입"}
          </button>

          <Link href="/worker/login">기존 소속 시공자 로그인</Link>
        </form>
      ) : (
        <>
          {!loaded ? (
            <p>
              개인설정을 불러오는 중입니다.
              오류가 있으면 새로고침해주세요.
            </p>
          ) : (
            <form onSubmit={save}>
              <fieldset disabled={busy}>
                <h2>내 프로필</h2>

                {profile.photo_url && (
                  <img
                    src={profile.photo_url}
                    alt="내 프로필 사진"
                    width={90}
                    height={90}
                  />
                )}

                <label>
                  프로필 사진 (2MB 이하)
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={!saved}
                    onChange={photo}
                  />
                </label>

                {!saved && (
                  <small>
                    프로필을 먼저 저장하면 사진을 올릴 수 있습니다.
                  </small>
                )}

                {field("이름", "name")}
                {field("나이 (선택, 공개 시 표시)", "age", "number")}
                {field("희망 일당 (원)", "daily_wage", "number")}
                {field("대략적인 주소·활동 지역 (예: 인천 서구)", "region")}
                {field("경력 (년)", "experience_years", "number")}

                <label>
                  전문 분야 (쉼표로 구분)
                  <input
                    value={skillText}
                    maxLength={600}
                    placeholder="문·문틀, 싱크대, 샤시"
                    onChange={e => setSkillText(e.target.value)}
                  />
                </label>

                <label>
                  자기소개
                  <textarea
                    value={profile.introduction}
                    maxLength={1500}
                    onChange={e => setProfile(p => ({
                      ...p,
                      introduction: e.target.value,
                    }))}
                  />
                </label>

                <label>
                  일할 수 있는 날짜
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                  />
                </label>

                <button
                  type="button"
                  onClick={() => {
                    if (date) {
                      setProfile(p => ({
                        ...p,
                        available_dates: [
                          ...new Set([...p.available_dates, date]),
                        ].sort(),
                      }));
                    }
                    setDate("");
                  }}
                >
                  날짜 추가
                </button>

                <div>
                  {profile.available_dates.map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setProfile(p => ({
                        ...p,
                        available_dates: p.available_dates.filter(v => v !== d),
                      }))}
                    >
                      {d} ×
                    </button>
                  ))}
                </div>

                <label className="check">
                  <input
                    type="checkbox"
                    checked={profile.published}
                    onChange={e => setProfile(p => ({
                      ...p,
                      published: e.target.checked,
                      seeking: e.target.checked ? p.seeking : false,
                    }))}
                  />
                  모든 관리자에게 프로필 공개
                </label>

                <label className="check">
                  <input
                    type="checkbox"
                    checked={profile.seeking}
                    onChange={e => setProfile(p => ({
                      ...p,
                      seeking: e.target.checked,
                      published: e.target.checked ? true : p.published,
                    }))}
                  />
                  현재 구직 중
                </label>

                <small>
                  구직 중과 공개를 모두 켜면 모든 관리자의
                  시공자 찾기에 표시됩니다.
                </small>

                <h2>연락처·입금 정보</h2>

                <p>
                  전화번호는 지원한 업체에 동의 후 공유됩니다.
                  계좌와 상세 주소는 구인·구직에 공개되지 않습니다.
                </p>

                {field("전화번호", "phone", "tel", true)}
                {field("은행명", "bank_name", "text", true)}
                {field("계좌번호", "account_number", "text", true)}
                {field("예금주", "account_holder", "text", true)}
                {field("출발 상세 주소 (길찾기용)", "departure_address", "text", true)}

                <small>
                  저장하면 현재 연결된 활성 소속 업체의 계좌·출발
                  주소에도 반영됩니다. 희망 일당은 기존 업체의
                  계약 일당을 변경하지 않습니다.
                </small>

                <button disabled={busy}>
                  {busy ? "저장 중…" : "개인설정 저장"}
                </button>
              </fieldset>
            </form>
          )}

          <button
            disabled={busy}
            onClick={async () => {
              await supabase.auth.signOut();
              setProfile(blank);
              setPersonal(privateBlank);
              setMessage("로그아웃했습니다.");
            }}
          >
            로그아웃
          </button>
        </>
      )}

      {message && <p role="status">{message}</p>}

      <style jsx>{`
        main {
          max-width: 640px;
          margin: auto;
          padding: 24px 18px 80px;
          color: #243648;
          background: #f8f7f3;
          min-height: 100vh;
        }
        nav { display: flex; gap: 20px; }
        form {
          background: #fff;
          padding: 20px;
          border: 1px solid #e0d5c5;
          border-radius: 20px;
        }
        fieldset { border: 0; padding: 0; min-width: 0; }
        label { display: block; margin: 14px 0; font-weight: 700; }
        input, textarea {
          display: block;
          width: 100%;
          box-sizing: border-box;
          padding: 12px;
          margin-top: 6px;
          border: 1px solid #ccd4df;
          border-radius: 10px;
          font: inherit;
        }
        textarea { min-height: 100px; }
        button {
          margin: 10px 8px 6px 0;
          padding: 12px;
          border: 1px solid #ccd4df;
          border-radius: 10px;
          background: #eff6ff;
          color: #243648;
          font: inherit;
        }
        button:disabled { opacity: .5; }
        .check { display: flex; align-items: center; gap: 10px; }
        .check input { width: auto; }
        small, p { line-height: 1.7; }
        small { display: block; color: #687588; }
        img { object-fit: cover; border-radius: 50%; }
      `}</style>
    </main>
  );
                }
