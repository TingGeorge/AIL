'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BadgePercent,
  Bell,
  BellRing,
  Bike,
  Bookmark,
  CalendarDays,
  Camera,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Compass,
  ExternalLink,
  Flag,
  Gamepad2,
  Heart,
  History,
  Home,
  LogIn,
  MapPin,
  Menu,
  Mic,
  Pencil,
  PackageCheck,
  QrCode,
  Radar,
  ReceiptText,
  Share2,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRound,
  Users,
  Utensils,
  WalletCards,
  Zap,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { type CpDimension } from '@/lib/cp-engine';

type View =
  | 'welcome'
  | 'onboarding'
  | 'home'
  | 'ready'
  | 'search'
  | 'results'
  | 'detail'
  | 'saved'
  | 'team'
  | 'settings'
  | 'profile'
  | 'filters'
  | 'notifications'
  | 'analytics'
  | 'history'
  | 'report'
  | 'map';
type Mode = 'daily' | 'team' | 'zero';
type Category = '餐飲' | '日用' | '育樂' | '交通';
type Sort = 'cp' | 'cost' | 'distance';
type Profile = { name: string; avatar: string; signedIn: boolean };
type CpParams = { price: number; distance: number; preference: number };
type Filters = {
  date: string;
  time: string;
  category: '全部' | Category;
  budget: number;
  people: number;
  distance: number;
  exclusions: string[];
  preferences: string[];
};
type Transaction = {
  id: string;
  title: string;
  category: Category;
  amount: number;
  date: string;
  saved: number;
};
type Result = {
  id: string;
  category: Category;
  title: string;
  provider: string;
  subcategory: string;
  totalCost: number;
  benchmarkCost?: number;
  servings: number;
  distanceKm: number;
  walkMin: number;
  hours: string;
  serviceModes: string[];
  condition: string;
  source: string;
  sourceUrl?: string;
  evidence: string;
  reliability: number;
  verifiedAt: string;
  mapQuery: string;
  expiresAt?: string;
  reportCount: number;
  image?: string;
  imageKind?: 'verified-real';
  tags?: string[];
  preferenceTags?: string[];
  agent?: 'cp' | 'zero';
  tone: 'lime' | 'violet' | 'blue' | 'coral' | 'amber';
  dimensions: Partial<Record<CpDimension, number>>;
};

const modes: Record<
  Mode,
  { title: string; short: string; description: string; color: string }
> = {
  daily: {
    title: '精打細算',
    short: '日常',
    description: '把價格、距離與時間一起算',
    color: 'var(--lime)',
  },
  team: {
    title: '一起省更多',
    short: '揪團',
    description: '比較單買與成團的人均成本',
    color: 'var(--violet)',
  },
  zero: {
    title: '零元探索',
    short: '零元',
    description: '免費優先，資格與時間仍要符合',
    color: 'var(--coral)',
  },
};
const homePrompts = [
  '今天要解決什麼？',
  '今晚想吃得省，還是吃得爽？',
  '附近有沒有免費驚喜？',
  '想少走一點，還是多省一點？',
  '揪朋友一起，能省多少？',
];
const results: Result[] = [
  {
    id: 'jianjia',
    category: '餐飲',
    title: '雙人古早味肉圓組合',
    provider: '大龍峒簡家肉圓',
    subcategory: '台式小吃',
    totalCost: 180,
    benchmarkCost: 260,
    servings: 2,
    distanceKm: 0.75,
    walkMin: 9,
    hours: '10:30–20:20',
    serviceModes: ['內用', '外帶'],
    condition: '週日依店家公告；價格為兩人預算估算',
    source: '店家網站＋圓山資料庫',
    sourceUrl: 'https://sites.google.com/view/jianjiabawan/',
    evidence:
      '店家位於大龍街 188 號；資料庫價格帶為每人 NT$50–150。本方案以兩人 NT$180 作預算估算，實際品項與價格以現場為準。',
    reliability: 92,
    verifiedAt: '2026-09-05',
    mapQuery: '大龍峒簡家肉圓',
    reportCount: 2,
    image: '/images/food-grid.svg',
    tags: ['豬肉', '油炸'],
    preferenceTags: ['快速', '可外帶', '低預算'],
    agent: 'cp',
    tone: 'lime',
    dimensions: {
      price: 92,
      food: 84,
      quality: 82,
      convenience: 88,
      discount: 76,
    },
  },
  {
    id: 'bremen',
    category: '餐飲',
    title: '雙人義大利麵提案',
    provider: '不萊梅圓山店',
    subcategory: '義式／聚餐',
    totalCost: 380,
    benchmarkCost: 460,
    servings: 2,
    distanceKm: 0.25,
    walkMin: 3,
    hours: '11:00–21:00',
    serviceModes: ['內用', '外帶'],
    condition: '靠近圓山站；餐點價格依現場菜單',
    source: '店家資訊＋圓山資料庫',
    sourceUrl: 'https://supertaste.tvbs.com.tw/infocard/33035',
    evidence:
      '店址為酒泉街 36 號，公開資訊標示每日 11:00–21:00。NT$380 是兩人最低預算估算，不代表固定套餐。',
    reliability: 86,
    verifiedAt: '2026-09-05',
    mapQuery: '不萊梅 圓山店',
    reportCount: 0,
    image: '/images/food-grid.svg',
    tags: ['麩質', '乳製品'],
    preferenceTags: ['安靜', '能坐', '有冷氣'],
    agent: 'cp',
    tone: 'violet',
    dimensions: {
      price: 68,
      food: 86,
      quality: 82,
      convenience: 96,
      discount: 58,
    },
  },
  {
    id: 'tfam',
    category: '育樂',
    title: '北美館傍晚看展',
    provider: '臺北市立美術館',
    subcategory: '美術館／展覽',
    totalCost: 0,
    benchmarkCost: 30,
    servings: 1,
    distanceKm: 0.65,
    walkMin: 8,
    hours: '09:30–17:30；週六至 20:30',
    serviceModes: ['室內', '步行'],
    condition: '17:00 後免費；特展例外',
    source: '臺北市立美術館官方資訊',
    sourceUrl:
      'https://www.tfam.museum/Common/editor.aspx?ddlLang=zh-tw&id=230',
    evidence:
      '官方票價頁標示普通票 NT$30、17:00 後停止售票並免費參觀，週六學生憑證全日免費；特展可能另計。',
    reliability: 99,
    verifiedAt: '2026-09-05',
    mapQuery: '臺北市立美術館',
    expiresAt: '今天 17:00',
    reportCount: 0,
    image: '/images/leisure-grid.svg',
    tags: [],
    preferenceTags: ['安靜', '有冷氣', '免費'],
    agent: 'zero',
    tone: 'blue',
    dimensions: {
      price: 100,
      food: 55,
      quality: 95,
      convenience: 88,
      discount: 100,
    },
  },
  {
    id: 'confucius',
    category: '育樂',
    title: '臺北孔子廟夜間散步',
    provider: '臺北市孔廟',
    subcategory: '文化／古蹟',
    totalCost: 0,
    servings: 1,
    distanceKm: 0.95,
    walkMin: 12,
    hours: '08:30–21:00',
    serviceModes: ['室內外', '步行'],
    condition: '週一休館；免費入園',
    source: '臺北市孔廟官方資訊',
    sourceUrl: 'https://www.tctcc.taipei/zh-tw/L/service/faq/1.htm',
    evidence:
      '官方 FAQ 標示週二至週日及國定假日 08:30–21:00，週一休館，免費入園參觀。',
    reliability: 99,
    verifiedAt: '2026-09-05',
    mapQuery: '臺北市孔廟',
    reportCount: 0,
    image: '/images/leisure-grid.svg',
    tags: [],
    preferenceTags: ['安靜', '免費', '少走路'],
    agent: 'zero',
    tone: 'coral',
    dimensions: {
      price: 100,
      food: 50,
      quality: 90,
      convenience: 80,
      discount: 100,
    },
  },
  {
    id: 'market',
    category: '育樂',
    title: '臺北花博農民市集',
    provider: '花博公園圓山園區',
    subcategory: '週末市集',
    totalCost: 0,
    servings: 1,
    distanceKm: 0.15,
    walkMin: 2,
    hours: '10:00–18:00',
    serviceModes: ['戶外', '自由入場'],
    condition: '入場免費；採買費用另計',
    source: '花博公園官方活動資訊',
    sourceUrl:
      'https://www.expopark.taipei/News_Content.aspx?n=91&s=4542&sms=9004',
    evidence:
      '活動場地位於花博圓山園區長廊廣場。入場費用為零，現場消費不納入免費範圍。',
    reliability: 97,
    verifiedAt: '2026-09-05',
    mapQuery: '花博公園圓山園區',
    expiresAt: '週日 18:00',
    reportCount: 0,
    image: '/images/leisure-grid.svg',
    tags: ['戶外'],
    preferenceTags: ['免費', '市集', '親子'],
    agent: 'zero',
    tone: 'amber',
    dimensions: {
      price: 100,
      food: 78,
      quality: 84,
      convenience: 98,
      discount: 95,
    },
  },
  {
    id: 'youbike',
    category: '交通',
    title: 'YouBike 圓山短程串點',
    provider: 'YouBike 2.0',
    subcategory: '共享單車',
    totalCost: 0,
    benchmarkCost: 30,
    servings: 1,
    distanceKm: 1.8,
    walkMin: 2,
    hours: '24 小時，依站點車況',
    serviceModes: ['騎乘', '會員'],
    condition: '臺北市會員前 30 分鐘補助免費',
    source: 'YouBike 臺北官方費率',
    sourceUrl: 'https://www.youbike.com.tw/region/taipei/rate/',
    evidence:
      '臺北市會員租借 YouBike 2.0 前 30 分鐘由政府補助；需完成會員與公共自行車傷害險設定，車況以官方 App 為準。',
    reliability: 99,
    verifiedAt: '2026-09-05',
    mapQuery: '捷運圓山站 YouBike',
    reportCount: 1,
    image: '/images/transport-grid.svg',
    tags: ['騎乘', '戶外'],
    preferenceTags: ['低預算', '不用等', '少走路'],
    agent: 'zero',
    tone: 'blue',
    dimensions: {
      price: 100,
      food: 45,
      quality: 86,
      convenience: 92,
      discount: 100,
    },
  },
  {
    id: 'taxi-share',
    category: '交通',
    title: '四人短程共乘估算',
    provider: '臺北市一般計程車',
    subcategory: '共乘／叫車',
    totalCost: 105,
    benchmarkCost: 340,
    servings: 4,
    distanceKm: 1.5,
    walkMin: 1,
    hours: '全天',
    serviceModes: ['共乘', '叫車'],
    condition: '預估每人 NT$27；實際依跳表與路況',
    source: '臺北市計程車運價＋距離估算',
    sourceUrl:
      'https://pto.gov.taipei/News_Content.aspx?n=6B4D38874E971F4B&s=63C0CCF302898D25',
    evidence:
      '以圓山周邊 1.5 公里短程估算總價 NT$105，四人均分約 NT$27；這不是報價，深夜與等候費另計。',
    reliability: 84,
    verifiedAt: '2026-09-05',
    mapQuery: '捷運圓山站',
    reportCount: 0,
    image: '/images/transport-grid.svg',
    tags: ['共乘'],
    preferenceTags: ['不用等', '少走路', '揪團'],
    agent: 'cp',
    tone: 'violet',
    dimensions: {
      price: 76,
      food: 40,
      quality: 84,
      convenience: 98,
      discount: 72,
    },
  },
  {
    id: 'daily-store',
    category: '日用',
    title: '24 小時臨時補給',
    provider: '7-ELEVEN 圓泉門市',
    subcategory: '便利商店',
    totalCost: 80,
    servings: 1,
    distanceKm: 0.18,
    walkMin: 2,
    hours: '24 小時',
    serviceModes: ['店內', '外帶'],
    condition: '實際庫存與售價以門市為準',
    source: '圓山資料庫＋地圖店家資訊',
    sourceUrl:
      'https://www.google.com/maps/search/?api=1&query=7-ELEVEN圓泉門市',
    evidence:
      '門市位於酒泉街 25／27 號 1 樓。NT$80 是臨時補給預算，不代表指定商品組合或即時庫存。',
    reliability: 83,
    verifiedAt: '2026-09-05',
    mapQuery: '7-ELEVEN 圓泉門市',
    reportCount: 0,
    image: '/images/daily-grid.svg',
    tags: ['24小時', '便利商店'],
    preferenceTags: ['不用等', '有冷氣', '少走路'],
    agent: 'cp',
    tone: 'coral',
    dimensions: {
      price: 78,
      food: 72,
      quality: 76,
      convenience: 100,
      discount: 52,
    },
  },
  {
    id: 'ys-food-002',
    category: '餐飲',
    title: '圓山麵食快餐方案',
    provider: '圓山資料庫餐飲 YS_FOOD_002',
    subcategory: '麵食／快速晚餐',
    totalCost: 220,
    benchmarkCost: 300,
    servings: 2,
    distanceKm: 0.55,
    walkMin: 7,
    hours: '11:00–20:30',
    serviceModes: ['內用', '外帶'],
    condition: 'Excel 圓山餐飲資料匯入；名稱待資料清洗後替換為完整店名',
    source: 'Yuanshan_APP_AI_Database_Design.xlsx / 02_Places',
    sourceUrl: 'https://www.google.com/maps/search/?api=1&query=圓山 麵食',
    evidence:
      '02_Places 顯示圓山餐飲資料有 12 筆 active places；本卡片先以資料集 record id 補入展示候選。',
    reliability: 78,
    verifiedAt: '2026-09-05',
    mapQuery: '圓山 麵食',
    reportCount: 0,
    image: '/images/food-grid.svg',
    tags: ['牛肉', '麩質'],
    preferenceTags: ['快速', '能坐', '低預算'],
    agent: 'cp',
    tone: 'amber',
    dimensions: {
      price: 86,
      food: 78,
      quality: 72,
      convenience: 86,
      discount: 68,
    },
  },
  {
    id: 'ys-food-003',
    category: '餐飲',
    title: '圓山便當外帶方案',
    provider: '圓山資料庫餐飲 YS_FOOD_003',
    subcategory: '便當／外帶',
    totalCost: 190,
    benchmarkCost: 260,
    servings: 2,
    distanceKm: 1.1,
    walkMin: 14,
    hours: '10:30–19:30',
    serviceModes: ['外帶'],
    condition: '可能含堅果或芝麻醬料；排斥者需現場確認',
    source: 'Yuanshan_APP_AI_Database_Design.xlsx / 02_Places',
    sourceUrl: 'https://www.google.com/maps/search/?api=1&query=圓山 便當',
    evidence:
      '資料集提供 active food record，前端先將它納入 CP 探索候選；正式版需補齊 evidence assertion。',
    reliability: 76,
    verifiedAt: '2026-09-05',
    mapQuery: '圓山 便當',
    reportCount: 1,
    image: '/images/food-grid.svg',
    tags: ['堅果', '雞肉'],
    preferenceTags: ['可外帶', '低預算', '不用等'],
    agent: 'cp',
    tone: 'lime',
    dimensions: {
      price: 90,
      food: 76,
      quality: 70,
      convenience: 78,
      discount: 72,
    },
  },
  {
    id: 'ys-food-004',
    category: '餐飲',
    title: '圓山早午餐座位方案',
    provider: '圓山資料庫餐飲 YS_FOOD_004',
    subcategory: '早午餐／咖啡',
    totalCost: 320,
    benchmarkCost: 420,
    servings: 2,
    distanceKm: 0.9,
    walkMin: 11,
    hours: '09:00–17:00',
    serviceModes: ['內用', '有座位'],
    condition: '熱門時段可能需等候；適合安靜與能坐偏好',
    source: 'Yuanshan_APP_AI_Database_Design.xlsx / 02_Places',
    sourceUrl: 'https://www.google.com/maps/search/?api=1&query=圓山 早午餐',
    evidence:
      '資料集 02_Places 含餐飲與停留時間欄位；目前以前端 fixture 呈現，等待後端匯入正式欄位。',
    reliability: 80,
    verifiedAt: '2026-09-05',
    mapQuery: '圓山 早午餐',
    reportCount: 0,
    image: '/images/food-grid.svg',
    tags: ['乳製品', '蛋'],
    preferenceTags: ['安靜', '能坐', '有冷氣'],
    agent: 'cp',
    tone: 'blue',
    dimensions: {
      price: 74,
      food: 84,
      quality: 82,
      convenience: 82,
      discount: 60,
    },
  },
  {
    id: 'taxi-carpool-night',
    category: '交通',
    title: '夜間計程車順風團',
    provider: '圓山短程共乘',
    subcategory: '計程車／順風車',
    totalCost: 160,
    benchmarkCost: 520,
    servings: 4,
    distanceKm: 2.2,
    walkMin: 1,
    hours: '20:00–23:30',
    serviceModes: ['共乘', '叫車', '揪團'],
    condition: '每人約 NT$40；需自行確認叫車平台與實際跳表',
    source: 'Yuanshan_APP_AI_Database_Design.xlsx / 04_Transport',
    sourceUrl: 'https://www.google.com/maps/search/?api=1&query=圓山 計程車',
    evidence:
      '04_Transport 提供交通類資料；本卡片加入順風共乘作為揪團候選，不代表平台代叫車或代付款。',
    reliability: 82,
    verifiedAt: '2026-09-05',
    mapQuery: '捷運圓山站 計程車',
    reportCount: 0,
    image: '/images/transport-grid.svg',
    tags: ['共乘', '夜間'],
    preferenceTags: ['少走路', '不用等', '揪團'],
    agent: 'cp',
    tone: 'violet',
    dimensions: {
      price: 82,
      food: 40,
      quality: 78,
      convenience: 94,
      discount: 86,
    },
  },
];

