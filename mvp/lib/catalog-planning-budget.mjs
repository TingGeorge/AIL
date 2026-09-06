const DISCLOSURE = '情境估算，不是店家報價';
const POLICY_VERSION = 'planning-v1';

/**
 * @typedef {object} PlanningBudgetCatalogItem
 * @property {string} id
 * @property {string} categoryLabel
 * @property {string} title
 * @property {string} provider
 */

/**
 * @typedef {object} PlanningBudget
 * @property {'ESTIMATE'} kind
 * @property {number} amountTwd
 * @property {number} minTwd
 * @property {number} maxTwd
 * @property {string} unit
 * @property {string} basisLabel
 * @property {typeof DISCLOSURE} disclosure
 * @property {typeof POLICY_VERSION} policyVersion
 */

function clean(value) {
  return typeof value === 'string' ? value.normalize('NFKC').trim() : '';
}

function deterministicHash(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function amountWithin(minTwd, maxTwd, seed) {
  const stepTwd = 10;
  const slotCount = Math.floor((maxTwd - minTwd) / stepTwd) + 1;
  return minTwd + (deterministicHash(seed) % slotCount) * stepTwd;
}

function foodBand(title) {
  if (/(?:吃到飽|buffet|套餐|聚餐|義大利|牛排|火鍋)/i.test(title)) {
    return { minTwd: 220, maxTwd: 700, basisLabel: '正餐餐費規劃' };
  }
  if (/(?:早午餐|咖啡|甜點|下午茶)/i.test(title)) {
    return { minTwd: 120, maxTwd: 380, basisLabel: '輕食餐費規劃' };
  }
  if (/(?:飲料|果汁|奶茶|茶飲)/i.test(title)) {
    return { minTwd: 40, maxTwd: 160, basisLabel: '飲品預算規劃' };
  }
  if (/(?:便當|麵|飯|小吃|肉圓|早餐)/i.test(title)) {
    return { minTwd: 70, maxTwd: 240, basisLabel: '快速餐費規劃' };
  }
  return { minTwd: 100, maxTwd: 400, basisLabel: '一般餐費規劃' };
}

function activityBand(title) {
  if (/(?:工作坊|課程|講座|手作|體驗)/i.test(title)) {
    return { minTwd: 300, maxTwd: 1200, basisLabel: '課程活動規劃' };
  }
  if (/(?:音樂會|演唱會|表演|戲劇|舞台)/i.test(title)) {
    return { minTwd: 400, maxTwd: 1600, basisLabel: '表演活動規劃' };
  }
  if (/(?:市集|嘉年華|快閃)/i.test(title)) {
    return { minTwd: 100, maxTwd: 500, basisLabel: '市集參與規劃' };
  }
  if (/(?:展覽|看展|美術館|博物館|參觀)/i.test(title)) {
    return { minTwd: 100, maxTwd: 600, basisLabel: '展覽參與規劃' };
  }
  return { minTwd: 100, maxTwd: 800, basisLabel: '活動參與規劃' };
}

function transportBand(title, identity) {
  if (/(?:計程車|共乘|叫車|taxi)/i.test(title)) {
    return { minTwd: 100, maxTwd: 350, basisLabel: '短程車資規劃' };
  }
  if (/(?:捷運|metro|mrt)/i.test(identity)) {
    return { minTwd: 20, maxTwd: 65, basisLabel: '大眾運輸單程規劃' };
  }
  if (/(?:公車|bus)/i.test(identity)) {
    return { minTwd: 15, maxTwd: 30, basisLabel: '市區公車單程規劃' };
  }
  return { minTwd: 30, maxTwd: 250, basisLabel: '交通單程規劃' };
}

function isYouBike(identity) {
  return /(?:youbike|u-bike|公共自行車)/i.test(identity);
}

function isDirectUsePublicResource(identity) {
  return /(?:飲水|飲水臺|奉茶|直飲|涼適點|避暑|免費\s*wi-?fi)/i.test(identity);
}

function categoryBand(categoryLabel, title, identity) {
  if (categoryLabel === '食品') {
    return { ...foodBand(title), unit: '每次用餐' };
  }
  if (categoryLabel === '日用品') {
    return {
      minTwd: 100,
      maxTwd: 600,
      unit: '單次補給',
      basisLabel: '日用品單次補給規劃',
    };
  }
  if (/^免費\s*[/／]\s*公益(?:資源)?$/.test(categoryLabel)) {
    return {
      minTwd: 50,
      maxTwd: 300,
      unit: '每次使用',
      basisLabel: '免費資源衍生支出規劃',
    };
  }
  if (categoryLabel === '活動') {
    return { ...activityBand(title), unit: '每次參與' };
  }
  if (categoryLabel === '交通') {
    return { ...transportBand(title, identity), unit: '每趟' };
  }
  return {
    minTwd: 100,
    maxTwd: 500,
    unit: '每次',
    basisLabel: '一般支出規劃',
  };
}

/**
 * Builds a UI-only planning amount without reading or changing CatalogItem.cost.
 * The returned estimate must not be presented as a source-verified price.
 *
 * @param {PlanningBudgetCatalogItem} item
 * @returns {Readonly<PlanningBudget>}
 */
export function planningBudgetForCatalogItem(item) {
  const id = clean(item?.id);
  const categoryLabel = clean(item?.categoryLabel);
  const title = clean(item?.title);
  const provider = clean(item?.provider);
  const identity = `${id}|${title}|${provider}`;

  if (
    /^免費\s*[/／]\s*公益(?:資源)?$/.test(categoryLabel) &&
    isDirectUsePublicResource(identity)
  ) {
    return Object.freeze({
      kind: 'ESTIMATE',
      amountTwd: 0,
      minTwd: 0,
      maxTwd: 0,
      unit: '每次使用',
      basisLabel: '公共資源直接使用預算',
      disclosure: DISCLOSURE,
      policyVersion: POLICY_VERSION,
    });
  }

  if (categoryLabel === '交通' && isYouBike(identity)) {
    return Object.freeze({
      kind: 'ESTIMATE',
      amountTwd: 10,
      minTwd: 0,
      maxTwd: 10,
      unit: '前 30 分鐘',
      basisLabel: '會員前 30 分鐘補助 0 元；單次租借預留 10 元',
      disclosure: DISCLOSURE,
      policyVersion: POLICY_VERSION,
    });
  }

  const band = categoryBand(categoryLabel, title, identity);
  const amountTwd = amountWithin(
    band.minTwd,
    band.maxTwd,
    `${categoryLabel}|${identity}`,
  );

  return Object.freeze({
    kind: 'ESTIMATE',
    amountTwd,
    minTwd: band.minTwd,
    maxTwd: band.maxTwd,
    unit: band.unit,
    basisLabel: band.basisLabel,
    disclosure: DISCLOSURE,
    policyVersion: POLICY_VERSION,
  });
}
