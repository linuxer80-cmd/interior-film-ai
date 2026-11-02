import KakaoCallback from "./KakaoCallback";
import NativeKakaoReturn from "./NativeKakaoReturn";

export default async function Page({ searchParams }) {
  const query = await searchParams;
  if (query.assistant_state !== undefined || query.assistant_return !== undefined) return <NativeKakaoReturn />;
  return <KakaoCallback />;
}
