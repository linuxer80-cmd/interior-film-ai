"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  supabase,
} from "../../../lib/supabase";

export default function useAdminCompany() {
  const router =
    useRouter();

  /* =========================================================
     관리자 / 업체 상태
  ========================================================= */

  const [
    currentCompany,
    setCurrentCompany,
  ] = useState(null);

  const [
    adminReady,
    setAdminReady,
  ] = useState(false);

  /* =========================================================
     업체 정보
  ========================================================= */

  const companyId =
    currentCompany?.company_id ||
    null;

  const companyName =
    currentCompany?.company_name ||
    "관리자";

  /* =========================================================
     관리자 로그인 및 업체 확인
  ========================================================= */

  useEffect(() => {
    let cancelled =
      false;

    async function checkAdminSession() {
      try {
        /* -----------------------------------------------------
           로그인 세션 확인
        ----------------------------------------------------- */

        const {
          data:
            sessionData,
          error:
            sessionError,
        } =
          await supabase.auth.getSession();

        if (
          sessionError
        ) {
          throw sessionError;
        }

        /*
         * 로그인하지 않은 경우
         */
        if (
          !sessionData
            ?.session
            ?.user
        ) {
          router.replace(
            "/login",
          );

          return;
        }

        /* -----------------------------------------------------
           현재 사용자의 업체 조회
        ----------------------------------------------------- */

        const {
          data,
          error,
        } =
          await supabase.rpc(
            "get_my_company",
          );

        if (error) {
          throw error;
        }

        const company =
          Array.isArray(
            data,
          )
            ? data[0]
            : null;

        /* -----------------------------------------------------
           업체가 없거나 비활성화된 경우
        ----------------------------------------------------- */

        if (
          !company?.company_id ||
          company.is_active ===
            false
        ) {
          await supabase.auth.signOut();

          router.replace(
            "/login",
          );

          return;
        }

        /* -----------------------------------------------------
           정상 관리자
        ----------------------------------------------------- */

        if (!cancelled) {
          setCurrentCompany(
            company,
          );

          setAdminReady(
            true,
          );
        }
      } catch (error) {
        console.error(
          "관리자 로그인 확인:",
          error,
        );

        if (!cancelled) {
          setAdminReady(
            false,
          );

          router.replace(
            "/login",
          );
        }
      }
    }

    checkAdminSession();

    return () => {
      cancelled =
        true;
    };
  }, [router]);

  /* =========================================================
     로그아웃
  ========================================================= */

  async function logout() {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error(
        "로그아웃:",
        error,
      );
    } finally {
      router.replace(
        "/login",
      );
    }
  }

  /* =========================================================
     외부 사용
  ========================================================= */

  return {
    currentCompany,

    adminReady,

    companyId,

    companyName,

    logout,
  };
}
