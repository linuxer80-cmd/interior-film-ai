"use client";

import WorkReportForm from "../components/WorkReportForm";

export default function SiteWorkReport({
  site, saving, message, onSave, onCancel,
}) {
  return (
    <WorkReportForm
      key={site.id}
      site={site}
      siteId={site.id}
      owner
      saving={saving}
      message={message}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
}
