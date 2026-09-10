import { randomUUID } from "node:crypto";
import { pool, transaction } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";

const username = process.env.CREATE_USERNAME?.trim().toLowerCase();
const name = process.env.CREATE_DISPLAY_NAME?.trim();
const password = process.env.CREATE_PASSWORD;
try {
  await transaction(async (client) => {
    if (process.argv.includes("--if-empty")) {
      await client.query("SELECT pg_advisory_xact_lock(71003002)");
      if ((await client.query("SELECT 1 FROM users LIMIT 1")).rowCount) {
        console.log("Staff accounts already exist; no credentials changed.");
        return;
      }
    }
  if (
    !username ||
    !/^[a-z0-9._-]{1,80}$/.test(username) ||
    !name ||
    name.length > 100 ||
    !password
  ) {
    throw new Error(
      "Set CREATE_USERNAME (letters/numbers/dots/hyphens/underscores), CREATE_DISPLAY_NAME and CREATE_PASSWORD (12+ characters).",
    );
  }
  await client.query(
    "INSERT INTO users(id,username,display_name,password_hash) VALUES ($1,$2,$3,$4)",
    [randomUUID(), username, name, await hashPassword(password)],
  );
  console.log(`Created staff account: ${username}`);
  });
} finally {
  await pool.end();
}
