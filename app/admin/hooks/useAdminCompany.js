"use client";

import { useState } from "react";
import { supabase } from "../../../lib/supabase";

const CUSTOMER_BASE_URL =
  "https://interior-film-ai.vercel.app";

export default function useAdminCompany() {
  const [
    adminReady,
    setAdminReady,
  ] = useState(false);

  const [
    currentCompany,
    setCurrentCompany,
  ] = useState(null);

  const [
    adminError,
    setAdminError,
  ] = useState("");

  const [
    copyMessage,
    setCopyMessage,
  ] = useState("");

  const companyId =
    currentCompany?.company_id ||
    currentCompany?.id ||
    null;

  const companyName =
    currentCompany?.company_name ||
    "관리자";

  const companySlug =
    currentCompany?.slug ||
    "";

  const customerEstimateUrl =
    companySlug
      ? `${CUSTOMER_BASE_URL}/estimate/${companySlug}`
      : "";

  /*
   * 로그인 상태와 현재 업체를 확인한다.
   *
   * 다른 Hook의 데이터를 여기서 불러오지 않는다.
   * 회사 확인만 담당한다.
   */
  async function initializeCompany() {
    setAdminError("");

    try {
      const {
        data: { session },
        error: sessionError,
      } =
        await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!session?.user) {
        if (
          typeof window !==
          "undefined"
        ) {
          window.location.href =
            "/login";
        }

        return null;
      }

      /*
       * 서버 DB 함수에서 로그인한
       * 사용자의 회사를 가져온다.
       */
      const {
        data: companyRows,
        error: companyError,
      } = await supabase.rpc(
        "get_my_company",
      );

      if (companyError) {
        throw companyError;
      }

      const company =
        Array.isArray(
          companyRows,
        )
          ? companyRows[0]
          : companyRows;

      const resolvedCompanyId =
        company?.company_id ||
        company?.id ||
        null;

      if (
        !company ||
        !resolvedCompanyId
      ) {
        throw new Error(
          "로그인 계정에 연결된 회사가 없습니다.",
        );
      }

      if (
        company?.is_active ===
        false
      ) {
        throw new Error(
          "비활성화된 회사 계정입니다.",
        );
      }

      setCurrentCompany(
        company,
      );

      return {
        company,
        companyId:
          resolvedCompanyId,
        session,
      };
    } catch (error) {
      console.error(
        "관리자 회사 확인:",
        error,
      );

      const errorMessage =
        error?.message ||
        "회사 정보를 불러오지 못했습니다.";

      setAdminError(
        `❌ 관리자 접속 오류: ${errorMessage}`,
      );

      return null;
    }
  }

  /*
   * 관리자 초기화가 모두 끝난 뒤
   * page.js에서 호출한다.
   */
  function markAdminReady() {
    setAdminReady(true);
  }

  /*
   * 필요할 경우 다시 로딩 상태로
   * 변경할 수 있도록 제공한다.
   */
  function markAdminLoading() {
    setAdminReady(false);
  }

  /*
   * 고객 AI 견적 페이지 주소 복사
   */
  async function copyCustomerEstimateUrl() {
    if (
      !customerEstimateUrl
    ) {
      setCopyMessage(
        "❌ 고객페이지 주소를 확인할 수 없습니다.",
      );

      return;
    }

    try {
      await navigator.clipboard.writeText(
        customerEstimateUrl,
      );

      setCopyMessage(
        "✅ 고객페이지 주소가 복사되었습니다.",
      );

      setTimeout(() => {
        setCopyMessage("");
      }, 2500);
    } catch (error) {
      console.error(
        "고객페이지 주소 복사:",
        error,
      );

      setCopyMessage(
        "❌ 주소 복사에 실패했습니다. 주소를 길게 눌러 복사해주세요.",
      );
    }
  }

  /*
   * 고객 AI 견적 페이지 열기
   */
  function openCustomerEstimatePage() {
    if (
      !customerEstimateUrl
    ) {
      return;
    }

    window.open(
      customerEstimateUrl,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return {
    adminReady,
    adminError,

    currentCompany,
    setCurrentCompany,

    companyId,
    companyName,
    companySlug,

    customerEstimateUrl,

    copyMessage,
    setCopyMessage,

    initializeCompany,
    markAdminReady,
    markAdminLoading,

    copyCustomerEstimateUrl,
    openCustomerEstimatePage,
  };
  }
