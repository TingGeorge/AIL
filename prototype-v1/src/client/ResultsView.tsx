import { groupOfferEvidence, groupOfferTerms } from "../shared/group-offers.ts";
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  Bookmark,
  BusFront,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  ExternalLink,
  Flag,
  HandHeart,
  Heart,
  Info,
  MapPin,
  Package,
  PartyPopper,
  ReceiptText,
  Share2,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Users,
} from "lucide-react";
import { CATEGORIES } from "../shared/need.ts";
import { portionOrder } from "../shared/portions.ts";
import {
  comparableTotal,
  costOrder,
  freeFirstOrder,
  groupTotal,
  isDemoRecord,
  isExpired,
  money,
  statusPip,
  type Category,
  type Rec,
} from "../shared/records.ts";
import { displayDataStatus } from "./display.ts";
import "./results-view.css";

export type ResultsViewProps = {
  records: Rec[];
  pending: Rec[];
  excluded: Rec[];
  list: string[];
  onOpen: (id: string) => void;
  onList: (id: string) => void;
  onAdjust: () => void;
  survival: boolean;
  preferredCategories?: Category[];
  browsing?: boolean;
};

export type DetailViewProps = {
  item: Rec;
  favorite: boolean;
  listed: boolean;
  onFavorite: () => void;
  onList: () => void;
  onReport: () => void;
};

type SortMode = "rank" | "cost" | "distance" | "verified";
type Icon = ComponentType<{ "aria-hidden"?: boolean | "true" | "false"; className?: string }>;

const CATEGORY_ICONS: Record<Category, Icon> = {
  食品: ShoppingBag,
  日用品: Package,
  "免費／公益資源": HandHeart,
  活動: PartyPopper,
  交通: BusFront,
};

const DETAIL_QUANTITY_COPY: Record<Category, { title: string; label: string; timeLabel: string; comparison: string }> = {
  食品: { title: "價格與份量", label: "份量", timeLabel: "供應時間", comparison: "份量（例如一份或多人份）" },
  日用品: { title: "價格與商品規格", label: "商品規格", timeLabel: "可購買時間", comparison: "商品規格（例如單件或組合包）" },
  "免費／公益資源": { title: "費用與服務資訊", label: "服務對象／使用方式", timeLabel: "服務時間", comparison: "服務對象／使用方式（例如每人一次或需符合資格）" },
  活動: { title: "費用與活動資訊", label: "票種／參加方式", timeLabel: "活動時間", comparison: "票種／參加方式（例如一般票或優待票）" },
  交通: { title: "票價與使用資訊", label: "票種／使用方式", timeLabel: "行駛／使用時間", comparison: "票種／使用方式（例如單程票或一日票）" },
};

const GENERATED_COPY_REPLACEMENTS: Array<[string, string]> = [
  ["總可比成本", "預估總費用"],
  ["總成本不可比較", "目前資料不足，無法估算總費用"],
  ["必要費用未知", "必付費用未知"],
  ["資料閘門", "檢查資料與必要條件"],
  ["證據閘門", "檢查資料與必要條件"],
  ["硬限制", "必要條件"],
  ["軟偏好", "其他偏好"],
  ["成本備援", "改用基本排序"],
  ["候選", "選項"],
  ["解析", "整理需求"],
];

const UNKNOWN_TOTAL = "目前資料不足，無法估算總費用";
const FEE_EXPLANATION = "依目前資料，以標示價格加上必付費用，再扣除已確認的折扣。";

function displayGeneratedCopy(value: string): string {
  return GENERATED_COPY_REPLACEMENTS.reduce((text, [from, to]) => text.replaceAll(from, to), value);
}

function displayMoney(value: number): string {
  const formatted = money(value);
  return formatted === "FREE" ? "免費" : formatted;
}

function displayAmount(value: number): string {
  return value === 0 ? "NT$0" : displayMoney(value);
}

const evidenceFieldLabel = (category: Category, field: string) =>
  field === "份量" ? DETAIL_QUANTITY_COPY[category].label : field;

