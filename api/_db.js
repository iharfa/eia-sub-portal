import { neon } from "@neondatabase/serverless";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

export const sql = neon(process.env.DATABASE_URL);

/* ---- passwords (scrypt, no extra deps) ---- */
export function hashPassword(pw) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(pw, salt, 32).toString("hex");
}
export function checkPassword(pw, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const a = scryptSync(pw, salt, 32);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
export function newToken() {
  return randomBytes(32).toString("hex");
}

/* ---- sessions ---- */
export async function getUser(req) {
  const h = String(req.headers["authorization"] || "");
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  const [u] = await sql`
    select u.id, u.email, u.name, u.role, u.consultant_id
    from sessions s join users u on u.id = s.user_id
    where s.token = ${token} and s.expires_at > now()`;
  return u || null;
}

/* Staff role: a logged-in officer/admin account, or the legacy env keys. */
export async function staffRole(req) {
  const u = await getUser(req);
  if (u && (u.role === "officer" || u.role === "admin")) return { role: u.role, actor: "era-" + u.role + " " + (u.name || u.email) };
  const k = req.headers["x-admin-key"];
  if (process.env.ADMIN_KEY && k === process.env.ADMIN_KEY) return { role: "admin", actor: "era-admin" };
  if (process.env.OFFICER_KEY && k === process.env.OFFICER_KEY) return { role: "officer", actor: "era-officer" };
  return null;
}
