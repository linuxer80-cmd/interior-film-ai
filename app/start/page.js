"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export default function StartPage() {
  const installPrompt = useRef(null);

  const [role, setRole] = useState("");
  const [showInstall, setShowInstall] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const mode = window.matchMedia(
      "(display-mode: standalone)"
    );

    function updateMode() {
      setShowInstall(
        !mode.matches &&
          window.navigator.standalone !== true
      );
    }

    function beforeInstall(event) {
      event.preventDefault();
      installPrompt.current = event;
      updateMode();
    }

    function installed() {
      installPrompt.current = null;
      setShowInstall(false);
      setMessage(
        "설치가 요청되었습니다. 홈 화면의 필름장이 아이콘으로 실행해주세요."
      );
    }

    updateMode();

    window.addEventListener(
      "beforeinstallprompt",
      beforeInstall
    );
    window.addEventListener("appinstalled", installed);
    mode.addEventListener("change", updateMode);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        beforeInstall
      );
      window.removeEventListener("appinstalled", installed);
      mode.removeEventListener("change", updateMode);
    };
  }, []);

  async function installApp() {
    if (installing) return;

    const event = installPrompt.current;

    if (!event) {
      const ua = navigator.userAgent;
      const inApp =
        /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\//i.test(
          ua
        );
      const ios =
        /iPhone|iPad|iPod/i.test(ua) ||
        (navigator.platform === "MacIntel" &&
          navigator.maxTouchPoints > 1);

      setMessage(
        inApp
          ? "카톡 등 내부 브라우저에서는 설치창이 열리지 않을 수 있어요. 외부 브라우저로 열기를 선택하거나 주소를 복사해 갤럭시 크롬에서 열어주세요."
          : ios
            ? "Safari에서 이 주소를 열고 공유 버튼 → 홈 화면에 추가를 선택해주세요."
            : "크롬 오른쪽 위 ⋮ → 홈 화면에 추가 → 설치를 선택해주세요. 이미 설치했다면 홈 화면의 필름장이 아이콘으로 실행해주세요."
      );
      return;
    }

    installPrompt.current = null;
    setInstalling(true);
    setMessage("");

    try {
      await event.prompt();
      const choice = await event.userChoice;

      if (choice.outcome === "accepted") {
        setShowInstall(false);
        setMessage(
          "설치가 요청되었습니다. 설치가 끝나면 홈 화면의 필름장이 아이콘으로 실행해주세요."
        );
      } else {
        setMessage(
          "설치를 취소했어요. 웹에서도 이용할 수 있으며, 크롬 메뉴에서 나중에 설치할 수 있습니다."
        );
      }
    } catch {
      setMessage(
        "설치창을 열지 못했어요. 크롬 오른쪽 위 ⋮ → 홈 화면에 추가 → 설치로 진행해주세요."
      );
    } finally {
      setInstalling(false);
    }
  }

  async function copyAddress() {
    const address = `${window.location.origin}/start`;

    try {
      await navigator.clipboard.writeText(address);
      setMessage(
        "주소를 복사했어요. 크롬 주소창에 붙여넣어주세요."
      );
    } catch {
      setMessage(`아래 주소를 복사해주세요.\n${address}`);
    }
  }

  return (
    <main className="page">
      <section className="content">
        <div className="logo" aria-hidden="true">F</div>
        <p className="eyebrow">
          오늘도 좋은 공간을 만듭니다
        </p>
        <h1>필름장이</h1>
        <p className="intro">어떤 역할로 이용하시나요?</p>

        <div className="cards">
          <button
            type="button"
            className="card admin"
            onClick={() =>
              setRole(role === "admin" ? "" : "admin")
            }
            aria-expanded={role === "admin"}
            aria-controls="admin-guide"
          >
            <strong>관리자로 시작하기 →</strong>
            <span>현장 · 견적 · 일정 · 자재 · 정산 관리</span>
          </button>

          {role === "admin" && (
            <section id="admin-guide" className="guide">
              <h2>회원가입이 필요한 서비스입니다</h2>
              <p>
                기존 회원은 로그인하시고, 처음 이용하시는
                분은 업체 회원가입을 진행해주세요.
              </p>
              <Link href="/login">관리자 로그인</Link>
              <Link href="/signup" className="light">
                업체 회원가입
              </Link>
            </section>
          )}

          <button
            type="button"
            className="card worker"
            onClick={() =>
              setRole(role === "worker" ? "" : "worker")
            }
            aria-expanded={role === "worker"}
            aria-controls="worker-guide"
          >
            <strong>시공자로 시작하기 →</strong>
            <span>
              내 현장 · 시공 일정 · 완료보고 · 근무금액
            </span>
          </button>

          {role === "worker" && (
            <section id="worker-guide" className="guide">
              <h2>등록된 시공자 계정으로 이용해주세요</h2>
              <p>
                소속 업체 관리자가 등록한 계정으로
                로그인해주세요. 계정이 없다면 업체
                관리자에게 등록을 요청해주세요.
              </p>
              <Link href="/worker/login?next=%2Fworker">
                시공자 로그인
              </Link>
            </section>
          )}
        </div>

        {showInstall && (
          <section className="install">
            <p>홈 화면에서 필름장이를 바로 실행하세요.</p>
            <button
              type="button"
              onClick={installApp}
              disabled={installing}
            >
              {installing
                ? "설치창 여는 중…"
                : "앱으로 설치하기"}
            </button>
          </section>
        )}

        {message && (
          <div className="guide feedback" role="status">
            <p>{message}</p>
            {showInstall && (
              <button type="button" onClick={copyAddress}>
                접속 주소 복사
              </button>
            )}
          </div>
        )}

        <p className="footer">
          기분좋은공간과 함께하는 현장 관리
        </p>
      </section>

      <style jsx>{`
        .page {
          min-height: 100svh;
          box-sizing: border-box;
          padding: 48px 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f7f5ef;
          color: #182620;
        }
        .content {
          width: 100%;
          max-width: 420px;
        }
        .logo {
          width: 64px;
          height: 64px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #182620;
          color: #d7bb7a;
          font-size: 36px;
          font-weight: 800;
          margin-bottom: 28px;
        }
        .eyebrow {
          margin: 0 0 12px;
          font-size: 14px;
          color: #687267;
        }
        h1 {
          margin: 0 0 16px;
          font-size: 38px;
          font-weight: 800;
          letter-spacing: -1.5px;
        }
        .intro {
          margin: 0 0 28px;
          font-size: 18px;
          line-height: 1.6;
        }
        .cards {
          display: grid;
          gap: 16px;
        }
        button {
          font: inherit;
          cursor: pointer;
        }
        .card {
          width: 100%;
          padding: 24px;
          border-radius: 22px;
          text-align: left;
          box-sizing: border-box;
        }
        .card strong {
          display: block;
          font-size: 21px;
        }
        .card span {
          display: block;
          margin-top: 8px;
          font-size: 14px;
          line-height: 1.7;
        }
        .admin {
          border: 1px solid #182620;
          background: #182620;
          color: #fff;
          box-shadow: 0 8px 24px rgba(24,38,32,0.12);
        }
        .admin span {
          color: #d6dfd7;
        }
        .worker {
          border: 1px solid #dce1d8;
          background: #fff;
          color: #182620;
        }
        .worker span {
          color: #687267;
        }
        .guide {
          padding: 20px;
          border: 1px solid #dce1d8;
          border-radius: 18px;
          background: #fff;
        }
        .guide h2 {
          margin: 0 0 10px;
          font-size: 17px;
          line-height: 1.5;
        }
        .guide p {
          margin: 0 0 16px;
          color: #586357;
          font-size: 14px;
          line-height: 1.8;
          white-space: pre-line;
          overflow-wrap: anywhere;
        }
        .guide :global(a) {
          display: block;
          margin-top: 10px;
          padding: 14px 16px;
          border-radius: 12px;
          text-align: center;
          text-decoration: none;
          background: #182620;
          color: #fff;
          font-size: 15px;
          font-weight: 700;
        }
        .guide :global(a.light) {
          background: #f3efe4;
          color: #182620;
          border: 1px solid #e4ddcd;
        }
        .install {
          margin-top: 30px;
          padding-top: 24px;
          border-top: 1px solid #dedfd4;
        }
        .install p {
          margin: 0 0 12px;
          text-align: center;
          font-size: 14px;
          color: #687267;
        }
        .install button {
          width: 100%;
          padding: 16px;
          border: 1px solid #c7aa68;
          border-radius: 14px;
          background: #e8d7af;
          color: #182620;
          font-size: 17px;
          font-weight: 800;
        }
        button:disabled {
          opacity: 0.65;
          cursor: wait;
        }
        .feedback {
          margin-top: 14px;
        }
        .feedback button {
          padding: 10px 14px;
          border: 1px solid #e4ddcd;
          border-radius: 10px;
          background: #f3efe4;
          color: #182620;
          font-weight: 700;
        }
        button:focus-visible,
        .guide :global(a:focus-visible) {
          outline: 3px solid #9b7532;
          outline-offset: 4px;
        }
        .footer {
          margin: 28px 0 0;
          text-align: center;
          font-size: 13px;
          color: #687267;
        }
      `}</style>
    </main>
  );
}
