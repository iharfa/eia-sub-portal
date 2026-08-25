import { sql, staffRole } from "./_db.js";

const PREFIX = { screening: "SCR", application: "EIA-A", report: "EIA-R", addendum: "EIA-AD" };

export default async function handler(req, res) {
  if (req.method === "GET") {
    if (!staffRole(req)) return res.status(401).json({ error: "unauthorized" });
    const rows = await sql`
      select s.id, s.ref, s.type, s.status, s.officer, s.expedited, s.fee_tier, s.created_at,
             s.case_data->'proponent'->>'name' as proponent,
             s.case_data->'project'->>'name'  as project,
             concat(s.case_data->'project'->>'island', ', ', s.case_data->'project'->>'atoll') as loc,
             s.case_data->'consultant'->>'name' as consultant,
             count(f.id)::int as file_count,
             coalesce(sum(f.size_bytes),0)::bigint as total_bytes
      from submissions s left join files f on f.submission_id = s.id
      group by s.id order by s.created_at desc`;
    return res.json(rows);
  }

  if (req.method === "POST") {
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
    const [row] = await sql`
      insert into submissions (ref, type, case_data, checklist, fee_tier, expedited)
      values ('PENDING', ${type}, ${JSON.stringify(caseData)},
              ${checklist ? JSON.stringify(checklist) : null}, ${feeTier}, ${!!b.expedited})
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
              values (${row.id}, 'applicant', 'submitted', ${type + " " + ref})`;
    return res.status(201).json({ ref, id: row.id, created_at: row.created_at });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "method not allowed" });
}
