'use client';

import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  BadgePercent,
  Bell,
  BellRing,
  Bike,
  Bookmark,
  CalendarDays,
  Camera,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Compass,
  Copy,
  Database,
  Download,
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
  Radar,
  ReceiptText,
  Share2,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Smartphone,
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
import { BackgroundMusicToggle } from '@/components/background-music-toggle';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  catalogCategories,
  categoryLabels,
  type CatalogCategoryLabel,
  type CatalogCategorySummary,
  type CatalogDataSource,
  type CatalogItem,
  type CatalogSearchResponse,
  type CatalogSummaryResponse,
} from '@/lib/catalog-contract';
import {
  AccountClientError,
  authenticateAccount,
  clearAccountToken,
  endAccountSession,
  readAccountToken,
  restoreAccountSession,
  saveAccountData,
} from '@/lib/account-client';
import {
  ACCOUNT_PASSWORD_MIN_LENGTH,
  ACCOUNT_USERNAME_PATTERN,
  type AccountDataEnvelope,
  type AccountUser,
} from '@/lib/account-contract';
import { type CpDimension } from '@/lib/cp-engine';
import {
  calculatePersonalCpScore,
  rebalancePersonalCpWeights,
} from '@/lib/personal-cp.mjs';
import {
  reportsForSubject,
  summarizeCommunityReports,
} from '@/lib/community-reports.mjs';
import { useBackgroundMusic } from '@/lib/use-background-music';

type View =
  | 'welcome'
  | 'account'
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
type ExperienceMode = 'demo' | 'account';
type CatalogDisplaySource = CatalogDataSource | 'checking' | 'demo';
type ResultProvenance =
  | 'verified-real'
  | 'real'
  | 'verified-demo'
  | 'simulated';
type Category = CatalogCategoryLabel;
type Sort = 'cp' | 'cost' | 'distance';
type SearchStatus =
  | 'idle'
  | 'validating'
  | 'loading'
  | 'ranking'
  | 'success'
  | 'empty'
  | 'error';
type LocationPermission =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'declined'
  | 'denied';
type ToastAction = { label: string; run: () => void };
type GeoPoint = { latitude: number; longitude: number };
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
type AiParseStatus = 'idle' | 'loading' | 'success' | 'unavailable';
type AiSearchCategory =
  | 'FOOD'
  | 'DAILY_GOODS'
  | 'FREE_RESOURCE'
  | 'EVENT'
  | 'TRANSPORT';
