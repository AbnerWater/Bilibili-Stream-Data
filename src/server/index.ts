import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import { BilibiliApiError, BilibiliClient } from "./bilibili.js";
import { rowsToCsv, rowsToXlsx } from "./export.js";
import { addManualAnchorToJob, createManualQueryJob, createQueryJob, getQueryJob, onJobUpdate } from "./jobs.js";
import { logError, writeServerLog } from "./logger.js";
import { createSession, deleteSession, getSession } from "./session.js";
import type { ApiErrorPayload, SessionStatus } from "../shared/types.js";

const PORT = Number(process.env.PORT || 3001);
const SESSION_COOKIE = "bw_session";

const app = Fastify({
  logger: {
    redact: ["req.headers.cookie", "req.body.cookie", "*.cookie"]
  }
});

await app.register(cors, {
  origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
  credentials: true
});
await app.register(cookie);

const sessionSchema = z.object({
  uid: z.string().regex(/^\d{2,20}$/, "请输入有效的 B 站 UID"),
  cookie: z.string().min(20, "Cookie 过短，请确认已复制登录后的 Cookie")
});

const anchorSearchSchema = z.string().trim().min(1, "请输入主播名称关键词").max(60, "关键词过长");

const manualAnchorSchema = z.object({
  anchorUid: z.string().regex(/^\d{2,20}$/, "请输入有效的主播 UID"),
  anchorName: z.string().trim().max(80).optional(),
  anchorAvatar: z.string().trim().max(500).optional(),
  roomId: z.number().int().positive().optional()
});

app.get("/api/health", async () => ({ ok: true }));

app.get("/api/session", async (request): Promise<SessionStatus> => {
  const session = getSession(request.cookies[SESSION_COOKIE]);
  return session
    ? { authenticated: true, viewer: session.viewer }
    : { authenticated: false };
});

app.post("/api/session", async (request, reply): Promise<SessionStatus | ApiErrorPayload> => {
  const parsed = sessionSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.code(400);
    return { error: parsed.error.issues[0]?.message || "请求参数无效", code: "BAD_REQUEST" };
  }

  const { uid, cookie: rawCookie } = parsed.data;
  try {
    const client = new BilibiliClient(rawCookie);
    const wall = await client.fetchMedalWall(uid);
    const viewer = {
      uid,
      name: wall.name || `UID ${uid}`,
      avatar: wall.icon || "",
      level: wall.level,
      medalCount: wall.count
    };
    const session = createSession(uid, rawCookie, viewer);
    reply.setCookie(SESSION_COOKIE, session.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 60 * 60 * 6
    });
    return { authenticated: true, viewer };
  } catch (error) {
    reply.code(error instanceof BilibiliApiError ? 401 : 502);
    return { error: sessionErrorMessage(error), code: "BILIBILI_AUTH_FAILED" };
  }
});

app.delete("/api/session", async (request, reply) => {
  deleteSession(request.cookies[SESSION_COOKIE]);
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
  return { ok: true };
});

app.get("/api/anchors/search", async (request, reply) => {
  const session = getSession(request.cookies[SESSION_COOKIE]);
  if (!session) {
    reply.code(401);
    return { error: "请先配置有效的 B 站登录态。", code: "NO_SESSION" };
  }

  const { keyword = "" } = request.query as { keyword?: string };
  const parsed = anchorSearchSchema.safeParse(keyword);
  if (!parsed.success) {
    reply.code(400);
    return { error: parsed.error.issues[0]?.message || "搜索关键词无效", code: "BAD_REQUEST" };
  }

  try {
    const client = new BilibiliClient(session.cookie);
    return await client.searchLiveAnchors(parsed.data);
  } catch (error) {
    logError("anchor search failed", error, { route: "GET /api/anchors/search", uid: session.uid });
    reply.code(bilibiliErrorStatus(error));
    return { error: publicErrorMessage(error), code: "ANCHOR_SEARCH_FAILED" };
  }
});

app.post("/api/query-jobs", async (request, reply): Promise<ApiErrorPayload | ReturnType<typeof createQueryJob>> => {
  const session = getSession(request.cookies[SESSION_COOKIE]);
  if (!session) {
    reply.code(401);
    return { error: "请先配置有效的 B 站登录态。", code: "NO_SESSION" };
  }
  try {
    const job = createQueryJob(session);
    writeServerLog("info", "query job created", { jobId: job.id, uid: session.uid });
    return job;
  } catch (error) {
    logError("failed to create query job", error, { route: "POST /api/query-jobs", uid: session.uid });
    reply.code(500);
    return { error: routeErrorMessage(error), code: "QUERY_JOB_CREATE_FAILED" };
  }
});

app.post("/api/query-jobs/manual", async (request, reply): Promise<ApiErrorPayload | ReturnType<typeof createManualQueryJob>> => {
  const session = getSession(request.cookies[SESSION_COOKIE]);
  if (!session) {
    reply.code(401);
    return { error: "请先配置有效的 B 站登录态。", code: "NO_SESSION" };
  }
  try {
    const job = createManualQueryJob(session);
    writeServerLog("info", "manual query job created", { jobId: job.id, uid: session.uid });
    return job;
  } catch (error) {
    logError("failed to create manual query job", error, { route: "POST /api/query-jobs/manual", uid: session.uid });
    reply.code(500);
    return { error: routeErrorMessage(error), code: "MANUAL_JOB_CREATE_FAILED" };
  }
});

