import { describe, expect, it } from "vitest";
import { BilibiliClient, normalizeAnchorSearchResults } from "../src/server/bilibili.js";
import { upsertRankRows } from "../src/server/jobs.js";
import { toRankRow } from "../src/server/normalize.js";
import type { RankRow } from "../src/shared/types.js";

describe("manual anchor search", () => {
  it("normalizes live_user search rows", () => {
    expect(
      normalizeAnchorSearchResults([
        {
          uid: 10001,
          uname: '<em class="keyword">测试</em>主播',
          uface: "face.png",
          roomid: "2233",
          live_status: "1",
          attentions: "4567"
        }
      ])
    ).toEqual([
      {
        anchorUid: "10001",
        anchorName: "测试主播",
        anchorAvatar: "face.png",
        roomId: 2233,
        liveStatus: 1,
        followers: 4567
      }
    ]);
  });

  it("returns a clear error when bilibili search is blocked", async () => {
    const client = new BilibiliClient(
      "SESSDATA=test; bili_jct=test",
      async () =>
        new Response(JSON.stringify({ code: -412, message: "Precondition Failed", data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
    );

    await expect(client.searchLiveAnchors("测试")).rejects.toMatchObject({
      name: "BilibiliApiError",
      code: -412,
      message: expect.stringContaining("风控")
    });
  });

  it("returns a clear error when bilibili search responds with HTTP 412", async () => {
    const client = new BilibiliClient("SESSDATA=test; bili_jct=test", async () => new Response("", { status: 412 }));

    await expect(client.searchLiveAnchors("测试")).rejects.toMatchObject({
      name: "BilibiliApiError",
      code: 412,
      message: expect.stringContaining("风控")
    });
  });
});

describe("manual anchor ranking", () => {
  it("uses GuardActive identity fields over temporary manual input", () => {
    const row = toRankRow(
      {
        anchorUid: "10001",
        anchorName: "临时名称",
        anchorAvatar: "temporary.png",
        roomId: 111
      },
      {
        rusername: "接口名称",
        rface: "guard-face.png",
        room_id: 222,
        watch_time: 3600,
        send_bar: 10
      }
    );

    expect(row).toMatchObject({
      anchorUid: "10001",
      anchorName: "接口名称",
      anchorAvatar: "guard-face.png",
      roomId: 222
    });
  });

  it("updates an existing UID instead of inserting a duplicate", () => {
    const oldRow = rankRow({ anchorName: "旧数据", watchTimeSeconds: 10 });
    const nextRow = rankRow({ anchorName: "新数据", watchTimeSeconds: 20, danmakuCount: 5 });

    const rows = upsertRankRows([oldRow], nextRow);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      anchorUid: "10001",
      anchorName: "新数据",
      watchTimeSeconds: 20,
      danmakuCount: 5
    });
  });
});

function rankRow(overrides: Partial<RankRow> = {}): RankRow {
  return {
    id: "10001",
    anchorUid: "10001",
    anchorName: "主播",
    anchorAvatar: "",
    watchTimeSeconds: 0,
    watchTimeText: "0 分钟",
    danmakuCount: 0,
    sourceStatus: "complete",
    updatedAt: new Date("2026-07-07T00:00:00.000Z").toISOString(),
    ...overrides
  };
}
