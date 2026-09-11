import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { pool } from "./db";
import { HttpError, text } from "./validation";
import type { User } from "./types";

const deriveKey = promisify(scrypt);
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const sessionCookie = "inwards_session";

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 256)
    throw new HttpError(400, "Password must contain 12–256 characters.");
  const salt = randomBytes(16).toString("hex");
  const key = (await deriveKey(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const [salt, hex] = encoded.split(":");
  if (!salt || !hex || password.length > 256) return false;
  const key = (await deriveKey(password, salt, 64)) as Buffer;
  const stored = Buffer.from(hex, "hex");
  return stored.length === key.length && timingSafeEqual(stored, key);
}
export async function signIn(
  rawUsername: string,
  password: string,
): Promise<string> {
  const username = text(rawUsername, "Username", 80).toLowerCase();
  if (typeof password !== "string" || password.length > 256)
    throw new HttpError(400, "Invalid password.");
  await pool.query(
    "DELETE FROM login_attempts WHERE window_start < now() - interval '1 day'",
  );
  const attempt = await pool.query<{ attempts: number }>(
    `INSERT INTO login_attempts(username) VALUES ($1)
    ON CONFLICT (username) DO UPDATE SET
      attempts = CASE WHEN login_attempts.window_start < now() - interval '15 minutes' THEN 1 ELSE login_attempts.attempts + 1 END,
      window_start = CASE WHEN login_attempts.window_start < now() - interval '15 minutes' THEN now() ELSE login_attempts.window_start END
    RETURNING attempts`,
    [username],
  );
  if (attempt.rows[0].attempts > 10)
    throw new HttpError(
      429,
      "Too many sign-in attempts. Try again in 15 minutes.",
    );
  const result = await pool.query(
    "SELECT id, password_hash FROM users WHERE username=$1 AND active=true",
    [username],
  );
  const user = result.rows[0];
  const valid = await verifyPassword(
    password,
    user?.password_hash ?? `${"0".repeat(32)}:${"0".repeat(128)}`,
  );
  if (!user || !valid)
    throw new HttpError(401, "Incorrect username or password.");
  await pool.query("DELETE FROM login_attempts WHERE username=$1", [username]);
  await pool.query("DELETE FROM sessions WHERE expires_at < now()");
  const token = randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now() + interval '12 hours')",
    [tokenHash(token), user.id],
  );
  return token;
}
export async function getSession(
  token: string | undefined,
): Promise<User | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const result = await pool.query<User>(
    `SELECT u.id,u.username,u.display_name,u.role FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at > now() AND u.active=true`,
    [tokenHash(token)],
  );
  return result.rows[0] ?? null;
}
export async function signOut(token: string | undefined) {
  if (token)
    await pool.query("DELETE FROM sessions WHERE token_hash=$1", [
      tokenHash(token),
    ]);
}
