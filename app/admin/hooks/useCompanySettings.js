"use client";

import { useState } from "react";
import { supabase } from "../../../lib/supabase";

export default function useCompanySettings({
  companyId,
}) {
  const [
    similarityThreshold,
    setSimilarityThreshold,
  ] = useState(0.65);

  const [
    settingMessage,
    setSettingMessage,
  ] = useState("");

  const [
    settingLoading,
    setSettingLoading,
  ] = useState(false);

  /*
   * 업체 설정 불러오기
   */
  async function loadSettings(
    scopedCompanyId = companyId,
  ) {
    try {
      if (!scopedCompanyId) {
        return;
      }

      const {
        data,
        error,
      } = await supabase
        .from("company_settings")
        .select(
          "similarity_threshold",
        )
        .eq(
          "company_id",
          scopedCompanyId,
        )
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (
        data?.similarity_threshold !==
          null &&
        data?.similarity_threshold !==
          undefined
      ) {
        setSimilarityThreshold(
          Number(
            data.similarity_threshold,
          ),
        );
      }
    } catch (error) {
      console.error(
        "설정 불러오기:",
        error,
      );
    }
  }

  /*
   * AI 유사도 기준 저장
   */
  async function saveSimilaritySetting() {
    setSettingLoading(true);
    setSettingMessage("");

    try {
      const threshold =
        Number(
          similarityThreshold,
        );

      if (
        !Number.isFinite(
          threshold,
        ) ||
        threshold < 0 ||
        threshold > 1
      ) {
        throw new Error(
          "유사도 기준은 0~1 사이 숫자로 입력해주세요.",
        );
      }

      if (!companyId) {
        throw new Error(
          "회사 정보를 확인할 수 없습니다.",
        );
      }

      const {
        error,
      } = await supabase
        .from("company_settings")
        .update({
          similarity_threshold:
            threshold,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "company_id",
          companyId,
        );

      if (error) {
        throw error;
      }

      setSettingMessage(
        `✅ AI 유사도 기준 ${Math.round(
          threshold * 100,
        )}% 저장 완료`,
      );
    } catch (error) {
      setSettingMessage(
        `❌ 설정 저장 오류: ${
          error?.message ||
          "실패"
        }`,
      );
    } finally {
      setSettingLoading(false);
    }
  }

  return {
    similarityThreshold,
    setSimilarityThreshold,

    settingMessage,
    setSettingMessage,

    settingLoading,

    loadSettings,
    saveSimilaritySetting,
  };
}
