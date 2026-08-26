# EIA Submission Portal (eia-sub-portal)

Combined **applicant submission portal + ERA review dashboard** for Maldives EIA workflows,
with **role-based accounts**: the public browses, registered EIA consultants submit and track,
ERA officers work the queue, and ERA admins decide and administer the consultants registry.

## The three levels of users

**Public** (no account):

- **Statistics dashboard** — EIAs received by year/category/document type, computed from ERA's published-report names.
- **EIA Repository** — all ~2,100 published reports from era.gov.mv with search and filters.
- **EIA Consultants Registry** — the ERA-maintained public list of registered consultants (seeded from the published 10 Aug 2026 PDF): registration no, category, contact, license expiry (expired licenses are marked), and a **last-updated stamp on every entry** plus a registry-wide one.
- Manifest lookup by reference number (`#ref=EIA-R/2026/0001`) — the printable submission receipt.

**EIA Consultants** (register in the portal; ERA verifies):

- Email + password accounts. Registering links to an existing registry entry by email, or creates a **pending** registry entry that ERA verifies before it appears publicly.
- **My account dashboard**: registry profile (verification badge, license expiry, last-updated stamp), self-service edits to contact/professional fields — ERA-controlled fields (reg no, category, status, expiry) are locked.
- **My submissions** — every screening / application / report / addendum submitted from the account, with live status, a **status timeline** (submitted → under review → revisions → decision, dated from the audit trail), and **issues flagged by ERA** with a reply box.
- **Autofill**: on any form's consultant section, one click fills name / license no / expiry / email from the verified registry record — still editable afterwards.
- **Project team**: surveyors and other supporting professionals are recorded per submission (name, role, registration no) and shown to ERA and on the manifest.
- Submitting requires being signed in — every submission is tied to the account and the registry record (reg no + verification state are stamped into the record; expired licenses are auto-flagged to ERA).

There is **no role toggle** — what you see is decided by the signed-in account: staff accounts get the ERA Review Console section appended to the sidebar nav.

> **Demo access:** username `ERAAdmin` · password `Demo1234` — auto-provisioned on first login, opens **both** the consultant dashboard and the ERA admin console (the account is an admin with a linked demo registry entry).

**ERA staff** (accounts created with `npm run staff`; legacy env keys still work as a fallback):

- **Officer**: submissions queue with open-issue counts, per-file verification, officer assignment, notes, mark under review, **flag issues** (general, or pinned to a document + page — with the document open **in the browser viewer**), resolve issues.
- **Admin**: everything above plus decisions (approve / request revisions / reject, screening outcomes) and **registry administration** — add/edit/verify consultant entries; every edit stamps `last updated … by …` and lands in the audit log.

## Checks & balances built into the flow

- Required document categories are enforced **server-side** per form type (the browser checks are a convenience, the API is the authority).
- Every file needs a typed description; expedited review requires the raw-data packages.
- An addendum must reference an EIA report that actually exists in this portal.
- **Approval is blocked** while any issue is open or any file is unverified — enforced by the API, explained in the review console.
- Officers cannot record decisions; consultants cannot touch ERA-controlled registry fields; issue replies only work on your own submission.
- Everything lands in the audit trail: status changes, decisions, file verification, issue flag/reply/resolve, registry edits, account registration.

## Stack

- Static front end: one `index.html` built from `src/eia-portal.template.html` (`python src/build.py`). No framework.
- `api/` — Vercel serverless functions (plain JS): `auth`, `consultants`, `submissions`, `submission`, `upload`.
- **Neon Postgres** — submissions, files, audit, users, sessions, consultants, issues (`schema.sql`, `npm run db:init` — idempotent, safe on an existing database).
- **Vercel Blob** — file storage, client-direct uploads.
- Auth: scrypt password hashes, 30-day DB-backed bearer sessions. No extra dependencies.

## Environment variables

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store token |
| `ADMIN_KEY` / `OFFICER_KEY` | *(optional legacy fallback)* shared-key access to the ERA console |

## Setup

```bash
npm install
# set DATABASE_URL, then:
npm run db:init                 # create/upgrade tables (idempotent)
npm run db:seed-consultants     # seed the registry from ERA's published list (77 entries)
npm run staff -- admin@era.gov.mv <password> "Admin Name" admin
npm run staff -- officer@era.gov.mv <password> "Officer Name" officer
# edit src/eia-portal.template.html, then:
npm run html
vercel deploy --prod
```

## Remaining production notes

- Blob store is public-read (anyone with a file URL can open it); 200MB/file cap in `api/upload.js`.
- No email delivery yet — password resets and issue notifications would be the next step.
- era-dashboard's Excel-seeded monitoring/inspection modules are not merged.
