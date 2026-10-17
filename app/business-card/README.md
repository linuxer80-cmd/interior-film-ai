# Digital business card

Entry points: administrator home and installer home; `/business-card?from=admin|worker`.

Twenty-four code-rendered designs grouped into six filterable styles use the same canvas renderer for thumbnails, preview and 1800×1000 PNG export. Logo images (PNG/JPEG/WebP, up to 10MB) are decoded and reduced to 600px, preserving transparency. Text is fitted to its available width. Empty contact fields are omitted. No AI requests or additional server functions are used.

The editor requires an existing Supabase login. Drafts are explicitly saved in localStorage per authenticated account; this is device/browser-local storage, not cloud synchronization. Auth changes clear visible personal information. Storage errors remain visible. A beforeunload handler warns about unsaved changes. PNG exports are portable; drafts are not synced across devices. No database schema changes.
