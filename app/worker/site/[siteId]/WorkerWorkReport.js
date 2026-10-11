"use client";

import WorkReportForm from "../../../components/WorkReportForm";

export default function WorkerWorkReport({ siteId, site, onSubmitted }) {
  return (
    <WorkReportForm
      key={siteId}
      siteId={siteId}
      site={site}
      onSubmitted={onSubmitted}
    />
  );
}
