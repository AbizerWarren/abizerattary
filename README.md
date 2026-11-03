# Amah · Agency pilot

A working first cut for a small Singapore employment agency: customer intake, explainable matching, profile review, availability, shortlisting and interview notes. The initial database contains clearly labelled fictional demo records.

## Run

Requires Node.js 22+ and Python 3.10+. The web application uses only Node built-ins; there are no npm dependencies.

```sh
cd /workspace/abizerattary
python3 -m pip install -r requirements.txt
npm start
```

The server listens on port 3000. Without `AGENCY_PASSWORD`, sign in with **amah-demo**. Before hosting real records, set a strong `AGENCY_PASSWORD`, use HTTPS and set `COOKIE_SECURE=true`. A shared login is implemented; individual accounts are deferred. Sessions expire after 12 hours and on server restart.

Environment settings: `PORT` (3000), `HOST` (0.0.0.0), `DATA_DIR` (defaults to `data/`), `PYTHON` (python3), `AGENCY_PASSWORD`, `COOKIE_SECURE`. No AI credentials are needed for this first cut. Use the existing checkout; tasks already have an isolated environment and do not need additional Git worktrees.

## Try the workflow

1. Open the Tan family's workspace to inspect score explanations and requirements.
2. Add a customer, paste conversation notes and review keyword suggestions. Confirm required/preferred/no-preference settings.
3. Shortlist candidates, record when a PDF was sent, schedule an interview and save feedback.
4. Switch to My ranking, drag a candidate or use the arrows, and record the reason.
5. Upload multiple PDFs from Candidate library. Open Review queue, inspect extracted page text alongside the original, enter verified fields, and save.
6. Mark a candidate Reserved: new shortlists are blocked. Placed and Withdrawn candidates disappear from active matches.

The application data and PDFs persist in ignored `data/`. Data backup downloads JSON; separately preserve `data/uploads/` to retain original documents. This is a single-process pilot store using atomic JSON writes, not a multi-instance production database. Do not share one data directory between server processes.

## Matching

Fit measures confirmed job requirements: care experience, language, cooking, employment duration, budget, start date, rest-day arrangements, pet comfort and home experience. Required checks have weight 3; preferences have weight 1. Unknown values earn no points but are shown separately from failures. Required failures set Requirement mismatch regardless of total score. Missing required evidence or an unreviewed profile sets Needs verification. Eligibility is sorted before score. No active criteria yields no score.

Nationality, age and religion preferences are recorded as notes for staff review and do not alter the score. Scores do not claim to establish trustworthiness. Staff can override order with a recorded reason; this never changes the calculated score. Feedback is retained without automatic learning.

## First-cut limitations

- PDF uploads retain the original and extract page text locally using PyMuPDF. AI field extraction and OCR are **not connected**. Every upload enters manual review; scanned PDFs need manual data entry.
- Intake suggestions use explicit keywords, not an LLM. They cannot reliably understand negation or complex preferences. Staff must confirm them.
- Name matches are flagged as possible duplicates. Automatic merging and a full cross-supplier reconciliation interface are not implemented.
- The interface can record known fields and new notes; complete employment-history editing, detailed document revision comparison and field-level evidence mapping are later work. Extracted evidence is currently page-level.
- Excel/Drive import, DOCX, WhatsApp sending, customer access, individual accounts, automated scheduling, production hardening and learned scoring are deferred.
- Defaults use fictional data, not the user's actual biodata. The first cut has no public deployment yet.

## Validate

```sh
npm test
```

Tests cover requirement eligibility, missing information, verified language, fresher handling, ranking, reservation protection, authenticated API access and persistence. See `test/browser.py` for an optional browser smoke run with Python Playwright and Chromium installed. Use a separate `DATA_DIR` when testing to preserve user data.
