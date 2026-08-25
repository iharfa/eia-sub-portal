# EIA Submission Portal (eia-sub-portal)

Combined **applicant submission portal + ERA review dashboard** for Maldives EIA workflows —
the merge of the [eia-portal](https://github.com/iharfa/eia-portal) design mockup (front end)
and the [era-dashboard](https://github.com/iharfa/era-dashboard) management model (workflow,
assignment, audit), now with a real database and real file uploads.

## What it does

**Applicant side** (public, bilingual EN / ދިވެހި):

- Opens on a **public statistics dashboard**: EIAs received (all years / this year / this month), types of EIAs by project category, document type, and year — computed from ERA's published-report names.
- **EIA Repository**: all ~2,100 published reports from [era.gov.mv/reports.html](https://www.era.gov.mv/reports.html) with search, year/type filters, and links to the official SharePoint folders. Snapshot lives in `reports.json`; refresh with `python scripts/build_reports.py` (groups by report *name* only — no report contents are fetched).
- The four ERA forms as one lifecycle: Screening (optional) → EIA Application → Report Submission → Addendum (attaches to a real previously-submitted report).
- Real file uploads per document category — EIA report docs plus raw-data packages: GIS / island shapefiles with sampling locations, baseline survey data, water quality & environmental sampling data, bathymetry, lab testing reports, site photos.
- **Every file requires a typed description of its contents.** Submission is blocked without one.
- **Expedited review**: can only be requested when the raw-data packages (GIS, baseline, water sampling, lab reports) are all uploaded and described — checked live in the form.
- On submit, the portal generates a **document manifest report**: the formal record of every uploaded file with its declared contents, printable as the submission receipt. Retrievable any time by reference number (`#ref=EIA-R/2026/0001`).

**ERA admin side** (toggle top-left, gated by admin key):

- Live submissions queue with KPI tiles, file counts/sizes, expedited flags.
- Review screen: applicant record, every file with its declared contents + per-file verification, the 22-item contents declaration, screening decisions (5 outcomes), approve / request revisions / reject, officer assignment, reviewer notes, audit trail.

## Stack

- Static front end: one `index.html` built from `src/eia-portal.template.html` (`python src/build.py`). No framework.
- `api/` — Vercel serverless functions (plain JS).
- **Neon Postgres** — submissions, files, audit (`schema.sql`, `npm run db:init`).
- **Vercel Blob** — file storage, client-direct uploads (large shapefiles bypass the 4.5MB function body limit).

## Environment variables

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store token (auto-set when the store is connected to the project) |
| `ADMIN_KEY` | Key for the ERA Admin console level (full access incl. decisions) |
| `OFFICER_KEY` | Key for the ERA Officer console level (queue work: verify files, assign, notes, mark under review — no decisions) |

## Setup

```bash
npm install
# set DATABASE_URL, then:
npm run db:init
# edit src/eia-portal.template.html, then:
npm run html
vercel deploy --prod
```

## Demo-scale placeholders (upgrade path)

- The reference number is the lookup token for manifests — add applicant accounts for production.
- Staff access is two shared keys (officer / admin) — replace with real staff auth + per-user roles for production.
- Blob store is public-read; ~250MB demo budget, 200MB/file cap in `api/upload.js`.
- era-dashboard's Excel-seeded monitoring/inspection modules are not merged; point them at this database as a next step.
