import { describe, expect, it } from "vitest";
import { formatDuration } from "../src/shared/format.js";
import { mergeAnchorSeeds, summarizeRows, toRankRow } from "../src/server/normalize.js";
import type { GuardActiveResponse, HomeMedalItem, MedalWallResponse } from "../src/server/bilibili.js";

describe("formatDuration", () => {
  it("formats seconds as Chinese duration text", () => {
    expect(formatDuration(0)).toBe("0 分钟");
    expect(formatDuration(3660)).toBe("1 小时 1 分钟");
    expect(formatDuration(90060)).toBe("1 天 1 小时 1 分钟");
  });
});

describe("mergeAnchorSeeds", () => {
  it("deduplicates anchors and enriches medal wall rows with home medal fields", () => {
    const wall: MedalWallResponse = {
      list: [
        {
          medal_info: {
            target_id: 100,
            level: 12,
            medal_name: "墙勋章"
          },
          target_name: "墙主播",
          target_icon: "wall.png",
          link: "https://space.bilibili.com/100"
        }
      ]
    };
    const homeMedals: HomeMedalItem[] = [
      {
        target_id: 100,
        target_name: "主页主播",
        target_face: "home.png",
        medal_name: "主页勋章",
        medal_level: 24,
        score: 50_001_000
      }
    ];

    expect(mergeAnchorSeeds(wall, homeMedals)).toMatchObject([
      {
        anchorUid: "100",
        anchorName: "主页主播",
        anchorAvatar: "home.png",
        medalName: "主页勋章",
        medalLevel: 24
      }
    ]);
  });
});

describe("toRankRow and summarizeRows", () => {
  it("normalizes a GuardActive response into a ranking row and summary", () => {
    const row = toRankRow(
      {
        anchorUid: "3493083637352639",
        anchorName: "主播",
        anchorAvatar: "seed-face.png",
        medalName: "勋章",
        medalLevel: 22
      },
      {
        rusername: "接口主播",
        rface: "face.png",
        watch_time: 7200,
        send_bar: 88,
        latest_guard: 2,
        room_id: 123,
        room_url: "https://live.bilibili.com/123",
        guards_info: [{ guard_type: 2, guard_status: 1, expired_time: 1893456000 }],
        up_medal: {
          medal_name: "接口勋章",
          level: 23,
          guard_extra_gold: 10,
          guard_level_2: { exp_battery: 1998000 }
        }
      },
      new Date("2026-07-07T00:00:00.000Z")
    );

    expect(row).toMatchObject({
      anchorName: "接口主播",
      anchorAvatar: "face.png",
      roomId: 123,
      watchTimeText: "2 小时 0 分钟",
      danmakuCount: 88,
      sourceStatus: "complete"
    });
    expect(row).not.toHaveProperty("spendBattery");
    expect(row).not.toHaveProperty("spendSource");

    expect(summarizeRows([row], 1)).toMatchObject({
      totalAnchors: 1,
      completeRows: 1,
      failedRows: 0,
      totalWatchSeconds: 7200,
      totalDanmaku: 88,
      dataCompleteness: 100
    });
  });

  it("falls back to seed avatar when GuardActive does not return rface", () => {
    const row = toRankRow(
      {
        anchorUid: "100",
        anchorName: "主播",
        anchorAvatar: "home-or-wall-face.png"
      },
      {
        watch_time: 60,
        send_bar: 1
      }
    );

    expect(row.anchorAvatar).toBe("home-or-wall-face.png");
  });
});
