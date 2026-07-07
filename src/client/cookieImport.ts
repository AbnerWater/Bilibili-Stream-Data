const COOKIE_HEADER_PATTERN = /(?:^|\r?\n)\s*cookie\s*:\s*([^\r\n]+)/i;
const CURL_HEADER_PATTERN = /-H\s+(['"])cookie\s*:\s*([\s\S]*?)\1/i;
const JSON_COOKIE_PATTERN = /"cookie"\s*:\s*"([^"]+)"/i;
const LIKELY_BILIBILI_COOKIE_KEYS = ["SESSDATA=", "bili_jct=", "DedeUserID=", "sid="];

export function extractBilibiliCookieText(input: string): string {
  const text = input.trim();
  if (!text) {
    return "";
  }

  const curlMatch = text.match(CURL_HEADER_PATTERN);
  const headerMatch = text.match(COOKIE_HEADER_PATTERN);
  const jsonMatch = text.match(JSON_COOKIE_PATTERN);
  const candidate = curlMatch?.[2] || headerMatch?.[1] || jsonMatch?.[1] || text;
  const normalized = candidate
    .replace(/^cookie\s*:\s*/i, "")
    .replace(/^["']|["']$/g, "")
    .replace(/\\;/g, ";")
    .trim();

  return looksLikeBilibiliCookie(normalized) ? normalized : "";
}

export function looksLikeBilibiliCookie(value: string): boolean {
  return LIKELY_BILIBILI_COOKIE_KEYS.some((key) => value.includes(key)) && value.includes("=");
}
