# 최종 정산 및 자재 검색 수정

검수 승인금액을 최종 매출/정산으로 사용합니다. 검수 후 추가 작업 승인은 해당 보고서 금액을 갱신하고 기존 계약금액과 입금 원장은 보존합니다. 검수 전에는 계약금액에 추가합니다.

새 환경에서 기존 SQL 적용 후 database/inspection_amount_final_priority.sql, database/final_settlement_extra_work.sql, database/catalog_registered_variants.sql을 적용합니다. 기존 완료된 추가 작업을 자동 재가산하지 않습니다.

카탈로그의 legacy_non_fire_code를 검색/제품 연결에 사용합니다. 등록되지 않은 번호는 추측하지 않습니다.

알림톡 금액형 새 문구: “최종 정산금액 (부가세 포함): #{최종정산금액}”. lib/customerCompletionTemplate.mjs의 전체 본문으로 공급자 템플릿을 승인받고 SOLAPI_TEMPLATE_CUSTOMER_COMPLETION_FINAL_AMOUNT에 승인된 ID를 설정합니다. 승인 전에는 기존 승인된 SOLAPI_TEMPLATE_CUSTOMER_COMPLETION_LINK의 결과·정산 링크를 사용합니다. 기존 금액형 템플릿 ID를 새 환경변수로 복사하면 안 됩니다. 고객에게 자동 재발송하지 않습니다.
