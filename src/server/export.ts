import * as XLSX from "xlsx";
import type { RankRow } from "../shared/types.js";

const EXPORT_COLUMNS: Array<{ key: keyof RankRow | "rank"; label: string }> = [
  { key: "rank", label: "排名" },
  { key: "anchorName", label: "主播" },
  { key: "anchorUid", label: "主播UID" },
  { key: "roomId", label: "直播间" },
  { key: "watchTimeText", label: "观看时长" },
  { key: "watchTimeSeconds", label: "观看秒数" },
  { key: "danmakuCount", label: "弹幕" },
  { key: "medalName", label: "勋章" },
  { key: "medalLevel", label: "勋章等级" },
  { key: "guardLevel", label: "大航海等级" },
  { key: "sourceStatus", label: "数据状态" },
  { key: "apiMessage", label: "接口说明" },
  { key: "updatedAt", label: "更新时间" }
];

export function rowsToCsv(rows: RankRow[]): string {
  const header = EXPORT_COLUMNS.map((column) => csvCell(column.label)).join(",");
  const lines = rows.map((row, index) =>
    EXPORT_COLUMNS.map((column) => csvCell(valueForColumn(row, column.key, index))).join(",")
  );
  return `\uFEFF${[header, ...lines].join("\n")}`;
}

export function rowsToXlsx(rows: RankRow[]): Buffer {
  const records = rows.map((row, index) => {
    const record: Record<string, string | number | null | undefined> = {};
    for (const column of EXPORT_COLUMNS) {
      record[column.label] = valueForColumn(row, column.key, index);
    }
    return record;
  });
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(records);
  XLSX.utils.book_append_sheet(workbook, worksheet, "直播排行");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function valueForColumn(row: RankRow, key: keyof RankRow | "rank", index: number): string | number | null | undefined {
  if (key === "rank") {
    return index + 1;
  }
  return row[key] as string | number | null | undefined;
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}