const AUTHORITY_LABELS: Record<Rec["source_authority"], string> = {
  official: "官方",
  provider: "提供者",
  public: "公共機關",
  other: "其他",
};

const SOURCE_TYPE_LABELS: Record<Rec["source_type"], string> = {
  curated: "人工整理",
  "web-searched": "網路搜尋",
};

const SORT_LABELS: Array<{ value: SortMode; label: string }> = [
  { value: "rank", label: "推薦順序" },
  { value: "cost", label: "預估總費用由低到高" },
  { value: "distance", label: "距離近到遠" },
  { value: "verified", label: "最近確認" },
];

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return "未提供";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(timestamp);
}

function exactText(value: string | null | undefined, fallback = "未提供"): string {
  const text = value?.trim();
  return text ? text : fallback;
}

type RecordContext = {
  scope: string | null;
  pricingContext: string | null;
  reviewNotes: string[];
};

function extraString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

function recordContext(item: Rec): RecordContext {
  const reviewValue = item.extra.review_notes;
  const reviewNotes = (Array.isArray(reviewValue) ? reviewValue : [reviewValue])
    .map(extraString)
    .filter((value): value is string => value !== null);
  return {
    scope: extraString(item.extra.scope),
    pricingContext: extraString(item.extra.pricing_context),
    reviewNotes,
  };
}

function priceLabel(item: Rec): string {
  const total = comparableTotal(item);
  return total === null ? UNKNOWN_TOTAL : displayMoney(total);
}

function stableSort(items: Rec[], compare: (a: Rec, b: Rec) => number): Rec[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compare(a.item, b.item) || a.index - b.index)
    .map(({ item }) => item);
}

function sortRecords(items: Rec[], mode: SortMode, survival: boolean): Rec[] {
  if (mode === "rank") {
    if (!items.some(item => item.portion_match)) return [...items];
    return stableSort(items, (a, b) => freeFirstOrder(survival)(a, b) || portionOrder(a, b));
  }
  if (mode === "cost") return stableSort(items, costOrder(survival));
  if (mode === "distance") {
    return stableSort(items, (a, b) => {
      const aDistance = a.distance_km ?? Number.POSITIVE_INFINITY;
      const bDistance = b.distance_km ?? Number.POSITIVE_INFINITY;
      return aDistance - bDistance;
    });
  }
  return stableSort(items, (a, b) => b.verified_at.localeCompare(a.verified_at));
}

// Keep evidence/constraint uncertainty separate from ranking, even when both
// groups share one visible list. Sorting (including survival mode) stays within
// each group so a cheaper but unconfirmed option cannot outrank a confirmed one.
export function orderResultCandidates(records: Rec[], pending: Rec[], mode: SortMode, survival: boolean): Rec[] {
  return [...sortRecords(records, mode, survival), ...sortRecords(pending, mode, survival)];
}

function CategoryArt({ category }: { category: Category }) {
  const CategoryIcon = CATEGORY_ICONS[category];
  return (
    <span className="result-art" aria-hidden="true">
      <CategoryIcon aria-hidden="true" />
      <span>{category}</span>
    </span>
  );
}

function StatusLine({ item, needsConfirmation = false }: { item: Rec; needsConfirmation?: boolean }) {
  const demo = isDemoRecord(item);
  // A previously verified source can expire or lose comparable pricing. The
  // visible pending marker must not depend on persisted data_status alone.
  const status = needsConfirmation && isExpired(item) ? "過期／待確認"
    : needsConfirmation && item.data_status === "已驗證" ? "部分驗證／待確認" : item.data_status;
  const pip = item.request_match ? (item.request_match.status === "pending" ? "blue" : "red") : statusPip(status);
  return (
    <span className={`result-status ${demo ? "result-status-demo" : ""}`}>
      <span className={`status-dot ${demo ? "status-demo" : `status-${pip}`}`} aria-hidden="true" />
      {item.request_match ? (item.request_match.status === "pending" ? "本次需求待確認" : "不符合本次需求") : demo ? (needsConfirmation ? "示範測試資料 · 待確認" : "示範測試資料") : displayDataStatus(status)}
    </span>
  );
}

