import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const LOG_PATH = resolve(process.cwd(), "logs", "server.log");
const logDir = dirname(LOG_PATH);

if (!existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true });
}

const stream = createWriteStream(LOG_PATH, { flags: "a", encoding: "utf8" });

export function writeServerLog(level: "info" | "warn" | "error", message: string, detail?: Record<string, unknown>): void {
  const payload = {
    time: new Date().toISOString(),
    level,
    message,
    ...(detail ? { detail: sanitizeLogDetail(detail) } : {})
  };
  stream.write(`${JSON.stringify(payload)}\n`);
}

export function logError(message: string, error: unknown, detail?: Record<string, unknown>): void {
  writeServerLog("error", message, {
    ...detail,
    error: serializeError(error)
  });
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactSecrets(error.message),
      stack: redactSecrets(error.stack || "")
    };
  }
  return { value: redactSecrets(String(error)) };
}

function sanitizeLogDetail(detail: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(detail).map(([key, value]) => {
      if (/cookie|sessdata|bili_jct/i.test(key)) {
        return [key, "[redacted]"];
      }
      if (typeof value === "string") {
        return [key, redactSecrets(value)];
      }
      return [key, value];
    })
  );
}

function redactSecrets(value: string): string {
  return value
    .replace(/SESSDATA=[^;\s"']+/gi, "SESSDATA=[redacted]")
    .replace(/bili_jct=[^;\s"']+/gi, "bili_jct=[redacted]")
    .replace(/DedeUserID=[^;\s"']+/gi, "DedeUserID=[redacted]")
    .replace(/cookie=[^;\s"']+/gi, "cookie=[redacted]");
}
