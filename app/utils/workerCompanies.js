import {
  siteStatus,
  workerMonth,
} from "./workerCalendar";

export function companySites(
  sites,
  companies,
  selectedId = ""
) {
  const names = new Map(
    companies.map(company => [
      company.company_id,
      company.company_name,
    ])
  );

  return sites
    .filter(
      site =>
        !selectedId || site.company_id === selectedId
    )
    .map(site => ({
      ...site,
      company_name:
        names.get(site.company_id) ||
        "업체명 확인 필요",
      site_name: `[${
        names.get(site.company_id) ||
        "업체명 확인 필요"
      }] ${
        site.site_name ||
        site.customer_name ||
        "현장"
      }`,
    }));
}

export function companyConflicts(sites, month) {
  const calendar = workerMonth(
    sites.filter(
      site =>
        !["cancelled", "completed"].includes(
          siteStatus(site)
        )
    ),
    month
  );

  return [...calendar.byDay.entries()]
    .map(([date, entries]) => ({
      date,
      companyIds: [
        ...new Set(
          entries
            .map(entry => entry.site.company_id)
            .filter(Boolean)
        ),
      ],
    }))
    .filter(day => day.companyIds.length > 1);
}