type AiSearchConstraints = {
  query: string;
  date: string | null;
  time: string | null;
  category: AiSearchCategory | null;
  budgetTwd: number | null;
  partySize: number | null;
  maxDistanceM: number | null;
  hardExclusions: string[];
  softPreferences: string[];
  mobility: string[];
};
type AiParseResponse = {
  ok: boolean;
  source: 'openai' | 'fallback';
  constraints: AiSearchConstraints;
  assumptions: string[];
  missingFields: string[];
  confidence: number;
};
type AiExplanation = {
  headline: string;
  reasons: string[];
  caution: string | null;
  source: 'openai' | 'fallback';
};
type AiExplainResponse = {
  ok: boolean;
  source: 'openai' | 'fallback';
  items: Array<Omit<AiExplanation, 'source'> & { id: string }>;
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const isAiParseResponse = (value: unknown): value is AiParseResponse => {
  if (!isRecord(value) || value.ok !== true || value.source !== 'openai')
    return false;
  const constraints = value.constraints;
  if (!isRecord(constraints)) return false;
  return (
    typeof constraints.query === 'string' &&
    (constraints.category === null ||
      (typeof constraints.category === 'string' &&
        ['FOOD', 'DAILY_GOODS', 'FREE_RESOURCE', 'EVENT', 'TRANSPORT'].includes(
          constraints.category,
        ))) &&
    Array.isArray(constraints.hardExclusions) &&
    constraints.hardExclusions.every((item) => typeof item === 'string') &&
    Array.isArray(constraints.softPreferences) &&
    constraints.softPreferences.every((item) => typeof item === 'string')
  );
};
type Transaction = {
  id: string;
  resultId?: string;
  title: string;
  category: Category;
  amount: number;
  date: string;
  saved: number;
  occurredAt: string;
};
type BudgetSummary = {
  budget: number;
  spent: number;
  saved: number;
  remaining: number;
  usedPercentage: number;
  transactionCount: number;
};
type CommunityReportType =
  | '營業時間不同'
  | '價格不同'
  | '已停業'
  | '優惠失效'
  | '其他';
type CommunityReport = {
  id: string;
  subjectId: string;
  type: CommunityReportType;
  note: string;
  submittedAt: string;
  status: 'received' | 'resolved';
};
type Result = {
  id: string;
  category: Category;
  title: string;
  provider: string;
  subcategory: string;
  totalCost: number | null;
  benchmarkCost?: number | null;
  servings: number | null;
  distanceKm: number;
  walkMin: number;
  hours: string;
  serviceModes: string[];
  condition: string;
  source: string;
  sourceUrl?: string;
  evidence: string;
  reliability: number | null;
  verifiedAt: string;
  mapQuery: string;
  expiresAt?: string;
  reportCount: number | null;
  image?: string;
  imageKind?: 'verified-real';
  tags?: string[];
  preferenceTags?: string[];
  agent?: 'cp' | 'zero';
  tone: 'lime' | 'violet' | 'blue' | 'teal' | 'coral' | 'amber';
  dimensions: Partial<Record<CpDimension, number>>;
  latitude?: number | null;
  longitude?: number | null;
  dataSource?: 'demo' | CatalogDataSource;
  costReason?: string;
  costState?: CatalogItem['cost']['state'];
  verificationLabel?: string;
  provenance?: ResultProvenance;
  verifiedFields?: string[];
};
type StoredAccountState = {
  version: 1;
  saved: string[];
  savedSnapshots: Record<string, Result>;
  completed: string[];
  transactions: Transaction[];
  monthlyBudget: number;
  joinedTeam: boolean;
  teamCount: number;
  reminders: boolean;
  profile: { name: string; avatar: string };
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
    color: 'var(--teal)',
  },
};
const homePrompts = [
  '今天要解決什麼？',
  '今晚想吃得省，還是吃得爽？',
  '附近有沒有免費驚喜？',
  '想少走一點，還是多省一點？',
  '揪朋友一起，能省多少？',
];
const modeNeedExamples: Record<Mode, string> = {
  daily: '今晚兩人吃飯，可以外帶，不吃堅果',
  team: '今晚想揪 5 人吃火鍋，每人預算 NT$500',
  zero: '今晚想找圓山附近的免費活動，最好有冷氣',
};
const publicAppUrl = 'https://all-in-life-ail.chiehlun.chatgpt.site/';
const publicAppHost = new URL(publicAppUrl).host;
const copyText = async (text: string) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 部分 in-app browser 會拒絕 Clipboard API，改走選取文字備援。
  }

  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  // oxlint-disable-next-line typescript/no-deprecated -- Required fallback for embedded browsers that block Clipboard API.
  const copied = document.execCommand('copy');
  field.remove();
  return copied;
};
const resultCategories: Category[] = categoryLabels;
const categoryColors: Record<Category, string> = {
  食品: 'var(--lime)',
  日用品: 'var(--amber)',
  '免費／公益資源': 'var(--teal)',
  活動: 'var(--violet)',
  交通: 'var(--blue)',
};
const categoryTones: Record<Category, Result['tone']> = {
  食品: 'lime',
  日用品: 'amber',
  '免費／公益資源': 'teal',
  活動: 'violet',
  交通: 'blue',
};
const sortOptions: { value: Sort; label: string; hint: string }[] = [
  { value: 'cp', label: 'CP 值優先', hint: '綜合價格、距離與喜好' },
  { value: 'cost', label: '價格優先', hint: '總成本低的優先' },
  { value: 'distance', label: '距離優先', hint: '離你近的優先' },
];
const demoFixtures: Result[] = [
  {
    id: 'jianjia',
    category: '食品',
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
    category: '食品',
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
    category: '免費／公益資源',
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
    category: '免費／公益資源',
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
    category: '活動',
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
    category: '日用品',
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
    category: '食品',
    title: '圓山麵食快餐方案',
    provider: '圓山生活圈餐飲資料',
    subcategory: '麵食／快速晚餐',
    totalCost: 220,
    benchmarkCost: 300,
    servings: 2,
    distanceKm: 0.55,
    walkMin: 7,
    hours: '11:00–20:30',
    serviceModes: ['內用', '外帶'],
    condition: '依餐飲資料的價格帶與營業時段整理；店名與供應需再確認',
    source: '圓山生活圈餐飲資料 / 02_Places',
    sourceUrl: 'https://www.google.com/maps/search/?api=1&query=圓山 麵食',
    evidence:
      '02_Places 收錄圓山餐飲地點；本方案依價格帶、距離與營業時段整理，實際店名與供應請於前往前確認。',
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
    category: '食品',
    title: '圓山便當外帶方案',
    provider: '圓山生活圈餐飲資料',
    subcategory: '便當／外帶',
    totalCost: 190,
    benchmarkCost: 260,
    servings: 2,
    distanceKm: 1.1,
    walkMin: 14,
    hours: '10:30–19:30',
    serviceModes: ['外帶'],
    condition: '可能含堅果或芝麻醬料；排斥者需現場確認',
    source: '圓山生活圈餐飲資料 / 02_Places',
    sourceUrl: 'https://www.google.com/maps/search/?api=1&query=圓山 便當',
    evidence:
      '02_Places 收錄此類餐飲條件；價格、成分與實際供應仍需向店家確認。',
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
    category: '食品',
    title: '圓山早午餐座位方案',
    provider: '圓山生活圈餐飲資料',
    subcategory: '早午餐／咖啡',
    totalCost: 320,
    benchmarkCost: 420,
    servings: 2,
    distanceKm: 0.9,
    walkMin: 11,
    hours: '09:00–17:00',
    serviceModes: ['內用', '有座位'],
    condition: '熱門時段可能需等候；適合安靜與能坐偏好',
    source: '圓山生活圈餐飲資料 / 02_Places',
    sourceUrl: 'https://www.google.com/maps/search/?api=1&query=圓山 早午餐',
    evidence:
      '02_Places 提供餐飲與停留時間欄位；本方案依目前可比較欄位整理，座位與候位狀況請於前往前確認。',
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

const verifiedDemoIds = new Set(['tfam', 'confucius', 'market', 'youbike']);
const demoResults: Result[] = demoFixtures.map((item) => {
  const verifiedExample = verifiedDemoIds.has(item.id);
  return {
    ...item,
    dataSource: 'demo',
    provenance: verifiedExample ? 'verified-demo' : 'simulated',
    verificationLabel: '方案資訊',
    verifiedFields: ['地點', '時段', '價格', '服務方式'],
  };
});
const emptyResults: Result[] = [];
const demoCatalogWarnings: string[] = [];

// 前端候選卡片的定位點；正式 API 上線後改由 D1 places 座標欄位提供。
const resultLocations: Record<string, GeoPoint> = {
  jianjia: { latitude: 25.068981, longitude: 121.515792 },
  bremen: { latitude: 25.070537, longitude: 121.51884 },
  tfam: { latitude: 25.0725, longitude: 121.52472 },
  confucius: { latitude: 25.072761, longitude: 121.516171 },
  market: { latitude: 25.07035, longitude: 121.5205 },
  youbike: { latitude: 25.07133, longitude: 121.52024 },
  'taxi-share': { latitude: 25.07133, longitude: 121.52024 },
  'daily-store': { latitude: 25.07077, longitude: 121.52007 },
  'ys-food-002': { latitude: 25.068166, longitude: 121.513507 },
  'ys-food-003': { latitude: 25.07451, longitude: 121.515086 },
  'ys-food-004': { latitude: 25.067623, longitude: 121.519313 },
  'taxi-carpool-night': { latitude: 25.0782, longitude: 121.53237 },
};
const catalogCoverageCenter: GeoPoint = {
  latitude: 25.07133,
  longitude: 121.52024,
};
const catalogCoverageRadiusKm = 2;

const distanceBetween = (from: GeoPoint, to: GeoPoint) => {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const money = (value: number) =>
  new Intl.NumberFormat('zh-TW').format(Math.round(value));
const verifiedFieldLabels = {
  identity: '身分',
  location: '地點',
  schedule: '時段',
  cost: '費用',
  realtimeAvailability: '即時車位',
} as const;
const catalogItemToResult = (
  item: CatalogItem,
  dataSource: CatalogDataSource,
): Result | null => {
  if (item.distanceM === null) return null;
  const realtimeText =
    item.realtime?.fresh && item.realtime.appliesToSelectedTime
      ? `；目前可借 ${item.realtime.availableRentBikes ?? '待確認'} 輛、可還 ${item.realtime.availableReturnBikes ?? '待確認'} 輛`
      : item.realtime?.fresh
        ? '；即時車位僅代表查詢當下，不預測所選時段'
        : '';
  const sourceUrl = item.source.url ?? item.actionUrl ?? undefined;
  return {
    id: item.id,
    category: item.categoryLabel,
    title: item.title,
    provider: item.provider,
    subcategory: item.provider,
    totalCost: item.cost.amountTwd,
    benchmarkCost: null,
    servings: null,
    distanceKm: Math.round((item.distanceM / 1_000) * 100) / 100,
    walkMin: Math.max(1, Math.round((item.distanceM / 1_000) * 13)),
    hours:
      item.availability.startsAt && item.availability.endsAt
        ? `${taipeiDateLabel(item.availability.startsAt)} ～ ${taipeiDateLabel(item.availability.endsAt)}`
        : item.availability.text,
    serviceModes: [],
    condition: `${item.condition}${realtimeText}`,
    source: `${item.source.publisher}｜${item.source.title}`,
    sourceUrl,
    evidence: `${item.evidenceQuote}\n${item.cost.reason}`,
    reliability: null,
    verifiedAt: item.source.verifiedAt ?? '',
    mapQuery: [item.title, item.address].filter(Boolean).join(' '),
    expiresAt: item.availability.endsAt ?? undefined,
    reportCount: null,
    tags: item.tags,
    preferenceTags: item.tags,
    agent: item.cost.state === 'FREE' ? 'zero' : 'cp',
    tone: categoryTones[item.categoryLabel],
    dimensions: {},
    latitude: item.latitude,
    longitude: item.longitude,
    dataSource,
    costReason: item.cost.reason,
    costState: item.cost.state,
    provenance:
      item.verification.status === 'VERIFIED' ? 'verified-real' : 'real',
    verificationLabel: item.verification.label,
    verifiedFields: item.verification.fields.map(
      (field) => verifiedFieldLabels[field],
    ),
  };
};
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
const currentMonthDateLabel = (daysBeforeToday: number) => {
  const [, month, day] = taipeiDateTime().date.split('-').map(Number);
  const safeDay = Math.max(1, day - daysBeforeToday);
  return `${String(month).padStart(2, '0')}/${String(safeDay).padStart(2, '0')}`;
};
const communityReportTypes: CommunityReportType[] = [
  '營業時間不同',
  '價格不同',
  '已停業',
  '優惠失效',
  '其他',
];
const defaultCommunityReports: CommunityReport[] = [
  {
    id: 'report-jianjia-price',
    subjectId: 'jianjia',
    type: '價格不同',
    note: '晚間組合價格已更新為 NT$180。',
    submittedAt: `${currentMonthDateLabel(1)} 19:20`,
    status: 'resolved',
  },
  {
    id: 'report-jianjia-hours',
    subjectId: 'jianjia',
    type: '營業時間不同',
    note: '週日晚間最後點餐時間為 20:30。',
    submittedAt: `${currentMonthDateLabel(2)} 20:42`,
    status: 'received',
  },
  {
    id: 'report-youbike-availability',
    subjectId: 'youbike',
    type: '其他',
    note: '尖峰時段站點周轉速度很快。',
    submittedAt: `${currentMonthDateLabel(2)} 18:05`,
    status: 'resolved',
  },
  {
    id: 'report-lunchbox-price',
    subjectId: 'ys-food-003',
    type: '價格不同',
    note: '外帶折扣後為 NT$95。',
    submittedAt: `${currentMonthDateLabel(3)} 12:18`,
    status: 'resolved',
  },
];
const communityReportStorageKey = 'all-in-life-community-reports-v1';
const aiCategoryLabels: Record<AiSearchCategory, Category> = {
  FOOD: '食品',
  DAILY_GOODS: '日用品',
  FREE_RESOURCE: '免費／公益資源',
  EVENT: '活動',
  TRANSPORT: '交通',
};
const categoryToAiKey = (
  category: Filters['category'],
): AiSearchCategory | null =>
  category === '全部'
    ? null
    : ((Object.entries(aiCategoryLabels).find(
        ([, label]) => label === category,
      )?.[0] as AiSearchCategory | undefined) ?? null);
const cleanAiTags = (values: string[]) =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(
    0,
    20,
  );
const mergeAiConstraints = (
  current: Filters,
  constraints: AiSearchConstraints,
  mode: Mode,
): Filters => ({
  ...current,
  date: /^\d{4}-\d{2}-\d{2}$/.test(constraints.date ?? '')
    ? constraints.date!
    : current.date,
  time: /^([01]\d|2[0-3]):[0-5]\d$/.test(constraints.time ?? '')
    ? constraints.time!
    : current.time,
  category: constraints.category
    ? aiCategoryLabels[constraints.category]
    : current.category,
  budget:
    mode === 'zero'
      ? 0
      : Number.isFinite(constraints.budgetTwd) && constraints.budgetTwd! >= 0
        ? Math.round(constraints.budgetTwd!)
        : current.budget,
  people:
    Number.isFinite(constraints.partySize) && constraints.partySize! >= 1
      ? Math.min(10, Math.round(constraints.partySize!))
      : current.people,
  distance:
    Number.isFinite(constraints.maxDistanceM) && constraints.maxDistanceM! > 0
      ? Math.min(
          2,
          Math.max(
            0.5,
            Math.round((constraints.maxDistanceM! / 1_000) * 10) / 10,
          ),
        )
      : current.distance,
  exclusions: cleanAiTags([
    ...current.exclusions,
    ...constraints.hardExclusions,
  ]),
  preferences: cleanAiTags(constraints.softPreferences),
});
const createInitialFilters = (): Filters => {
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
};
const demoTransactions: Transaction[] = [
  {
    id: 'h1',
    resultId: 'daily-store',
    title: '圓山站日常補給',
    category: '日用品',
    amount: 126,
    date: currentMonthDateLabel(1),
    saved: 14,
    occurredAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'h2',
    resultId: 'taxi-share',
    title: '朋友共乘',
    category: '交通',
    amount: 52,
    date: currentMonthDateLabel(2),
    saved: 68,
    occurredAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'h3',
    resultId: 'tfam',
    title: '週末看展',
    category: '活動',
    amount: 30,
    date: currentMonthDateLabel(3),
    saved: 30,
    occurredAt: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
  },
];
const overlap = (a: string[] = [], b: string[] = []) =>
  a.filter((item) => b.includes(item));
const isConfirmedFree = (item: Result) =>
  item.costState === 'FREE' ||
  (item.costState === undefined && item.totalCost === 0);
const taipeiDateLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
};
const cpScoreBreakdown = (item: Result, filters: Filters, params: CpParams) =>
  calculatePersonalCpScore({
    totalCost: item.totalCost,
    budget: filters.budget,
    distanceKm: item.distanceKm,
    maxDistanceKm: Math.max(filters.distance, 0.5),
    matchedPreferences: overlap(item.preferenceTags, filters.preferences)
      .length,
    totalPreferences: filters.preferences.length,
    weights: params,
  });
const cpFormulaScore = (item: Result, filters: Filters, params: CpParams) =>
  cpScoreBreakdown(item, filters, params).score;
const categoryIcon = (category: Category) =>
  category === '食品' ? (
    <Utensils />
  ) : category === '日用品' ? (
    <ShoppingBag />
  ) : category === '免費／公益資源' ? (
    <Sparkles />
  ) : category === '活動' ? (
    <Gamepad2 />
  ) : (
    <Bike />
  );

const validateSearchInput = (need: string, filters: Filters) => {
  if (need.trim().length < 3) return '請至少用 3 個字描述這次需求。';
  if (!filters.date || !filters.time) return '請確認日期與時段。';
  if (!Number.isFinite(filters.budget) || filters.budget < 0)
    return '預算不可小於 0。';
  if (!Number.isFinite(filters.people) || filters.people < 1)
    return '人數至少需要 1 人。';
  if (!Number.isFinite(filters.distance) || filters.distance < 0.5)
    return '最大距離至少需要 0.5 km。';
  return '';
};

export default function App() {
  const { musicEnabled, setMusicEnabled } = useBackgroundMusic();
  const [interactiveReady, setInteractiveReady] = useState(false);
  const [view, setView] = useState<View>('welcome');
  const [history, setHistory] = useState<View[]>([]);
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>('demo');
  const [profile, setProfile] = useState<Profile>({
    name: '小美',
    avatar: '#c9ff36',
    signedIn: false,
  });
  const [accountUser, setAccountUser] = useState<AccountUser | null>(null);
  const [accountToken, setAccountToken] = useState<string | null>(null);
  const [accountDataReady, setAccountDataReady] = useState(false);
  const [accountSyncStatus, setAccountSyncStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [allowGuestDemoActions, setAllowGuestDemoActions] = useState(false);
  const [authReturnView, setAuthReturnView] = useState<View>('home');
  const [mode, setMode] = useState<Mode>('daily');
  const [need, setNeed] = useState(modeNeedExamples.daily);
  const [filters, setFilters] = useState<Filters>(() => createInitialFilters());
  const [lastPaidBudget, setLastPaidBudget] = useState(500);
  const [followCurrentTime, setFollowCurrentTime] = useState(true);
  const [selectedId, setSelectedId] = useState(demoResults[0].id);
  const [saved, setSaved] = useState<string[]>([]);
  const [savedSnapshots, setSavedSnapshots] = useState<Record<string, Result>>(
    {},
  );
  const [completed, setCompleted] = useState<string[]>([]);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle');
  const [catalogRequestKey, setCatalogRequestKey] = useState(0);
  const [validationError, setValidationError] = useState('');
  const [aiParseStatus, setAiParseStatus] = useState<AiParseStatus>('idle');
  const [aiExplanations, setAiExplanations] = useState<
    Record<string, AiExplanation>
  >({});
  const aiExplainSignature = useRef('');
  const [teamCount, setTeamCount] = useState(3);
  const [joinedTeam, setJoinedTeam] = useState(false);
  const [toast, setToast] = useState('');
  const [toastAction, setToastAction] = useState<ToastAction | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [showSopGuide, setShowSopGuide] = useState(false);
  const [guideBeforeOnboarding, setGuideBeforeOnboarding] = useState(false);
  const [catalogSource, setCatalogSource] =
    useState<CatalogDisplaySource>('demo');
  const [catalogWarnings, setCatalogWarnings] = useState<string[]>([]);
  const [catalogFacets, setCatalogFacets] = useState<
    CatalogCategorySummary[] | null
  >(null);
  const [catalogSummary, setCatalogSummary] =
    useState<CatalogSummaryResponse | null>(null);
  const [catalogSummaryStatus, setCatalogSummaryStatus] = useState<
    'loading' | 'ready' | 'error'
  >('loading');
  const [liveResults, setLiveResults] = useState<Result[] | null>(null);
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
  const [locationStatus, setLocationStatus] = useState(
    '未授權定位，先用圓山站估算',
  );
  const [locationPermission, setLocationPermission] =
    useState<LocationPermission>('idle');
  const [userLocation, setUserLocation] = useState<GeoPoint | null>(null);
  const [transactions, setTransactions] =
    useState<Transaction[]>(demoTransactions);
  const [monthlyBudget, setMonthlyBudget] = useState(10_000);
  const [submittedReports, setSubmittedReports] = useState<CommunityReport[]>(
    [],
  );
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [pwaStatus, setPwaStatus] = useState('檢查中');
  const applyAccountData = useCallback(
    (user: AccountUser, envelope: AccountDataEnvelope) => {
      const state = envelope.state as Partial<StoredAccountState>;
      const storedProfile: Record<string, unknown> = isRecord(state.profile)
        ? state.profile
        : {};
      const storedName =
        typeof storedProfile.name === 'string' && storedProfile.name.trim()
          ? storedProfile.name.trim().slice(0, 12)
          : user.nickname;
      const storedAvatar =
        typeof storedProfile.avatar === 'string' && storedProfile.avatar
          ? storedProfile.avatar
          : user.avatar;
      setSaved(
        Array.isArray(state.saved)
          ? state.saved.filter((id): id is string => typeof id === 'string')
          : [],
      );
      setSavedSnapshots(
        isRecord(state.savedSnapshots)
          ? (state.savedSnapshots as Record<string, Result>)
          : {},
      );
      setCompleted(
        Array.isArray(state.completed)
          ? state.completed.filter((id): id is string => typeof id === 'string')
          : [],
      );
      setTransactions(
        Array.isArray(state.transactions)
          ? (state.transactions.filter(isRecord) as Transaction[])
          : [],
      );
      setMonthlyBudget(
        typeof state.monthlyBudget === 'number' &&
          Number.isFinite(state.monthlyBudget) &&
          state.monthlyBudget >= 0
          ? state.monthlyBudget
          : 0,
      );
      setJoinedTeam(state.joinedTeam === true);
      setTeamCount(
        typeof state.teamCount === 'number' && Number.isFinite(state.teamCount)
          ? Math.max(0, Math.min(5, Math.round(state.teamCount)))
          : 3,
      );
      setReminders(state.reminders !== false);
      setProfile({ name: storedName, avatar: storedAvatar, signedIn: true });
      setAccountDataReady(true);
      setAccountSyncStatus('saved');
    },
    [],
  );
  const budgetSummary = useMemo<BudgetSummary>(() => {
    const spent = transactions.reduce((sum, item) => sum + item.amount, 0);
    const saved = transactions.reduce((sum, item) => sum + item.saved, 0);
    return {
      budget: monthlyBudget,
      spent,
      saved,
      remaining: monthlyBudget - spent,
      usedPercentage:
        monthlyBudget > 0
          ? Math.min(100, Math.max(0, (spent / monthlyBudget) * 100))
          : 0,
      transactionCount: transactions.length,
    };
  }, [monthlyBudget, transactions]);
  const communityReports = useMemo(
    () => [...submittedReports, ...defaultCommunityReports],
    [submittedReports],
  );

  useEffect(() => {
    let storedReports: CommunityReport[] | null = null;
    try {
      const stored = window.localStorage.getItem(communityReportStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as CommunityReport[];
        if (Array.isArray(parsed)) storedReports = parsed;
      }
    } catch {
      // The in-memory report history still works when storage is unavailable.
    }
    window.queueMicrotask(() => {
      if (storedReports) setSubmittedReports(storedReports);
      setReportsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!reportsLoaded) return;
    try {
      window.localStorage.setItem(
        communityReportStorageKey,
        JSON.stringify(submittedReports),
      );
    } catch {
      // Storage can be blocked in private browsing; keep the current session.
    }
  }, [reportsLoaded, submittedReports]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setInteractiveReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/catalog/categories', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('Catalog summary unavailable');
        return response.json() as Promise<CatalogSummaryResponse>;
      })
      .then((summary) => {
        if (!Array.isArray(summary.categories)) {
          throw new Error('Catalog summary is malformed');
        }
        setCatalogSummary(summary);
        setCatalogSummaryStatus('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
        setCatalogSummaryStatus('error');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const token = readAccountToken();
    if (!token) return;
    restoreAccountSession(token)
      .then((session) => {
        setAccountToken(token);
        setAccountUser(session.user);
        applyAccountData(session.user, session.data);
      })
      .catch(() => {
        clearAccountToken();
        setAccountToken(null);
        setAccountUser(null);
        setAccountDataReady(false);
      });
  }, [applyAccountData]);

  useEffect(() => {
    if (!profile.signedIn || !accountToken || !accountDataReady) return;
    const timer = window.setTimeout(() => {
      setAccountSyncStatus('saving');
      const state: StoredAccountState = {
        version: 1,
        saved,
        savedSnapshots,
        completed,
        transactions,
        monthlyBudget,
        joinedTeam,
        teamCount,
        reminders,
        profile: { name: profile.name, avatar: profile.avatar },
      };
      saveAccountData(accountToken, state)
        .then(() => setAccountSyncStatus('saved'))
        .catch((error: unknown) => {
          if (error instanceof AccountClientError && error.status === 401) {
            clearAccountToken();
            setAccountToken(null);
            setAccountUser(null);
            setAccountDataReady(false);
            setProfile((current) => ({ ...current, signedIn: false }));
            showToast('登入已逾時，請重新登入後再儲存');
          }
          setAccountSyncStatus('error');
        });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [
    accountDataReady,
    accountToken,
    completed,
    joinedTeam,
    monthlyBudget,
    profile.avatar,
    profile.name,
    profile.signedIn,
    reminders,
    saved,
    savedSnapshots,
    teamCount,
    transactions,
  ]);

  useLayoutEffect(() => {
    if (view !== 'welcome') return;

    const root = document.documentElement;
    const previousTheme = root.dataset.theme === 'light' ? 'light' : 'dark';
    const previousColorScheme = root.style.colorScheme;
    const themeMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    const previousThemeColor = themeMeta?.getAttribute('content') ?? null;

    root.dataset.theme = 'dark';
    root.style.colorScheme = 'dark';
    themeMeta?.setAttribute('content', '#090c0a');

    return () => {
      root.dataset.theme = previousTheme;
      root.style.colorScheme = previousColorScheme || previousTheme;
      if (previousThemeColor)
        themeMeta?.setAttribute('content', previousThemeColor);
      window.dispatchEvent(
        new CustomEvent('all-in-life-theme-change', {
          detail: previousTheme,
        }),
      );
    };
  }, [view]);

  const catalogUsesUserLocation = Boolean(
    userLocation &&
    distanceBetween(userLocation, catalogCoverageCenter) + filters.distance <=
      catalogCoverageRadiusKm,
  );
  const activeCatalogResults = useMemo(
    () =>
      experienceMode === 'demo' ? demoResults : (liveResults ?? emptyResults),
    [experienceMode, liveResults],
  );
  const locatedResults = useMemo(() => {
    if (!userLocation || !catalogUsesUserLocation) return activeCatalogResults;
    return activeCatalogResults.map((item) => {
      const destination =
        item.latitude !== null &&
        item.latitude !== undefined &&
        item.longitude !== null &&
        item.longitude !== undefined
          ? { latitude: item.latitude, longitude: item.longitude }
          : resultLocations[item.id];
      if (!destination) return item;
      const distanceKm = Math.max(
        0.05,
        Math.round(distanceBetween(userLocation, destination) * 100) / 100,
      );
      return {
        ...item,
        distanceKm,
        walkMin: Math.max(1, Math.round(distanceKm * 13)),
      };
    });
  }, [activeCatalogResults, catalogUsesUserLocation, userLocation]);
  const eligibleLocatedResults = useMemo(
    () =>
      locatedResults.filter(
        (item) => overlap(item.tags, filters.exclusions).length === 0,
      ),
    [filters.exclusions, locatedResults],
  );
  const ordered = useMemo(() => {
    const ranked = eligibleLocatedResults
      .filter((item) => {
        const categoryMatch =
          filters.category === '全部' || item.category === filters.category;
        const budgetMatch =
          mode === 'zero'
            ? isConfirmedFree(item)
            : filters.budget <= 0 ||
              item.totalCost === null ||
              item.totalCost <= filters.budget;
        return (
          categoryMatch && budgetMatch && item.distanceKm <= filters.distance
        );
      })
      .sort((a, b) => {
        if (sort === 'cost') {
          if (a.totalCost === null) return b.totalCost === null ? 0 : 1;
          if (b.totalCost === null) return -1;
          return a.totalCost - b.totalCost || a.distanceKm - b.distanceKm;
        }
        if (sort === 'distance') {
          return (
            a.distanceKm - b.distanceKm ||
            (a.totalCost ?? Number.POSITIVE_INFINITY) -
              (b.totalCost ?? Number.POSITIVE_INFINITY)
          );
        }
        const aScore = cpScoreBreakdown(a, filters, cpParams).rawScore;
        const bScore = cpScoreBreakdown(b, filters, cpParams).rawScore;
        if (aScore === null) return bScore === null ? 0 : 1;
        if (bScore === null) return -1;
        return (
          bScore - aScore ||
          a.distanceKm - b.distanceKm ||
          a.title.localeCompare(b.title, 'zh-TW')
        );
      });
    return mode === 'zero'
      ? ranked.sort(
          (a, b) => (b.agent === 'zero' ? 1 : 0) - (a.agent === 'zero' ? 1 : 0),
        )
      : ranked;
  }, [cpParams, eligibleLocatedResults, filters, mode, sort]);

  const supplementalDemoResults = useMemo(() => {
    if (
      experienceMode !== 'account' ||
      (catalogSource !== 'd1' && catalogSource !== 'snapshot') ||
      ordered.length >= 3
    ) {
      return [];
    }
    const needed = 3 - ordered.length;
    return demoResults
      .filter((item) => {
        const categoryMatch =
          filters.category === '全部' || item.category === filters.category;
        const budgetMatch =
          mode === 'zero'
            ? isConfirmedFree(item)
            : filters.budget <= 0 ||
              item.totalCost === null ||
              item.totalCost <= filters.budget;
        return (
          categoryMatch &&
          budgetMatch &&
          item.distanceKm <= filters.distance &&
          overlap(item.tags, filters.exclusions).length === 0
        );
      })
      .slice(0, needed)
      .map((item) => ({ ...item, id: `SUPPLEMENT:${item.id}` }));
  }, [catalogSource, experienceMode, filters, mode, ordered.length]);
  const selectableResults = useMemo(
    () => [...eligibleLocatedResults, ...supplementalDemoResults],
    [eligibleLocatedResults, supplementalDemoResults],
  );
  const selected =
    selectableResults.find((item) => item.id === selectedId) ??
    selectableResults[0] ??
    null;
  const savedResultItems = saved
    .map(
      (id) =>
        selectableResults.find((item) => item.id === id) ?? savedSnapshots[id],
    )
    .filter((item): item is Result => Boolean(item));
  const selectedReports = selected
    ? reportsForSubject(
        communityReports,
        selected.id.replace('SUPPLEMENT:', ''),
      )
    : [];

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
    if (experienceMode === 'demo' || catalogRequestKey === 0) return;

    const controller = new AbortController();
    let settleTimer = 0;
    const requestedCategory =
      filters.category === '全部'
        ? 'ALL'
        : (catalogCategories.find(
            (category) => category.label === filters.category,
          )?.key ?? 'ALL');
    const searchOrigin =
      catalogUsesUserLocation && userLocation
        ? userLocation
        : catalogCoverageCenter;
    const requestBody = {
      category: requestedCategory,
      lat: searchOrigin.latitude,
      lng: searchOrigin.longitude,
      radiusM: Math.min(2_000, Math.round(filters.distance * 1_000)),
      at: `${filters.date}T${filters.time}:00+08:00`,
      freeOnly: mode === 'zero',
      limit: 100,
    };
    fetch('/api/catalog/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('Catalog request failed');
        return response.json() as Promise<CatalogSearchResponse>;
      })
      .then((payload) => {
        const mappedResults = payload.items
          .map((item) => catalogItemToResult(item, payload.source))
          .filter((item): item is Result => item !== null);
        const hasEligibleResult = mappedResults.some((item) => {
          const categoryMatch =
            filters.category === '全部' || item.category === filters.category;
          const budgetMatch =
            mode === 'zero'
              ? isConfirmedFree(item)
              : filters.budget <= 0 ||
                item.totalCost === null ||
                item.totalCost <= filters.budget;
          return (
            categoryMatch &&
            budgetMatch &&
            item.distanceKm <= filters.distance &&
            overlap(item.tags, filters.exclusions).length === 0
          );
        });
        setSearchStatus('ranking');
        settleTimer = window.setTimeout(() => {
          setLiveResults(mappedResults);
          setCatalogSource(payload.source);
          setCatalogFacets(payload.facets);
          setCatalogWarnings([
            ...payload.warnings,
            ...(userLocation && !catalogUsesUserLocation
              ? [
                  '目前定位無法在圓山 2 km 資料圈內提供完整搜尋，結果改以圓山站為中心。',
                ]
              : []),
          ]);
          setSearchStatus(hasEligibleResult ? 'success' : 'empty');
        }, 180);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
        setLiveResults([]);
        setCatalogSource('error');
        setCatalogFacets(null);
        setSearchStatus('error');
        setCatalogWarnings(['候選資料暫時無法連線，請稍後重試。']);
      });
    return () => {
      controller.abort();
      window.clearTimeout(settleTimer);
    };
  }, [
    filters.budget,
    filters.date,
    filters.distance,
    filters.category,
    filters.exclusions,
    filters.time,
    catalogUsesUserLocation,
    catalogRequestKey,
    experienceMode,
    mode,
    userLocation,
  ]);
  useEffect(() => {
    if (view !== 'search' || experienceMode !== 'demo') return;
    const loading = window.setTimeout(() => setSearchStatus('loading'), 160);
    const ranking = window.setTimeout(() => setSearchStatus('ranking'), 430);
    const finish = window.setTimeout(
      () => setSearchStatus(ordered.length > 0 ? 'success' : 'empty'),
      880,
    );
    return () => {
      window.clearTimeout(loading);
      window.clearTimeout(ranking);
      window.clearTimeout(finish);
    };
  }, [catalogRequestKey, experienceMode, ordered.length, view]);
  useEffect(() => {
    if (
      view !== 'search' ||
      (searchStatus !== 'success' && searchStatus !== 'empty')
    )
      return;
    const timer = window.setTimeout(() => setView('results'), 420);
    return () => window.clearTimeout(timer);
  }, [searchStatus, view]);
  useEffect(() => {
    if (
      view !== 'results' ||
      experienceMode !== 'account' ||
      searchStatus !== 'success'
    )
      return;

    const candidates = ordered
      .filter(
        (item) =>
          !item.id.startsWith('SUPPLEMENT:') &&
          overlap(item.tags, filters.exclusions).length === 0,
      )
      .slice(0, 3);
    if (candidates.length === 0) return;

    const searchOrigin =
      catalogUsesUserLocation && userLocation
        ? userLocation
        : catalogCoverageCenter;
    const requestBody = {
      locale: 'zh-TW',
      candidateIds: candidates.map((item) => item.id),
      search: {
        category: categoryToAiKey(filters.category) ?? 'ALL',
        origin: searchOrigin,
        radiusM: Math.min(
          2_000,
          Math.max(500, Math.round(filters.distance * 1_000)),
        ),
        at: `${filters.date}T${filters.time}:00+08:00`,
        eventWindowDays: 7,
        freeOnly: mode === 'zero',
        hardExclusions: filters.exclusions,
        softPreferences: filters.preferences,
      },
    };
    const signature = JSON.stringify(requestBody);
    if (aiExplainSignature.current === signature) return;
    aiExplainSignature.current = signature;

    const controller = new AbortController();
    fetch('/api/v1/results/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: signature,
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('AI explanation request failed');
        return response.json() as Promise<AiExplainResponse>;
      })
      .then((payload) => {
        if (
          (payload.source !== 'openai' && payload.source !== 'fallback') ||
          !Array.isArray(payload.items)
        )
          return;
        const candidateIds = new Set(candidates.map((item) => item.id));
        const next: Record<string, AiExplanation> = {};
        for (const item of payload.items) {
          if (
            !candidateIds.has(item.id) ||
            typeof item.headline !== 'string' ||
            !Array.isArray(item.reasons) ||
            !item.reasons.every((reason) => typeof reason === 'string') ||
            (item.caution !== null && typeof item.caution !== 'string')
          )
            continue;
          next[item.id] = {
            headline: item.headline,
            reasons: item.reasons,
            caution: item.caution,
            source: payload.source,
          };
        }
        setAiExplanations(next);
      })
      .catch(() => {
        // Existing deterministic result copy remains visible when AI is unavailable.
      });
    return () => controller.abort();
  }, [
    catalogUsesUserLocation,
    experienceMode,
    filters,
    mode,
    ordered,
    searchStatus,
    userLocation,
    view,
  ]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(
      () => {
        setToast('');
        setToastAction(null);
      },
      toastAction ? 4500 : 2300,
    );
    return () => window.clearTimeout(timer);
  }, [toast, toastAction]);
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
      queueMicrotask(() => setLocationPermission('denied'));
      return;
    }
    if (!window.isSecureContext) {
      queueMicrotask(() => setLocationStatus('定位需要 HTTPS 安全連線'));
      queueMicrotask(() => setLocationPermission('denied'));
    }
  }, []);

  function requestLocation() {
    if (!('geolocation' in navigator)) {
      setLocationPermission('denied');
      setLocationStatus('此裝置不支援定位');
      return;
    }
    if (!window.isSecureContext) {
      setLocationPermission('denied');
      setLocationStatus('定位需要 HTTPS 安全連線');
      return;
    }
    setLocationPermission('requesting');
    setLocationStatus('等待瀏覽器定位授權');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationPermission('granted');
        setLocationStatus(
          `定位成功，已更新推薦距離（精度約 ${Math.round(position.coords.accuracy)} m）`,
        );
      },
      (error) => {
        setUserLocation(null);
        setLocationPermission('denied');
        setLocationStatus(
          error.code === error.PERMISSION_DENIED
            ? '瀏覽器未允許定位；請在網站權限開啟「位置」後重試'
            : error.code === error.TIMEOUT
              ? '定位逾時；請確認裝置定位服務已開啟後重試'
              : '裝置暫時無法判斷位置；請開啟 Wi-Fi 或系統定位後重試',
        );
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  }

  async function handleAuthenticate(
    authMode: 'login' | 'register',
    credentials: { username: string; password: string; nickname?: string },
  ) {
    try {
      const session = await authenticateAccount(authMode, credentials);
      setAccountToken(session.sessionToken);
      setAccountUser(session.user);
      if (experienceMode !== 'demo' || authReturnView === 'home') {
        setExperienceMode('account');
      }
      setAllowGuestDemoActions(false);
      applyAccountData(session.user, session.data);
      setHistory([]);
      setView(authReturnView === 'welcome' ? 'home' : authReturnView);
      showToast(
        authMode === 'register'
          ? '帳號建立完成，已開始同步'
          : '登入成功，清單已還原',
      );
      return null;
    } catch (error) {
      return error instanceof AccountClientError
        ? error.message
        : '帳號服務暫時無法使用。';
    }
  }

  function openAccount(returnView: View = view) {
    setAuthReturnView(returnView === 'account' ? 'home' : returnView);
    navigate('account');
  }

  function requireAccount(message: string, returnView: View = view) {
    showToast(message);
    openAccount(returnView);
  }

  async function handleSignOut() {
    const token = accountToken;
    setAccountToken(null);
    setAccountUser(null);
    setAccountDataReady(false);
    setAccountSyncStatus('idle');
    setAllowGuestDemoActions(false);
    setProfile({ name: '旅人', avatar: '#c9ff36', signedIn: false });
    setSaved([]);
    setSavedSnapshots({});
    setCompleted([]);
    setTransactions([]);
    setMonthlyBudget(0);
    setJoinedTeam(false);
    setTeamCount(3);
    await endAccountSession(token);
    showToast('已登出；搜尋仍可使用，個人資料已從本分頁移除');
    setHistory([]);
    setView('home');
  }

  function beginExperience(next: ExperienceMode, allowGuestActions = false) {
    const signedIn = Boolean(accountUser && accountToken && profile.signedIn);
    setExperienceMode(next);
    setAllowGuestDemoActions(next === 'demo' && allowGuestActions);
    if (!signedIn) {
      setProfile({ name: '小美', avatar: '#c9ff36', signedIn: false });
    }
    setMode('daily');
    setNeed(modeNeedExamples.daily);
    setFilters(createInitialFilters());
    setLastPaidBudget(500);
    if (!signedIn) {
      setTransactions(next === 'demo' ? [...demoTransactions] : []);
      setMonthlyBudget(next === 'demo' ? 10_000 : 0);
      setTeamCount(3);
      setSaved([]);
      setSavedSnapshots({});
      setCompleted([]);
      setJoinedTeam(false);
    }
    setUnread(3);
    setHistory([]);
    setSearchStatus('idle');
    setCatalogRequestKey(0);
    setValidationError('');
    setAiParseStatus('idle');
    setAiExplanations({});
    aiExplainSignature.current = '';
    setToast('');
    setToastAction(null);
    setGuideBeforeOnboarding(true);
    setShowSopGuide(true);
  }

  function closeSopGuide() {
    setShowSopGuide(false);
    if (!guideBeforeOnboarding) return;
    setGuideBeforeOnboarding(false);
    setHistory([]);
    setView('onboarding');
  }

  function navigate(next: View, remember = true) {
    if (remember && next !== view)
      setHistory((items) => [...items.slice(-8), view]);
    setView(next);
  }
  function goBack() {
    setView(history.at(-1) ?? 'home');
    setHistory((items) => items.slice(0, -1));
  }
  function showToast(message: string, action: ToastAction | null = null) {
    setToast(message);
    setToastAction(action);
  }
  function requestCatalog(clearResults = false) {
    if (clearResults) setLiveResults(null);
    setAiExplanations({});
    aiExplainSignature.current = '';
    setCatalogSource('checking');
    setCatalogWarnings([]);
    setSearchStatus('loading');
    setCatalogRequestKey((value) => value + 1);
  }
  function updateNeed(next: string) {
    setNeed(next);
    if (aiParseStatus !== 'loading') setAiParseStatus('idle');
    if (validationError) setValidationError('');
  }
  function updateFilters(next: Filters) {
    setFilters(next);
    if (next.budget > 0) setLastPaidBudget(next.budget);
    if (validationError) setValidationError('');
  }
  function chooseMode(next: Mode) {
    setMode(next);
    setNeed(modeNeedExamples[next]);
    setAiParseStatus('idle');
    if (next === 'zero' && filters.budget > 0) {
      setLastPaidBudget(filters.budget);
    }
    const budget =
      next === 'zero'
        ? 0
        : mode === 'zero' || filters.budget <= 0
          ? Math.max(50, lastPaidBudget)
          : filters.budget;
    setFilters((current) => ({
      ...current,
      budget,
      people: next === 'team' ? 5 : next === 'zero' ? 1 : 2,
    }));
    showToast(`已切換：${modes[next].title}`);
  }
  async function confirmNeed(query = need) {
    const error = validateSearchInput(query, filters);
    setValidationError(error);
    if (error) {
      showToast(error);
      return;
    }
    if (experienceMode === 'account') {
      setAiParseStatus('loading');
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 9_000);
      try {
        const response = await fetch('/api/v1/search/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            locale: 'zh-TW',
            timezone: 'Asia/Taipei',
            defaults: {
              date: filters.date,
              time: filters.time,
              category: categoryToAiKey(filters.category),
              budgetTwd: filters.budget,
              partySize: filters.people,
              maxDistanceM: Math.round(filters.distance * 1_000),
              hardExclusions: filters.exclusions,
              softPreferences: filters.preferences,
              mobility: ['WALK'],
            },
          }),
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('AI parse request failed');
        const payload: unknown = await response.json();
        if (!isAiParseResponse(payload))
          throw new Error('AI parse unavailable');
        const nextFilters = mergeAiConstraints(
          filters,
          payload.constraints,
          mode,
        );
        setFilters(nextFilters);
        if (nextFilters.budget > 0) setLastPaidBudget(nextFilters.budget);
        setFollowCurrentTime(false);
        setAiParseStatus('success');
        showToast('AI 已整理需求，請確認條件');
      } catch {
        setAiParseStatus('unavailable');
        showToast('AI 暫時無法整理，仍可手動確認條件');
      } finally {
        window.clearTimeout(timeout);
      }
    }
    navigate('filters');
  }
  function startSearch() {
    const error = validateSearchInput(need, filters);
    setValidationError(error);
    if (error) {
      showToast(error);
      return;
    }
    setHistory(['home']);
    setView('search');
    if (experienceMode === 'demo') {
      setSearchStatus('validating');
      setCatalogRequestKey((value) => value + 1);
    } else {
      requestCatalog(true);
    }
  }
  function retrySearch() {
    setView('search');
    if (experienceMode === 'demo') {
      setSearchStatus('validating');
      setCatalogRequestKey((value) => value + 1);
    } else {
      requestCatalog(true);
    }
  }
  function updateResultFilters(next: Filters) {
    setFilters(next);
    if (experienceMode !== 'demo') requestCatalog();
  }
  function openResult(id: string) {
    setSelectedId(id);
    navigate('detail');
  }
  function toggleSaved(id: string) {
    if (!profile.signedIn && !allowGuestDemoActions) {
      requireAccount('登入後才能儲存清單與收藏');
      return;
    }
    const wasSaved = saved.includes(id);
    const wasCompleted = completed.includes(id);
    const snapshot =
      selectableResults.find((item) => item.id === id) ?? savedSnapshots[id];
    if (!wasSaved && snapshot) {
      setSavedSnapshots((items) => ({ ...items, [id]: snapshot }));
    }
    setSaved((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
    if (wasSaved) {
      setCompleted((items) => items.filter((item) => item !== id));
    }
    showToast(wasSaved ? '已從清單移除' : '已加入這次清單', {
      label: '復原',
      run: () => {
        setSaved((items) =>
          wasSaved
            ? items.includes(id)
              ? items
              : [...items, id]
            : items.filter((item) => item !== id),
        );
        if (wasSaved && wasCompleted) {
          setCompleted((items) =>
            items.includes(id) ? items : [...items, id],
          );
        }
      },
    });
  }
  function activateToastAction() {
    if (!toastAction) return;
    toastAction.run();
    showToast('已復原上一個動作');
  }
  function updateCheckout(ids: string[], action: 'settle' | 'cancel') {
    if (!profile.signedIn && !allowGuestDemoActions) {
      requireAccount('登入後才能更新清單與消費紀錄', 'saved');
      return;
    }
    const uniqueIds = [...new Set(ids)];
    const requestedItems = uniqueIds
      .map(
        (id) =>
          selectableResults.find((entry) => entry.id === id) ??
          savedSnapshots[id],
      )
      .filter(
        (item): item is Result => Boolean(item) && saved.includes(item.id),
      );

    if (action === 'cancel') {
      const canceledIds = requestedItems
        .filter((item) => completed.includes(item.id))
        .map((item) => item.id);
      if (canceledIds.length === 0) {
        showToast('請先選取已結算項目');
        return;
      }
      const canceledTransactionIds = canceledIds.map((id) => `buy-${id}`);
      const removedTransactions = transactions.filter((transaction) =>
        canceledTransactionIds.includes(transaction.id),
      );
      setCompleted((items) => items.filter((id) => !canceledIds.includes(id)));
      setTransactions((items) =>
        items.filter((item) => !canceledTransactionIds.includes(item.id)),
      );
      showToast(`已取消 ${canceledIds.length} 筆結算，消費分析同步更新`, {
        label: '復原',
        run: () => {
          setCompleted((items) => [...new Set([...items, ...canceledIds])]);
          setTransactions((items) => [
            ...removedTransactions.filter(
              (transaction) =>
                !items.some((item) => item.id === transaction.id),
            ),
            ...items,
          ]);
        },
      });
      return;
    }

    const payableItems = requestedItems.filter(
      (item) => !completed.includes(item.id) && item.totalCost !== null,
    );
    const missingCostCount = requestedItems.filter(
      (item) => !completed.includes(item.id) && item.totalCost === null,
    ).length;

    if (payableItems.length === 0) {
      showToast(
        missingCostCount > 0
          ? '選取項目需先補上金額才能結算'
          : '請先選取待結算項目',
      );
      return;
    }

    const settledIds = payableItems.map((item) => item.id);
    const baseTime = Date.now();
    const newTransactions: Transaction[] = payableItems.map((item, index) => {
      const amount = item.totalCost ?? 0;
      return {
        id: `buy-${item.id}`,
        resultId: item.id,
        title: item.title,
        category: item.category,
        amount,
        date: currentMonthDateLabel(0),
        saved: Math.max(0, (item.benchmarkCost ?? amount) - amount),
        occurredAt: new Date(baseTime + index).toISOString(),
      };
    });
    const createdTransactions = newTransactions.filter(
      (transaction) => !transactions.some((item) => item.id === transaction.id),
    );
    const createdTransactionIds = createdTransactions.map((item) => item.id);
    const total = newTransactions.reduce((sum, item) => sum + item.amount, 0);

    setCompleted((items) => [...new Set([...items, ...settledIds])]);
    setTransactions((items) => [
      ...createdTransactions.filter(
        (transaction) => !items.some((item) => item.id === transaction.id),
      ),
      ...items,
    ]);
    showToast(`已批次結算 ${payableItems.length} 筆，共 NT$${money(total)}`, {
      label: '復原',
      run: () => {
        setCompleted((items) => items.filter((id) => !settledIds.includes(id)));
        setTransactions((items) =>
          items.filter((item) => !createdTransactionIds.includes(item.id)),
        );
      },
    });
  }
  function removeTransaction(id: string) {
    const removed = transactions.find((transaction) => transaction.id === id);
    if (!removed) return;
    const completedId = id.startsWith('buy-') ? id.replace('buy-', '') : null;
    setTransactions((items) => items.filter((item) => item.id !== id));
    if (completedId) {
      setCompleted((items) => items.filter((item) => item !== completedId));
    }
    showToast('交易紀錄已刪除，消費分析同步更新', {
      label: '復原',
      run: () => {
        setTransactions((items) =>
          items.some((item) => item.id === removed.id)
            ? items
            : [removed, ...items],
        );
        if (completedId) {
          setCompleted((items) =>
            items.includes(completedId) ? items : [...items, completedId],
          );
        }
      },
    });
  }
  async function share(text: string) {
    const url = publicAppUrl;
    setShareCopied(false);
    setShareUrl(url);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'ALL IN LIFE', text, url });
        showToast('分享完成；公開連結仍保留在下方');
      } else {
        const copied = await copyText(`${text}\n${url}`);
        showToast(
          copied ? '分享內容與連結已複製' : '請使用下方的開啟或複製連結按鈕',
        );
      }
    } catch {
      showToast('分享已取消；仍可掃描、開啟或複製連結');
    }
  }
  async function copyShareLink() {
    if (!shareUrl) return;
    const copied = await copyText(shareUrl);
    setShareCopied(copied);
    showToast(copied ? '公開連結已複製' : '無法自動複製，請長按下方網址');
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
      if (experienceMode === 'account') {
        setRecording(false);
        showToast('此瀏覽器不支援語音辨識，請改用文字輸入');
        return;
      }
      setRecording(true);
      window.setTimeout(() => {
        const transcript = '今晚兩人吃飯，預算五百，可以外帶，不吃堅果';
        setNeed(transcript);
        setRecording(false);
        showToast('已轉成文字，正在整理需求');
        void confirmNeed(transcript);
      }, 1300);
      return;
    }
    const recognition = new RecognitionCtor();
    recognition.lang = 'zh-TW';
    recognition.interimResults = false;
    let recordingFinished = false;
    const finishRecording = () => {
      if (recordingFinished) return;
      recordingFinished = true;
      setRecording(false);
    };
    setRecording(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setNeed(transcript);
      finishRecording();
      showToast('語音輸入完成，正在整理需求');
      void confirmNeed(transcript);
    };
    recognition.onend = finishRecording;
    recognition.onerror = () => {
      finishRecording();
      showToast('沒有收到語音，請再試一次');
    };
    recognition.start();
  }
  async function installPwa() {
    const prompt = installPrompt as Event & { prompt?: () => Promise<void> };
    if (prompt?.prompt) {
      await prompt.prompt();
      setInstallPrompt(null);
      setPwaStatus('安裝邀請已送出');
    } else showToast('請使用瀏覽器選單「加到主畫面」');
  }

  const shellLess = ['welcome', 'onboarding'].includes(view);
  return (
    <div
      className={
        view === 'welcome' ? 'app-stage welcome-dark-stage' : 'app-stage'
      }
      data-survival={mode === 'zero' ? 'true' : 'false'}
    >
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <main className="phone-shell">
        {view === 'welcome' && (
          <BackgroundMusicToggle
            enabled={musicEnabled}
            onToggle={() => setMusicEnabled(!musicEnabled)}
            disabled={!interactiveReady}
            className="welcome-music-toggle"
          />
        )}
        {!shellLess && (
          <AppHeader
            view={view}
            nowText={nowText}
            areaLabel={userLocation ? '目前位置' : '圓山生活圈'}
            unread={unread}
            musicEnabled={musicEnabled}
            onBack={goBack}
            onHome={() => navigate('home')}
            onNotifications={() => navigate('notifications')}
            onSettings={() => navigate('settings')}
            onMusicToggle={() => setMusicEnabled(!musicEnabled)}
          />
        )}
        <div className="screen-stack">
          <div key={view} className="screen-enter">
            {view === 'welcome' && (
              <WelcomeScreen
                ready={interactiveReady}
                onDemo={() =>
                  beginExperience(
                    'demo',
                    new URLSearchParams(window.location.search).get('mode') ===
                      'demo',
                  )
                }
                onAccount={() => openAccount('home')}
              />
            )}
            {view === 'account' && (
              <AccountScreen
                user={accountUser}
                syncStatus={accountSyncStatus}
                onAuthenticate={handleAuthenticate}
                onLogout={handleSignOut}
                onContinue={() => {
                  setHistory([]);
                  setView(
                    authReturnView === 'welcome' ? 'home' : authReturnView,
                  );
                }}
              />
            )}
            {view === 'onboarding' && (
              <OnboardingScreen
                profile={profile}
                filters={filters}
                musicEnabled={musicEnabled}
                onProfile={setProfile}
                onFilters={updateFilters}
                onMusicToggle={() => setMusicEnabled(!musicEnabled)}
                onDone={() => {
                  setProfile((current) => ({
                    ...current,
                    name: current.name.trim() || '小美',
                  }));
                  setHistory([]);
                  setView('home');
                }}
              />
            )}
            {view === 'home' && (
              <HomeScreen
                profile={profile}
                mode={mode}
                filters={filters}
                need={need}
                validationError={validationError}
                aiParseStatus={aiParseStatus}
                locationStatus={locationStatus}
                locationPermission={locationPermission}
                savedCount={saved.length}
                budgetSummary={budgetSummary}
                catalogSummary={catalogSummary}
                catalogSummaryStatus={catalogSummaryStatus}
                signedIn={profile.signedIn}
                onMode={chooseMode}
                onNeed={updateNeed}
                onVoice={startVoice}
                recording={recording}
                onConfirm={confirmNeed}
                onProfile={() => navigate('profile')}
                onAnalytics={() => navigate('analytics')}
                onTeam={() => {
                  chooseMode('team');
                  navigate('team');
                }}
                onGuide={() => {
                  setGuideBeforeOnboarding(false);
                  setShowSopGuide(true);
                }}
                onRequestLocation={requestLocation}
                onDeclineLocation={() => {
                  setUserLocation(null);
                  setLocationPermission('declined');
                  setLocationStatus('已選擇使用圓山站估算');
                }}
                onAccount={() => openAccount('home')}
              />
            )}
            {view === 'ready' && (
              <ReadyScreen
                filters={filters}
                need={need}
                mode={mode}
                validationError={validationError}
                onEdit={() => navigate('filters')}
                onStart={startSearch}
              />
            )}
            {view === 'search' && (
              <SearchScreen
                status={searchStatus}
                filters={filters}
                resultCount={ordered.length}
                errorMessage={catalogWarnings[0]}
                onRetry={retrySearch}
                onEdit={() => navigate('filters')}
              />
            )}
            {view === 'results' && (
              <ResultsScreen
                items={ordered}
                allItems={eligibleLocatedResults}
                supplementalItems={supplementalDemoResults}
                filters={filters}
                locationLabel={
                  catalogUsesUserLocation
                    ? '目前位置'
                    : userLocation
                      ? '圓山資料範圍'
                      : '圓山'
                }
                catalogWarnings={
                  experienceMode === 'demo'
                    ? demoCatalogWarnings
                    : catalogWarnings
                }
                catalogFacets={experienceMode === 'demo' ? null : catalogFacets}
                mode={mode}
                cpParams={cpParams}
                sort={sort}
                saved={saved}
                aiExplanations={aiExplanations}
                searchStatus={searchStatus}
                onSort={setSort}
                onFiltersChange={updateResultFilters}
                onCpParams={(next) => {
                  setCpParams(next);
                  setSort('cp');
                }}
                onFilters={() => navigate('filters')}
                onRetry={retrySearch}
                onOpen={openResult}
                onSave={toggleSaved}
              />
            )}
            {view === 'detail' && selected && (
              <DetailScreen
                item={selected}
                itemScore={cpFormulaScore(selected, filters, cpParams)}
                cpParams={cpParams}
                filters={filters}
                reportCount={selectedReports.length}
                saved={saved.includes(selected.id)}
                onSave={() => toggleSaved(selected.id)}
                onEvidence={() => setEvidenceOpen(true)}
                onMap={() => navigate('map')}
                onReport={() => navigate('report')}
                onShare={() =>
                  share(
                    `${selected.title}｜${selected.provider}｜${
                      selected.totalCost === null
                        ? '價格依現場方案'
                        : `預估 NT$${selected.totalCost}`
                    }`,
                  )
                }
              />
            )}
            {view === 'detail' && !selected && (
              <section className="screen detail-screen">
                <div className="empty-state">
                  <Database />
                  <h2>這筆資料目前不在查詢結果中</h2>
                  <p>可能已到期或不符合目前日期、類別與距離。</p>
                  <button onClick={() => navigate('results')}>返回結果</button>
                </div>
              </section>
            )}
            {view === 'saved' && (
              <SavedScreen
                items={savedResultItems}
                completed={completed}
                budget={filters.budget}
                transactions={transactions}
                onCheckout={updateCheckout}
                onOpen={openResult}
                onRemove={toggleSaved}
                onDeleteTransaction={removeTransaction}
                onHistory={() => navigate('history')}
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
                  if (!profile.signedIn && !allowGuestDemoActions) {
                    requireAccount('登入後才能登記團購', 'team');
                    return;
                  }
                  if (!joinedTeam) {
                    setJoinedTeam(true);
                    setTeamCount((n) => Math.min(5, n + 1));
                    showToast('已加入，可在截止前取消');
                  }
                }}
                onCancel={() => {
                  if (!profile.signedIn && !allowGuestDemoActions) {
                    requireAccount('登入後才能變更團購登記', 'team');
                    return;
                  }
                  if (joinedTeam) {
                    setJoinedTeam(false);
                    setTeamCount((n) => Math.max(0, n - 1));
                    showToast('已取消承諾');
                  }
                }}
                onShare={() =>
                  share(
                    '一起加入 ALL IN LIFE 的圓山晚餐團：滿 5 人每人省 NT$15',
                  )
                }
                onPreviewAction={showToast}
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
                onAccount={() => openAccount('profile')}
                onLogout={handleSignOut}
                onDone={goBack}
              />
            )}
            {view === 'filters' && (
              <FiltersScreen
                filters={filters}
                need={need}
                validationError={validationError}
                aiParseStatus={aiParseStatus}
                onNeed={updateNeed}
                onChange={updateFilters}
                onManualSchedule={() => setFollowCurrentTime(false)}
                onApply={() => {
                  const error = validateSearchInput(need, filters);
                  setValidationError(error);
                  if (error) {
                    showToast(error);
                    return;
                  }
                  showToast('需求與限制已確認');
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
                summary={budgetSummary}
                onBudgetChange={setMonthlyBudget}
                onHistory={() => navigate('history')}
              />
            )}
            {view === 'history' && (
              <HistoryScreen
                transactions={transactions}
                onOpen={openResult}
                onDelete={removeTransaction}
              />
            )}
            {view === 'report' && selected && (
              <ReportScreen
                item={selected}
                reports={selectedReports}
                onSubmit={({ type, note }) => {
                  if (!profile.signedIn && !allowGuestDemoActions) {
                    requireAccount('登入後才能提交資料回報', 'report');
                    return;
                  }
                  const report: CommunityReport = {
                    id: `report-${selected.id}-${Date.now()}`,
                    subjectId: selected.id.replace('SUPPLEMENT:', ''),
                    type,
                    note: note.trim() || '已提交現場資訊。',
                    submittedAt: localNow().slice(0, 14),
                    status: 'received',
                  };
                  setSubmittedReports((current) => [report, ...current]);
                  showToast('回報已加入統計');
                }}
              />
            )}
            {view === 'map' && selected && (
              <MapScreen
                item={selected}
                onOpen={() => openResult(selected.id)}
              />
            )}
            {(view === 'report' || view === 'map') && !selected && (
              <section className="screen detail-screen">
                <div className="empty-state">
                  <Database />
                  <h2>找不到這筆資料</h2>
                  <button onClick={() => navigate('results')}>返回結果</button>
                </div>
              </section>
            )}
          </div>
        </div>
        {!shellLess &&
          ![
            'search',
            'ready',
            'account',
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
              signedIn={profile.signedIn || allowGuestDemoActions}
              onNavigate={navigate}
              onRequireAccount={() =>
                requireAccount('登入後才能查看與儲存清單', 'saved')
              }
            />
          )}
        {toast && (
          <output className="toast" aria-live="polite">
            <Check />
            <span>{toast}</span>
            {toastAction && (
              <button type="button" onClick={activateToastAction}>
                {toastAction.label}
              </button>
            )}
          </output>
        )}
        {showSopGuide && (
          <SopGuide
            onClose={closeSopGuide}
            onInstall={installPwa}
            pwaStatus={pwaStatus}
            finishLabel={
              guideBeforeOnboarding ? '開始設定稱呼' : '回到 ALL IN LIFE'
            }
          />
        )}
      </main>
      <Dialog
        open={evidenceOpen && selected !== null}
        onOpenChange={setEvidenceOpen}
      >
        {selected && (
          <DialogContent className="evidence-sheet">
            <div className="sheet-handle" />
            <DialogHeader>
              <span className="kicker lime-text">方案資訊</span>
              <DialogTitle className="text-2xl font-black">
                {selected.title}
              </DialogTitle>
              <DialogDescription>
                {selected.provider} · {selected.subcategory}
              </DialogDescription>
            </DialogHeader>
            <div className="evidence-grid">
              <Metric
                label="方案價格"
                value={
                  selected.totalCost === null
                    ? '依現場方案'
                    : `NT$${money(selected.totalCost)}`
                }
              />
              <Metric
                label="CP 分數"
                value={
                  cpFormulaScore(selected, filters, cpParams)?.toString() ?? '—'
                }
              />
              <Metric label="距離" value={`${selected.distanceKm} km`} />
              <Metric
                label="使用者回報"
                value={`${selectedReports.length} 則`}
              />
            </div>
            <blockquote className="evidence-copy">
              {selected.condition}
            </blockquote>
            {selected.sourceUrl && (
              <a
                className="source-link"
                href={selected.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                查看詳細資訊
                <ExternalLink />
              </a>
            )}
          </DialogContent>
        )}
      </Dialog>
      <Dialog
        open={Boolean(shareUrl)}
        onOpenChange={(open) => {
          if (open) return;
          setShareUrl('');
          setShareCopied(false);
        }}
      >
        <DialogContent className="evidence-sheet share-sheet">
          <DialogHeader>
            <span className="kicker lime-text">掃描進站</span>
            <DialogTitle>ALL IN LIFE 分享連結</DialogTitle>
            <DialogDescription>
              用另一台裝置掃描，或直接開啟／複製下方網址。
            </DialogDescription>
          </DialogHeader>
          <div className="share-preview">
            <div className="share-preview-copy">
              <span className="share-preview-mark">ALL IN LIFE</span>
              <strong>生活提案，一起找到更好的選擇。</strong>
              <a href={shareUrl} target="_blank" rel="noreferrer">
                {publicAppHost}
              </a>
            </div>
            <div className="qr-frame">
              <QRCodeSVG
                value={shareUrl}
                size={160}
                level="M"
                marginSize={4}
                bgColor="#ffffff"
                fgColor="#0a0d0b"
                title="掃描開啟 ALL IN LIFE 公開網站"
                aria-label="掃描開啟 ALL IN LIFE 公開網站"
              />
              <small>掃描開啟</small>
            </div>
          </div>
          <a
            className="share-visible-url"
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
          >
            <span>https://{publicAppHost}</span>
            <ExternalLink />
          </a>
          <div className="share-actions">
            <a href={shareUrl} target="_blank" rel="noreferrer">
              直接開啟
              <ExternalLink />
            </a>
            <button type="button" onClick={copyShareLink}>
              {shareCopied ? <Check /> : <Copy />}
              {shareCopied ? '已複製' : '複製連結'}
            </button>
          </div>
          <p className="fine-print">
            QR、可見網址與按鈕都指向同一個公開 HTTPS
            網站；同一支手機請直接開啟或複製連結。
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AiliMascot({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`aili-mascot ${compact ? 'compact' : ''}`}>
      <span className="mascot-orbit" aria-hidden="true" />
      <svg viewBox="0 0 180 180" aria-hidden="true" focusable="false">
        <path className="mascot-tail" d="M131 124c31 1 35-24 17-35" />
        <path className="mascot-ear" d="m53 52 5-29 23 20m46 9-5-29-23 20" />
        <rect
          className="mascot-head"
          x="42"
          y="39"
          width="96"
          height="82"
          rx="30"
        />
        <rect
          className="mascot-face"
          x="53"
          y="50"
          width="74"
          height="58"
          rx="22"
        />
        <circle className="mascot-eye mascot-eye-left" cx="76" cy="77" r="7" />
        <circle
          className="mascot-eye mascot-eye-right"
          cx="105"
          cy="77"
          r="7"
        />
        <path className="mascot-mouth" d="M82 94q9 8 18 0" />
        <path className="mascot-body" d="M62 116h56l12 42H50z" />
        <rect
          className="mascot-badge"
          x="78"
          y="126"
          width="24"
          height="19"
          rx="7"
        />
        <path className="mascot-badge-mark" d="m85 139 4-8h6l-4 8z" />
        <circle className="mascot-signal" cx="90" cy="22" r="5" />
      </svg>
    </div>
  );
}

function WelcomeParticles() {
  useEffect(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-welcome-particles]',
    );
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    type Particle = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      color: string;
    };

    let width = 1;
    let height = 1;
    let animationFrame = 0;
    let seed = 20_260_905;
    let particles: Particle[] = [];
    const pointer = { x: -1_000, y: -1_000 };
    let colors: string[] = [];
    let connectionColor = 'rgba(201,255,54,.13)';
    const readThemeColors = () => {
      const styles = window.getComputedStyle(document.documentElement);
      const token = (name: string, fallback: string) =>
        styles.getPropertyValue(name).trim() || fallback;
      const light = document.documentElement.dataset.theme === 'light';
      colors = [
        token('--lime', '#c9ff36'),
        token('--blue', '#36a8ff'),
        token('--violet', '#8b5cff'),
        light ? '#38513f' : '#ffffff',
        token('--coral', '#ff5d5d'),
      ];
      connectionColor = light ? 'rgba(75,111,0,.15)' : 'rgba(201,255,54,.13)';
    };
    const random = () => {
      seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
      return seed / 4_294_967_296;
    };

    const rebuild = () => {
      readThemeColors();
      seed = 20_260_905;
      particles = Array.from({ length: 20 }, (_, index) => ({
        x: random() * width,
        y: random() * height,
        vx: (random() - 0.5) * 0.15,
        vy: (random() - 0.5) * 0.15,
        radius: index % 5 === 0 ? 2.1 : 1.1 + random() * 0.65,
        color: colors[index % colors.length],
      }));
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      rebuild();
    };

    const draw = (move: boolean) => {
      context.clearRect(0, 0, width, height);
      if (move) {
        for (const particle of particles) {
          const dx = particle.x - pointer.x;
          const dy = particle.y - pointer.y;
          const distance = Math.hypot(dx, dy);
          if (distance < 76 && distance > 0) {
            particle.x += (dx / distance) * 0.2;
            particle.y += (dy / distance) * 0.2;
          }
          particle.x = (particle.x + particle.vx + width) % width;
          particle.y = (particle.y + particle.vy + height) % height;
        }
      }

      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        for (let next = index + 1; next < particles.length; next += 1) {
          const neighbor = particles[next];
          const distance = Math.hypot(
            particle.x - neighbor.x,
            particle.y - neighbor.y,
          );
          if (distance > 92) continue;
          context.beginPath();
          context.moveTo(particle.x, particle.y);
          context.lineTo(neighbor.x, neighbor.y);
          context.globalAlpha = 1 - distance / 92;
          context.strokeStyle = connectionColor;
          context.lineWidth = 0.55;
          context.stroke();
          context.globalAlpha = 1;
        }
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fillStyle = particle.color;
        context.globalAlpha = particle.color === colors[3] ? 0.65 : 0.88;
        context.shadowColor = particle.color;
        context.shadowBlur = particle.radius > 1.5 ? 8 : 4;
        context.fill();
        context.globalAlpha = 1;
        context.shadowBlur = 0;
      }
    };

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const animate = () => {
      draw(true);
      animationFrame = window.requestAnimationFrame(animate);
    };
    const trackPointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      pointer.x = inside ? event.clientX - rect.left : -1_000;
      pointer.y = inside ? event.clientY - rect.top : -1_000;
    };

    const observer = new ResizeObserver(resize);
    const themeObserver = new MutationObserver(() => {
      rebuild();
      draw(false);
    });
    observer.observe(canvas);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    window.addEventListener('pointermove', trackPointer, { passive: true });
    resize();
    if (reduceMotion) draw(false);
    else animate();

    return () => {
      observer.disconnect();
      themeObserver.disconnect();
      window.removeEventListener('pointermove', trackPointer);
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <canvas
      className="welcome-particles"
      data-welcome-particles
      aria-hidden="true"
    />
  );
}

function usePrefersReducedMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return reduceMotion;
}

const welcomeMoneyDrops = [
  ['$', 6, 0.1, 5.6, -18, 16],
  ['NT$', 14, 2.4, 6.4, 22, 12],
  ['$', 23, 1.2, 5.1, -14, 14],
  ['$', 31, 3.8, 6.8, 18, 11],
  ['NT$', 39, 0.7, 5.9, -24, 13],
  ['$', 48, 4.4, 6.2, 20, 15],
  ['$', 57, 1.8, 5.4, -16, 12],
  ['NT$', 66, 3.1, 6.6, 25, 11],
  ['$', 74, 0.4, 5.2, -20, 15],
  ['$', 82, 4.9, 6.1, 16, 12],
  ['NT$', 90, 2.1, 5.8, -18, 11],
  ['$', 96, 3.5, 6.9, 14, 14],
] as const;

function MoneyRain() {
  return (
    <div className="money-rain" aria-hidden="true">
      {welcomeMoneyDrops.map(
        ([symbol, left, delay, duration, drift, size], index) => (
          <i
            key={`${symbol}-${left}-${index}`}
            style={
              {
                '--money-x': `${left}%`,
                '--money-delay': `${delay}s`,
                '--money-duration': `${duration}s`,
                '--money-drift': `${drift}px`,
                '--money-size': `${size}px`,
              } as CSSProperties
            }
          >
            <span>{symbol}</span>
          </i>
        ),
      )}
    </div>
  );
}

