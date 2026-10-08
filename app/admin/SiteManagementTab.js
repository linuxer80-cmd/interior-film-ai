"use client";

import { useState } from "react";
import SiteManagementTabBase from "./SiteManagementTabBase";
import TradeClients, { tradeApi } from "../components/TradeClients";

export default function SiteManagementTab(props) {
  const [scope, setScope] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [linkNew, setLinkNew] = useState(false);

  const sites = (props.sites || [])
    .map((site) => ({
      ...site,
      ...scope?.lookup?.[site.id],
    }))
    .filter(
      (site) =>
        !enabled || !scope || scope.ids.includes(site.id)
    );

  async function createLinkedSite(input) {
    const selected =
      linkNew && scope?.clientId
        ? {
            clientId: scope.clientId,
            contactId: scope.contactId,
          }
        : null;

    const result = await props.createSite(input);

    if (result?.success && result.site?.id && selected) {
      try {
        await tradeApi({
          action: "link",
          ...selected,
          siteId: result.site.id,
          revision: 0,
          requestId: crypto.randomUUID(),
        });

        window.dispatchEvent(new Event("trade-clients-changed"));
      } catch (error) {
        window.alert(
          `현장은 등록됐지만 거래처 연결을 확인하지 못했습니다. 현장을 다시 등록하지 말고 현장 상세에서 연결해주세요. ${error.message}`
        );
      }
    }

    return result;
  }

  return (
    <>
      <details>
        <summary
          style={{
            padding: 14,
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          거래처·담당자별 현장 및 미수금 관리
        </summary>

        <TradeClients onScope={setScope} />

        <label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />{" "}
          위 검색 조건을 아래 현장 목록·캘린더에도 적용
        </label>
      </details>

      {scope?.clientId && (
        <label style={{ display: "block", padding: 12 }}>
          <input
            type="checkbox"
            checked={linkNew}
            onChange={(event) => setLinkNew(event.target.checked)}
          />{" "}
          새 현장을 위에서 선택한 거래처·담당자에 자동 연결
          (담당자 전체 선택이면 미지정)
        </label>
      )}

      <SiteManagementTabBase
        {...props}
        sites={sites}
        createSite={createLinkedSite}
      />
    </>
  );
}
