"use client";

import { useState } from "react";
import SiteManagementTabBase from "./SiteManagementTabBase";
import TradeClients from "../components/TradeClients";

export default function SiteManagementTab(props) {
  const [scope, setScope] = useState(null);
  const [enabled, setEnabled] = useState(false);

  const sites = (props.sites || [])
    .map((site) => ({
      ...site,
      ...scope?.lookup?.[site.id],
    }))
    .filter(
      (site) =>
        !enabled || !scope || scope.ids.includes(site.id)
    );

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
            onChange={(event) =>
              setEnabled(event.target.checked)
            }
          />{" "}
          위 검색 조건을 아래 현장 목록·캘린더에도 적용
        </label>
      </details>

      <SiteManagementTabBase
        {...props}
        sites={sites}
        createSite={props.createSite}
      />
    </>
  );
}
