# Customer link Alimtalk

Customer notices resolve these approved templates in the configured Solapi channel:

| Stage | Template | Button |
| --- | --- | --- |
| Consultation (manual) | 필름장이_고객상담안내 | 내 상담 페이지 보기 |
| Confirmation / day-before reminder | 필름장이_고객시공전안내_링크 | 내 시공 안내 보기 |
| Approved completion | 필름장이_고객시공완료안내_링크 | 시공 결과·정산 보기 |
| Confirmed full payment | 필름장이_고객입금완료안내_링크 | 입금 확인·관리 안내 |

`stageConfig` resolves by exact name when a stage-specific template ID is absent. Existing `SOLAPI_TEMPLATE_CUSTOMER_CONSULTATION`, `SOLAPI_TEMPLATE_CUSTOMER_BEFORE`, `SOLAPI_TEMPLATE_CUSTOMER_COMPLETION_LINK`, and `SOLAPI_TEMPLATE_CUSTOMER_PAID` remain optional explicit overrides. The old schedule/completed IDs are not fallbacks. Ambiguous names, unavailable templates, a different body, or a different mobile/PC customer URL block before reservation and billing.

Solapi's sendable endpoint returns an array without pagination: https://solapi.com/developers/api/templates-getTemplateList-getSendableTemplates

Both manual schedule endpoints and automatic confirmation use `customer_schedule` and the same existing reservation RPC. This retains prior-send history, stale-preview checks, explicit manual resend confirmation, and atomic credit/idempotency protection. Previously sent notices are not replayed by deployment. Day-before reminders remain `customer_reminder`, with their separate site/date identity and existing noon KST schedule. The reminder re-reads eligibility and prepares the site-specific signed customer link. Other stages keep their stage-specific reservations and completion/payment eligibility checks. No database migration is needed.

The `prebuild` script checks all four real templates on production builds that have Solapi configured. It only reads template metadata; it never reserves credits or sends a message. It logs name/ID and validation status, not credentials or customer information. Every runtime send also validates current approval, body and buttons.

Production template IDs verified on 2026-10-27: consultation `KA01TP261026090326236CkQw95ezMp3`, before `KA01TP261026090529731Mn4wqrucb3t`, complete `KA01TP261026090846393HOnlD7hgZRJ`, care `KA01TP261026091627998S4scssSAW2f`. The four stage environment variables pin these IDs. Consultation and before copy preserve the approved inline sentence/date formatting exactly.
