"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";

export default function WorkerForgotPasswordPage() {
  const [mode, setMode] = useState("id");
  const [identity, setIdentity] = useState({
    company: "",
    name: "",
    phone: "",
  });
  const [maskedEmail, setMaskedEmail] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const lock = useRef(false);

  useEffect(() => {
    if (!wait) return;

    const timer = setTimeout(
      () => setWait((n) => Math.max(0, n - 1)),
      1000
    );

    return () => clearTimeout(timer);
  }, [wait]);

  async function submit(event) {
    event.preventDefault();

    if (
      lock.current ||
      (mode === "password" && wait)
    ) {
      return;
    }

    if (mode === "id") {
      lock.current = true;
      setBusy(true);
      setMessage("");
      setMaskedEmail("");
      setSent(false);

      try {
        const response = await fetch(
          "/api/auth/find-worker-id",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(identity),
          }
        );

        const data = await response.json().catch(() => null);

        if (!response.ok || !data) {
          throw Error(
            data?.error ||
              "조회하지 못했습니다. 잠시 후 다시 시도해주세요."
          );
        }

        setMaskedEmail(data.maskedEmail || "");
        setMessage(
          data.message ||
            "가입 이메일 일부를 확인했습니다."
        );
        setSent(Boolean(data.maskedEmail));
      } catch (error) {
        setMessage(
          error.message || "인터넷 연결을 확인해주세요."
        );
      } finally {
        lock.current = false;
        setBusy(false);
      }

      return;
    }

    const address = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setSent(false);
      setMessage(
        "가입한 이메일 주소를 정확히 입력해주세요."
      );
      return;
    }

    lock.current = true;
    setBusy(true);
    setSent(false);
    setMessage("");

    try {
      const { error } =
        await supabase.auth.resetPasswordForEmail(
          address,
          {
            redirectTo:
              `${window.location.origin}/reset-password`,
          }
        );

      if (error) {
        if (error.status === 429) {
          setWait(60);

          throw Error(
            "요청이 많습니다. 잠시 후 다시 시도해주세요."
          );
        }

        throw Error(
          "메일 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요."
        );
      }

      setSent(true);
      setWait(60);
      setMessage(
        "등록된 이메일이면 재설정 메일이 발송됩니다. 받은편지함과 스팸함을 확인해주세요."
      );
    } catch (error) {
      setMessage(
        error.message ||
          "인터넷 연결을 확인하고 다시 시도해주세요."
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "#f8f7f3",
        padding: "36px 18px",
        color: "#243247",
      }}
    >
      <section
        style={{
          maxWidth: 460,
          margin: "0 auto",
          background: "white",
          borderRadius: 24,
          padding: 24,
          border: "1px solid #e4eaf2",
        }}
      >
        <p>필름장이 · 시공자</p>

        <h1>아이디 찾기 · 비밀번호 재설정</h1>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 18,
          }}
        >
          {[
            ["id", "아이디 찾기"],
            ["password", "비밀번호 재설정"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              disabled={busy}
              aria-pressed={mode === key}
              onClick={() => {
                setMode(key);
                setMessage("");
                setMaskedEmail("");
                setSent(false);
              }}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                background:
                  mode === key ? "#243247" : "white",
                color:
                  mode === key ? "white" : "#243247",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <p style={{ lineHeight: 1.8 }}>
          {mode === "id"
            ? "관리자가 등록한 회사명, 시공자 이름, 휴대폰 번호를 입력해주세요. 일치하면 이메일 일부를 보여드립니다."
            : "가입 이메일을 입력해주세요. 메일의 링크에서 새 비밀번호를 설정할 수 있습니다."}
        </p>

        <form onSubmit={submit}>
          {mode === "id" ? (
            <>
              {[
                ["company", "소속 회사명", "text"],
                ["name", "시공자 이름", "text"],
                ["phone", "휴대폰 번호", "tel"],
              ].map(([key, label, type]) => (
                <div key={key}>
                  <label htmlFor={`find-${key}`}>
                    {label}
                  </label>

                  <input
                    id={`find-${key}`}
                    type={type}
                    required
                    maxLength={
                      key === "phone"
                        ? 20
                        : key === "name"
                          ? 40
                          : 80
                    }
                    disabled={busy}
                    value={identity[key]}
                    onChange={(e) => {
                      setIdentity((old) => ({
                        ...old,
                        [key]: e.target.value,
                      }));
                      setMaskedEmail("");
                      setMessage("");
                    }}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: 14,
                      margin: "10px 0",
                      border: "1px solid #cbd5e1",
                      borderRadius: 12,
                      fontSize: 16,
                    }}
                  />
                </div>
              ))}
            </>
          ) : (
            <>
              <label htmlFor="reset-email">
                가입 이메일
              </label>

              <input
                id="reset-email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                disabled={busy}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: 14,
                  margin: "10px 0",
                  border: "1px solid #cbd5e1",
                  borderRadius: 12,
                  fontSize: 16,
                }}
              />
            </>
          )}

          <button
            disabled={
              busy ||
              (mode === "password" && wait > 0)
            }
            style={{
              width: "100%",
              padding: 15,
              border: 0,
              borderRadius: 12,
              color: "white",
              background:
                busy || (mode === "password" && wait)
                  ? "#94a3b8"
                  : "#3478ed",
              fontSize: 16,
              fontWeight: 800,
            }}
          >
            {busy
              ? "요청 중…"
              : mode === "id"
                ? "아이디 찾기"
                : wait
                  ? `${wait}초 후 다시 요청 가능`
                  : "재설정 메일 받기"}
          </button>
        </form>

        {maskedEmail && (
          <p
            role="status"
            style={{
              fontSize: 22,
              fontWeight: 800,
              overflowWrap: "anywhere",
            }}
          >
            {maskedEmail}
          </p>
        )}

        {message && (
          <p
            role={sent ? "status" : "alert"}
            style={{
              padding: 14,
              lineHeight: 1.8,
              borderRadius: 12,
              background: sent ? "#ecfdf5" : "#fff1f2",
              color: sent ? "#047857" : "#b91c1c",
            }}
          >
            {message}
          </p>
        )}

        <p
          style={{
            color: "#64748b",
            fontSize: 14,
            lineHeight: 1.8,
          }}
        >
          이메일을 모르거나 메일을 받을 수 없다면 소속 회사
          관리자에게 계정 정보를 확인해주세요. 재설정 메일을
          여러 번 받았다면 가장 최근 링크를 사용해주세요.
        </p>

        <Link
          href="/worker/login"
          style={{
            display: "block",
            padding: 14,
            textAlign: "center",
            color: "#3268bd",
          }}
        >
          ← 시공자 로그인
        </Link>
      </section>
    </main>
  );
           }
