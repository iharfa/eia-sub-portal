import { sql, staffRole } from "./_db.js";

/* The EIA Consultants Registry.
   GET          → public: verified entries only, plus the registry's last-updated stamp
   GET ?all=1   → staff: every entry including pending/suspended
   POST         → admin: add a registry entry directly
   PATCH        → admin: edit any entry (stamps last_updated_at + updated_by) */
export default async function handler(req, res) {
  if (req.method === "GET") {
    if (req.query.all) {
      const s = await staffRole(req);
      if (!s) return res.status(401).json({ error: "unauthorized" });
      const rows = await sql`
        select c.*, u.email as account_email
        from consultants c left join users u on u.consultant_id = c.id
        order by c.kind, c.reg_no, c.name`;
      return res.json(rows);
    }
    const rows = await sql`
      select id, reg_no, name, category, kind, company, address, email, phone,
             license_expiry, specialties, status, last_updated_at
      from consultants
      where verified = true and status <> 'pending'
      order by kind, reg_no, name`;
    const [meta] = await sql`select max(last_updated_at) as registry_updated from consultants where verified = true`;
    return res.json({ registry_updated: meta ? meta.registry_updated : null, consultants: rows });
  }

  const s = await staffRole(req);
  if (!s || s.role !== "admin") return res.status(403).json({ error: "ERA admin access required" });

  const FIELDS = ["reg_no", "name", "category", "kind", "company", "address", "phone", "email",
    "qualifications", "specialties", "status", "era_notes"];

  if (req.method === "POST") {
    const b = req.body || {};
    const [c] = await sql`
      insert into consultants (reg_no, name, category, kind, company, address, phone, email,
                               license_expiry, qualifications, specialties, status, verified, updated_by)
      values (${String(b.reg_no || "").slice(0, 60)}, ${String(b.name || "").slice(0, 160)},
              ${String(b.category || "").slice(0, 10)}, ${b.kind === "temporary" ? "temporary" : "permanent"},
              ${String(b.company || "").slice(0, 160)}, ${String(b.address || "").slice(0, 300)},
              ${String(b.phone || "").slice(0, 40)}, ${String(b.email || "").slice(0, 160)},
              ${b.license_expiry || null}, ${String(b.qualifications || "").slice(0, 2000)},
              ${String(b.specialties || "").slice(0, 2000)}, ${String(b.status || "active").slice(0, 20)},
              ${!!b.verified}, ${s.actor})
      returning *`;
    await sql`insert into audit (actor, action, detail) values (${s.actor}, 'registry_add', ${"consultant " + c.id + " " + c.name})`;
    return res.status(201).json(c);
  }

  if (req.method === "PATCH") {
    const b = req.body || {};
    const id = Number(b.id);
    if (!id) return res.status(400).json({ error: "id required" });
    const changed = [];
    for (const k of FIELDS) {
      if (typeof b[k] === "string") {
        await sql.query(`update consultants set ${k} = $1 where id = $2`, [b[k].slice(0, 2000), id]);
        changed.push(k);
      }
    }
    if (b.license_expiry !== undefined) {
      await sql`update consultants set license_expiry = ${b.license_expiry || null} where id = ${id}`;
      changed.push("license_expiry");
    }
    if (typeof b.verified === "boolean") {
      await sql`update consultants set verified = ${b.verified} where id = ${id}`;
      changed.push("verified→" + b.verified);
    }
    if (!changed.length) return res.status(400).json({ error: "nothing to update" });
    await sql`update consultants set last_updated_at = now(), updated_by = ${s.actor} where id = ${id}`;
    await sql`insert into audit (actor, action, detail) values (${s.actor}, 'registry_edit', ${"consultant " + id + ": " + changed.join(", ")})`;
    const [c] = await sql`select * from consultants where id = ${id}`;
    return res.json(c);
  }

  res.setHeader("Allow", "GET, POST, PATCH");
  return res.status(405).json({ error: "method not allowed" });
}
