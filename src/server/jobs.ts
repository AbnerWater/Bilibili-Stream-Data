import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { BilibiliApiError, BilibiliClient } from "./bilibili.js";
import { logError, writeServerLog } from "./logger.js";
import { failedRankRow, mergeAnchorSeeds, summarizeRows, toRankRow, type AnchorSeed } from "./normalize.js";
import type { StoredSession } from "./session.js";
import type { ManualAnchorRequest, QueryJobSnapshot, RankRow } from "../shared/types.js";

const MAX_CONCURRENCY = 4;
const MAX_RETRY = 2;

interface QueryJobInternal extends QueryJobSnapshot {
  emitter: EventEmitter;
  sessionId: string;
}

const jobs = new Map<string, QueryJobInternal>();

export function createQueryJob(session: StoredSession): QueryJobSnapshot {
  const now = new Date().toISOString();
  const job: QueryJobInternal = {
    id: randomUUID(),
    sessionId: session.id,
    phase: "queued",
    progress: {
      total: 0,
      scanned: 0,
      failed: 0,
      startedAt: now,
      updatedAt: now
    },
    summary: summarizeRows([], 0),
    rows: [],
    emitter: new EventEmitter()
  };
  job.emitter.setMaxListeners(100);
  jobs.set(job.id, job);

  void runQueryJob(job, session);
  return snapshot(job);
}

export function createManualQueryJob(session: StoredSession): QueryJobSnapshot {
  const now = new Date().toISOString();
  const job: QueryJobInternal = {
    id: randomUUID(),
    sessionId: session.id,
    phase: "complete",
    progress: {
      total: 0,
      scanned: 0,
      failed: 0,
      startedAt: now,
      updatedAt: now
    },
    summary: summarizeRows([], 0),
    rows: [],
    emitter: new EventEmitter()
  };
  job.emitter.setMaxListeners(100);
  jobs.set(job.id, job);
  return snapshot(job);
}

export function getQueryJob(jobId: string): QueryJobSnapshot | undefined {
  const job = jobs.get(jobId);
  return job ? snapshot(job) : undefined;
}

export async function addManualAnchorToJob(
  jobId: string,
  session: StoredSession,
  request: ManualAnchorRequest
): Promise<QueryJobSnapshot | undefined> {
  const job = jobs.get(jobId);
  if (!job || job.sessionId !== session.id) {
    return undefined;
  }

  const seed = manualRequestToSeed(request);
  const client = new BilibiliClient(session.cookie);
  const wasPresent = job.rows.some((row) => row.id === seed.anchorUid);
  const row = await fetchAnchorRow(client, seed);

  job.rows = upsertRankRows(job.rows, row);
  if (!wasPresent) {
    job.progress.total += 1;
    job.progress.scanned += 1;
  }
  job.progress.total = Math.max(job.progress.total, job.rows.length);
  job.progress.failed = job.rows.filter((item) => item.sourceStatus === "failed").length;
  job.summary = summarizeRows(job.rows, job.progress.total);
  updateJob(job);
  writeServerLog("info", "manual anchor added", {
    jobId,
    uid: session.uid,
    anchorUid: row.anchorUid,
    sourceStatus: row.sourceStatus
  });
  return snapshot(job);
}

export function onJobUpdate(jobId: string, listener: (snapshot: QueryJobSnapshot) => void): () => void {
  const job = jobs.get(jobId);
  if (!job) {
    return () => undefined;
  }
  const wrapped = () => listener(snapshot(job));
  job.emitter.on("update", wrapped);
  listener(snapshot(job));
  return () => job.emitter.off("update", wrapped);
}

