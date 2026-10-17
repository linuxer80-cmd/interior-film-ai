# Personal measurement notebook

Entry points: worker home and the film/cutting menu; route `/worker/notebook`.

This first release is local-first and **does not provide cloud sync**. Supabase authenticates the current account, but notebook documents and compressed JPEG photos are kept in IndexedDB under that account ID. The screen explicitly says this device only. A JSON export includes photos; importing validates the shape and generates fresh IDs instead of overwriting existing notebooks. Browser-data deletion removes local records, so export before changing devices or clearing browser data.

Writes are serialized and committed by IndexedDB transaction. Revisions prevent two tabs from silently overwriting a notebook; save failure remains visible and the current in-memory document can be exported. No success state is shown for failed writes.

Cutting transfer validates all unfinished measurements, requires brand/code/fire status, and leaves dimensions unchanged. It seeds a separate `film-cutting-v2:<user>:notebook:<id>` draft and does not touch general/site drafts. Existing same-notebook drafts require confirmation before replacement. Grain is preserved conservatively across each exact material group. Cutting completion is not automatically synchronized back into the notebook.

Validation: `node --test tests/measurement-notebook.test.mjs`, production Next build; IndexedDB transaction tests using an external fake-indexeddb fixture covered account separation, persistence and stale-revision rejection. The existing worker-sites test suite has 8 failures on the unchanged baseline too; no worker API changes were made.
