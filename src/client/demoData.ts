import type { QueryJobSnapshot, RankRow } from "../shared/types";

const updatedAt = new Date("2026-07-07T09:30:00.000Z").toISOString();

export const demoRows: RankRow[] = [
  {
    id: "9876543",
    anchorUid: "9876543",
    anchorName: "小可爱酱ovo",
    anchorAvatar: "",
    roomId: 253712,
    roomUrl: "https://live.bilibili.com/253712",
    medalName: "小可爱",
    medalLevel: 24,
    guardLevel: 3,
    guardStatus: 1,
    watchTimeSeconds: 923880,
    watchTimeText: "10 天 16 小时 38 分钟",
    danmakuCount: 12345,
    sourceStatus: "complete",
    updatedAt
  },
  {
    id: "7654321",
    anchorUid: "7654321",
    anchorName: "迷路的小透明",
    anchorAvatar: "",
    roomId: 998877,
    roomUrl: "https://live.bilibili.com/998877",
    medalName: "透明",
    medalLevel: 22,
    guardLevel: 2,
    guardStatus: 1,
    watchTimeSeconds: 713520,
    watchTimeText: "8 天 6 小时 12 分钟",
    danmakuCount: 8765,
    sourceStatus: "complete",
    updatedAt
  },
  {
    id: "24681012",
    anchorUid: "24681012",
    anchorName: "晚安喵Zzz",
    anchorAvatar: "",
    roomId: 1314520,
    roomUrl: "https://live.bilibili.com/1314520",
    medalName: "晚安",
    medalLevel: 19,
    guardLevel: 2,
    guardStatus: 0,
    watchTimeSeconds: 563100,
    watchTimeText: "6 天 12 小时 25 分钟",
    danmakuCount: 6789,
    sourceStatus: "complete",
    updatedAt
  },
  {
    id: "1357911",
    anchorUid: "1357911",
    anchorName: "星野-Shino",
    anchorAvatar: "",
    roomId: 314159,
    roomUrl: "https://live.bilibili.com/314159",
    medalName: "星野",
    medalLevel: 17,
    guardLevel: 1,
    guardStatus: 0,
    watchTimeSeconds: 353100,
    watchTimeText: "4 天 2 小时 05 分钟",
    danmakuCount: 4321,
    sourceStatus: "complete",
    updatedAt
  },
  {
    id: "11223344",
    anchorUid: "11223344",
    anchorName: "桃桃小奶糖",
    anchorAvatar: "",
    roomId: 271828,
    roomUrl: "https://live.bilibili.com/271828",
    medalName: "奶糖",
    medalLevel: 15,
    guardLevel: undefined,
    watchTimeSeconds: 259500,
    watchTimeText: "3 天 0 小时 05 分钟",
    danmakuCount: 3210,
    sourceStatus: "partial",
    updatedAt
  },
  {
    id: "55667788",
    anchorUid: "55667788",
    anchorName: "黑猫团子",
    anchorAvatar: "",
    roomId: 161803,
    roomUrl: "https://live.bilibili.com/161803",
    medalName: "团子",
    medalLevel: 12,
    watchTimeSeconds: 163080,
    watchTimeText: "1 天 21 小时 18 分钟",
    danmakuCount: 2001,
    sourceStatus: "complete",
    updatedAt
  }
];

export const demoJob: QueryJobSnapshot = {
  id: "demo",
  phase: "idle",
  progress: {
    total: 147,
    scanned: 42,
    failed: 0,
    updatedAt
  },
  summary: {
    totalAnchors: 147,
    completeRows: 42,
    failedRows: 0,
    totalWatchSeconds: demoRows.reduce((sum, row) => sum + row.watchTimeSeconds, 0),
    totalWatchText: "34 天 10 小时 43 分钟",
    totalDanmaku: demoRows.reduce((sum, row) => sum + row.danmakuCount, 0),
    dataCompleteness: 28.6
  },
  rows: demoRows
};
