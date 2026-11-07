# Amah agency portal

## Project context

This is an MVP for a small Singapore FDW employment agency. Staff upload biodata PDFs, review extracted candidate information, capture household requirements, shortlist matches and record interviews. The pilot uses one shared agency login. Current application branch: `amah-mvp-first-cut`.

Keep the UI simple and professional. Overview has only two entry buttons: FDW and Customers. Both dashboards use tables. Review queue and settings stay in the sidebar. Customer creation/editing and FDW uploads are full-page workflows, not drawers. Avoid promotional banners and repetitive explanatory copy.

## Working locally

- Node.js 22+; no npm dependencies. Start with `npm start`.
- Python 3.10+ with `python3 -m pip install -r requirements.txt` for PDF extraction. Activate the local `.venv` before starting Node so the Python subprocess uses it.
- Tesseract enables scanned/image-based PDF extraction (`brew install tesseract` on macOS).
- Default local demo password is `amah-demo`. `AGENCY_PASSWORD` overrides it. Never print configured secrets.
- The working app is in `server.js`, `public/`, `lib/` and `scripts/`. Read `README.md` for feature details and known limits.

## Data and behavior

- Preserve ignored `data/database.json` and `data/uploads/`. Never reset or overwrite real records to test a change. Use a temporary `DATA_DIR` for tests.
- Extraction runs locally using PyMuPDF and optional Tesseract. Missing fields stay unknown, source evidence is retained, and profiles require staff review. Re-extraction preserves staff corrections.
- Profile deletion requires an in-app confirmation and removes its original PDF and linked shortlist/ranking entries.
- Structured customer intake is stored in `householdComposition` and `fdwPreferences`. Preserve existing legacy records, notes and shortlist history.
- FDW personal preferences are recorded for staff review; they do not automatically alter the existing job-requirement score. A score never overrides a failed required criterion. Generic willingness is not verified work experience.

## Validation and delivery

Run `npm test` for backend, matching, intake and PDF extraction tests when relevant. For UI changes, exercise the affected browser workflow and responsive layout. `test/browser.py` uses Python Playwright, `/usr/bin/chromium` and disposable data; adapt the browser executable on other machines if needed. Do not claim a browser check ran when it did not.

Keep secrets, uploaded biodata, `.venv/` and runtime databases out of commits. The user runs this repository locally in VS Code. State clearly whether changes are local, committed or pushed; do not claim this chat's history automatically transfers into a new Codex session.
