"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import "../../components/laborMarket.css";

export default function InventorySettings() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");

  async function api(body) {
    const { data } = await supabase.auth.getSession();

    if (!data.session) {
      throw Error("관리자로 로그인해주세요.");
    }

    const response = await fetch(
      "/api/admin/inventory-preferences",
      {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          ...(body
            ? { "Content-Type": "application/json" }
            : {}),
        },
        cache: "no-store",
        ...(body
          ? { body: JSON.stringify(body) }
          : {}),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw Error(result.error);
    }

    return result;
  }

  useEffect(() => {
    let active = true;

    api()
      .then(result => {
        if (active) {
          setEnabled(result.enabled);
          setReady(true);
        }
      })
      .catch(error => {
        if (active) setMessage(error.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      await api({ enabled });
      setMessage("저장했습니다.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="labor-shell">
      <nav>
        <Link href="/admin" data-ui-link="action">관리자 홈</Link>
        <Link href="/admin/inventory" data-ui-link="action">자재 재고</Link>
      </nav>

      <h1>재고관리 사용 설정</h1>

      <form onSubmit={save}>
        <fieldset disabled={busy || !ready}>
          <label className="check toggle-row">
            <input
              type="checkbox"
              checked={enabled}
              onChange={event =>
                setEnabled(event.target.checked)
              }
            />
            우리 업체는 자재 재고를 앱으로 관리합니다.
          </label>

          <p>
            사용하면 팀장으로 배정된 시공자가 담당 현장의
            사용 필름에 대한 재고만 확인할 수 있습니다.
          </p>

          <p>
            사용하지 않으면 시공자에게
            “재고 상황을 파악할 수 없습니다”라고 표시합니다.
          </p>

          <button className="primary">
            설정 저장
          </button>
        </fieldset>
      </form>

      {message && (
        <p role="status">{message}</p>
      )}
    </main>
  );
}
