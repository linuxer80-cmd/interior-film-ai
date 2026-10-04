import { notFound } from "next/navigation";
import WorkerPage from "../../page";

export default async function WorkerMenuRoute({ params }) {
  const { section } = await params;

  if (!["sites", "film", "report", "pay", "photos"].includes(section)) {
    notFound();
  }

  return <WorkerPage mode={section} />;
}
// 파일 끝