async function runQueryJob(job: QueryJobInternal, session: StoredSession): Promise<void> {
  job.phase = "scanning";
  updateJob(job);

  try {
    const client = new BilibiliClient(session.cookie);
    const [wall, homeMedals] = await Promise.all([
      client.fetchMedalWall(session.uid),
      client.fetchAllHomeMedals()
    ]);
    const seeds = mergeAnchorSeeds(wall, homeMedals);
    writeServerLog("info", "query job seed list loaded", {
      jobId: job.id,
      uid: session.uid,
      medalWallCount: wall.count,
      homeMedalCount: homeMedals.length,
      anchorCount: seeds.length
    });
    job.progress.total = seeds.length + countManualRows(job.rows, seeds);
    job.summary = summarizeRows(job.rows, job.progress.total);
    updateJob(job);

    await runWithConcurrency(seeds, MAX_CONCURRENCY, async (seed) => {
      const row = await fetchAnchorRow(client, seed);
      job.rows = upsertRankRows(job.rows, row);
      job.progress.scanned += 1;
      if (row.sourceStatus === "failed") {
        job.progress.failed += 1;
      }
      job.progress.failed = job.rows.filter((item) => item.sourceStatus === "failed").length;
      job.summary = summarizeRows(job.rows, job.progress.total);
      updateJob(job);
    });

    job.phase = "complete";
    job.summary = summarizeRows(job.rows, job.progress.total);
    updateJob(job);
  } catch (error) {
    job.phase = "failed";
    job.error = publicErrorMessage(error);
    logError("query job failed", error, { jobId: job.id, uid: session.uid });
    updateJob(job);
  }
}

async function fetchAnchorRow(client: BilibiliClient, seed: AnchorSeed): Promise<RankRow> {
  try {
    const guard = await retry(() => client.fetchGuardActive(seed.anchorUid), MAX_RETRY);
    return toRankRow(seed, guard);
  } catch (error) {
    if (error instanceof BilibiliApiError && error.code === -101) {
      throw error;
    }
    logError("anchor guard query failed", error, {
      anchorUid: seed.anchorUid,
      anchorName: seed.anchorName
    });
    return failedRankRow(seed, publicErrorMessage(error));
  }
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await worker(item);
    }
  });
  await Promise.all(workers);
}

async function retry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error instanceof BilibiliApiError && error.code === -101) {
        throw error;
      }
      if (attempt < retries) {
        await delay(350 * (attempt + 1));
      }
    }
  }
  throw lastError;
}

export function upsertRankRows(rows: RankRow[], nextRow: RankRow): RankRow[] {
  const without = rows.filter((row) => row.id !== nextRow.id);
  return [...without, nextRow].sort((a, b) => {
    return (
      b.watchTimeSeconds - a.watchTimeSeconds ||
      b.danmakuCount - a.danmakuCount ||
      (b.medalLevel || 0) - (a.medalLevel || 0) ||
      a.anchorName.localeCompare(b.anchorName, "zh-Hans-CN")
    );
  });
}

function manualRequestToSeed(request: ManualAnchorRequest): AnchorSeed {
  const anchorUid = normalizeUid(request.anchorUid);
  if (!anchorUid) {
    throw new Error("请输入有效的主播 UID。");
  }
  const roomId = normalizePositiveNumber(request.roomId);
  return {
    anchorUid,
    anchorName: request.anchorName?.trim() || `UID ${anchorUid}`,
    anchorAvatar: request.anchorAvatar?.trim() || "",
    roomId,
    roomUrl: roomId ? `https://live.bilibili.com/${roomId}` : undefined
  };
}

function normalizeUid(value: string): string {
  const trimmed = value.trim();
  return /^\d{2,20}$/.test(trimmed) ? trimmed : "";
}

function normalizePositiveNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }
  return undefined;
}

function countManualRows(rows: RankRow[], seeds: AnchorSeed[]): number {
  const seedIds = new Set(seeds.map((seed) => seed.anchorUid));
  return rows.filter((row) => !seedIds.has(row.anchorUid)).length;
}

function updateJob(job: QueryJobInternal): void {
  job.progress.updatedAt = new Date().toISOString();
  job.emitter.emit("update");
}

function snapshot(job: QueryJobInternal): QueryJobSnapshot {
  return {
    id: job.id,
    phase: job.phase,
    progress: { ...job.progress },
    summary: { ...job.summary },
    rows: job.rows.map((row) => ({ ...row })),
    error: job.error
  };
}

function publicErrorMessage(error: unknown): string {
  if (error instanceof BilibiliApiError) {
    if (error.code === -101) {
      return "B站登录态失效，请重新配置 Cookie。";
    }
    return `${error.endpoint || "B站接口"}：${error.message}`;
  }
  if (error instanceof Error) {
    return error.message.replace(/cookie=[^;\s]+/gi, "cookie=[redacted]");
  }
  return "未知错误";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
