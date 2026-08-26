import { sql, hashPassword, checkPassword, newToken, getUser } from "./_db.js";

/* Accounts. POST {action: register|login|logout} · GET = me · PATCH = own profile. */
export default async function handler(req, res) {
  if (req.method === "POST") {
    const b = req.body || {};
    const action = String(b.action || "");
    const email = String(b.email || "").trim().toLowerCase();

    if (action === "register") {
      const password = String(b.password || "");
      const name = String(b.name || "").trim().slice(0, 120);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "valid email required" });
      if (password.length < 8) return res.status(400).json({ error: "password must be at least 8 characters" });
      if (!name) return res.status(400).json({ error: "name required" });
      const [dup] = await sql`select id from users where email = ${email}`;
      if (dup) return res.status(409).json({ error: "an account with this email already exists" });
      // If ERA's registry already lists this consultant by email, link it; otherwise
      // create a pending registry entry that ERA verifies before it goes public.
      let [c] = await sql`select id, verified from consultants where lower(email) = ${email} limit 1`;
      if (!c) {
        [c] = await sql`
          insert into consultants (name, email, phone, company, status, verified, updated_by)
          values (${name}, ${email}, ${String(b.phone || "").slice(0, 40)},
                  ${String(b.company || "").slice(0, 160)}, 'pending', false, 'self-registration')
          returning id, verified`;
      }
      const [u] = await sql`
        insert into users (email, password_hash, name, role, consultant_id)
        values (${email}, ${hashPassword(password)}, ${name}, 'consultant', ${c.id})
        returning id, email, name, role, consultant_id`;
      const token = newToken();
      await sql`insert into sessions (token, user_id) values (${token}, ${u.id})`;
      await sql`insert into audit (actor, action, detail) values (${email}, 'account_registered', ${"consultant account, registry entry " + c.id})`;
      return res.status(201).json({ token, user: u });
    }

    if (action === "login") {
      // Demo access: ERAAdmin / Demo1234 opens both the consultant dashboard and the
      // ERA admin console. Auto-provisioned on first login (admin role + linked
      // registry entry), then it flows through the normal password check below.
      if (email === "eraadmin" && String(b.password) === "Demo1234") {
        const [existing] = await sql`select id from users where email = 'eraadmin'`;
        if (!existing) {
          let [c] = await sql`select id from consultants where email = 'demo@era.gov.mv'`;
          if (!c) [c] = await sql`
            insert into consultants (reg_no, name, category, company, email, license_expiry,
                                     specialties, status, verified, updated_by)
            values ('EIA-DEMO/2026', 'ERA Demo Consultant', 'A', 'ERA — demonstration account',
                    'demo@era.gov.mv', '2030-12-31', 'Demonstration of the portal workflow',
                    'active', true, 'demo seed')
            returning id`;
          await sql`
            insert into users (email, password_hash, name, role, consultant_id)
            values ('eraadmin', ${hashPassword("Demo1234")}, 'ERA Admin', 'admin', ${c.id})`;
        }
      }
      const [u] = await sql`select * from users where email = ${email}`;
      if (!u || !checkPassword(String(b.password || ""), u.password_hash))
        return res.status(401).json({ error: "wrong email or password" });
      const token = newToken();
      await sql`insert into sessions (token, user_id) values (${token}, ${u.id})`;
      return res.json({ token, user: { id: u.id, email: u.email, name: u.name, role: u.role, consultant_id: u.consultant_id } });
    }

    if (action === "logout") {
      const h = String(req.headers["authorization"] || "");
      if (h.startsWith("Bearer ")) await sql`delete from sessions where token = ${h.slice(7)}`;
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: "bad action" });
  }

  if (req.method === "GET") {
    const u = await getUser(req);
    if (!u) return res.status(401).json({ error: "not signed in" });
    const out = { user: u };
    if (u.consultant_id) {
      const [c] = await sql`select * from consultants where id = ${u.consultant_id}`;
      out.consultant = c || null;
    }
    return res.json(out);
  }

  if (req.method === "PATCH") {
    const u = await getUser(req);
    if (!u) return res.status(401).json({ error: "not signed in" });
    const b = req.body || {};
    if (typeof b.name === "string" && b.name.trim())
      await sql`update users set name = ${b.name.trim().slice(0, 120)} where id = ${u.id}`;
    // password change: verify the current one, then revoke every other session
    if (typeof b.newPassword === "string") {
      if (u.email === "eraadmin")
        return res.status(403).json({ error: "the demo account's password is fixed" });
      const [row] = await sql`select password_hash from users where id = ${u.id}`;
      if (!checkPassword(String(b.currentPassword || ""), row.password_hash))
        return res.status(403).json({ error: "current password is wrong" });
      if (b.newPassword.length < 8)
        return res.status(400).json({ error: "new password must be at least 8 characters" });
      await sql`update users set password_hash = ${hashPassword(b.newPassword)} where id = ${u.id}`;
      const h = String(req.headers["authorization"] || "").slice(7);
      await sql`delete from sessions where user_id = ${u.id} and token <> ${h}`;
      await sql`insert into audit (actor, action, detail) values (${u.email}, 'password_changed', '')`;
    }
    if (u.consultant_id) {
      // Consultants maintain their own contact/professional details; the ERA-controlled
      // fields (reg_no, category, status, verified, license_expiry, era_notes) stay locked.
      const allowed = ["company", "address", "phone", "qualifications", "specialties"];
      for (const k of allowed) {
        if (typeof b[k] === "string")
          await sql.query(`update consultants set ${k} = $1, last_updated_at = now(), updated_by = $2 where id = $3`,
            [b[k].slice(0, 2000), "consultant " + u.email, u.consultant_id]);
      }
    }
    const [c] = u.consultant_id ? await sql`select * from consultants where id = ${u.consultant_id}` : [null];
    return res.json({ ok: true, consultant: c });
  }

  res.setHeader("Allow", "GET, POST, PATCH");
  return res.status(405).json({ error: "method not allowed" });
}
