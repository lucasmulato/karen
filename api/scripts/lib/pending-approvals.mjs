import { Client } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/synapsevault";

/** Count command approvals waiting for a human. Never returns tokens. */
export async function pendingApprovals() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const res = await client.query(
      "SELECT COUNT(*)::int AS n FROM command_runs WHERE status = 'pending'"
    );
    return res.rows[0]?.n ?? 0;
  } catch {
    return 0;
  } finally {
    await client.end();
  }
}
