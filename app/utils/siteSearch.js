const normalize = (value) =>
  String(value ?? "").normalize("NFC").toLowerCase();

const compact = (value) =>
  normalize(value).replace(/[\s\p{P}\p{S}]/gu, "");

const initials = (value) =>
  [...normalize(value)]
    .map((letter) => {
      const code = letter.charCodeAt(0) - 0xac00;

      return code >= 0 && code <= 11171
        ? "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"[
            Math.floor(code / 588)
          ]
        : letter;
    })
    .join("");

export function matchesSite(site, query) {
  const terms = normalize(query)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!terms.length) return true;

  const people = (site.site_workers || []).flatMap((row) => [
    row.workers?.name,
    row.workers?.phone,
  ]);

  const values = [
    site.trade_client_name,
    site.trade_contact_name,
    site.site_name,
    site.customer_name,
    site.customer_phone,
    site.address,
    site.site_address,
    site.address_detail,
    site.region,
    site.work_type,
    site.work_description,
    site.memo,
    ...people,
  ].filter(Boolean);

  const fields = values.map(compact);
  const chosung = values.map((value) => compact(initials(value)));

  return terms.every((term) => {
    const needle = compact(term);
    if (!needle) return true;

    return (
      fields.some((field) => field.includes(needle)) ||
      (/^[ㄱ-ㅎ]+$/.test(needle) &&
        chosung.some((field) => field.includes(needle)))
    );
  });
}
