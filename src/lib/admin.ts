import { randomUUID } from "node:crypto";
import { pool, transaction } from "./db";
import { hashPassword } from "./auth";
import { HttpError, text, uuid } from "./validation";
import type { User } from "./types";

export async function assertAdmin(userId: string) {
  const result = await pool.query(
    "SELECT 1 FROM users WHERE id=$1 AND active=true AND role='ADMIN'",
    [uuid(userId)],
  );
  if (!result.rowCount)
    throw new HttpError(403, "Administrator access required.");
}
export async function listStaff(actorId: string) {
  await assertAdmin(actorId);
  return (
    await pool.query<User & { active: boolean }>(
      "SELECT id,username,display_name,role,active FROM users ORDER BY created_at,id",
    )
  ).rows;
}
export async function createStaff(
  actorId: string,
  input: { username: unknown; displayName: unknown; password: unknown },
) {
  await assertAdmin(actorId);
  const username = text(input.username, "Username", 80).toLowerCase();
  if (!/^[a-z0-9._@-]+$/.test(username))
    throw new HttpError(
      400,
      "Username can contain letters, numbers, dots, @, hyphens and underscores.",
    );
  const displayName = text(input.displayName, "Display name", 100);
  if (typeof input.password !== "string")
    throw new HttpError(400, "Password is required.");
  const hash = await hashPassword(input.password);
  try {
    return (
      await pool.query<User>(
        "INSERT INTO users(id,username,display_name,password_hash) VALUES ($1,$2,$3,$4) RETURNING id,username,display_name,role",
        [randomUUID(), username, displayName, hash],
      )
    ).rows[0];
  } catch (error) {
    if ((error as { code?: string }).code === "23505")
      throw new HttpError(409, "That username already exists.");
    throw error;
  }
}
export async function setStaffActive(
  actorId: string,
  userId: string,
  active: unknown,
) {
  await assertAdmin(actorId);
  uuid(userId);
  if (typeof active !== "boolean")
    throw new HttpError(400, "Active must be true or false.");
  if (actorId === userId)
    throw new HttpError(
      400,
      "You cannot disable your own administrator account.",
    );
  await transaction(async (client) => {
    const result = await client.query(
      "UPDATE users SET active=$2 WHERE id=$1 AND role='STAFF' RETURNING id",
      [userId, active],
    );
    if (!result.rowCount)
      throw new HttpError(
        400,
        "Only staff accounts can be enabled or disabled here.",
      );
    if (!active)
      await client.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
  });
}