function RecordTerms({ item }: { item: Rec }) {
  const context = recordContext(item);
  if (item.eligibility.length === 0 && !context.scope && context.reviewNotes.length === 0) return null;

  return (
    <div className="record-terms">
      {item.eligibility.length > 0 && <p>資格：{item.eligibility.join("、")}</p>}
      {context.scope && <p>適用範圍：{context.scope}</p>}
      {context.reviewNotes.length > 0 && (
        <div className="review-notes">
          <b>審閱提醒</b>
          <ul>{context.reviewNotes.map((note, index) => <li key={`${index}-${note}`}>{note}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function ResultCard({
  item,
  index,
  listed,
  onOpen,
  onList,
  compact = false,
  needsConfirmation = false,
}: {
  item: Rec;
  index: number;
  listed: boolean;
  onOpen: () => void;
  onList: () => void;
  compact?: boolean;
  needsConfirmation?: boolean;
}) {
  const demo = isDemoRecord(item);
  const context = recordContext(item);
  const hasTerms = item.eligibility.length > 0 || item.registration_required
    || Boolean(context.pricingContext) || context.reviewNotes.length > 0;
  const fees = item.mandatory_fees_twd;

  return (
    <article className={`result-card result-card-summary tone-${item.category} ${compact ? "result-card-compact" : ""} ${demo ? "result-card-demo" : ""}`}>
      <button className="result-open" type="button" onClick={onOpen} aria-label={`查看 ${item.title} 詳情`}>
        <span className="result-body">
          <span className="result-meta">
            <span>{String(index + 1).padStart(2, "0")} · {item.category}</span>
            <StatusLine item={item} needsConfirmation={needsConfirmation} />
          </span>
          <span className="result-title">{item.title}</span>
          <span className="result-copy">{item.provider}</span>
          <span className="result-price">
            <strong className={comparableTotal(item) === null ? "result-price-unknown" : undefined}>
              <small>預估總費用</small>{priceLabel(item)}
            </strong>
            {item.price_unit?.trim() && <span className="result-unit">計價：{item.price_unit}</span>}
          </span>
          {(fees !== 0 || item.eligibility.length > 0 || item.registration_required) && (
            <span className="result-flags">
              {fees !== 0 && <span>{fees === null ? "必付費用未知" : `含必付費用 ${displayMoney(fees)}`}</span>}
              {item.eligibility.length > 0 && <span>需符合資格</span>}
              {item.registration_required && <span>需報名</span>}
            </span>
          )}
          <span className="result-footer">
            <span className="result-scope" title={context.scope ?? undefined}>
              {demo ? "測試資料，不可據此購買／前往" : context.scope}
            </span>
            <span className="result-detail-link">
              {hasTerms ? "條件與詳情" : "查看詳情"}<ChevronRight aria-hidden="true" />
            </span>
          </span>
        </span>
      </button>
      <button
        className={`save-fab ${listed ? "saved" : ""}`}
        type="button"
        onClick={onList}
        aria-pressed={listed}
        aria-label={listed ? `從清單移除 ${item.title}` : `加入清單 ${item.title}`}
      >
        <Heart aria-hidden="true" />
      </button>
    </article>
  );
}

function SecondaryBucket({
  title,
  description,
  items,
  list,
  onOpen,
  onList,
  tone,
}: {
  title: string;
  description: string;
  items: Rec[];
  list: string[];
  onOpen: (id: string) => void;
  onList: (id: string) => void;
  tone: "pending" | "excluded";
}) {
  return (
    <details className={`result-bucket result-bucket-${tone}`}>
      <summary>
        <span>
          <b>{title}</b>
        </span>
        <strong>{items.length}</strong>
        <ChevronDown aria-hidden="true" />
      </summary>
      <p className="bucket-description">{description}</p>
      {items.length === 0 ? (
        <p className="bucket-empty">此類別目前沒有項目。</p>
      ) : (
        <div className="result-list result-list-secondary">
          {items.map((item, index) => (
            <ResultCard
              key={item.id}
              item={item}
              index={index}
              listed={list.includes(item.id)}
              onOpen={() => onOpen(item.id)}
              onList={() => onList(item.id)}
              compact
            />
          ))}
        </div>
      )}
    </details>
  );
}

export function ResultsView({
  records,
  pending,
  excluded,
  list,
  onOpen,
  onList,
  onAdjust,
  survival,
  preferredCategories = [],
  browsing = false,
}: ResultsViewProps) {
  const allItems = useMemo(() => [...records, ...pending, ...excluded], [records, pending, excluded]);
  // Target categories emphasize the dashboard, never filter out the other categories (voice spec §3).
  const orderedCategories: Array<Category | "全部"> = browsing ? ["全部", ...CATEGORIES] : [...new Set([...preferredCategories, ...CATEGORIES])];
  const firstCategory = browsing ? "全部" : preferredCategories[0] ?? CATEGORIES.find((entry) => allItems.some((item) => item.category === entry)) ?? CATEGORIES[0];
  const [category, setCategory] = useState<Category | "全部">(() => firstCategory);
  const [sort, setSort] = useState<SortMode>(browsing ? "cost" : "rank");
  const previousResults = useRef({ records, pending, excluded });

  // A user-selected zero-count tab stays selected. Only genuinely new result arrays
  // choose a fresh initial category; ordinary renders and listed changes do not.
  useEffect(() => {
    const previous = previousResults.current;
    if (previous.records === records && previous.pending === pending && previous.excluded === excluded) return;
    previousResults.current = { records, pending, excluded };
    setCategory(firstCategory);
  }, [records, pending, excluded, firstCategory]);

  const categoryRecords = useMemo(
    () => orderResultCandidates(
      records.filter((item) => category === "全部" || item.category === category),
      pending.filter((item) => category === "全部" || item.category === category),
      sort,
      survival,
    ),
    [category, records, pending, sort, survival],
  );
  const pendingIds = useMemo(() => new Set(pending.map((item) => item.id)), [pending]);
  const categoryExcluded = excluded.filter((item) => category === "全部" || item.category === category);
  const counts = {
    ...Object.fromEntries(CATEGORIES.map((entry) => [entry, records.filter((item) => item.category === entry).length + pending.filter((item) => item.category === entry).length])),
    全部: records.length + pending.length,
  } as Record<Category | "全部", number>;

  return (
    <section className="screen results-screen results-view" data-survival={survival}>
      <div className="results-intro">
        <h1 aria-live="polite">{categoryRecords.length ? `${categoryRecords.length} 個選項` : (browsing && category === "全部" ? "目前尚無可瀏覽的項目" : "這個類別目前沒有選項")}</h1>
        <p>
          {category}
          {survival ? " · 省錢模式：優先顯示免費選項" : ""}
        </p>
      </div>

      <nav className="category-tabs" aria-label="結果類別">
        {orderedCategories.map((entry) => (
          <button
            key={entry}
            className={`category-tab ${entry === category ? "active" : ""}`}
            type="button"
            onClick={() => setCategory(entry)}
            aria-current={entry === category ? "page" : undefined}
          >
            <span>{entry}</span>
            <b>{counts[entry]}</b>
          </button>
        ))}
      </nav>

      <div className="filter-row">
        <button className="filter-summary" type="button" onClick={onAdjust}>
          <SlidersHorizontal aria-hidden="true" />
          調整需求與必要條件
        </button>
        <label className="sort-button">
          <span className="sr-only">排序</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
            {SORT_LABELS.filter(option => !browsing || option.value === "cost" || option.value === "verified").map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      {categoryRecords.length === 0 ? (
        <div className="empty-state">
          <SlidersHorizontal aria-hidden="true" />
          <h2>{browsing ? (category === "全部" ? "目前尚無可瀏覽的項目" : "這個類別尚無收錄項目") : "這個類別沒有選項"}</h2>
          <p>{browsing ? "目前沒有可公開顯示的資料，並非因為你尚未設定需求。" : "可調整條件，或查看下方已排除項目及原因。已知不符合條件的項目不會放入推薦清單。"}</p>
          {browsing && category !== "全部" ? <button type="button" onClick={() => setCategory("全部")}>查看全部項目</button> : <button type="button" onClick={onAdjust}>{browsing ? "設定需求" : "修改條件"}</button>}
        </div>
      ) : (
        <div className="result-list">
          {categoryRecords.map((item, index) => (
            <ResultCard
              key={item.id}
              item={item}
              needsConfirmation={pendingIds.has(item.id)}
              index={index}
              listed={list.includes(item.id)}
              onOpen={() => onOpen(item.id)}
              onList={() => onList(item.id)}
            />
          ))}
        </div>
      )}

      <div className="secondary-results">
        <SecondaryBucket
          title="已排除"
          description={browsing ? "未套用個人需求條件，不會因預算或偏好排除項目" : "已知不符合本次必要條件；各項目列出可判定的原因"}
          items={categoryExcluded}
          list={list}
          onOpen={onOpen}
          onList={onList}
          tone="excluded"
        />
      </div>
    </section>
  );
}

function DetailDisclosure({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <details className="detail-disclosure">
      <summary><span>{title}</span>{hint && <small>{hint}</small>}<ChevronDown aria-hidden="true" /></summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}

function Fact({ label, value, icon: FactIcon }: { label: string; value: string; icon?: Icon }) {
  return (
    <div>
      <span>{FactIcon && <FactIcon aria-hidden="true" />}{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ExternalLinkButton({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return null;
  return (
    <a className="source-link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <ExternalLink aria-hidden="true" />
    </a>
  );
}

function GroupOfferPanel({ item }: { item: Rec }) {
  const offer = item.group_offer;
  const demo = isDemoRecord(item);
  const [people, setPeople] = useState(offer?.min_people ?? 1);

  useEffect(() => {
    setPeople(offer?.min_people ?? 1);
  }, [item.id, offer?.min_people]);

  if (!offer) return null;

  const normalizedPeople = Math.max(1, Number.isFinite(people) ? Math.floor(people) : 1);
  const thresholdMet = normalizedPeople >= offer.min_people;
  const baseTotal = comparableTotal(item);
  const calculatedTotal = groupTotal(item, normalizedPeople);
  const hasPerPersonPrice = offer.price_per_person !== undefined;
  const hasPercentDiscount = offer.discount_pct !== undefined;
  const sourceUrl = safeHttpUrl(item.source_url);
  const terms = groupOfferTerms(item);
  const groupEvidence = groupOfferEvidence(item);
  const shareText = [
    item.title,
    offer.redeem_code ? `商家兌換碼：${offer.redeem_code}` : "官方未提供優惠碼，請依來源方式購買",
    `成團門檻：${offer.min_people} 人`,
    sourceUrl,
  ].filter(Boolean).join("\n");
  const clipboardAvailable = typeof navigator !== "undefined" && Boolean(navigator.clipboard?.writeText);
  const shareAvailable = typeof navigator !== "undefined" && Boolean(navigator.share);

  let calculationCopy: string;
  if (!thresholdMet) {
    calculationCopy = baseTotal === null
      ? `尚未達成團門檻；${UNKNOWN_TOTAL}。`
      : `尚未套用團購條件；本筆預估總費用為 ${displayMoney(baseTotal)}。`;
  } else if (baseTotal === null || calculatedTotal === null) {
    calculationCopy = "目前預估總費用不足，無法計算團購方案預估總費用。";
  } else if (hasPerPersonPrice) {
    calculationCopy = `方案預估總費用 ${displayMoney(calculatedTotal)} · 每人 ${displayMoney(offer.price_per_person!)}`;
  } else if (hasPercentDiscount) {
    calculationCopy = `套用折扣後的預估總費用為 ${displayMoney(calculatedTotal)}；人數只用於確認是否達到門檻。`;
  } else {
    calculationCopy = `目前預估總費用 ${displayMoney(baseTotal)}；來源未提供可計算的優惠金額。`;
  }

  return (
    <section className="team-campaign group-offer-panel">
      <div className="campaign-top">
        <span className="campaign-logo"><Users aria-hidden="true" /></span>
        <span>
          <small>團購方案 · {demo ? "示範方案" : "商家方案"}</small>
          <b>{demo ? "測試條件：" : ""}滿 {offer.min_people} 人適用</b>
        </span>
        <span className={`live-chip ${demo ? "demo-chip" : ""}`}>{demo ? "測試資料" : "來源條件"}</span>
      </div>

      <div className="merchant-code">
        <span>{demo ? "測試兌換碼（不可使用）" : "商家兌換碼"}</span>
        {offer.redeem_code ? <code>{offer.redeem_code}</code> : <strong>官方未提供優惠碼</strong>}
        <div>
          <button
            type="button"
            disabled={demo || !offer.redeem_code || !clipboardAvailable}
            title={demo ? "示範碼不可用於購買" : undefined}
            onClick={() => { if (offer.redeem_code) void navigator.clipboard.writeText(offer.redeem_code).catch(() => {}); }}
          >
            <Copy aria-hidden="true" />複製
          </button>
          <button
            type="button"
            disabled={demo || !shareAvailable}
            title={demo ? "示範優惠不提供分享" : undefined}
            onClick={() => { void navigator.share({ title: item.title, text: shareText }).catch(() => {}); }}
          >
            <Share2 aria-hidden="true" />分享
          </button>
        </div>
      </div>

      <label className="threshold-calculator">
        <span>試算參加人數</span>
        <input
          type="number"
          min={1}
          step={1}
          value={normalizedPeople}
          onChange={(event) => setPeople(Number(event.target.value))}
        />
      </label>

      <div className="offer-calculation" aria-live="polite">
        <b>{thresholdMet ? "已達成團門檻" : `還差 ${offer.min_people - normalizedPeople} 人`}</b>
        <p>{calculationCopy}</p>
      </div>

      <div className="offer-terms">
        {demo && <p className="demo-offer-note">此區僅展示團購欄位與試算流程，不是可兌換優惠。</p>}
        {hasPerPersonPrice && <span>來源每人價格 {displayMoney(offer.price_per_person!)}</span>}
        {hasPercentDiscount && <span>來源折扣 {offer.discount_pct}%</span>}
        <p>{exactText(offer.note, "來源未提供補充說明")}</p>
        {terms && <><p>使用方式：{terms.redemption_method}</p><p>{terms.valid_until ? `優惠期限：${terms.valid_until}` : "未公告截止日，以官方公告為準"}</p></>}
        {groupEvidence.map((evidence, index) => <p key={`${evidence.url}-${index}`}><q>{evidence.quote}</q> <a href={evidence.url} target="_blank" rel="noopener noreferrer">官方團體優惠來源</a><small> · 查核：{evidence.checked_at}</small></p>)}
      </div>
    </section>
  );
}

export function DetailView({
  item,
  favorite,
  listed,
  onFavorite,
  onList,
  onReport,
}: DetailViewProps) {
  const demo = isDemoRecord(item);
  const verified = !demo && item.data_status === "已驗證";
  const total = comparableTotal(item);
  const context = recordContext(item);
  const sourceUrl = safeHttpUrl(item.source_url);
  const actionUrl = demo ? null : safeHttpUrl(item.action_url);
  const hasCoordinates = item.lat !== null && item.lng !== null;
  const mapQuery = hasCoordinates ? `${item.lat},${item.lng}` : item.address?.trim() || null;
  const mapUrl = !demo && mapQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
    : null;
  const distance = item.distance_km;
  const detailDistance = demo
    ? "測試位置資料（不可據此前往）"
    : distance === null || distance === undefined
      ? "目前沒有座標，無法估算距離"
      : `直線 ${distance.toFixed(1)} km（估算）`;
  const locationLabel = demo ? "測試地點，不可據此前往" : item.address?.trim() || detailDistance;
  const expired = isExpired(item);
  const fees = item.mandatory_fees_twd;
  const quantityCopy = DETAIL_QUANTITY_COPY[item.category];

  return (
    <section className={`screen detail-screen results-view-detail tone-${item.category}`}>
      <div className="detail-hero">
        <CategoryArt category={item.category} />
        <span
          className={`image-badge ${demo ? "image-badge-demo" : ""} ${verified ? "image-badge-icon" : ""}`}
          role={verified ? "img" : undefined}
          aria-label={verified ? "已確認" : undefined}
          title={verified ? "已確認" : undefined}
        >
          <ShieldCheck aria-hidden="true" />
          {!verified && (demo ? "示範測試資料" : displayDataStatus(item.data_status))}
        </span>
      </div>

      <div className="detail-content">
        <span className="kicker">{item.provider} · {item.category}</span>
        <h1>{item.title}</h1>
        <p className="detail-meta"><MapPin aria-hidden="true" /><span>{locationLabel}</span></p>

        <div className="detail-price-summary">
          <div><span>預估總費用</span><strong>{total === null ? UNKNOWN_TOTAL : displayMoney(total)}</strong></div>
          {item.price_unit?.trim() && <p>計價：{item.price_unit}</p>}
        </div>
        {(fees !== 0 || item.eligibility.length > 0 || item.registration_required || expired || !verified) && (
          <div className="detail-key-flags" aria-label="重要條件">
            {fees !== 0 && <span>{fees === null ? "必付費用未知，無法估算總費用" : `含必付費用 ${displayMoney(fees)}`}</span>}
            {item.eligibility.length > 0 && <span>需符合資格</span>}
            {item.registration_required && <span>需報名</span>}
            {expired && <span>已到期 · {dateLabel(item.valid_until)}</span>}
            {!verified && <span>{demo ? "僅供測試" : displayDataStatus(item.data_status)}</span>}
          </div>
        )}
        {context.scope && <p className="detail-scope">{context.scope}</p>}

        <div className="detail-link-row">
          <ExternalLinkButton href={mapUrl}><MapPin aria-hidden="true" />位置／地圖</ExternalLinkButton>
          <ExternalLinkButton href={sourceUrl}><ReceiptText aria-hidden="true" />{demo ? "示範來源頁" : "原始來源"}</ExternalLinkButton>
          {actionUrl && actionUrl !== sourceUrl && (
            <ExternalLinkButton href={actionUrl}><CircleDollarSign aria-hidden="true" />{exactText(item.action_label, "前往行動頁")}</ExternalLinkButton>
          )}
        </div>

        <DetailDisclosure title={quantityCopy.title}>
          <p className="detail-explanation">{FEE_EXPLANATION}</p>
          <div className="cost-breakdown">
            <span><small>標示價格</small><b>{item.price_total_twd === null ? "未提供" : displayMoney(item.price_total_twd)}</b></span>
            <span><small>必付費用</small><b>{fees === null ? UNKNOWN_TOTAL : displayAmount(fees)}</b></span>
            <span><small>已確認折扣</small><b>{displayAmount(item.discount_twd)}</b></span>
          </div>
          <p className="detail-explanation">{quantityCopy.label}：{exactText(item.quantity_or_servings)}</p>
          {context.pricingContext && <p className="detail-explanation">價格脈絡：{context.pricingContext}</p>}
        </DetailDisclosure>

        <DetailDisclosure title="適用條件與時間" hint={context.reviewNotes.length ? `${context.reviewNotes.length} 則提醒` : undefined}>
          <RecordTerms item={item} />
          <div className="facts-grid">
            <Fact label={quantityCopy.timeLabel} value={exactText(item.availability_or_event_time)} icon={Clock3} />
            <Fact label="是否需登記" value={item.registration_required ? "需要" : "不需要"} icon={Tag} />
            <Fact label="有效期限" value={item.valid_until ? `${expired ? "已於" : "至"} ${dateLabel(item.valid_until)}${expired ? " 到期" : ""}` : "來源未明示"} icon={CalendarDays} />
            <Fact label="距離／交通" value={`${detailDistance} · ${exactText(item.distance_or_time_text, "交通時間未提供")}`} icon={MapPin} />
            <Fact label="地址" value={demo && item.address ? `${item.address}（測試資料）` : exactText(item.address)} icon={MapPin} />
          </div>
          {item.reason?.trim() && <div className="condition-box"><Sparkles aria-hidden="true" /><div><b>推薦理由</b><p>{displayGeneratedCopy(item.reason)}</p></div></div>}
        </DetailDisclosure>

        {item.group_offer && <DetailDisclosure title="團購優惠" hint={`滿 ${item.group_offer.min_people} 人`}><GroupOfferPanel item={item} /></DetailDisclosure>}

        <DetailDisclosure title={demo ? "測試欄位與示範來源" : "來源與查核"} hint={demo ? "測試資料" : dateLabel(item.verified_at)}>
          <div className="facts-grid">
            <Fact label="資料狀態" value={item.request_match ? (item.request_match.status === "pending" ? "本次需求待確認" : "不符合本次需求") : demo ? "示範測試資料" : displayDataStatus(item.data_status)} icon={CheckCircle2} />
            <Fact label={demo ? "測試資料日期" : "資料確認"} value={dateLabel(item.verified_at)} icon={Info} />
            <Fact label="座標" value={hasCoordinates ? `${item.lat}, ${item.lng}${demo ? "（測試資料）" : ""}` : "未提供"} icon={MapPin} />
          </div>
          <section className="evidence-section">
            <h2>{demo ? "示範來源" : "費用與來源依據"}</h2>
            <p className="detail-explanation">{demo ? "非真實刊登 · 僅供流程測試" : `${SOURCE_TYPE_LABELS[item.source_type]} · ${AUTHORITY_LABELS[item.source_authority]}`} · {item.evidence.length} 筆摘錄</p>
          {item.evidence.length === 0 ? (
            <p className="evidence-empty">來源未提供逐欄證據摘錄。</p>
          ) : (
            <div className="evidence-list">
              {item.evidence.map((evidence, index) => {
                const evidenceUrl = safeHttpUrl(evidence.url);
                return (
                  <article key={`${evidence.field}-${evidence.checked_at}-${index}`}>
                    <span>{evidenceFieldLabel(item.category, evidence.field)}</span>
                    <blockquote>{evidence.quote}</blockquote>
                    <small>{demo ? "測試日期" : "查核"} {dateLabel(evidence.checked_at)}</small>
                    {evidenceUrl && (
                      <a href={evidenceUrl} target="_blank" rel="noopener noreferrer">
                        {demo ? "示範摘錄頁" : "此摘錄來源"}<ExternalLink aria-hidden="true" />
                      </a>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          <div className="source-meta">
            <span>{demo ? "測試建立" : "蒐集"} {dateLabel(item.collected_at)}</span>
            <span>{demo ? "測試日期" : "確認"} {dateLabel(item.verified_at)}</span>
          </div>
          </section>
        </DetailDisclosure>
      </div>

      <div className="detail-actions glass">
        <button type="button" onClick={onFavorite} className={favorite ? "saved" : ""} aria-pressed={favorite}>
          <Bookmark aria-hidden="true" />{favorite ? "已收藏" : "收藏"}
        </button>
        <button type="button" onClick={onReport}><Flag aria-hidden="true" />回報</button>
        <button className="detail-primary" type="button" onClick={onList} aria-pressed={listed}>
          <Heart aria-hidden="true" />
          {demo ? (listed ? "從測試清單移除" : "加入測試清單") : (listed ? "從這次清單移除" : "加入這次清單")}
        </button>
      </div>
    </section>
  );
}