app.get("/api/query-jobs/:jobId", async (request, reply): Promise<ApiErrorPayload | NonNullable<ReturnType<typeof getQueryJob>>> => {
  const { jobId } = request.params as { jobId: string };
  const job = getQueryJob(jobId);
  if (!job) {
    reply.code(404);
    return { error: "查询任务不存在。", code: "JOB_NOT_FOUND" };
  }
  return job;
});

app.post("/api/query-jobs/:jobId/anchors", async (request, reply): Promise<ApiErrorPayload | NonNullable<ReturnType<typeof getQueryJob>>> => {
  const session = getSession(request.cookies[SESSION_COOKIE]);
  if (!session) {
    reply.code(401);
    return { error: "请先配置有效的 B 站登录态。", code: "NO_SESSION" };
  }

  const { jobId } = request.params as { jobId: string };
  const parsed = manualAnchorSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.code(400);
    return { error: parsed.error.issues[0]?.message || "主播参数无效", code: "BAD_REQUEST" };
  }

  try {
    const job = await addManualAnchorToJob(jobId, session, parsed.data);
    if (!job) {
      reply.code(404);
      return { error: "查询任务不存在或不属于当前登录态。", code: "JOB_NOT_FOUND" };
    }
    return job;
  } catch (error) {
    logError("manual anchor add failed", error, {
      route: "POST /api/query-jobs/:jobId/anchors",
      jobId,
      uid: session.uid,
      anchorUid: parsed.data.anchorUid
    });
    reply.code(bilibiliErrorStatus(error));
    return { error: publicErrorMessage(error), code: "MANUAL_ANCHOR_FAILED" };
  }
});

app.get("/api/query-jobs/:jobId/events", async (request, reply) => {
  const { jobId } = request.params as { jobId: string };
  const job = getQueryJob(jobId);
  if (!job) {
    reply.code(404);
    return { error: "查询任务不存在。", code: "JOB_NOT_FOUND" };
  }

  reply.hijack();
  reply.raw.writeHead(200, {
    "cache-control": "no-cache, no-transform",
    "connection": "keep-alive",
    "content-type": "text/event-stream; charset=utf-8",
    "x-accel-buffering": "no"
  });

  const send = (payload: unknown) => {
    if (reply.raw.destroyed || reply.raw.writableEnded) {
      return;
    }
    try {
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (error) {
      logError("failed to write sse payload", error, { route: "GET /api/query-jobs/:jobId/events", jobId });
    }
  };
  const unsubscribe = onJobUpdate(jobId, send);
  request.raw.on("close", () => {
    unsubscribe();
    if (!reply.raw.destroyed && !reply.raw.writableEnded) {
      reply.raw.end();
    }
  });
});

app.get("/api/query-jobs/:jobId/export", async (request, reply) => {
  const { jobId } = request.params as { jobId: string };
  const { format = "csv" } = request.query as { format?: string };
  const job = getQueryJob(jobId);
  if (!job) {
    reply.code(404);
    return { error: "查询任务不存在。", code: "JOB_NOT_FOUND" };
  }

  const filename = `bilibili-live-rank-${job.id.slice(0, 8)}`;
  if (format === "json") {
    reply
      .header("content-type", "application/json; charset=utf-8")
      .header("content-disposition", `attachment; filename="${filename}.json"`);
    return JSON.stringify(job, null, 2);
  }
  if (format === "xlsx") {
    const buffer = rowsToXlsx(job.rows);
    reply
      .header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("content-disposition", `attachment; filename="${filename}.xlsx"`);
    return buffer;
  }

  reply
    .header("content-type", "text/csv; charset=utf-8")
    .header("content-disposition", `attachment; filename="${filename}.csv"`);
  return rowsToCsv(job.rows);
});

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  logError("unhandled fastify error", error, {
    method: _request.method,
    url: _request.url
  });

  const fastifyError = error as Error & { statusCode?: number; code?: string };
  const statusCode = typeof fastifyError.statusCode === "number" ? fastifyError.statusCode : 500;
  if (statusCode === 415 || fastifyError.code === "FST_ERR_CTP_EMPTY_JSON_BODY") {
    reply.code(statusCode).send({
      error: "请求格式无效：该接口不需要请求体，请刷新页面后重试。",
      code: "BAD_CONTENT_TYPE"
    });
    return;
  }

  reply.code(500).send({ error: routeErrorMessage(error), code: "INTERNAL_ERROR" });
});

try {
  await app.listen({ host: "127.0.0.1", port: PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

function publicErrorMessage(error: unknown): string {
  if (error instanceof BilibiliApiError) {
    if (error.code === -101) {
      return "B站返回账号未登录，请确认 Cookie 来自已登录账号。";
    }
    return `${error.endpoint || "B站接口"}：${error.message}`;
  }
  if (error instanceof Error) {
    return error.message.replace(/cookie=[^;\s]+/gi, "cookie=[redacted]");
  }
  return "请求失败";
}

function sessionErrorMessage(error: unknown): string {
  if (error instanceof BilibiliApiError) {
    if (error.code === -101) {
      return "B站返回账号未登录，请确认 Cookie 来自已登录账号。";
    }
    return `B站未接受当前 Cookie（${error.endpoint || "接口"}：${error.message}）。`;
  }
  return publicErrorMessage(error);
}

function routeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `服务器内部错误：${publicErrorMessage(error)}`;
  }
  return "服务器内部错误：未知错误";
}

function bilibiliErrorStatus(error: unknown): number {
  if (error instanceof BilibiliApiError) {
    if (error.code === -101) {
      return 401;
    }
    if (error.code === 412 || error.code === -412) {
      return 429;
    }
    return 502;
  }
  return 500;
}
