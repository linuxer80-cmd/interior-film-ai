"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function useProfitExclusions() {
  const [ids, setIds] = useState([]);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");

  const lock = useRef(false);
  const generation = useRef(0);
  const alive = useRef(true);

  async function call(body, expectedUser) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      throw Error("다시 로그인해주세요.");
    }

    if (expectedUser && session.user.id !== expectedUser) {
      throw Error("계정이 변경되었습니다. 다시 조회해주세요.");
    }

    const response = await fetch(
      "/api/admin/profit-preferences",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw Error(result.error || "설정 저장 실패");
    }

    return { result, userId: session.user.id };
  }

  useEffect(() => {
    alive.current = true;

    async function restore() {
      if (lock.current) return;

      const current = ++generation.current;
      setReady(false);

      try {
        let { result, userId } = await call({
          action: "get",
        });

        if (!result.initialized) {
          let old = [];

          try {
            const parsed = JSON.parse(
              localStorage.getItem(
                `filmjang:profit-exclusions:v1:${userId}`
              ) || "[]"
            );

            if (Array.isArray(parsed)) {
              old = parsed
                .filter((value) => typeof value === "string")
                .slice(0, 1000);
            }
          } catch {}

          ({ result } = await call(
            { action: "import", ids: old },
            userId
          ));
        }

        if (
          alive.current &&
          current === generation.current
        ) {
          setIds(result.ids);
          setReady(true);
          setMessage(
            "계정에 저장된 제외 설정을 불러왔습니다."
          );
        }
      } catch (error) {
        if (
          alive.current &&
          current === generation.current
        ) {
          setIds([]);
          setMessage(
            `${error.message} 화면에 다시 들어오거나 새로고침해주세요.`
          );
        }
      }
    }

    const focus = () => {
      if (document.visibilityState === "visible") {
        restore();
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (
        event !== "TOKEN_REFRESHED" &&
        event !== "USER_UPDATED"
      ) {
        generation.current++;
        setReady(false);
        setIds([]);
        setTimeout(restore, 0);
      }
    });

    restore();
    window.addEventListener("focus", focus);

    return () => {
      alive.current = false;
      generation.current++;
      subscription.unsubscribe();
      window.removeEventListener("focus", focus);
    };
  }, []);

  async function change(workerId, checked) {
    if (lock.current || !ready) return;

    lock.current = true;
    setReady(false);

    const current = ++generation.current;

    try {
      const { result } = await call({
        action: "toggle",
        workerId,
        checked,
      });

      if (
        alive.current &&
        current === generation.current
      ) {
        setIds(result.ids);
        setMessage("제외 설정을 계정에 저장했습니다.");
      }
    } catch (error) {
      if (
        alive.current &&
        current === generation.current
      ) {
        setMessage(
          `저장 실패: ${error.message} 다시 선택해주세요.`
        );
      }
    } finally {
      lock.current = false;

      if (
        alive.current &&
        current === generation.current
      ) {
        setReady(true);
      }
    }
  }

  return { ids, ready, message, change };
}