type TypewriterPhase = 'waiting' | 'typing' | 'holding' | 'deleting';

function useLoopingTypewriter(
  totalLength: number,
  startDelay: number,
  typeDelay: number,
  holdDelay: number,
  deleteDelay: number,
  restartDelay: number,
) {
  const reduceMotion = usePrefersReducedMotion();
  const [state, setState] = useState<{
    visibleLength: number;
    phase: TypewriterPhase;
    firstLoop: boolean;
  }>({ visibleLength: 0, phase: 'waiting', firstLoop: true });

  useEffect(() => {
    if (reduceMotion) return;
    const delay =
      state.phase === 'waiting'
        ? state.firstLoop
          ? startDelay
          : restartDelay
        : state.phase === 'holding'
          ? holdDelay
          : state.phase === 'deleting'
            ? deleteDelay
            : typeDelay;
    const timer = window.setTimeout(() => {
      setState((current) => {
        if (current.phase === 'waiting') {
          return { ...current, phase: 'typing' };
        }
        if (current.phase === 'holding') {
          return { ...current, phase: 'deleting' };
        }
        if (current.phase === 'typing') {
          const nextLength = Math.min(totalLength, current.visibleLength + 1);
          return {
            ...current,
            visibleLength: nextLength,
            phase: nextLength >= totalLength ? 'holding' : 'typing',
          };
        }
        const nextLength = Math.max(0, current.visibleLength - 1);
        return {
          visibleLength: nextLength,
          phase: nextLength === 0 ? 'waiting' : 'deleting',
          firstLoop: false,
        };
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    deleteDelay,
    holdDelay,
    reduceMotion,
    restartDelay,
    startDelay,
    state.firstLoop,
    state.phase,
    state.visibleLength,
    totalLength,
    typeDelay,
  ]);

  return {
    reduceMotion,
    visibleLength: reduceMotion ? totalLength : state.visibleLength,
  };
}

function WelcomeBelief() {
  const firstLine = 'ALL IN 不是走投無路。';
  const secondLine = '是有夢想，所以選擇全力以赴。';
  const totalLength = firstLine.length + secondLine.length;
  const { reduceMotion, visibleLength: effectiveVisibleLength } =
    useLoopingTypewriter(totalLength, 520, 110, 3_400, 55, 950);
  const firstVisible = firstLine.slice(0, effectiveVisibleLength);
  const secondVisible = secondLine.slice(
    0,
    Math.max(0, effectiveVisibleLength - firstLine.length),
  );
  const typingSecond = effectiveVisibleLength > firstLine.length;

  return (
    <p
      className="welcome-belief welcome-typewriter"
      aria-label={`${firstLine} ${secondLine}`}
    >
      <span aria-hidden="true">
        {firstVisible}
        {!typingSecond && !reduceMotion && <i />}
      </span>
      <strong aria-hidden="true">
        {secondVisible}
        {typingSecond && !reduceMotion && <i />}
      </strong>
    </p>
  );
}

function CompassManifesto() {
  const headline = '省下日常，投資夢想。';
  const detail = '把日常省下的每一筆，ALL IN 真正想完成的未來。';
  const totalLength = headline.length + detail.length;
  const [canAnimate, setCanAnimate] = useState(false);
  const { reduceMotion, visibleLength } = useLoopingTypewriter(
    totalLength,
    1_600,
    88,
    4_200,
    48,
    1_200,
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setCanAnimate(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // Keep the server output and the browser's first render identical. The
  // animated markup is introduced only after hydration, while reduced-motion
  // users retain the complete semantic caption without a moving cursor.
  if (!canAnimate || reduceMotion) {
    return (
      <figcaption className="compass-manifesto">
        <span>OUR NORTH STAR</span>
        <strong>{headline}</strong>
        <small>{detail}</small>
      </figcaption>
    );
  }

  const visibleHeadline = headline.slice(0, visibleLength);
  const visibleDetail = detail.slice(
    0,
    Math.max(0, visibleLength - headline.length),
  );
  const typingDetail = visibleLength > headline.length;

  return (
    <figcaption
      className="compass-manifesto compass-manifesto-typewriter"
      aria-label={`OUR NORTH STAR ${headline} ${detail}`}
    >
      <span aria-hidden="true">OUR NORTH STAR</span>
      <strong aria-hidden="true">
        {visibleHeadline}
        {!typingDetail && !reduceMotion && <span className="type-cursor" />}
      </strong>
      <small aria-hidden="true">
        {visibleDetail}
        {typingDetail && !reduceMotion && <span className="type-cursor" />}
      </small>
    </figcaption>
  );
}

function InteractiveCompass() {
  const reduceMotion = usePrefersReducedMotion();
  const [tilt, setTilt] = useState({ x: 28, y: -8 });
  return (
    <figure
      className="welcome-visual compass-interactive"
      onPointerMove={(event) => {
        if (reduceMotion || event.pointerType === 'touch') return;
        const rect = event.currentTarget.getBoundingClientRect();
        setTilt({
          x: 28 + ((event.clientY - rect.top) / rect.height - 0.5) * -18,
          y: ((event.clientX - rect.left) / rect.width - 0.5) * 22,
        });
      }}
      onPointerLeave={() => setTilt({ x: 28, y: -8 })}
    >
      <div className="compass-scene" aria-hidden="true">
        <div
          className="compass-stage"
          style={
            {
              '--tilt-x': `${tilt.x}deg`,
              '--tilt-y': `${tilt.y}deg`,
            } as CSSProperties
          }
        >
          <span className="compass-floor" />
          <span className="compass-depth" />
          <span className="compass-ring compass-ring-outer" />
          <span className="compass-ring compass-ring-inner" />
          <span className="compass-rim-grooves" />
          <span className="compass-bezel">
            <span className="compass-dial">
              <b className="compass-cardinal cardinal-north">夢</b>
              <b className="compass-cardinal cardinal-east">省</b>
              <b className="compass-cardinal cardinal-south">行</b>
              <b className="compass-cardinal cardinal-west">選</b>
              <span className="compass-axis-label">ALL IN</span>
              <span className="compass-needle">
                <span className="needle-dream" />
                <span className="needle-origin" />
              </span>
              <span className="compass-hub" />
              <span className="compass-glass" />
            </span>
          </span>
          <span className="compass-crown" />
          <i className="compass-node node-violet" />
          <i className="compass-node node-blue" />
          <i className="compass-node node-coral" />
        </div>
      </div>
      <CompassManifesto />
    </figure>
  );
}

function WelcomeScreen({
  ready,
  onDemo,
  onAccount,
}: {
  ready: boolean;
  onDemo: () => void;
  onAccount: () => void;
}) {
  return (
    <section className="welcome-screen simple-welcome">
      <WelcomeParticles />
      <MoneyRain />
      <div className="welcome-aili" aria-hidden="true">
        <AiliMascot compact />
      </div>
      <div className="welcome-mark">
        <span>ALL</span>
        <span>IN</span>
        <span>LIFE</span>
      </div>
      <WelcomeBelief />
      <InteractiveCompass />
      <div className="welcome-actions">
        <button className="primary-action" onClick={onDemo} disabled={!ready}>
          <Sparkles />
          立即開始探索
          <ArrowRight />
        </button>
        <button
          className="secondary-action"
          onClick={onAccount}
          disabled={!ready}
        >
          <LogIn />
          登入後儲存清單
        </button>
      </div>
      <small>不登入也能搜尋；登入後才能儲存清單與收藏。</small>
    </section>
  );
}

function AccountScreen({
  user,
  syncStatus,
  onAuthenticate,
  onLogout,
  onContinue,
}: {
  user: AccountUser | null;
  syncStatus: 'idle' | 'saving' | 'saved' | 'error';
  onAuthenticate: (
    mode: 'login' | 'register',
    credentials: { username: string; password: string; nickname?: string },
  ) => Promise<string | null>;
  onLogout: () => Promise<void>;
  onContinue: () => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    const normalizedUsername = username.trim().toLowerCase();
    if (!ACCOUNT_USERNAME_PATTERN.test(normalizedUsername)) {
      setError('帳號需為 3–30 個小寫英數字、底線或連字號。');
      return;
    }
    if (password.length < ACCOUNT_PASSWORD_MIN_LENGTH) {
      setError(`密碼至少需要 ${ACCOUNT_PASSWORD_MIN_LENGTH} 個字元。`);
      return;
    }
    setBusy(true);
    setError('');
    const nextError = await onAuthenticate(mode, {
      username: normalizedUsername,
      password,
      ...(mode === 'register' ? { nickname } : {}),
    });
    setBusy(false);
    if (nextError) setError(nextError);
  }

  if (user) {
    return (
      <section className="screen account-screen account-signed-in">
        <span className="kicker">ACCOUNT</span>
        <h1>已登入生活帳號</h1>
        <p>清單、收藏與消費紀錄會儲存到這個帳號。</p>
        <div className="account-identity-card">
          <span className="account-identity-avatar">
            {(user.nickname || user.username).slice(0, 1)}
          </span>
          <span>
            <b>{user.nickname}</b>
            <small>@{user.username}</small>
          </span>
          <ShieldCheck />
        </div>
        <div className={`account-sync-card ${syncStatus}`}>
          <Database />
          <span>
            <b>
              {syncStatus === 'saving'
                ? '正在儲存帳號資料'
                : syncStatus === 'error'
                  ? '暫時無法同步'
                  : '帳號資料已連線'}
            </b>
            <small>收藏與清單變更會自動寫入；登入工作階段為 30 分鐘。</small>
          </span>
        </div>
        <button className="primary-action" onClick={onContinue}>
          繼續探索
          <ArrowRight />
        </button>
        <button className="secondary-action" onClick={() => void onLogout()}>
          登出帳號
        </button>
      </section>
    );
  }

  return (
    <section className="screen account-screen">
      <span className="kicker">ACCOUNT</span>
      <h1>登入生活帳號</h1>
      <p>不登入也能搜尋；登入後才能儲存清單與收藏。</p>
      <div className="account-tabs" role="tablist" aria-label="帳號方式">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          className={mode === 'login' ? 'active' : ''}
          onClick={() => {
            setMode('login');
            setError('');
          }}
        >
          登入
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'register'}
          className={mode === 'register' ? 'active' : ''}
          onClick={() => {
            setMode('register');
            setError('');
          }}
        >
          註冊
        </button>
      </div>
      <form
        className="account-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {mode === 'register' && (
          <label>
            暱稱
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={30}
              placeholder="顯示名稱（選填）"
            />
          </label>
        )}
        <label>
          帳號
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value.toLowerCase())}
            minLength={3}
            maxLength={30}
            pattern="[a-z0-9_-]{3,30}"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            placeholder="3–30 個英數字、_ 或 -"
            required
          />
        </label>
        <label>
          密碼
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={ACCOUNT_PASSWORD_MIN_LENGTH}
            maxLength={128}
            autoComplete={
              mode === 'login' ? 'current-password' : 'new-password'
            }
            placeholder={`至少 ${ACCOUNT_PASSWORD_MIN_LENGTH} 個字元`}
            required
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-action account-submit" disabled={busy}>
          <LogIn />
          {busy ? '處理中…' : mode === 'login' ? '登入帳號' : '建立帳號並登入'}
          <ArrowRight />
        </button>
      </form>
      <div className="account-privacy-card">
        <ShieldCheck />
        <span>
          <b>登入與隱私</b>
          <small>
            密碼只保存雜湊；權杖只留在本分頁，30
            分鐘後自動失效。語音與搜尋原文不會寫入帳號。
          </small>
        </span>
      </div>
    </section>
  );
}

function SopGuide({
  onClose,
  onInstall,
  pwaStatus,
  finishLabel,
}: {
  onClose: () => void;
  onInstall: () => void;
  pwaStatus: string;
  finishLabel: string;
}) {
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
    {
      eyebrow: 'STEP 04 · 安裝 PWA',
      title: '把 AILI 帶到主畫面',
      copy: '安裝後可像 App 一樣全螢幕開啟；已快取的介面在網路不穩時仍可使用。',
      icon: <Smartphone />,
    },
  ];
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setStep((current) =>
          current < guide.length - 1 ? current + 1 : current,
        ),
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
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          )}
          {step === 1 && (
            <div className="guide-constraints" aria-hidden="true">
              <i>現在</i>
              <i>NT$500</i>
              <i>2 km</i>
            </div>
          )}
          {step === 2 && (
            <div className="guide-agents" aria-hidden="true">
              <i>
                <b>CP</b>
                <span />
              </i>
              <i>
                <b>0元</b>
                <span />
              </i>
            </div>
          )}
          {step === 3 && (
            <div className="guide-pwa">
              <button type="button" onClick={onInstall}>
                <Download />
                安裝 PWA
              </button>
              <small>{pwaStatus}</small>
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
            >
              <i />
            </button>
          ))}
        </div>
        <button
          className="primary-action sop-guide-next"
          onClick={() =>
            step < guide.length - 1 ? setStep(step + 1) : onClose()
          }
        >
          {step < guide.length - 1 ? '下一步' : finishLabel}
          <ArrowRight />
        </button>
      </div>
    </dialog>
  );
}

