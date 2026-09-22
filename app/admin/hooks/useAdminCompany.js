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

  const [
    adminError,
    setAdminError,
  ] = useState("");

  const [
    copyMessage,
    setCopyMessage,
  ] = useState("");

  /* =========================================================
     업체 정보
  ========================================================= */

  const companyId =
    currentCompany?.company_id ||
    null;

  const companyName =
    currentCompany?.company_name ||
    "관리자";

  const companySlug =
    currentCompany?.slug ||
    currentCompany?.company_slug ||
    "";

  /* =========================================================
     업체별 고객 견적 페이지 URL

     예:
     slug = gibun
     → /estimate/gibun

     slug = company-1defd981
     → /estimate/company-1defd981
  ========================================================= */

  const customerEstimateUrl =
    companySlug &&
    typeof window !== "undefined"
      ? `${window.location.origin}/estimate/${encodeURIComponent(
          companySlug,
        )}`
      : "";

  /* =========================================================
     관리자 로그인 및 업체 확인
  ========================================================= */

  async function initializeCompany() {
    try {
      setAdminError("");

      /* -----------------------------------------------------
         로그인 세션 확인
      ----------------------------------------------------- */

      const {
        data: sessionData,
        error: sessionError,
      } =
        await supabase.auth.getSession();

      if (sessionError) {
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

        return null;
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
        Array.isArray(data)
          ? data[0]
          : data;

      /* -----------------------------------------------------
         업체가 없거나 비활성화된 경우
      ----------------------------------------------------- */

      if (
        !company?.company_id ||
        company.is_active === false
      ) {
        await supabase.auth.signOut();

        router.replace(
          "/login",
        );

        return null;
      }

      /* -----------------------------------------------------
         정상 관리자
      ----------------------------------------------------- */

      setCurrentCompany(
        company,
      );

      return {
        companyId:
          company.company_id,

        companyName:
          company.company_name,

        companySlug:
          company.slug ||
          company.company_slug ||
          "",

        company,
      };
    } catch (error) {
      console.error(
        "관리자 로그인 확인:",
        error,
      );

      setAdminError(
        error?.message ||
          "관리자 정보를 불러오지 못했습니다.",
      );

      return null;
    }
  }

  /* =========================================================
     최초 로그인 확인

     page.js에서도 initializeCompany()를 호출할 수 있으므로
     여기서는 세션이 없는 경우 로그인 화면 이동만 담당한다.
  ========================================================= */

  useEffect(() => {
    let cancelled =
      false;

    async function checkAdminSession() {
      try {
        const {
          data: sessionData,
          error: sessionError,
        } =
          await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (
          cancelled
        ) {
          return;
        }

        if (
          !sessionData
            ?.session
            ?.user
        ) {
          router.replace(
            "/login",
          );
        }
      } catch (error) {
        console.error(
          "관리자 세션 확인:",
          error,
        );

        if (
          !cancelled
        ) {
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
     관리자 준비 완료
  ========================================================= */

  function markAdminReady() {
    setAdminReady(
      true,
    );
  }

  /* =========================================================
     고객 견적페이지 열기
  ========================================================= */

  function openCustomerEstimatePage() {
    if (
      !customerEstimateUrl
    ) {
      setCopyMessage(
        "❌ 업체 견적페이지 주소를 확인할 수 없습니다.",
      );

      return;
    }

    window.open(
      customerEstimateUrl,
      "_blank",
      "noopener,noreferrer",
    );
  }

  /* =========================================================
     고객 견적페이지 주소 복사
  ========================================================= */

  async function copyCustomerEstimateUrl() {
    if (
      !customerEstimateUrl
    ) {
      setCopyMessage(
        "❌ 업체 견적페이지 주소를 확인할 수 없습니다.",
      );

      return;
    }

    try {
      await navigator.clipboard.writeText(
        customerEstimateUrl,
      );

      setCopyMessage(
        "✅ 고객 견적페이지 주소를 복사했습니다.",
      );
    } catch (error) {
      console.error(
        "견적페이지 주소 복사:",
        error,
      );

      setCopyMessage(
        "❌ 주소 복사에 실패했습니다.",
      );
    }
  }

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
    adminError,

    companyId,
    companyName,
    companySlug,

    customerEstimateUrl,

    copyMessage,

    initializeCompany,
    markAdminReady,

    copyCustomerEstimateUrl,
    openCustomerEstimatePage,

    logout,
  };
}
