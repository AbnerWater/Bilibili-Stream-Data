export class BilibiliApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly endpoint?: string
  ) {
    super(message);
    this.name = "BilibiliApiError";
  }
}

export interface BiliResponse<T> {
  code: number;
  message?: string;
  msg?: string;
  ttl?: number;
  data: T;
}

export interface MedalWallResponse {
  list?: MedalWallItem[];
  count?: number;
  close_space_medal?: number;
  only_show_wearing?: number;
  name?: string;
  icon?: string;
  uid?: number;
  level?: number;
}

export interface MedalWallItem {
  medal_info?: {
    target_id?: number;
    level?: number;
    medal_name?: string;
    guard_level?: number;
    wearing_status?: number;
    medal_id?: number;
    intimacy?: number;
    next_intimacy?: number;
    today_feed?: number;
    day_limit?: number;
    guard_icon?: string;
  };
  target_name?: string;
  target_icon?: string;
  link?: string;
  live_status?: number;
  official?: number;
}

export interface HomeMedalsResponse {
  max?: number;
  cnt?: number;
  curr_page?: number;
  total_page?: number;
  list?: HomeMedalItem[];
}

export interface HomeMedalItem {
  uid?: number;
  target_id?: number;
  medal_id?: number;
  score?: number;
  level?: number;
  medal_level?: number;
  intimacy?: number;
  status?: number;
  master_status?: number;
  receive_time?: string;
  today_intimacy?: number;
  is_lighted?: number;
  medal_name?: string;
  guard_type?: number;
  guard_level?: number;
  target_name?: string;
  target_face?: string;
  live_stream_status?: number;
  guard_icon?: string;
}

export interface GuardActiveResponse {
  ruid?: number;
  rusername?: string;
  rface?: string;
  username?: string;
  accomany_day?: number;
  latest_guard?: number;
  watch_time?: number;
  send_bar?: number;
  up_medal?: {
    target_id?: number;
    medal_name?: string;
    level?: number;
    is_lighted?: number;
    guard_extra_gold?: number;
    guard_icon?: string;
    guard_level_1?: GuardLevelInfo;
    guard_level_2?: GuardLevelInfo;
    guard_level_3?: GuardLevelInfo;
  };
  guards_info?: Array<{
    guard_type?: number;
    expired_time?: number;
    guard_status?: number;
  }>;
  room_url?: string;
  is_live?: number;
  is_active?: number;
  room_id?: number;
  guard_total?: number;
}

export interface SearchAnchorResponse {
  result?: SearchAnchorItem[];
}

export interface SearchAnchorItem {
  uid?: number | string;
  mid?: number | string;
  uname?: string;
  name?: string;
  uface?: string;
  face?: string;
  roomid?: number | string;
  room_id?: number | string;
  live_status?: number | string;
  attentions?: number | string;
  fans?: number | string;
}

export interface NormalizedAnchorSearchResult {
  anchorUid: string;
  anchorName: string;
  anchorAvatar: string;
  roomId?: number;
  liveStatus?: number;
  followers?: number;
}

interface GuardLevelInfo {
  level?: number;
  exp?: number;
  exp_battery?: number;
  guard_icon?: string;
}

const API_ORIGIN = "https://api.live.bilibili.com";
const WEB_API_ORIGIN = "https://api.bilibili.com";

export class BilibiliClient {
  constructor(private readonly cookie: string, private readonly fetchImpl: typeof fetch = fetch) {}

  async fetchMedalWall(uid: string): Promise<MedalWallResponse> {
    return this.get<MedalWallResponse>(
      `${API_ORIGIN}/xlive/web-ucenter/user/MedalWall?target_id=${encodeURIComponent(uid)}`,
      "MedalWall"
    );
  }

  async fetchHomeMedals(page: number): Promise<HomeMedalsResponse> {
    const url = new URL(`${API_ORIGIN}/fans_medal/v1/fans_medal/get_home_medals`);
    url.searchParams.set("page", String(page));
    return this.get<HomeMedalsResponse>(url.toString(), "get_home_medals");
  }

  async fetchAllHomeMedals(): Promise<HomeMedalItem[]> {
    const firstPage = await this.fetchHomeMedals(1);
    const totalPage = Math.min(Math.max(Number(firstPage.total_page || 1), 1), 50);
    const items = [...(firstPage.list || [])];

    for (let page = 2; page <= totalPage; page += 1) {
      const pageResult = await this.fetchHomeMedals(page);
      items.push(...(pageResult.list || []));
    }

    return items;
  }

  async fetchGuardActive(anchorUid: string): Promise<GuardActiveResponse> {
    const url = new URL(`${API_ORIGIN}/xlive/general-interface/v1/guard/GuardActive`);
    url.searchParams.set("ruid", anchorUid);
    url.searchParams.set("platform", "pc");
    return this.get<GuardActiveResponse>(url.toString(), "GuardActive");
  }

  async searchLiveAnchors(keyword: string): Promise<NormalizedAnchorSearchResult[]> {
    const url = new URL(`${WEB_API_ORIGIN}/x/web-interface/search/type`);
    url.searchParams.set("search_type", "live_user");
    url.searchParams.set("keyword", keyword);
    url.searchParams.set("page", "1");
    const data = await this.get<SearchAnchorResponse>(url.toString(), "SearchLiveUser", "https://search.bilibili.com/");
    return normalizeAnchorSearchResults(data.result || []);
  }

  private async get<T>(url: string, endpoint: string, referer = "https://live.bilibili.com/"): Promise<T> {
    const response = await this.fetchImpl(url, {
      headers: {
        "accept": "application/json, text/plain, */*",
        "cookie": this.cookie,
        "referer": referer,
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
      }
    });

    if (!response.ok) {
      if (response.status === 412) {
        throw new BilibiliApiError("B站搜索接口触发风控，请稍后重试或直接输入主播 UID。", 412, endpoint);
      }
      throw new BilibiliApiError(`B站接口请求失败：HTTP ${response.status}`, response.status, endpoint);
    }

    const payload = (await response.json()) as BiliResponse<T>;
    if (payload.code !== 0) {
      if (payload.code === -412 || payload.code === 412) {
        throw new BilibiliApiError("B站搜索接口触发风控，请稍后重试或直接输入主播 UID。", payload.code, endpoint);
      }
      const message = payload.message || payload.msg || `B站接口返回 ${payload.code}`;
      throw new BilibiliApiError(message, payload.code, endpoint);
    }

    return payload.data;
  }
}

export function normalizeAnchorSearchResults(items: SearchAnchorItem[]): NormalizedAnchorSearchResult[] {
  const merged = new Map<string, NormalizedAnchorSearchResult>();

  for (const item of items) {
    const anchorUid = idFrom(item.uid ?? item.mid);
    if (!anchorUid) {
      continue;
    }
    merged.set(anchorUid, {
      anchorUid,
      anchorName: stripHtml(item.uname || item.name || `UID ${anchorUid}`),
      anchorAvatar: item.uface || item.face || "",
      roomId: positiveNumber(item.roomid ?? item.room_id),
      liveStatus: numberOrUndefined(item.live_status),
      followers: positiveNumber(item.attentions ?? item.fans)
    });
  }

  return [...merged.values()];
}

function idFrom(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return String(Math.floor(value));
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return value.trim();
  }
  return "";
}

function positiveNumber(value: unknown): number | undefined {
  const numeric = numberOrUndefined(value);
  return numeric && numeric > 0 ? Math.floor(numeric) : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, "").trim();
}
