import SupportCenter from "./SupportCenter";
import packageInfo from "../../package.json";

export const metadata = { title: "고객지원 | 필름장이" };

export default async function SupportPage({ searchParams }) {
  const params = await searchParams;
  const from = params?.from === "worker" ? "worker" : "admin";
  return <SupportCenter from={from} version={packageInfo.version} />;
}
