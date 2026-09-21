"use client";

import { useCallback, useState } from "react";
import { supabase } from "../../../lib/supabase";

export default function useWorkers({
  companyId,
}) {
  const [workers, setWorkers] =
    useState([]);

  const [
    workersLoading,
    setWorkersLoading,
  ] = useState(false);

  const [
    workersMessage,
    setWorkersMessage,
  ] = useState("");

  /* =========================================================
     시공자 목록
  ========================================================= */

  const loadWorkers = useCallback(
    async (
      targetCompanyId = companyId,
    ) => {
      if (!targetCompanyId) {
        return [];
      }

      setWorkersLoading(true);
      setWorkersMessage("");

      try {
        const {
          data,
          error,
        } = await supabase
          .from("workers")
          .select(`
            id,
            company_id,
            name,
            phone,
            position,
            specialties,
            memo,
            user_id,
            is_active,
            created_at,
            updated_at
          `)
          .eq(
            "company_id",
            targetCompanyId,
          )
          .order("is_active", {
            ascending: false,
          })
          .order("name", {
            ascending: true,
          });

        if (error) {
          throw error;
        }

        const rows =
          data || [];

        setWorkers(rows);

        return rows;
      } catch (error) {
        console.error(
          "시공자 목록 조회:",
          error,
        );

        setWorkers([]);

        setWorkersMessage(
          `❌ 시공자 목록 오류: ${
            error?.message ||
            "불러오기 실패"
          }`,
        );

        return [];
      } finally {
        setWorkersLoading(false);
      }
    },
    [companyId],
  );

  /* =========================================================
     시공자 등록
  ========================================================= */

  const createWorker = useCallback(
    async (form) => {
      if (!companyId) {
        return {
          success: false,
          error:
            "회사 정보를 확인할 수 없습니다.",
        };
      }

      const name =
        String(
          form?.name || "",
        ).trim();

      if (!name) {
        return {
          success: false,
          error:
            "시공자 이름을 입력해주세요.",
        };
      }

      setWorkersLoading(true);
      setWorkersMessage("");

      try {
        const specialties =
          Array.isArray(
            form?.specialties,
          )
            ? form.specialties
                .map((item) =>
                  String(
                    item || "",
                  ).trim(),
                )
                .filter(Boolean)
            : String(
                form?.specialties ||
                  "",
              )
                .split(",")
                .map((item) =>
                  item.trim(),
                )
                .filter(Boolean);

        const {
          data,
          error,
        } = await supabase
          .from("workers")
          .insert({
            company_id:
              companyId,

            name,

            phone:
              String(
                form?.phone ||
                  "",
              ).trim() ||
              null,

            position:
              String(
                form?.position ||
                  "",
              ).trim() ||
              null,

            specialties,

            memo:
              String(
                form?.memo ||
                  "",
              ).trim() ||
              null,

            is_active: true,
          })
          .select()
          .single();

        if (error) {
          throw error;
        }

        setWorkers(
          (current) =>
            [...current, data].sort(
              (a, b) => {
                if (
                  a.is_active !==
                  b.is_active
                ) {
                  return a.is_active
                    ? -1
                    : 1;
                }

                return String(
                  a.name || "",
                ).localeCompare(
                  String(
                    b.name || "",
                  ),
                  "ko",
                );
              },
            ),
        );

        setWorkersMessage(
          `✅ ${name} 시공자가 등록되었습니다.`,
        );

        return {
          success: true,
          worker: data,
        };
      } catch (error) {
        console.error(
          "시공자 등록:",
          error,
        );

        const message =
          error?.message ||
          "시공자 등록에 실패했습니다.";

        setWorkersMessage(
          `❌ ${message}`,
        );

        return {
          success: false,
          error: message,
        };
      } finally {
        setWorkersLoading(false);
      }
    },
    [companyId],
  );

  /* =========================================================
     시공자 정보 수정
  ========================================================= */

  const updateWorker = useCallback(
    async (
      workerId,
      form,
    ) => {
      if (
        !companyId ||
        !workerId
      ) {
        return {
          success: false,
          error:
            "시공자 정보를 확인할 수 없습니다.",
        };
      }

      const name =
        String(
          form?.name || "",
        ).trim();

      if (!name) {
        return {
          success: false,
          error:
            "시공자 이름을 입력해주세요.",
        };
      }

      setWorkersLoading(true);
      setWorkersMessage("");

      try {
        const specialties =
          Array.isArray(
            form?.specialties,
          )
            ? form.specialties
                .map((item) =>
                  String(
                    item || "",
                  ).trim(),
                )
                .filter(Boolean)
            : String(
                form?.specialties ||
                  "",
              )
                .split(",")
                .map((item) =>
                  item.trim(),
                )
                .filter(Boolean);

        const {
          data,
          error,
        } = await supabase
          .from("workers")
          .update({
            name,

            phone:
              String(
                form?.phone ||
                  "",
              ).trim() ||
              null,

            position:
              String(
                form?.position ||
                  "",
              ).trim() ||
              null,

            specialties,

            memo:
              String(
                form?.memo ||
                  "",
              ).trim() ||
              null,

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            workerId,
          )
          .eq(
            "company_id",
            companyId,
          )
          .select()
          .single();

        if (error) {
          throw error;
        }

        setWorkers(
          (current) =>
            current.map(
              (worker) =>
                worker.id ===
                workerId
                  ? {
                      ...worker,
                      ...data,
                    }
                  : worker,
            ),
        );

        setWorkersMessage(
          "✅ 시공자 정보가 수정되었습니다.",
        );

        return {
          success: true,
          worker: data,
        };
      } catch (error) {
        console.error(
          "시공자 수정:",
          error,
        );

        const message =
          error?.message ||
          "시공자 수정에 실패했습니다.";

        setWorkersMessage(
          `❌ ${message}`,
        );

        return {
          success: false,
          error: message,
        };
      } finally {
        setWorkersLoading(false);
      }
    },
    [companyId],
  );

  /* =========================================================
     시공자 활성 / 비활성
     기존 현장 기록 보존을 위해 실제 삭제하지 않음
  ========================================================= */

  const setWorkerActive =
    useCallback(
      async (
        workerId,
        isActive,
      ) => {
        if (
          !companyId ||
          !workerId
        ) {
          return {
            success: false,
          };
        }

        setWorkersMessage("");

        try {
          const {
            data,
            error,
          } = await supabase
            .from("workers")
            .update({
              is_active:
                Boolean(
                  isActive,
                ),

              updated_at:
                new Date().toISOString(),
            })
            .eq(
              "id",
              workerId,
            )
            .eq(
              "company_id",
              companyId,
            )
            .select()
            .single();

          if (error) {
            throw error;
          }

          setWorkers(
            (current) =>
              current.map(
                (worker) =>
                  worker.id ===
                    workerId
                    ? {
                        ...worker,
                        ...data,
                      }
                    : worker,
              ),
          );

          setWorkersMessage(
            isActive
              ? "✅ 시공자를 다시 활성화했습니다."
              : "✅ 시공자를 비활성화했습니다.",
          );

          return {
            success: true,
            worker: data,
          };
        } catch (error) {
          console.error(
            "시공자 상태 변경:",
            error,
          );

          const message =
            error?.message ||
            "상태 변경에 실패했습니다.";

          setWorkersMessage(
            `❌ ${message}`,
          );

          return {
            success: false,
            error: message,
          };
        }
      },
      [companyId],
    );

  /* =========================================================
     시공자 계정 초대

     관리자만 실행
     DB의 create_worker_invite()가
     현재 회사와 시공자 소속을 다시 검증한다.
  ========================================================= */

  const createWorkerInvite =
    useCallback(
      async (worker) => {
        if (
          !companyId ||
          !worker?.id
        ) {
          return {
            success: false,
            error:
              "시공자 정보를 확인할 수 없습니다.",
          };
        }

        if (
          worker.is_active === false
        ) {
          return {
            success: false,
            error:
              "비활성 시공자는 계정을 초대할 수 없습니다.",
          };
        }

        if (worker.user_id) {
          return {
            success: false,
            alreadyLinked: true,
            error:
              "이미 로그인 계정이 연결된 시공자입니다.",
          };
        }

        setWorkersLoading(true);
        setWorkersMessage("");

        try {
          const {
            data,
            error,
          } = await supabase.rpc(
            "create_worker_invite",
            {
              target_worker_id:
                worker.id,
            },
          );

          if (error) {
            throw error;
          }

          if (!data) {
            throw new Error(
              "초대코드를 생성하지 못했습니다.",
            );
          }

          const inviteCode =
            String(data);

          setWorkersMessage(
            `✅ ${worker.name || "시공자"} 계정 초대코드가 생성되었습니다.`,
          );

          return {
            success: true,
            inviteCode,
            workerId:
              worker.id,
            workerName:
              worker.name || "",
          };
        } catch (error) {
          console.error(
            "시공자 계정 초대:",
            error,
          );

          const message =
            error?.message ||
            "시공자 계정 초대에 실패했습니다.";

          setWorkersMessage(
            `❌ ${message}`,
          );

          return {
            success: false,
            error: message,
          };
        } finally {
          setWorkersLoading(false);
        }
      },
      [companyId],
    );

  /* =========================================================
     현장 시공자 배정

     leader = 책임 팀장 1명
     member = 담당 시공자
  ========================================================= */

  const assignSiteWorkers =
    useCallback(
      async ({
        siteId,
        leaderId = null,
        memberIds = [],
      }) => {
        if (
          !companyId ||
          !siteId
        ) {
          return {
            success: false,
            error:
              "현장 정보를 확인할 수 없습니다.",
          };
        }

        setWorkersLoading(true);
        setWorkersMessage("");

        try {
          /*
           * 중복 제거
           *
           * 팀장으로 선택된 사람은
           * member에서 자동 제외
           */

          const cleanMemberIds =
            [
              ...new Set(
                (
                  memberIds ||
                  []
                ).filter(
                  Boolean,
                ),
              ),
            ].filter(
              (id) =>
                id !==
                leaderId,
            );

          /*
           * 기존 배정 삭제
           */

          const {
            error:
              deleteError,
          } = await supabase
            .from(
              "site_workers",
            )
            .delete()
            .eq(
              "site_id",
              siteId,
            )
            .eq(
              "company_id",
              companyId,
            );

          if (deleteError) {
            throw deleteError;
          }

          /*
           * 새 배정 데이터
           */

          const assignments = [];

          if (leaderId) {
            assignments.push({
              company_id:
                companyId,

              site_id:
                siteId,

              worker_id:
                leaderId,

              role:
                "leader",
            });
          }

          for (
            const workerId of
              cleanMemberIds
          ) {
            assignments.push({
              company_id:
                companyId,

              site_id:
                siteId,

              worker_id:
                workerId,

              role:
                "member",
            });
          }

          /*
           * 아무도 선택하지 않은 경우
           * 기존 배정 삭제만 하고 종료
           */

          if (
            assignments.length ===
            0
          ) {
            setWorkersMessage(
              "✅ 현장 시공자 배정을 해제했습니다.",
            );

            return {
              success: true,
              assignments: [],
            };
          }

          const {
            data,
            error,
          } = await supabase
            .from(
              "site_workers",
            )
            .insert(
              assignments,
            )
            .select(`
              id,
              company_id,
              site_id,
              worker_id,
              role,
              assigned_at,
              workers (
                id,
                name,
                phone,
                position
              )
            `);

          if (error) {
            throw error;
          }

          setWorkersMessage(
            "✅ 현장 시공자 배정이 저장되었습니다.",
          );

          return {
            success: true,
            assignments:
              data || [],
          };
        } catch (error) {
          console.error(
            "현장 시공자 배정:",
            error,
          );

          const message =
            error?.message ||
            "시공자 배정에 실패했습니다.";

          setWorkersMessage(
            `❌ ${message}`,
          );

          return {
            success: false,
            error: message,
          };
        } finally {
          setWorkersLoading(false);
        }
      },
      [companyId],
    );

  /* =========================================================
     특정 현장 배정 조회
  ========================================================= */

  const loadSiteWorkers =
    useCallback(
      async (siteId) => {
        if (
          !companyId ||
          !siteId
        ) {
          return [];
        }

        try {
          const {
            data,
            error,
          } = await supabase
            .from(
              "site_workers",
            )
            .select(`
              id,
              site_id,
              worker_id,
              role,
              assigned_at,
              workers (
                id,
                name,
                phone,
                position,
                specialties,
                is_active
              )
            `)
            .eq(
              "company_id",
              companyId,
            )
            .eq(
              "site_id",
              siteId,
            )
            .order(
              "assigned_at",
              {
                ascending: true,
              },
            );

          if (error) {
            throw error;
          }

          return data || [];
        } catch (error) {
          console.error(
            "현장 배정 조회:",
            error,
          );

          setWorkersMessage(
            `❌ 담당자 조회 오류: ${
              error?.message ||
              "실패"
            }`,
          );

          return [];
        }
      },
      [companyId],
    );

  /* =========================================================
     메시지 초기화
  ========================================================= */

  function clearWorkersMessage() {
    setWorkersMessage("");
  }

  return {
    workers,
    workersLoading,
    workersMessage,

    loadWorkers,
    createWorker,
    updateWorker,
    setWorkerActive,

    createWorkerInvite,

    assignSiteWorkers,
    loadSiteWorkers,

    clearWorkersMessage,
  };
          }
