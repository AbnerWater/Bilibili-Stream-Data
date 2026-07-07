import { randomUUID } from "node:crypto";
import type { ViewerProfile } from "../shared/types.js";

export interface StoredSession {
  id: string;
  uid: string;
  cookie: string;
  viewer: ViewerProfile;
  createdAt: number;
  updatedAt: number;
}

const sessions = new Map<string, StoredSession>();
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 6;

export function createSession(uid: string, cookie: string, viewer: ViewerProfile): StoredSession {
  pruneExpiredSessions();
  const now = Date.now();
  const session: StoredSession = {
    id: randomUUID(),
    uid,
    cookie,
    viewer,
    createdAt: now,
    updatedAt: now
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(sessionId: string | undefined): StoredSession | undefined {
  if (!sessionId) {
    return undefined;
  }
  const session = sessions.get(sessionId);
  if (!session) {
    return undefined;
  }
  if (Date.now() - session.updatedAt > SESSION_MAX_AGE_MS) {
    sessions.delete(sessionId);
    return undefined;
  }
  session.updatedAt = Date.now();
  return session;
}

export function deleteSession(sessionId: string | undefined): void {
  if (sessionId) {
    sessions.delete(sessionId);
  }
}

export function maskCookie(cookie: string): string {
  const keys = cookie
    .split(";")
    .map((part) => part.trim().split("=")[0])
    .filter(Boolean);
  return keys.length > 0 ? `${keys.slice(0, 4).join("; ")}; ...` : "[empty-cookie]";
}

function pruneExpiredSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.updatedAt > SESSION_MAX_AGE_MS) {
      sessions.delete(id);
    }
  }
}
