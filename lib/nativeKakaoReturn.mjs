export function nativeKakaoReturn(query) {
  const state = query.get("assistant_state");
  if (!/^[A-Za-z0-9_-]{43}$/.test(state || "")) return null;
  const url = new URL("filmjang-assistant://auth/kakao");
  url.searchParams.set("state", state);
  const code = query.get("code");
  if (!query.has("error") && /^[A-Za-z0-9._~-]{1,2048}$/.test(code || "")) url.searchParams.set("code", code);
  else url.searchParams.set("error", "authentication_failed");
  return url.toString();
}
