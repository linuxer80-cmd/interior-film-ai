export const kstStamp = milliseconds =>
  new Date(milliseconds + 9 * 3600000)
    .toISOString()
    .slice(0, 16)
    .replace(/[-T:]/g, "");

export const kstTime = milliseconds =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(milliseconds));

export async function estimateDeparture({
  target,
  now,
  durationAt,
}) {
  const minute = 60000;
  const floor = value =>
    Math.floor(value / minute) * minute;

  let departure = floor(target - 60 * minute);

  for (let attempt = 0; attempt < 5; attempt++) {
    if (departure <= now + minute) {
      departure =
        Math.ceil((now + 2 * minute) / minute) * minute;
    }

    if (departure >= target) {
      throw Error(
        "오전 7시 50분 도착 기준 시간이 지났습니다.",
      );
    }

    const duration = await durationAt(departure);

    if (
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 24 * 3600
    ) {
      throw Error("이동시간을 확인하지 못했습니다.");
    }

    const arrival = departure + duration * 1000;

    if (
      arrival <= target &&
      target - arrival <= 12 * minute
    ) {
      return {
        departure,
        arrival,
        duration,
      };
    }

    const next = floor(
      target - duration * 1000 - 10 * minute,
    );

    if (
      next <= now + minute &&
      arrival > target
    ) {
      throw Error(
        "현재 조회 시점에는 오전 7시 50분 도착이 어려울 것으로 예상됩니다. 지도에서 바로 확인해주세요.",
      );
    }

    departure = next;
  }

  throw Error(
    "교통 예측이 크게 달라 출발 시간을 확정하지 못했습니다. 다시 조회해주세요.",
  );
}
