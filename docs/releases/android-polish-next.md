# Android workflow polish (after 0.6.69)

No Play release or version-code change is included. Batch with the next release.

| Requested area | Implementation |
|---|---|
| Completion report flow | Speech inserts into the open report editor; summary validation appears on the field; photos, labor and final confirmation remain accessible without dismissing the editor. |
| Save clarity | Both report editors autosave locally; explicit local draft, uncertain transmission and successful submission states. Existing submission lock/server recheck retained. |
| Actionable notifications | Inbox rows state the action (conversation, schedule, consultation or site); existing account-scoped allowlisted deep links retained. |
| Compact role home | Owner shortcut for receivables; worker shortcut for report; pending report primary review action; approved reports folded into a separate list. |
| Contextual permissions | Explain notification purpose before the user-triggered OS prompt; clarify call setup is optional for manual work. Existing document picker and external speech recognizer retain on-demand access. |
| Existing consultation link | Existing exact-phone suggestions extended to photo/text/manual drafts; existing-site action label; server candidate/new-site decision retained. |
| AI review | Pre-registration review includes address, dates, contract and deposit; AI date/amount candidates remain opt-in in existing editor. |
| Search | Phone formatting normalized; last four digits supported alongside name/address; workflow picker recent sites scoped by user and company. |
| Navigation | Home scroll restored after returning; report drafts retained on back/dismiss; existing photo overlay preserves gallery underneath. |
| Labor explanation | Live days × daily wage + allowance formula per person; existing final confirmation and completed-assignment web audit retained. |
| Retry | Failed thumbnail can reload alone; failed analysis retains selection and request-key behavior; pre-transmission photo retry retains URI; uncertain upload routes to existing gallery before a retry. |

## Verification
- Debug Kotlin compilation, unit tests and debug APK assembly.
- Phone search regression covers formatting, last four digits, combined query and nonmatches.
- No connected Android device was available; microphone, permission prompts and UI touch flows require device acceptance testing.
- Photos remain subject to existing upload limits. Analysis is one multi-image request, not independently billed per-image requests.
- Drafts are local, not cross-device/cloud-synced. Existing web completion report remains available for unsupported material/expense scenarios.
