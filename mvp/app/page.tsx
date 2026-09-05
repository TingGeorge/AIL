'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Crosshair,
  ExternalLink,
  Heart,
  Home as HomeIcon,
  Map,
  MapPin,
  Mic,
  Minus,
  PackageCheck,
  Plus,
  Radar,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
  WalletCards,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BASE_WEIGHTS, calculateCpScore, type CpDimension } from '@/lib/cp-engine';

type Status = 'idle' | 'scanning' | 'done';
type SurvivalMode = '省錢晚餐' | 'Team 團購' | '白嫖一天';
type MobileView = 'mission' | 'agents' | 'results' | 'map';

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type Result = {
  id: string;
  category: string;
  title: string;
  provider: string;
  cost: number;
  unit: string;
  meta: string;
  condition: string;
  save?: number;
  verified: boolean;
  evidence: string;
  url?: string;
  source: string;
  mapQuery: string;
  reliability: number;
  dimensions: Partial<Record<CpDimension, number>>;
};

const categories = ['食品', '免費／公益', '活動', '交通'];

const baseResults: Result[] = [
  {
    id: 'food-1',
    category: '食品',
    title: '雙人晚餐組合 A',
    provider: '介面 Fixture',
    cost: 198,
    unit: 'NT$99／人',
    meta: '2 人 · 可外帶 · 圓山生活圈',
    condition: '距離與庫存待串接',
    save: 102,
    verified: false,
    evidence: 'UX 測試資料；Demo 前必須以可讀的商家來源與價格證據取代。',
    source: 'DEMO FIXTURE · 未查核',
    mapQuery: '捷運圓山站',
    reliability: 58,
    dimensions: { price: 88, food: 82, quality: 62, convenience: 76, discount: 58 },
  },
  {
    id: 'food-2',
    category: '食品',
    title: '5 人便當團購 85 折',
    provider: '圓山 Team Demo',
    cost: 425,
    unit: '成團後 NT$85／人',
    meta: '3 / 5 已承諾 · 19:00 截止',
    condition: '未達門檻前不套用團購價',
    save: 75,
    verified: false,
    evidence: '用於驗證 Team Mode 的成團、承諾與來源查核流程；正式資料需補電話確認紀錄。',
    source: 'Community Report · 待驗證',
    mapQuery: '捷運圓山站',
    reliability: 72,
    dimensions: { price: 90, food: 88, quality: 72, convenience: 80, discount: 94 },
  },
  {
    id: 'free-1',
    category: '免費／公益',
    title: '北美館 17:00 後入場',
    provider: '臺北市立美術館',
    cost: 0,
    unit: '直接費用 NT$0',
    meta: '週二至週日 · 17:00 後',
    condition: '特展另依公告',
    verified: true,
    evidence: '官方票價頁說明開放時間 17:00 後免費參觀；特殊展覽依現場公告。',
    source: '官方來源 · 2026/09/04 查核',
    url: 'https://www.tfam.museum/Common/editor.aspx?ddlLang=zh-tw&id=230',
    mapQuery: '臺北市立美術館',
    reliability: 96,
    dimensions: { price: 100, food: 62, quality: 88, convenience: 82, discount: 100 },
  },
  {
    id: 'free-2',
    category: '免費／公益',
    title: '典藏植物園假日導覽',
    provider: '臺北典藏植物園',
    cost: 0,
    unit: '直接費用 NT$0',
    meta: '週六、日 · 定時導覽',
    condition: '以現場最新公告為準',
    verified: true,
    evidence: '臺北市政府公告列出週末免費定時導覽。場次可能變動，出發前需回原始頁確認。',
    source: '公開資料 · 來源快照',
    url: 'https://english.udd.gov.taipei/News_Content.aspx?n=DD9CEC17A97FBC64&s=40E52F644FD67A6C&sms=72544237BBE4C5F6',
    mapQuery: '臺北典藏植物園',
    reliability: 88,
    dimensions: { price: 100, food: 58, quality: 82, convenience: 78, discount: 100 },
  },
  {
    id: 'event-1',
    category: '活動',
    title: '北美館常設參觀',
    provider: '臺北市立美術館',
    cost: 30,
    unit: '普通票 NT$30／人',
    meta: '週二至週日 09:30-17:30',
    condition: '週六延長至 20:30',
    verified: true,
    evidence: '官方時間票價頁列明普通票 NT$30；特展可能另有規定。',
    source: '官方來源 · 2026/09/04 查核',
    url: 'https://www.tfam.museum/Common/editor.aspx?ddlLang=zh-tw&id=230',
    mapQuery: '臺北市立美術館',
    reliability: 97,
    dimensions: { price: 96, food: 55, quality: 89, convenience: 82, discount: 76 },
  },
  {
    id: 'transport-1',
    category: '交通',
    title: '步行模式',
    provider: '零元移動策略',
    cost: 0,
    unit: '直接費用 NT$0',
    meta: '20 分鐘上限',
    condition: 'MVP 不產生導航路線',
    verified: false,
    evidence: '使用者偏好選項；MVP 不提供導航，也不估算未經來源證明的距離。',
    source: '使用者條件',
    mapQuery: '捷運圓山站',
    reliability: 64,
    dimensions: { price: 100, food: 20, quality: 60, convenience: 74, discount: 80 },
  },
];