const money = (value: number) =>
  new Intl.NumberFormat('zh-TW').format(Math.round(value));
const taipeiDateTime = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((values, part) => {
      if (part.type !== 'literal') values[part.type] = part.value;
      return values;
    }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
};
const localNow = () =>
  new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
const overlap = (a: string[] = [], b: string[] = []) =>
  a.filter((item) => b.includes(item));
const cpFormulaScore = (item: Result, filters: Filters, params: CpParams) => {
  const priceScore =
    filters.budget <= 0
      ? item.totalCost === 0
        ? 100
        : 0
      : Math.max(0, 100 - (item.totalCost / filters.budget) * 100);
  const distanceScore = Math.max(
    0,
    100 - (item.distanceKm / Math.max(filters.distance, 0.5)) * 100,
  );
  const preferenceScore = Math.min(
    100,
    overlap(item.preferenceTags, filters.preferences).length * 34,
  );
  const totalWeight = params.price + params.distance + params.preference;
  return Math.round(
    (priceScore * params.price +
      distanceScore * params.distance +
      preferenceScore * params.preference) /
      Math.max(1, totalWeight),
  );
};
const categoryIcon = (category: Category) =>
  category === '餐飲' ? (
    <Utensils />
  ) : category === '日用' ? (
    <ShoppingBag />
  ) : category === '育樂' ? (
    <Gamepad2 />
  ) : (
    <Bike />
  );

