"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
export async function ownerWorkRequest(body, siteId, signal) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session) throw Error("관리자로 다시 로그인해주세요.");
  const response = await fetch(
    "/api/admin/owner-work" +
      (!body && siteId ? "?siteId=" + encodeURIComponent(siteId) : ""),
    {
      method: body ? "POST" : "GET",
      cache: "no-store",
      signal,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(Error(result.error || "요청에 실패했습니다."), {
      setupRequired: result.setupRequired,
    });
  return result;
}
export default function useOwnerWork(siteId) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const version = useRef(0),
    lock = useRef(false);
  const refresh = useCallback(async () => {
    const id = ++version.current;
    setLoading(true);
    try {
      const result = await ownerWorkRequest(null, siteId);
      if (id === version.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (id === version.current) setError(e.message);
    } finally {
      if (id === version.current) setLoading(false);
    }
  }, [siteId]);
  useEffect(() => {
    setData(null);
    refresh();
    const resume = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("owner-work-changed", refresh);
    window.addEventListener("focus", resume);
    return () => {
      version.current++;
      window.removeEventListener("owner-work-changed", refresh);
      window.removeEventListener("focus", resume);
    };
  }, [refresh]);
  async function act(body) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await ownerWorkRequest(body);
      window.dispatchEvent(new Event("owner-work-changed"));
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { data, error, loading, busy, act, refresh };
}
