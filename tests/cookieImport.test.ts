import { describe, expect, it } from "vitest";
import { extractBilibiliCookieText, looksLikeBilibiliCookie } from "../src/client/cookieImport.js";

describe("extractBilibiliCookieText", () => {
  it("accepts a raw bilibili cookie string", () => {
    expect(extractBilibiliCookieText("SESSDATA=abc; bili_jct=def; DedeUserID=123")).toBe(
      "SESSDATA=abc; bili_jct=def; DedeUserID=123"
    );
  });

  it("extracts from a copied request header block", () => {
    const text = "Host: api.live.bilibili.com\nCookie: sid=foo; SESSDATA=abc; bili_jct=def\nUser-Agent: test";
    expect(extractBilibiliCookieText(text)).toBe("sid=foo; SESSDATA=abc; bili_jct=def");
  });

  it("extracts from a curl header", () => {
    const text = "curl 'https://api.live.bilibili.com/' -H \"Cookie: SESSDATA=abc; bili_jct=def\"";
    expect(extractBilibiliCookieText(text)).toBe("SESSDATA=abc; bili_jct=def");
  });

  it("rejects unrelated text", () => {
    expect(extractBilibiliCookieText("hello world")).toBe("");
    expect(looksLikeBilibiliCookie("foo=bar")).toBe(false);
  });
});
