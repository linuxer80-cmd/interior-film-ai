import { koreanDay, monthDays } from "./workerCalendar";

export const MAX_DAILY_PAY = 100000000;

export function payAmount(value) {
  if (
    !["number", "string"].includes(typeof value) ||
    String(value).trim() === ""
  ) {
    return null;
  }

  const amount = Number(value);

  return Number.isSafeInteger(amount) &&
    amount >= 0 &&
    amount <= MAX_DAILY_PAY
    ? amount
    : null;
}

export function payMonth(value) {
  return typeof value === "string" &&
    /^(20\d{2})-(0[1-9]|1[0-2])$/.test(value)
    ? value
    : null;
}

export function payDate(value) {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? koreanDay(value)
    : null;
}

const emptyTotals = () => ({
  leaderDays: 0,
  memberDays: 0,
  pendingDays: 0,
  baseAmount: 0,
  allowanceAmount: 0,
  totalAmount: 0,
});

export function sumPay(groups) {
  return groups.reduce((total, group) => {
    for (const key of Object.keys(total)) {
      total[key] += group[key];
    }

    return total;
  }, emptyTotals());
}

export function companyMonthPay({
  company,
  workerIds,
  sites,
  daily,
  legacy,
  rates,
  allowanceRates = [],
  month,
  today = koreanDay(),
}) {
  const ownIds = new Set(workerIds);

  const days = monthDays(month).days.filter(
    (day) => day <= today
  );

  const worked = new Map();
  const unassignedDates = new Set();

  const add = (site, day, row, inferred) => {
    if (
      !days.includes(day) ||
      !ownIds.has(row.worker_id)
    ) {
      return;
    }

    if (!worked.has(day)) {
      worked.set(day, []);
    }

    worked.get(day).push({
      workerId: row.worker_id,
      role: row.role,
      siteId: site.id,
      siteName: site.site_name || "현장",
      inferred,
    });
  };

  for (const site of sites) {
    if (
      !["scheduled", "in_progress", "completed"].includes(
        site.status
      ) ||
      site.company_id !== company.id
    ) {
      continue;
    }

    const actual = daily.filter(
      (row) => row.site_id === site.id
    );

    if (actual.length) {
      // 날짜별 배정이 있으면 본인에게 배정된 날짜만 계산합니다.
      // 다른 시공자만 배정된 경우에도 전체 기간으로 대체하지 않습니다.
      for (const row of actual) {
        add(site, payDate(row.work_date), row, false);
      }

      continue;
    }

    const members = legacy.filter(
      (row) =>
        row.site_id === site.id &&
        ownIds.has(row.worker_id)
    );

    const start = site.schedule_start
      ? koreanDay(site.schedule_start)
      : payDate(site.schedule_date);

    const end = site.schedule_end
      ? koreanDay(site.schedule_end)
      : start;

    if (!start || !end || end < start) {
      if (members.length) {
        unassignedDates.add(site.id);
      }

      continue;
    }

    for (const day of days) {
      if (day >= start && day <= end) {
        for (const row of members) {
          add(site, day, row, true);
        }
      }
    }
  }

  const history = new Map(
    workerIds.map((id) => [
      id,
      rates
        .filter(
          (rate) =>
            rate.worker_id === id &&
            rate.company_id === company.id
        )
        .sort((a, b) =>
          b.effective_from.localeCompare(a.effective_from)
        ),
    ])
  );

  const companyAllowances = allowanceRates
    .filter(
      (rate) => rate.company_id === company.id
    )
    .sort((a, b) =>
      b.effective_from.localeCompare(a.effective_from)
    );

  const entries = [...worked]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, assignments]) => {
      const role = assignments.some(
        (row) => row.role === "leader"
      )
        ? "leader"
        : "member";

      const dayRates = [
        ...new Set(
          assignments.map((row) => row.workerId)
        ),
      ].map((id) => {
        const rate = history
          .get(id)
          ?.find(
            (item) => item.effective_from <= date
          );

        return {
          base: payAmount(rate?.daily_wage),
        };
      });

      const first = dayRates[0];

      const companyRate = companyAllowances.find(
        (rate) => rate.effective_from <= date
      );

      const allowance = companyRate
        ? payAmount(companyRate.amount)
        : 0;

      const pending =
        assignments.some(
          (row) =>
            !["leader", "member"].includes(row.role)
        ) ||
        !first ||
        first.base === null ||
        (role === "leader" && allowance === null) ||
        dayRates.some(
          (rate) => rate.base !== first.base
        );

      const baseAmount = pending
        ? null
        : first.base;

      const allowanceAmount = pending
        ? null
        : role === "leader"
          ? allowance
          : 0;

      const uniqueSites = [
        ...new Map(
          assignments.map((row) => [
            row.siteId,
            {
              id: row.siteId,
              name: row.siteName,
            },
          ])
        ).values(),
      ];

      return {
        date,
        role,
        sites: uniqueSites,
        inferred: assignments.some(
          (row) => row.inferred
        ),
        pending,
        baseAmount,
        allowanceAmount,
        totalAmount: pending
          ? null
          : baseAmount + allowanceAmount,
      };
    });

  const totals = emptyTotals();

  for (const entry of entries) {
    totals[
      entry.role === "leader"
        ? "leaderDays"
        : "memberDays"
    ] += 1;

    if (entry.pending) {
      totals.pendingDays += 1;
      continue;
    }

    totals.baseAmount += entry.baseAmount;
    totals.allowanceAmount += entry.allowanceAmount;
    totals.totalAmount += entry.totalAmount;
  }

  return {
    companyId: company.id,
    companyName: company.company_name || "소속 업체",
    ...totals,
    entries,
    undatedSites: unassignedDates.size,
  };
}
