export type JobPhase = "idle" | "queued" | "scanning" | "complete" | "failed";

export type SourceStatus = "complete" | "partial" | "failed";

export interface ViewerProfile {
  uid: string;
  name: string;
  avatar: string;
  level?: number;
  medalCount?: number;
}

export interface SessionStatus {
  authenticated: boolean;
  viewer?: ViewerProfile;
}

export interface QueryProgress {
  total: number;
  scanned: number;
  failed: number;
  startedAt?: string;
  updatedAt?: string;
}

export interface RankRow {
  id: string;
  anchorUid: string;
  anchorName: string;
  anchorAvatar: string;
  roomId?: number;
  roomUrl?: string;
  medalName?: string;
  medalLevel?: number;
  guardLevel?: number;
  guardStatus?: number;
  guardExpiredAt?: string;
  watchTimeSeconds: number;
  watchTimeText: string;
  danmakuCount: number;
  sourceStatus: SourceStatus;
  apiMessage?: string;
  updatedAt: string;
}

export interface AnchorSearchResult {
  anchorUid: string;
  anchorName: string;
  anchorAvatar: string;
  roomId?: number;
  liveStatus?: number;
  followers?: number;
}

export interface ManualAnchorRequest {
  anchorUid: string;
  anchorName?: string;
  anchorAvatar?: string;
  roomId?: number;
}

export interface QuerySummary {
  totalAnchors: number;
  completeRows: number;
  failedRows: number;
  totalWatchSeconds: number;
  totalWatchText: string;
  totalDanmaku: number;
  dataCompleteness: number;
}

export interface QueryJobSnapshot {
  id: string;
  phase: JobPhase;
  progress: QueryProgress;
  summary: QuerySummary;
  rows: RankRow[];
  error?: string;
}

export interface ApiErrorPayload {
  error: string;
  code?: string;
}
