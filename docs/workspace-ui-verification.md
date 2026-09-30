# Production UI verification — 2026-09-11

- `npm test`: 84 passed (81 existing + 3 shared-layout tests).
- `npm run build`: passed, all routes compiled. Includes TypeScript validation.
- Final navigation registry extension (`kind: local | route`): targeted 3/3 passed and production build passed.
- Browser: formal components using the application's synthetic demo account; search/filter controls and new-task sheet remain functional, task-menu opens the existing task editor, local bookmark survives reload and was toggled back, density switch works, browser Back returns to the board.
- Desktop: board, inbox, team, insurance navigation use identical 216px width, DM Sans / Noto Sans SC / Microsoft YaHei font, 12px size, 20px line-height and 13px 10px link padding. Content begins at x=216.
- Mobile override 390 x 844 (375px content viewport after scrollbar): board and insurance nav have identical x=0, y=776, width=375, height=68; 10px type, 14px line-height, 5px 2px padding. No document horizontal overflow in insurance. Mobile filters retain visible labels.
- Business quote tests, existing compact-mode exclusion and OPCF tests remain passing. No real task or quote records edited during browser validation.
- Production HTML on 127.0.0.1:3000 and the existing Cloudflare URL returned HTTP 200 with shared-shell markers, but subsequent login verification failed: PGlite cannot locate the WAL checkpoint at 0/22D939E0. Deployment is NOT operationally verified.
- Original database preserved; full snapshot at `.data/backups/ui-pre-recovery-20260911/postgres`. Recovery was performed only on a disposable copy. Export contains 4 teams and 15 tasks; a new database at `.data/recovery/ui-20260911/clean-postgres` matches all four exported team documents. This does not establish completeness against the last live state. Switching the active database remains pending user authorization because uncheckpointed changes may be missing.
- Navigation design contract: root DESIGN.md and AGENTS.md. Component CSS is isolated from app / insurance page classes.

## Recovery authorized and applied — 2026-09-11
- User authorized restoring formal service. Active `KANBAN_DATA_DIR` now points to `.data/postgres-restored-20260911`, copied from the validated clean recovery database. Original database and recovery snapshot remain intact.
- Authenticated worker teams endpoint: HTTP 200, formal team present. No second database process was opened against the active directory.
- Existing Chrome login session via the public Cloudflare URL successfully loaded Zack's formal workspace, one member and three tasks. New shared navigation is rendered in the formal board.
- Restored data matches the recovered export; completeness of uncheckpointed changes before the failure remains unproven. Demo records were preserved; no team was deleted.
