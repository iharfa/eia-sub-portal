import { sql, staffRole, getUser } from "./_db.js";

const PREFIX = { screening: "SCR", application: "EIA-A", report: "EIA-R", addendum: "EIA-AD" };
/* server-side copy of the required upload categories per form (checks & balances:
   the browser enforces these too, but the API is the authority) */
const REQUIRED_DOCS = {
  screening: [],
  application: ["tor", "brief", "siteDrawing", "conceptApproval"],
  report: ["report", "nonTech", "rawBaseline"],
  addendum: ["addendumDoc"],
};

export default async function handler(req, res) {
  if (req.method === "GET") {
    // A signed-in consultant's own submissions, with open-issue counts.
    if (req.query.mine) {
      const u = await getUser(req);
      if (!u) return res.status(401).json({ error: "not signed in" });
      const rows = await sql`
        select s.id, s.ref, s.type, s.status, s.decision, s.expedited, s.created_at, s.updated_at,
               s.case_data->'project'->>'name' as project,
               count(f.id)::int as file_count,
               (select count(*)::int from issues i where i.submission_id = s.id and i.status = 'open') as open_issues
        from submissions s left join files f on f.submission_id = s.id
        where s.user_id = ${u.id}
        group by s.id order by s.created_at desc`;
      return res.json(rows);
    }
    if (!(await staffRole(req))) return res.status(401).json({ error: "unauthorized" });
    const rows = await sql`
      select s.id, s.ref, s.type, s.status, s.officer, s.expedited, s.fee_tier, s.created_at,
             s.case_data->'proponent'->>'name' as proponent,
             s.case_data->'project'->>'name'  as project,
             concat(s.case_data->'project'->>'island', ', ', s.case_data->'project'->>'atoll') as loc,
             s.case_data->'consultant'->>'name' as consultant,
             count(f.id)::int as file_count,
             coalesce(sum(f.size_bytes),0)::bigint as total_bytes,
             (select count(*)::int from issues i where i.submission_id = s.id and i.status = 'open') as open_issues
      from submissions s left join files f on f.submission_id = s.id
      group by s.id order by s.created_at desc`;
    return res.json(rows);
  }

  if (req.method === "POST") {
    // Submissions are tied to an account: the reference number, the consultant and
    // the status timeline all hang off it.
    const u = await getUser(req);
    if (!u) return res.status(401).json({ error: "sign in to submit — submissions are tied to your account" });
    const b = req.body || {};
    const type = String(b.type || "");
    if (!PREFIX[type]) return res.status(400).json({ error: "bad type" });
    const caseData = b.case && typeof b.case === "object" ? b.case : {};
    const files = Array.isArray(b.files) ? b.files.slice(0, 200) : [];
    const checklist = Array.isArray(b.checklist) ? b.checklist.slice(0, 50) : null;
    const feeTier = [1, 2, 3].includes(b.feeTier) ? b.feeTier : null;

    for (const f of files) {
      if (!f || typeof f.name !== "string" || typeof f.category !== "string")
        return res.status(400).json({ error: "bad file entry" });
      if (typeof f.description !== "string" || !f.description.trim())
        return res.status(400).json({ error: "every file needs a description: " + f.name });
    }
    const cats = new Set(files.map(f => f.category));
    for (const c of REQUIRED_DOCS[type]) {
      if (!cats.has(c)) return res.status(400).json({ error: "required upload missing: " + c });
    }
    // an addendum must attach to a report that really exists in this portal
    if (type === "addendum") {
      const orig = String((caseData.addendum || {}).originalReportRegNo || "");
      const [r] = orig ? await sql`select id from submissions where ref = ${orig} and type = 'report'` : [];
      if (!r) return res.status(400).json({ error: "addendum must reference an EIA report submitted through this portal" });
    }

    // stamp the account's verified registry record into the submission
    let consultantId = u.consultant_id || null;
    let licenseFlag = "";
    if (consultantId) {
      const [c] = await sql`select reg_no, name, verified, status, license_expiry from consultants where id = ${consultantId}`;
      if (c) {
        caseData._submittedBy = { userId: u.id, email: u.email, consultantId, regNo: c.reg_no, verified: c.verified };
        if (c.license_expiry && new Date(c.license_expiry) < new Date())
          licenseFlag = "license expired " + String(c.license_expiry).slice(0, 10);
        if (!c.verified) licenseFlag += (licenseFlag ? "; " : "") + "registry entry not yet ERA-verified";
      }
    }

    const [row] = await sql`
      insert into submissions (ref, type, case_data, checklist, fee_tier, expedited, user_id, consultant_id)
      values ('PENDING', ${type}, ${JSON.stringify(caseData)},
              ${checklist ? JSON.stringify(checklist) : null}, ${feeTier}, ${!!b.expedited},
              ${u.id}, ${consultantId})
      returning id, created_at`;
    const ref = `${PREFIX[type]}/${new Date().getFullYear()}/${String(row.id).padStart(4, "0")}`;
    await sql`update submissions set ref = ${ref} where id = ${row.id}`;
    for (const f of files) {
      await sql`
        insert into files (submission_id, category, filename, size_bytes, content_type, blob_url, description)
        values (${row.id}, ${f.category.slice(0, 40)}, ${f.name.slice(0, 300)},
                ${Math.max(0, Number(f.size) || 0)}, ${String(f.contentType || "").slice(0, 120)},
                ${String(f.url || "").slice(0, 800)}, ${f.description.slice(0, 3000)})`;
    }
    await sql`insert into audit (submission_id, actor, action, detail)
              values (${row.id}, ${u.email}, 'submitted', ${type + " " + ref})`;
    if (licenseFlag)
      await sql`insert into audit (submission_id, actor, action, detail)
                values (${row.id}, 'system', 'flag', ${licenseFlag})`;
    return res.status(201).json({ ref, id: row.id, created_at: row.created_at });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "method not allowed" });
}
