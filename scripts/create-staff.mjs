// Create (or reset the password of) an ERA staff account.
// Usage: node scripts/create-staff.mjs email password "Full Name" officer|admin
import { neon } from "@neondatabase/serverless";
import { scryptSync, randomBytes } from "node:crypto";

const [email, password, name, role = "officer"] = process.argv.slice(2);
if (!email || !password || !name || !["officer", "admin"].includes(role)) {
  console.error('usage: node scripts/create-staff.mjs email password "Full Name" officer|admin');
  process.exit(1);
}
if (password.length < 8) { console.error("password must be at least 8 characters"); process.exit(1); }
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const sql = neon(url);

const salt = randomBytes(16).toString("hex");
const hash = salt + ":" + scryptSync(password, salt, 32).toString("hex");
await sql`
  insert into users (email, password_hash, name, role)
  values (${email.toLowerCase()}, ${hash}, ${name}, ${role})
  on conflict (email) do update set password_hash = ${hash}, name = ${name}, role = ${role}`;
console.log(`${role} account ready: ${email}`);
