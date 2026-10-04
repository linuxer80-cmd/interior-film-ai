import { supabase } from "../../lib/supabase";

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

// 로그인 후 이동할 수 있는 시공자 내부 경로만 허용합니다.
export function workerDestination(value) {
  if (value === "/worker") return value;

  if (/^\/worker\/menu\/(sites|film|report|pay|photos)$/.test(value || "")) {
    return value;
  }

  if (new RegExp(`^/worker/site/${uuid}$`, "i").test(value || "")) {
    return value;
  }

  const match = new RegExp(`^/worker\\?site=(${uuid})$`, "i").exec(value || "");

  return match ? `/worker/site/${match[1]}` : "/worker";
}

export function workerLoginUrl() {
  const next =
    typeof window === "undefined"
      ? "/worker"
      : workerDestination(window.location.pathname + window.location.search);

  return `/worker/login?next=${encodeURIComponent(next)}`;
}

export async function loadMyWorkerSites({
  siteId,
  profileOnly = false,
} = {}) {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;

  if (!data?.session?.access_token) {
    throw Object.assign(
      new Error("시공자로 다시 로그인해주세요."),
      { status: 401 },
    );
  }

  const params = new URLSearchParams();

  if (siteId) params.set("siteId", siteId);
  if (profileOnly) params.set("profileOnly", "1");

  const response = await fetch(`/api/worker/my-sites?${params}`, {
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
    },
    cache: "no-store",
  });

  const result = await response.json();

  if (!response.ok) {
    throw Object.assign(
      new Error(result.error || "현장을 불러오지 못했습니다."),
      { status: response.status },
    );
  }

  return result;
}
// 파일 끝
