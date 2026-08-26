// Seed the consultants registry from ERA's published list (10 Aug 2026 PDF).
// Idempotent: entries already present (by reg_no, or by email when reg_no is blank) are skipped.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const sql = neon(url);

const list = JSON.parse(readFileSync(new URL("./era-consultants.json", import.meta.url), "utf8"));
let added = 0, skipped = 0;
for (const c of list) {
  const [dup] = c.reg_no
    ? await sql`select id from consultants where reg_no = ${c.reg_no}`
    : await sql`select id from consultants where email = ${c.email} and email <> ''`;
  if (dup) { skipped++; continue; }
  await sql`
    insert into consultants (reg_no, name, category, kind, address, phone, email, license_expiry,
                             status, verified, updated_by)
    values (${c.reg_no}, ${c.name}, ${c.category}, ${c.kind}, ${c.address}, ${c.phone},
            ${c.email}, ${c.license_expiry}, 'active', true,
            'seed: ERA published list (10 Aug 2026)')`;
  added++;
}
console.log(`consultants registry: ${added} added, ${skipped} already present`);
