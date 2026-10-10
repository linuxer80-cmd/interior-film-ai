import CustomerHomepage from "../components/CustomerHomepage";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "기분좋은공간 | 인테리어필름 사진 견적·시공 안내",
  description:
    "기분좋은공간의 실제 시공 사례와 작업 안내를 확인하고 사진으로 예상 견적을 받아보세요.",
};

export default function GibunHomepage() {
  return <CustomerHomepage slug="gibun" />;
}
