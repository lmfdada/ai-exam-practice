# AI Import V4 - Project Overview

## Public Links

- Online app: https://ai-exam-practice-pi.vercel.app
- Source repo: https://github.com/lmfdada/ai-exam-practice

## Deliverables

1. Online address
   - Vercel URL above
2. Source repository
   - GitHub URL above
3. Pressure data script
   - `scripts/seed-v4-data.mjs`
4. 10,000-row Excel file
   - `test-data/10000-orders.xlsx`
5. Pressure test report
   - `docs/v4-test-report.md`
6. Architecture design document
   - `docs/v4-assumptions.md`
7. Refactoring hypothesis说明
   - `docs/v4-assumptions.md`
8. API documentation
   - `docs/v4-interface.md`
9. README
   - `README.md`
10. Demo/visit notes
   - `/import-tasks`
   - `/import-monitor`

## Notes

- Production is deployed on Vercel.
- Core V4 flow supports async import, batch processing, error drilldown, trace search, and monitoring.
- The repository root README contains local setup, env vars, deployment, pressure test, and failure simulation notes.
