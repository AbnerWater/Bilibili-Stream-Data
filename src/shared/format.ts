export function formatInteger(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.floor(value)));
}

export function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const days = Math.floor(safeSeconds / 86400);
  const hours = Math.floor((safeSeconds % 86400) / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (days > 0) {
    return `${days} 天 ${hours} 小时 ${minutes} 分钟`;
  }
  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分钟`;
  }
  return `${minutes} 分钟`;
}

export function formatCompactDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours >= 24) {
    return `${(safeSeconds / 86400).toFixed(2)} 天`;
  }
  if (hours > 0) {
    return `${hours}.${Math.floor((minutes / 60) * 10)} 小时`;
  }
  return `${minutes} 分钟`;
}
