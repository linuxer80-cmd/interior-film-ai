import { redirect } from "next/navigation";

export default async function WorkerLoginRedirect({ searchParams }) {
  const params = await searchParams;
  const query = new URLSearchParams({ role: "worker" });
  if (typeof params?.next === "string") query.set("next", params.next);
  redirect("/login?" + query.toString());
}
