"use client";

import { useState } from "react";
import { supabase } from "../../../lib/supabase";

import {
  getUsagePhotoPaths,
} from "../adminUtils";

import {
  SIGNED_URL_SECONDS,
} from "../adminConstants";

import {
  getCachedSignedUrl,
  setCachedSignedUrl,
} from "../signedUrlCache";

import {
  fetchUsageDashboard,
} from "../usageDataService";

export default function useUsage({
  companyId,
}) {
  /* =========================================================
     로그 통계
  ========================================================= */

  const [
    usageStats,
    setUsageStats,
  ] = useState({
    today: 0,
    sevenDays: 0,
    total: 0,
    sessions: 0,
    leads: 0,
    converted: 0,
    conversion: 0,
  });

  const [
    usageRecent,
    setUsageRecent,
  ] = useState([]);

  const [
    usageLoading,
    setUsageLoading,
  ] = useState(false);

  const [
    usageMessage,
    setUsageMessage,
  ] = useState("");

  /* =========================================================
     자동견적 사진
  ========================================================= */

  const [
    openUsagePhotoId,
    setOpenUsagePhotoId,
  ] = useState(null);

  const [
    usagePhotoUrls,
    setUsagePhotoUrls,
  ] = useState({});

  const [
    usagePhotoLoadingId,
    setUsagePhotoLoadingId,
  ] = useState(null);

  /* =========================================================
     자동견적 사진 열기 / 닫기
  ========================================================= */

  async function toggleUsagePhotos(
    row,
  ) {
    if (!row?.id) {
      return;
    }

    /*
     * 이미 열려 있으면 닫기
     */
    if (
      openUsagePhotoId ===
      row.id
    ) {
      setOpenUsagePhotoId(
        null,
      );

      return;
    }

    const paths =
      getUsagePhotoPaths(
        row,
      );

    /*
     * 사진이 없는 경우
     */
    if (
      paths.length === 0
    ) {
      setUsageMessage(
        "⚠️ 저장된 자동견적 사진이 없습니다.",
      );

      return;
    }

    /*
     * 이미 Signed URL을
     * 불러온 경우 재사용
     */
    const cached =
      usagePhotoUrls[
        row.id
      ];

    if (
      Array.isArray(
        cached,
      ) &&
      cached.length > 0
    ) {
      setOpenUsagePhotoId(
        row.id,
      );

      return;
    }

    setUsagePhotoLoadingId(
      row.id,
    );

    try {
      const urls = [];

      /* =====================================================
         사진별 Signed URL 생성
      ===================================================== */

      for (
        const path of paths
      ) {
        /*
         * 기존 캐시 먼저 확인
         */
        const cachedUrl =
          getCachedSignedUrl(
            path,
          );

        if (cachedUrl) {
          urls.push({
            path,
            url: cachedUrl,
          });

          continue;
        }

        /*
         * Supabase Signed URL 생성
         */
        const {
          data,
          error,
        } =
          await supabase.storage
            .from(
              "work-photos",
            )
            .createSignedUrl(
              path,
              SIGNED_URL_SECONDS,
            );

        if (error) {
          console.error(
            "자동견적 사진 Signed URL 오류:",
            path,
            error,
          );

          continue;
        }

        if (
          data?.signedUrl
        ) {
          /*
           * 공통 캐시에 저장
           */
          setCachedSignedUrl(
            path,
            data.signedUrl,
            SIGNED_URL_SECONDS,
          );

          urls.push({
            path,
            url:
              data.signedUrl,
          });
        }
      }

      /* =====================================================
         사진을 한 장도 못 불러온 경우
      ===================================================== */

      if (
        urls.length === 0
      ) {
        throw new Error(
          "저장된 사진을 불러올 수 없습니다. Storage 경로 또는 권한을 확인해주세요.",
        );
      }

      /* =====================================================
         화면용 URL 저장
      ===================================================== */

      setUsagePhotoUrls(
        (current) => ({
          ...current,

          [row.id]:
            urls,
        }),
      );

      setOpenUsagePhotoId(
        row.id,
      );

      /*
       * 일부 사진만 성공한 경우
       */
      if (
        urls.length <
        paths.length
      ) {
        setUsageMessage(
          `⚠️ 사진 ${paths.length}장 중 ${urls.length}장만 불러왔습니다.`,
        );
      }
    } catch (error) {
      console.error(
        "자동견적 사진 보기:",
        error,
      );

      setUsageMessage(
        `❌ 자동견적 사진 오류: ${
          error?.message ||
          "사진을 불러오지 못했습니다."
        }`,
      );
    } finally {
      setUsagePhotoLoadingId(
        null,
      );
    }
  }

  /* =========================================================
     로그 통계 불러오기
  ========================================================= */

  async function loadUsageStats(
    targetCompanyId =
      companyId,
  ) {
    if (!targetCompanyId) {
      return;
    }

    setUsageLoading(
      true,
    );

    setUsageMessage("");

    try {
      /*
       * 기존 usageDataService 사용
       *
       * 여기서 DB 조회 로직을
       * 새로 만들지 않음.
       */
      const {
        stats,
        recent,
      } =
        await fetchUsageDashboard(
          supabase,
          targetCompanyId,
        );

      setUsageStats(
        stats,
      );

      setUsageRecent(
        recent,
      );

      setOpenUsagePhotoId(
        null,
      );

      /* =====================================================
         로그가 없는 경우
      ===================================================== */

      if (
        stats.total === 0
      ) {
        setUsageMessage(
          "⚠️ estimate_usage 조회는 성공했지만 현재 확인되는 자동견적 로그가 없습니다.",
        );

        return;
      }

      /* =====================================================
         최근 로그 중 사진이 있는 건수
      ===================================================== */

      const recentPhotoCount =
        recent.filter(
          (row) =>
            getUsagePhotoPaths(
              row,
            ).length >
            0,
        ).length;

      setUsageMessage(
        `✅ 자동견적 전체 ${stats.total.toLocaleString(
          "ko-KR",
        )}건 · 최근 목록 ${recent.length}건 · 최근 사진 저장 ${recentPhotoCount}건 · 상세상담 전환 ${stats.converted.toLocaleString(
          "ko-KR",
        )}건`,
      );
    } catch (error) {
      console.error(
        "사용자 로그 통계 오류:",
        error,
      );

      /*
       * 오류 시 기존 값 초기화
       */
      setUsageStats({
        today: 0,
        sevenDays: 0,
        total: 0,
        sessions: 0,
        leads: 0,
        converted: 0,
        conversion: 0,
      });

      setUsageRecent(
        [],
      );

      setOpenUsagePhotoId(
        null,
      );

      setUsageMessage(
        `❌ 사용자 로그 조회 오류\n${
          error?.message ||
          "estimate_usage 조회에 실패했습니다."
        }\n\nSupabase의 estimate_usage RLS/SELECT 권한을 확인해주세요.`,
      );
    } finally {
      setUsageLoading(
        false,
      );
    }
  }

  /* =========================================================
     외부 사용
  ========================================================= */

  return {
    usageStats,

    usageRecent,

    usageLoading,

    usageMessage,
    setUsageMessage,

    openUsagePhotoId,

    usagePhotoUrls,

    usagePhotoLoadingId,

    toggleUsagePhotos,

    loadUsageStats,
  };
}
