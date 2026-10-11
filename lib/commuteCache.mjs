import { randomUUID } from "node:crypto";

const TABLE = "worker_commute_cache";

export function commuteCache(db, identity) {
  const scoped = () => db.from(TABLE);

  const filter = query => {
    for (const [key, value] of Object.entries(identity)) {
      query = query.eq(key, value);
    }
    return query;
  };

  const fail = () => Error(
    "출발 시간 저장소를 확인해주세요. worker_commute_cache.sql을 먼저 실행해주세요."
  );

  async function read() {
    const response = await filter(
      scoped().select("result,lease_until,token")
    ).maybeSingle();

    if (response.error) throw fail();
    return response.data;
  }

  async function run(calculate, json) {
    const saved = await read();

    if (saved?.result) {
      return json({
        ...saved.result,
        cached: true,
        canQuery: false,
      });
    }

    const now = new Date().toISOString();
    const token = randomUUID();
    const lease_until = new Date(
      Date.now() + 120000
    ).toISOString();

    let claim;

    if (!saved) {
      claim = await scoped()
        .insert({ ...identity, token, lease_until })
        .select("token")
        .maybeSingle();

      if (claim.error && claim.error.code !== "23505") {
        throw fail();
      }
    } else {
      claim = await filter(
        scoped().update({ token, lease_until })
      )
        .is("result", null)
        .lte("lease_until", now)
        .select("token")
        .maybeSingle();

      if (claim.error) throw fail();
    }

    if (!claim.data) {
      const latest = await read();

      if (latest?.result) {
        return json({
          ...latest.result,
          cached: true,
          canQuery: false,
        });
      }

      return json({
        error: "조회 중이거나 재시도 대기 중입니다. 2분 뒤 확인해주세요.",
      }, 429);
    }

    // 실패하더라도 잠금을 유지하여 즉시 반복 호출을 막습니다.
    const result = await calculate();

    const stored = await filter(
      scoped().update({ result })
    )
      .eq("token", token)
      .select("token")
      .maybeSingle();

    if (stored.error || !stored.data) {
      throw Error(
        "조회 결과 저장에 실패했습니다. 2분 뒤 확인해주세요."
      );
    }

    return json({
      ...result,
      cached: false,
      canQuery: false,
    });
  }

  return { read, run };
}
