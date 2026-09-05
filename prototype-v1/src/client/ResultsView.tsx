import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
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
  TicketCheck,
  Users,
} from "lucide-react";
import { CATEGORIES } from "../shared/need.ts";
import {
  comparableTotal,
  costOrder,
  groupTotal,
  isDemoRecord,
  isExpired,
  money,
  statusPip,
  type Category,
  type Rec,
} from "../shared/records.ts";
import "./results-view.css";

export type ResultsViewProps = {
  records: Rec[];
  pending: Rec[];
  excluded: Rec[];
  favs: string[];
  onOpen: (id: string) => void;
  onFavorite: (id: string) => void;
  onAdjust: () => void;
  survival: boolean;
  preferredCategories?: Category[];
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
  { value: "cost", label: "成本低到高" },
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
  return total === null ? "總成本不可比較" : money(total);
}

function stableSort(items: Rec[], compare: (a: Rec, b: Rec) => number): Rec[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compare(a.item, b.item) || a.index - b.index)
    .map(({ item }) => item);
}

function sortRecords(items: Rec[], mode: SortMode, survival: boolean): Rec[] {
  if (mode === "rank") return items.slice();
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

function CategoryArt({ category }: { category: Category }) {
  const CategoryIcon = CATEGORY_ICONS[category];
  return (
    <span className="result-art" aria-hidden="true">
      <CategoryIcon />
      <span>{category}</span>
    </span>
  );
}

function StatusLine({ item }: { item: Rec }) {
  const demo = isDemoRecord(item);
  return (
    <span className={`result-status ${demo ? "result-status-demo" : ""}`}>
      <span className={`status-dot ${demo ? "status-demo" : `status-${statusPip(item.data_status)}`}`} aria-hidden="true" />
      {demo ? "示範測試資料" : item.data_status}
    </span>
  );
}

function RecordTerms({ item }: { item: Rec }) {
  const context = recordContext(item);
  if (item.eligibility.length === 0 && !context.scope && !context.pricingContext && context.reviewNotes.length === 0) return null;

  return (
    <div className="record-terms">
      {item.eligibility.length > 0 && <p>資格：{item.eligibility.join("、")}</p>}
      {context.scope && <p>適用範圍：{context.scope}</p>}
      {context.pricingContext && <p>價格脈絡：{context.pricingContext}</p>}
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
  favorite,
  onOpen,
  onFavorite,
  compact = false,
}: {
  item: Rec;
  index: number;
  favorite: boolean;
  onOpen: () => void;
  onFavorite: () => void;
  compact?: boolean;
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
            <StatusLine item={item} />
          </span>
          <span className="result-title">{item.title}</span>
          <span className="result-copy">{item.provider}</span>
          <span className="result-price">
            <strong className={comparableTotal(item) === null ? "result-price-unknown" : undefined}>
              <small>總可比成本</small>{priceLabel(item)}
            </strong>
            <span className="result-unit">計價：{exactText(item.price_unit, "單位未提供")}</span>
          </span>
          {(fees !== 0 || item.eligibility.length > 0 || item.registration_required) && (
            <span className="result-flags">
              {fees !== 0 && <span>{fees === null ? "必要費用未知" : `含必要費用 ${money(fees)}`}</span>}
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
        className={`save-fab ${favorite ? "saved" : ""}`}
        type="button"
        onClick={onFavorite}
        aria-pressed={favorite}
        aria-label={favorite ? `取消收藏 ${item.title}` : `收藏 ${item.title}`}
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
  favs,
  onOpen,
  onFavorite,
  tone,
}: {
  title: string;
  description: string;
  items: Rec[];
  favs: string[];
  onOpen: (id: string) => void;
  onFavorite: (id: string) => void;
  tone: "pending" | "excluded";
}) {
  return (
    <details className={`result-bucket result-bucket-${tone}`}>
      <summary>
        <span>
          <b>{title}</b>
          <small>{description}</small>
        </span>
        <strong>{items.length}</strong>
        <ChevronDown aria-hidden="true" />
      </summary>
      {items.length === 0 ? (
        <p className="bucket-empty">此類別目前沒有項目。</p>
      ) : (
        <div className="result-list result-list-secondary">
          {items.map((item, index) => (
            <ResultCard
              key={item.id}
              item={item}
              index={index}
              favorite={favs.includes(item.id)}
              onOpen={() => onOpen(item.id)}
              onFavorite={() => onFavorite(item.id)}
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
  favs,
  onOpen,
  onFavorite,
  onAdjust,
  survival,
  preferredCategories = [],
}: ResultsViewProps) {
  const allItems = useMemo(() => [...records, ...pending, ...excluded], [records, pending, excluded]);
  // Target categories emphasize the dashboard, never filter out the other categories (voice spec §3).
  const orderedCategories = [...new Set([...preferredCategories, ...CATEGORIES])];
  const firstCategory = preferredCategories[0] ?? CATEGORIES.find((entry) => allItems.some((item) => item.category === entry)) ?? CATEGORIES[0];
  const [category, setCategory] = useState<Category>(() => firstCategory);
  const [sort, setSort] = useState<SortMode>("rank");
  const previousResults = useRef({ records, pending, excluded });

  // A user-selected zero-count tab stays selected. Only genuinely new result arrays
  // choose a fresh initial category; ordinary renders and favorite changes do not.
  useEffect(() => {
    const previous = previousResults.current;
    if (previous.records === records && previous.pending === pending && previous.excluded === excluded) return;
    previousResults.current = { records, pending, excluded };
    setCategory(firstCategory);
  }, [records, pending, excluded, firstCategory]);

  const categoryRecords = useMemo(
    () => sortRecords(records.filter((item) => item.category === category), sort, survival),
    [category, records, sort, survival],
  );
  const categoryPending = pending.filter((item) => item.category === category);
  const categoryExcluded = excluded.filter((item) => item.category === category);
  const counts = Object.fromEntries(
    CATEGORIES.map((entry) => [entry, records.filter((item) => item.category === entry).length]),
  ) as Record<Category, number>;

  return (
    <section className="screen results-screen results-view" data-survival={survival}>
      <div className="results-intro">
        <span className="kicker">CHECKED RESULTS · 主要候選</span>
        <h1>{categoryRecords.length ? `${categoryRecords.length} 個主要候選` : "這個類別目前沒有主要候選"}</h1>
        <p>
          {category} · 通過資料閘門與可檢查條件
          {survival ? " · 生存模式" : ""}
        </p>
        <p className="candidate-caveat">所選類別優先顯示，仍搜尋全部五類。人數、日期、時段與文字資格仍需依來源逐項確認；線上配送要核對運費與配送範圍，不同計價單位／份量（例如單人票）不可直接視為多人總價。</p>
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
          調整需求與限制
        </button>
        <label className="sort-button">
          <span className="sr-only">排序</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
            {SORT_LABELS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      {categoryRecords.length === 0 ? (
        <div className="empty-state">
          <SlidersHorizontal aria-hidden="true" />
          <h2>這個類別沒有主要候選</h2>
          <p>可查看待確認／已排除項目，或調整可檢查條件；文字型限制仍需逐項確認。</p>
          <button type="button" onClick={onAdjust}>修改條件</button>
        </div>
      ) : (
        <div className="result-list">
          {categoryRecords.map((item, index) => (
            <ResultCard
              key={item.id}
              item={item}
              index={index}
              favorite={favs.includes(item.id)}
              onOpen={() => onOpen(item.id)}
              onFavorite={() => onFavorite(item.id)}
            />
          ))}
        </div>
      )}

      <div className="secondary-results">
        <SecondaryBucket
          title="待確認"
          description="資料狀態、價格或有效期尚未通過主要比較門檻"
          items={categoryPending}
          favs={favs}
          onOpen={onOpen}
          onFavorite={onFavorite}
          tone="pending"
        />
        <SecondaryBucket
          title="已排除"
          description="未符合目前硬限制；此畫面不推測個別排除原因"
          items={categoryExcluded}
          favs={favs}
          onOpen={onOpen}
          onFavorite={onFavorite}
          tone="excluded"
        />
      </div>
    </section>
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
  const shareText = [
    item.title,
    `商家兌換碼：${offer.redeem_code}`,
    `成團門檻：${offer.min_people} 人`,
    sourceUrl,
  ].filter(Boolean).join("\n");
  const clipboardAvailable = typeof navigator !== "undefined" && Boolean(navigator.clipboard?.writeText);
  const shareAvailable = typeof navigator !== "undefined" && Boolean(navigator.share);

  let calculationCopy: string;
  if (!thresholdMet) {
    calculationCopy = baseTotal === null
      ? "尚未達門檻；原始可比成本未提供。"
      : `尚未套用團購條件；本筆原始可比成本 ${money(baseTotal)}。`;
  } else if (baseTotal === null || calculatedTotal === null) {
    calculationCopy = "原始可比成本未提供，依比較規則不計算方案總額。";
  } else if (hasPerPersonPrice) {
    calculationCopy = `方案總額 ${money(calculatedTotal)} · 每人 ${money(offer.price_per_person!)}`;
  } else if (hasPercentDiscount) {
    calculationCopy = `本筆折後可比成本 ${money(calculatedTotal)}；人數只用於判斷門檻。`;
  } else {
    calculationCopy = `本筆原始可比成本 ${money(baseTotal)}；來源未提供可計算的優惠金額。`;
  }

  return (
    <section className="team-campaign group-offer-panel">
      <div className="campaign-top">
        <span className="campaign-logo"><Users aria-hidden="true" /></span>
        <span>
          <small>GROUP OFFER · {demo ? "示範方案" : "商家方案"}</small>
          <b>{demo ? "測試條件：" : ""}滿 {offer.min_people} 人適用</b>
        </span>
        <span className={`live-chip ${demo ? "demo-chip" : ""}`}>{demo ? "測試資料" : "來源條件"}</span>
      </div>

      <div className="merchant-code">
        <span>{demo ? "測試兌換碼（不可使用）" : "商家兌換碼"}</span>
        <code>{offer.redeem_code}</code>
        <div>
          <button
            type="button"
            disabled={demo || !clipboardAvailable}
            title={demo ? "示範碼不可用於購買" : undefined}
            onClick={() => { void navigator.clipboard.writeText(offer.redeem_code).catch(() => {}); }}
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
        <span>門檻試算人數</span>
        <input
          type="number"
          min={1}
          step={1}
          value={normalizedPeople}
          onChange={(event) => setPeople(Number(event.target.value))}
        />
      </label>

      <div className="offer-calculation" aria-live="polite">
        <b>{thresholdMet ? "已達來源門檻" : `尚差 ${offer.min_people - normalizedPeople} 人`}</b>
        <p>{calculationCopy}</p>
      </div>

      <div className="offer-terms">
        {demo && <p className="demo-offer-note">此區僅展示團購欄位與試算流程，不是可兌換優惠。</p>}
        {hasPerPersonPrice && <span>來源每人價 {money(offer.price_per_person!)}</span>}
        {hasPercentDiscount && <span>來源折扣 {offer.discount_pct}%</span>}
        <p>{exactText(offer.note, "來源未提供補充說明")}</p>
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
  const total = comparableTotal(item);
  const sourceUrl = safeHttpUrl(item.source_url);
  const actionUrl = demo ? null : safeHttpUrl(item.action_url);
  const hasCoordinates = item.lat !== null && item.lng !== null;
  const mapQuery = hasCoordinates
    ? `${item.lat},${item.lng}`
    : item.address?.trim() || null;
  const mapUrl = !demo && mapQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
    : null;
  const distance = item.distance_km;
  const detailDistance = demo
    ? "測試位置資料（不可據此前往）"
    : distance === null || distance === undefined
      ? "無座標距離估算"
      : `直線 ${distance.toFixed(1)} km（估算）`;
  const expired = isExpired(item);

  return (
    <section className={`screen detail-screen results-view-detail tone-${item.category}`}>
      <div className="detail-hero">
        <CategoryArt category={item.category} />
        <span className={`image-badge ${demo ? "image-badge-demo" : ""}`}><ShieldCheck aria-hidden="true" />{demo ? "示範測試資料" : item.data_status}</span>
      </div>

      {demo && (
        <aside className="demo-record-notice" role="note">
          <ShieldCheck aria-hidden="true" />
          <span>
            <strong>示範測試資料</strong>
            <b>不可據此購買/前往；價格、地址、優惠皆測試資料。</b>
            <small>來源連結僅展示資料與介面流程，不代表真實店家或現行方案。</small>
          </span>
        </aside>
      )}

      <div className="detail-content">
        <span className="kicker">{item.provider} · {item.category}</span>
        <h1>{item.title}</h1>
        <p className="detail-meta">
          <MapPin aria-hidden="true" />
          {detailDistance} · {exactText(item.distance_or_time_text, "交通時間未提供")}
        </p>

        <div className="detail-score">
          <div>
            <span>總可比成本</span>
            <strong>{total === null ? "未提供" : money(total)}</strong>
            <small>價格＋必要費用－明確折扣</small>
          </div>
          <div>
            <span>計價與份量</span>
            <strong>計價：{exactText(item.price_unit, "單位未提供")}</strong>
            <small>份量：{exactText(item.quantity_or_servings)}</small>
          </div>
        </div>

        <div className="cost-breakdown">
          <span><small>標示價格</small><b>{item.price_total_twd === null ? "未提供" : money(item.price_total_twd)}</b></span>
          <span><small>必要費用</small><b>{item.mandatory_fees_twd === null ? "未知，總成本不可比較" : `NT$${item.mandatory_fees_twd.toLocaleString("zh-TW")}`}</b></span>
          <span><small>明確折扣</small><b>{`NT$${item.discount_twd.toLocaleString("zh-TW")}`}</b></span>
        </div>

        <RecordTerms item={item} />

        <div className="condition-box">
          <Sparkles aria-hidden="true" />
          <div>
            <b>推薦理由</b>
            <p>{exactText(item.reason, "未提供推薦理由")}</p>
          </div>
        </div>

        <div className="facts-grid">
          <Fact label="資料狀態" value={demo ? "示範測試資料" : item.data_status} icon={CheckCircle2} />
          <Fact label="可用／活動時間" value={exactText(item.availability_or_event_time)} icon={Clock3} />
          <Fact label="資格限制" value={item.eligibility.length ? item.eligibility.join("、") : "未列資格條件"} icon={TicketCheck} />
          <Fact label="是否需登記" value={item.registration_required ? "需要" : "不需要"} icon={Tag} />
          <Fact label="有效期限" value={item.valid_until ? `${expired ? "已於" : "至"} ${dateLabel(item.valid_until)}${expired ? " 到期" : ""}` : "來源未明示"} icon={CalendarDays} />
          <Fact label={demo ? "測試資料日期" : "資料確認"} value={dateLabel(item.verified_at)} icon={ShieldCheck} />
          <Fact label="地址" value={demo && item.address ? `${item.address}（測試資料）` : exactText(item.address)} icon={MapPin} />
          <Fact label="座標" value={hasCoordinates ? `${item.lat}, ${item.lng}${demo ? "（測試資料）" : ""}` : "未提供"} icon={MapPin} />
        </div>

        <GroupOfferPanel item={item} />

        <section className="evidence-section">
          <div className="section-heading">
            <span>
              <ReceiptText aria-hidden="true" />
              <b>{demo ? "測試欄位與示範來源" : "成本與來源依據"}</b>
              <small>{demo ? "非真實刊登 · 僅供流程測試" : `${SOURCE_TYPE_LABELS[item.source_type]} · ${AUTHORITY_LABELS[item.source_authority]}`}</small>
            </span>
            <strong>{item.evidence.length}</strong>
          </div>

          {item.evidence.length === 0 ? (
            <p className="evidence-empty">來源未提供逐欄證據摘錄。</p>
          ) : (
            <div className="evidence-list">
              {item.evidence.map((evidence, index) => {
                const evidenceUrl = safeHttpUrl(evidence.url);
                return (
                  <article key={`${evidence.field}-${evidence.checked_at}-${index}`}>
                    <span>{evidence.field}</span>
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
          {demo && <p className="demo-source-note">example.com 示範頁僅用來測試來源連結，不是可交易或可前往的真實刊登。</p>}
          {!sourceUrl && <p className="unsafe-link-note">來源網址缺少或不是可開啟的 http/https 連結。</p>}
        </section>

        <div className="detail-link-row">
          <ExternalLinkButton href={mapUrl}><MapPin aria-hidden="true" />位置／地圖</ExternalLinkButton>
          <ExternalLinkButton href={sourceUrl}><ReceiptText aria-hidden="true" />{demo ? "示範來源頁" : "原始來源"}</ExternalLinkButton>
          {actionUrl && actionUrl !== sourceUrl && (
            <ExternalLinkButton href={actionUrl}><CircleDollarSign aria-hidden="true" />{exactText(item.action_label, "前往行動頁")}</ExternalLinkButton>
          )}
        </div>
        <p className={`fine-print ${demo ? "demo-fine-print" : ""}`}>{demo ? "示範資料不可用於購買、前往或兌換；所有欄位只用於測試。" : "請以原始來源為準；本畫面不推測即時庫存、名額、照片或成功結果。線上配送需核對運費與配送範圍；不同計價單位／份量（例如單人票）不可直接視為多人總價。"}</p>
      </div>

      <div className="detail-actions glass">
        <button type="button" onClick={onFavorite} className={favorite ? "saved" : ""} aria-pressed={favorite}>
          <Bookmark aria-hidden="true" />
          {favorite ? "已收藏" : "收藏"}
        </button>
        <button type="button" onClick={onReport}>
          <Flag aria-hidden="true" />
          回報
        </button>
        <button className="detail-primary" type="button" onClick={onList} aria-pressed={listed}>
          {demo ? (listed ? "從測試清單移除" : "加入測試清單") : (listed ? "從這次清單移除" : "加入這次清單")}
        </button>
      </div>
    </section>
  );
}
