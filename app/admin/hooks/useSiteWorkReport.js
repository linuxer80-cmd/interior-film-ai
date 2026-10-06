"use client";

import { useCallback, useRef, useState } from "react";
import { reportRequest } from "../../utils/reportClient";

export default function useSiteWorkReport({ companyId, reloadSites }) {
  const [reportSaving, setReportSaving] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const lock = useRef(false);
  const clearReportMessage = useCallback(() => setReportMessage(""), []);

  const submitWorkReport = useCallback(async payload => {
    if (lock.current) return false;
    if (!companyId || !payload.siteId) {
      setReportMessage("현장을 확인해주세요.");
      return false;
    }

    lock.current = true;
    setReportSaving(true);
    setReportMessage("완료보고를 저장하고 있습니다…");

    try {
      await reportRequest("/api/admin/site-work-report", payload);
      setReportMessage("완료보고를 저장했습니다.");
      try {
        await reloadSites?.();
      } catch {
        setReportMessage("저장은 완료했습니다. 목록을 새로고침해주세요.");
      }
      return true;
    } catch (error) {
      setReportMessage(error.message);
      return false;
    } finally {
      lock.current = false;
      setReportSaving(false);
    }
  }, [companyId, reloadSites]);

  return { reportSaving, reportMessage, submitWorkReport, clearReportMessage };
}
