import { createHash, randomUUID } from "node:crypto";
import { GET as mySitesGET } from "../my-sites/route";
import {
  koreanDay,
  nextWorkDay,
  workerMonth,
  siteStatus,
} from "../../../utils/workerCalendar";
import {
  privateAuth,
  privateError,
  privateJson as json,
  uuid,
} from "../../../../lib/workerPrivate";
import {
  estimateDeparture,
  kstStamp,
  kstTime,
} from "../../../../lib/workerCommute.mjs";
import {
  commuteCache,
} from "../../../../lib/commuteCache.mjs";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  try {
    const auth = await privateAuth(request, false);

    if (auth.error) {
      return json({ error: auth.error }, auth.status);
    }

    const params = new URL(request.url).searchParams;
    const siteId = params.get("siteId");

    if (!uuid(siteId)) {
      return json({ error: "현장을 확인해주세요." }, 400);
    }

    const sitesUrl = new URL(request.url);
    sitesUrl.pathname = "/api/worker/my-sites";
    sitesUrl.search = "";

    const response = await mySitesGET(
      new Request(sitesUrl, { headers: request.headers })
    );
    const allowed = await response.json();

    if (!response.ok) {
      return json({
        error: allowed.error || "현장 배정을 확인해주세요.",
      }, response.status);
    }

    const site = allowed.sites?.find(
      item => item.site_id === siteId
    );

    if (
      !site ||
      ["cancelled", "completed"].includes(siteStatus(site))
    ) {
      return json({
        error: "현재 배정된 예정 현장만 조회할 수 있습니다.",
      }, 403);
    }

    const now = Date.now();
    const today = koreanDay();
    const requestedDate = params.get("workDate");

    const from = now >= Date.parse(
      `${today}T07:50:00+09:00`
    )
      ? koreanDay(new Date(
          Date.parse(`${today}T12:00:00+09:00`) + 86400000
        ))
      : today;

    const workDate = requestedDate ||
      nextWorkDay([site], from);

    if (
      !workDate ||
      koreanDay(workDate) !== workDate ||
      workDate < today
    ) {
      return json({
        error: "예정된 시공일을 선택해주세요.",
      }, 400);
    }

    const entries = workerMonth(
      [site], workDate.slice(0, 7)
    ).byDay.get(workDate) || [];

    if (!entries.some(
      entry => entry.site.site_id === siteId
    )) {
      return json({
        error: "본인 배정일만 조회할 수 있습니다.",
      }, 403);
    }

    const target = Date.parse(
      `${workDate}T07:50:00+09:00`
    );

    const workers = await auth.db
      .from("workers")
      .select("id")
      .eq("company_id", site.company_id)
      .eq("user_id", auth.user.id)
      .eq("is_active", true)
      .limit(2);

    if (workers.error) throw workers.error;

    if (workers.data?.length !== 1) {
      return json({
        error: "본인 시공자 계정 연결을 확인해주세요.",
      }, 403);
    }

    const details = await auth.db
      .from("worker_private_details")
      .select("departure_address")
      .eq("company_id", site.company_id)
      .eq("worker_id", workers.data[0].id)
      .maybeSingle();

    if (details.error) {
      return json({
        error: privateError(details.error),
      }, 503);
    }

    if (!details.data?.departure_address) {
      return json({
        error: "관리자에게 시공자 출발 주소 등록을 요청해주세요.",
      }, 400);
    }

    if (!site.address) {
      return json({
        error: "현장 주소를 먼저 등록해주세요.",
      }, 400);
    }

    const slot = workDate === today ? "day" : "advance";

    const fingerprint = createHash("sha256")
      .update(JSON.stringify([
        details.data.departure_address.trim(),
        site.address.trim(),
        "07:50",
        "v1",
      ]))
      .digest("hex");

    const identity = {
      company_id: site.company_id,
      worker_id: workers.data[0].id,
      site_id: siteId,
      work_date: workDate,
      fingerprint,
      slot,
    };

    const cache = commuteCache(auth.db, identity);

    // 저장된 결과 읽기는 카카오 호출과 사용량 차감이 없습니다.
    if (params.get("mode") === "saved") {
      const saved = await cache.read();

      if (!saved?.result && slot === "day") {
        const previous = await commuteCache(auth.db, {
          ...identity,
          slot: "advance",
        }).read();

        if (previous?.result) {
          return json({
            ...previous.result,
            cached: true,
            canQuery: target > now,
          });
        }
      }

      return json(saved?.result
        ? {
            ...saved.result,
            cached: true,
            canQuery: false,
          }
        : {
            canQuery: true,
            workDate,
          }
      );
    }

    if (target <= now) {
      return json({
        error: "이 날짜의 오전 7시 50분이 지났습니다. 다음 배정일을 선택해주세요.",
      }, 400);
    }

    const key = process.env.KAKAO_REST_API_KEY;

    if (!key) {
      return json({
        error: "서버의 KAKAO_REST_API_KEY 설정이 필요합니다.",
      }, 503);
    }

    async function kakao(url) {
      const result = await fetch(url, {
        headers: {
          Authorization: `KakaoAK ${key}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });

      if (!result.ok) {
        throw Error(
          "지도 API 인증·사용량·사용 설정을 확인해주세요."
        );
      }

      return result.json();
    }

    async function geocode(address) {
      const url = new URL(
        "https://dapi.kakao.com/v2/local/search/address.json"
      );
      url.searchParams.set("query", address);

      const data = await kakao(url);

      if (
        data.meta?.total_count !== 1 ||
        data.documents?.length !== 1
      ) {
        throw Error(
          "주소가 불명확합니다. 도로명과 건물번호를 확인해주세요."
        );
      }

      const { x, y } = data.documents[0];

      if (
        !Number.isFinite(Number(x)) ||
        !Number.isFinite(Number(y))
      ) {
        throw Error("주소 좌표를 확인하지 못했습니다.");
      }

      return `${x},${y}`;
    }

    // 캐시가 있거나 다른 요청이 계산 중이면 이 콜백은 실행되지 않습니다.
    return await cache.run(async () => {
      const {
        data: quota,
        error: quotaError,
      } = await auth.db.rpc("reserve_commute_quota", {
        p_company_id: site.company_id,
        p_request_id: randomUUID(),
      });

      if (quotaError) {
        throw Object.assign(
          Error("출발 시간 횟수 제한 SQL을 먼저 적용해주세요."),
          { status: 503 }
        );
      }

      if (!quota?.ok) {
        throw Object.assign(
          Error(
            quota?.error ||
            "출발 시간 예측 한도를 모두 사용했습니다."
          ),
          { status: 429 }
        );
      }

      // 한도 확보 후에만 외부 API를 호출합니다.
      const [origin, destination] = await Promise.all([
        geocode(details.data.departure_address),
        geocode(site.address),
      ]);

      const result = await estimateDeparture({
        target,
        now,
        durationAt: async departure => {
          const url = new URL(
            "https://apis-navi.kakaomobility.com/v1/future/directions"
          );

          for (const [name, value] of Object.entries({
            origin,
            destination,
            departure_time: kstStamp(departure),
            summary: "true",
          })) {
            url.searchParams.set(name, value);
          }

          const data = await kakao(url);
          const route = data.routes?.find(
            item => item.result_code === 0
          );

          if (!route) {
            throw Error(
              "이 경로의 자동차 교통 예측을 조회하지 못했습니다."
            );
          }

          return route.summary?.duration;
        },
      });

      return {
        workDate,
        targetTime: "07:50",
        departureTime: kstTime(result.departure),
        arrivalTime: kstTime(result.arrival),
        departureAt: new Date(
          result.departure
        ).toISOString(),
        arrivalAt: new Date(
          result.arrival
        ).toISOString(),
        durationMinutes: Math.ceil(result.duration / 60),
        checkedAt: new Date().toISOString(),
      };
    }, json);
  } catch (error) {
    return json({
      error: error.name === "TimeoutError"
        ? "지도 조회가 지연되고 있습니다. 2분 뒤 다시 조회해주세요."
        : error.message || "출발 시간을 계산하지 못했습니다.",
    }, error.status || 502);
  }
}
