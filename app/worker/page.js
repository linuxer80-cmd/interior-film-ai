"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function WorkerPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [worker, setWorker] = useState(null);
  const [message, setMessage] = useState("");

  /* =========================================================
     처음 접속할 때 로그인 + 시공자 계정 확인
  ========================================================= */

  useEffect(() => {
    checkWorker();
  }, []);

  async function checkWorker() {
    setLoading(true);
    setMessage("");

    try {
      /* =====================================================
         1. 로그인 사용자 확인
      ===================================================== */

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      /* 로그인 안 되어 있으면 시공자 로그인으로 이동 */

      if (!user) {
        router.replace("/worker/login");
        return;
      }

      /* =====================================================
         2. 로그인 계정과 연결된 시공자 조회
      ===================================================== */

      const { data, error } = await supabase.rpc(
        "get_my_worker"
      );

      if (error) {
        throw error;
      }

      /*
       * get_my_worker()는 현재 기존 로그인 페이지에서도
       * 배열의 첫 번째 행을 사용하고 있음.
       *
       * 혹시 반환 형태가 객체인 경우도 대응.
       */

      const workerData = Array.isArray(data)
        ? data[0]
        : data;

      /* =====================================================
         3. 시공자 연결 여부 확인
      ===================================================== */

      if (!workerData?.worker_id) {
        await supabase.auth.signOut();

        setMessage(
          "등록된 시공자 계정을 찾을 수 없습니다."
        );

        setTimeout(() => {
          router.replace("/worker/login");
        }, 1500);

        return;
      }

      /* =====================================================
         4. 활성 상태 확인
      ===================================================== */

      if (
        workerData.worker_is_active === false
      ) {
        await supabase.auth.signOut();

        setMessage(
          "현재 사용이 중지된 시공자 계정입니다. 회사 관리자에게 문의해주세요."
        );

        return;
      }

      /* =====================================================
         5. 정상 시공자
      ===================================================== */

      setWorker(workerData);
    } catch (error) {
      console.error(
        "시공자 계정 확인 오류:",
        error
      );

      setMessage(
        `❌ ${
          error?.message ||
          "시공자 정보를 불러오지 못했습니다."
        }`
      );
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     로그아웃
  ========================================================= */

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error(
        "로그아웃 오류:",
        error
      );
    } finally {
      router.replace("/worker/login");
      router.refresh();
    }
  }

  /* =========================================================
     로딩
  ========================================================= */

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#f8fafc",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            color: "#64748b",
            fontSize: "14px",
            fontWeight: "700",
          }}
        >
          시공자 정보를 확인하고 있습니다...
        </div>
      </main>
    );
  }

  /* =========================================================
     시공자 정보 없음 / 오류
  ========================================================= */

  if (!worker) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#f8fafc",
          padding: "20px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "520px",
            margin: "60px auto 0",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "16px",
            padding: "22px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              fontSize: "18px",
              fontWeight: "900",
              color: "#111827",
            }}
          >
            시공자 페이지
          </div>

          <div
            style={{
              marginTop: "12px",
              color: "#b91c1c",
              fontSize: "14px",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          >
            {message ||
              "시공자 정보를 확인할 수 없습니다."}
          </div>

          <button
            type="button"
            onClick={() => {
              router.replace("/worker/login");
              router.refresh();
            }}
            style={{
              width: "100%",
              marginTop: "18px",
              padding: "12px",
              border: "none",
              borderRadius: "10px",
              background: "#111827",
              color: "#ffffff",
              fontWeight: "800",
              cursor: "pointer",
            }}
          >
            로그인으로 이동
          </button>
        </div>
      </main>
    );
  }

  /* =========================================================
     시공자 메인
  ========================================================= */

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        color: "#111827",
        paddingBottom: "40px",
      }}
    >
      {/* =====================================================
          상단
      ===================================================== */}

      <header
        style={{
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "720px",
            margin: "0 auto",
            padding: "16px",
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "12px",
                color: "#64748b",
                fontWeight: "700",
              }}
            >
              시공자 전용
            </div>

            <div
              style={{
                marginTop: "2px",
                fontSize: "20px",
                fontWeight: "900",
                color: "#111827",
              }}
            >
              현장 관리
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            style={{
              flex: "0 0 auto",
              border: "1px solid #cbd5e1",
              borderRadius: "9px",
              background: "#ffffff",
              color: "#475569",
              padding: "8px 11px",
              fontSize: "12px",
              fontWeight: "800",
              cursor: "pointer",
            }}
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* =====================================================
          본문
      ===================================================== */}

      <div
        style={{
          width: "100%",
          maxWidth: "720px",
          margin: "0 auto",
          padding: "16px",
          boxSizing: "border-box",
        }}
      >
        {/* ===================================================
            시공자 정보
        =================================================== */}

        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "16px",
            padding: "18px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                flex: "0 0 48px",
                borderRadius: "50%",
                background: "#f1f5f9",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "24px",
              }}
            >
              👷
            </div>

            <div
              style={{
                minWidth: 0,
              }}
            >
              <div
                style={{
                  fontSize: "18px",
                  fontWeight: "900",
                  color: "#111827",
                  wordBreak: "break-word",
                }}
              >
                {worker.worker_name ||
                  "시공자"}
              </div>

              <div
                style={{
                  marginTop: "3px",
                  color: "#64748b",
                  fontSize: "13px",
                  wordBreak: "break-word",
                }}
              >
                {worker.worker_phone ||
                  "전화번호 없음"}
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================
            안내
        =================================================== */}

        <section
          style={{
            marginTop: "14px",
            padding: "14px",
            borderRadius: "12px",
            background: "#ecfdf5",
            border: "1px solid #d1fae5",
          }}
        >
          <div
            style={{
              color: "#047857",
              fontSize: "13px",
              fontWeight: "800",
            }}
          >
            ✅ 시공자 계정 연결 완료
          </div>

          <div
            style={{
              marginTop: "5px",
              color: "#065f46",
              fontSize: "12px",
              lineHeight: 1.6,
            }}
          >
            회사에 등록된 시공자 정보와
            현재 로그인 계정이 정상적으로
            연결되어 있습니다.
          </div>
        </section>

        {/* ===================================================
            내 현장
        =================================================== */}

        <section
          style={{
            marginTop: "14px",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "16px",
            padding: "18px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
            }}
          >
            <div
              style={{
                fontSize: "16px",
                fontWeight: "900",
                color: "#111827",
              }}
            >
              📅 내 현장
            </div>

            <div
              style={{
                padding: "5px 8px",
                borderRadius: "999px",
                background: "#f1f5f9",
                color: "#64748b",
                fontSize: "11px",
                fontWeight: "800",
              }}
            >
              준비 중
            </div>
          </div>

          <div
            style={{
              marginTop: "16px",
              padding: "25px 12px",
              border: "1px dashed #cbd5e1",
              borderRadius: "12px",
              background: "#f8fafc",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "26px",
              }}
            >
              🏠
            </div>

            <div
              style={{
                marginTop: "8px",
                color: "#334155",
                fontSize: "14px",
                fontWeight: "800",
              }}
            >
              시공자 계정 준비 완료
            </div>

            <div
              style={{
                marginTop: "5px",
                color: "#64748b",
                fontSize: "12px",
                lineHeight: 1.6,
              }}
            >
              다음 단계에서 이 시공자에게
              배정된 현장만 표시하도록
              연결합니다.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
                  }
