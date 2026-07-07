import type { AnchorSearchResult, ApiErrorPayload, ManualAnchorRequest, QueryJobSnapshot, SessionStatus } from "../shared/types";

async function jsonRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  const incomingHeaders = options?.headers;
  if (incomingHeaders instanceof Headers) {
    incomingHeaders.forEach((value, key) => {
      headers[key] = value;
    });
  } else if (Array.isArray(incomingHeaders)) {
    for (const [key, value] of incomingHeaders) {
      headers[key] = value;
    }
  } else if (incomingHeaders) {
    Object.assign(headers, incomingHeaders);
  }

  if (options?.body != null && !(options.body instanceof FormData)) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(url, {
    credentials: "include",
    headers,
    ...options
  });
  const payload = (await response.json()) as T | ApiErrorPayload;
  if (!response.ok) {
    throw new Error((payload as ApiErrorPayload).error || `请求失败：${response.status}`);
  }
  return payload as T;
}

export function getSession(): Promise<SessionStatus> {
  return jsonRequest<SessionStatus>("/api/session");
}

export function saveSession(uid: string, cookie: string): Promise<SessionStatus> {
  return jsonRequest<SessionStatus>("/api/session", {
    method: "POST",
    body: JSON.stringify({ uid, cookie })
  });
}

export function clearSession(): Promise<{ ok: boolean }> {
  return jsonRequest<{ ok: boolean }>("/api/session", { method: "DELETE" });
}

export function startQueryJob(): Promise<QueryJobSnapshot> {
  return jsonRequest<QueryJobSnapshot>("/api/query-jobs", { method: "POST" });
}

export function createManualQueryJob(): Promise<QueryJobSnapshot> {
  return jsonRequest<QueryJobSnapshot>("/api/query-jobs/manual", { method: "POST" });
}

export function getQueryJob(jobId: string): Promise<QueryJobSnapshot> {
  return jsonRequest<QueryJobSnapshot>(`/api/query-jobs/${jobId}`);
}

export function searchAnchors(keyword: string): Promise<AnchorSearchResult[]> {
  return jsonRequest<AnchorSearchResult[]>(`/api/anchors/search?keyword=${encodeURIComponent(keyword)}`);
}

export function addAnchorToJob(jobId: string, request: ManualAnchorRequest): Promise<QueryJobSnapshot> {
  return jsonRequest<QueryJobSnapshot>(`/api/query-jobs/${jobId}/anchors`, {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function exportUrl(jobId: string, format: "csv" | "xlsx" | "json"): string {
  return `/api/query-jobs/${jobId}/export?format=${format}`;
}