function OnboardingScreen({
  profile,
  filters,
  musicEnabled,
  onProfile,
  onFilters,
  onMusicToggle,
  onDone,
}: {
  profile: Profile;
  filters: Filters;
  musicEnabled: boolean;
  onProfile: (p: Profile) => void;
  onFilters: (f: Filters) => void;
  onMusicToggle: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState(1);
  return (
    <section className="screen onboarding-screen">
      <div className="onboarding-top">
        <span className="brand-inline">ALL IN LIFE</span>
        <div className="onboarding-tools">
          <ThemeToggle />
          <BackgroundMusicToggle
            enabled={musicEnabled}
            onToggle={onMusicToggle}
          />
          <button className="skip-button" onClick={onDone}>
            略過
          </button>
        </div>
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
            <label className="field-label" htmlFor="onboarding-budget">
              單次預算
              <MoneyInput
                id="onboarding-budget"
                value={filters.budget}
                onValueChange={(budget) => onFilters({ ...filters, budget })}
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
              <b>個人化設定已完成</b>
              <small>預算、排除與喜好會套用到每次推薦</small>
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
  areaLabel,
  unread,
  musicEnabled,
  onBack,
  onHome,
  onNotifications,
  onSettings,
  onMusicToggle,
}: {
  view: View;
  nowText: string;
  areaLabel: string;
  unread: number;
  musicEnabled: boolean;
  onBack: () => void;
  onHome: () => void;
  onNotifications: () => void;
  onSettings: () => void;
  onMusicToggle: () => void;
}) {
  const root = ['home', 'results', 'saved', 'team', 'analytics'].includes(view);
  const titles: Partial<Record<View, string>> = {
    account: '帳號',
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
    <header
      className={`app-header glass ${root ? 'root-header' : ''} ${view === 'home' ? 'home-header' : ''}`}
    >
      {root ? (
        <button
          className="brand-lockup"
          onClick={onHome}
          aria-label="ALL IN LIFE，回到首頁"
        >
          <b
            className={view === 'home' ? 'brand-typewriter' : undefined}
            aria-hidden="true"
          >
            ALL IN LIFE
          </b>
          <small>
            <i />
            {nowText} · {areaLabel}
          </small>
        </button>
      ) : (
        <button className="icon-button" onClick={onBack} aria-label="返回">
          <ArrowLeft />
        </button>
      )}
      {!root && <strong className="header-title">{titles[view]}</strong>}
      <div className="header-actions">
        <ThemeToggle />
        <button
          className="icon-button notification-button"
          onClick={onNotifications}
          aria-label={unread > 0 ? `通知，${unread} 則未讀` : '通知'}
          aria-current={view === 'notifications' ? 'page' : undefined}
        >
          <Bell />
          {unread > 0 && (
            <span className="notification-badge" aria-hidden="true">
              {unread}
            </span>
          )}
        </button>
        <BackgroundMusicToggle
          enabled={musicEnabled}
          onToggle={onMusicToggle}
        />
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

function ReadyScreen({
  filters,
  need,
  mode,
  validationError,
  onEdit,
  onStart,
}: {
  filters: Filters;
  need: string;
  mode: Mode;
  validationError: string;
  onEdit: () => void;
  onStart: () => void;
}) {
  return (
    <section className="screen ready-screen">
      <span className="kicker step-kicker">STEP 3 · 開始探索</span>
      <h1>
        條件確認完成
        <br />
        準備開始探索
      </h1>
      <p>最後看一次摘要；按下按鈕後，兩個獵人才會正式出動。</p>
      <div className="ready-brief interactive-shine">
        <span className="ready-label">
          <Check />
          已確認的需求
        </span>
        <blockquote>{need || '尚未輸入文字需求'}</blockquote>
        <div className="ready-metrics">
          <span>
            <Clock3 />
            <b>
              {filters.date.slice(5)} {filters.time}
            </b>
          </span>
          <span>
            <CircleDollarSign />
            <b>NT${filters.budget}</b>
          </span>
          <span>
            <Users />
            <b>{filters.people} 人</b>
          </span>
          <span>
            <MapPin />
            <b>{filters.distance} km</b>
          </span>
        </div>
        <div className="ready-tags">
          {filters.preferences.map((tag) => (
            <i key={tag}>喜好 · {tag}</i>
          ))}
          {filters.exclusions.map((tag) => (
            <i className="exclude" key={tag}>
              排斥 · {tag}
            </i>
          ))}
        </div>
      </div>
      <div className="ready-agent-pair">
        <span>
          <i className="lime-agent">
            <CircleDollarSign />
          </i>
          <b>CP 值獵人</b>
          <small>價格、距離、喜好</small>
        </span>
        <span>
          <i className="blue-agent">
            <Sparkles />
          </i>
          <b>零元獵人</b>
          <small>免費、資格、時間</small>
        </span>
      </div>
      <div className="ready-mode">
        目前模式：<b>{modes[mode].title}</b>
      </div>
      {validationError && (
        <p className="form-error" role="alert">
          {validationError}
        </p>
      )}
      <button
        className="primary-action flow-action ready-start"
        onClick={onStart}
      >
        <Radar />
        開始探索
        <ArrowRight />
      </button>
      <button className="secondary-action ready-edit" onClick={onEdit}>
        <Pencil />
        返回修改條件
      </button>
    </section>
  );
}

function CatalogCoverageCard({
  summary,
  status,
  signedIn,
  onAccount,
}: {
  summary: CatalogSummaryResponse | null;
  status: 'loading' | 'ready' | 'error';
  signedIn: boolean;
  onAccount: () => void;
}) {
  const [open, setOpen] = useState(false);
  const total =
    summary?.categories.reduce((sum, category) => sum + category.count, 0) ?? 0;
  const verifiedTotal =
    summary?.categories.reduce(
      (sum, category) => sum + category.verifiedCount,
      0,
    ) ?? 0;
  const pendingTotal = Math.max(0, total - verifiedTotal);
  const sourceTotal = new Set(
    summary?.categories.flatMap((category) =>
      category.sources.map(
        (source) => `${source.publisher}\u0000${source.title}`,
      ),
    ) ?? [],
  ).size;
  const syncedAt = summary?.syncedAt ? new Date(summary.syncedAt) : null;
  const syncedLabel =
    syncedAt && !Number.isNaN(syncedAt.getTime())
      ? new Intl.DateTimeFormat('zh-TW', {
          timeZone: 'Asia/Taipei',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }).format(syncedAt)
      : '等待首次同步';
  return (
    <section className="catalog-coverage-card" aria-label="資料來源與查核">
      <div className="catalog-coverage-summary">
        <span className="catalog-coverage-icon">
          <ShieldCheck />
        </span>
        <span>
          <small>來源與查核</small>
          <strong>
            {status === 'loading'
              ? '正在讀取資料狀態…'
              : status === 'error'
                ? '資料統計暫時無法連線'
                : `${money(total)} 筆已串接 · ${money(verifiedTotal)} 筆核心已驗證`}
          </strong>
          <em>
            {status === 'ready'
              ? `${sourceTotal} 個可查詢來源 · ${money(pendingTotal)} 筆待確認`
              : '圓山站 2 km · 食品、日用品、公益、活動與交通'}
          </em>
        </span>
      </div>
      {summary && (
        <button
          className="catalog-coverage-toggle"
          type="button"
          aria-expanded={open}
          aria-controls="catalog-coverage-details"
          onClick={() => setOpen((current) => !current)}
        >
          <span>查看各類別</span>
          <span>
            {summary.categories.length} 類 · 資料同步{' '}
            {syncedLabel.split(' ')[0]}
          </span>
          <ChevronDown />
        </button>
      )}
      {open && summary && (
        <div className="catalog-coverage-details" id="catalog-coverage-details">
          <div className="catalog-coverage-source">
            <Database />
            <span>
              <b>
                {summary.source === 'd1'
                  ? '資料庫已連線'
                  : '最近資料快照已載入'}
              </b>
              <small>最近同步 {syncedLabel}</small>
            </span>
          </div>
          <div className="catalog-category-counts">
            {summary.categories.map((category) => {
              const verifiedRate = category.count
                ? Math.round((category.verifiedCount / category.count) * 100)
                : 0;
              return (
                <article key={category.key}>
                  <header>
                    <b>{category.label}</b>
                    <small>{category.sources.length} 個來源</small>
                  </header>
                  <div className="catalog-category-metrics">
                    <span>
                      <small>已串接</small>
                      <strong>{money(category.count)}</strong>
                    </span>
                    <span>
                      <small>
                        <ShieldCheck aria-hidden="true" />
                        核心已驗證
                      </small>
                      <strong>{money(category.verifiedCount)}</strong>
                    </span>
                    <span>
                      <small>待確認</small>
                      <strong>
                        {money(category.count - category.verifiedCount)}
                      </strong>
                    </span>
                  </div>
                  <progress
                    className="catalog-verification-track"
                    aria-label={`${category.label}驗證比例`}
                    max={100}
                    value={verifiedRate}
                  />
                  <span className="catalog-category-sources">
                    {category.sources.length
                      ? category.sources.map((source) =>
                          source.url ? (
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              key={`${source.publisher}-${source.title}`}
                            >
                              {source.title}
                            </a>
                          ) : (
                            <span key={`${source.publisher}-${source.title}`}>
                              {source.title}
                            </span>
                          ),
                        )
                      : '目前條件內尚無可顯示資料'}
                  </span>
                </article>
              );
            })}
          </div>
          <p>
            「已串接」代表資料已進入目前可查詢的資料層；「核心已驗證」代表來源連結、查核時間與身分、地點等核心欄位齊全，不代表價格、名額、庫存或開放狀態皆為即時。
          </p>
        </div>
      )}
      {!signedIn && (
        <button
          className="catalog-account-cta"
          type="button"
          onClick={onAccount}
        >
          <LogIn />
          登入後可儲存清單與收藏
          <ChevronRight />
        </button>
      )}
    </section>
  );
}

function HomeScreen({
  profile,
  mode,
  filters,
  need,
  validationError,
  aiParseStatus,
  locationStatus,
  locationPermission,
  savedCount,
  budgetSummary,
  catalogSummary,
  catalogSummaryStatus,
  signedIn,
  onMode,
  onNeed,
  onVoice,
  recording,
  onConfirm,
  onProfile,
  onAnalytics,
  onTeam,
  onGuide,
  onRequestLocation,
  onDeclineLocation,
  onAccount,
}: {
  profile: Profile;
  mode: Mode;
  filters: Filters;
  need: string;
  validationError: string;
  aiParseStatus: AiParseStatus;
  locationStatus: string;
  locationPermission: LocationPermission;
  savedCount: number;
  budgetSummary: BudgetSummary;
  catalogSummary: CatalogSummaryResponse | null;
  catalogSummaryStatus: 'loading' | 'ready' | 'error';
  signedIn: boolean;
  onMode: (m: Mode) => void;
  onNeed: (s: string) => void;
  onVoice: () => void;
  recording: boolean;
  onConfirm: () => void;
  onProfile: () => void;
  onAnalytics: () => void;
  onTeam: () => void;
  onGuide: () => void;
  onRequestLocation: () => void;
  onDeclineLocation: () => void;
  onAccount: () => void;
}) {
  const reduceMotion = usePrefersReducedMotion();
  const [promptIndex, setPromptIndex] = useState(0);
  const [typedPrompt, setTypedPrompt] = useState('');
  const [deletingPrompt, setDeletingPrompt] = useState(false);
  useEffect(() => {
    if (reduceMotion) return;
    const target = homePrompts[promptIndex];
    const complete = typedPrompt === target;
    const empty = typedPrompt.length === 0;
    const delay =
      complete && !deletingPrompt ? 1_900 : deletingPrompt ? 38 : 72;
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
  }, [deletingPrompt, promptIndex, reduceMotion, typedPrompt]);
  const visiblePrompt = reduceMotion ? homePrompts[0] : typedPrompt;
  const locationHeading =
    locationPermission === 'granted'
      ? '已取得目前位置'
      : locationPermission === 'requesting'
        ? '正在等待定位授權'
        : locationPermission === 'declined'
          ? '目前使用圓山站估算'
          : locationPermission === 'denied'
            ? '無法取得目前位置'
            : '是否同意使用目前位置？';
  const canRequestLocation =
    locationPermission === 'idle' ||
    locationPermission === 'declined' ||
    locationPermission === 'denied';
  return (
    <section className="screen home-screen">
      <div className="greeting-row">
        <div className="typewriter-greeting">
          <span className="kicker">嗨，{profile.name || '旅人'}</span>
          <h1>
            <span aria-hidden="true">
              {visiblePrompt}
              <i />
            </span>
            <span className="sr-only">{homePrompts[promptIndex]}</span>
          </h1>
        </div>
        <button
          className="avatar-button"
          onClick={onProfile}
          style={{ background: profile.avatar }}
          aria-label="編輯個人檔案"
        >
          {(profile.name || '旅人').slice(0, 1)}
        </button>
      </div>
      {budgetSummary.budget > 0 || budgetSummary.transactionCount > 0 ? (
        <button
          className="wallet-card"
          onClick={onAnalytics}
          aria-label="查看本月消費分析"
        >
          <div>
            <span className="wallet-label">
              <WalletCards />
              {budgetSummary.remaining >= 0 ? '本月可用' : '本月超出預算'}
            </span>
            <strong>NT$ {money(Math.abs(budgetSummary.remaining))}</strong>
            <small className="wallet-context">
              已花 NT${money(budgetSummary.spent)} ／ 月預算 NT$
              {money(budgetSummary.budget)}
            </small>
          </div>
          <div className="wallet-side">
            <span>比可比方案省下</span>
            <b>NT$ {money(budgetSummary.saved)}</b>
            <small>{budgetSummary.transactionCount} 筆紀錄 · 查看分析</small>
          </div>
          <div className="wallet-progress" aria-hidden="true">
            <i style={{ width: `${budgetSummary.usedPercentage}%` }} />
          </div>
        </button>
      ) : (
        <button className="account-empty-card" onClick={onAnalytics}>
          <Database />
          <span>
            <b>尚未設定月預算</b>
            <small>
              到消費分析設定預算；完成選擇後會同步累積花費與省下金額。
            </small>
          </span>
          <ChevronRight />
        </button>
      )}
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
        <div className="mission-top">
          <span className="mode-dot" />
          <span>STEP 1 · 輸入需求</span>
        </div>
        <button
          className={`voice-action ${recording ? 'recording' : ''}`}
          onClick={onVoice}
          disabled={aiParseStatus === 'loading'}
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
            placeholder={modeNeedExamples[mode]}
            onChange={(e) => onNeed(e.target.value)}
            disabled={aiParseStatus === 'loading'}
            aria-label="文字輸入需求"
            aria-invalid={Boolean(validationError)}
            aria-describedby={validationError ? 'home-need-error' : undefined}
          />
          <span>輸入完成後，下一步會強制確認條件</span>
        </label>
        {validationError && (
          <p id="home-need-error" className="form-error" role="alert">
            {validationError}
          </p>
        )}
        <div className="constraint-row">
          {aiParseStatus !== 'idle' && (
            <output aria-live="polite">
              <span>
                {aiParseStatus === 'loading'
                  ? 'AI 正在整理…'
                  : aiParseStatus === 'success'
                    ? 'AI 已整理，請確認'
                    : 'AI 暫時無法使用，可手動確認'}
              </span>
            </output>
          )}
          <span>
            {filters.date.slice(5)} {filters.time}
          </span>
          <span>
            {filters.budget > 0 ? `NT$${filters.budget}` : '預算未設'}
          </span>
          <span>{filters.people} 人</span>
          <span>{filters.distance} km</span>
        </div>
        <button
          className="primary-action flow-action"
          onClick={() => onConfirm()}
          disabled={aiParseStatus === 'loading'}
          aria-busy={aiParseStatus === 'loading'}
        >
          <SlidersHorizontal />
          {aiParseStatus === 'loading'
            ? 'AI 正在整理需求…'
            : '下一步：確認需求與限制'}
          <ArrowRight />
        </button>
      </div>
      <CatalogCoverageCard
        summary={catalogSummary}
        status={catalogSummaryStatus}
        signedIn={signedIn}
        onAccount={onAccount}
      />
      <button className="sop-launcher" onClick={onGuide}>
        <span className="sop-launcher-icon">
          <Sparkles />
        </span>
        <span>
          <b>再次查看 · 動畫與 PWA 教學</b>
          <small>輸入需求 → 確認條件 → 雙獵人 → 安裝主畫面</small>
        </span>
        <ChevronRight />
      </button>
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
      <div className={`location-consent ${locationPermission}`}>
        <span className="location-consent-icon">
          <MapPin />
        </span>
        <span className="location-consent-copy">
          <b>{locationHeading}</b>
          <small>{locationStatus} · 距離會用於 CP 值與最大距離篩選</small>
        </span>
        {canRequestLocation && (
          <span className="location-consent-actions">
            <button onClick={onRequestLocation}>
              {locationPermission === 'idle' ? '同意定位' : '重新定位'}
            </button>
            <button onClick={onDeclineLocation}>
              {locationPermission === 'idle' ? '暫不' : '使用圓山站'}
            </button>
          </span>
        )}
        {locationPermission === 'requesting' && <em>等待授權…</em>}
        {locationPermission === 'granted' && <Check />}
      </div>
      <p className="home-footnote">
        {signedIn
          ? `${savedCount} 個收藏會顯示到期提醒`
          : '訪客模式不會儲存清單；搜尋功能仍可完整使用'}
      </p>
    </section>
  );
}

function SearchScreen({
  status,
  filters,
  resultCount,
  errorMessage,
  onRetry,
  onEdit,
}: {
  status: SearchStatus;
  filters: Filters;
  resultCount: number;
  errorMessage?: string;
  onRetry: () => void;
  onEdit: () => void;
}) {
  const activeIndex =
    status === 'idle' || status === 'validating'
      ? 0
      : status === 'loading' || status === 'error'
        ? 1
        : status === 'ranking'
          ? 2
          : 3;
  const complete = status === 'success' || status === 'empty';
  const statusLabel =
    status === 'validating'
      ? '驗證需求'
      : status === 'loading'
        ? '整理選項'
        : status === 'ranking'
          ? '計算排名'
          : status === 'success'
            ? '整理完成'
            : status === 'empty'
              ? '查詢完成'
              : status === 'error'
                ? '連線失敗'
                : '準備開始';
  const lifecycleProgress = complete
    ? 100
    : status === 'ranking'
      ? 76
      : status === 'loading' || status === 'error'
        ? 48
        : 22;
  return (
    <section className="screen search-screen">
      <div className={`search-orbit status-${status}`}>
        <div className="orbit-ring ring-one" />
        <div className="orbit-ring ring-two" />
        <Radar />
        <span>{statusLabel}</span>
      </div>
      <span className="kicker lime-text">
        {status === 'error' ? '這次搜尋尚未完成' : '正在整理最佳選擇'}
      </span>
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
          activeIndex={activeIndex}
          complete={complete}
          failed={status === 'error'}
          labels={['讀取需求', '套用條件', '計算距離', 'CP 排序']}
          count={`${resultCount} 筆候選`}
          passed="條件符合"
          tone="lime"
        />
        <AgentPanel
          title="零元獵人"
          subtitle="免費資源搜尋"
          activeIndex={Math.max(
            0,
            activeIndex - (status === 'loading' ? 1 : 0),
          )}
          complete={complete}
          failed={status === 'error'}
          labels={['讀取需求', '免費條件', '確認時段', '零元排序']}
          count={`${resultCount} 筆候選`}
          passed={filters.budget === 0 ? '優先顯示' : '混合顯示'}
          tone="blue"
        />
      </div>
      <Progress value={lifecycleProgress} className="search-progress" />
      <div className="scan-stats">
        <span>圓山生活圈</span>
        <span>{statusLabel}</span>
        <span>{complete ? `${resultCount} 筆候選` : '請稍候'}</span>
      </div>
      {status === 'error' && (
        <div className="search-error" role="alert">
          <Database />
          <span>
            <b>目前無法取得候選資料</b>
            <small>{errorMessage ?? '請檢查連線後再試一次。'}</small>
          </span>
          <button type="button" onClick={onRetry}>
            重新搜尋
          </button>
          <button type="button" onClick={onEdit}>
            修改條件
          </button>
        </div>
      )}
    </section>
  );
}

function AgentPanel({
  title,
  subtitle,
  activeIndex,
  complete,
  failed,
  labels,
  count,
  passed,
  tone,
}: {
  title: string;
  subtitle: string;
  activeIndex: number;
  complete: boolean;
  failed: boolean;
  labels: string[];
  count: string;
  passed: string;
  tone: 'lime' | 'blue';
}) {
  const progress = complete
    ? 100
    : Math.round(
        ((Math.min(activeIndex, labels.length - 1) + 1) / labels.length) * 100,
      );
  return (
    <div
      className={`agent-panel agent-${tone}${complete ? ' complete' : ''}${failed ? ' failed' : ''}`}
    >
      <div className="agent-panel-top">
        <span>
          <i />
          {title}
        </span>
        <b>{subtitle}</b>
      </div>
      <div className="agent-steps">
        {labels.map((label, index) => (
          <span
            key={label}
            className={
              complete || index < activeIndex
                ? 'done'
                : index === activeIndex
                  ? 'working'
                  : ''
            }
          >
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
  const presets: Array<{ label: string; value: CpParams }> = [
    { label: '省最多', value: { price: 70, distance: 15, preference: 15 } },
    { label: '離我近', value: { price: 20, distance: 65, preference: 15 } },
    { label: '最合喜好', value: { price: 20, distance: 15, preference: 65 } },
  ];
  const sampleScore = sample ? cpFormulaScore(sample, filters, params) : null;
  return (
    <details className="cp-formula">
      <summary>
        <span>
          <CircleDollarSign />
          <b>我的 CP 值公式</b>
        </span>
        <strong>{sample ? (sampleScore ?? '條件不足') : '—'}</strong>
      </summary>
      <p>價格、距離與喜好會依下方權重算出排名。</p>
      <small>權重固定合計 100%；調整任一項會立即重排結果。</small>
      <div className="cp-presets" aria-label="快速選擇排序重點">
        {presets.map((preset) => {
          const active = fields.every(
            ({ key }) => params[key] === preset.value[key],
          );
          return (
            <button
              type="button"
              key={preset.label}
              className={active ? 'active' : ''}
              aria-pressed={active}
              onClick={() => onChange(preset.value)}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="formula-controls">
        {fields.map(({ key, label }) => (
          <label key={key}>
            <span>{label}</span>
            <Slider
              value={[params[key]]}
              min={0}
              max={100}
              step={5}
              aria-label={`${label}權重`}
              onValueChange={(value) => {
                const nextValue = Array.isArray(value) ? value[0] : value;
                onChange(rebalancePersonalCpWeights(params, key, nextValue));
              }}
            />
            <b>{params[key]}%</b>
          </label>
        ))}
      </div>
      {sample && (
        <small
          className="cp-ranking-live"
          key={`${sample.id}-${sampleScore}`}
          aria-live="polite"
        >
          目前第 1 名：{sample.title} · CP {sampleScore ?? '條件不足'}
        </small>
      )}
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

function VerificationMark({
  item,
  className = '',
}: {
  item: Result;
  className?: string;
}) {
  if (
    item.provenance !== 'verified-real' &&
    item.provenance !== 'verified-demo'
  ) {
    return null;
  }
  const label = item.verifiedFields?.length
    ? `已驗證：${item.verifiedFields.join('、')}`
    : '核心資料已驗證';
  return (
    <span
      className={`verification-mark ${className}`.trim()}
      role="img"
      aria-label={label}
      title={label}
    >
      <ShieldCheck />
    </span>
  );
}

function ResultCard({
  item,
  index,
  filters,
  cpParams,
  saved,
  aiExplanation,
  onOpen,
  onSave,
}: {
  item: Result;
  index: number;
  filters: Filters;
  cpParams: CpParams;
  saved: string[];
  aiExplanation?: AiExplanation;
  onOpen: (id: string) => void;
  onSave: (id: string) => void;
}) {
  const isSaved = saved.includes(item.id);

  return (
    <article
      className={`result-card tone-${item.tone} provenance-${item.provenance ?? 'real'}`}
      style={{ '--rank-index': index } as CSSProperties}
      onPointerMove={(event) => {
        const card = event.currentTarget;
        const bounds = card.getBoundingClientRect();
        const x = event.clientX - bounds.left;
        const y = event.clientY - bounds.top;
        card.style.setProperty('--spot-x', `${x}px`);
        card.style.setProperty('--spot-y', `${y}px`);
        card.style.setProperty(
          '--tilt-x',
          `${((y / bounds.height - 0.5) * -3.5).toFixed(2)}deg`,
        );
        card.style.setProperty(
          '--tilt-y',
          `${((x / bounds.width - 0.5) * 4.5).toFixed(2)}deg`,
        );
      }}
      onPointerLeave={(event) => {
        event.currentTarget.style.setProperty('--tilt-x', '0deg');
        event.currentTarget.style.setProperty('--tilt-y', '0deg');
      }}
    >
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
              {String(index + 1).padStart(2, '0')} · {item.subcategory}
            </span>
          </span>
          <span className="result-title">{item.title}</span>
          <span className="result-copy">
            {item.provider} · {item.distanceKm} km · {item.hours}
          </span>
          <span className="price-row">
            {item.totalCost === null ? (
              <strong>依現場價格</strong>
            ) : (
              <>
                <strong>
                  <small>NT$</small>
                  {money(item.totalCost)}
                </strong>
                {item.servings !== null && (
                  <span>
                    人均 <b>{money(item.totalCost / item.servings)}</b>
                  </span>
                )}
              </>
            )}
            <span>
              CP <b>{cpFormulaScore(item, filters, cpParams) ?? '—'}</b>
            </span>
          </span>
          <span className="result-condition">
            <Clock3 />
            {item.condition}
          </span>
          {aiExplanation && (
            <span className="result-condition">
              <Sparkles />
              <span>
                <b>
                  {aiExplanation.source === 'openai' ? 'AI 整理' : '規則整理'} ·{' '}
                  {aiExplanation.headline}
                </b>
                {aiExplanation.reasons.length > 0
                  ? `｜${aiExplanation.reasons.join('、')}`
                  : ''}
                {aiExplanation.caution ? `；${aiExplanation.caution}` : ''}
              </span>
            </span>
          )}
          <TagLine item={item} filters={filters} />
        </span>
      </button>
      <VerificationMark item={item} className="result-verification-mark" />
      <button
        className={`save-fab ${isSaved ? 'saved' : ''}`}
        onClick={() => onSave(item.id)}
        aria-label={isSaved ? '取消收藏' : '加入清單'}
        aria-pressed={isSaved}
      >
        <Heart />
      </button>
    </article>
  );
}

function ResultSkeletonList() {
  return (
    <div className="result-skeleton-list" aria-label="正在載入候選資料">
      {[0, 1, 2].map((item) => (
        <article className="result-skeleton" key={item} aria-hidden="true">
          <span className="skeleton-art" />
          <span className="skeleton-copy">
            <i className="skeleton-line short" />
            <i className="skeleton-line title" />
            <i className="skeleton-line medium" />
            <i className="skeleton-line price" />
            <i className="skeleton-line long" />
          </span>
        </article>
      ))}
      <span className="sr-only">正在整理並排序候選資料</span>
    </div>
  );
}

function ResultsScreen({
  items,
  allItems,
  supplementalItems,
  filters,
  locationLabel,
  catalogWarnings,
  catalogFacets,
  mode,
  cpParams,
  sort,
  saved,
  aiExplanations,
  searchStatus,
  onSort,
  onFiltersChange,
  onCpParams,
  onFilters,
  onRetry,
  onOpen,
  onSave,
}: {
  items: Result[];
  allItems: Result[];
  supplementalItems: Result[];
  filters: Filters;
  locationLabel: string;
  catalogWarnings: string[];
  catalogFacets: CatalogCategorySummary[] | null;
  mode: Mode;
  cpParams: CpParams;
  sort: Sort;
  saved: string[];
  aiExplanations: Record<string, AiExplanation>;
  searchStatus: SearchStatus;
  onSort: (s: Sort) => void;
  onFiltersChange: (f: Filters) => void;
  onCpParams: (p: CpParams) => void;
  onFilters: () => void;
  onRetry: () => void;
  onOpen: (id: string) => void;
  onSave: (id: string) => void;
}) {
  const [controlSheet, setControlSheet] = useState<'filters' | 'sort' | null>(
    null,
  );
  const [filterDraft, setFilterDraft] = useState(filters);
  const activeSort =
    sortOptions.find((option) => option.value === sort) ?? sortOptions[0];
  const loading =
    searchStatus === 'validating' ||
    searchStatus === 'loading' ||
    searchStatus === 'ranking';
  const hasError = searchStatus === 'error';
  const visibleItems = [...items, ...supplementalItems];
  const categoryCounts = resultCategories.map((category) => {
    const loadedCount = allItems.filter((item) => {
      const budgetMatch =
        mode === 'zero'
          ? isConfirmedFree(item)
          : filters.budget <= 0 ||
            item.totalCost === null ||
            item.totalCost <= filters.budget;
      return (
        item.category === category &&
        budgetMatch &&
        item.distanceKm <= filters.distance
      );
    }).length;
    return {
      category,
      shortLabel:
        catalogCategories.find((entry) => entry.label === category)
          ?.shortLabel ?? category,
      count:
        filters.exclusions.length > 0
          ? loadedCount
          : (catalogFacets?.find((facet) => facet.label === category)?.count ??
            loadedCount),
    };
  });
  const categoryTotal = categoryCounts.reduce(
    (total, item) => total + item.count,
    0,
  );
  return (
    <section className="screen results-screen">
      <div className="results-intro">
        <span className="kicker">
          推薦候選 · {locationLabel} {filters.distance} KM
        </span>
        <h1>
          {visibleItems.length
            ? `找到 ${visibleItems.length} 個合適選擇`
            : '目前沒有完全符合'}
        </h1>
        <div className="results-context" aria-label="目前搜尋條件">
          <span>
            <CalendarDays />
            {filters.date.slice(5)} {filters.time}
          </span>
          <span>
            <Users />
            {filters.people} 人
          </span>
          <span>
            <WalletCards />
            {filters.budget > 0 ? `NT$${money(filters.budget)}` : '不限預算'}
          </span>
        </div>
      </div>
      <div className="filter-row">
        <button
          className="filter-summary"
          aria-haspopup="dialog"
          onClick={() => {
            setFilterDraft(filters);
            setControlSheet('filters');
          }}
        >
          <SlidersHorizontal />
          <span>
            <b>快速篩選</b>
            <small>
              {filters.category} · {filters.distance} km
            </small>
          </span>
        </button>
        <div className="sort-picker">
          <button
            className="sort-button"
            aria-haspopup="dialog"
            aria-label={`排序方式 ${activeSort.label}`}
            onClick={() => setControlSheet('sort')}
          >
            <ArrowUpDown />
            <span>
              <small>排序</small>
              <b>{activeSort.label}</b>
            </span>
            <ChevronDown />
          </button>
        </div>
      </div>
      <nav className="category-filter" aria-label="推薦結果分類">
        <button
          className={filters.category === '全部' ? 'active' : ''}
          onClick={() => onFiltersChange({ ...filters, category: '全部' })}
        >
          <span>全部</span>
          <i>{categoryTotal}</i>
        </button>
        {categoryCounts.map(({ category, shortLabel, count }) => (
          <button
            key={category}
            className={filters.category === category ? 'active' : ''}
            style={
              { '--category-color': categoryColors[category] } as CSSProperties
            }
            onClick={() => onFiltersChange({ ...filters, category })}
            aria-label={`${category} ${count} 筆`}
          >
            {categoryIcon(category)}
            <span>{shortLabel}</span>
            <i>{count}</i>
          </button>
        ))}
      </nav>
      <CpFormulaPanel
        params={cpParams}
        onChange={onCpParams}
        sample={visibleItems[0]}
        filters={filters}
      />
      {loading && <ResultSkeletonList />}
      {hasError && !loading && (
        <div className="empty-state result-error-state" role="alert">
          <Database />
          <h2>候選資料暫時無法載入</h2>
          <p>{catalogWarnings[0] ?? '請確認網路連線後再試一次。'}</p>
          <button onClick={onRetry}>重新搜尋</button>
        </div>
      )}
      {!loading && !hasError && visibleItems.length === 0 ? (
        <div className="empty-state">
          <SlidersHorizontal />
          <h2>試著放寬一個條件</h2>
          <p>提高預算、距離，或切換其他類別。</p>
          <button onClick={onFilters}>修改篩選</button>
        </div>
      ) : null}
      {!loading && !hasError && visibleItems.length > 0 && (
        <div className="result-list">
          {visibleItems.map((item, index) => (
            <ResultCard
              key={`${item.id}-${sort}-${cpParams.price}-${cpParams.distance}-${cpParams.preference}`}
              item={item}
              index={index}
              filters={filters}
              cpParams={cpParams}
              saved={saved}
              aiExplanation={aiExplanations[item.id]}
              onOpen={onOpen}
              onSave={onSave}
            />
          ))}
        </div>
      )}
      <Dialog
        open={controlSheet !== null}
        onOpenChange={(open) => {
          if (!open) setControlSheet(null);
        }}
      >
        <DialogContent
          className="evidence-sheet results-control-sheet"
          showCloseButton={false}
        >
          <div className="sheet-handle" />
          <DialogHeader className="results-sheet-header">
            <span className="kicker lime-text">
              {controlSheet === 'filters' ? 'QUICK FILTER' : 'SORT RESULTS'}
            </span>
            <DialogTitle>
              {controlSheet === 'filters' ? '快速調整結果' : '選擇排序方式'}
            </DialogTitle>
            <DialogDescription>
              {controlSheet === 'filters'
                ? '先調整分類與距離；其他限制仍可進入完整條件頁修改。'
                : '排序只改變候選順序，不會隱藏資料。'}
            </DialogDescription>
          </DialogHeader>
          {controlSheet === 'filters' ? (
            <>
              <div className="quick-filter-group">
                <b>分類</b>
                <div className="quick-filter-options category-options">
                  {(['全部', ...resultCategories] as Filters['category'][]).map(
                    (category) => (
                      <button
                        type="button"
                        key={category}
                        aria-pressed={filterDraft.category === category}
                        style={
                          category === '全部'
                            ? undefined
                            : ({
                                '--category-color': categoryColors[category],
                              } as CSSProperties)
                        }
                        onClick={() =>
                          setFilterDraft({ ...filterDraft, category })
                        }
                      >
                        {category !== '全部' && categoryIcon(category)}
                        {category === '免費／公益資源'
                          ? '免費／公益'
                          : category}
                      </button>
                    ),
                  )}
                </div>
              </div>
              <div className="quick-filter-group">
                <b>最大距離</b>
                <div className="quick-filter-options distance-options">
                  {[0.5, 1, 1.5, 2].map((distance) => (
                    <button
                      type="button"
                      key={distance}
                      aria-pressed={filterDraft.distance === distance}
                      onClick={() =>
                        setFilterDraft({ ...filterDraft, distance })
                      }
                    >
                      {distance} km
                    </button>
                  ))}
                </div>
              </div>
              <div className="results-sheet-actions">
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => {
                    onFiltersChange(filterDraft);
                    setControlSheet(null);
                  }}
                >
                  <Check />
                  套用快速篩選
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => {
                    setControlSheet(null);
                    onFilters();
                  }}
                >
                  <SlidersHorizontal />
                  完整條件設定
                </button>
              </div>
            </>
          ) : (
            <div className="sheet-sort-options">
              {sortOptions.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  aria-pressed={sort === option.value}
                  className={sort === option.value ? 'active' : ''}
                  onClick={() => {
                    onSort(option.value);
                    setControlSheet(null);
                  }}
                >
                  <ArrowUpDown />
                  <span>
                    <b>{option.label}</b>
                    <small>{option.hint}</small>
                  </span>
                  {sort === option.value && <Check />}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function DetailScreen({
  item,
  itemScore,
  cpParams,
  filters,
  reportCount,
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
  reportCount: number;
  saved: boolean;
  onSave: () => void;
  onEvidence: () => void;
  onMap: () => void;
  onReport: () => void;
  onShare: () => void;
}) {
  const saving =
    item.totalCost !== null && item.benchmarkCost != null
      ? Math.max(0, item.benchmarkCost - item.totalCost)
      : null;
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
          <VerificationMark item={item} className="detail-verification-mark" />
        </div>
      ) : (
        <div
          className={`detail-hero tone-${item.tone}`}
          style={
            { '--card-accent': categoryColors[item.category] } as CSSProperties
          }
        >
          <span className="detail-hero-orbit" aria-hidden="true" />
          <span className="detail-hero-symbol">
            {categoryIcon(item.category)}
          </span>
          <span className="detail-hero-copy">
            <small>為你精選</small>
            <b>{item.category}</b>
            <em>{item.provider}</em>
          </span>
          <VerificationMark item={item} className="detail-verification-mark" />
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
          {item.serviceModes.join('／') || '現場服務'}
        </p>
        <div className="detail-score">
          <div>
            <span>總成本估算</span>
            <strong>
              {item.totalCost === null
                ? '依現場價格'
                : `NT$${money(item.totalCost)}`}
            </strong>
            <small>
              {item.totalCost === null
                ? (item.costReason ?? '現場提供多種方案')
                : item.servings === null
                  ? '單次方案'
                  : `人均 NT$${money(item.totalCost / item.servings)}`}
            </small>
          </div>
          <div>
            <span>個人 CP</span>
            <strong>{itemScore ?? '—'}</strong>
            <small>
              {itemScore === null ? '依目前條件排序' : '符合目前偏好'}
            </small>
          </div>
        </div>
        <div className="detail-formula">
          CP = 價格 × {cpParams.price}% ＋ 距離 × {cpParams.distance}% ＋ 喜好 ×{' '}
          {cpParams.preference}%
        </div>
        <TagLine item={item} filters={filters} />
        {saving !== null &&
          item.benchmarkCost != null &&
          item.benchmarkCost > 0 && (
            <div className="saving-card">
              <BadgePercent />
              <span>
                <b>比參考方案省 NT${money(saving)}</b>
                <small>
                  基準 NT${money(item.benchmarkCost)} · 同人數／同需求估算
                </small>
              </span>
              <strong>
                {Math.round((saving / item.benchmarkCost) * 100)}%
              </strong>
            </div>
          )}
        <div className="facts-grid">
          <Metric label="營業／時段" value={item.hours} />
          <Metric
            label="適用人數"
            value={item.servings ? `${item.servings} 人` : '1 人以上'}
          />
          <Metric label="使用者回報" value={`${reportCount} 則`} />
          <Metric
            label="服務方式"
            value={item.serviceModes.join('、') || '現場服務'}
          />
        </div>
        <div className="condition-box">
          <Zap />
          <p>{item.condition}</p>
        </div>
        <button className="evidence-button" onClick={onEvidence}>
          <ReceiptText />
          <span>
            <b>查看成本與方案資訊</b>
            <small>價格、距離、時段與回報</small>
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
  transactions,
  onCheckout,
  onOpen,
  onRemove,
  onDeleteTransaction,
  onHistory,
  onExplore,
  onShare,
}: {
  items: Result[];
  completed: string[];
  budget: number;
  transactions: Transaction[];
  onCheckout: (ids: string[], action: 'settle' | 'cancel') => void;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onDeleteTransaction: (id: string) => void;
  onHistory: () => void;
  onExplore: () => void;
  onShare: () => void;
}) {
  const payableIds = items
    .filter((item) => item.totalCost !== null)
    .map((item) => item.id);
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    payableIds.filter((id) => !completed.includes(id)),
  );
  const settledTotal = items
    .filter((item) => completed.includes(item.id))
    .reduce((sum, item) => sum + (item.totalCost ?? 0), 0);
  const pendingItems = items.filter((item) => !completed.includes(item.id));
  const pricedPendingItems = pendingItems.filter(
    (item) => item.totalCost !== null,
  );
  const unknownPendingCount = pendingItems.length - pricedPendingItems.length;
  const pendingTotal = pricedPendingItems.reduce(
    (sum, item) => sum + (item.totalCost ?? 0),
    0,
  );
  const settledCount = items.length - pendingItems.length;
  const projectedRemaining = budget - settledTotal - pendingTotal;
  const selectedPendingItems = items.filter(
    (item) =>
      selectedIds.includes(item.id) &&
      !completed.includes(item.id) &&
      item.totalCost !== null,
  );
  const selectedSettledItems = items.filter(
    (item) => selectedIds.includes(item.id) && completed.includes(item.id),
  );
  const selectedTotal = selectedPendingItems.reduce(
    (sum, item) => sum + (item.totalCost ?? 0),
    0,
  );
  const allSelected =
    payableIds.length > 0 && payableIds.every((id) => selectedIds.includes(id));
  const recentTransactions = [...transactions]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 3);

  const toggleSelected = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const clearAndCheckout = (action: 'settle' | 'cancel') => {
    const affectedIds =
      action === 'settle'
        ? selectedPendingItems.map((item) => item.id)
        : selectedSettledItems.map((item) => item.id);
    onCheckout(affectedIds, action);
    setSelectedIds((current) =>
      current.filter((id) => !affectedIds.includes(id)),
    );
  };

  return (
    <section className="screen saved-screen">
      <span className="kicker">THIS PLAN</span>
      <h1>這次清單</h1>
      <p>勾選要處理的項目，一次結算後同步更新消費分析與交易紀錄。</p>
      {items.length === 0 ? (
        <div className="empty-state">
          <Bookmark />
          <h2>還沒有清單項目</h2>
          <p>從結果加入選項後，可勾選多筆一次結算。</p>
          <button onClick={onExplore}>開始探索</button>
        </div>
      ) : (
        <>
          <div className="checkout-summary">
            <div>
              <span>待結算</span>
              <b>NT${money(pendingTotal)}</b>
              <small>
                {pendingItems.length} 筆
                {unknownPendingCount > 0
                  ? ` · ${unknownPendingCount} 筆待補金額`
                  : ''}
              </small>
            </div>
            <div>
              <span>本清單已結算</span>
              <b>NT${money(settledTotal)}</b>
              <small>{settledCount} 筆</small>
            </div>
            <div className={projectedRemaining < 0 ? 'over-budget' : ''}>
              <span>
                {unknownPendingCount > 0 ? '已知金額結算後' : '全部結算後'}
              </span>
              <b>
                {budget > 0
                  ? `${projectedRemaining < 0 ? '超出 ' : '剩餘 '}NT$${money(Math.abs(projectedRemaining))}`
                  : '不限預算'}
              </b>
              <small>
                {budget > 0 ? `預算 NT$${money(budget)}` : '依清單金額'}
              </small>
            </div>
          </div>
          <div className="checklist">
            {items.map((item) => {
              const settled = completed.includes(item.id);
              const selected = selectedIds.includes(item.id);
              const missingCost = item.totalCost === null;
              return (
                <article
                  key={item.id}
                  className={`${settled ? 'done' : ''} ${selected ? 'selected' : ''}`}
                >
                  <button
                    type="button"
                    className={`checkout-select ${settled ? 'settled' : ''} ${selected ? 'selected' : ''}`}
                    onClick={() => toggleSelected(item.id)}
                    disabled={missingCost}
                    aria-pressed={selected}
                    aria-label={
                      missingCost
                        ? `待補金額 ${item.title}`
                        : `${selected ? '取消選取' : '選取'} ${item.title}`
                    }
                  >
                    {(settled || selected) && <Check />}
                  </button>
                  <button
                    className="check-copy"
                    onClick={() => onOpen(item.id)}
                  >
                    <span
                      className={`checkout-state ${settled ? 'settled' : ''}`}
                    >
                      {settled ? '已結算' : missingCost ? '待補金額' : '待結算'}
                    </span>
                    <b>{item.title}</b>
                    <small>
                      {item.expiresAt
                        ? `提醒：${taipeiDateLabel(item.expiresAt)}`
                        : item.provider}
                    </small>
                  </button>
                  <strong>
                    {item.totalCost === null
                      ? '依現場價格'
                      : `NT$${money(item.totalCost)}`}
                  </strong>
                  <button
                    className="remove-button"
                    onClick={() => {
                      setSelectedIds((current) =>
                        current.filter((id) => id !== item.id),
                      );
                      onRemove(item.id);
                    }}
                    aria-label={`刪除清單項目 ${item.title}`}
                  >
                    <Trash2 />
                    刪除
                  </button>
                </article>
              );
            })}
          </div>
          <div className="batch-checkout-bar">
            <div className="batch-checkout-heading">
              <span>
                已選 {selectedIds.length} / {payableIds.length} 筆
              </span>
              <button
                type="button"
                onClick={() => setSelectedIds(allSelected ? [] : payableIds)}
              >
                {allSelected ? '取消全選' : '全選清單'}
              </button>
            </div>
            <div className="batch-checkout-total">
              <span>本次結算金額</span>
              <strong>NT${money(selectedTotal)}</strong>
            </div>
            <div className="batch-checkout-actions">
              {selectedPendingItems.length > 0 && (
                <button
                  type="button"
                  className="batch-checkout-button"
                  onClick={() => clearAndCheckout('settle')}
                >
                  <ReceiptText />
                  批次結算 {selectedPendingItems.length} 筆
                </button>
              )}
              {selectedSettledItems.length > 0 && (
                <button
                  type="button"
                  className="batch-cancel-button"
                  onClick={() => clearAndCheckout('cancel')}
                >
                  取消 {selectedSettledItems.length} 筆結算
                </button>
              )}
              {selectedPendingItems.length === 0 &&
                selectedSettledItems.length === 0 && (
                  <button
                    type="button"
                    className="batch-checkout-button"
                    disabled
                  >
                    <ReceiptText />
                    請先選取項目
                  </button>
                )}
            </div>
          </div>
          <div className="list-summary">
            <span>
              已結算 {settledCount} / {items.length} 筆
            </span>
            <Progress
              value={items.length ? (settledCount / items.length) * 100 : 0}
            />
          </div>
          <button className="primary-action" onClick={onShare}>
            <Share2 />
            分享這次清單
          </button>
        </>
      )}
      <section className="recent-transactions">
        <div className="section-heading">
          <div>
            <span className="kicker">RECENT</span>
            <h2>近期交易</h2>
          </div>
          <button type="button" onClick={onHistory}>
            查看全部
          </button>
        </div>
        {recentTransactions.length > 0 ? (
          <div className="recent-transaction-list">
            {recentTransactions.map((transaction) => (
              <article key={transaction.id}>
                <span className="history-icon">
                  {categoryIcon(transaction.category)}
                </span>
                <span>
                  <b>{transaction.title}</b>
                  <small>
                    {transaction.date} · 省 NT${money(transaction.saved)}
                  </small>
                </span>
                <strong>NT${money(transaction.amount)}</strong>
                <button
                  type="button"
                  onClick={() => onDeleteTransaction(transaction.id)}
                  aria-label={`刪除交易 ${transaction.title}`}
                >
                  <Trash2 />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="report-empty">完成清單結算後，交易會顯示在這裡。</div>
        )}
      </section>
    </section>
  );
}

type TeamOption = {
  id: string;
  tone: 'transport' | 'food' | 'daily';
  title: string;
  meta: string;
  highlight: string;
  description: string;
  facts: Array<{ label: string; value: string }>;
};

const teamOptions: TeamOption[] = [
  {
    id: 'night-ride',
    tone: 'transport',
    title: '夜間計程車順風團',
    meta: '22:10 圓山站出發 · 2 / 4 人',
    highlight: '每人約 NT$40',
    description: '同方向共乘，滿 4 人後由發起人確認上車點與最終車資。',
    facts: [
      { label: '集合時間', value: '今晚 22:05' },
      { label: '集合地點', value: '圓山站 2 號出口' },
      { label: '成團門檻', value: '4 人' },
      { label: '取消期限', value: '出發前 30 分鐘' },
    ],
  },
  {
    id: 'weekend-brunch',
    tone: 'food',
    title: '週末早午餐併桌',
    meta: '明天 11:30 · 3 / 6 人',
    highlight: '預估省 18%',
    description: '併桌共享套餐與折扣，成團後再由發起人確認訂位與品項。',
    facts: [
      { label: '用餐時間', value: '明天 11:30' },
      { label: '目前人數', value: '3 / 6 人' },
      { label: '預估折扣', value: '18%' },
      { label: '取消期限', value: '今晚 21:00' },
    ],
  },
  {
    id: 'daily-box',
    tone: 'daily',
    title: '日用品箱購分攤',
    meta: '今晚截止 · 4 / 5 人',
    highlight: '還差 1 人',
    description: '一起分攤箱購數量，達標後由發起人確認價格、下單與面交方式。',
    facts: [
      { label: '登記截止', value: '今晚 20:30' },
      { label: '目前人數', value: '4 / 5 人' },
      { label: '分攤方式', value: '每人 1 組' },
      { label: '取貨地點', value: '圓山站附近' },
    ],
  },
];

const teamOptionIcon = (tone: TeamOption['tone']) =>
  tone === 'transport' ? (
    <Bike />
  ) : tone === 'food' ? (
    <Utensils />
  ) : (
    <ShoppingBag />
  );

function TeamScreen({
  count,
  joined,
  onJoin,
  onCancel,
  onShare,
  onPreviewAction,
}: {
  count: number;
  joined: boolean;
  onJoin: () => void;
  onCancel: () => void;
  onShare: () => void;
  onPreviewAction: (message: string) => void;
}) {
  const [activeOption, setActiveOption] = useState<TeamOption | null>(null);
  const [joinedOptions, setJoinedOptions] = useState<string[]>([]);
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
        {teamOptions.map((option) => (
          <button
            key={option.id}
            className={joinedOptions.includes(option.id) ? 'joined' : ''}
            onClick={() => setActiveOption(option)}
            aria-haspopup="dialog"
          >
            <span className={`campaign-logo ${option.tone}`}>
              {teamOptionIcon(option.tone)}
            </span>
            <span>
              <b>{option.title}</b>
              <small>{option.meta}</small>
            </span>
            <strong>
              {joinedOptions.includes(option.id) ? '已登記' : option.highlight}
            </strong>
            <ChevronRight className="team-option-chevron" />
          </button>
        ))}
      </div>
      <div className="team-note">
        <ShieldCheck />
        <div>
          <b>不代付、不下單</b>
          <p>平台協助確認意願與成本；達標後仍由發起人向店家確認。</p>
        </div>
      </div>
      <Dialog
        open={activeOption !== null}
        onOpenChange={(open) => {
          if (!open) setActiveOption(null);
        }}
      >
        {activeOption && (
          <DialogContent
            className="evidence-sheet team-option-sheet"
            showCloseButton={false}
          >
            <div className="sheet-handle" />
            <DialogHeader>
              <span className="kicker lime-text">揪團詳情</span>
              <DialogTitle>{activeOption.title}</DialogTitle>
              <DialogDescription>{activeOption.description}</DialogDescription>
            </DialogHeader>
            <div className={`team-option-hero ${activeOption.tone}`}>
              <span className={`campaign-logo ${activeOption.tone}`}>
                {teamOptionIcon(activeOption.tone)}
              </span>
              <span>
                <small>{activeOption.meta}</small>
                <strong>{activeOption.highlight}</strong>
              </span>
            </div>
            <div className="team-option-facts">
              {activeOption.facts.map((fact) => (
                <div key={fact.label}>
                  <span>{fact.label}</span>
                  <b>{fact.value}</b>
                </div>
              ))}
            </div>
            <div className="team-option-safety">
              <ShieldCheck />
              <span>登記代表加入意願，不會自動付款或代替你下單。</span>
            </div>
            <div className="team-option-actions">
              <button
                className="secondary-action"
                onClick={() => setActiveOption(null)}
              >
                先看看
              </button>
              <button
                className="primary-action"
                onClick={() => {
                  const joining = !joinedOptions.includes(activeOption.id);
                  setJoinedOptions((current) =>
                    joining
                      ? [...current, activeOption.id]
                      : current.filter((id) => id !== activeOption.id),
                  );
                  onPreviewAction(
                    joining
                      ? `已登記「${activeOption.title}」，可在截止前取消`
                      : `已取消「${activeOption.title}」登記`,
                  );
                  setActiveOption(null);
                }}
              >
                {joinedOptions.includes(activeOption.id)
                  ? '取消登記'
                  : '登記這一團'}
              </button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}

function FiltersScreen({
  filters,
  need,
  validationError,
  aiParseStatus,
  onNeed,
  onChange,
  onManualSchedule,
  onApply,
}: {
  filters: Filters;
  need: string;
  validationError: string;
  aiParseStatus: AiParseStatus;
  onNeed: (s: string) => void;
  onChange: (f: Filters) => void;
  onManualSchedule: () => void;
  onApply: () => void;
}) {
  return (
    <section className="screen filters-screen">
      <span className="kicker step-kicker">STEP 2 · 確認需求與限制</span>
      <h1>把條件調到剛剛好</h1>
      <p>硬條件先篩選，喜好再決定推薦順序。</p>
      {aiParseStatus !== 'idle' && (
        <output
          className={
            aiParseStatus === 'unavailable' ? 'form-error' : 'ready-label'
          }
          aria-live="polite"
        >
          {aiParseStatus === 'success'
            ? 'AI 已整理以下條件，請逐項確認'
            : aiParseStatus === 'loading'
              ? 'AI 正在整理需求…'
              : 'AI 暫時無法使用，以下條件仍可手動調整'}
        </output>
      )}
      <label className="field-label need-field">
        <span className="field-title">
          <Pencil />
          需求
        </span>
        <textarea
          value={need}
          aria-invalid={Boolean(validationError)}
          aria-describedby={
            validationError ? 'need-validation-error' : undefined
          }
          onChange={(e) => onNeed(e.target.value)}
        />
      </label>
      {validationError && (
        <p className="form-error" id="need-validation-error" role="alert">
          {validationError}
        </p>
      )}
      <div className="filter-basics">
        <label className="field-label">
          <span className="field-title">
            <CalendarDays />
            日期
          </span>
          <input
            type="date"
            value={filters.date}
            onChange={(e) => {
              onManualSchedule();
              onChange({ ...filters, date: e.target.value });
            }}
          />
        </label>
        <label className="field-label">
          <span className="field-title">
            <Clock3 />
            時段
          </span>
          <input
            type="time"
            value={filters.time}
            onChange={(e) => {
              onManualSchedule();
              onChange({ ...filters, time: e.target.value });
            }}
          />
        </label>
        <label className="field-label" htmlFor="filters-budget">
          <span className="field-title">
            <WalletCards />
            預算
          </span>
          <MoneyInput
            id="filters-budget"
            value={filters.budget}
            onValueChange={(budget) => onChange({ ...filters, budget })}
          />
        </label>
        <label className="field-label">
          <span className="field-title">
            <Users />
            人數
          </span>
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
      <div className="distance-control">
        <div className="distance-heading">
          <span>
            <MapPin />
            <span>
              <b>最大距離</b>
              <small>從目前位置或圓山站估算</small>
            </span>
          </span>
          <strong>
            {filters.distance}
            <small> km</small>
          </strong>
        </div>
        <Slider
          className="distance-slider"
          value={[filters.distance]}
          min={0.5}
          max={2}
          step={0.5}
          onValueChange={(value) =>
            onChange({
              ...filters,
              distance: Array.isArray(value) ? value[0] : value,
            })
          }
        />
        <div className="distance-scale" aria-hidden="true">
          <span>0.5 km</span>
          <i>近</i>
          <i>適中</i>
          <i>較遠</i>
          <span>2 km</span>
        </div>
        <p className="slider-tip">
          目前探索範圍為圓山周邊 2 km；距離越短，CP 距離分越高。
        </p>
      </div>
      <div className="filter-tag-stack">
        <TagPicker
          title="類別"
          values={['全部', ...resultCategories]}
          selected={[filters.category]}
          single
          onChange={(values) =>
            onChange({ ...filters, category: values[0] as Filters['category'] })
          }
        />
        <TagPicker
          title="硬排除"
          values={[
            ...new Set([
              '堅果',
              '牛肉',
              '海鮮',
              '麩質',
              '乳製品',
              '辣',
              ...filters.exclusions,
            ]),
          ]}
          selected={filters.exclusions}
          onChange={(exclusions) => onChange({ ...filters, exclusions })}
        />
        <TagPicker
          title="喜好"
          values={[
            ...new Set([
              '安靜',
              '能坐',
              '不用等',
              '有冷氣',
              '少走路',
              '可外帶',
              ...filters.preferences,
            ]),
          ]}
          selected={filters.preferences}
          onChange={(preferences) => onChange({ ...filters, preferences })}
        />
      </div>
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
  onAccount,
  onLogout,
  onDone,
}: {
  profile: Profile;
  onChange: (p: Profile) => void;
  onAccount: () => void;
  onLogout: () => Promise<void>;
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
              ? '清單與紀錄會儲存到帳號'
              : '訪客可搜尋，但清單不會寫入'}
          </small>
        </span>
        <button onClick={profile.signedIn ? () => void onLogout() : onAccount}>
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
          type="button"
          className={`toggle ${reminders ? 'active' : ''}`}
          onClick={() => onReminders(!reminders)}
          role="switch"
          aria-checked={reminders}
          aria-label="收藏到期提醒"
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
        <button
          className={unread > 0 ? 'unread' : undefined}
          onClick={() => onOpen('detail')}
        >
          <span className="notify-icon coral">
            <Clock3 />
          </span>
          <span>
            <b>北美館免費時段即將開始</b>
            <small>今天 17:00 後停止售票 · 12 分鐘前</small>
          </span>
          {unread > 0 && <i aria-hidden="true" />}
        </button>
        <button
          className={unread > 0 ? 'unread' : undefined}
          onClick={() => onOpen('team')}
        >
          <span className="notify-icon violet">
            <Users />
          </span>
          <span>
            <b>晚餐團還差 2 人</b>
            <small>今天 19:00 截止 · 28 分鐘前</small>
          </span>
          {unread > 0 && <i aria-hidden="true" />}
        </button>
        <button
          className={unread > 0 ? 'unread' : undefined}
          onClick={() => onOpen('saved')}
        >
          <span className="notify-icon lime">
            <Bookmark />
          </span>
          <span>
            <b>你有清單項目待確認</b>
            <small>出發前記得核對價格與營業時間</small>
          </span>
          {unread > 0 && <i aria-hidden="true" />}
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
  summary,
  onBudgetChange,
  onHistory,
}: {
  transactions: Transaction[];
  summary: BudgetSummary;
  onBudgetChange: (budget: number) => void;
  onHistory: () => void;
}) {
  const [chartMetric, setChartMetric] = useState<'spent' | 'saved'>('spent');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null,
  );
  const [budgetOpen, setBudgetOpen] = useState(false);
  const categories = resultCategories;
  const palette = categoryColors;
  const monthLabel = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: 'long',
  }).format(new Date());
  const chartTotal = chartMetric === 'spent' ? summary.spent : summary.saved;
  const categoryStats = categories.map((category) => {
    const entries = transactions.filter((item) => item.category === category);
    return {
      category,
      amount: entries.reduce(
        (sum, item) =>
          sum + (chartMetric === 'spent' ? item.amount : item.saved),
        0,
      ),
      count: entries.length,
    };
  });
  const selectedStat = categoryStats.find(
    ({ category }) => category === selectedCategory,
  );
  const selectedShare =
    selectedStat && chartTotal > 0
      ? (selectedStat.amount / chartTotal) * 100
      : 0;
  const budgetOptions = [5_000, 10_000, 15_000, 20_000];
  return (
    <section className="screen analytics-screen">
      <span className="kicker">{monthLabel}</span>
      <h1>消費分析</h1>
      <p>讓預算、實際花費與省下的金額一眼看懂。</p>
      <div className="analytics-hero">
        <div className="analytics-hero-heading">
          <span>{summary.remaining >= 0 ? '本月可用' : '本月超出預算'}</span>
          <button
            type="button"
            className="budget-edit-button"
            aria-expanded={budgetOpen}
            onClick={() => setBudgetOpen((open) => !open)}
          >
            <SlidersHorizontal />
            調整月預算
          </button>
        </div>
        <strong>NT$ {money(Math.abs(summary.remaining))}</strong>
        <small>
          已花 NT${money(summary.spent)} ／ 預算 NT${money(summary.budget)}
        </small>
        <Progress
          value={summary.usedPercentage}
          aria-label={`月預算已使用 ${Math.round(summary.usedPercentage)}%`}
        />
        <div className="budget-progress-copy">
          <span>已使用 {Math.round(summary.usedPercentage)}%</span>
          <span>{summary.transactionCount} 筆紀錄</span>
        </div>
        {budgetOpen && (
          <div className="budget-editor">
            <label htmlFor="monthly-budget">
              <span>直接輸入月預算</span>
              <div className="budget-input-wrap">
                <b>NT$</b>
                <MoneyInput
                  id="monthly-budget"
                  value={summary.budget}
                  max={10_000_000}
                  step={100}
                  ariaLabel="月預算金額"
                  onValueChange={onBudgetChange}
                />
              </div>
            </label>
            <div className="budget-presets" aria-label="快速選擇月預算">
              {budgetOptions.map((amount) => (
                <button
                  type="button"
                  key={amount}
                  className={summary.budget === amount ? 'active' : ''}
                  aria-pressed={summary.budget === amount}
                  onClick={() => {
                    onBudgetChange(amount);
                    setBudgetOpen(false);
                  }}
                >
                  NT${money(amount)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="kpi-grid">
        <div>
          <span>本月省下</span>
          <strong>NT${money(summary.saved)}</strong>
          <small>與可比基準相比</small>
        </div>
        <div>
          <span>平均每次</span>
          <strong>
            NT${money(summary.spent / Math.max(1, summary.transactionCount))}
          </strong>
          <small>{transactions.length} 筆紀錄</small>
        </div>
      </div>
      <div className="category-chart">
        <div className="section-heading">
          <div>
            <h2>類別分布</h2>
            <span>NT${money(chartTotal)}</span>
          </div>
          <div className="category-chart-controls" aria-label="圖表指標">
            <button
              type="button"
              className={chartMetric === 'spent' ? 'active' : ''}
              aria-pressed={chartMetric === 'spent'}
              onClick={() => setChartMetric('spent')}
            >
              花費
            </button>
            <button
              type="button"
              className={chartMetric === 'saved' ? 'active' : ''}
              aria-pressed={chartMetric === 'saved'}
              onClick={() => setChartMetric('saved')}
            >
              省下
            </button>
          </div>
        </div>
        {categoryStats.map(({ category, amount, count }, index) => {
          const percentage = chartTotal > 0 ? (amount / chartTotal) * 100 : 0;
          const active = selectedCategory === category;
          return (
            <button
              type="button"
              className={`category-row ${active ? 'active' : ''} ${selectedCategory && !active ? 'muted' : ''}`}
              key={category}
              aria-pressed={active}
              style={{ '--row-color': palette[category] } as CSSProperties}
              aria-label={`${category} ${chartMetric === 'spent' ? '花費' : '省下'} NT$${money(amount)}，${count} 筆`}
              onClick={() =>
                setSelectedCategory((current) =>
                  current === category ? null : category,
                )
              }
            >
              <span>{category}</span>
              <i>
                <b
                  key={`${chartMetric}-${category}-${amount}`}
                  style={
                    {
                      width: amount > 0 ? `${Math.max(4, percentage)}%` : '0%',
                      background: palette[category],
                      '--bar-delay': `${index * 70}ms`,
                    } as CSSProperties
                  }
                />
              </i>
              <strong>NT${money(amount)}</strong>
            </button>
          );
        })}
        <div className="category-insight" aria-live="polite">
          {selectedStat ? (
            <>
              <b>{selectedStat.category}</b>
              <span>
                {chartMetric === 'spent' ? '花費' : '省下'}占{' '}
                {Math.round(selectedShare)}% · {selectedStat.count} 筆紀錄
              </span>
            </>
          ) : (
            <span>點選任一類別，可查看占比與紀錄數。</span>
          )}
        </div>
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
  onDelete,
}: {
  transactions: Transaction[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const sortedTransactions = [...transactions].sort((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt),
  );
  return (
    <section className="screen history-screen">
      <span className="kicker">ACTIVITY</span>
      <h1>歷史紀錄</h1>
      <p>日後推薦會參考你主動標記的收藏與購買。</p>
      <div className="history-list">
        {sortedTransactions.map((item) => {
          const targetId =
            item.resultId ??
            (item.id.startsWith('buy-')
              ? item.id.replace('buy-', '')
              : item.category === '交通'
                ? 'taxi-share'
                : item.category === '活動' || item.category === '免費／公益資源'
                  ? 'tfam'
                  : 'daily-store');
          return (
            <article className="history-entry" key={item.id}>
              <button
                className="history-entry-main"
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
              <button
                className="history-delete"
                onClick={() => onDelete(item.id)}
                aria-label={`刪除交易 ${item.title}`}
              >
                <Trash2 />
              </button>
            </article>
          );
        })}
      </div>
      <div className="privacy-note">
        <ShieldCheck />
        <span>
          <b>你可以控制推薦資料</b>
          <small>你可以刪除紀錄，或隨時停止個人化推薦。</small>
        </span>
      </div>
    </section>
  );
}

function ReportScreen({
  item,
  reports,
  onSubmit,
}: {
  item: Result;
  reports: CommunityReport[];
  onSubmit: (report: { type: CommunityReportType; note: string }) => void;
}) {
  const [type, setType] = useState<CommunityReportType>('營業時間不同');
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const stats = summarizeCommunityReports(reports);
  const typeStats = communityReportTypes
    .map((reportType) => ({
      type: reportType,
      count: stats.byType[reportType] ?? 0,
    }))
    .filter(({ count }) => count > 0);
  return (
    <section className="screen report-screen">
      <span className="kicker">COMMUNITY REPORT</span>
      <h1>回報資訊</h1>
      <p>
        {item.title} · {item.provider}
      </p>
      <div className="report-summary" aria-live="polite">
        <div className="section-heading">
          <div>
            <span className="kicker">REPORT STATS</span>
            <h2>回報統計</h2>
          </div>
          <strong>{stats.total} 則</strong>
        </div>
        <div className="report-kpis">
          <div>
            <span>累計回報</span>
            <b>{stats.total}</b>
          </div>
          <div>
            <span>已更新</span>
            <b>{stats.resolved}</b>
          </div>
          <div>
            <span>處理中</span>
            <b>{stats.received}</b>
          </div>
        </div>
        <div className="report-type-bars">
          {typeStats.length > 0 ? (
            typeStats.map(({ type: reportType, count }) => (
              <div key={reportType}>
                <span>{reportType}</span>
                <i>
                  <b
                    style={{
                      width: `${(count / Math.max(1, stats.total)) * 100}%`,
                    }}
                  />
                </i>
                <strong>{count}</strong>
              </div>
            ))
          ) : (
            <p>目前可由你新增第一則回報。</p>
          )}
        </div>
      </div>
      <TagPicker
        title="問題類型"
        values={communityReportTypes}
        selected={[type]}
        single
        onChange={(values) => setType(values[0] as CommunityReportType)}
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
        <p>送出後會立即加入統計；請勿填寫姓名、電話或其他個資。</p>
      </div>
      <button
        className="primary-action"
        onClick={() => {
          onSubmit({ type, note });
          setNote('');
          setSubmitted(true);
        }}
      >
        <Flag />
        送出回報
      </button>
      {submitted && (
        <output className="report-success">
          <Check />
          <span>
            <b>回報已記錄</b>
            <small>上方統計與最近回報已同步更新。</small>
          </span>
        </output>
      )}
      <div className="recent-reports">
        <div className="section-heading">
          <h2>最近回報</h2>
          <span>{reports.length} 則紀錄</span>
        </div>
        {reports.length > 0 ? (
          reports.slice(0, 5).map((report) => (
            <article key={report.id}>
              <span className={`report-status ${report.status}`}>
                {report.status === 'resolved' ? '已更新' : '處理中'}
              </span>
              <div>
                <b>{report.type}</b>
                <p>{report.note}</p>
                <small>{report.submittedAt}</small>
              </div>
            </article>
          ))
        ) : (
          <div className="report-empty">送出後，回報會保留在這裡。</div>
        )}
      </div>
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
  signedIn,
  onNavigate,
  onRequireAccount,
}: {
  view: View;
  savedCount: number;
  signedIn: boolean;
  onNavigate: (v: View) => void;
  onRequireAccount: () => void;
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
          onClick={() => {
            if (item.view === 'saved' && !signedIn) {
              onRequireAccount();
              return;
            }
            onNavigate(item.view);
          }}
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
function MoneyInput({
  value,
  onValueChange,
  max = 1_000_000,
  step = 50,
  ariaLabel,
  id,
}: {
  value: number;
  onValueChange: (value: number) => void;
  max?: number;
  step?: number;
  ariaLabel?: string;
  id?: string;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    window.queueMicrotask(() => setDraft(String(value)));
  }, [value]);

  return (
    <input
      type="number"
      inputMode="numeric"
      min="0"
      max={max}
      step={step}
      value={draft}
      id={id}
      aria-label={ariaLabel}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => {
        const nextDraft = event.target.value;
        setDraft(nextDraft);
        if (nextDraft === '') return;
        const parsed = Number(nextDraft);
        if (!Number.isFinite(parsed)) return;
        onValueChange(Math.min(max, Math.max(0, Math.round(parsed))));
      }}
      onBlur={() => {
        if (draft === '' || !Number.isFinite(Number(draft))) {
          setDraft(String(value));
        }
      }}
    />
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
