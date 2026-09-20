"use client";

import { useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";

const INITIAL_STRUCTURE_ANALYSIS = {
  total: 0,
  completed: 0,
  remaining: 0,
  failed: 0,
  processed: 0,
  running: false,
  finished: false,
  message: "",
  errors: [],
};

export default function useStructureAnalysis() {
  const [
    structureAnalysis,
    setStructureAnalysis,
  ] = useState(
    INITIAL_STRUCTURE_ANALYSIS,
  );

  const structureStopRef =
    useRef(false);

  async function runStructureAnalysis() {
    if (
      structureAnalysis.running
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        "기존 시공사진의 구조를 AI로 분석합니다.\n\n" +
          "기존 카테고리, 금액, 임베딩은 변경하지 않고\n" +
          "새 구조분석 정보만 저장합니다.\n\n" +
          "사진 수에 따라 시간이 걸릴 수 있습니다.\n" +
          "시작할까요?",
      );

    if (!confirmed) {
      return;
    }

    structureStopRef.current =
      false;

    let totalFailed = 0;
    let totalProcessed = 0;
    let previousRemaining = null;
    let noProgressCount = 0;

    const collectedErrors = [];

    function collectApiErrors(data) {
      const results =
        Array.isArray(
          data?.results,
        )
          ? data.results
          : [];

      for (
        const result of results
      ) {
        if (
          result?.success !==
            false ||
          !result?.error
        ) {
          continue;
        }

        const photoId =
          result?.id
            ? String(result.id)
            : "ID 없음";

        const storagePath =
          result?.storage_path
            ? String(
                result.storage_path,
              )
            : "";

        const errorText =
          String(result.error);

        const text = [
          `사진 ID: ${photoId}`,
          storagePath
            ? `경로: ${storagePath}`
            : "",
          `오류: ${errorText}`,
        ]
          .filter(Boolean)
          .join("\n");

        if (
          !collectedErrors.includes(
            text,
          )
        ) {
          collectedErrors.push(
            text,
          );
        }
      }

      if (
        collectedErrors.length >
        10
      ) {
        collectedErrors.splice(
          10,
        );
      }
    }

    function makeErrorMessage(
      prefix,
      remaining,
    ) {
      const visibleErrors =
        collectedErrors.slice(
          0,
          3,
        );

      let text = prefix;

      if (
        remaining !== null &&
        remaining !== undefined
      ) {
        text +=
          `\n남은 사진 ${remaining}장`;
      }

      if (
        visibleErrors.length > 0
      ) {
        text +=
          "\n\n실제 오류:";

        visibleErrors.forEach(
          (item, index) => {
            text +=
              `\n\n${index + 1}. ${item}`;
          },
        );

        if (
          collectedErrors.length >
          3
        ) {
          text +=
            `\n\n외 ${
              collectedErrors.length -
              3
            }개 오류`;
        }
      }

      return text;
    }

    setStructureAnalysis(
      (current) => ({
        ...current,
        running: true,
        finished: false,
        failed: 0,
        processed: 0,
        errors: [],
        message:
          "AI 구조분석을 시작합니다...",
      }),
    );

    try {
      while (
        !structureStopRef.current
      ) {
        /*
         * 현재 로그인 세션의
         * Access Token을 사용한다.
         *
         * 서버 API가 토큰으로
         * 실제 업체를 판별하므로
         * companyId를 클라이언트에서
         * 전달하지 않는다.
         */
        const {
          data: { session },
        } =
          await supabase.auth.getSession();

        if (
          !session?.access_token
        ) {
          throw new Error(
            "로그인이 만료되었습니다. 다시 로그인해주세요.",
          );
        }

        const response =
          await fetch(
            "/api/analyze-work-structure",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",

                Authorization:
                  `Bearer ${session.access_token}`,
              },

              body:
                JSON.stringify({
                  limit: 3,
                }),
            },
          );

        let data;

        try {
          data =
            await response.json();
        } catch {
          throw new Error(
            `구조분석 API 응답을 읽을 수 없습니다. HTTP ${response.status}`,
          );
        }

        if (
          !response.ok ||
          !data?.success
        ) {
          const apiError =
            data?.error ||
            `구조분석 API 오류 (${response.status})`;

          if (
            !collectedErrors.includes(
              apiError,
            )
          ) {
            collectedErrors.push(
              apiError,
            );
          }

          throw new Error(
            apiError,
          );
        }

        collectApiErrors(data);

        const total =
          Number(
            data.total || 0,
          );

        const completed =
          Number(
            data.completed || 0,
          );

        const remaining =
          Number(
            data.remaining || 0,
          );

        const processed =
          Number(
            data.processed || 0,
          );

        const failed =
          Number(
            data.failed || 0,
          );

        totalProcessed +=
          processed;

        totalFailed +=
          failed;

        /*
         * 사용자가 중지 버튼을
         * 눌렀는지 확인
         */
        if (
          structureStopRef.current
        ) {
          setStructureAnalysis({
            total,
            completed,
            remaining,

            failed:
              totalFailed,

            processed:
              totalProcessed,

            running: false,
            finished: false,

            errors: [
              ...collectedErrors,
            ],

            message:
              makeErrorMessage(
                "⏸️ 구조분석을 중지했습니다. 다시 시작하면 남은 사진부터 계속합니다.",
                remaining,
              ),
          });

          break;
        }

        /*
         * 현재 진행상황 반영
         */
        setStructureAnalysis({
          total,
          completed,
          remaining,

          failed:
            totalFailed,

          processed:
            totalProcessed,

          running: true,

          finished:
            data.finished ===
              true ||
            remaining === 0,

          errors: [
            ...collectedErrors,
          ],

          message:
            remaining === 0
              ? "✅ 기존 시공사진 구조분석이 완료되었습니다."
              : `AI 구조분석 중... ${completed}/${total}`,
        });

        /*
         * 전체 완료
         */
        if (
          data.finished ===
            true ||
          remaining === 0
        ) {
          setStructureAnalysis(
            (current) => ({
              ...current,

              running: false,
              finished: true,

              errors: [
                ...collectedErrors,
              ],

              message:
                totalFailed > 0
                  ? makeErrorMessage(
                      `✅ 구조분석 완료 · 완료 ${completed}장 · 이번 실행 실패 ${totalFailed}회`,
                      0,
                    )
                  : "✅ 기존 시공사진 구조분석이 완료되었습니다.",
            }),
          );

          break;
        }

        /*
         * API가 실제로 진행되고
         * 있는지 확인한다.
         *
         * 동일한 remaining이
         * 반복되면 무한 루프를
         * 방지하기 위해 중단한다.
         */
        if (
          processed > 0 ||
          previousRemaining ===
            null ||
          remaining <
            previousRemaining
        ) {
          noProgressCount = 0;
        } else {
          noProgressCount += 1;
        }

        previousRemaining =
          remaining;

        if (
          noProgressCount >= 2
        ) {
          setStructureAnalysis(
            (current) => ({
              ...current,

              running: false,
              finished: false,

              errors: [
                ...collectedErrors,
              ],

              message:
                makeErrorMessage(
                  "⚠️ 반복 실패로 자동 분석을 중단했습니다.",
                  remaining,
                ),
            }),
          );

          break;
        }

        /*
         * 다음 3장 처리 전
         * 짧게 대기
         */
        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              500,
            ),
        );
      }
    } catch (error) {
      console.error(
        "시공사진 구조분석:",
        error,
      );

      const errorText =
        error?.message ||
        "실패";

      if (
        !collectedErrors.includes(
          errorText,
        )
      ) {
        collectedErrors.push(
          errorText,
        );
      }

      setStructureAnalysis(
        (current) => ({
          ...current,

          running: false,
          finished: false,

          errors: [
            ...collectedErrors,
          ],

          message:
            makeErrorMessage(
              `❌ 구조분석 오류: ${errorText}`,
              current.remaining,
            ),
        }),
      );
    }
  }

  function stopStructureAnalysis() {
    structureStopRef.current =
      true;

    setStructureAnalysis(
      (current) => ({
        ...current,

        running: false,

        message:
          "⏸️ 구조분석 중지를 요청했습니다. 현재 처리 중인 사진이 끝나면 중지됩니다.",
      }),
    );
  }

  function resetStructureAnalysis() {
    structureStopRef.current =
      false;

    setStructureAnalysis(
      INITIAL_STRUCTURE_ANALYSIS,
    );
  }

  return {
    structureAnalysis,
    setStructureAnalysis,

    runStructureAnalysis,
    stopStructureAnalysis,
    resetStructureAnalysis,
  };
        }
