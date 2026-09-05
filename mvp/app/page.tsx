'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Image from 'next/image';
import {
  ArrowLeft, ArrowRight, Bell, Bookmark, Check, ChevronRight, CircleDollarSign,
  Clock3, Compass, ExternalLink, Heart, Home, MapPin, Menu, Mic, Minus, Plus,
  Radar, ReceiptText, Search, Settings, Share2, ShieldCheck, Sparkles, Users,
  WalletCards, X, Zap,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { BASE_WEIGHTS, calculateCpScore, type CpDimension } from '@/lib/cp-engine';

type View = 'home' | 'search' | 'results' | 'detail' | 'saved' | 'team' | 'settings' | 'map';
type Mode = 'daily' | 'team' | 'zero';
type AgentStatus = 'ready' | 'working' | 'done';
type Category = '餐食' | '免費' | '活動';

type Result = {
  id: string; category: Category; title: string; provider: string; cost: number;
  unit: string; meta: string; condition: string; source: string; evidence: string;
  reliability: number; verified: boolean; mapQuery: string; image?: string;
  tone: 'lime' | 'violet' | 'blue' | 'coral';
  dimensions: Partial<Record<CpDimension, number>>;
};

const modes: Record<Mode, { title: string; short: string; description: string; color: string }> = {
  daily: { title: '省錢晚餐', short: '晚餐', description: '兩人 NT$300 內，兼顧份量與距離', color: 'var(--lime)' },
  team: { title: '一起省更多', short: '揪團', description: '找成團優惠，追蹤承諾與截止時間', color: 'var(--violet)' },
  zero: { title: '零元探索', short: '零元', description: '把資格、交通與時間都算清楚', color: 'var(--coral)' },
};

const weights: Record<Mode, Record<CpDimension, number>> = {
  daily: BASE_WEIGHTS,
  team: { price: 0.24, food: 0.18, quality: 0.16, convenience: 0.12, discount: 0.3 },
  zero: { price: 0.44, food: 0.08, quality: 0.18, convenience: 0.18, discount: 0.12 },
};

const results: Result[] = [
  { id: 'bento-together', category: '餐食', title: '雙人暖心便當組', provider: '圓山生活圈', cost: 198, unit: 'NT$99／人', meta: '步行 8 分鐘 · 可外帶', condition: '今日 19:30 前取餐', source: '商家菜單與現場資訊', evidence: '雙人組合包含主食、時蔬與蛋；價格不含外送費，選擇自取時總價為 NT$198。', reliability: 92, verified: true, mapQuery: '捷運圓山站 便當', image: '/bento-neon.png', tone: 'lime', dimensions: { price: 90, food: 86, quality: 79, convenience: 88, discount: 72 } },
  { id: 'group-bento', category: '餐食', title: '五人便當 85 折團', provider: '圓山好食隊', cost: 425, unit: '成團後 NT$85／人', meta: '3 / 5 人 · 19:00 截止', condition: '還差 2 人成團', source: '店家團購公告', evidence: '滿五份可使用團購價；未達門檻時不成立，也不會先收取費用。', reliability: 84, verified: true, mapQuery: '捷運圓山站 餐廳', tone: 'violet', dimensions: { price: 88, food: 84, quality: 75, convenience: 76, discount: 96 } },
  { id: 'tfam-evening', category: '免費', title: '北美館傍晚散步', provider: '臺北市立美術館', cost: 0, unit: '直接費用 NT$0', meta: '圓山站步行 10 分鐘', condition: '適用時段依官方公告', source: '臺北市立美術館官方資訊', evidence: '指定時段可免費參觀；特殊展覽與臨時調整仍以館方當日公告為準。', reliability: 96, verified: true, mapQuery: '臺北市立美術館', tone: 'blue', dimensions: { price: 100, food: 58, quality: 90, convenience: 86, discount: 100 } },
  { id: 'garden-tour', category: '活動', title: '典藏植物園假日導覽', provider: '臺北典藏植物園', cost: 0, unit: '直接費用 NT$0', meta: '週末定時場次', condition: '出發前確認最新場次', source: '臺北市政府公開資訊', evidence: '週末提供免費定時導覽；場次可能調整，建議出發前再次確認。', reliability: 88, verified: true, mapQuery: '臺北典藏植物園', tone: 'coral', dimensions: { price: 100, food: 52, quality: 84, convenience: 78, discount: 100 } },
];

const money = (value: number) => new Intl.NumberFormat('zh-TW').format(value);
const score = (item: Result, mode: Mode) => calculateCpScore({ dimensions: item.dimensions, reliability: item.reliability, weights: weights[mode], requiredEvidence: item.verified, hardConstraintsPassed: true }).score;

export default function App() {
  const [view, setView] = useState<View>('home');
  const [history, setHistory] = useState<View[]>([]);
  const [mode, setMode] = useState<Mode>('daily');
  const [budget, setBudget] = useState(300);
  const [people, setPeople] = useState(2);
  const [need, setNeed] = useState('今晚想吃飽，可外帶，不吃牛');
  const [selectedId, setSelectedId] = useState(results[0].id);
  const [saved, setSaved] = useState<string[]>([]);
  const [completed, setCompleted] = useState<string[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('ready');
  const [searchProgress, setSearchProgress] = useState(0);
  const [teamCount, setTeamCount] = useState(3);
  const [toast, setToast] = useState('');
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [category, setCategory] = useState<'全部' | Category>('全部');
  const [sort, setSort] = useState<'cp' | 'cost'>('cp');

  const selected = results.find((item) => item.id === selectedId) ?? results[0];
  const ordered = useMemo(() => {
    const list = category === '全部' ? results : results.filter((item) => item.category === category);
    return [...list].sort((a, b) => sort === 'cost' ? a.cost - b.cost : (score(b, mode) ?? 0) - (score(a, mode) ?? 0));
  }, [category, mode, sort]);

  useEffect(() => {
    if (view !== 'search') return;
    const timers = [
      window.setTimeout(() => setSearchProgress(42), 360),
      window.setTimeout(() => setSearchProgress(74), 780),
      window.setTimeout(() => { setSearchProgress(100); setAgentStatus('done'); }, 1200),
      window.setTimeout(() => setView('results'), 1650),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [view]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function navigate(next: View, remember = true) {
    if (remember && next !== view) setHistory((items) => [...items.slice(-5), view]);
    setView(next);
  }
  function goBack() { setView(history.at(-1) ?? 'home'); setHistory((items) => items.slice(0, -1)); }
  function chooseMode(next: Mode) {
    setMode(next);
    if (next === 'daily') { setBudget(300); setPeople(2); }
    if (next === 'team') { setBudget(500); setPeople(5); }
    if (next === 'zero') { setBudget(0); setPeople(1); }
    setToast(`已切換：${modes[next].title}`);
  }
  function openResult(id: string) { setSelectedId(id); navigate('detail'); }
  function toggleSaved(id: string) {
    setSaved((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
    setToast(saved.includes(id) ? '已從清單移除' : '已加入我的清單');
  }

  return (
    <div className="app-stage" data-survival={mode === 'zero' ? 'true' : 'false'}>
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <main className="phone-shell">
        <AppHeader view={view} onBack={goBack} onSettings={() => navigate('settings')} savedCount={saved.length} />
        <div className="screen-stack"><div key={view} className="screen-enter">
          {view === 'home' && <HomeScreen mode={mode} budget={budget} people={people} need={need} savedCount={saved.length} onMode={chooseMode} onNeed={setNeed} onSearch={() => { setAgentStatus('working'); setSearchProgress(12); setHistory(['home']); setView('search'); }} onSettings={() => navigate('settings')} />}
          {view === 'search' && <SearchScreen progress={searchProgress} status={agentStatus} />}
          {view === 'results' && <ResultsScreen items={ordered} mode={mode} category={category} sort={sort} saved={saved} onCategory={setCategory} onSort={setSort} onOpen={openResult} onSave={toggleSaved} />}
          {view === 'detail' && <DetailScreen item={selected} score={score(selected, mode)} saved={saved.includes(selected.id)} onSave={() => toggleSaved(selected.id)} onEvidence={() => setEvidenceOpen(true)} onMap={() => navigate('map')} />}
          {view === 'saved' && <SavedScreen items={results.filter((item) => saved.includes(item.id))} completed={completed} onToggle={(id) => setCompleted((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id])} onOpen={openResult} onExplore={() => navigate('results')} />}
          {view === 'team' && <TeamScreen count={teamCount} onPromise={() => { setTeamCount((count) => Math.min(5, count + 1)); setToast('承諾成功，成團進度已更新'); }} />}
          {view === 'settings' && <SettingsScreen budget={budget} people={people} mode={mode} onBudget={setBudget} onPeople={setPeople} onMode={chooseMode} onDone={goBack} />}
          {view === 'map' && <MapScreen item={selected} onOpen={() => openResult(selected.id)} />}
        </div></div>
        {!['search', 'settings', 'map', 'detail'].includes(view) && <BottomNav view={view} onNavigate={navigate} savedCount={saved.length} />}
        {toast && <div className="toast"><Check />{toast}</div>}
      </main>
      <Dialog open={evidenceOpen} onOpenChange={setEvidenceOpen}><DialogContent className="evidence-sheet">
        <div className="sheet-handle" /><DialogHeader><span className="kicker lime-text">可信資料</span><DialogTitle className="text-2xl font-black">{selected.title}</DialogTitle><DialogDescription>{selected.source}</DialogDescription></DialogHeader>
        <div className="evidence-grid"><Metric label="可信度" value={`${selected.reliability}%`} /><Metric label="CP 分數" value={String(score(selected, mode) ?? '—')} /><Metric label="總成本" value={`$${money(selected.cost)}`} /></div>
        <blockquote className="evidence-copy">{selected.evidence}</blockquote><p className="fine-print">資訊可能變動，出發或購買前請再次向原始提供者確認。</p>
      </DialogContent></Dialog>
    </div>
  );
}

function AppHeader({ view, onBack, onSettings, savedCount }: { view: View; onBack: () => void; onSettings: () => void; savedCount: number }) {
  const root = ['home', 'results', 'saved', 'team'].includes(view);
  const titles: Partial<Record<View, string>> = { detail: '選項詳情', search: '正在為你搜尋', settings: '生活設定', map: '位置資訊' };
  return <header className="app-header glass">
    {root ? <button className="brand" onClick={() => window.location.reload()} aria-label="回到首頁並重新整理"><span>ALL</span><i>in</i><span>LIFE</span></button> : <button className="icon-button" onClick={onBack} aria-label="返回"><ArrowLeft /></button>}
    {!root && <strong className="header-title">{titles[view]}</strong>}
    <div className="header-actions">{root && <span className="place-pill"><MapPin />圓山</span>}{savedCount > 0 && root && <span className="header-count">{savedCount}</span>}<button className="icon-button" onClick={onSettings} aria-label="開啟設定">{root ? <Menu /> : <Settings />}</button></div>
  </header>;
}

function HomeScreen({ mode, budget, people, need, savedCount, onMode, onNeed, onSearch, onSettings }: { mode: Mode; budget: number; people: number; need: string; savedCount: number; onMode: (mode: Mode) => void; onNeed: (value: string) => void; onSearch: () => void; onSettings: () => void }) {
  const daily = budget === 0 ? 0 : Math.floor(8000 / 23);
  return <section className="screen home-screen">
    <div className="greeting-row"><div><span className="kicker">FRI · 09/05</span><h1>今晚想怎麼過？</h1></div><button className="avatar-button" onClick={onSettings} aria-label="開啟個人生活設定">J</button></div>
    <button className="wallet-card" onClick={onSettings} aria-label="查看並調整本月預算"><div><span className="wallet-label"><WalletCards />本月可運用</span><strong>NT$ 8,000</strong></div><div className="wallet-side"><span>每日建議</span><b>NT$ {daily}</b><small>保留金 NT$2,000</small></div><div className="wallet-progress"><i style={{ width: '78%' }} /></div></button>
    <div className="section-heading"><div><span className="kicker">選擇今天的節奏</span><h2>生活模式</h2></div><span className="tiny-count">{savedCount} 個收藏</span></div>
    <div className="mode-carousel">{(Object.keys(modes) as Mode[]).map((item) => <button key={item} className={`mode-card ${mode === item ? 'active' : ''}`} onClick={() => onMode(item)} style={{ '--mode-color': modes[item].color } as React.CSSProperties}><span>{item === 'daily' ? <CircleDollarSign /> : item === 'team' ? <Users /> : <Sparkles />}</span><b>{modes[item].short}</b><small>{item === 'daily' ? '吃得好' : item === 'team' ? '一起省' : '玩整天'}</small>{mode === item && <Check className="mode-check" />}</button>)}</div>
    <div className="mission-card"><div className="mission-top"><span className="mode-dot" /><span>{modes[mode].title}</span><button onClick={onSettings}>調整條件</button></div><label className="need-input"><Mic /><input value={need} onChange={(event) => onNeed(event.target.value)} aria-label="描述今天的需求" />{need && <button type="button" onClick={() => onNeed('')} aria-label="清除需求"><X /></button>}</label><div className="constraint-row"><span>NT${budget}</span><span>{people} 人</span><span>2 km 內</span></div><button className="primary-action" onClick={onSearch}><Search />開始探索<ArrowRight /></button></div>
    <button className="quick-team" onClick={() => onMode('team')}><span className="quick-icon"><Users /></span><span><b>附近有人正在湊團</b><small>五人便當團還差 2 位</small></span><ChevronRight /></button>
  </section>;
}

function SearchScreen({ progress, status }: { progress: number; status: AgentStatus }) {
  return <section className="screen search-screen"><div className="search-orbit"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><Radar /><span>{progress}%</span></div><span className="kicker lime-text">資料正在靠近</span><h1>兩位生活獵人<br />同步出發</h1><p>比較價格，也確認資格、距離與來源。</p><div className="agent-stack"><AgentRow icon={<Zap />} name="CP 值獵人" detail="餐食、團購與價格" status={status} accent="lime" /><AgentRow icon={<Sparkles />} name="零元獵人" detail="活動、公益與免費資源" status={status} accent="violet" /></div><Progress value={progress} className="search-progress" /><div className="skeleton-results"><i /><i /><i /></div></section>;
}
function AgentRow({ icon, name, detail, status, accent }: { icon: ReactNode; name: string; detail: string; status: AgentStatus; accent: string }) {
  return <div className={`agent-row ${accent}`}><span className="agent-icon">{icon}</span><span><b>{name}</b><small>{detail}</small></span><span className={`status-pip ${status}`} /></div>;
}

function ResultsScreen({ items, mode, category, sort, saved, onCategory, onSort, onOpen, onSave }: { items: Result[]; mode: Mode; category: '全部' | Category; sort: 'cp' | 'cost'; saved: string[]; onCategory: (value: '全部' | Category) => void; onSort: (value: 'cp' | 'cost') => void; onOpen: (id: string) => void; onSave: (id: string) => void }) {
  const categories: Array<'全部' | Category> = ['全部', '餐食', '免費', '活動'];
  return <section className="screen results-screen"><div className="results-intro"><span className="kicker">FOR YOU · 圓山 2 KM</span><h1>找到 {items.length} 個好選擇</h1><p>{modes[mode].description}</p></div><div className="filter-row"><div className="filter-scroll">{categories.map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => onCategory(item)}>{item}</button>)}</div><button className="sort-button" onClick={() => onSort(sort === 'cp' ? 'cost' : 'cp')}>{sort === 'cp' ? 'CP 優先' : '價格優先'}</button></div><div className="result-list">{items.map((item, index) => <article key={item.id} className={`result-card tone-${item.tone}`}>
    <button className="result-open" onClick={() => onOpen(item.id)} aria-label={`查看 ${item.title}`}>
      {item.image ? <Image src={item.image} alt="便當包含白飯、蔬菜、豆腐、雞肉與蛋" width={116} height={196} /> : <div className="result-art"><span>{item.category === '餐食' ? '85折' : item.cost === 0 ? 'FREE' : 'GO'}</span><Compass /></div>}
      <span className="result-body"><span className="result-meta"><span>0{index + 1}</span><span><ShieldCheck />{item.reliability}%</span></span><span className="result-title">{item.title}</span><span className="result-copy">{item.provider} · {item.meta}</span><span className="price-row"><strong><small>NT$</small>{money(item.cost)}</strong><span>CP <b>{score(item, mode)}</b></span></span><span className="result-condition"><Clock3 />{item.condition}</span></span>
    </button><button className={`save-fab ${saved.includes(item.id) ? 'saved' : ''}`} onClick={() => onSave(item.id)} aria-label={saved.includes(item.id) ? '取消收藏' : '加入收藏'}><Heart /></button>
  </article>)}</div></section>;
}

function DetailScreen({ item, score: itemScore, saved, onSave, onEvidence, onMap }: { item: Result; score: number | null; saved: boolean; onSave: () => void; onEvidence: () => void; onMap: () => void }) {
  return <section className="screen detail-screen">{item.image ? <div className="detail-image"><Image src={item.image} alt="便當餐點近照" width={430} height={252} priority /><span className="image-badge"><ShieldCheck />可信來源</span></div> : <div className={`detail-hero tone-${item.tone}`}><Compass /><span>{item.category}</span></div>}<div className="detail-content"><span className="kicker">{item.provider}</span><h1>{item.title}</h1><p className="detail-meta"><MapPin />{item.meta}</p><div className="detail-score"><div><span>總成本</span><strong>NT${money(item.cost)}</strong><small>{item.unit}</small></div><div><span>個人 CP</span><strong>{itemScore}</strong><small>符合目前條件</small></div></div><div className="condition-box"><Zap /><div><b>現在可以怎麼做</b><p>{item.condition}</p></div></div><button className="evidence-button" onClick={onEvidence}><ReceiptText /><span><b>查看資料依據</b><small>{item.source}</small></span><ChevronRight /></button><button className="map-button" onClick={onMap}><MapPin />查看位置與交通方式<ArrowRight /></button></div><div className="detail-actions glass"><button onClick={onSave} className={saved ? 'saved' : ''}><Bookmark />{saved ? '已收藏' : '收藏'}</button><button onClick={() => navigator.share?.({ title: item.title, text: item.condition })}><Share2 />分享</button><button className="detail-primary" onClick={onSave}>{saved ? '已放進清單' : '加入今晚清單'}</button></div></section>;
}

function SavedScreen({ items, completed, onToggle, onOpen, onExplore }: { items: Result[]; completed: string[]; onToggle: (id: string) => void; onOpen: (id: string) => void; onExplore: () => void }) {
  return <section className="screen saved-screen"><span className="kicker">MY PLAN</span><h1>今晚清單</h1><p>勾起來，出門前一眼確認。</p>{items.length === 0 ? <div className="empty-state"><Bookmark /><h2>還沒有收藏</h2><p>從推薦結果挑幾個想去的地方。</p><button onClick={onExplore}>開始探索</button></div> : <div className="checklist">{items.map((item) => <div key={item.id} className={completed.includes(item.id) ? 'done' : ''}><button className="check-button" onClick={() => onToggle(item.id)} aria-label={completed.includes(item.id) ? `將 ${item.title} 標記為未完成` : `將 ${item.title} 標記為完成`}>{completed.includes(item.id) && <Check />}</button><button className="check-copy" onClick={() => onOpen(item.id)}><b>{item.title}</b><span>{item.condition}</span></button><strong>NT${money(item.cost)}</strong></div>)}</div>}<div className="list-summary"><span>已完成 {completed.filter((id) => items.some((item) => item.id === id)).length} / {items.length}</span><Progress value={items.length ? (completed.length / items.length) * 100 : 0} /></div></section>;
}

function TeamScreen({ count, onPromise }: { count: number; onPromise: () => void }) {
  const done = count >= 5;
  return <section className="screen team-screen"><span className="kicker">TOGETHER MODE</span><h1>一起省，更有感</h1><p>熟人小隊的承諾、門檻與截止時間都看得見。</p><div className={`team-campaign ${done ? 'complete' : ''}`}><div className="campaign-top"><span className="campaign-logo"><Users /></span><span><small>今晚 19:00 截止</small><b>五人便當 85 折團</b></span><span className="live-chip">揪團中</span></div><div className="team-price"><div><span>成團價</span><strong>NT$85</strong><small>每人</small></div><div><span>原價</span><s>NT$100</s><small>每人省 NT$15</small></div></div><div className="people-row">{[0,1,2,3,4].map((index) => <span key={index} className={index < count ? 'filled' : ''}>{index < count ? ['J','T','A','你','K'][index] : '＋'}</span>)}</div><div className="campaign-progress"><span>{done ? '已達成團門檻' : `還差 ${5 - count} 人成團`}</span><b>{count} / 5</b></div><Progress value={(count / 5) * 100} /><button className="primary-action violet-action" onClick={onPromise} disabled={done}>{done ? <><Check />已承諾，等候取餐</> : <><Zap />我要加入</>}</button></div><div className="team-note"><ShieldCheck /><div><b>安心承諾</b><p>達到門檻才成立；取消與截止規則會在加入前說清楚。</p></div></div><button className="invite-button" onClick={() => navigator.clipboard?.writeText('一起加入 ALL in LIFE 的圓山好食隊')}><Share2 />邀請朋友加入</button></section>;
}

function SettingsScreen({ budget, people, mode, onBudget, onPeople, onMode, onDone }: { budget: number; people: number; mode: Mode; onBudget: (value: number) => void; onPeople: (value: number) => void; onMode: (value: Mode) => void; onDone: () => void }) {
  return <section className="screen settings-screen"><span className="kicker">PERSONAL RULES</span><h1>你的生活規則</h1><p>調整後會立即影響排序與建議。</p><div className="setting-group"><div className="setting-label"><span>單次預算</span><strong>NT${budget}</strong></div><Slider value={[budget]} min={0} max={1000} step={50} onValueChange={(value) => onBudget(Array.isArray(value) ? value[0] : value)} /></div><div className="setting-group"><div className="setting-label"><span>一起的人數</span><strong>{people} 人</strong></div><div className="stepper"><button onClick={() => onPeople(Math.max(1, people - 1))} aria-label="減少人數"><Minus /></button><span>{people}</span><button onClick={() => onPeople(Math.min(10, people + 1))} aria-label="增加人數"><Plus /></button></div></div><div className="setting-group"><span className="setting-title">預設生活模式</span><div className="setting-modes">{(Object.keys(modes) as Mode[]).map((item) => <button key={item} className={mode === item ? 'active' : ''} onClick={() => onMode(item)}>{modes[item].short}</button>)}</div></div><div className="setting-group"><span className="setting-title">飲食排除</span><div className="preference-chips"><button className="active">不吃牛 <X /></button><button>不吃辣</button><button>素食</button><button>＋ 新增</button></div></div><div className="setting-group setting-link"><Bell /><span><b>到期提醒</b><small>收藏項目即將截止時提醒我</small></span><button className="toggle active" aria-label="切換到期提醒"><i /></button></div><button className="primary-action" onClick={onDone}>儲存並返回<Check /></button></section>;
}

function MapScreen({ item, onOpen }: { item: Result; onOpen: () => void }) {
  return <section className="screen map-screen"><iframe title="圓山地圖" src={`https://www.google.com/maps?q=${encodeURIComponent(item.mapQuery)}&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /><div className="map-card glass"><span className="map-pin"><MapPin /></span><div><span className="kicker">目的地</span><h2>{item.title}</h2><p>{item.meta}</p></div><button onClick={onOpen}><ChevronRight /></button></div><a className="maps-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.mapQuery)}`} target="_blank" rel="noreferrer">用 Google Maps 開啟<ExternalLink /></a></section>;
}

function BottomNav({ view, onNavigate, savedCount }: { view: View; onNavigate: (view: View) => void; savedCount: number }) {
  const items: Array<{ id: View; label: string; icon: ReactNode }> = [{ id: 'home', label: '首頁', icon: <Home /> }, { id: 'results', label: '探索', icon: <Compass /> }, { id: 'saved', label: '清單', icon: <Bookmark /> }, { id: 'team', label: '揪團', icon: <Users /> }];
  return <nav className="bottom-nav glass">{items.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => onNavigate(item.id)}>{item.icon}<span>{item.label}</span>{item.id === 'saved' && savedCount > 0 && <i>{savedCount}</i>}</button>)}</nav>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