const routeCopy: Record<SurvivalMode, { label: string; need: string; description: string }> = {
  省錢晚餐: {
    label: '晚餐',
    need: '今天晚餐，2 人，圓山站 2 公里內，可外帶，不吃牛。',
    description: '找低價但可信的餐食，保留份量與距離。',
  },
  'Team 團購': {
    label: '團購',
    need: '今晚 5 人以內想湊團購，圓山附近，可以接受 19:00 前確認。',
    description: '看成團門檻、承諾人數與優惠是否真的可用。',
  },
  白嫖一天: {
    label: '白嫖',
    need: '今天想用接近 0 元安排圓山附近活動，但交通和時間也要算進去。',
    description: '直接費用為 0，但不能忽略時間、資格和交通。',
  },
};

const routeWeights: Record<SurvivalMode, Record<CpDimension, number>> = {
  省錢晚餐: BASE_WEIGHTS,
  'Team 團購': { price: 0.24, food: 0.18, quality: 0.16, convenience: 0.12, discount: 0.3 },
  白嫖一天: { price: 0.44, food: 0.08, quality: 0.18, convenience: 0.18, discount: 0.12 },
};

const money = (value: number) => new Intl.NumberFormat('zh-TW').format(value);

function scoreResult(item: Result, mode: SurvivalMode) {
  return calculateCpScore({
    dimensions: item.dimensions,
    reliability: item.reliability,
    weights: routeWeights[mode],
    requiredEvidence: item.verified || item.source !== 'DEMO FIXTURE · 未查核',
    hardConstraintsPassed: true,
  });
}

