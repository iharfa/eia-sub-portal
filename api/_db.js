import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL);

export function isAdmin(req) {
  return !!process.env.ADMIN_KEY && req.headers["x-admin-key"] === process.env.ADMIN_KEY;
}
