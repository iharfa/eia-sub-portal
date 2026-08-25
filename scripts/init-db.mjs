import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const sql = neon(url);

const stmts = readFileSync(new URL("../schema.sql", import.meta.url), "utf8")
  .split(";").map(s => s.trim()).filter(Boolean);
for (const s of stmts) {
  await sql.query(s);
  console.log("ok:", s.replace(/\s+/g, " ").slice(0, 60));
}
console.log("schema ready");
