# Amah · Agency pilot

A working first cut for a small Singapore employment agency: customer intake, explainable matching, profile review, availability, shortlisting and interview notes. The initial database contains clearly labelled fictional demo records.

## Run

Requires Node.js 22+ and Python 3.10+. The web application uses only Node built-ins; there are no npm dependencies.

```sh
cd /workspace/abizerattary
python3 -m pip install -r requirements.txt
# macOS: enable scanned/image PDF extraction
brew install tesseract
npm start
```

The server listens on port 3000. Without `AGENCY_PASSWORD`, sign in with **amah-demo**. Before hosting real records, set a strong `AGENCY_PASSWORD`, use HTTPS and set `COOKIE_SECURE=true`. A shared login is implemented; individual accounts are deferred. Sessions expire after 12 hours and on server restart.

Environment settings: `PORT` (3000), `HOST` (0.0.0.0), `DATA_DIR` (defaults to `data/`), `PYTHON` (python3), `AGENCY_PASSWORD`, `COOKIE_SECURE`. No AI credentials are needed for this first cut. Use the existing checkout; tasks already have an isolated environment and do not need additional Git worktrees.

## Try the workflow

1. Overview has two entries: **FDW** opens the FDW dashboard (profiles, availability, uploads); **Customers** opens the customer dashboard (households, matching and interviews). Open the Tan family from Customers to inspect score explanations and requirements. Review queue and workspace settings remain in the sidebar.
2. Add a customer, paste conversation notes and review keyword suggestions. Confirm required/preferred/no-preference settings.
3. Shortlist candidates, record when a PDF was sent, schedule an interview and save feedback.
4. Switch to My ranking, drag a candidate or use the arrows, and record the reason.
5. Upload multiple PDFs from Candidate library. Personal details, languages, skills and dated employment history populate automatically where evidence is available. Open Review queue, inspect field/page sources alongside the original, correct uncertain values, and save.
6. Use Re-extract PDF on older uploads after installing OCR or updating the extractor. Staff-corrected fields are preserved. Delete profile is available in the library and profile details; confirmation removes the record, original PDF, shortlist entries and ranking notes.
7. Mark a candidate Reserved: new shortlists are blocked. Placed and Withdrawn candidates disappear from active matches.

The application data and PDFs persist in ignored `data/`. Data backup downloads JSON; separately preserve `data/uploads/` to retain original documents. This is a single-process pilot store using atomic JSON writes, not a multi-instance production database. Do not share one data directory between server processes.

## Customer intake

New customer and Edit intake use dedicated full-page forms. FDW profile uploads also use a dedicated page with persistent batch results and extraction status. Use the page’s back/cancel controls to return to the relevant dashboard.

New customer and Edit intake use the same form. Customer House Composition captures resident count and one age per resident (fractional years for infants), household marital status, residence type, religion and nationality. FDW Preference captures all 13 requested questions: numeric ideal/upper/lower bounds, ranked nationality/marital-status/religion choices, experience type, prior work location and ordinal education bounds. Inactive preferences are explicitly stored as No preference. Ranking supports selected options, custom entries and up/down controls.

These fields persist as `householdComposition` and `fdwPreferences`; the household summary is generated from resident ages and residence type. Intake is viewable from Intake notes and editable from Edit intake. Existing records retain their old notes, requirements, shortlists and interview feedback; staff can complete the new fields when editing. New preference fields are captured for staff review; the existing job-requirement scoring is unchanged. Additional job requirements and pasted notes remain under a collapsible section.

Both browser and API validate age counts, numeric ranges, education ordering, duplicate ranking options and contradictory fresher/experience choices. The API continues to accept older customer records without structured intake.

## Matching

Fit measures confirmed job requirements: care experience, language, cooking, employment duration, budget, start date, rest-day arrangements, pet comfort and home experience. Required checks have weight 3; preferences have weight 1. Unknown values earn no points but are shown separately from failures. Required failures set Requirement mismatch regardless of total score. Missing required evidence or an unreviewed profile sets Needs verification. Eligibility is sorted before score. No active criteria yields no score.

Nationality, age and religion preferences are recorded as notes for staff review and do not alter the score. Scores do not claim to establish trustworthiness. Staff can override order with a recorded reason; this never changes the calculated score. Feedback is retained without automatic learning.

## First-cut limitations

- PDF extraction runs locally with PyMuPDF and optional Tesseract OCR; no AI key is needed and documents are not sent externally. On macOS install OCR with `brew install tesseract`; on Debian/Ubuntu install the `tesseract-ocr` package. Without it, native PDF text still populates supported fields, but scanned/image-only fields are flagged.
- Supported fields include name, DOB, age, height, weight, nationality, marital status, religion, education, siblings, child count/ages, languages, English level, salary, rest days, explicit availability, cooking, declared care skills, willingness and dated employment history. Source evidence is retained for extracted fields. Missing or conflicting values require staff review. The parser supports common labelled biodata forms; unfamiliar layouts, handwriting and poor scans may require correction.
- Infant experience is not inferred from generic “infants/children” form wording. Willingness is distinct from experience. Job durations derived from year-only dates are approximate; overlapping periods are not double-counted.
- Intake suggestions use explicit keywords, not an LLM. They cannot reliably understand negation or complex preferences. Staff must confirm them.
- Name matches are flagged as possible duplicates. Automatic merging and a full cross-supplier reconciliation interface are not implemented.
- Employment entries and populated personal details are editable. Field sources include page, extraction method and supporting text. Full supplier revision reconciliation remains later work.
- Excel/Drive import, DOCX, WhatsApp sending, customer access, individual accounts, automated scheduling, production hardening and learned scoring are deferred.
- Defaults use fictional data, not the user's actual biodata. The first cut has no public deployment yet.

## Validate

```sh
npm test
```

Tests cover requirement eligibility, structured intake, missing information, PDF field extraction and OCR, staff corrections on re-extraction, authenticated deletion, original-file cleanup, deletion during processing, reservation protection and persistence. The extraction suite includes a real scanned-PDF OCR test when Tesseract is installed. See `test/browser.py` for an optional browser smoke run with Python Playwright and Chromium installed. Use a separate `DATA_DIR` when testing to preserve user data.

## PDF extraction and review

Uploads are queued with two concurrent workers and a three-minute per-document time limit. Each PDF may contain up to 25 pages and must be unlocked. Filenames are not treated as evidence for age or DOB. All imports remain in review even when many fields populate. Match scores distinguish missing care evidence from a known absence of experience. Field-level staff corrections are preserved during re-extraction.

Deleting a candidate is permanent in this pilot. The browser confirms that the original PDF, profile and linked shortlist/ranking records will be removed. No extraction process can restore a deleted profile.
