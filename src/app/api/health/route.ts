import { pool } from "@/lib/db";
export async function GET() {
  try {
    await pool.query("SELECT 1 FROM schema_migrations LIMIT 1");
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
