import {
  BarChart3,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileDown,
  Hash,
  Loader2,
  MessageCircle,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { addAnchorToJob, clearSession, createManualQueryJob, exportUrl, getSession, saveSession, searchAnchors, startQueryJob } from "./api";
import { extractBilibiliCookieText } from "./cookieImport";
import { demoJob } from "./demoData";
import { formatCompactDuration, formatInteger } from "../shared/format";
import type { AnchorSearchResult, JobPhase, ManualAnchorRequest, QueryJobSnapshot, RankRow, SessionStatus } from "../shared/types";

type SortKey = "watchTimeSeconds" | "danmakuCount" | "medalLevel";
type ManualMode = "search" | "uid";

const guardLabels: Record<number, string> = {
  1: "总督",
  2: "提督",
  3: "舰长"
};

export function App() {
  const [uid, setUid] = useState("1234567890");
  const [cookie, setCookie] = useState("");
  const [session, setSession] = useState<SessionStatus>({ authenticated: false });
  const [job, setJob] = useState<QueryJobSnapshot>(demoJob);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>(demoJob.rows[0]?.id || "");
  const [sortKey, setSortKey] = useState<SortKey>("watchTimeSeconds");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingSession, setSavingSession] = useState(false);
  const [starting, setStarting] = useState(false);
  const [manualMode, setManualMode] = useState<ManualMode>("search");
  const [anchorKeyword, setAnchorKeyword] = useState("");
  const [anchorUidInput, setAnchorUidInput] = useState("");
  const [anchorSearchResults, setAnchorSearchResults] = useState<AnchorSearchResult[]>([]);
  const [hasSearchedAnchors, setHasSearchedAnchors] = useState(false);
  const [searchingAnchors, setSearchingAnchors] = useState(false);
  const [addingAnchorId, setAddingAnchorId] = useState<string | null>(null);
  const [manualError, setManualError] = useState("");

  useEffect(() => {
    void getSession().then((status) => {
      setSession(status);
      if (status.viewer?.uid) {
        setUid(status.viewer.uid);
      }
    });
  }, []);

  useEffect(() => {
    if (!activeJobId) {
      return undefined;
    }

    const source = new EventSource(`/api/query-jobs/${activeJobId}/events`, { withCredentials: true });
    source.onmessage = (event) => {
      const nextJob = JSON.parse(event.data) as QueryJobSnapshot;
      setJob(nextJob);
      if (nextJob.phase === "failed" && nextJob.error) {
        setError(nextJob.error);
      }
      if (!nextJob.rows.some((row) => row.id === selectedId) && nextJob.rows[0]) {
        setSelectedId(nextJob.rows[0].id);
      }
      if (nextJob.phase === "complete" || nextJob.phase === "failed") {
        source.close();
      }
    };
    source.onerror = () => {
      setError("进度连接中断，可刷新任务结果或重新查询。");
      source.close();
    };

    return () => source.close();
  }, [activeJobId, selectedId]);

  const rows = useMemo(() => {
    const keyword = filter.trim().toLowerCase();
    return [...job.rows]
      .filter((row) => {
        if (!keyword) {
          return true;
        }
        return [row.anchorName, row.anchorUid, row.roomId, row.medalName]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword));
      })
      .sort((a, b) => {
        const aValue = numberForSort(a, sortKey);
        const bValue = numberForSort(b, sortKey);
        return bValue - aValue || a.anchorName.localeCompare(b.anchorName, "zh-Hans-CN");
      });
  }, [filter, job.rows, sortKey]);

  const selected = rows.find((row) => row.id === selectedId) || rows[0] || null;
  const progressPercent = job.progress.total > 0 ? Math.round((job.progress.scanned / job.progress.total) * 1000) / 10 : 0;
  const isRunning = job.phase === "queued" || job.phase === "scanning";

  async function handleSaveSession() {
    setError("");
    setNotice("");
    setSavingSession(true);
    try {
      const nextSession = await saveSession(uid.trim(), cookie);
      setSession(nextSession);
      setCookie("");
      setNotice(`已检测到账号：${nextSession.viewer?.name || nextSession.viewer?.uid || uid}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录态配置失败。");
    } finally {
      setSavingSession(false);
    }
  }

  async function handleImportClipboard() {
    setError("");
    setNotice("");
    if (!navigator.clipboard?.readText) {
      setError("当前浏览器不支持读取剪贴板，请手动粘贴 Cookie。");
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      const importedCookie = extractBilibiliCookieText(text);
      if (!importedCookie) {
        setError("剪贴板中没有识别到 B 站 Cookie。请复制 Request Headers 里的 Cookie 行或完整 Cookie 值。");
        return;
      }
      setCookie(importedCookie);
      setNotice("已从剪贴板导入 Cookie，点击“保存登录态”后会验证账号。");
    } catch {
      setError("浏览器拒绝读取剪贴板，请手动粘贴 Cookie。");
    }
  }

  async function handleClearSession() {
    await clearSession();
    setSession({ authenticated: false });
    setActiveJobId(null);
  }

  async function handleStart() {
    setError("");
    setStarting(true);
    try {
      const nextJob = await startQueryJob();
      setJob(nextJob);
      setActiveJobId(nextJob.id);
      setSelectedId("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "启动查询失败。");
    } finally {
      setStarting(false);
    }
  }

  async function ensureEditableJob(): Promise<string> {
    if (activeJobId && job.id !== "demo") {
      return activeJobId;
    }
    const nextJob = await createManualQueryJob();
    setJob(nextJob);
    setActiveJobId(nextJob.id);
    setSelectedId("");
    return nextJob.id;
  }

  async function handleSearchAnchors(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setManualError("");
    setNotice("");
    const keyword = anchorKeyword.trim();
    if (!session.authenticated) {
      setManualError("请先保存有效登录态，再搜索主播。");
      return;
    }
    if (!keyword) {
      setManualError("请输入主播名称关键词。");
      return;
    }

    setSearchingAnchors(true);
    setHasSearchedAnchors(true);
    try {
      const results = await searchAnchors(keyword);
      setAnchorSearchResults(results);
      if (results.length === 0) {
        setManualError("没有找到匹配主播，可尝试直接输入 UID。");
      }
    } catch (caught) {
      setAnchorSearchResults([]);
      setManualError(caught instanceof Error ? caught.message : "搜索主播失败。");
    } finally {
      setSearchingAnchors(false);
    }
  }

  async function handleAddAnchor(request: ManualAnchorRequest): Promise<boolean> {
    setManualError("");
    setNotice("");
    if (!session.authenticated) {
      setManualError("请先保存有效登录态，再添加主播。");
      return false;
    }

    setAddingAnchorId(request.anchorUid);
    try {
      const jobId = await ensureEditableJob();
      const nextJob = await addAnchorToJob(jobId, request);
      setJob(nextJob);
      setActiveJobId(nextJob.id);
      setSelectedId(request.anchorUid);
      const addedRow = nextJob.rows.find((row) => row.anchorUid === request.anchorUid);
      setNotice(`已添加/更新主播：${addedRow?.anchorName || request.anchorName || request.anchorUid}`);
      return true;
    } catch (caught) {
      setManualError(caught instanceof Error ? caught.message : "添加主播失败。");
      return false;
    } finally {
      setAddingAnchorId(null);
    }
  }

  async function handleAddUid(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const anchorUid = anchorUidInput.trim();
    if (!/^\d{2,20}$/.test(anchorUid)) {
      setManualError("请输入有效的主播 UID。");
      return;
    }
    const added = await handleAddAnchor({ anchorUid });
    if (added) {
      setAnchorUidInput("");
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">b</span>
          <span>B站直播陪伴统计</span>
        </div>
        <nav className="nav-list" aria-label="主导航">
          <a className="nav-item nav-item-active" href="#query">
            <Search size={22} />
            <span>查询</span>
          </a>
          <a className="nav-item" href="#rank">
            <BarChart3 size={22} />
            <span>排行</span>
          </a>
          <a className="nav-item" href="#export">
            <FileDown size={22} />
            <span>导出</span>
          </a>
          <a className="nav-item" href="#settings">
            <Settings size={22} />
            <span>设置</span>
          </a>
        </nav>
        <div className="api-status">
          <StatusLine label="数据源状态" ok />
          <StatusLine label="直播API" ok />
          <StatusLine label="大航海API" ok />
          <StatusLine label="勋章API" ok />
        </div>
        <div className="sidebar-footer">
          <span>版本 1.0.0</span>
          <button className="icon-text-button" type="button" onClick={() => window.location.reload()}>
            <RefreshCw size={14} />
            检查更新
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar" id="query">
          <label className="uid-field">
            <span>我的UID</span>
            <input value={uid} onChange={(event) => setUid(event.target.value)} inputMode="numeric" />
            <button type="button" aria-label="复制 UID" onClick={() => void navigator.clipboard?.writeText(uid)}>
              <Copy size={17} />
            </button>
          </label>

          <label className="cookie-field">
            <ShieldCheck size={18} />
            <input
              value={cookie}
              onChange={(event) => setCookie(event.target.value)}
              placeholder={session.authenticated ? "登录态已配置（********）" : "粘贴已登录 B 站 Cookie"}
              type="password"
            />
          </label>

          <button className="secondary-button" type="button" onClick={handleImportClipboard}>
            <Download size={18} />
            剪贴板导入
          </button>

          <button className="secondary-button" type="button" disabled={savingSession} onClick={handleSaveSession}>
            {savingSession ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}
            保存登录态
          </button>

          <button className="primary-button" type="button" disabled={!session.authenticated || starting || isRunning} onClick={handleStart}>
            {starting || isRunning ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
            开始查询
          </button>
        </header>

        {error ? <div className="error-banner">{error}</div> : null}
        {notice ? <div className="notice-banner">{notice}</div> : null}

        <section className="content-grid">
          <div className="main-panel">
            <section className="progress-strip" aria-label="扫描进度">
              <div>
                <strong>
                  已扫描 {job.progress.scanned}/{job.progress.total || demoJob.progress.total} 个主播
                </strong>
                <div className="progress-bar">
                  <span style={{ width: `${progressPercent || demoJob.summary.dataCompleteness}%` }} />
                </div>
              </div>
              <span>{progressPercent || demoJob.summary.dataCompleteness}%</span>
              <span>失败 {job.progress.failed} 个</span>
              <button className="pause-button" type="button" disabled>
                <Pause size={16} />
                暂停查询
              </button>
            </section>

            <section className="metric-grid" aria-label="汇总指标">
              <MetricCard icon={<Clock3 size={26} />} label="总观看时长" value={formatCompactDuration(job.summary.totalWatchSeconds).replace(/\s/g, "")} subValue={job.summary.totalWatchText} tone="pink" />
              <MetricCard icon={<MessageCircle size={26} />} label="总弹幕数" value={formatInteger(job.summary.totalDanmaku)} subValue="GuardActive 返回弹幕数" tone="rose" />
              <MetricCard icon={<Sparkles size={26} />} label="已扫描主播" value={`${job.progress.scanned || rows.length} 个`} subValue={`${job.summary.totalAnchors || demoJob.summary.totalAnchors} 个候选主播`} tone="amber" />
              <MetricCard icon={<ShieldCheck size={26} />} label="数据可信度" value={`${job.summary.dataCompleteness}%`} subValue={confidenceText(job.phase)} tone="teal" />
            </section>

            <section className="table-toolbar" id="rank">
              <div>
                <h1>主播观看排行</h1>
                <p>{job.id === "demo" ? "示例数据仅用于界面预览，开始查询后会被真实结果替换。" : `任务 ${job.id.slice(0, 8)} / ${phaseText(job.phase)}`}</p>
              </div>
              <div className="toolbar-controls">
                <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="筛选主播 / UID / 勋章" />
                <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} aria-label="排序字段">
                  <option value="watchTimeSeconds">按观看时长</option>
                  <option value="danmakuCount">按弹幕</option>
                  <option value="medalLevel">按勋章等级</option>
                </select>
              </div>
            </section>

            <section className="manual-anchor-panel" aria-label="添加主播">
              <div className="manual-anchor-head">
                <div>
                  <h2>添加主播</h2>
                  <p>默认按粉丝灯牌扫描；也可以搜索主播名称或直接输入 UID 追加到当前排行。</p>
                </div>
                <div className="mode-switch" role="tablist" aria-label="添加方式">
                  <button
                    className={manualMode === "search" ? "active" : ""}
                    type="button"
                    role="tab"
                    aria-selected={manualMode === "search"}
                    onClick={() => setManualMode("search")}
                  >
                    <Search size={16} />
                    搜索名称
                  </button>
                  <button
                    className={manualMode === "uid" ? "active" : ""}
                    type="button"
                    role="tab"
                    aria-selected={manualMode === "uid"}
                    onClick={() => setManualMode("uid")}
                  >
                    <Hash size={16} />
                    输入 UID
                  </button>
                </div>
              </div>

              {manualMode === "search" ? (
                <>
                  <form className="manual-form" onSubmit={handleSearchAnchors}>
                    <label>
                      <span>主播名称</span>
                      <input value={anchorKeyword} onChange={(event) => setAnchorKeyword(event.target.value)} placeholder="输入主播昵称关键词" />
                    </label>
                    <button className="secondary-button" type="submit" disabled={!session.authenticated || searchingAnchors}>
                      {searchingAnchors ? <Loader2 className="spin" size={18} /> : <Search size={18} />}
                      搜索
                    </button>
                  </form>

                  {anchorSearchResults.length > 0 ? (
                    <div className="anchor-results" aria-label="主播搜索结果">
                      {anchorSearchResults.map((result) => (
                        <article className="anchor-result" key={result.anchorUid}>
                          <SearchResultAvatar result={result} />
                          <div className="anchor-result-main">
                            <strong>{result.anchorName}</strong>
                            <span>
                              UID {result.anchorUid}
                              {result.roomId ? ` / 房间 ${result.roomId}` : ""}
                            </span>
                          </div>
                          <span className={`live-pill live-${result.liveStatus === 1 ? "on" : "off"}`}>{liveStatusText(result.liveStatus)}</span>
                          <span className="followers-text">{result.followers ? `${formatInteger(result.followers)} 关注` : "关注数未知"}</span>
                          <button
                            className="tiny-add-button"
                            type="button"
                            disabled={addingAnchorId === result.anchorUid}
                            onClick={() =>
                              void handleAddAnchor({
                                anchorUid: result.anchorUid,
                                anchorName: result.anchorName,
                                anchorAvatar: result.anchorAvatar,
                                roomId: result.roomId
                              })
                            }
                          >
                            {addingAnchorId === result.anchorUid ? <Loader2 className="spin" size={15} /> : <Plus size={15} />}
                            添加
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : hasSearchedAnchors && !searchingAnchors && !manualError ? (
                    <div className="manual-empty">没有找到匹配主播，可尝试直接输入 UID。</div>
                  ) : null}
                </>
              ) : (
                <form className="manual-form manual-uid-form" onSubmit={handleAddUid}>
                  <label>
                    <span>主播 UID</span>
                    <input value={anchorUidInput} onChange={(event) => setAnchorUidInput(event.target.value)} inputMode="numeric" placeholder="例如 3493083637352639" />
                  </label>
                  <button className="secondary-button" type="submit" disabled={!session.authenticated || addingAnchorId === anchorUidInput.trim()}>
                    {addingAnchorId === anchorUidInput.trim() ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}
                    添加并查询
                  </button>
                </form>
              )}

              {manualError ? <div className="manual-error">{manualError}</div> : null}
            </section>

            <div className="rank-table-wrap">
              <table className="rank-table">
                <thead>
                  <tr>
                    <th>排名</th>
                    <th>主播</th>
                    <th>UID</th>
                    <th>直播间</th>
                    <th>观看时长</th>
                    <th>弹幕</th>
                    <th>勋章</th>
                    <th>大航海</th>
                    <th>更新时间</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.id} className={row.id === selected?.id ? "selected-row" : ""} onClick={() => setSelectedId(row.id)}>
                      <td>
                        <RankBadge rank={index + 1} />
                      </td>
                      <td>
                        <div className="anchor-cell">
                          <Avatar row={row} />
                          <div>
                            <strong>{row.anchorName}</strong>
                            <span>{statusText(row.sourceStatus)}</span>
                          </div>
                        </div>
                      </td>
                      <td>{row.anchorUid}</td>
                      <td>{row.roomId || "-"}</td>
                      <td>
                        <strong>{row.watchTimeText}</strong>
                        <span>{formatCompactDuration(row.watchTimeSeconds)}</span>
                      </td>
                      <td>{formatInteger(row.danmakuCount)}</td>
                      <td>
                        {row.medalName || "-"}
                        {row.medalLevel ? <span className="level-pill">Lv.{row.medalLevel}</span> : null}
                      </td>
                      <td>{row.guardLevel ? guardLabels[row.guardLevel] || `Lv.${row.guardLevel}` : "-"}</td>
                      <td>{formatDate(row.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <footer className="table-footer" id="export">
              <span>共 {rows.length} 条</span>
              <div className="export-buttons">
                {activeJobId ? (
                  <>
                    <a href={exportUrl(activeJobId, "csv")}>
                      <Download size={16} />
                      CSV
                    </a>
                    <a href={exportUrl(activeJobId, "xlsx")}>
                      <Download size={16} />
                      XLSX
                    </a>
                    <a href={exportUrl(activeJobId, "json")}>
                      <Download size={16} />
                      JSON
                    </a>
                  </>
                ) : (
                  <span>真实查询完成后可导出</span>
                )}
              </div>
            </footer>
          </div>

          <aside className="detail-panel" aria-label="主播详情">
            {selected ? <DetailPanel row={selected} phase={job.phase} onClearSession={handleClearSession} /> : <EmptyDetail />}
          </aside>
        </section>
      </section>
    </main>
  );
}

function MetricCard({ icon, label, value, subValue, tone }: { icon: React.ReactNode; label: string; value: string; subValue: string; tone: string }) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{subValue}</small>
      </div>
    </article>
  );
}

function StatusLine({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div>
      <span className={ok ? "status-dot ok" : "status-dot"} />
      <span>{label}</span>
      <strong>{ok ? "正常" : "异常"}</strong>
    </div>
  );
}

function DetailPanel({ row, phase, onClearSession }: { row: RankRow; phase: JobPhase; onClearSession: () => void }) {
  const watchActive = Math.round(row.watchTimeSeconds * 0.92);
  const watchBackground = Math.max(0, row.watchTimeSeconds - watchActive);
  const guardName = row.guardLevel ? guardLabels[row.guardLevel] || `等级 ${row.guardLevel}` : "未开通";

  return (
    <>
      <div className="detail-title">
        <h2>主播详情</h2>
        <button type="button" onClick={onClearSession} aria-label="清除登录态">
          <Trash2 size={18} />
        </button>
      </div>
      <div className="profile-block">
        <Avatar row={row} large />
        <div>
          <h3>{row.anchorName}</h3>
          <p>UID：{row.anchorUid}</p>
          <p>直播间：{row.roomId || "-"}</p>
          {row.roomUrl ? (
            <a href={row.roomUrl} target="_blank" rel="noreferrer">
              {row.roomUrl}
              <ExternalLink size={14} />
            </a>
          ) : null}
        </div>
      </div>

      <DetailSection title="观看时长明细" total={row.watchTimeText}>
        <ProgressLine label="有效观看时长" value={watchActive} total={row.watchTimeSeconds} suffix={formatCompactDuration(watchActive)} />
        <ProgressLine label="后台播放时长" value={watchBackground} total={row.watchTimeSeconds} suffix={formatCompactDuration(watchBackground)} />
        <ProgressLine label="其它活动贡献" value={Math.round(row.watchTimeSeconds * 0.01)} total={row.watchTimeSeconds} suffix="接口未细分" />
      </DetailSection>

      <section className="detail-card">
        <h4>勋章与守护</h4>
        <dl className="kv-list">
          <div>
            <dt>粉丝勋章</dt>
            <dd>{row.medalName ? `${row.medalName} Lv.${row.medalLevel || "-"}` : "-"}</dd>
          </div>
          <div>
            <dt>大航海等级</dt>
            <dd>{guardName}</dd>
          </div>
          <div>
            <dt>守护状态</dt>
            <dd>{row.guardStatus === 1 ? "已开通" : "未开通/已过期"}</dd>
          </div>
          <div>
            <dt>弹幕数量</dt>
            <dd>{formatInteger(row.danmakuCount)}</dd>
          </div>
        </dl>
      </section>

      <section className="detail-card">
        <h4>数据来源与说明</h4>
        <dl className="kv-list">
          <div>
            <dt>直播记录</dt>
            <dd>GuardActive API</dd>
          </div>
          <div>
            <dt>勋章记录</dt>
            <dd>FansMedal API</dd>
          </div>
          <div>
            <dt>任务状态</dt>
            <dd>{phaseText(phase)}</dd>
          </div>
          <div>
            <dt>最后更新</dt>
            <dd>{formatDate(row.updatedAt)}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}

function DetailSection({ title, total, children }: { title: string; total: string; children: React.ReactNode }) {
  return (
    <section className="detail-card">
      <div className="section-heading">
        <h4>{title}</h4>
        <strong>{total}</strong>
      </div>
      {children}
    </section>
  );
}

function ProgressLine({ label, value, total, suffix, tone = "teal" }: { label: string; value: number; total: number; suffix: string; tone?: "teal" | "pink" }) {
  const percent = total > 0 ? Math.max(2, Math.min(100, (value / total) * 100)) : 2;
  return (
    <div className="progress-line">
      <span>{label}</span>
      <div className="mini-bar">
        <span className={tone} style={{ width: `${percent}%` }} />
      </div>
      <strong>{suffix}</strong>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  return <span className={`rank-badge ${rank <= 3 ? `rank-${rank}` : ""}`}>{rank}</span>;
}

function Avatar({ row, large = false }: { row: RankRow; large?: boolean }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [row.anchorAvatar]);

  if (row.anchorAvatar && !failed) {
    return (
      <img
        className={large ? "avatar avatar-large" : "avatar"}
        src={row.anchorAvatar}
        alt={`${row.anchorName} 头像`}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return <span className={large ? "avatar avatar-large avatar-fallback" : "avatar avatar-fallback"}>{row.anchorName.slice(0, 1)}</span>;
}

function SearchResultAvatar({ result }: { result: AnchorSearchResult }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [result.anchorAvatar]);

  if (result.anchorAvatar && !failed) {
    return (
      <img
        className="avatar"
        src={result.anchorAvatar}
        alt={`${result.anchorName} 头像`}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }

  return <span className="avatar avatar-fallback">{result.anchorName.slice(0, 1)}</span>;
}

function EmptyDetail() {
  return (
    <div className="empty-detail">
      <Table2 size={36} />
      <strong>选择一位主播</strong>
      <span>查看观看时长、弹幕、勋章和大航海信息。</span>
    </div>
  );
}

function numberForSort(row: RankRow, key: SortKey): number {
  return Number(row[key] || 0);
}

function statusText(status: RankRow["sourceStatus"]): string {
  if (status === "complete") {
    return "完整";
  }
  if (status === "partial") {
    return "部分";
  }
  return "失败";
}

function phaseText(phase: JobPhase): string {
  const map: Record<JobPhase, string> = {
    idle: "等待查询",
    queued: "排队中",
    scanning: "扫描中",
    complete: "已完成",
    failed: "失败"
  };
  return map[phase];
}

function confidenceText(phase: JobPhase): string {
  return phase === "idle" ? "示例记录" : phase === "complete" ? "扫描完成" : "实时更新";
}

function liveStatusText(status?: number): string {
  if (status === 1) {
    return "直播中";
  }
  if (status === 0) {
    return "未开播";
  }
  return "状态未知";
}

function formatDate(value?: string): string {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
