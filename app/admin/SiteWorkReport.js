"use client";

import WorkReportForm from "../components/WorkReportForm";

export default function SiteWorkReport({
  site, saving, message, onSave, onCancel, active = true,
}) {
  return (
    <WorkReportForm
      key={site.id}
      site={site}
      siteId={site.id}
      owner
      active={active}
      saving={saving}
      message={message}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
}
