import { formatDuration } from "../shared/format.js";
import type { RankRow, QuerySummary } from "../shared/types.js";
import type { GuardActiveResponse, HomeMedalItem, MedalWallItem, MedalWallResponse } from "./bilibili.js";

export interface AnchorSeed {
  anchorUid: string;
  anchorName: string;
  anchorAvatar: string;
  roomId?: number;
  roomUrl?: string;
  medalName?: string;
  medalLevel?: number;
  guardLevel?: number;
  homeMedal?: HomeMedalItem;
  wallItem?: MedalWallItem;
}

export function mergeAnchorSeeds(wall: MedalWallResponse, homeMedals: HomeMedalItem[]): AnchorSeed[] {
  const merged = new Map<string, AnchorSeed>();

  for (const item of wall.list || []) {
    const anchorUid = numberToId(item.medal_info?.target_id);
    if (!anchorUid) {
      continue;
    }

    merged.set(anchorUid, {
      anchorUid,
      anchorName: item.target_name || `UID ${anchorUid}`,
      anchorAvatar: item.target_icon || "",
      roomUrl: item.link,
      medalName: item.medal_info?.medal_name,
      medalLevel: item.medal_info?.level,
      guardLevel: item.medal_info?.guard_level,
      wallItem: item
    });
  }

  for (const medal of homeMedals) {
    const anchorUid = numberToId(medal.target_id);
    if (!anchorUid) {
      continue;
    }

    const existing = merged.get(anchorUid);
    merged.set(anchorUid, {
      anchorUid,
      anchorName: medal.target_name || existing?.anchorName || `UID ${anchorUid}`,
      anchorAvatar: medal.target_face || existing?.anchorAvatar || "",
      roomUrl: existing?.roomUrl,
      medalName: medal.medal_name || existing?.medalName,
      medalLevel: medal.medal_level || medal.level || existing?.medalLevel,
      guardLevel: medal.guard_level || medal.guard_type || existing?.guardLevel,
      homeMedal: medal,
      wallItem: existing?.wallItem
    });
  }

  return [...merged.values()].sort((a, b) => {
    const levelDiff = (b.medalLevel || 0) - (a.medalLevel || 0);
    return levelDiff || a.anchorName.localeCompare(b.anchorName, "zh-Hans-CN");
  });
}

export function toRankRow(seed: AnchorSeed, guard: GuardActiveResponse, updatedAt = new Date()): RankRow {
  const latestGuard = toNumberOrUndefined(guard.latest_guard) ?? seed.guardLevel;
  const guardInfo = guard.guards_info?.find((item) => item.guard_type === latestGuard) || guard.guards_info?.[0];
  const watchTimeSeconds = Math.max(0, Math.floor(guard.watch_time || 0));
  const roomUrl = guard.room_url || seed.roomUrl;
  const roomId = toNumberOrUndefined(guard.room_id) ?? seed.roomId;

  return {
    id: seed.anchorUid,
    anchorUid: seed.anchorUid,
    anchorName: guard.rusername || seed.anchorName,
    anchorAvatar: guard.rface || seed.anchorAvatar,
    roomId,
    roomUrl,
    medalName: guard.up_medal?.medal_name || seed.medalName,
    medalLevel: toNumberOrUndefined(guard.up_medal?.level) ?? seed.medalLevel,
    guardLevel: latestGuard,
    guardStatus: toNumberOrUndefined(guardInfo?.guard_status),
    guardExpiredAt: unixSecondsToIso(guardInfo?.expired_time),
    watchTimeSeconds,
    watchTimeText: formatDuration(watchTimeSeconds),
    danmakuCount: Math.max(0, Math.floor(guard.send_bar || 0)),
    sourceStatus: "complete",
    updatedAt: updatedAt.toISOString()
  };
}

export function failedRankRow(seed: AnchorSeed, message: string, updatedAt = new Date()): RankRow {
  return {
    id: seed.anchorUid,
    anchorUid: seed.anchorUid,
    anchorName: seed.anchorName,
    anchorAvatar: seed.anchorAvatar,
    roomId: seed.roomId,
    roomUrl: seed.roomUrl,
    medalName: seed.medalName,
    medalLevel: seed.medalLevel,
    guardLevel: seed.guardLevel,
    watchTimeSeconds: 0,
    watchTimeText: "0 分钟",
    danmakuCount: 0,
    sourceStatus: "failed",
    apiMessage: message,
    updatedAt: updatedAt.toISOString()
  };
}

export function summarizeRows(rows: RankRow[], totalAnchors = rows.length): QuerySummary {
  const completeRows = rows.filter((row) => row.sourceStatus === "complete").length;
  const failedRows = rows.filter((row) => row.sourceStatus === "failed").length;
  const totalWatchSeconds = rows.reduce((sum, row) => sum + row.watchTimeSeconds, 0);
  const totalDanmaku = rows.reduce((sum, row) => sum + row.danmakuCount, 0);
  const denominator = Math.max(totalAnchors, 1);

  return {
    totalAnchors,
    completeRows,
    failedRows,
    totalWatchSeconds,
    totalWatchText: formatDuration(totalWatchSeconds),
    totalDanmaku,
    dataCompleteness: Math.round((completeRows / denominator) * 1000) / 10
  };
}

function numberToId(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return String(Math.floor(value));
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return value;
  }
  return "";
}

function toNumberOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function unixSecondsToIso(value: unknown): string | undefined {
  const seconds = toNumberOrUndefined(value);
  if (!seconds) {
    return undefined;
  }
  return new Date(seconds * 1000).toISOString();
}
