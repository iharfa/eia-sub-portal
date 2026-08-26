import { sql, staffRole, getUser } from "./_db.js";

const STATUSES = ["received", "review", "revisions", "approved", "rejected"];
const DECISIONS = ["eia_required", "prelim_study", "mgmt_plan", "proceed", "proceed_conditions"];

export default async function handler(req, res) {
  if (req.method === "GET") {
    // Registry of submitted EIA reports (for the addendum selector).
    if (req.query.reports) {
      const rows = await sql`
        select ref, created_at,
               case_data->'report'->>'name'      as report_name,
               case_data->'project'->>'name'     as project,
               case_data->'project'->>'island'   as island,
               case_data->'project'->>'atoll'    as atoll,
               case_data->'proponent'->>'name'   as proponent,
               case_data->'consultant'->>'name'  as consultant
        from submissions where type = 'report' order by created_at desc limit 100`;
      return res.json(rows);
    }
    const ref = String(req.query.ref || "");
    if (!ref) return res.status(400).json({ error: "ref required" });
    const [s] = await sql`select * from submissions where ref = ${ref}`;
    if (!s) return res.status(404).json({ error: "not found" });
    const staff = await staffRole(req);
    const user = staff ? null : await getUser(req);
    const isOwner = !!(user && s.user_id && user.id === s.user_id);
    const files = await sql`select * from files where submission_id = ${s.id} order by category, id`;
    const out = { ...s, files, viewer: staff ? staff.role : (isOwner ? "owner" : "public") };
    // The full review record — issues + audit timeline — is for ERA and the
    // submitting account only; the public manifest stays a document listing.
    if (staff || isOwner) {
      out.issues = await sql`select * from issues where submission_id = ${s.id} order by status desc, created_at desc`;
      out.audit = await sql`select * from audit where submission_id = ${s.id} order by at desc limit 50`;
    }
    return res.json(out);
  }

  if (req.method === "PATCH") {
    const b = req.body || {};
    const id = Number(b.id);
    if (!id) return res.status(400).json({ error: "id required" });
    const staff = await staffRole(req);

    // Consultant replying to a flagged issue on their own submission.
    if (!staff && typeof b.replyIssue === "number") {
      const u = await getUser(req);
      if (!u) return res.status(401).json({ error: "not signed in" });
      const [s] = await sql`select user_id from submissions where id = ${id}`;
      if (!s || s.user_id !== u.id) return res.status(403).json({ error: "not your submission" });
      await sql`update issues set reply = ${String(b.reply || "").slice(0, 4000)}
                where id = ${b.replyIssue} and submission_id = ${id}`;
      await sql`insert into audit (submission_id, actor, action, detail)
                values (${id}, ${u.email}, 'issue_reply', ${"issue " + b.replyIssue})`;
      const issues = await sql`select * from issues where submission_id = ${id} order by status desc, created_at desc`;
      return res.json({ ok: true, issues });
    }

    if (!staff) return res.status(401).json({ error: "unauthorized" });
    const role = staff.role, actor = staff.actor;
    // Officers work the queue; final decisions are admin-only.
    const decisionAsked = typeof b.decision === "string" ||
      (typeof b.status === "string" && b.status !== "review");
    if (role !== "admin" && decisionAsked)
      return res.status(403).json({ error: "admin access required for decisions" });

    if (b.file && Number(b.file.id)) {
      await sql`update files set verified = ${!!b.file.verified}
                where id = ${Number(b.file.id)} and submission_id = ${id}`;
      await sql`insert into audit (submission_id, actor, action, detail)
                values (${id}, ${actor}, 'file_verify', ${"file " + b.file.id + " → " + !!b.file.verified})`;
    }
    // Flag an issue (optionally pinned to a file + page).
    if (b.issue && typeof b.issue.note === "string" && b.issue.note.trim()) {
      const [i] = await sql`
        insert into issues (submission_id, file_id, page, note, raised_by)
        values (${id}, ${Number(b.issue.fileId) || null}, ${String(b.issue.page || "").slice(0, 20)},
                ${b.issue.note.trim().slice(0, 4000)}, ${actor})
        returning id`;
      await sql`insert into audit (submission_id, actor, action, detail)
                values (${id}, ${actor}, 'issue_flagged', ${"issue " + i.id + ": " + b.issue.note.trim().slice(0, 120)})`;
    }
    if (typeof b.resolveIssue === "number") {
      await sql`update issues set status = 'resolved', resolved_at = now(),
                resolution = ${String(b.resolution || "").slice(0, 2000)}
                where id = ${b.resolveIssue} and submission_id = ${id}`;
      await sql`insert into audit (submission_id, actor, action, detail)
                values (${id}, ${actor}, 'issue_resolved', ${"issue " + b.resolveIssue})`;
    }
    if (typeof b.status === "string") {
      if (!STATUSES.includes(b.status)) return res.status(400).json({ error: "bad status" });
      // Checks & balances on approval: nothing outstanding may remain.
      if (b.status === "approved") {
        const [{ n: openIssues }] = await sql`select count(*)::int as n from issues where submission_id = ${id} and status = 'open'`;
        if (openIssues > 0) return res.status(409).json({ error: openIssues + " open issue(s) must be resolved before approval" });
        const [{ n: unverified }] = await sql`select count(*)::int as n from files where submission_id = ${id} and verified = false`;
        if (unverified > 0) return res.status(409).json({ error: unverified + " file(s) not yet verified — verify every document before approval" });
      }
      await sql`update submissions set status = ${b.status}, updated_at = now() where id = ${id}`;
      await sql`insert into audit (submission_id, actor, action, detail)
                values (${id}, ${actor}, 'status', ${b.status})`;
    }
    if (typeof b.decision === "string") {
      if (!DECISIONS.includes(b.decision)) return res.status(400).json({ error: "bad decision" });
      await sql`update submissions set decision = ${b.decision}, updated_at = now() where id = ${id}`;
      await sql`insert into audit (submission_id, actor, action, detail)
                values (${id}, ${actor}, 'decision', ${b.decision})`;
    }
    if (typeof b.officer === "string") {
      await sql`update submissions set officer = ${b.officer.slice(0, 80)}, updated_at = now() where id = ${id}`;
      await sql`insert into audit (submission_id, actor, action, detail)
                values (${id}, ${actor}, 'officer', ${b.officer.slice(0, 80)})`;
    }
    if (typeof b.notes === "string") {
      await sql`update submissions set notes = ${b.notes.slice(0, 8000)}, updated_at = now() where id = ${id}`;
      await sql`insert into audit (submission_id, actor, action, detail)
                values (${id}, ${actor}, 'notes', 'reviewer notes updated')`;
    }
    const [s] = await sql`select * from submissions where id = ${id}`;
    const issues = await sql`select * from issues where submission_id = ${id} order by status desc, created_at desc`;
    return res.json(s ? { ...s, issues } : { ok: true });
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ error: "method not allowed" });
}