export default function App() {
  const [view, setView] = useState<View>('welcome');
  const [history, setHistory] = useState<View[]>([]);
  const [profile, setProfile] = useState<Profile>({
    name: '小美',
    avatar: '#c9ff36',
    signedIn: false,
  });
  const [mode, setMode] = useState<Mode>('daily');
  const [need, setNeed] = useState('今晚兩人吃飯，可以外帶，不吃堅果');
  const [filters, setFilters] = useState<Filters>(() => {
    const now = taipeiDateTime();
    return {
      date: now.date,
      time: now.time,
      category: '全部',
      budget: 500,
      people: 2,
      distance: 2,
      exclusions: ['堅果'],
      preferences: ['安靜', '能坐'],
    };
  });
  const [followCurrentTime, setFollowCurrentTime] = useState(true);
  const [selectedId, setSelectedId] = useState(results[0].id);
  const [saved, setSaved] = useState<string[]>([]);
  const [completed, setCompleted] = useState<string[]>([]);
  const [searchProgress, setSearchProgress] = useState(0);
  const [teamCount, setTeamCount] = useState(3);
  const [joinedTeam, setJoinedTeam] = useState(false);
  const [toast, setToast] = useState('');
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [showSopGuide, setShowSopGuide] = useState(false);
  const [sort, setSort] = useState<Sort>('cp');
  const [cpParams, setCpParams] = useState<CpParams>({
    price: 55,
    distance: 30,
    preference: 15,
  });
  const [recording, setRecording] = useState(false);
  const [reminders, setReminders] = useState(true);
  const [unread, setUnread] = useState(3);
  const [nowText, setNowText] = useState(localNow());
  const [locationStatus, setLocationStatus] = useState('尚未定位');
  const [transactions, setTransactions] = useState<Transaction[]>([
    {
      id: 'h1',
      title: '圓山站日常補給',
      category: '日用',
      amount: 126,
      date: '09/03',
      saved: 14,
    },
    {
      id: 'h2',
      title: '朋友共乘',
      category: '交通',
      amount: 52,
      date: '08/30',
      saved: 68,
    },
    {
      id: 'h3',
      title: '週末看展',
      category: '育樂',
      amount: 30,
      date: '08/24',
      saved: 30,
    },
  ]);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [pwaStatus, setPwaStatus] = useState('檢查中');

  const selected = results.find((item) => item.id === selectedId) ?? results[0];
  const ordered = useMemo(() => {
    const ranked = results
      .filter((item) => {
        const categoryMatch =
          filters.category === '全部' || item.category === filters.category;
        const budgetMatch =
          filters.budget === 0
            ? item.totalCost === 0
            : item.totalCost <= filters.budget;
        return (
          categoryMatch && budgetMatch && item.distanceKm <= filters.distance
        );
      })
      .sort((a, b) => {
        const aExcluded = overlap(a.tags, filters.exclusions).length > 0;
        const bExcluded = overlap(b.tags, filters.exclusions).length > 0;
        if (aExcluded !== bExcluded) return aExcluded ? 1 : -1;
        const aPreference = overlap(
          a.preferenceTags,
          filters.preferences,
        ).length;
        const bPreference = overlap(
          b.preferenceTags,
          filters.preferences,
        ).length;
        if (aPreference !== bPreference) return bPreference - aPreference;
        if (sort === 'cost') return a.totalCost - b.totalCost;
        if (sort === 'distance') return a.distanceKm - b.distanceKm;
        return (
          cpFormulaScore(b, filters, cpParams) -
          cpFormulaScore(a, filters, cpParams)
        );
      });
    return mode === 'zero'
      ? ranked.sort(
          (a, b) => (b.agent === 'zero' ? 1 : 0) - (a.agent === 'zero' ? 1 : 0),
        )
      : ranked;
  }, [filters, mode, sort, cpParams]);

  useEffect(() => {
    if ('serviceWorker' in navigator)
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => setPwaStatus('離線外殼已啟用'))
        .catch(() => setPwaStatus('瀏覽器未啟用離線功能'));
    if (window.matchMedia('(display-mode: standalone)').matches)
      queueMicrotask(() => setPwaStatus('已安裝'));
    const capture = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
      setPwaStatus('可安裝到主畫面');
    };
    window.addEventListener('beforeinstallprompt', capture);
    return () => window.removeEventListener('beforeinstallprompt', capture);
  }, []);
  useEffect(() => {
    if (view !== 'search') return;
    const timer = window.setInterval(
      () =>
        setSearchProgress((value) =>
          Math.min(100, value + (value < 60 ? 7 : 4)),
        ),
      360,
    );
    const finish = window.setTimeout(() => {
      window.clearInterval(timer);
      setSearchProgress(100);
      window.setTimeout(() => setView('results'), 450);
    }, 5200);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(finish);
    };
  }, [view]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2300);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowText(localNow());
      if (followCurrentTime) {
        const now = taipeiDateTime();
        setFilters((current) =>
          current.date === now.date && current.time === now.time
            ? current
            : { ...current, date: now.date, time: now.time },
        );
      }
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [followCurrentTime]);
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      queueMicrotask(() => setLocationStatus('此裝置不支援定位'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setLocationStatus(
          `已定位，精度約 ${Math.round(position.coords.accuracy)} m`,
        ),
      () => setLocationStatus('未授權定位，先用圓山站估算'),
      { timeout: 8000, maximumAge: 300000 },
    );
  }, []);

  function navigate(next: View, remember = true) {
    if (remember && next !== view)
      setHistory((items) => [...items.slice(-8), view]);
    setView(next);
  }
  function goBack() {
    setView(history.at(-1) ?? 'home');
    setHistory((items) => items.slice(0, -1));
  }
  function chooseMode(next: Mode) {
    setMode(next);
    const budget = next === 'zero' ? 0 : next === 'team' ? 800 : 500;
    setFilters((current) => ({
      ...current,
      budget,
      people: next === 'team' ? 5 : next === 'zero' ? 1 : 2,
    }));
    setToast(`已切換：${modes[next].title}`);
  }
  function startSearch() {
    setSearchProgress(8);
    setHistory(['home']);
    setView('search');
  }
  function openResult(id: string) {
    setSelectedId(id);
    navigate('detail');
  }
  function toggleSaved(id: string) {
    setSaved((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
    setToast(saved.includes(id) ? '已從清單移除' : '已加入這次清單');
  }
  function markPurchased(id: string) {
    const item = results.find((entry) => entry.id === id);
    if (!item) return;
    const wasDone = completed.includes(id);
    setCompleted((items) =>
      wasDone ? items.filter((entry) => entry !== id) : [...items, id],
    );
    if (!wasDone && !transactions.some((entry) => entry.id === `buy-${id}`))
      setTransactions((items) => [
        {
          id: `buy-${id}`,
          title: item.title,
          category: item.category,
          amount: item.totalCost,
          date: '今天',
          saved: Math.max(
            0,
            (item.benchmarkCost ?? item.totalCost) - item.totalCost,
          ),
        },
        ...items,
      ]);
    setToast(wasDone ? '已取消購買標記' : '已買，消費分析已更新');
  }
  async function share(text: string) {
    const url = `https://all-in-life-ail.chiehlun.chatgpt.site/?share=${encodeURIComponent(text.slice(0, 60))}`;
    setShareUrl(url);
    try {
      if (navigator.share)
        await navigator.share({ title: 'ALL IN LIFE', text, url });
      else await navigator.clipboard?.writeText(`${text}\n${url}`);
      setToast('分享連結與 QR Code 已準備好');
    } catch {
      setToast('已保留 QR Code，可改用掃碼分享');
    }
  }
  function startVoice() {
    type Recognition = {
      lang: string;
      interimResults: boolean;
      start: () => void;
      onresult: (event: {
        results: ArrayLike<{ 0: { transcript: string } }>;
      }) => void;
      onend: () => void;
      onerror: () => void;
    };
    const w = window as unknown as {
      webkitSpeechRecognition?: new () => Recognition;
      SpeechRecognition?: new () => Recognition;
    };
    const RecognitionCtor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setRecording(true);
      window.setTimeout(() => {
        setNeed('今晚兩人吃飯，預算五百，可以外帶，不吃堅果');
        setRecording(false);
        setToast('已轉成文字，請確認需求與限制');
        navigate('filters');
      }, 1300);
      return;
    }
    const recognition = new RecognitionCtor();
    recognition.lang = 'zh-TW';
    recognition.interimResults = false;
    setRecording(true);
    recognition.onresult = (event) => {
      setNeed(event.results[0][0].transcript);
      setRecording(false);
      setToast('語音輸入完成，請確認需求與限制');
      navigate('filters');
    };
    recognition.onend = () => setRecording(false);
    recognition.onerror = () => {
      setRecording(false);
      setToast('沒有收到語音，請再試一次');
    };
    recognition.start();
  }
  async function installPwa() {
    const prompt = installPrompt as Event & { prompt?: () => Promise<void> };
    if (prompt?.prompt) {
      await prompt.prompt();
      setInstallPrompt(null);
      setPwaStatus('安裝邀請已送出');
    } else setToast('請使用瀏覽器選單「加到主畫面」');
  }

  const shellLess = ['welcome', 'onboarding'].includes(view);
  return (
    <div
      className="app-stage"
      data-survival={mode === 'zero' ? 'true' : 'false'}
    >
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <main className="phone-shell">
        {!shellLess && (
          <AppHeader
            view={view}
            nowText={nowText}
            unread={unread}
            savedCount={saved.length}
            onBack={goBack}
            onHome={() => navigate('home')}
            onNotifications={() => navigate('notifications')}
            onSettings={() => navigate('settings')}
          />
        )}
        <div className="screen-stack">
          <div key={view} className="screen-enter">
            {view === 'welcome' && (
              <WelcomeScreen
                onGuest={() => navigate('onboarding')}
                onLogin={() => {
                  setProfile((p) => ({ ...p, signedIn: true }));
                  navigate('onboarding');
                }}
              />
            )}
            {view === 'onboarding' && (
              <OnboardingScreen
                profile={profile}
                filters={filters}
                onProfile={setProfile}
                onFilters={setFilters}
                onDone={() => {
                  setHistory([]);
                  setView('home');
                  setShowSopGuide(true);
                }}
              />
            )}
            {view === 'home' && (
              <HomeScreen
                profile={profile}
                mode={mode}
                filters={filters}
                need={need}
                locationStatus={locationStatus}
                savedCount={saved.length}
                onMode={chooseMode}
                onNeed={setNeed}
                onVoice={startVoice}
                recording={recording}
                onConfirm={() => navigate('filters')}
                onProfile={() => navigate('profile')}
                onAnalytics={() => navigate('analytics')}
                onTeam={() => {
                  chooseMode('team');
                  navigate('team');
                }}
                onGuide={() => setShowSopGuide(true)}
              />
            )}
            {view === 'ready' && (
              <ReadyScreen
                filters={filters}
                need={need}
                mode={mode}
                onEdit={() => navigate('filters')}
                onStart={startSearch}
              />
            )}
            {view === 'search' && (
              <SearchScreen progress={searchProgress} filters={filters} />
            )}
            {view === 'results' && (
              <ResultsScreen
                items={ordered}
                filters={filters}
                cpParams={cpParams}
                sort={sort}
                saved={saved}
                onSort={setSort}
                onFiltersChange={setFilters}
                onCpParams={setCpParams}
                onFilters={() => navigate('filters')}
                onOpen={openResult}
                onSave={toggleSaved}
              />
            )}
            {view === 'detail' && (
              <DetailScreen
                item={selected}
                itemScore={cpFormulaScore(selected, filters, cpParams)}
                cpParams={cpParams}
                filters={filters}
                saved={saved.includes(selected.id)}
                onSave={() => toggleSaved(selected.id)}
                onEvidence={() => setEvidenceOpen(true)}
                onMap={() => navigate('map')}
                onReport={() => navigate('report')}
                onShare={() =>
                  share(
                    `${selected.title}｜${selected.provider}｜預估 NT$${selected.totalCost}`,
                  )
                }
              />
            )}
            {view === 'saved' && (
              <SavedScreen
                items={results.filter((item) => saved.includes(item.id))}
                completed={completed}
                budget={filters.budget}
                onBuy={markPurchased}
                onOpen={openResult}
                onRemove={toggleSaved}
                onExplore={() => navigate('results')}
                onShare={() =>
                  share(`這次清單共 ${saved.length} 個選項，來自 ALL IN LIFE`)
                }
              />
            )}
            {view === 'team' && (
              <TeamScreen
                count={teamCount}
                joined={joinedTeam}
                onJoin={() => {
                  if (!joinedTeam) {
                    setJoinedTeam(true);
                    setTeamCount((n) => Math.min(5, n + 1));
                    setToast('已加入，可在截止前取消');
                  }
                }}
                onCancel={() => {
                  if (joinedTeam) {
                    setJoinedTeam(false);
                    setTeamCount((n) => Math.max(0, n - 1));
                    setToast('已取消承諾');
                  }
                }}
                onShare={() =>
                  share(
                    '一起加入 ALL IN LIFE 的圓山晚餐團：滿 5 人每人省 NT$15',
                  )
                }
              />
            )}
            {view === 'settings' && (
              <SettingsScreen
                profile={profile}
                filters={filters}
                mode={mode}
                reminders={reminders}
                pwaStatus={pwaStatus}
                onProfile={() => navigate('profile')}
                onFilters={() => navigate('filters')}
                onMode={chooseMode}
                onReminders={setReminders}
                onAnalytics={() => navigate('analytics')}
                onHistory={() => navigate('history')}
                onInstall={installPwa}
                onDone={goBack}
              />
            )}
            {view === 'profile' && (
              <ProfileScreen
                profile={profile}
                onChange={setProfile}
                onDone={goBack}
              />
            )}
            {view === 'filters' && (
              <FiltersScreen
                filters={filters}
                need={need}
                onNeed={setNeed}
                onChange={setFilters}
                followCurrentTime={followCurrentTime}
                onFollowCurrentTime={setFollowCurrentTime}
                onApply={() => {
                  setToast('需求與限制已確認');
                  navigate('ready');
                }}
              />
            )}
            {view === 'notifications' && (
              <NotificationsScreen
                unread={unread}
                reminders={reminders}
                onRead={() => setUnread(0)}
                onOpen={(target) => {
                  setUnread(0);
                  if (target === 'detail') setSelectedId('tfam');
                  navigate(target);
                }}
              />
            )}
            {view === 'analytics' && (
              <AnalyticsScreen
                transactions={transactions}
                budget={10000}
                onHistory={() => navigate('history')}
              />
            )}
            {view === 'history' && (
              <HistoryScreen transactions={transactions} onOpen={openResult} />
            )}
            {view === 'report' && (
              <ReportScreen
                item={selected}
                onSubmit={() => {
                  setToast('已收到回報，會交由資料維護者確認');
                  goBack();
                }}
              />
            )}
            {view === 'map' && (
              <MapScreen
                item={selected}
                onOpen={() => openResult(selected.id)}
              />
            )}
          </div>
        </div>
        {!shellLess &&
          ![
            'search',
            'ready',
            'settings',
            'profile',
            'filters',
            'notifications',
            'history',
            'report',
            'map',
            'detail',
          ].includes(view) && (
            <BottomNav
              view={view}
              savedCount={saved.length}
              onNavigate={navigate}
            />
          )}
        {toast && (
          <div className="toast">
            <Check />
            {toast}
          </div>
        )}
        {showSopGuide && <SopGuide onClose={() => setShowSopGuide(false)} />}
      </main>
      <Dialog open={evidenceOpen} onOpenChange={setEvidenceOpen}>
        <DialogContent className="evidence-sheet">
          <div className="sheet-handle" />
          <DialogHeader>
            <span className="kicker lime-text">資料依據</span>
            <DialogTitle className="text-2xl font-black">
              {selected.title}
            </DialogTitle>
            <DialogDescription>{selected.source}</DialogDescription>
          </DialogHeader>
          <div className="evidence-grid">
            <Metric label="可信度" value={`${selected.reliability}%`} />
            <Metric
              label="CP 分數"
              value={String(cpFormulaScore(selected, filters, cpParams))}
            />
            <Metric label="確認日期" value={selected.verifiedAt.slice(5)} />
          </div>
          <blockquote className="evidence-copy">{selected.evidence}</blockquote>
          {selected.sourceUrl && (
            <a
              className="source-link"
              href={selected.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              查看原始來源
              <ExternalLink />
            </a>
          )}
          <p className="fine-print">
            價格、營業與庫存可能改變，出發或購買前請再次向原始提供者確認。
          </p>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(shareUrl)}
        onOpenChange={(open) => !open && setShareUrl('')}
      >
        <DialogContent className="evidence-sheet share-sheet">
          <DialogHeader>
            <span className="kicker lime-text">可掃描分享</span>
            <DialogTitle>ALL IN LIFE 分享連結</DialogTitle>
            <DialogDescription>
              可直接掃描 QR Code，或開啟下方連結。
            </DialogDescription>
          </DialogHeader>
          <div className="qr-frame">
            <QrCode aria-hidden="true" />
            <Image
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shareUrl)}`}
              alt="ALL IN LIFE 分享 QR Code"
              width="180"
              height="180"
              unoptimized
              loader={({ src }) => src}
            />
          </div>
          <a
            className="source-link"
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
          >
            開啟分享連結
            <ExternalLink />
          </a>
          <p className="fine-print">
            QR 圖片需要網路載入；分享連結本身可直接複製使用。
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WelcomeScreen({
  onGuest,
  onLogin,
}: {
  onGuest: () => void;
  onLogin: () => void;
}) {
  return (
    <section className="welcome-screen">
      <div className="welcome-mark">
        <span>ALL</span>
        <span>IN</span>
        <span>LIFE</span>
      </div>
      <p>
        把預算、時間、距離與偏好
        <br />
        變成今天真的做得到的選擇。
      </p>
      <div className="welcome-visual">
        <Compass />
        <i />
        <i />
        <i />
      </div>
      <button className="primary-action" onClick={onGuest}>
        <Sparkles />
        先匿名使用
        <ArrowRight />
      </button>
      <button className="secondary-action" onClick={onLogin}>
        <LogIn />
        登入並保存紀錄
      </button>
      <small>匿名資料只留在這台裝置；登入後才能跨裝置保存。</small>
    </section>
  );
}

function SopGuide({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const guide = [
    {
      eyebrow: 'STEP 01 · 語音／打字輸入需求',
      title: '先把需求說清楚',
      copy: '語音完成或按下一步後，系統會強制帶你到條件確認，不會直接搜尋。',
      icon: <Mic />,
    },
    {
      eyebrow: 'STEP 02 · 確認需求與限制',
      title: '逐項確認搜尋界線',
      copy: '檢查時間、預算、距離、喜好與排斥成分；確認後才會進到準備探索。',
      icon: <SlidersHorizontal />,
    },
    {
      eyebrow: 'STEP 03 · 開始探索',
      title: '確認完成，雙獵人出動',
      copy: '按下開始探索後，CP 值獵人與零元獵人才會同步搜尋並帶回結果。',
      icon: <Radar />,
    },
  ];
  useEffect(() => {
    const timer = window.setTimeout(
      () => setStep((current) => (current < guide.length - 1 ? current + 1 : current)),
      3_200,
    );
    return () => window.clearTimeout(timer);
  }, [step, guide.length]);
  const item = guide[step];
  return (
    <dialog open className="sop-overlay" aria-label="使用教學">
      <div className="sop-guide-card">
        <div className="sop-guide-top">
          <span className="brand-inline">ALL IN LIFE</span>
          <button onClick={onClose}>略過教學</button>
        </div>
        <div className={`sop-demo sop-demo-${step + 1}`}>
          <div className="sop-demo-orbit" />
          <span className="sop-demo-icon">{item.icon}</span>
          {step === 0 && (
            <div className="voice-wave" aria-hidden="true">
              <i /><i /><i /><i /><i />
            </div>
          )}
          {step === 1 && (
            <div className="guide-constraints" aria-hidden="true">
              <i>現在</i><i>NT$500</i><i>2 km</i>
            </div>
          )}
          {step === 2 && (
            <div className="guide-agents" aria-hidden="true">
              <i><b>CP</b><span /></i>
              <i><b>0元</b><span /></i>
            </div>
          )}
        </div>
        <div className="sop-guide-copy" key={step}>
          <span>{item.eyebrow}</span>
          <h2>{item.title}</h2>
          <p>{item.copy}</p>
        </div>
        <div className="sop-guide-progress">
          {guide.map((entry, index) => (
            <button
              key={entry.eyebrow}
              className={index === step ? 'active' : index < step ? 'done' : ''}
              onClick={() => setStep(index)}
              aria-label={`前往教學第 ${index + 1} 步`}
            ><i /></button>
          ))}
        </div>
        <button
          className="primary-action sop-guide-next"
          onClick={() => (step < guide.length - 1 ? setStep(step + 1) : onClose())}
        >
          {step < guide.length - 1 ? '下一步' : '開始探索'}
          <ArrowRight />
        </button>
      </div>
    </dialog>
  );
}

function OnboardingScreen({
  profile,
  filters,
  onProfile,
  onFilters,
  onDone,
}: {
  profile: Profile;
  filters: Filters;
  onProfile: (p: Profile) => void;
  onFilters: (f: Filters) => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState(1);
  return (
    <section className="screen onboarding-screen">
      <div className="onboarding-top">
        <span className="brand-inline">ALL IN LIFE</span>
        <button className="skip-button" onClick={onDone}>
          略過
        </button>
      </div>
      <Progress value={step * 33.4} />
      {step === 1 && (
        <>
          <span className="kicker">先認識一下你</span>
          <h1>怎麼稱呼你？</h1>
          <p>不用真名，之後可以隨時修改。</p>
          <div
            className="avatar-preview"
            style={{ background: profile.avatar }}
          >
            {profile.name.slice(0, 1) || '你'}
            <Camera />
          </div>
          <label className="field-label">
            匿名暱稱
            <input
              value={profile.name}
              maxLength={12}
              onChange={(e) => onProfile({ ...profile, name: e.target.value })}
            />
          </label>
        </>
      )}
      {step === 2 && (
        <>
          <span className="kicker">確認限制</span>
          <h1>你的日常界線</h1>
          <p>硬限制會直接排除選項，不只是影響排序。</p>
          <div className="compact-grid">
            <label className="field-label">
              單次預算
              <input
                type="number"
                value={filters.budget}
                onChange={(e) =>
                  onFilters({ ...filters, budget: Number(e.target.value) })
                }
              />
            </label>
            <label className="field-label">
              人數
              <input
                type="number"
                min="1"
                max="10"
                value={filters.people}
                onChange={(e) =>
                  onFilters({ ...filters, people: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <TagPicker
            title="不吃／排除"
            values={['堅果', '牛肉', '海鮮', '麩質', '乳製品', '辣']}
            selected={filters.exclusions}
            onChange={(exclusions) => onFilters({ ...filters, exclusions })}
          />
        </>
      )}
      {step === 3 && (
        <>
          <span className="kicker">偏好排序</span>
          <h1>什麼讓你更舒服？</h1>
          <p>軟偏好會加分，但不會隱藏其他可行選項。</p>
          <TagPicker
            title="偏好"
            values={['安靜', '能坐', '不用等', '有冷氣', '少走路', '可外帶']}
            selected={filters.preferences}
            onChange={(preferences) => onFilters({ ...filters, preferences })}
          />
          <div className="confirm-card">
            <Check />
            <span>
              <b>{profile.signedIn ? '登入模式' : '匿名模式'}</b>
              <small>
                {profile.signedIn
                  ? '接上帳號 API 後可同步設定與紀錄'
                  : '目前只儲存在這個瀏覽工作階段'}
              </small>
            </span>
          </div>
        </>
      )}
      <div className="onboarding-actions">
        {step > 1 && (
          <button
            className="secondary-action"
            onClick={() => setStep((s) => s - 1)}
          >
            上一步
          </button>
        )}
        <button
          className="primary-action"
          onClick={() => (step < 3 ? setStep((s) => s + 1) : onDone())}
        >
          {step < 3 ? '下一步' : '開始使用'}
          <ArrowRight />
        </button>
      </div>
    </section>
  );
}

function AppHeader({
  view,
  nowText,
  unread,
  savedCount,
  onBack,
  onHome,
  onNotifications,
  onSettings,
}: {
  view: View;
  nowText: string;
  unread: number;
  savedCount: number;
  onBack: () => void;
  onHome: () => void;
  onNotifications: () => void;
  onSettings: () => void;
}) {
  const root = ['home', 'results', 'saved', 'team', 'analytics'].includes(view);
  const titles: Partial<Record<View, string>> = {
    detail: '選項詳情',
    ready: '準備探索',
    search: '獵人出發',
    settings: '設定',
    profile: '個人檔案',
    filters: '需求與限制',
    notifications: '通知',
    analytics: '消費分析',
    history: '歷史紀錄',
    report: '回報資訊',
    map: '位置與交通',
  };
  return (
    <header className={`app-header glass ${root ? 'root-header' : ''}`}>
      {root ? (
        <button className="brand-lockup" onClick={onHome}>
          <b>ALL IN LIFE</b>
          <small><i />{nowText} · 圓山生活圈</small>
        </button>
      ) : (
        <button className="icon-button" onClick={onBack} aria-label="返回">
          <ArrowLeft />
        </button>
      )}
      {!root && <strong className="header-title">{titles[view]}</strong>}
      <div className="header-actions">
        {savedCount > 0 && root && (
          <span className="header-count">{savedCount}</span>
        )}
        {root && (
          <button
            className="icon-button notification-button"
            onClick={onNotifications}
            aria-label="通知"
          >
            <Bell />
            {unread > 0 && <i>{unread}</i>}
          </button>
        )}
        <button
          className="icon-button"
          onClick={onSettings}
          aria-label="開啟設定"
        >
          <Menu />
        </button>
      </div>
    </header>
  );
}

function JourneyRail({ active }: { active: 1 | 2 | 3 }) {
  const steps = ['輸入需求', '確認需求與限制', '開始探索'];
  return (
    <div className="journey-rail" aria-label={`目前位於步驟 ${active}`}>
      {steps.map((label, index) => {
        const step = index + 1;
        return (
          <span
            key={label}
            className={step === active ? 'active' : step < active ? 'done' : ''}
          >
            <i>{step < active ? <Check /> : step}</i>
            <b>{label}</b>
          </span>
        );
      })}
    </div>
  );
}

function ReadyScreen({
  filters,
  need,
  mode,
  onEdit,
  onStart,
}: {
  filters: Filters;
  need: string;
  mode: Mode;
  onEdit: () => void;
  onStart: () => void;
}) {
  return (
    <section className="screen ready-screen">
      <JourneyRail active={3} />
      <span className="kicker lime-text">STEP 03 · START HUNTING</span>
      <h1>條件確認完成<br />準備開始探索</h1>
      <p>最後看一次摘要；按下按鈕後，兩個獵人才會正式出動。</p>
      <div className="ready-brief interactive-shine">
        <span className="ready-label"><Check />已確認的需求</span>
        <blockquote>{need || '尚未輸入文字需求'}</blockquote>
        <div className="ready-metrics">
          <span><Clock3 /><b>{filters.date.slice(5)} {filters.time}</b></span>
          <span><CircleDollarSign /><b>NT${filters.budget}</b></span>
          <span><Users /><b>{filters.people} 人</b></span>
          <span><MapPin /><b>{filters.distance} km</b></span>
        </div>
        <div className="ready-tags">
          {filters.preferences.map((tag) => <i key={tag}>喜好 · {tag}</i>)}
          {filters.exclusions.map((tag) => <i className="exclude" key={tag}>排斥 · {tag}</i>)}
        </div>
      </div>
      <div className="ready-agent-pair">
        <span><i className="lime-agent"><CircleDollarSign /></i><b>CP 值獵人</b><small>價格、距離、喜好</small></span>
        <span><i className="blue-agent"><Sparkles /></i><b>零元獵人</b><small>免費、資格、時間</small></span>
      </div>
      <div className="ready-mode">目前模式：<b>{modes[mode].title}</b></div>
      <button className="primary-action flow-action ready-start" onClick={onStart}>
        <Radar />
        開始探索
        <ArrowRight />
      </button>
      <button className="secondary-action ready-edit" onClick={onEdit}>
        <Pencil />返回修改條件
      </button>
    </section>
  );
}

function HomeScreen({
  profile,
  mode,
  filters,
  need,
  locationStatus,
  savedCount,
  onMode,
  onNeed,
  onVoice,
  recording,
  onConfirm,
  onProfile,
  onAnalytics,
  onTeam,
  onGuide,
}: {
  profile: Profile;
  mode: Mode;
  filters: Filters;
  need: string;
  locationStatus: string;
  savedCount: number;
  onMode: (m: Mode) => void;
  onNeed: (s: string) => void;
  onVoice: () => void;
  recording: boolean;
  onConfirm: () => void;
  onProfile: () => void;
  onAnalytics: () => void;
  onTeam: () => void;
  onGuide: () => void;
}) {
  const [promptIndex, setPromptIndex] = useState(0);
  const [typedPrompt, setTypedPrompt] = useState('');
  const [deletingPrompt, setDeletingPrompt] = useState(false);
  useEffect(() => {
    const target = homePrompts[promptIndex];
    const complete = typedPrompt === target;
    const empty = typedPrompt.length === 0;
    const delay = complete && !deletingPrompt ? 1_900 : deletingPrompt ? 38 : 72;
    const timer = window.setTimeout(() => {
      if (complete && !deletingPrompt) {
        setDeletingPrompt(true);
        return;
      }
      if (empty && deletingPrompt) {
        setDeletingPrompt(false);
        setPromptIndex((current) => (current + 1) % homePrompts.length);
        return;
      }
      setTypedPrompt(
        target.slice(0, typedPrompt.length + (deletingPrompt ? -1 : 1)),
      );
    }, delay);
    return () => window.clearTimeout(timer);
  }, [deletingPrompt, promptIndex, typedPrompt]);
  function nextPrompt() {
    setTypedPrompt('');
    setDeletingPrompt(false);
    setPromptIndex((current) => (current + 1) % homePrompts.length);
  }
  return (
    <section className="screen home-screen">
      <div className="greeting-row">
        <div className="typewriter-greeting">
          <span className="kicker">嗨，{profile.name}</span>
          <h1 aria-live="polite">
            {typedPrompt}<i />
          </h1>
          <button className="prompt-switch" onClick={nextPrompt}>
            <Sparkles />換一句
          </button>
        </div>
        <button
          className="avatar-button"
          onClick={onProfile}
          style={{ background: profile.avatar }}
          aria-label="編輯個人檔案"
        >
          {profile.name.slice(0, 1)}
        </button>
      </div>
      <button
        className="wallet-card"
        onClick={onAnalytics}
        aria-label="查看消費分析"
      >
        <div>
          <span className="wallet-label">
            <WalletCards />
            本月剩餘
          </span>
          <strong>NT$ 8,000</strong>
        </div>
        <div className="wallet-side">
          <span>本月省下</span>
          <b>NT$ 1,240</b>
          <small>查看消費分析</small>
        </div>
        <div className="wallet-progress">
          <i style={{ width: '80%' }} />
        </div>
      </button>
      <div className="mode-carousel">
        {(Object.keys(modes) as Mode[]).map((item) => (
          <button
            key={item}
            className={`mode-card ${mode === item ? 'active' : ''}`}
            onClick={() => onMode(item)}
            style={{ '--mode-color': modes[item].color } as React.CSSProperties}
          >
            <span>
              {item === 'daily' ? (
                <CircleDollarSign />
              ) : item === 'team' ? (
                <Users />
              ) : (
                <Sparkles />
              )}
            </span>
            <b>{modes[item].short}</b>
            <small>{modes[item].title}</small>
            {mode === item && <Check className="mode-check" />}
          </button>
        ))}
      </div>
      <div className="mission-card">
        <JourneyRail active={1} />
        <div className="mission-top">
          <span className="mode-dot" />
          <span>STEP 1 · 輸入需求</span>
        </div>
        <button
          className={`voice-action ${recording ? 'recording' : ''}`}
          onClick={onVoice}
        >
          <span>
            <Mic />
          </span>
          <b>{recording ? '正在聽你說…' : '用語音說需求'}</b>
          <small>按一下開始，說完會變成可編輯文字</small>
        </button>
        <label className="need-input">
          <Pencil />
          <textarea
            value={need}
            onChange={(e) => onNeed(e.target.value)}
            aria-label="文字輸入需求"
          />
          <span>輸入完成後，下一步會強制確認條件</span>
        </label>
        <div className="constraint-row">
          <span>
            {filters.date.slice(5)} {filters.time}
          </span>
          <span>NT${filters.budget}</span>
          <span>{filters.people} 人</span>
          <span>{filters.distance} km</span>
        </div>
        <button className="primary-action flow-action" onClick={onConfirm}>
          <SlidersHorizontal />
          下一步：確認需求與限制
          <ArrowRight />
        </button>
      </div>
      <button className="sop-launcher" onClick={onGuide}>
        <span className="sop-launcher-icon"><Sparkles /></span>
        <span>
          <b>新手必看 · 快速動畫教學</b>
          <small>輸入需求 → 確認需求與限制 → 開始探索</small>
        </span>
        <ChevronRight />
      </button>
      <div className="location-tip">
        <MapPin />
        <span>{locationStatus} · 距離會用於 CP 值與最大距離篩選</span>
      </div>
      <button className="quick-team" onClick={onTeam}>
        <span className="quick-icon">
          <Users />
        </span>
        <span>
          <b>附近有人正在湊團</b>
          <small>五人晚餐團還差 2 位 · 可取消</small>
        </span>
        <ChevronRight />
      </button>
      <p className="home-footnote">{savedCount} 個收藏會顯示到期提醒</p>
    </section>
  );
}

function SearchScreen({
  progress,
  filters,
}: {
  progress: number;
  filters: Filters;
}) {
  const cpProgress = Math.min(100, progress + 10);
  const zeroProgress = Math.min(100, Math.max(8, progress - 8));
  return (
    <section className="screen search-screen">
      <div className="search-orbit">
        <div className="orbit-ring ring-one" />
        <div className="orbit-ring ring-two" />
        <Radar />
        <span>{progress}%</span>
      </div>
      <span className="kicker lime-text">雙 Agent 探索中</span>
      <h1>
        CP 值獵人
        <br />
        與零元獵人出動
      </h1>
      <p>先套硬限制，再依偏好、價格與距離排序；排斥成分會標警告並放到後段。</p>
      <div className="agent-grid">
        <AgentPanel
          title="CP 值獵人"
          subtitle="付費選項搜尋"
          progress={cpProgress}
          labels={['查詢來源', '讀取證據', '正規化', 'CP 排序']}
          count="候選 18"
          passed="通過 10"
          tone="lime"
        />
        <AgentPanel
          title="零元獵人"
          subtitle="免費資源搜尋"
          progress={zeroProgress}
          labels={['查詢來源', '資格條件', '開放時間', '零元排序']}
          count="候選 8"
          passed={filters.budget === 0 ? '優先顯示' : '混合顯示'}
          tone="blue"
        />
      </div>
      <Progress value={progress} className="search-progress" />
      <div className="scan-stats">
        <span>資料 26</span>
        <span>已排除 {Math.floor(progress / 9)}</span>
        <span>候選 {Math.max(1, Math.floor(progress / 14))}</span>
      </div>
    </section>
  );
}

function AgentPanel({
  title,
  subtitle,
  progress,
  labels,
  count,
  passed,
  tone,
}: {
  title: string;
  subtitle: string;
  progress: number;
  labels: string[];
  count: string;
  passed: string;
  tone: 'lime' | 'blue';
}) {
  const activeIndex = Math.min(labels.length - 1, Math.floor(progress / 26));
  return (
    <div className={`agent-panel agent-${tone}`}>
      <div className="agent-panel-top">
        <span>
          <i />
          {title}
        </span>
        <b>{subtitle}</b>
      </div>
      <div className="agent-steps">
        {labels.map((label, index) => (
          <span key={label} className={index <= activeIndex ? 'active' : ''}>
            <small>0{index + 1}</small>
            {label}
          </span>
        ))}
      </div>
      <div className="agent-stats">
        <span>{count}</span>
        <span>{passed}</span>
      </div>
      <Progress value={progress} />
    </div>
  );
}

function CpFormulaPanel({
  params,
  onChange,
  sample,
  filters,
}: {
  params: CpParams;
  onChange: (params: CpParams) => void;
  sample?: Result;
  filters: Filters;
}) {
  const fields: Array<{ key: keyof CpParams; label: string }> = [
    { key: 'price', label: '價格' },
    { key: 'distance', label: '距離' },
    { key: 'preference', label: '喜好' },
  ];
  return (
    <details className="cp-formula">
      <summary>
        <span>
          <CircleDollarSign />
          <b>我的 CP 值公式</b>
        </span>
        <strong>
          {sample ? cpFormulaScore(sample, filters, params) : '—'}
        </strong>
      </summary>
      <p>CP = 價格分 × 權重＋距離分 × 權重＋喜好符合分 × 權重</p>
      <small>先依喜好分組；含排斥成分的選項標示警告並排到後段。</small>
      <div className="formula-controls">
        {fields.map(({ key, label }) => (
          <label key={key}>
            <span>{label}</span>
            <Slider
              value={[params[key]]}
              min={0}
              max={100}
              step={5}
              onValueChange={(value) =>
                onChange({
                  ...params,
                  [key]: Array.isArray(value) ? value[0] : value,
                })
              }
            />
            <b>{params[key]}%</b>
          </label>
        ))}
      </div>
    </details>
  );
}

function TagLine({ item, filters }: { item: Result; filters: Filters }) {
  const blocked = overlap(item.tags, filters.exclusions);
  const liked = overlap(item.preferenceTags, filters.preferences);
  return (
    <span className="result-tags">
      {blocked.length > 0 && (
        <b className="warning-tag">注意：含 {blocked.join('、')}</b>
      )}
      {liked.map((tag) => (
        <i key={tag}>符合 {tag}</i>
      ))}
      {item.agent === 'zero' && <i className="zero-tag">零元獵人</i>}
    </span>
  );
}

function ResultsScreen({
  items,
  filters,
  cpParams,
  sort,
  saved,
  onSort,
  onFiltersChange,
  onCpParams,
  onFilters,
  onOpen,
  onSave,
}: {
  items: Result[];
  filters: Filters;
  cpParams: CpParams;
  sort: Sort;
  saved: string[];
  onSort: (s: Sort) => void;
  onFiltersChange: (f: Filters) => void;
  onCpParams: (p: CpParams) => void;
  onFilters: () => void;
  onOpen: (id: string) => void;
  onSave: (id: string) => void;
}) {
  return (
    <section className="screen results-screen">
      <div className="results-intro">
        <span className="kicker">符合硬限制 · 圓山 {filters.distance} KM</span>
        <h1>
          {items.length
            ? `找到 ${items.length} 個可行選擇`
            : '目前沒有完全符合'}
        </h1>
        <p>
          {filters.date.slice(5)} {filters.time} · {filters.people} 人 · 預算
          NT${filters.budget}
        </p>
      </div>
      <div className="filter-row">
        <button className="filter-summary" onClick={onFilters}>
          <SlidersHorizontal />
          {filters.category} · {filters.preferences.slice(0, 1).join('')}
        </button>
        <button
          className="sort-button"
          onClick={() =>
            onSort(sort === 'cp' ? 'cost' : sort === 'cost' ? 'distance' : 'cp')
          }
        >
          {sort === 'cp'
            ? 'CP 優先'
            : sort === 'cost'
              ? '價格優先'
              : '距離優先'}
        </button>
      </div>
      <div className="category-tabs">
        {(
          ['全部', '餐飲', '日用', '育樂', '交通'] as Filters['category'][]
        ).map((category) => (
          <button
            key={category}
            className={filters.category === category ? 'active' : ''}
            onClick={() => onFiltersChange({ ...filters, category })}
          >
            {category}
          </button>
        ))}
      </div>
      <CpFormulaPanel
        params={cpParams}
        onChange={onCpParams}
        sample={items[0]}
        filters={filters}
      />
      {items.length === 0 ? (
        <div className="empty-state">
          <SlidersHorizontal />
          <h2>試著放寬一個條件</h2>
          <p>提高預算、距離，或切換其他類別。</p>
          <button onClick={onFilters}>修改篩選</button>
        </div>
      ) : (
        <div className="result-list">
          {items.map((item, index) => (
            <article key={item.id} className={`result-card tone-${item.tone}`}>
              <button className="result-open" onClick={() => onOpen(item.id)}>
                {item.image && item.imageKind === 'verified-real' ? (
                  <Image
                    src={item.image}
                    alt={`${item.provider}實景`}
                    width={112}
                    height={196}
                  />
                ) : (
                  <div className="result-art">
                    {categoryIcon(item.category)}
                    <span>{item.category}</span>
                  </div>
                )}
                <span className="result-body">
                  <span className="result-meta">
                    <span>
                      0{index + 1} · {item.subcategory}
                    </span>
                    <span>
                      <ShieldCheck />
                      {item.reliability}%
                    </span>
                  </span>
                  <span className="result-title">{item.title}</span>
                  <span className="result-copy">
                    {item.provider} · {item.distanceKm} km · {item.hours}
                  </span>
                  <span className="price-row">
                    <strong>
                      <small>NT$</small>
                      {money(item.totalCost)}
                    </strong>
                    <span>
                      人均 <b>{money(item.totalCost / item.servings)}</b>
                    </span>
                    <span>
                      CP <b>{cpFormulaScore(item, filters, cpParams)}</b>
                    </span>
                  </span>
                  <span className="result-condition">
                    <Clock3 />
                    {item.condition}
                  </span>
                  <TagLine item={item} filters={filters} />
                </span>
              </button>
              <button
                className={`save-fab ${saved.includes(item.id) ? 'saved' : ''}`}
                onClick={() => onSave(item.id)}
                aria-label="收藏"
              >
                <Heart />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function DetailScreen({
  item,
  itemScore,
  cpParams,
  filters,
  saved,
  onSave,
  onEvidence,
  onMap,
  onReport,
  onShare,
}: {
  item: Result;
  itemScore: number | null;
  cpParams: CpParams;
  filters: Filters;
  saved: boolean;
  onSave: () => void;
  onEvidence: () => void;
  onMap: () => void;
  onReport: () => void;
  onShare: () => void;
}) {
  const saving = Math.max(
    0,
    (item.benchmarkCost ?? item.totalCost) - item.totalCost,
  );
  return (
    <section className="screen detail-screen">
      {item.image && item.imageKind === 'verified-real' ? (
        <div className="detail-image">
          <Image
            src={item.image}
            alt={`${item.provider}實景`}
            width={430}
            height={230}
            priority
          />
          <span className="image-badge">
            <ShieldCheck />
            有來源資料
          </span>
        </div>
      ) : (
        <div className={`detail-hero tone-${item.tone}`}>
          {categoryIcon(item.category)}
          <span>{item.category}</span>
        </div>
      )}
      <div className="detail-content">
        <span className="kicker">
          {item.provider} · {item.subcategory}
        </span>
        <h1>{item.title}</h1>
        <p className="detail-meta">
          <MapPin />
          {item.distanceKm} km · 步行約 {item.walkMin} 分鐘 ·{' '}
          {item.serviceModes.join('／')}
        </p>
        <div className="detail-score">
          <div>
            <span>總成本估算</span>
            <strong>NT${money(item.totalCost)}</strong>
            <small>人均 NT${money(item.totalCost / item.servings)}</small>
          </div>
          <div>
            <span>個人 CP</span>
            <strong>{itemScore}</strong>
            <small>符合目前偏好</small>
          </div>
        </div>
        <div className="detail-formula">
          CP = 價格 × {cpParams.price}% ＋ 距離 × {cpParams.distance}% ＋ 喜好 ×{' '}
          {cpParams.preference}%
        </div>
        <TagLine item={item} filters={filters} />
        {item.benchmarkCost && (
          <div className="saving-card">
            <BadgePercent />
            <span>
              <b>比參考方案省 NT${money(saving)}</b>
              <small>
                基準 NT${money(item.benchmarkCost)} · 同人數／同需求估算
              </small>
            </span>
            <strong>{Math.round((saving / item.benchmarkCost) * 100)}%</strong>
          </div>
        )}
        <div className="facts-grid">
          <Metric label="營業／時段" value={item.hours} />
          <Metric label="資料確認" value={item.verifiedAt} />
          <Metric label="使用者回報" value={`${item.reportCount} 則`} />
          <Metric label="服務方式" value={item.serviceModes.join('、')} />
        </div>
        <div className="condition-box">
          <Zap />
          <div>
            <b>先確認這件事</b>
            <p>{item.condition}</p>
          </div>
        </div>
        <button className="evidence-button" onClick={onEvidence}>
          <ReceiptText />
          <span>
            <b>查看成本與資料依據</b>
            <small>{item.source}</small>
          </span>
          <ChevronRight />
        </button>
        <div className="detail-link-row">
          <button onClick={onMap}>
            <MapPin />
            位置交通
          </button>
          <button onClick={onReport}>
            <Flag />
            回報資訊
          </button>
        </div>
      </div>
      <div className="detail-actions glass">
        <button onClick={onSave} className={saved ? 'saved' : ''}>
          <Bookmark />
          {saved ? '已收藏' : '收藏'}
        </button>
        <button onClick={onShare}>
          <Share2 />
          分享
        </button>
        <button className="detail-primary" onClick={onSave}>
          {saved ? '已加入這次清單' : '加入這次清單'}
        </button>
      </div>
    </section>
  );
}

function SavedScreen({
  items,
  completed,
  budget,
  onBuy,
  onOpen,
  onRemove,
  onExplore,
  onShare,
}: {
  items: Result[];
  completed: string[];
  budget: number;
  onBuy: (id: string) => void;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onExplore: () => void;
  onShare: () => void;
}) {
  const total = items.reduce((sum, item) => sum + item.totalCost, 0);
  const bought = items
    .filter((item) => completed.includes(item.id))
    .reduce((sum, item) => sum + item.totalCost, 0);
  return (
    <section className="screen saved-screen">
      <span className="kicker">THIS PLAN</span>
      <h1>這次清單</h1>
      <p>收藏、到期提醒、已買與成本一起管理。</p>
      {items.length === 0 ? (
        <div className="empty-state">
          <Bookmark />
          <h2>還沒有清單項目</h2>
          <p>從結果加入想去、想買或想比較的選項。</p>
          <button onClick={onExplore}>開始探索</button>
        </div>
      ) : (
        <>
          <div className="list-budget">
            <span>
              <b>預計 NT${money(total)}</b>
              <small>
                預算 NT${money(budget)} ·{' '}
                {total <= budget
                  ? `還有 NT$${money(budget - total)}`
                  : `超出 NT$${money(total - budget)}`}
              </small>
            </span>
            <strong>已花 NT${money(bought)}</strong>
          </div>
          <div className="checklist">
            {items.map((item) => (
              <div
                key={item.id}
                className={completed.includes(item.id) ? 'done' : ''}
              >
                <button className="check-button" onClick={() => onBuy(item.id)}>
                  {completed.includes(item.id) && <Check />}
                </button>
                <button className="check-copy" onClick={() => onOpen(item.id)}>
                  <b>{item.title}</b>
                  <span>
                    {item.expiresAt ? `提醒：${item.expiresAt}` : item.provider}
                  </span>
                </button>
                <strong>NT${money(item.totalCost)}</strong>
                <button
                  className="remove-button"
                  onClick={() => onRemove(item.id)}
                  aria-label={`移除 ${item.title}`}
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
          <div className="list-summary">
            <span>
              已買{' '}
              {
                completed.filter((id) => items.some((item) => item.id === id))
                  .length
              }{' '}
              / {items.length}
            </span>
            <Progress
              value={
                items.length
                  ? (completed.filter((id) =>
                      items.some((item) => item.id === id),
                    ).length /
                      items.length) *
                    100
                  : 0
              }
            />
          </div>
          <button className="primary-action" onClick={onShare}>
            <Share2 />
            分享這次清單
          </button>
        </>
      )}
    </section>
  );
}

function TeamScreen({
  count,
  joined,
  onJoin,
  onCancel,
  onShare,
}: {
  count: number;
  joined: boolean;
  onJoin: () => void;
  onCancel: () => void;
  onShare: () => void;
}) {
  const target = 5;
  const done = count >= target;
  const soloUnit = 100;
  const groupUnit = 85;
  return (
    <section className="screen team-screen">
      <span className="kicker">GROUP ORDER</span>
      <h1>一起省更多</h1>
      <p>先看清楚內容、門檻、截止與取消規則再承諾。</p>
      <div className={`team-campaign ${done ? 'complete' : ''}`}>
        <div className="campaign-top">
          <span className="campaign-logo">
            <Users />
          </span>
          <span>
            <small>今天 19:00 截止</small>
            <b>大龍峒晚餐五人團</b>
          </span>
          <span className="live-chip">{done ? '已成團' : '揪團中'}</span>
        </div>
        <div className="order-contents">
          <b>每人餐點</b>
          <span>簡家肉圓 × 1</span>
          <span>綜合湯 × 1</span>
          <small>實際供應與品項以店家確認為準</small>
        </div>
        <div className="comparison-grid">
          <div>
            <span>單獨買</span>
            <strong>NT${soloUnit}</strong>
            <small>每人</small>
          </div>
          <div>
            <span>成團後</span>
            <strong>NT${groupUnit}</strong>
            <small>每人省 NT${soloUnit - groupUnit}</small>
          </div>
          <div>
            <span>五人總計</span>
            <strong>NT${target * groupUnit}</strong>
            <small>達門檻才成立</small>
          </div>
        </div>
        <div className="people-row">
          {Array.from({ length: target }).map((_, index) => (
            <span key={index} className={index < count ? 'filled' : ''}>
              {index < count ? ['美', '凱', '安', '你', '倫'][index] : '＋'}
            </span>
          ))}
        </div>
        <div className="campaign-progress">
          <span>{done ? '已達成團門檻' : `還差 ${target - count} 人成團`}</span>
          <b>
            {count} / {target}
          </b>
        </div>
        <Progress value={(count / target) * 100} />
        {joined ? (
          <div className="joined-actions">
            <button className="primary-action violet-action" disabled={done}>
              <Check />
              {done ? '成團成功' : '你已承諾'}
            </button>
            {!done && (
              <button className="cancel-button" onClick={onCancel}>
                截止前取消
              </button>
            )}
          </div>
        ) : (
          <button className="primary-action violet-action" onClick={onJoin}>
            <Zap />
            加入這一團
          </button>
        )}
      </div>
      <button className="invite-button" onClick={onShare}>
        <Share2 />
        分享訂單給朋友
      </button>
      <div className="more-teams">
        <button>
          <span className="campaign-logo transport">
            <Bike />
          </span>
          <span>
            <b>夜間計程車順風團</b>
            <small>22:10 圓山站出發 · 2 / 4 人</small>
          </span>
          <strong>每人約 NT$40</strong>
        </button>
        <button>
          <span className="campaign-logo food">
            <Utensils />
          </span>
          <span>
            <b>週末早午餐併桌</b>
            <small>明天 11:30 · 3 / 6 人</small>
          </span>
          <strong>預估省 18%</strong>
        </button>
        <button>
          <span className="campaign-logo daily">
            <ShoppingBag />
          </span>
          <span>
            <b>日用品箱購分攤</b>
            <small>今晚截止 · 4 / 5 人</small>
          </span>
          <strong>還差 1 人</strong>
        </button>
      </div>
      <div className="team-note">
        <ShieldCheck />
        <div>
          <b>不代付、不下單</b>
          <p>目前只模擬承諾與成本；達標後仍由發起人向店家確認。</p>
        </div>
      </div>
    </section>
  );
}

function FiltersScreen({
  filters,
  need,
  onNeed,
  onChange,
  followCurrentTime,
  onFollowCurrentTime,
  onApply,
}: {
  filters: Filters;
  need: string;
  onNeed: (s: string) => void;
  onChange: (f: Filters) => void;
  followCurrentTime: boolean;
  onFollowCurrentTime: (follow: boolean) => void;
  onApply: () => void;
}) {
  return (
    <section className="screen filters-screen">
      <JourneyRail active={2} />
      <span className="kicker">STEP 02 · CONFIRM</span>
      <h1>確認需求與限制</h1>
      <p>請逐項確認；日期、時間、預算與距離是硬限制，喜好只影響排序。</p>
      <label className="field-label">
        需求
        <textarea value={need} onChange={(e) => onNeed(e.target.value)} />
      </label>
      <div className="compact-grid">
        <label className="field-label">
          <CalendarDays />
          日期
          <input
            type="date"
            value={filters.date}
            onChange={(e) => {
              onFollowCurrentTime(false);
              onChange({ ...filters, date: e.target.value });
            }}
          />
        </label>
        <label className="field-label">
          <Clock3 />
          時段
          <input
            type="time"
            value={filters.time}
            onChange={(e) => {
              onFollowCurrentTime(false);
              onChange({ ...filters, time: e.target.value });
            }}
          />
        </label>
        <label className="field-label">
          預算
          <input
            type="number"
            min="0"
            step="50"
            value={filters.budget}
            onChange={(e) =>
              onChange({ ...filters, budget: Number(e.target.value) })
            }
          />
        </label>
        <label className="field-label">
          人數
          <input
            type="number"
            min="1"
            max="10"
            value={filters.people}
            onChange={(e) =>
              onChange({ ...filters, people: Number(e.target.value) })
            }
          />
        </label>
      </div>
      <button
        className={`live-time-button ${followCurrentTime ? 'active' : ''}`}
        onClick={() => {
          const now = taipeiDateTime();
          onFollowCurrentTime(true);
          onChange({ ...filters, date: now.date, time: now.time });
        }}
      >
        <Clock3 />
        {followCurrentTime ? '正在跟隨台北即時時間' : '改用現在時間'}
        <i />
      </button>
      <div className="setting-group distance-setting">
        <div className="setting-label">
          <span>最大距離</span>
          <strong>{filters.distance} km</strong>
        </div>
        <Slider
          value={[filters.distance]}
          min={0.5}
          max={5}
          step={0.5}
          onValueChange={(value) =>
            onChange({
              ...filters,
              distance: Array.isArray(value) ? value[0] : value,
            })
          }
        />
        <p className="slider-tip">
          拖曳亮綠色圓點調整搜尋半徑；距離越短，CP 距離分越高。
        </p>
      </div>
      <TagPicker
        title="類別"
        values={['全部', '餐飲', '日用', '育樂', '交通']}
        selected={[filters.category]}
        single
        onChange={(values) =>
          onChange({ ...filters, category: values[0] as Filters['category'] })
        }
      />
      <TagPicker
        title="硬排除"
        values={['堅果', '牛肉', '海鮮', '麩質', '乳製品', '辣']}
        selected={filters.exclusions}
        onChange={(exclusions) => onChange({ ...filters, exclusions })}
      />
      <TagPicker
        title="喜好"
        values={['安靜', '能坐', '不用等', '有冷氣', '少走路', '可外帶']}
        selected={filters.preferences}
        onChange={(preferences) => onChange({ ...filters, preferences })}
      />
      <button className="primary-action" onClick={onApply}>
        <Check />
        確認完成，前往開始探索
        <ArrowRight />
      </button>
    </section>
  );
}

function ProfileScreen({
  profile,
  onChange,
  onDone,
}: {
  profile: Profile;
  onChange: (p: Profile) => void;
  onDone: () => void;
}) {
  const colors = ['#c9ff36', '#36a8ff', '#ff5d5d', '#8b5cff', '#ffca42'];
  return (
    <section className="screen profile-screen">
      <span className="kicker">PROFILE</span>
      <h1>個人檔案</h1>
      <p>匿名也可以設定暱稱與頭像顏色。</p>
      <div
        className="avatar-preview profile-avatar"
        style={{ background: profile.avatar }}
      >
        {profile.name.slice(0, 1) || '你'}
        <Camera />
      </div>
      <label className="field-label">
        暱稱
        <input
          value={profile.name}
          maxLength={12}
          onChange={(e) => onChange({ ...profile, name: e.target.value })}
        />
      </label>
      <div className="avatar-colors">
        <span>頭像顏色</span>
        <div>
          {colors.map((color) => (
            <button
              key={color}
              className={profile.avatar === color ? 'active' : ''}
              style={{ background: color }}
              onClick={() => onChange({ ...profile, avatar: color })}
              aria-label={`選擇 ${color}`}
            />
          ))}
        </div>
      </div>
      <div className="account-card">
        <UserRound />
        <span>
          <b>{profile.signedIn ? '已登入' : '匿名使用中'}</b>
          <small>
            {profile.signedIn
              ? '未來接上 Auth API 後可跨裝置同步'
              : '不需要帳號；資料只留在此裝置'}
          </small>
        </span>
        <button
          onClick={() => onChange({ ...profile, signedIn: !profile.signedIn })}
        >
          {profile.signedIn ? '登出' : '登入'}
        </button>
      </div>
      <button className="primary-action" onClick={onDone}>
        <Check />
        儲存檔案
      </button>
    </section>
  );
}

function SettingsScreen({
  profile,
  filters,
  mode,
  reminders,
  pwaStatus,
  onProfile,
  onFilters,
  onMode,
  onReminders,
  onAnalytics,
  onHistory,
  onInstall,
  onDone,
}: {
  profile: Profile;
  filters: Filters;
  mode: Mode;
  reminders: boolean;
  pwaStatus: string;
  onProfile: () => void;
  onFilters: () => void;
  onMode: (m: Mode) => void;
  onReminders: (v: boolean) => void;
  onAnalytics: () => void;
  onHistory: () => void;
  onInstall: () => void;
  onDone: () => void;
}) {
  return (
    <section className="screen settings-screen">
      <span className="kicker">PERSONAL RULES</span>
      <h1>設定</h1>
      <p>個人檔案、預算、偏好與提醒集中在這裡。</p>
      <button className="profile-summary" onClick={onProfile}>
        <span className="mini-avatar" style={{ background: profile.avatar }}>
          {profile.name.slice(0, 1)}
        </span>
        <span>
          <b>{profile.name}</b>
          <small>{profile.signedIn ? '登入保存' : '匿名使用'}</small>
        </span>
        <Pencil />
      </button>
      <button className="setting-row" onClick={onFilters}>
        <SlidersHorizontal />
        <span>
          <b>需求與限制</b>
          <small>
            NT${filters.budget} · {filters.people} 人 · {filters.distance} km
          </small>
        </span>
        <ChevronRight />
      </button>
      <div className="setting-group mode-setting">
        <span className="setting-title">預設模式</span>
        <div className="setting-modes">
          {(Object.keys(modes) as Mode[]).map((item) => (
            <button
              key={item}
              className={mode === item ? 'active' : ''}
              onClick={() => onMode(item)}
            >
              {modes[item].short}
            </button>
          ))}
        </div>
      </div>
      <button className="setting-row" onClick={onAnalytics}>
        <ChartNoAxesCombined />
        <span>
          <b>消費分析</b>
          <small>預算、類別與節省比較</small>
        </span>
        <ChevronRight />
      </button>
      <button className="setting-row" onClick={onHistory}>
        <History />
        <span>
          <b>歷史紀錄</b>
          <small>保留已買、收藏與過去選擇</small>
        </span>
        <ChevronRight />
      </button>
      <div className="setting-row">
        <BellRing />
        <span>
          <b>收藏到期提醒</b>
          <small>在截止前顯示通知</small>
        </span>
        <button
          className={`toggle ${reminders ? 'active' : ''}`}
          onClick={() => onReminders(!reminders)}
          aria-label="切換提醒"
        >
          <i />
        </button>
      </div>
      <div className="pwa-card">
        <PackageCheck />
        <span>
          <b>安裝 ALL IN LIFE</b>
          <small>{pwaStatus}</small>
        </span>
        <button onClick={onInstall}>安裝</button>
      </div>
      <button className="primary-action" onClick={onDone}>
        完成
        <Check />
      </button>
    </section>
  );
}

function NotificationsScreen({
  unread,
  reminders,
  onRead,
  onOpen,
}: {
  unread: number;
  reminders: boolean;
  onRead: () => void;
  onOpen: (v: View) => void;
}) {
  return (
    <section className="screen notifications-screen">
      <div className="section-heading">
        <div>
          <span className="kicker">INBOX</span>
          <h1>通知</h1>
        </div>
        {unread > 0 && <button onClick={onRead}>全部已讀</button>}
      </div>
      <p>
        {reminders
          ? '收藏到期與成團進度會出現在這裡。'
          : '到期提醒目前已關閉。'}
      </p>
      <div className="notification-list">
        <button className="unread" onClick={() => onOpen('detail')}>
          <span className="notify-icon coral">
            <Clock3 />
          </span>
          <span>
            <b>北美館免費時段即將開始</b>
            <small>今天 17:00 後停止售票 · 12 分鐘前</small>
          </span>
          <i />
        </button>
        <button className="unread" onClick={() => onOpen('team')}>
          <span className="notify-icon violet">
            <Users />
          </span>
          <span>
            <b>晚餐團還差 2 人</b>
            <small>今天 19:00 截止 · 28 分鐘前</small>
          </span>
          <i />
        </button>
        <button className="unread" onClick={() => onOpen('saved')}>
          <span className="notify-icon lime">
            <Bookmark />
          </span>
          <span>
            <b>你有清單項目待確認</b>
            <small>出發前記得核對價格與營業時間</small>
          </span>
          <i />
        </button>
        <button onClick={() => onOpen('analytics')}>
          <span className="notify-icon blue">
            <ChartNoAxesCombined />
          </span>
          <span>
            <b>本週比參考方案省 NT$112</b>
            <small>查看消費分析</small>
          </span>
        </button>
      </div>
    </section>
  );
}

function AnalyticsScreen({
  transactions,
  budget,
  onHistory,
}: {
  transactions: Transaction[];
  budget: number;
  onHistory: () => void;
}) {
  const spent = transactions.reduce((sum, item) => sum + item.amount, 0);
  const saved = transactions.reduce((sum, item) => sum + item.saved, 0);
  const categories: Category[] = ['餐飲', '日用', '育樂', '交通'];
  const palette: Record<Category, string> = {
    餐飲: 'var(--lime)',
    日用: 'var(--coral)',
    育樂: 'var(--blue)',
    交通: 'var(--violet)',
  };
  return (
    <section className="screen analytics-screen">
      <span className="kicker">SEPTEMBER</span>
      <h1>消費分析</h1>
      <p>讓預算、實際花費與省下的金額一眼看懂。</p>
      <div className="analytics-hero">
        <span>本月剩餘</span>
        <strong>NT$ {money(budget - spent)}</strong>
        <small>
          已花 NT${money(spent)} ／ 預算 NT${money(budget)}
        </small>
        <Progress value={(spent / budget) * 100} />
      </div>
      <div className="kpi-grid">
        <div>
          <span>本月省下</span>
          <strong>NT${money(saved)}</strong>
          <small>與可比基準相比</small>
        </div>
        <div>
          <span>平均每次</span>
          <strong>NT${money(spent / Math.max(1, transactions.length))}</strong>
          <small>{transactions.length} 筆紀錄</small>
        </div>
      </div>
      <div className="category-chart">
        <div className="section-heading">
          <h2>類別分布</h2>
          <span>NT${money(spent)}</span>
        </div>
        {categories.map((category) => {
          const amount = transactions
            .filter((item) => item.category === category)
            .reduce((sum, item) => sum + item.amount, 0);
          return (
            <div key={category}>
              <span>{category}</span>
              <i>
                <b
                  style={{
                    width: `${spent ? Math.max(4, (amount / spent) * 100) : 0}%`,
                    background: palette[category],
                  }}
                />
              </i>
              <strong>NT${money(amount)}</strong>
            </div>
          );
        })}
      </div>
      <button className="setting-row" onClick={onHistory}>
        <History />
        <span>
          <b>查看全部歷史</b>
          <small>已買、日期、成本與節省</small>
        </span>
        <ChevronRight />
      </button>
    </section>
  );
}

function HistoryScreen({
  transactions,
  onOpen,
}: {
  transactions: Transaction[];
  onOpen: (id: string) => void;
}) {
  return (
    <section className="screen history-screen">
      <span className="kicker">ACTIVITY</span>
      <h1>歷史紀錄</h1>
      <p>日後推薦會參考你主動標記的收藏與購買。</p>
      <div className="history-list">
        {transactions.map((item) => {
          const targetId = item.id.startsWith('buy-')
            ? item.id.replace('buy-', '')
            : item.category === '交通'
              ? 'taxi-share'
              : item.category === '育樂'
                ? 'tfam'
                : 'daily-store';
          return (
            <button
              className="history-entry"
              key={item.id}
              onClick={() => onOpen(targetId)}
            >
              <span className="history-icon">
                {categoryIcon(item.category)}
              </span>
              <span>
                <b>{item.title}</b>
                <small>
                  {item.date} · {item.category}
                </small>
              </span>
              <span>
                <strong>NT${money(item.amount)}</strong>
                <small>省 NT${money(item.saved)}</small>
              </span>
              <ChevronRight />
            </button>
          );
        })}
      </div>
      <div className="privacy-note">
        <ShieldCheck />
        <span>
          <b>你可以控制推薦資料</b>
          <small>正式登入版會提供刪除紀錄與停止個人化。</small>
        </span>
      </div>
    </section>
  );
}

function ReportScreen({
  item,
  onSubmit,
}: {
  item: Result;
  onSubmit: () => void;
}) {
  const [type, setType] = useState('營業時間不同');
  const [note, setNote] = useState('');
  return (
    <section className="screen report-screen">
      <span className="kicker">COMMUNITY REPORT</span>
      <h1>回報資訊</h1>
      <p>{item.provider}</p>
      <TagPicker
        title="問題類型"
        values={['營業時間不同', '價格不同', '已停業', '優惠失效', '其他']}
        selected={[type]}
        single
        onChange={(values) => setType(values[0])}
      />
      <label className="field-label">
        補充說明
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="例如：今天 19:30 到店時已打烊"
        />
      </label>
      <div className="report-note">
        <ShieldCheck />
        <p>
          回報會先進入待確認狀態，不會直接覆蓋現有資料；請勿填寫姓名、電話或其他個資。
        </p>
      </div>
      <button className="primary-action" onClick={onSubmit}>
        <Flag />
        送出回報
      </button>
    </section>
  );
}

function MapScreen({ item, onOpen }: { item: Result; onOpen: () => void }) {
  return (
    <section className="screen map-screen">
      <iframe
        title="圓山地圖"
        src={`https://www.google.com/maps?q=${encodeURIComponent(item.mapQuery)}&output=embed`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <div className="map-card glass">
        <span className="map-pin">
          <MapPin />
        </span>
        <div>
          <span className="kicker">目的地</span>
          <h2>{item.title}</h2>
          <p>
            {item.distanceKm} km · 步行約 {item.walkMin} 分鐘
          </p>
        </div>
        <button onClick={onOpen}>
          <ChevronRight />
        </button>
      </div>
      <a
        className="maps-link"
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.mapQuery)}`}
        target="_blank"
        rel="noreferrer"
      >
        用 Google Maps 開啟
        <ExternalLink />
      </a>
    </section>
  );
}

function BottomNav({
  view,
  savedCount,
  onNavigate,
}: {
  view: View;
  savedCount: number;
  onNavigate: (v: View) => void;
}) {
  const items: Array<{ view: View; label: string; icon: ReactNode }> = [
    { view: 'home', label: '首頁', icon: <Home /> },
    { view: 'results', label: '探索', icon: <Compass /> },
    { view: 'saved', label: '清單', icon: <Bookmark /> },
    { view: 'team', label: '揪團', icon: <Users /> },
    { view: 'analytics', label: '分析', icon: <ChartNoAxesCombined /> },
  ];
  return (
    <nav className="bottom-nav glass">
      {items.map((item) => (
        <button
          key={item.view}
          className={view === item.view ? 'active' : ''}
          onClick={() => onNavigate(item.view)}
        >
          {item.icon}
          <span>{item.label}</span>
          {item.view === 'saved' && savedCount > 0 && <i>{savedCount}</i>}
        </button>
      ))}
    </nav>
  );
}

function TagPicker({
  title,
  values,
  selected,
  single = false,
  onChange,
}: {
  title: string;
  values: string[];
  selected: string[];
  single?: boolean;
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="tag-picker">
      <span>{title}</span>
      <div>
        {values.map((value) => {
          const active = selected.includes(value);
          return (
            <button
              key={value}
              className={active ? 'active' : ''}
              onClick={() =>
                onChange(
                  single
                    ? [value]
                    : active
                      ? selected.filter((item) => item !== value)
                      : [...selected, value],
                )
              }
            >
              {active && <Check />}
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
