import { supabase } from "../../lib/supabase";

const uuid =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

// 로그인 후 이동할 수 있는 시공자 내부 경로만 허용합니다.
export function workerDestination(value) {
  if (value === "/worker") return value;
  if (new RegExp(`^/worker/connect/${uuid}$`,"i").test(value || "")) return value;

  if (
    /^\/worker\/menu\/(sites|film|report|pay|photos)$/.test(
      value || ""
    )
  ) {
    return value;
  }

  if (
    new RegExp(
      `^/worker/site/${uuid}(?:\\?section=(?:info|film|photos|expenses|report))?$`,
      "i"
    ).test(value || "")
  ) {
    return value;
  }

  const match = new RegExp(
    `^/worker\\?site=(${uuid})$`,
    "i"
  ).exec(value || "");

  return match
    ? `/worker/site/${match[1]}`
    : "/worker";
}

export function workerLoginUrl() {
  const next =
    typeof window === "undefined"
      ? "/worker"
      : workerDestination(
          window.location.pathname +
            window.location.search
        );

  return (
    "/worker/login?next=" +
    encodeURIComponent(next)
  );
}

export async function loadMyWorkerSites({
  siteId,
  profileOnly = false,
} = {}) {
  const { data, error } =
    await supabase.auth.getSession();

  if (error) throw error;

  if (!data?.session?.access_token) {
    throw Object.assign(
      new Error(
        "시공자로 다시 로그인해주세요."
      ),
      { status: 401 }
    );
  }

  const params = new URLSearchParams();

  if (siteId) params.set("siteId", siteId);

  if (profileOnly) {
    params.set("profileOnly", "1");
  }

  const response = await fetch(
    `/api/worker/my-sites?${params}`,
    {
      headers: {
        Authorization:
          `Bearer ${data.session.access_token}`,
      },
      cache: "no-store",
    }
  );

  const result = await response.json();

  // 업체 연결 기록이 없는 시공자도 개인 프로필로 홈을 사용합니다.
  // 현장 상세 요청에는 적용하지 않습니다.
  // 개인 프로필 API에서 계정 활성 상태와 인증을 다시 확인합니다.
  if (
    response.status === 403 &&
    !siteId
  ) {
    const meResponse = await fetch(
      "/api/labor-market?mode=me",
      {
        headers: {
          Authorization:
            `Bearer ${data.session.access_token}`,
          "X-Labor-View": "worker",
        },
        cache: "no-store",
      }
    );

    const me = await meResponse.json();

    if (
      meResponse.ok &&
      me.profile
    ) {
      return {
        worker: {
          user_id: me.profile.user_id,
          worker_id: me.profile.user_id,
          worker_name: me.profile.name,
          worker_phone:
            me.personal?.phone || "",
          worker_is_active: true,
          independent: true,
        },
        sites: [],
      };
    }
  }

  if (!response.ok) {
    throw Object.assign(
      new Error(
        result.error ||
          "현장을 불러오지 못했습니다."
      ),
      { status: response.status }
    );
  }

  return result;
}

