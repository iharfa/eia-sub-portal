import { sql, staffRole } from "./_db.js";

const STATUSES = ["received", "review", "revisions", "approved", "rejected"];
const DECISIONS = ["eia_required", "prelim_study", "mgmt_plan", "proceed", "proceed_conditions"];

export default async function handler(req, res) {
  if (req.method === "GET") {
    // Public registry of submitted EIA reports (for the addendum selector).
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
    // ponytail: the ref acts as the lookup token — fine for a demo, add applicant auth for production
    const [s] = await sql`select * from submissions where ref = ${ref}`;
    if (!s) return res.status(404).json({ error: "not found" });
    const files = await sql`select * from files where submission_id = ${s.id} order by category, id`;
    const out = { ...s, files };
    if (staffRole(req)) {
      out.audit = await sql`select * from audit where submission_id = ${s.id} order by at desc limit 50`;
    }
    return res.json(out);
  }

  if (req.method === "PATCH") {
    const role = staffRole(req);
    if (!role) return res.status(401).json({ error: "unauthorized" });
    const b = req.body || {};
    const id = Number(b.id);
    if (!id) return res.status(400).json({ error: "id required" });
    // Officers work the queue; final decisions are admin-only.
    const decisionAsked = typeof b.decision === "string" ||
      (typeof b.status === "string" && b.status !== "review");
    if (role !== "admin" && decisionAsked)
      return res.status(403).json({ error: "admin access required for decisions" });
    const actor = "era-" + role;

    if (b.file && Number(b.file.id)) {
      await sql`update files set verified = ${!!b.file.verified}
                where id = ${Number(b.file.id)} and submission_id = ${id}`;
      await sql`insert into audit (submission_id, actor, action, detail)
                values (${id}, ${actor}, 'file_verify', ${"file " + b.file.id + " → " + !!b.file.verified})`;
    }
    if (typeof b.status === "string") {
      if (!STATUSES.includes(b.status)) return res.status(400).json({ error: "bad status" });
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
    return res.json(s || { ok: true });
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ error: "method not allowed" });
}