export default function Home() {
  const [budget, setBudget] = useState(300);
  const [people, setPeople] = useState(2);
  const [need, setNeed] = useState(routeCopy.省錢晚餐.need);
  const [monthlyBudget, setMonthlyBudget] = useState(10000);
  const [reserve, setReserve] = useState(2000);
  const [daysLeft, setDaysLeft] = useState(23);
  const [mode, setMode] = useState<SurvivalMode>('省錢晚餐');
  const [mobileView, setMobileView] = useState<MobileView>('mission');
  const [hardRules, setHardRules] = useState<string[]>(['不吃牛']);
  const [softPrefs, setSoftPrefs] = useState<string[]>(['可外帶', '願意分裝']);
  const [listening, setListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState('按下麥克風後直接說；內容仍可手動修改。');
  const [paidStatus, setPaidStatus] = useState<Status>('idle');
  const [freeStatus, setFreeStatus] = useState<Status>('idle');
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<Result | null>(baseResults[0]);
  const [saved, setSaved] = useState<string[]>([]);

  const spendable = Math.max(0, monthlyBudget - reserve);
  const dailyBudget = Math.floor(spendable / Math.max(1, daysLeft));
  const runwayPercent = Math.min(100, Math.round((reserve / Math.max(1, monthlyBudget)) * 100));
  const searching = paidStatus === 'scanning' || freeStatus === 'scanning';
  const constraintSummary = useMemo(
    () => `${mode} · ${people} 人 · 單次 NT$${budget} · 每日 NT$${dailyBudget}`,
    [mode, people, budget, dailyBudget],
  );
  const scoredResults = useMemo(
    () =>
      baseResults
        .filter((item) => {
          if (mode === 'Team 團購') return item.id === 'food-2' || item.category === '食品';
          if (mode === '白嫖一天') return item.cost === 0;
          return item.category !== '交通' || softPrefs.includes('可步行');
        })
        .map((item) => ({ item, score: scoreResult(item, mode) }))
        .sort((a, b) => (b.score.score ?? 0) - (a.score.score ?? 0)),
    [mode, softPrefs],
  );
  const completedCount = scoredResults.filter(({ score }) => score.eligible).length;
  const selectedForMap = selected ?? scoredResults[0]?.item ?? baseResults[0];

  function chooseRoute(next: SurvivalMode) {
    setMode(next);
    setNeed(routeCopy[next].need);
    setMobileView('mission');
    if (next === 'Team 團購') setPeople(5);
    if (next === '白嫖一天') setBudget(0);
    if (next === '省錢晚餐') {
      setPeople(2);
      setBudget(300);
    }
  }

  function showView(next: MobileView) {
    setMobileView(next);
    const target = document.getElementById(next);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function toggleRule(value: string, kind: 'hard' | 'soft') {
    const update = kind === 'hard' ? setHardRules : setSoftPrefs;
    update((items) =>
      items.includes(value) ? items.filter((item) => item !== value) : [...items, value],
    );
  }

  function startVoiceInput() {
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceMessage('這個瀏覽器不支援語音辨識，請改用文字輸入。');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'zh-TW';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      setNeed(event.results[0][0].transcript.slice(0, 160));
      setVoiceMessage('已轉成文字。送出前可以繼續修改。');
    };
    recognition.onerror = () => setVoiceMessage('沒有收到語音，請再試一次或改用文字。');
    recognition.onend = () => setListening(false);
    setListening(true);
    setVoiceMessage('正在聽…說出需求、預算、份量與距離。');
    recognition.start();
  }

  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool?: (
            tool: unknown,
            options?: { signal?: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: 'configure_survival_mission',
            title: '設定生存任務',
            description: '設定預算、人數與需求，並同步更新 ALL in Life 畫面中的任務 HUD。',
            inputSchema: {
              type: 'object',
              properties: {
                budget: { type: 'number', minimum: 0, maximum: 600 },
                people: { type: 'integer', minimum: 1, maximum: 8 },
                need: { type: 'string', minLength: 1, maxLength: 120 },
              },
              required: ['budget', 'people', 'need'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute(input: unknown) {
              const value = input as { budget?: number; people?: number; need?: string };
              if (
                typeof value.budget !== 'number' ||
                value.budget < 0 ||
                value.budget > 600 ||
                !Number.isInteger(value.people) ||
                !value.people ||
                value.people < 1 ||
                value.people > 8 ||
                typeof value.need !== 'string' ||
                !value.need.trim()
              )
                throw new Error('請提供 budget 0-600、people 1-8，以及非空白 need。');
              setBudget(value.budget);
              setPeople(value.people);
              setNeed(value.need.slice(0, 120));
              return { budget: value.budget, people: value.people, need: value.need.slice(0, 120), area: '圓山區' };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => undefined);
    } catch {
      /* WebMCP stays optional in unsupported browsers. */
    }
    return () => lifecycle.abort();
  }, []);

  function runSearch() {
    setSearched(true);
    setPaidStatus('scanning');
    setFreeStatus('scanning');
    window.setTimeout(() => setFreeStatus('done'), 650);
    window.setTimeout(() => setPaidStatus('done'), 1050);
    window.setTimeout(() => showView('results'), 1100);
  }

  function toggleSaved(id: string) {
    setSaved((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-background pb-20 text-foreground md:pb-0">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/20 bg-black/95 px-4 md:px-8">
        <a href="#top" className="flex items-center gap-3" aria-label="ALL in Life 回到頁首">
          <span className="grid size-9 place-items-center border border-primary bg-primary font-black text-black">A/</span>
          <strong className="text-lg uppercase tracking-[-.05em]">ALL in Life</strong>
        </a>
        <nav className="hidden items-center gap-8 font-mono text-[11px] uppercase tracking-[.14em] md:flex" aria-label="主要導覽">
          <a href="#mission" className="hover:text-primary">設定戰局</a>
          <a href="#agents" className="hover:text-primary">雙 Agent</a>
          <a href="#results" className="hover:text-primary">生存清單</a>
          <a href="#map" className="hover:text-primary">圓山地圖</a>
        </nav>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase text-primary">
          <MapPin className="size-3" />
          圓山區 · Guest
        </div>
      </header>
      <MobileViewHeader
        active={mobileView}
        mode={mode}
        budget={budget}
        count={completedCount}
        listening={listening}
      />

      <section id="top" className="editorial-grid mx-auto grid max-w-[1600px] scroll-mt-16 border-x border-white/15 lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[minmax(320px,.72fr)_minmax(600px,1.28fr)]">
        <div className={`${mobileView === 'mission' ? 'block' : 'hidden'} border-b border-white/15 p-5 md:block lg:border-b-0 lg:border-r lg:p-8`}>
          <div className="mb-8 flex items-center justify-between font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">
            <span>Life OS / 01</span>
            <span>Sep. 2026</span>
          </div>
          <h1 className="text-[5.5rem] font-black uppercase leading-[.72] tracking-[-.1em] sm:text-[7rem] lg:text-[clamp(4.7rem,10vw,9.5rem)]">
            ALL<br />
            <span className="text-primary">IN.</span>
          </h1>
          <p className="mt-7 max-w-sm text-xl font-semibold leading-tight md:text-2xl">
            人生如戲。<br />錢都 All in，生活不能出局。
          </p>
          <div className="mt-8 grid gap-2">
            {Object.entries(routeCopy).map(([key, value]) => (
              <button
                key={key}
                onClick={() => chooseRoute(key as SurvivalMode)}
                className={`border p-4 text-left transition ${mode === key ? 'border-primary bg-primary text-black' : 'border-white/20 bg-black/30 hover:border-primary'}`}
              >
                <span className="font-mono text-[10px] uppercase tracking-[.16em]">{value.label}</span>
                <strong className="mt-1 block text-xl">{key}</strong>
                <span className={`mt-1 block text-sm ${mode === key ? 'text-black/65' : 'text-white/55'}`}>{value.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div id="mission" className={`${mobileView === 'mission' ? 'block' : 'hidden'} scroll-mt-20 md:block`}>
          <div className="grid border-b border-white/15 sm:grid-cols-4">
            <BudgetField label="本月總預算" prefix="NT$" value={monthlyBudget} min={1000} step={500} onChange={setMonthlyBudget} />
            <BudgetField label="不可動安全墊" prefix="NT$" value={reserve} min={0} step={500} onChange={setReserve} />
            <BudgetField label="剩餘天數" suffix="DAYS" value={daysLeft} min={1} max={31} onChange={setDaysLeft} />
            <div className="flex min-h-28 flex-col justify-between border-t border-white/15 p-4 sm:border-l sm:border-t-0 md:p-5">
              <span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">每日可用額度</span>
              <strong className="text-3xl font-black text-primary">${money(dailyBudget)}</strong>
              <span className="font-mono text-[10px] text-white/45">可動用 ${money(spendable)} · 安全墊 {runwayPercent}%</span>
            </div>
          </div>

          <div className="grid lg:grid-cols-[1.08fr_.92fr]">
            <div className="border-b border-white/15 p-5 lg:border-b-0 lg:border-r lg:p-7">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[.18em] text-primary">Main quest</p>
                  <h2 className="mt-1 text-3xl font-black tracking-[-.05em]">這一局，要怎麼活？</h2>
                </div>
                <Crosshair className="size-7 text-primary" />
              </div>
              <Tabs defaultValue="quick">
                <TabsList className="mb-5 grid h-11 w-full grid-cols-2 rounded-none border border-white/20 bg-transparent p-0">
                  <TabsTrigger value="quick" className="rounded-none font-mono text-xs data-active:bg-white data-active:text-black">快速填寫</TabsTrigger>
                  <TabsTrigger value="direct" className="rounded-none font-mono text-xs data-active:bg-white data-active:text-black">直接說</TabsTrigger>
                </TabsList>
                <TabsContent value="quick" className="space-y-5">
                  <label htmlFor="need" className="block">
                    <span className="mb-2 block font-mono text-[10px] uppercase tracking-[.15em] text-muted-foreground">需求 / 份量 / 距離</span>
                    <textarea id="need" value={need} maxLength={160} onChange={(event) => setNeed(event.target.value)} className="min-h-24 w-full resize-none border border-white/20 bg-transparent p-3 text-base outline-none focus:border-primary" />
                  </label>
                </TabsContent>
                <TabsContent value="direct" className="space-y-4">
                  <textarea aria-label="自然語言需求" value={need} maxLength={160} onChange={(event) => setNeed(event.target.value)} placeholder="例如：我這個月只剩一萬，不吃牛，兩個人今晚想吃飽…" className="min-h-28 w-full resize-none border border-white/20 bg-transparent p-3 text-base outline-none focus:border-primary" />
                  <button type="button" onClick={startVoiceInput} disabled={listening} className="flex w-full items-center justify-between border border-primary px-4 py-3 text-left text-sm font-bold text-primary hover:bg-primary hover:text-black disabled:opacity-60">
                    <span className="flex items-center gap-2"><Mic className={`size-4 ${listening ? 'animate-pulse' : ''}`} />{listening ? '正在聽…' : '用語音說需求'}</span>
                    <span className="font-mono text-[10px]">ZH-TW</span>
                  </button>
                  <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">{voiceMessage}</p>
                </TabsContent>
              </Tabs>
              <div className="mt-5">
                <div className="mb-3 flex items-end justify-between">
                  <label htmlFor="budget" className="font-mono text-[10px] uppercase tracking-[.15em] text-muted-foreground">這次最多燒多少</label>
                  <strong className="text-3xl text-primary">${budget}</strong>
                </div>
                <Slider id="budget" value={[budget]} onValueChange={(value) => setBudget(typeof value === 'number' ? value : value[0] ?? 300)} min={0} max={600} step={10} aria-label="單次預算" className="[&_[data-slot=slider-range]]:bg-primary [&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-thumb]]:rounded-none [&_[data-slot=slider-thumb]]:border-primary" />
              </div>
            </div>

            <div className="flex flex-col p-5 lg:p-7">
              <p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Survival preset</p>
              <div className="mt-3 grid grid-cols-3 gap-px bg-white/20">
                {Object.keys(routeCopy).map((item) => (
                  <button key={item} onClick={() => chooseRoute(item as SurvivalMode)} className={`min-h-20 p-3 text-left transition ${mode === item ? 'bg-secondary text-white' : 'bg-black text-white/55 hover:text-white'}`}>
                    <span className="block font-black">{routeCopy[item as SurvivalMode].label}</span>
                    <span className="mt-1 block text-[11px] opacity-70">{item}</span>
                  </button>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between border-y border-white/15 py-3">
                <span className="flex items-center gap-2 text-sm"><Users className="size-4 text-primary" />玩家人數</span>
                <div className="flex items-center gap-3">
                  <button className="grid size-8 place-items-center border border-white/20 hover:border-primary" onClick={() => setPeople(Math.max(1, people - 1))} aria-label="減少一人"><Minus className="size-4" /></button>
                  <strong>{people}</strong>
                  <button className="grid size-8 place-items-center border border-white/20 hover:border-primary" onClick={() => setPeople(Math.min(8, people + 1))} aria-label="增加一人"><Plus className="size-4" /></button>
                </div>
              </div>
              <PreferenceGroup label="絕對排除" values={['不吃牛', '不吃豬', '全素', '花生過敏']} active={hardRules} onToggle={(value) => toggleRule(value, 'hard')} danger />
              <PreferenceGroup label="可以配合" values={['可外帶', '願意等待', '願意分裝', '可步行']} active={softPrefs} onToggle={(value) => toggleRule(value, 'soft')} />
              <Button onClick={runSearch} disabled={searching} className="mt-6 h-14 w-full rounded-none bg-primary text-base font-black uppercase tracking-widest text-black hover:bg-primary/85 lg:mt-auto">
                <Sparkles />
                {searching ? '搜尋中…' : searched ? '重新梭哈' : '開始梭哈'}
                <ArrowUpRight />
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className={`${mobileView === 'mission' ? 'block' : 'hidden'} border-y border-black bg-[#f3f1e9] px-4 py-5 text-black md:block md:px-8`}>
        <div className="mx-auto grid max-w-[1536px] gap-4 lg:grid-cols-[180px_1fr_auto] lg:items-center">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.16em]">
            <WalletCards className="size-4" />
            目前理解
          </div>
          <p className="text-sm font-semibold md:text-base">
            {need} <span className="text-black/45">／ {constraintSummary} ／ 偏好：{softPrefs.join('、') || '無'}</span>
          </p>
          <button className="font-mono text-[10px] uppercase underline underline-offset-4" onClick={() => showView('mission')}>返回修改</button>
        </div>
      </section>

      <section id="agents" className={`${mobileView === 'agents' ? 'block' : 'hidden'} scroll-mt-16 border-y border-border bg-[#101610] px-4 py-8 md:block md:px-8`}>
        <div className="mx-auto max-w-[1436px]">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase text-primary">02 / AGENT RUN</p>
              <h2 className="text-3xl font-black uppercase tracking-tight md:text-5xl">雙線搜刮中.</h2>
            </div>
            <p className="font-mono text-xs text-muted-foreground">{constraintSummary}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <AgentPanel type="PAID / 付費選項" status={paidStatus} count="26 候選 → 8 通過" icon={<CircleDollarSign />} />
            <AgentPanel type="FREE / 免費資源" status={freeStatus} count="14 候選 → 7 通過" icon={<Radar />} accent />
          </div>
          {!searched && <p className="mt-4 font-mono text-xs text-muted-foreground">等待任務開始。兩個 Agent 會同時啟動，互不阻塞。</p>}
        </div>
      </section>

      <section id="results" className={`${mobileView === 'results' ? 'block' : 'hidden'} mx-auto max-w-[1500px] scroll-mt-20 px-4 py-12 md:block md:px-8 md:py-20`}>
        <div className="mb-7 grid gap-4 border-b border-border pb-7 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="font-mono text-xs uppercase text-primary">03 / LOOT TABLE</p>
            <h2 className="text-4xl font-black uppercase tracking-tight md:text-7xl">活命戰利品.</h2>
          </div>
          <div className="max-w-md border-l-4 border-[#ffcc40] bg-[#ffcc40]/10 p-3 text-sm text-muted-foreground">
            <TriangleAlert className="mr-2 inline size-4 text-[#ffcc40]" />
            Fixture 只測介面；正式推薦必須補來源、有效期與查核狀態。
          </div>
        </div>
        <Tabs defaultValue={categories[0]}>
          <TabsList variant="line" className="mb-8 flex h-auto w-full justify-start gap-0 overflow-x-auto border-b border-border p-0">
            {categories.map((category, index) => (
              <TabsTrigger key={category} value={category} className="h-12 flex-none rounded-none border-r border-border px-4 font-mono text-xs data-active:bg-primary data-active:text-primary-foreground md:px-6">
                <span className="text-[10px] opacity-60">0{index + 1}</span>
                {category}
              </TabsTrigger>
            ))}
          </TabsList>
          {categories.map((category) => {
            const items = scoredResults.filter(({ item }) => item.category === category);
            return (
              <TabsContent key={category} value={category}>
                <div className="mb-4 flex items-center justify-between font-mono text-xs text-muted-foreground">
                  <span>{items.length} 筆通過目前模式</span>
                  <span>Personal CP：高 → 低</span>
                </div>
                <div className="grid gap-3 lg:grid-cols-3">
                  {items.map(({ item, score }, index) => (
                    <ResultCard
                      key={item.id}
                      item={item}
                      index={index}
                      score={score.score}
                      saved={saved.includes(item.id)}
                      onSave={() => toggleSaved(item.id)}
                      onOpen={() => setSelected(item)}
                      onMap={() => {
                        setSelected(item);
                        showView('map');
                      }}
                    />
                  ))}
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </section>

      <section id="map" className={`${mobileView === 'map' ? 'block' : 'hidden'} border-y border-black bg-[#f3f1e9] text-black md:block`}>
        <div className="mx-auto grid max-w-[1500px] md:grid-cols-[420px_1fr]">
          <div className="border-b border-black/15 p-5 md:border-b-0 md:border-r md:p-7">
            <p className="font-mono text-xs uppercase text-black/45">04 / YUANSHAN MAP</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">{selectedForMap.title}</h2>
            <p className="mt-2 text-sm text-black/58">{selectedForMap.provider} · {selectedForMap.meta}</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <MapStat label="成本" value={`NT$${money(selectedForMap.cost)}`} />
              <MapStat label="可信" value={`${selectedForMap.reliability}%`} />
            </div>
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedForMap.mapQuery)}`} target="_blank" rel="noreferrer" className="mt-5 flex h-12 items-center justify-center gap-2 border border-black bg-black font-bold text-white">
              Google Maps 開啟 <ExternalLink className="size-4" />
            </a>
          </div>
          <iframe
            title="圓山 Google 地圖"
            src={`https://www.google.com/maps?q=${encodeURIComponent(selectedForMap.mapQuery)}&output=embed`}
            className="h-[460px] w-full border-0 md:h-[620px]"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </section>

      <section className="border-y border-primary/25 bg-primary px-4 py-10 text-primary-foreground md:px-8">
        <div className="mx-auto flex max-w-[1436px] flex-col justify-between gap-8 md:flex-row md:items-center">
          <div>
            <p className="font-mono text-xs uppercase">End of round</p>
            <h2 className="mt-2 text-4xl font-black tracking-[-.06em] md:text-7xl">活著，才有下一局。</h2>
          </div>
          <div className="grid grid-cols-2 gap-px bg-primary-foreground/30">
            <div className="bg-primary px-6 py-3"><span className="block text-xs opacity-65">本局最低</span><b className="text-3xl">NT$0</b></div>
            <div className="bg-primary px-6 py-3"><span className="block text-xs opacity-65">收藏</span><b className="text-3xl">{saved.length}</b></div>
          </div>
        </div>
      </section>

      <footer className="flex flex-col justify-between gap-4 px-4 py-8 font-mono text-xs text-muted-foreground md:flex-row md:px-8">
        <span>ALL in Life / 圓山區 Hackathon MVP</span>
        <span>React · TypeScript · Vinext · Tailwind · CP Engine</span>
      </footer>

      {listening && <VoiceHud message={voiceMessage} />}
      <MobileDock active={mobileView} onChange={showView} onVoice={startVoiceInput} listening={listening} />
      <EvidenceDialog selected={selected} score={selected ? scoreResult(selected, mode).score : null} onClose={() => setSelected(null)} />
    </main>
  );
}

function MobileDock({
  active,
  listening,
  onChange,
  onVoice,
}: {
  active: MobileView;
  listening: boolean;
  onChange: (view: MobileView) => void;
  onVoice: () => void;
}) {
  const items: { id: MobileView; label: string; icon: typeof HomeIcon }[] = [
    { id: 'mission', label: '任務', icon: HomeIcon },
    { id: 'agents', label: 'Agent', icon: Radar },
    { id: 'results', label: '清單', icon: ReceiptText },
    { id: 'map', label: '地圖', icon: Map },
  ];
  return (
    <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-[1fr_56px] gap-2 md:hidden" aria-label="手機底部導覽">
      <div className="grid grid-cols-4 border border-white/20 bg-black/92 backdrop-blur">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} onClick={() => onChange(item.id)} className={`flex h-14 flex-col items-center justify-center gap-1 text-[11px] ${active === item.id ? 'bg-primary text-black' : 'text-white/58'}`}>
              <Icon className="size-4" />
              {item.label}
            </button>
          );
        })}
      </div>
      <button onClick={onVoice} className="grid h-14 place-items-center border border-primary bg-primary text-black" aria-label="語音輸入">
        <Mic className={`size-5 ${listening ? 'animate-pulse' : ''}`} />
      </button>
    </nav>
  );
}

function MobileViewHeader({
  active,
  mode,
  budget,
  count,
  listening,
}: {
  active: MobileView;
  mode: SurvivalMode;
  budget: number;
  count: number;
  listening: boolean;
}) {
  const titles: Record<MobileView, string> = {
    mission: '任務設定',
    agents: '雙 Agent',
    results: '推薦清單',
    map: '圓山地圖',
  };
  return (
    <div className="sticky top-16 z-30 border-b border-white/12 bg-[#0d100c]/95 px-4 py-3 backdrop-blur md:hidden">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.16em] text-primary">
            {titles[active]}
          </p>
          <h2 className="mt-0.5 text-xl font-black tracking-tight">{mode}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="border border-white/15 px-2 py-1 font-mono text-[10px] text-white/65">
            NT${budget}
          </span>
          <span className="border border-primary/45 bg-primary/10 px-2 py-1 font-mono text-[10px] text-primary">
            {count} 筆
          </span>
          {listening && (
            <span className="size-2 animate-pulse rounded-full bg-primary" aria-label="正在錄音" />
          )}
        </div>
      </div>
    </div>
  );
}

function VoiceHud({ message }: { message: string }) {
  return (
    <div className="fixed inset-x-5 bottom-24 z-50 border border-primary bg-black/92 p-4 text-primary shadow-[0_18px_60px_rgb(0_0_0/.45)] backdrop-blur md:hidden">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center border border-primary bg-primary text-black">
          <Mic className="size-5 animate-pulse" />
        </span>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.16em]">Listening</p>
          <p className="mt-1 text-sm text-white/72">{message}</p>
        </div>
      </div>
    </div>
  );
}

function AgentPanel({ type, status, count, icon, accent = false }: { type: string; status: Status; count: string; icon: ReactNode; accent?: boolean }) {
  const value = status === 'idle' ? 0 : status === 'scanning' ? 58 : 100;
  return (
    <div className={`relative overflow-hidden border p-5 ${accent ? 'border-secondary/65 bg-secondary/10' : 'border-primary/40 bg-primary/5'}`}>
      {status === 'scanning' && <div className="scanline pointer-events-none absolute inset-0 overflow-hidden" />}
      <div className="mb-6 flex items-center justify-between">
        <span className={accent ? 'text-secondary-foreground' : 'text-primary'}>{icon}</span>
        <span className="font-mono text-xs uppercase">{status === 'idle' ? 'STANDBY' : status === 'scanning' ? 'SCANNING' : 'COMPLETE'} {status === 'done' && <Check className="ml-1 inline size-3" />}</span>
      </div>
      <h3 className="text-xl font-black">{type}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{status === 'idle' ? '等待限制條件' : status === 'scanning' ? '搜尋來源 → 正規化 → 證據閘門' : count}</p>
      <Progress value={value} className={`mt-5 [&_[data-slot=progress-track]]:rounded-none [&_[data-slot=progress-track]]:bg-white/10 ${accent ? '[&_[data-slot=progress-indicator]]:bg-secondary' : '[&_[data-slot=progress-indicator]]:bg-primary'}`} />
    </div>
  );
}

function BudgetField({ label, value, onChange, prefix, suffix, min, max, step = 1 }: { label: string; value: number; onChange: (value: number) => void; prefix?: string; suffix?: string; min: number; max?: number; step?: number }) {
  return (
    <label className="flex min-h-28 flex-col justify-between border-t border-white/15 p-4 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0 md:p-5">
      <span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">{label}</span>
      <span className="flex items-end gap-2">
        <span className="pb-1 font-mono text-[10px] text-white/45">{prefix}</span>
        <input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Math.max(min, Number(event.target.value) || min))} className="min-w-0 flex-1 border-0 border-b border-white/20 bg-transparent p-0 pb-1 text-3xl font-black outline-none focus:border-primary" />
        <span className="pb-1 font-mono text-[10px] text-white/45">{suffix}</span>
      </span>
    </label>
  );
}

function PreferenceGroup({ label, values, active, onToggle, danger = false }: { label: string; values: string[]; active: string[]; onToggle: (value: string) => void; danger?: boolean }) {
  return (
    <div className="mt-5">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[.15em] text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => {
          const selected = active.includes(value);
          return (
            <button key={value} type="button" onClick={() => onToggle(value)} className={`flex items-center gap-1 border px-2.5 py-1.5 text-xs transition ${selected ? danger ? 'border-[#ffcc40] bg-[#ffcc40] text-black' : 'border-primary bg-primary text-black' : 'border-white/20 text-white/60 hover:border-white/50 hover:text-white'}`}>
              {selected && (danger ? <X className="size-3" /> : <Check className="size-3" />)}
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ResultCard({ item, index, score, saved, onSave, onOpen, onMap }: { item: Result; index: number; score: number | null; saved: boolean; onSave: () => void; onOpen: () => void; onMap: () => void }) {
  return (
    <article className="group relative flex min-h-64 flex-col border border-border bg-card transition hover:-translate-y-1 hover:border-primary hover:shadow-[6px_6px_0_#c9ff36] md:min-h-80">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 font-mono text-xs md:py-3">
        <span>RANK 0{index + 1}</span>
        <span className={`flex items-center gap-1 ${item.verified ? 'text-primary' : 'text-[#ffcc40]'}`}>{item.verified ? <ShieldCheck className="size-3" /> : <TriangleAlert className="size-3" />}{item.verified ? '已驗證' : '待查核'}</span>
      </div>
      <div className="flex flex-1 flex-col p-4 md:p-5">
        <p className="font-mono text-xs text-muted-foreground">{item.provider}</p>
        <h3 className="mt-2 text-xl font-black leading-tight md:text-2xl">{item.title}</h3>
        <div className="my-4 grid grid-cols-[1fr_auto] items-end gap-3 md:my-5">
          <div>
            <span className="mr-1 text-sm text-muted-foreground">NT$</span>
            <b className="text-4xl tracking-[-.06em] text-primary md:text-5xl">{money(item.cost)}</b>
            <span className="ml-2 text-xs text-muted-foreground">{item.unit}</span>
          </div>
          <div className="text-right">
            <span className="block text-xs text-muted-foreground">CP</span>
            <b className="text-3xl text-secondary-foreground">{score ?? '--'}</b>
          </div>
        </div>
        <div className="space-y-2 border-t border-border pt-3 text-sm text-muted-foreground md:pt-4">
          <p className="flex gap-2"><Clock3 className="mt-0.5 size-4 shrink-0" />{item.meta}</p>
          <p className="flex gap-2"><Zap className="mt-0.5 size-4 shrink-0" />{item.condition}</p>
        </div>
        {item.save !== undefined && <p className="mt-4 font-mono text-xs text-primary">VS. NT$300 基準，省 NT${item.save}</p>}
      </div>
      <div className="grid grid-cols-[1fr_48px_48px] border-t border-border">
        <button onClick={onOpen} className="flex h-12 items-center justify-between px-4 text-left text-sm font-bold hover:bg-primary hover:text-primary-foreground">查看證據 <ChevronRight className="size-4" /></button>
        <button onClick={onMap} className="grid place-items-center border-l border-border hover:text-primary" aria-label="查看地圖"><MapPin className="size-4" /></button>
        <button onClick={onSave} className={`grid place-items-center border-l border-border hover:text-primary ${saved ? 'bg-primary text-primary-foreground' : ''}`} aria-label={saved ? '取消收藏' : '收藏'}><Heart className={`size-4 ${saved ? 'fill-current' : ''}`} /></button>
      </div>
    </article>
  );
}

function MapStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-black/12 bg-white/55 p-4">
      <span className="block text-xs text-black/45">{label}</span>
      <b className="mt-1 block text-2xl">{value}</b>
    </div>
  );
}

function EvidenceDialog({ selected, score, onClose }: { selected: Result | null; score: number | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bottom-0 left-0 top-auto max-h-[84vh] max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-t-2xl border border-primary/50 bg-[#111711] p-0 sm:left-1/2 sm:top-1/2 sm:max-h-[90vh] sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-none">
        {selected && (
          <>
            <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-white/28 sm:hidden" />
            <div className="bg-primary px-5 py-2 font-mono text-xs font-bold text-primary-foreground">EVIDENCE FILE / {selected.id.toUpperCase()}</div>
            <div className="p-6">
              <DialogHeader>
                <p className="font-mono text-xs uppercase text-primary">{selected.category} · {selected.provider}</p>
                <DialogTitle className="text-3xl font-black tracking-tight">{selected.title}</DialogTitle>
                <DialogDescription>{selected.condition}</DialogDescription>
              </DialogHeader>
              <div className="mt-6 grid grid-cols-3 gap-px border border-border bg-border">
                <div className="bg-card p-4"><span className="block text-xs text-muted-foreground">總成本</span><b className="text-2xl text-primary">NT${money(selected.cost)}</b></div>
                <div className="bg-card p-4"><span className="block text-xs text-muted-foreground">CP Score</span><b className="text-2xl">{score ?? '--'}</b></div>
                <div className="bg-card p-4"><span className="block text-xs text-muted-foreground">可信度</span><b className="text-2xl">{selected.reliability}%</b></div>
              </div>
              <div className="mt-5 space-y-4">
                <div>
                  <p className="mb-2 flex items-center gap-2 font-mono text-xs text-muted-foreground"><ReceiptText className="size-4" />證據摘錄</p>
                  <blockquote className="border-l-2 border-primary bg-black/25 p-4 leading-relaxed">{selected.evidence}</blockquote>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <PackageCheck className={`size-4 ${selected.verified ? 'text-primary' : 'text-[#ffcc40]'}`} />
                  {selected.source}
                </div>
                <p className="text-xs text-muted-foreground">資料可能變動。執行前請回到原始提供者頁面確認；未知費用不會被視為零。</p>
              </div>
              {selected.url ? (
                <a href={selected.url} target="_blank" rel="noreferrer" className="mt-6 flex h-12 items-center justify-center gap-2 bg-primary font-bold text-primary-foreground">
                  查看官方來源 <ExternalLink className="size-4" />
                </a>
              ) : (
                <Button disabled className="mt-6 h-12 w-full rounded-none">等待真實來源串接</Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
