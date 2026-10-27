import { createHash, randomBytes, randomInt } from "node:crypto";
import { db } from "../db/index.ts";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const sessionDays = 30;

export function userIdForToken(token: string): string | null {
  if (!token || token.length > 256) return null;
  return (db.prepare("SELECT user_id AS userId FROM access_tokens WHERE token_hash=? AND revoked_at IS NULL").get(hash(token)) as { userId: string } | undefined)?.userId ?? null;
}

export function createWebSession(token: string): { userId: string; session: string; expiresAt: string } | null {
  const userId = userIdForToken(token);
  if (!userId) return null;
  const session = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionDays * 86_400_000).toISOString();
  db.prepare("INSERT INTO web_sessions(id,user_id,session_hash,expires_at,created_at) VALUES(?,?,?,?,?)")
    .run(crypto.randomUUID(), userId, hash(session), expiresAt, new Date().toISOString());
  return { userId, session, expiresAt };
}

export function userIdForSession(session: string): string | null {
  if (!session || session.length > 256) return null;
  return (db.prepare("SELECT user_id AS userId FROM web_sessions WHERE session_hash=? AND expires_at>? ").get(hash(session), new Date().toISOString()) as { userId: string } | undefined)?.userId ?? null;
}

export function revokeWebSession(session: string): void {
  if (session) db.prepare("DELETE FROM web_sessions WHERE session_hash=?").run(hash(session));
}

export function createUser(): { code: string; token: string } {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join("");
  } while (db.prepare("SELECT 1 FROM users WHERE code=?").get(code));
  const id = crypto.randomUUID();
  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO users(id,code,created_at) VALUES(?,?,?)").run(id, code, new Date().toISOString());
  db.prepare("INSERT INTO access_tokens(id,user_id,token_hash,created_at) VALUES(?,?,?,?)")
    .run(crypto.randomUUID(), id, hash(token), new Date().toISOString());
  return { code, token };
}
