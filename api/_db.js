import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL);

export function staffRole(req) {
  const k = req.headers["x-admin-key"];
  if (process.env.ADMIN_KEY && k === process.env.ADMIN_KEY) return "admin";
  if (process.env.OFFICER_KEY && k === process.env.OFFICER_KEY) return "officer";
  return null;
}

export function isAdmin(req) {
  return staffRole(req) === "admin";
}
