import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assessCultureTicket,
  cultureTaipeiDateTime,
} from '../lib/culture-nearby.mjs';

const IMPORTER_VERSION = '1.6.0';
const RADIUS_M = 2_000;
const OPEN_DATA_LICENSE = '政府資料開放授權條款第1版（OGL 1.0）';
const OPEN_DATA_TERMS_URL = 'https://data.taipei/rule';
const OFFICIAL_SITE_CONTENT_SCOPE = '必要結構化事實、短摘、內容雜湊與原始連結';
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const mvpDirectory = path.resolve(scriptDirectory, '..');
const dataDirectory = path.join(mvpDirectory, 'data');
const drizzleDirectory = path.join(mvpDirectory, 'drizzle');

const outputPaths = {
  database: path.join(dataDirectory, 'yuanshan-open-data.sqlite'),
  seed: path.join(dataDirectory, 'yuanshan-open-data.seed.sql'),
  snapshot: path.join(dataDirectory, 'yuanshan-open-data.snapshot.json'),
};
const promotionManifestPath = path.join(
  dataDirectory,
  '.yuanshan-open-data.promotion.json',
);
const promotionCommitPath = path.join(
  dataDirectory,
  '.yuanshan-open-data.promotion.committed',
);

const sourceDefinitions = [
  {
    key: 'restaurants',
    id: 'src_taipei_restaurant_registry',
    publisher: '臺北市商業處',
    title: '設址臺北市所營事業含餐館業清冊',
    landingUrl:
      'https://data.taipei/dataset/detail?id=178abc4e-fe32-4fc9-af3a-7baf1c15082c',
    resourceUrl:
      'https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=e94a712a-be5b-4d8b-89c9-30a5ee21f25d',
    format: 'CSV',
    encoding: 'utf-8',
    license: OPEN_DATA_LICENSE,
    requiredHeaders: [
      '統一編號',
      '商業名稱',
      '商業地址',
      'Longitude',
      'Latitude',
    ],
    minRows: 1_000,
    ttlMs: 35 * 24 * 60 * 60 * 1_000,
    required: true,
    description:
      '臺北市餐館業登記底圖；登記不等於現正營業，故營業狀態與菜單價格保持未知。',
  },
  {
    key: 'friendlyStores',
    id: 'src_taipei_friendly_stores',
    publisher: '臺北市商業處',
    title: '友善店家清冊（繁體中文）',
    landingUrl:
      'https://data.taipei/dataset/detail?id=d807396c-e41f-4005-be42-0160280783a1',
    resourceUrl:
      'https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=5a5b36e0-f870-4b7f-8378-c91ac5f57941',
    format: 'CSV',
    encoding: 'utf-8',
    license: OPEN_DATA_LICENSE,
    requiredHeaders: [
      '友善店家名稱',
      '地址',
      '經度',
      '緯度',
      '友善店家網站個別店家介紹網址',
    ],
    minRows: 100,
    ttlMs: 90 * 24 * 60 * 60 * 1_000,
    description: '臺北友善店家的地址、座標與可核對友善設施。',
  },
  {
    key: 'markets',
    id: 'src_taipei_markets',
    publisher: '臺北市市場處',
    title: '臺北市傳統市（商）場',
    landingUrl:
      'https://data.taipei/dataset/detail?id=89bebb3a-990d-4070-bd67-631a575f6d4a',
    resourceUrl:
      'https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=35acfce1-2c4d-4c70-aa75-601cdab2b3f7',
    format: 'CSV',
    encoding: 'utf-8',
    license: OPEN_DATA_LICENSE,
    requiredHeaders: [
      'seqno',
      'stitle',
      'xAddress',
      'GTag_longitude',
      'GTag_latitude',
    ],
    minRows: 10,
    ttlMs: 180 * 24 * 60 * 60 * 1_000,
    description: '臺北市傳統市場的名稱、地址與座標。',
  },
  {
    key: 'pharmacies',
    id: 'src_taipei_pharmacies',
    publisher: '臺北市政府衛生局',
    title: '臺北市藥局',
    landingUrl:
      'https://data.taipei/dataset/detail?id=6fa3ed67-e60e-44d9-a366-ce7008e322de',
    resourceUrl:
      'https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=42cfc382-f2b8-4c3a-87ad-37249634f78e',
    format: 'CSV',
    encoding: 'utf-8',
    license: OPEN_DATA_LICENSE,
    requiredHeaders: ['機構名稱', '地址', '電話', 'x', 'y'],
    minRows: 500,
    ttlMs: 100 * 24 * 60 * 60 * 1_000,
    required: true,
    description:
      '臺北市衛生局藥局名錄；只證明名稱、地址與位置，不推測即時營業、商品、庫存或價格。',
  },
  {
    key: 'drinkingWater',
    id: 'src_taipei_drinking_water',
    publisher: '臺北自來水事業處',
    title: '臺北市公共飲水臺',
    landingUrl:
      'https://data.taipei/dataset/detail?id=155999f2-3c5d-486b-af58-d7f4c0b0a4c9',
    resourceUrl:
      'https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=181097e0-c171-4bcd-ad41-c7b55dbc616e',
    format: 'CSV',
    encoding: 'big5',
    license: OPEN_DATA_LICENSE,
    requiredHeaders: [
      '直飲臺編號',
      '場所名稱',
      '地址',
      '經度',
      '緯度',
      '狀態',
      '水質及維護資訊網址',
    ],
    minRows: 100,
    ttlMs: 100 * 24 * 60 * 60 * 1_000,
    description: '公共飲水臺位置、開放時間、狀態與水質採樣欄位。',
  },
  {
    key: 'wifi',
    id: 'src_taipei_free_wifi',
    publisher: '臺北市政府資訊局',
    title: 'Taipei Free 公眾區免費無線上網熱點',
    landingUrl:
      'https://data.taipei/dataset/detail?id=6aa6532d-652f-4c1b-814a-4646b75407af',
    resourceUrl:
      'https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=549b3a9b-eb6c-4cb1-848b-8c238735e2db',
    format: 'CSV',
    encoding: 'utf-8',
    license: OPEN_DATA_LICENSE,
    requiredHeaders: [
      'SITE_ID',
      'AGENCY',
      'STYPE',
      'NAME',
      'ADDR',
      'LATITUDE',
      'LONGITUDE',
    ],
    minRows: 1_000,
    ttlMs: 200 * 24 * 60 * 60 * 1_000,
    description: 'Taipei Free Wi-Fi 熱點識別碼、場域、地址與座標。',
  },
  {
    key: 'coolingSpots',
    id: 'src_taipei_cooling_spots',
    publisher: '臺北市政府',
    title: '臺北市涼適點',
    landingUrl: 'https://data.gov.tw/dataset/175067',
    resourceUrl:
      'https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=ae7e5986-859d-4294-b289-7c1b2e7c23f1',
    format: 'CSV',
    encoding: 'big5',
    license: OPEN_DATA_LICENSE,
    requiredHeaders: [
      '編號',
      '設施地點（戶外或室內）',
      '名稱',
      '地址',
      '經度',
      '緯度',
      '手機',
      '開放時間',
      '飲水設施（例如：飲水機；直飲台；奉茶點等）',
    ],
    minRows: 100,
    ttlMs: 100 * 24 * 60 * 60 * 1_000,
    description: '可避暑休息的涼適點位置、開放時間與設備。',
  },
  {
    key: 'metroFares',
    id: 'src_taipei_metro_fares',
    publisher: '臺北大眾捷運股份有限公司',
    title: '臺北捷運票價資料',
    landingUrl:
      'https://data.taipei/dataset/detail?id=4acb4911-0360-4063-808d-fcee629508b3',
    resourceUrl:
      'https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=893c2f2a-dcfd-407b-b871-394a14105532',
    format: 'CSV',
    encoding: 'big5',
    license: OPEN_DATA_LICENSE,
    requiredHeaders: [
      '起站',
      '訖站',
      '優惠票價[金額]',
      '敬老卡愛心卡愛心陪伴卡及臺北市與新北市兒童優惠票價[金額]',
      '距離',
    ],
    minRows: 1_000,
    ttlMs: 100 * 24 * 60 * 60 * 1_000,
    description: '捷運各起訖站全票、優惠票與里程；只保存圓山站相關列。',
  },
  {
    key: 'youbike',
    id: 'src_taipei_youbike_realtime',
    publisher: '臺北市政府交通局',
    title: 'YouBike2.0臺北市公共自行車即時資訊',
    landingUrl:
      'https://data.taipei/dataset/detail?id=c6bc8aed-557d-41d5-bfb1-8da24f78f2fb',
    resourceUrl:
      'https://tcgbusfs.blob.core.windows.net/dotapp/youbike/v2/youbike_immediate.json',
    format: 'JSON',
    encoding: 'utf-8',
    license: OPEN_DATA_LICENSE,
    ttlMs: 5 * 60 * 1_000,
    required: true,
    description: 'YouBike 站點位置、容量與即時可借還數量。',
  },
  {
    key: 'cultureEvents',
    id: 'src_taipei_culture_events',
    publisher: '臺北市政府文化局',
    title: '臺北文化快遞藝文活動',
    landingUrl:
      'https://data.taipei/dataset/detail?id=9a7af75b-9abd-4ac1-b359-685fbd7dac23',
    resourceUrl: 'https://cultureexpress.taipei/OpenData/Event/C000003',
    format: 'JSON',
    encoding: 'utf-8',
    license: OPEN_DATA_LICENSE,
    originType: 'PUBLIC',
    authorityLevel: 3,
    evidenceStatus: 'UNVERIFIED',
    ttlMs: 24 * 60 * 60 * 1_000,
    description: '臺北藝文活動、場次、場地座標與票價原文。',
  },
  {
    key: 'cultureNearby',
    id: 'src_moc_nearby_activities',
    publisher: '文化部',
    title: '經緯度查詢附近未過期活動',
    landingUrl: 'https://data.gov.tw/dataset/10044',
    resourceUrl:
      'https://cloud.culture.tw/frontsite/opendata/activityOpenDataJsonAction.do?method=doFindActivitiesNearBy&lat=25.07133&lon=121.52024&range=2',
    format: 'JSON',
    encoding: 'utf-8',
    license: OPEN_DATA_LICENSE,
    termsUrl: 'https://data.gov.tw/licenses',
    originType: 'OFFICIAL',
    authorityLevel: 5,
    evidenceStatus: 'UNVERIFIED',
    ttlMs: 24 * 60 * 60 * 1_000,
    description:
      '文化部依圓山站座標回傳之附近未過期活動；每個 showInfo 場次分開保存，來源發布不等於事件內容已交叉驗證。',
  },
  {
    key: 'tfam',
    id: 'src_tfam_visit',
    publisher: '臺北市立美術館',
    title: '臺北市立美術館時間票價',
    landingUrl:
      'https://www.tfam.museum/Common/editor.aspx?ddlLang=zh-tw&id=230',
    resourceUrl:
      'https://www.tfam.museum/Common/editor.aspx?ddlLang=zh-tw&id=230',
    format: 'HTML',
    encoding: 'utf-8',
    license: null,
    contentScope: OFFICIAL_SITE_CONTENT_SCOPE,
    ttlMs: 24 * 60 * 60 * 1_000,
    description: '北美館地址、開放時間、普通票與免費入場條件。',
  },
  {
    key: 'confucius',
    id: 'src_taipei_confucius_visit',
    publisher: '臺北市孔廟管理委員會',
    title: '臺北孔廟參觀資訊',
    landingUrl:
      'https://tct.gov.taipei/News_Content.aspx?n=E1DAB7270307AF9D&s=4A373EEBD86D5BF6&sms=87415A8B9CE81B16',
    resourceUrl:
      'https://tct.gov.taipei/News_Content.aspx?n=E1DAB7270307AF9D&s=4A373EEBD86D5BF6&sms=87415A8B9CE81B16',
    format: 'HTML',
    encoding: 'utf-8',
    license: null,
    contentScope: OFFICIAL_SITE_CONTENT_SCOPE,
    ttlMs: 24 * 60 * 60 * 1_000,
    description: '臺北孔廟開放時間、地址與免費入園說明。',
  },
  {
    key: 'expoPark',
    id: 'src_taipei_expo_week36',
    publisher: '花博公園',
    title: '花博公園活動展演一覽（2026 Week 36）',
    landingUrl:
      'https://www.expopark.taipei/News_Content.aspx?n=91&s=4542&sms=9004',
    resourceUrl:
      'https://www.expopark.taipei/News_Content.aspx?n=91&s=4542&sms=9004',
    format: 'HTML',
    encoding: 'utf-8',
    license: null,
    contentScope: OFFICIAL_SITE_CONTENT_SCOPE,
    ttlMs: 24 * 60 * 60 * 1_000,
    description: '2026-09-04 至 2026-09-06 圓山園區活動、入場方式與時段。',
  },
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableId(prefix, ...parts) {
  return `${prefix}_${sha256(parts.map(String).join('|')).slice(0, 24)}`;
}

function clean(value) {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .replaceAll(String.fromCharCode(0), '')
    .trim();
}

function compactText(value, maxLength = 260) {
  const text = clean(value).replace(/\s+/g, ' ');
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function htmlToText(value) {
  return compactText(
    String(value ?? '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'"),
    1_000_000,
  );
}

function parseCsv(text) {
  const matrix = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(clean(field));
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(clean(field));
      field = '';
      if (row.some((cell) => cell !== '')) matrix.push(row);
      row = [];
    } else {
      field += character;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(clean(field));
    if (row.some((cell) => cell !== '')) matrix.push(row);
  }
  if (quoted) throw new Error('CSV ended inside a quoted field');
  if (matrix.length === 0) return { headers: [], rows: [] };

  const headers = matrix[0].map(clean);
  const rows = matrix.slice(1).map((cells) => ({
    cells,
    record: Object.fromEntries(
      headers.map((header, index) => [header, clean(cells[index])]),
    ),
  }));
  return { headers, rows };
}

function numberOrNull(value) {
  if (value === null || value === undefined || clean(value) === '') return null;
  const number = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
}

function haversineM(lat1, lng1, lat2, lng2) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusM = 6_371_000;
  const deltaLat = radians(lat2 - lat1);
  const deltaLng = radians(lng2 - lng1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(deltaLng / 2) ** 2;
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function taipeiDateTime(value) {
  const text = clean(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
    return `${text.replace(' ', 'T')}+08:00`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00:00+08:00`;
  return text;
}

function plusMs(isoDate, milliseconds) {
  return new Date(new Date(isoDate).getTime() + milliseconds).toISOString();
}

function assessTicketText(ticketType, ticketPrice) {
  const text = compactText(`${clean(ticketType)} ${clean(ticketPrice)}`, 2_000);
  const hasFreeLanguage =
    /免費|免票|自由入場|free/i.test(text) || /(^|\D)0\s*元/.test(text);
  const positiveCurrencyAmounts = [
    ...text.matchAll(/(?:NT\$|NTD|\$)\s*([\d,]+)|([\d,]+)\s*元/gi),
  ]
    .map((match) => numberOrNull(match[1] ?? match[2]))
    .filter((value) => value !== null && value > 0);
  const hasPaidCondition =
    positiveCurrencyAmounts.length > 0 ||
    /收費|另(?:行)?付費|需(?:先)?購票|門票另計|低消|必要購買/.test(text);
  const hasAdmissionDependency = /憑.{0,16}(?:門票|票券)|含於.{0,12}門票/.test(
    text,
  );
  const conflicted =
    hasFreeLanguage && (hasPaidCondition || hasAdmissionDependency);
  const clearlyZeroAdmission =
    hasFreeLanguage && !hasPaidCondition && !hasAdmissionDependency;
  const registrationRequired = /免報名|無需.{0,4}報名/.test(text)
    ? 0
    : /報名|預約|索票|QR\s*Code/i.test(text)
      ? 1
      : null;
  const membershipRequired = /會員限定|限會員|會員專屬/.test(text) ? 1 : null;
  return {
    text,
    directCostTwd: clearlyZeroAdmission ? 0 : null,
    admissionCostTwd: clearlyZeroAdmission ? 0 : null,
    registrationRequired,
    membershipRequired,
    verificationStatus: conflicted ? 'CONFLICTED' : 'UNVERIFIED',
    conflicted,
  };
}

async function fetchWithRetry(source) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(source.resourceUrl, {
        headers: {
          Accept:
            source.format === 'JSON'
              ? 'application/json'
              : source.format === 'CSV'
                ? 'text/csv,*/*;q=0.5'
                : 'text/html,*/*;q=0.5',
          'User-Agent': 'ALL-IN-LIFE/1.0 open-data-importer',
        },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok)
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0) throw new Error('empty response');
      const decoder = new TextDecoder(source.encoding || 'utf-8', {
        fatal: true,
      });
      const text = decoder.decode(bytes).replace(/^\uFEFF/, '');
      const prefix = text.trimStart().slice(0, 1_000).toLowerCase();
      if (
        source.format === 'JSON' &&
        !prefix.startsWith('[') &&
        !prefix.startsWith('{')
      ) {
        throw new Error('response does not have JSON magic bytes');
      }
      if (
        source.format === 'CSV' &&
        (prefix.startsWith('<') || !prefix.includes(','))
      ) {
        throw new Error('response does not have CSV magic bytes');
      }
      if (
        source.format === 'HTML' &&
        !/<(?:!doctype\s+html|html)\b/i.test(prefix)
      ) {
        throw new Error('response does not have HTML magic bytes');
      }
      return {
        source,
        bytes,
        text,
        hash: sha256(bytes),
        fetchedAt: new Date().toISOString(),
        lastModifiedAt: response.headers.get('last-modified'),
      };
    } catch (error) {
      lastError = error;
      if (attempt < 3)
        await new Promise((resolve) => setTimeout(resolve, attempt * 400));
    }
  }
  throw new Error(`${source.title}: ${lastError?.message ?? lastError}`);
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error(`Non-finite SQL number: ${value}`);
    return String(value);
  }
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function upsertSql(table, row, conflictColumns) {
  const columns = Object.keys(row);
  const updates = columns.filter((column) => !conflictColumns.includes(column));
  const conflictAction =
    updates.length === 0
      ? 'DO NOTHING'
      : `DO UPDATE SET ${updates.map((column) => `${column}=excluded.${column}`).join(', ')}`;
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns
    .map((column) => sqlLiteral(row[column]))
    .join(
      ', ',
    )}) ON CONFLICT (${conflictColumns.join(', ')}) ${conflictAction};`;
}

function assertGeneratedPath(targetPath) {
  const resolvedDataDirectory = `${path.resolve(dataDirectory)}${path.sep}`;
  const resolvedTarget = path.resolve(targetPath);
  if (!resolvedTarget.startsWith(resolvedDataDirectory)) {
    throw new Error(
      `Refusing to replace a file outside the generated data directory: ${resolvedTarget}`,
    );
  }
}

function acquireRefreshLock(refreshLockPath) {
  const lockDatabase = new DatabaseSync(refreshLockPath);
  try {
    lockDatabase.exec(`
      PRAGMA busy_timeout = 0;
      CREATE TABLE IF NOT EXISTS refresh_lock (id INTEGER PRIMARY KEY CHECK (id = 1));
      BEGIN EXCLUSIVE;
    `);
    return lockDatabase;
  } catch (error) {
    lockDatabase.close();
    if (
      error.errcode === 5 ||
      error.errcode === 6 ||
      /database is (?:locked|busy)/i.test(error.message)
    ) {
      throw new Error(
        `Another refresh is already running (lock database: ${refreshLockPath}).`,
      );
    }
    throw error;
  }
}

function createStagedPaths(promotionToken) {
  return {
    database: path.join(
      dataDirectory,
      `.yuanshan-open-data.${promotionToken}.sqlite.tmp`,
    ),
    seed: path.join(
      dataDirectory,
      `.yuanshan-open-data.${promotionToken}.seed.sql.tmp`,
    ),
    snapshot: path.join(
      dataDirectory,
      `.yuanshan-open-data.${promotionToken}.snapshot.json.tmp`,
    ),
  };
}

function removeGeneratedFile(targetPath) {
  assertGeneratedPath(targetPath);
  if (existsSync(targetPath)) rmSync(targetPath);
}

function cleanupStagedPaths(stagedPaths) {
  for (const stagedPath of Object.values(stagedPaths)) {
    removeGeneratedFile(stagedPath);
  }
  for (const suffix of ['-journal', '-wal', '-shm']) {
    removeGeneratedFile(`${stagedPaths.database}${suffix}`);
  }
}

function validatePromotionManifest(manifest) {
  if (
    manifest?.version !== 1 ||
    typeof manifest.token !== 'string' ||
    !/^\d+-\d+$/.test(manifest.token) ||
    !Array.isArray(manifest.entries) ||
    manifest.entries.length !== Object.keys(outputPaths).length
  ) {
    throw new Error('Generated artifact promotion manifest is invalid.');
  }
  const expectedOutputs = new Set(
    Object.values(outputPaths).map((outputPath) => path.resolve(outputPath)),
  );
  const expectedStagedPaths = createStagedPaths(manifest.token);
  const seenOutputs = new Set();
  for (const entry of manifest.entries) {
    for (const targetPath of [
      entry.stagedPath,
      entry.outputPath,
      entry.backupPath,
    ]) {
      if (typeof targetPath !== 'string') {
        throw new Error('Promotion manifest contains a non-path entry.');
      }
      assertGeneratedPath(targetPath);
    }
    if (
      !expectedOutputs.has(path.resolve(entry.outputPath)) ||
      typeof entry.hadOriginal !== 'boolean' ||
      seenOutputs.has(path.resolve(entry.outputPath))
    ) {
      throw new Error('Promotion manifest contains an unexpected output.');
    }
    seenOutputs.add(path.resolve(entry.outputPath));
    const outputKey = Object.keys(outputPaths).find(
      (key) =>
        path.resolve(outputPaths[key]) === path.resolve(entry.outputPath),
    );
    const expectedBackupPath = path.join(
      path.dirname(entry.outputPath),
      `.${path.basename(entry.outputPath)}.${manifest.token}.previous`,
    );
    if (
      path.resolve(entry.stagedPath) !==
        path.resolve(expectedStagedPaths[outputKey]) ||
      path.resolve(entry.backupPath) !== path.resolve(expectedBackupPath)
    ) {
      throw new Error('Promotion manifest paths do not match its token.');
    }
  }
  return manifest;
}

function recoverInterruptedPromotion() {
  assertGeneratedPath(promotionManifestPath);
  assertGeneratedPath(promotionCommitPath);
  if (!existsSync(promotionManifestPath)) {
    removeGeneratedFile(promotionCommitPath);
    return;
  }

  const manifest = validatePromotionManifest(
    JSON.parse(readFileSync(promotionManifestPath, 'utf8')),
  );
  const committed =
    existsSync(promotionCommitPath) &&
    readFileSync(promotionCommitPath, 'utf8').trim() === manifest.token;

  if (
    committed &&
    manifest.entries.every((entry) => existsSync(entry.outputPath))
  ) {
    removeGeneratedFile(promotionManifestPath);
    for (const entry of manifest.entries) {
      removeGeneratedFile(entry.backupPath);
      removeGeneratedFile(entry.stagedPath);
      if (entry.outputPath === outputPaths.database) {
        for (const suffix of ['-journal', '-wal', '-shm']) {
          removeGeneratedFile(`${entry.stagedPath}${suffix}`);
        }
      }
    }
    removeGeneratedFile(promotionCommitPath);
    return;
  }

  for (const entry of manifest.entries.toReversed()) {
    if (existsSync(entry.backupPath)) {
      removeGeneratedFile(entry.outputPath);
      renameSync(entry.backupPath, entry.outputPath);
    } else if (!entry.hadOriginal) {
      removeGeneratedFile(entry.outputPath);
    } else if (!existsSync(entry.outputPath)) {
      throw new Error(
        `Cannot recover generated artifact ${entry.outputPath}; both output and backup are missing.`,
      );
    }
  }
  for (const entry of manifest.entries) {
    removeGeneratedFile(entry.stagedPath);
    if (entry.outputPath === outputPaths.database) {
      for (const suffix of ['-journal', '-wal', '-shm']) {
        removeGeneratedFile(`${entry.stagedPath}${suffix}`);
      }
    }
  }
  removeGeneratedFile(promotionManifestPath);
  try {
    removeGeneratedFile(promotionCommitPath);
  } catch (error) {
    console.warn(
      `Could not remove committed promotion marker ${promotionCommitPath}: ${error.message}`,
    );
  }
}

function cleanupGeneratedScratchFiles() {
  for (const entry of readdirSync(dataDirectory, { withFileTypes: true })) {
    if (
      !entry.isFile() ||
      !entry.name.startsWith('.yuanshan-open-data.') ||
      (!entry.name.includes('.tmp') && !entry.name.endsWith('.previous'))
    ) {
      continue;
    }
    removeGeneratedFile(path.join(dataDirectory, entry.name));
  }
}

function promoteStagedFiles(entries, promotionToken) {
  const states = entries.map(({ stagedPath, outputPath }) => {
    assertGeneratedPath(stagedPath);
    assertGeneratedPath(outputPath);
    return {
      stagedPath,
      outputPath,
      backupPath: path.join(
        path.dirname(outputPath),
        `.${path.basename(outputPath)}.${promotionToken}.previous`,
      ),
      hadOriginal: existsSync(outputPath),
    };
  });
  const manifest = { version: 1, token: promotionToken, entries: states };
  writeFileSync(
    promotionManifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx', flush: true },
  );

  try {
    for (const state of states) {
      if (state.hadOriginal) {
        renameSync(state.outputPath, state.backupPath);
      }
      renameSync(state.stagedPath, state.outputPath);
    }
    writeFileSync(promotionCommitPath, `${promotionToken}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      flush: true,
    });
  } catch (error) {
    try {
      recoverInterruptedPromotion();
    } catch (recoveryError) {
      throw new AggregateError(
        [error, recoveryError],
        'Artifact promotion failed and crash recovery was incomplete',
      );
    }
    throw error;
  }

  try {
    removeGeneratedFile(promotionManifestPath);
  } catch (error) {
    console.warn(`Committed artifacts need startup cleanup: ${error.message}`);
    return;
  }
  for (const state of states) {
    try {
      removeGeneratedFile(state.backupPath);
    } catch (error) {
      console.warn(
        `Could not remove artifact backup ${state.backupPath}: ${error.message}`,
      );
    }
  }
  removeGeneratedFile(promotionCommitPath);
}

async function main() {
  mkdirSync(dataDirectory, { recursive: true });
  const refreshLockPath = path.join(
    dataDirectory,
    '.yuanshan-open-data.refresh-lock.sqlite',
  );
  assertGeneratedPath(refreshLockPath);
  const refreshLock = acquireRefreshLock(refreshLockPath);
  let lockReleased = false;
  const releaseRefreshLock = () => {
    if (lockReleased) return;
    lockReleased = true;
    try {
      refreshLock.exec('ROLLBACK;');
    } finally {
      refreshLock.close();
    }
  };
  const handleInterrupt = (exitCode) => {
    releaseRefreshLock();
    process.exit(exitCode);
  };
  const handleSigint = () => handleInterrupt(130);
  const handleSigterm = () => handleInterrupt(143);
  process.once('SIGINT', handleSigint);
  process.once('SIGTERM', handleSigterm);

  let stagedPaths;
  try {
    Object.values(outputPaths).forEach(assertGeneratedPath);
    recoverInterruptedPromotion();
    cleanupGeneratedScratchFiles();
    const promotionToken = `${process.pid}-${Date.now()}`;
    stagedPaths = createStagedPaths(promotionToken);
    Object.values(stagedPaths).forEach(assertGeneratedPath);

    const startedAt = new Date().toISOString();
    const taipeiDateParts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
      })
        .formatToParts(new Date(startedAt))
        .filter(({ type }) => type !== 'literal')
        .map(({ type, value }) => [type, value]),
    );
    const taipeiDate = `${taipeiDateParts.year}-${taipeiDateParts.month}-${taipeiDateParts.day}`;
    const fetchResults = new Map();
    const warnings = [];
    const settled = await Promise.allSettled(
      sourceDefinitions.map(fetchWithRetry),
    );

    settled.forEach((result, index) => {
      const source = sourceDefinitions[index];
      if (result.status === 'fulfilled') {
        fetchResults.set(source.key, result.value);
      } else if (source.required) {
        throw result.reason;
      } else {
        warnings.push(result.reason?.message ?? String(result.reason));
      }
    });

    const youbikePayload = fetchResults.get('youbike');
    const youbikeRows = JSON.parse(youbikePayload.text);
    if (!Array.isArray(youbikeRows) || youbikeRows.length < 1_000) {
      throw new Error(
        'YouBike API did not return an array with at least 1,000 stations',
      );
    }
    const missingYouBikeFields = [
      'sno',
      'sna',
      'latitude',
      'longitude',
      'Quantity',
    ].filter((field) => !(field in youbikeRows[0]));
    if (missingYouBikeFields.length > 0) {
      throw new Error(
        `YouBike API is missing required fields: ${missingYouBikeFields.join(', ')}`,
      );
    }
    const anchorRow =
      youbikeRows.find((row) => clean(row.sno) === '500103009') ??
      youbikeRows.find(
        (row) =>
          clean(row.sna).includes('捷運圓山站') &&
          clean(row.sna).includes('1號出口'),
      );
    if (!anchorRow)
      throw new Error('Could not locate YouBike 捷運圓山站(1號出口) anchor');

    const anchor = {
      name: clean(anchorRow.sna).replace(/^YouBike2\.0_/, ''),
      externalId: clean(anchorRow.sno),
      latitude: numberOrNull(anchorRow.latitude ?? anchorRow.lat),
      longitude: numberOrNull(anchorRow.longitude ?? anchorRow.lng),
    };
    if (anchor.latitude === null || anchor.longitude === null) {
      throw new Error('Yuanshan anchor is missing coordinates');
    }

    const rowsByTable = {
      sources: [],
      source_resources: [],
      source_snapshots: [],
      areas: [],
      import_runs: [],
      places: [],
      external_place_refs: [],
      restaurants: [],
      opportunities: [],
      evidence_assertions: [],
      import_items: [],
    };
    const snapshotsBySource = new Map();
    const resourcesBySource = new Map();
    const placesById = new Map();
    const placeCatalogMetaById = new Map();
    const externalRefs = new Set();
    const restaurantPlaceIds = new Set();
    const importedExternalIds = new Set();
    const evidenceIds = new Set();
    const sourceStats = Object.fromEntries(
      sourceDefinitions.map((source) => [
        source.key,
        {
          fetched: fetchResults.has(source.key),
          total: 0,
          eligibleWithinRadius: 0,
          imported: 0,
          rejected: 0,
        },
      ]),
    );

    for (const source of sourceDefinitions) {
      const fetched = fetchResults.get(source.key);
      rowsByTable.sources.push({
        id: source.id,
        origin_type: source.originType ?? 'OFFICIAL',
        authority_level: source.authorityLevel ?? 5,
        publisher_name: source.publisher,
        canonical_url: source.landingUrl,
        retention_policy: source.license
          ? '依政府資料開放授權條款與專案刷新政策保留'
          : '只保留必要事實、短摘、內容雜湊與 canonical URL；刷新時重新核對',
        terms_checked_at: startedAt.slice(0, 10),
      });
      if (!fetched) continue;

      const resourceId = stableId('resource', source.key);
      const snapshotId = stableId(
        'snapshot',
        source.key,
        fetched.hash,
        fetched.fetchedAt,
      );
      resourcesBySource.set(source.key, resourceId);
      snapshotsBySource.set(source.key, snapshotId);
      rowsByTable.source_resources.push({
        id: resourceId,
        source_id: source.id,
        landing_url: source.landingUrl,
        resource_url: source.resourceUrl,
        agency: source.publisher,
        license_name: source.license,
        rights_basis: source.license
          ? 'OPEN_LICENSE'
          : 'OFFICIAL_FACT_EXTRACTION',
        terms_url: source.license
          ? (source.termsUrl ?? OPEN_DATA_TERMS_URL)
          : null,
        content_scope:
          source.contentScope ??
          '來源提供之結構化欄位、必要短摘、內容雜湊與原始連結',
        format: source.format,
        encoding: source.encoding,
        fetched_at: fetched.fetchedAt,
        last_modified_at: fetched.lastModifiedAt,
        content_hash: fetched.hash,
      });
      rowsByTable.source_snapshots.push({
        id: snapshotId,
        source_id: source.id,
        fetched_at: fetched.fetchedAt,
        content_hash: fetched.hash,
        short_excerpt: source.description,
        expires_at: plusMs(fetched.fetchedAt, source.ttlMs),
      });
    }

    const areaId = 'area_yuanshan_station_2km';
    const runId = stableId('import', startedAt);
    rowsByTable.areas.push({
      id: areaId,
      name: '圓山生活圈（圓山站 2 km）',
      anchor_place_provider: 'TAIPEI_YOUBIKE',
      anchor_place_id: anchor.externalId,
      center_lat_e6: Math.round(anchor.latitude * 1_000_000),
      center_lng_e6: Math.round(anchor.longitude * 1_000_000),
      radius_m: RADIUS_M,
      timezone: 'Asia/Taipei',
    });

    function distanceFromAnchor(latitude, longitude) {
      if (latitude === null || longitude === null) return null;
      return Math.round(
        haversineM(
          anchor.latitude,
          anchor.longitude,
          Number(latitude),
          Number(longitude),
        ),
      );
    }

    function addEvidence({
      sourceKey,
      subjectType,
      subjectId,
      fieldKey,
      value,
      quote,
      validFrom = null,
      validUntil = null,
      verificationStatus = null,
    }) {
      const snapshotId = snapshotsBySource.get(sourceKey);
      if (!snapshotId) return;
      const evidenceId = stableId(
        'evidence',
        sourceKey,
        snapshotId,
        subjectType,
        subjectId,
        fieldKey,
      );
      if (evidenceIds.has(evidenceId)) return;
      evidenceIds.add(evidenceId);
      rowsByTable.evidence_assertions.push({
        id: evidenceId,
        subject_type: subjectType,
        subject_id: subjectId,
        field_key: fieldKey,
        claimed_value_json: JSON.stringify(value),
        source_snapshot_id: snapshotId,
        evidence_quote: compactText(quote),
        valid_from: validFrom,
        valid_until: validUntil,
        verification_status:
          verificationStatus ??
          sourceDefinitions.find((source) => source.key === sourceKey)
            ?.evidenceStatus ??
          'OFFICIAL_CONFIRMED',
        verified_at: fetchResults.get(sourceKey)?.fetchedAt ?? startedAt,
      });
    }

    function addImportItem({
      sourceKey,
      externalId,
      subjectType,
      subjectId,
      distanceM,
    }) {
      const dedupeKey = `${sourceKey}|${externalId}|${subjectType}|${subjectId}`;
      if (importedExternalIds.has(dedupeKey)) return;
      importedExternalIds.add(dedupeKey);
      rowsByTable.import_items.push({
        run_id: runId,
        source_resource_id: resourcesBySource.get(sourceKey),
        external_id: String(externalId),
        subject_type: subjectType,
        subject_id: subjectId,
        status: 'IMPORTED',
        reject_reason: null,
        distance_m: distanceM,
        source_snapshot_id: snapshotsBySource.get(sourceKey),
      });
      sourceStats[sourceKey].imported += 1;
    }

    function addRejectedImportItem({
      sourceKey,
      externalId,
      rejectReason,
      distanceM = null,
    }) {
      const dedupeKey = `${sourceKey}|${externalId}|REJECTED`;
      if (importedExternalIds.has(dedupeKey)) return;
      importedExternalIds.add(dedupeKey);
      rowsByTable.import_items.push({
        run_id: runId,
        source_resource_id: resourcesBySource.get(sourceKey),
        external_id: String(externalId),
        subject_type: null,
        subject_id: null,
        status: 'REJECTED',
        reject_reason: rejectReason,
        distance_m: distanceM,
        source_snapshot_id: snapshotsBySource.get(sourceKey),
      });
      sourceStats[sourceKey].rejected += 1;
    }

    function addPlace({
      sourceKey,
      externalId,
      provider,
      kind,
      name,
      address = null,
      latitude = null,
      longitude = null,
      websiteUrl = null,
      status = 'UNKNOWN',
      attributes = null,
      quote = null,
      forceInside = false,
      coordinateSourceKey = sourceKey,
      coordinateQuote = null,
    }) {
      const cleanName = clean(name);
      if (!cleanName || !externalId) return null;
      const distanceM = distanceFromAnchor(latitude, longitude);
      if (!forceInside && (distanceM === null || distanceM > RADIUS_M))
        return null;
      const placeId = stableId('place', sourceKey, externalId);
      if (!placesById.has(placeId)) {
        const place = {
          id: placeId,
          area_id: areaId,
          kind,
          name: cleanName,
          address_text: clean(address) || null,
          lat_e6:
            latitude === null ? null : Math.round(Number(latitude) * 1_000_000),
          lng_e6:
            longitude === null
              ? null
              : Math.round(Number(longitude) * 1_000_000),
          website_url: clean(websiteUrl) || null,
          status,
          created_at: fetchResults.get(sourceKey)?.fetchedAt ?? startedAt,
          updated_at: fetchResults.get(sourceKey)?.fetchedAt ?? startedAt,
        };
        placesById.set(placeId, place);
        rowsByTable.places.push(place);
      }
      const refKey = `${placeId}|${provider}`;
      if (!externalRefs.has(refKey)) {
        externalRefs.add(refKey);
        rowsByTable.external_place_refs.push({
          place_id: placeId,
          provider,
          external_id: String(externalId),
          canonical_url: sourceDefinitions.find(
            (source) => source.key === sourceKey,
          )?.landingUrl,
          last_checked_at: fetchResults.get(sourceKey)?.fetchedAt ?? startedAt,
        });
      }
      const baseQuote =
        quote ??
        [cleanName, clean(address)].filter(Boolean).join(' — ') ??
        cleanName;
      if (!placeCatalogMetaById.has(placeId)) {
        const source = sourceDefinitions.find(
          (candidate) => candidate.key === sourceKey,
        );
        placeCatalogMetaById.set(placeId, {
          provider,
          sourceId: source?.id ?? null,
          sourceTitle: source?.title ?? null,
          publisher: source?.publisher ?? null,
          sourceUrl: source?.landingUrl ?? null,
          verifiedAt: fetchResults.get(sourceKey)?.fetchedAt ?? startedAt,
          attributes,
          evidenceQuote: compactText(baseQuote),
        });
      }
      addEvidence({
        sourceKey,
        subjectType: 'PLACE',
        subjectId: placeId,
        fieldKey: 'identity',
        value: { name: cleanName, address: clean(address) || null },
        quote: baseQuote,
      });
      if (latitude !== null && longitude !== null) {
        addEvidence({
          sourceKey: coordinateSourceKey,
          subjectType: 'PLACE',
          subjectId: placeId,
          fieldKey: 'coordinates',
          value: { latitude: Number(latitude), longitude: Number(longitude) },
          quote:
            coordinateQuote ??
            `${cleanName}：${Number(latitude)}, ${Number(longitude)}`,
        });
      }
      if (attributes && Object.keys(attributes).length > 0) {
        addEvidence({
          sourceKey,
          subjectType: 'PLACE',
          subjectId: placeId,
          fieldKey: 'source_attributes',
          value: attributes,
          quote: `${cleanName}：${compactText(JSON.stringify(attributes), 190)}`,
        });
      }
      addImportItem({
        sourceKey,
        externalId,
        subjectType: 'PLACE',
        subjectId: placeId,
        distanceM,
      });
      return { placeId, distanceM };
    }

    function addRestaurant(placeId) {
      if (!placeId || restaurantPlaceIds.has(placeId)) return;
      restaurantPlaceIds.add(placeId);
      rowsByTable.restaurants.push({
        place_id: placeId,
        cuisine_primary: null,
        cuisine_tags_json: '[]',
        service_modes_json: '[]',
        last_menu_verified_at: null,
      });
    }

    function parseSourceCsv(sourceKey) {
      const payload = fetchResults.get(sourceKey);
      if (!payload) return { headers: [], rows: [] };
      const source = sourceDefinitions.find(
        (definition) => definition.key === sourceKey,
      );
      try {
        const parsed = parseCsv(payload.text);
        const missingHeaders = (source.requiredHeaders ?? []).filter(
          (header) => !parsed.headers.includes(header),
        );
        if (missingHeaders.length > 0) {
          throw new Error(
            `missing required headers: ${missingHeaders.join(', ')}`,
          );
        }
        if (source.minRows && parsed.rows.length < source.minRows) {
          throw new Error(
            `row count ${parsed.rows.length} is below minimum ${source.minRows}`,
          );
        }
        sourceStats[sourceKey].total = parsed.rows.length;
        return parsed;
      } catch (error) {
        const message = `${source.title}: CSV schema check failed (${error.message})`;
        if (source.required) throw new Error(message, { cause: error });
        warnings.push(message);
        return { headers: [], rows: [] };
      }
    }

    const restaurantCsv = parseSourceCsv('restaurants');
    for (const { record } of restaurantCsv.rows) {
      const latitude = numberOrNull(record.Latitude);
      const longitude = numberOrNull(record.Longitude);
      const distanceM = distanceFromAnchor(latitude, longitude);
      if (distanceM === null || distanceM > RADIUS_M) continue;
      sourceStats.restaurants.eligibleWithinRadius += 1;
      const name = record['商業名稱'];
      const address = record['商業地址'];
      const externalId =
        record['統一編號'] || stableId('registry-row', name, address);
      const added = addPlace({
        sourceKey: 'restaurants',
        externalId,
        provider: 'TAIPEI_RESTAURANT_REGISTRY',
        kind: 'RESTAURANT',
        name,
        address,
        latitude,
        longitude,
        status: 'UNKNOWN',
        attributes: {
          registeredForRestaurantBusiness: true,
          operatingStatusVerified: false,
          menuPriceAvailable: false,
        },
      });
      addRestaurant(added?.placeId);
    }

    const friendlyCsv = parseSourceCsv('friendlyStores');
    for (const { cells, record } of friendlyCsv.rows) {
      const latitude = numberOrNull(record['緯度'] ?? cells[3]);
      const longitude = numberOrNull(record['經度'] ?? cells[2]);
      const distanceM = distanceFromAnchor(latitude, longitude);
      if (distanceM === null || distanceM > RADIUS_M) continue;
      sourceStats.friendlyStores.eligibleWithinRadius += 1;
      addRejectedImportItem({
        sourceKey: 'friendlyStores',
        externalId: stableId(
          'friendly-store',
          record['友善店家名稱'] ?? cells[0],
          record['地址'] ?? cells[1],
        ),
        rejectReason: 'source_lacks_retail_classification',
        distanceM,
      });
    }

    const marketCsv = parseSourceCsv('markets');
    for (const { record } of marketCsv.rows) {
      const latitude = numberOrNull(record.GTag_latitude);
      const longitude = numberOrNull(record.GTag_longitude);
      const distanceM = distanceFromAnchor(latitude, longitude);
      if (distanceM === null || distanceM > RADIUS_M) continue;
      sourceStats.markets.eligibleWithinRadius += 1;
      addPlace({
        sourceKey: 'markets',
        externalId: record.seqno,
        provider: 'TAIPEI_MARKET',
        kind: 'STORE',
        name: record.stitle,
        address: record.xAddress,
        latitude,
        longitude,
        status: 'UNKNOWN',
        attributes: {
          retailType: 'MARKET_UNCLASSIFIED',
          description: compactText(record.xbody, 180),
          inventoryPriceAvailable: false,
        },
      });
    }

    const pharmacyCsv = parseSourceCsv('pharmacies');
    for (const { record } of pharmacyCsv.rows) {
      const latitude = numberOrNull(record.y);
      const longitude = numberOrNull(record.x);
      const distanceM = distanceFromAnchor(latitude, longitude);
      if (distanceM === null || distanceM > RADIUS_M) continue;
      sourceStats.pharmacies.eligibleWithinRadius += 1;
      const name = record['機構名稱'];
      const address = record['地址'];
      addPlace({
        sourceKey: 'pharmacies',
        externalId: stableId('pharmacy', name, address),
        provider: 'TAIPEI_PHARMACY',
        kind: 'STORE',
        name,
        address,
        latitude,
        longitude,
        status: 'UNKNOWN',
        attributes: {
          retailType: 'PHARMACY',
          phone: clean(record['電話']) || null,
          operatingStatusVerified: false,
          inventoryPriceAvailable: false,
        },
      });
    }

    const drinkingCsv = parseSourceCsv('drinkingWater');
    for (const { record } of drinkingCsv.rows) {
      const latitude = numberOrNull(record['緯度']);
      const longitude = numberOrNull(record['經度']);
      const distanceM = distanceFromAnchor(latitude, longitude);
      if (distanceM === null || distanceM > RADIUS_M) continue;
      sourceStats.drinkingWater.eligibleWithinRadius += 1;
      const sourceStatus = clean(record['狀態']);
      addPlace({
        sourceKey: 'drinkingWater',
        externalId: record['直飲臺編號'] || record['每月對照使用'],
        provider: 'TAIPEI_DRINKING_WATER',
        kind: 'PUBLIC_RESOURCE',
        name:
          record['場所名稱'] ||
          record['維護單位'] ||
          `公共飲水臺 ${record['直飲臺編號']}`,
        address: record['地址'],
        latitude,
        longitude,
        websiteUrl: record['水質及維護資訊網址'],
        status: sourceStatus.includes('正常') ? 'ACTIVE' : 'UNKNOWN',
        attributes: {
          openingHours: record['場所開放時間'] || null,
          placement: record['設置地點'] || null,
          sourceStatus: sourceStatus || null,
          lastSampleAt: record['最近採樣日期時間'] || null,
        },
      });
    }

    const wifiCsv = parseSourceCsv('wifi');
    for (const { record } of wifiCsv.rows) {
      const latitude = numberOrNull(record.LATITUDE);
      const longitude = numberOrNull(record.LONGITUDE);
      const distanceM = distanceFromAnchor(latitude, longitude);
      if (distanceM === null || distanceM > RADIUS_M) continue;
      sourceStats.wifi.eligibleWithinRadius += 1;
      addPlace({
        sourceKey: 'wifi',
        externalId: record.SITE_ID,
        provider: 'TAIPEI_FREE_WIFI',
        kind: 'PUBLIC_RESOURCE',
        name: record.NAME || `Taipei Free ${record.SITE_ID}`,
        address: record.ADDR,
        latitude,
        longitude,
        status: 'UNKNOWN',
        attributes: {
          hotspotType: record.STYPE || null,
          agency: record.AGENCY || null,
        },
      });
    }

    const coolingCsv = parseSourceCsv('coolingSpots');
    for (const { record } of coolingCsv.rows) {
      const latitude = numberOrNull(record['緯度']);
      const longitude = numberOrNull(record['經度']);
      const distanceM = distanceFromAnchor(latitude, longitude);
      if (distanceM === null || distanceM > RADIUS_M) continue;
      sourceStats.coolingSpots.eligibleWithinRadius += 1;
      addPlace({
        sourceKey: 'coolingSpots',
        externalId: record['編號'],
        provider: 'TAIPEI_COOLING_SPOT',
        kind: 'PUBLIC_RESOURCE',
        name: record['名稱'] || `涼適點 ${record['編號']}`,
        address: record['地址'],
        latitude,
        longitude,
        websiteUrl: null,
        status: 'UNKNOWN',
        attributes: {
          indoorOrOutdoor: record['設施地點（戶外或室內）'] || null,
          openingHours: record['開放時間'] || null,
          telephone: record['市話'] || null,
          extension: record['分機'] || null,
          mobile: record['手機'] || null,
          otherContact: record['其他聯絡方式'] || null,
          fan: record['電風扇'] || null,
          airConditioning: record['冷氣'] || null,
          toilet: record['廁所'] || null,
          seating: record['座位'] || null,
          drinkingWater:
            record['飲水設施（例如：飲水機；直飲台；奉茶點等）'] || null,
          accessibleSeating: record['無障礙座位'] || null,
          features: record['其他特色及亮點'] || null,
          note: record['備註'] || null,
        },
      });
    }

    sourceStats.youbike.total = youbikeRows.length;
    for (const row of youbikeRows) {
      const latitude = numberOrNull(row.latitude ?? row.lat);
      const longitude = numberOrNull(row.longitude ?? row.lng);
      const distanceM = distanceFromAnchor(latitude, longitude);
      if (distanceM === null || distanceM > RADIUS_M) continue;
      sourceStats.youbike.eligibleWithinRadius += 1;
      const sourceObservedAtCandidate = taipeiDateTime(
        row.infoTime ?? row.mday ?? row.srcUpdateTime,
      );
      const sourceObservedAt = Number.isFinite(
        Date.parse(sourceObservedAtCandidate),
      )
        ? sourceObservedAtCandidate
        : youbikePayload.fetchedAt;
      const validUntil = plusMs(sourceObservedAt, 5 * 60 * 1_000);
      const added = addPlace({
        sourceKey: 'youbike',
        externalId: clean(row.sno),
        provider: 'TAIPEI_YOUBIKE',
        kind: 'TRANSIT',
        name: clean(row.sna).replace(/^YouBike2\.0_/, ''),
        address: row.ar,
        latitude,
        longitude,
        status: 'UNKNOWN',
        attributes: {
          capacity: numberOrNull(
            row.Quantity ?? row.quantity ?? row.total ?? row.tot,
          ),
        },
      });
      if (added) {
        addEvidence({
          sourceKey: 'youbike',
          subjectType: 'PLACE',
          subjectId: added.placeId,
          fieldKey: 'realtime_availability',
          value: {
            availableRentBikes: numberOrNull(
              row.available_rent_bikes ?? row.sbi,
            ),
            availableReturnBikes: numberOrNull(
              row.available_return_bikes ?? row.bemp,
            ),
            stationActive: String(row.act) === '1',
            observedAt: sourceObservedAt,
          },
          quote: `${clean(row.sna).replace(/^YouBike2\.0_/, '')}：可借 ${row.available_rent_bikes ?? row.sbi ?? '未知'}、可還 ${row.available_return_bikes ?? row.bemp ?? '未知'}`,
          validFrom: sourceObservedAt,
          validUntil,
        });
      }
    }

    const culturePayload = fetchResults.get('cultureEvents');
    if (culturePayload) {
      let cultureRows = [];
      try {
        const parsed = JSON.parse(culturePayload.text);
        if (!Array.isArray(parsed) || parsed.length < 100) {
          throw new Error('payload is not an array with at least 100 records');
        }
        const requiredFields = [
          'ID',
          'Caption',
          'Venue',
          'Address',
          'SessionStartDate',
          'SessionEndDate',
          'Longitude',
          'Latitude',
        ];
        const missingFields = requiredFields.filter(
          (field) => !(field in (parsed[0] ?? {})),
        );
        if (missingFields.length > 0) {
          throw new Error(
            `missing required fields: ${missingFields.join(', ')}`,
          );
        }
        cultureRows = parsed;
      } catch (error) {
        warnings.push(
          `臺北文化快遞藝文活動: JSON schema check failed (${error.message})`,
        );
      }
      sourceStats.cultureEvents.total = cultureRows.length;
      const now = Date.parse(startedAt);
      for (const row of cultureRows) {
        const latitude = numberOrNull(row.Latitude);
        const longitude = numberOrNull(row.Longitude);
        const distanceM = distanceFromAnchor(latitude, longitude);
        const startsAt = taipeiDateTime(row.SessionStartDate || row.StartDate);
        const endsAt = taipeiDateTime(row.SessionEndDate || row.EndDate);
        const eventId =
          clean(row.ID) || stableId('culture-event', row.Caption, startsAt);
        const venueExternalId = stableId(
          'culture-venue',
          row.Venue,
          row.Address,
        );
        const eventOccurrenceId = [
          eventId,
          clean(row.SessionStartDate || row.StartDate),
          clean(row.SessionEndDate || row.EndDate),
          venueExternalId,
        ].join('|');
        if (distanceM === null || distanceM > RADIUS_M) continue;
        const startsAtMs = Date.parse(startsAt);
        const endsAtMs = Date.parse(endsAt);
        if (
          !Number.isFinite(startsAtMs) ||
          !Number.isFinite(endsAtMs) ||
          endsAtMs < startsAtMs
        ) {
          addRejectedImportItem({
            sourceKey: 'cultureEvents',
            externalId: eventOccurrenceId,
            rejectReason: 'invalid_event_interval',
            distanceM,
          });
          continue;
        }
        if (endsAtMs - startsAtMs > 370 * 24 * 60 * 60 * 1_000) {
          addRejectedImportItem({
            sourceKey: 'cultureEvents',
            externalId: eventOccurrenceId,
            rejectReason: 'implausibly_long_event_interval',
            distanceM,
          });
          continue;
        }
        if (endsAtMs < now) {
          addRejectedImportItem({
            sourceKey: 'cultureEvents',
            externalId: eventOccurrenceId,
            rejectReason: 'expired_source_record',
            distanceM,
          });
          continue;
        }
        const locationText = `${clean(row.Venue)} ${clean(row.Address)} ${clean(row.City)} ${clean(row.Area)} ${clean(row.Caption)}`;
        if (
          /\b(?:Javits Center|New York|Manhattan|Brooklyn|Queens|Bronx)\b|紐約/i.test(
            locationText,
          )
        ) {
          addRejectedImportItem({
            sourceKey: 'cultureEvents',
            externalId: eventOccurrenceId,
            rejectReason: 'venue_conflicts_with_taipei_coordinates',
            distanceM,
          });
          continue;
        }
        const startHourMatch = startsAt.match(/T(\d{2}):/);
        if (startHourMatch && Number(startHourMatch[1]) < 6) {
          addRejectedImportItem({
            sourceKey: 'cultureEvents',
            externalId: eventOccurrenceId,
            rejectReason: 'suspicious_overnight_start_time',
            distanceM,
          });
          continue;
        }
        if (
          /^(?:臺北市|台北市)?[\p{Script=Han}]{1,5}區$/u.test(
            clean(row.Address),
          )
        ) {
          addRejectedImportItem({
            sourceKey: 'cultureEvents',
            externalId: eventOccurrenceId,
            rejectReason: 'insufficient_location_precision',
            distanceM,
          });
          continue;
        }
        sourceStats.cultureEvents.eligibleWithinRadius += 1;
        const place = addPlace({
          sourceKey: 'cultureEvents',
          externalId: venueExternalId,
          provider: 'TAIPEI_CULTURE_EXPRESS',
          kind: 'VENUE',
          name: row.Venue || row.Company || row.Caption,
          address: row.Address,
          latitude,
          longitude,
          websiteUrl: null,
          status: 'UNKNOWN',
          attributes: { city: row.City || null, area: row.Area || null },
        });
        if (!place) continue;
        const ticket = assessTicketText(row.TicketType, row.TicketPrice);
        const opportunityId = stableId(
          'opportunity',
          'cultureEvents',
          eventOccurrenceId,
        );
        rowsByTable.opportunities.push({
          id: opportunityId,
          name: clean(row.Caption),
          category: clean(row.Category) || 'CULTURE',
          place_id: place.placeId,
          starts_at: startsAt,
          ends_at: endsAt,
          direct_cost_twd: ticket.directCostTwd,
          food_provided: 'UNKNOWN',
          registration_required: ticket.registrationRequired,
          membership_required: ticket.membershipRequired,
          volunteer_minutes: null,
          admission_cost_twd: ticket.admissionCostTwd,
          required_purchase_twd: null,
          source_id: sourceDefinitions.find(
            (source) => source.key === 'cultureEvents',
          ).id,
          verification_status: ticket.verificationStatus,
          last_verified_at: culturePayload.fetchedAt,
          action_url:
            clean(
              row.WebsiteLink || row.RelatedLink || row.TicketPurchaseLink,
            ) || null,
        });
        addEvidence({
          sourceKey: 'cultureEvents',
          subjectType: 'OPPORTUNITY',
          subjectId: opportunityId,
          fieldKey: 'schedule_and_ticket',
          value: {
            startsAt,
            endsAt,
            ticketType: clean(row.TicketType) || null,
            ticketPrice: clean(row.TicketPrice) || null,
            costClassification: ticket.conflicted
              ? 'CONFLICTED'
              : 'CONSERVATIVE',
          },
          quote: `${clean(row.Caption)}｜${startsAt}–${endsAt}｜${ticket.text || '費用未提供'}`,
          validFrom: startsAt,
          validUntil: endsAt,
          verificationStatus: ticket.verificationStatus,
        });
        addImportItem({
          sourceKey: 'cultureEvents',
          externalId: eventOccurrenceId,
          subjectType: 'OPPORTUNITY',
          subjectId: opportunityId,
          distanceM,
        });
      }
    }

    const cultureNearbyPayload = fetchResults.get('cultureNearby');
    if (cultureNearbyPayload) {
      let nearbyActivityRows = [];
      try {
        const parsed = JSON.parse(cultureNearbyPayload.text);
        if (!Array.isArray(parsed) || parsed.length < 1) {
          throw new Error('payload is not a non-empty array');
        }
        const requiredFields = ['UID', 'title', 'showInfo'];
        const missingFields = requiredFields.filter(
          (field) => !(field in (parsed[0] ?? {})),
        );
        if (missingFields.length > 0) {
          throw new Error(
            `missing required fields: ${missingFields.join(', ')}`,
          );
        }
        nearbyActivityRows = parsed;
      } catch (error) {
        warnings.push(
          `文化部附近未過期活動: JSON schema check failed (${error.message})`,
        );
      }

      sourceStats.cultureNearby.total = nearbyActivityRows.length;
      sourceStats.cultureNearby.occurrences = 0;
      const now = Date.parse(startedAt);

      for (const row of nearbyActivityRows) {
        const eventId =
          clean(row.UID) || stableId('moc-event', row.title, row.startDate);
        const showInfo = Array.isArray(row.showInfo) ? row.showInfo : [];
        if (showInfo.length === 0) {
          addRejectedImportItem({
            sourceKey: 'cultureNearby',
            externalId: `${eventId}|no-show-info`,
            rejectReason: 'missing_show_info',
          });
          continue;
        }

        for (const [showIndex, show] of showInfo.entries()) {
          sourceStats.cultureNearby.occurrences += 1;
          const latitude = numberOrNull(show.latitude);
          const longitude = numberOrNull(show.longitude);
          const distanceM = distanceFromAnchor(latitude, longitude);
          const startsAt = cultureTaipeiDateTime(show.time);
          const endsAt = cultureTaipeiDateTime(show.endTime);
          const venueName =
            clean(show.locationName) || clean(show.location) || clean(row.title);
          const venueExternalId = stableId(
            'moc-culture-venue',
            venueName,
            show.location,
            latitude,
            longitude,
          );
          const eventOccurrenceId = [
            eventId,
            clean(show.time) || `show-${showIndex}`,
            clean(show.endTime),
            venueExternalId,
          ].join('|');

          if (distanceM === null || distanceM > RADIUS_M) {
            addRejectedImportItem({
              sourceKey: 'cultureNearby',
              externalId: eventOccurrenceId,
              rejectReason:
                distanceM === null
                  ? 'missing_occurrence_coordinates'
                  : 'occurrence_outside_radius',
              distanceM,
            });
            continue;
          }
          const startsAtMs = Date.parse(startsAt);
          const endsAtMs = Date.parse(endsAt);
          if (
            !Number.isFinite(startsAtMs) ||
            !Number.isFinite(endsAtMs) ||
            endsAtMs < startsAtMs
          ) {
            addRejectedImportItem({
              sourceKey: 'cultureNearby',
              externalId: eventOccurrenceId,
              rejectReason: 'invalid_occurrence_interval',
              distanceM,
            });
            continue;
          }
          if (endsAtMs - startsAtMs > 370 * 24 * 60 * 60 * 1_000) {
            addRejectedImportItem({
              sourceKey: 'cultureNearby',
              externalId: eventOccurrenceId,
              rejectReason: 'implausibly_long_occurrence_interval',
              distanceM,
            });
            continue;
          }
          if (endsAtMs < now) {
            addRejectedImportItem({
              sourceKey: 'cultureNearby',
              externalId: eventOccurrenceId,
              rejectReason: 'expired_source_occurrence',
              distanceM,
            });
            continue;
          }
          if (!clean(row.title) || !venueName) {
            addRejectedImportItem({
              sourceKey: 'cultureNearby',
              externalId: eventOccurrenceId,
              rejectReason: 'missing_occurrence_identity',
              distanceM,
            });
            continue;
          }

          sourceStats.cultureNearby.eligibleWithinRadius += 1;
          const place = addPlace({
            sourceKey: 'cultureNearby',
            externalId: venueExternalId,
            provider: 'MOC_CULTURE_NEARBY',
            kind: 'VENUE',
            name: venueName,
            address: show.location,
            latitude,
            longitude,
            websiteUrl: null,
            status: 'UNKNOWN',
            attributes: {
              sourceWebName: clean(row.sourceWebName) || null,
              categoryCode: clean(row.category) || null,
              showUnit: clean(row.showUnit) || null,
              masterUnit: Array.isArray(row.masterUnit)
                ? row.masterUnit.map(clean).filter(Boolean)
                : clean(row.masterUnit) || null,
            },
          });
          if (!place) continue;

          const ticket = assessCultureTicket({
            onSales: show.onSales,
            price: show.price,
          });
          const opportunityId = stableId(
            'opportunity',
            'cultureNearby',
            eventOccurrenceId,
          );
          rowsByTable.opportunities.push({
            id: opportunityId,
            name: clean(row.title),
            category: 'EVENT',
            place_id: place.placeId,
            starts_at: startsAt,
            ends_at: endsAt,
            direct_cost_twd: ticket.directCostTwd,
            food_provided: 'UNKNOWN',
            registration_required: ticket.registrationRequired,
            membership_required: ticket.membershipRequired,
            volunteer_minutes: null,
            admission_cost_twd: ticket.admissionCostTwd,
            required_purchase_twd: null,
            source_id: sourceDefinitions.find(
              (source) => source.key === 'cultureNearby',
            ).id,
            verification_status: ticket.verificationStatus,
            last_verified_at: cultureNearbyPayload.fetchedAt,
            action_url:
              clean(row.sourceWebPromote) || clean(row.webSales) || null,
          });
          addEvidence({
            sourceKey: 'cultureNearby',
            subjectType: 'OPPORTUNITY',
            subjectId: opportunityId,
            fieldKey: 'schedule_location_and_ticket',
            value: {
              startsAt,
              endsAt,
              location: clean(show.location) || null,
              locationName: clean(show.locationName) || null,
              latitude,
              longitude,
              onSales: ticket.salesFlag,
              price: ticket.priceText,
              sourceWebName: clean(row.sourceWebName) || null,
              eventVerification: ticket.verificationStatus,
            },
            quote: `${clean(row.title)}｜${startsAt}–${endsAt}｜${venueName}｜${ticket.priceText || '票價未提供'}`,
            validFrom: startsAt,
            validUntil: endsAt,
            verificationStatus: ticket.verificationStatus,
          });
          addImportItem({
            sourceKey: 'cultureNearby',
            externalId: eventOccurrenceId,
            subjectType: 'OPPORTUNITY',
            subjectId: opportunityId,
            distanceM,
          });
        }
      }
    }

    const metroCsv = parseSourceCsv('metroFares');
    if (metroCsv.rows.length > 0) {
      const yuanshanFares = metroCsv.rows
        .filter(
          ({ record }) =>
            clean(record['起站']).includes('圓山') ||
            clean(record['訖站']).includes('圓山'),
        )
        .map(({ record }) => ({
          起站: record['起站'],
          訖站: record['訖站'],
          '優惠票價[金額]': numberOrNull(record['優惠票價[金額]']),
          '敬老卡愛心卡愛心陪伴卡及臺北市與新北市兒童優惠票價[金額]':
            numberOrNull(
              record[
                '敬老卡愛心卡愛心陪伴卡及臺北市與新北市兒童優惠票價[金額]'
              ],
            ),
          距離: numberOrNull(record['距離']),
        }));
      sourceStats.metroFares.fareRowsTouchingYuanshan = yuanshanFares.length;
      if (yuanshanFares.length > 0) {
        addEvidence({
          sourceKey: 'metroFares',
          subjectType: 'AREA',
          subjectId: areaId,
          fieldKey: 'fares_from_or_to_yuanshan',
          value: yuanshanFares,
          quote: `官方票價表中共有 ${yuanshanFares.length} 筆起點或終點為圓山站的票價。`,
        });
        addImportItem({
          sourceKey: 'metroFares',
          externalId: 'fares-from-or-to-yuanshan',
          subjectType: 'AREA',
          subjectId: areaId,
          distanceM: null,
        });
      }
    }

    function addCuratedOpportunity({
      sourceKey,
      externalId,
      venueExternalId,
      placeName,
      placeKind = 'VENUE',
      address,
      websiteUrl,
      name,
      category,
      startsAt,
      endsAt,
      evidenceQuote,
      registrationRequired = null,
      membershipRequired = null,
      latitude = null,
      longitude = null,
      coordinateSourceKey = sourceKey,
      coordinateQuote = null,
      attributes = null,
    }) {
      if (!fetchResults.has(sourceKey)) return;
      if (
        !Number.isFinite(Date.parse(startsAt)) ||
        !Number.isFinite(Date.parse(endsAt))
      )
        return;
      if (Date.parse(endsAt) < Date.parse(startedAt)) return;
      const place = addPlace({
        sourceKey,
        externalId: `venue:${venueExternalId}`,
        provider: sourceKey.toUpperCase(),
        kind: placeKind,
        name: placeName,
        address,
        latitude,
        longitude,
        websiteUrl,
        status: 'UNKNOWN',
        forceInside: true,
        coordinateSourceKey,
        coordinateQuote,
        attributes,
        quote: `${placeName} — ${address}`,
      });
      if (!place) return;
      const opportunityId = stableId('opportunity', sourceKey, externalId);
      rowsByTable.opportunities.push({
        id: opportunityId,
        name,
        category,
        place_id: place.placeId,
        starts_at: startsAt,
        ends_at: endsAt,
        direct_cost_twd: 0,
        food_provided: 'UNKNOWN',
        registration_required: registrationRequired,
        membership_required: membershipRequired,
        volunteer_minutes: null,
        admission_cost_twd: 0,
        required_purchase_twd: null,
        source_id: sourceDefinitions.find((source) => source.key === sourceKey)
          .id,
        verification_status: 'OFFICIAL_CONFIRMED',
        last_verified_at: fetchResults.get(sourceKey).fetchedAt,
        action_url: websiteUrl,
      });
      addEvidence({
        sourceKey,
        subjectType: 'OPPORTUNITY',
        subjectId: opportunityId,
        fieldKey: 'zero_cost_and_schedule',
        value: {
          directCostTwd: 0,
          startsAt,
          endsAt,
          registrationRequired,
          membershipRequired,
        },
        quote: evidenceQuote,
        validFrom: startsAt,
        validUntil: endsAt,
      });
      addImportItem({
        sourceKey,
        externalId,
        subjectType: 'OPPORTUNITY',
        subjectId: opportunityId,
        distanceM: null,
      });
    }

    const tfamText = fetchResults.has('tfam')
      ? htmlToText(fetchResults.get('tfam').text)
      : '';
    const tfamWeekdayName = {
      Sun: '週日',
      Mon: '週一',
      Tue: '週二',
      Wed: '週三',
      Thu: '週四',
      Fri: '週五',
      Sat: '週六',
    }[taipeiDateParts.weekday];
    const tfamHoursMatch = tfamWeekdayName
      ? tfamText.match(
          new RegExp(`${tfamWeekdayName}\\s*:?\\s*09:30\\s*-\\s*(17:30|20:30)`),
        )
      : null;
    const tfamFreeCondition =
      /開放時間\s*17:00\s*後停止售票[，,。\s]*免費參觀/.test(tfamText);
    if (taipeiDateParts.weekday !== 'Mon') {
      if (tfamHoursMatch && tfamFreeCondition) {
        addCuratedOpportunity({
          sourceKey: 'tfam',
          externalId: `tfam-after-1700-${taipeiDate}`,
          venueExternalId: 'taipei-fine-arts-museum',
          placeName: '臺北市立美術館',
          address: '臺北市中山區中山北路三段181號',
          websiteUrl: sourceDefinitions.find((source) => source.key === 'tfam')
            .landingUrl,
          name: '北美館 17:00 後免費參觀',
          category: 'PUBLIC_RESOURCE',
          startsAt: `${taipeiDate}T17:00:00+08:00`,
          endsAt: `${taipeiDate}T${tfamHoursMatch[1]}:00+08:00`,
          evidenceQuote:
            '官方票價頁：開放時間 17:00 後停止售票，免費參觀；合作特展票券除外。',
        });
      } else if (fetchResults.has('tfam')) {
        warnings.push(
          '北美館頁面未同時通過當日開放時間與 17:00 後免費條件檢查。',
        );
      }
    }

    const confuciusText = fetchResults.has('confucius')
      ? htmlToText(fetchResults.get('confucius').text)
      : '';
    const confuciusFactsMatch =
      /星期二至星期日.{0,40}08:30\s*-\s*21:00.{0,30}星期一休園.{0,100}免費入園參觀/.test(
        confuciusText,
      );
    if (taipeiDateParts.weekday !== 'Mon') {
      if (confuciusFactsMatch) {
        addCuratedOpportunity({
          sourceKey: 'confucius',
          externalId: `confucius-free-${taipeiDate}`,
          venueExternalId: 'taipei-confucius-temple',
          placeName: '臺北市孔廟',
          address: '臺北市大同區大龍街275號',
          websiteUrl: sourceDefinitions.find(
            (source) => source.key === 'confucius',
          ).landingUrl,
          name: '臺北孔廟免費入園',
          category: 'PUBLIC_RESOURCE',
          startsAt: `${taipeiDate}T08:30:00+08:00`,
          endsAt: `${taipeiDate}T21:00:00+08:00`,
          evidenceQuote:
            '官方參觀資訊：星期二至星期日 08:30–21:00，民眾免費入園參觀。',
        });
      } else if (fetchResults.has('confucius')) {
        warnings.push('孔廟頁面未同時通過開放日、時間與免費入園條件檢查。');
      }
    }

    const expoText = fetchResults.has('expoPark')
      ? htmlToText(fetchResults.get('expoPark').text)
      : '';
    const expoEvents = [
      {
        externalIdPrefix: 'expo-farmers-market',
        name: '臺北花博農民市集',
        dates: ['2026-09-05', '2026-09-06'],
        startsAt: '10:00:00',
        endsAt: '18:00:00',
        evidenceQuote:
          '花博公園官方活動頁：圓山園區長廊廣場，9/5–9/6 10:00–18:00，免費入場。',
        phrase: '臺北花博農民市集',
        expectedTokens: [
          '花博公園圓山園區｜長廊廣場',
          '9/5',
          '9/6',
          '10:00',
          '18:00',
          '免費入場',
        ],
      },
      {
        externalIdPrefix: 'expo-charity-fair',
        name: '世界有愛弱童有家公益園遊會',
        dates: ['2026-09-04', '2026-09-05', '2026-09-06'],
        startsAt: '10:00:00',
        endsAt: '20:00:00',
        evidenceQuote:
          '花博公園官方活動頁：圓山園區入口廣場，9/4–9/6 10:00–20:00，自由入場。',
        phrase: '世界有愛弱童有家公益園遊會',
        expectedTokens: [
          '花博公園圓山園區｜入口廣場',
          '9/4',
          '9/6',
          '10:00',
          '20:00',
          '自由入場',
        ],
      },
      {
        externalIdPrefix: 'expo-chill-market',
        name: 'Chill秋市',
        dates: ['2026-09-05', '2026-09-06'],
        startsAt: '12:00:00',
        endsAt: '18:00:00',
        evidenceQuote:
          '花博公園官方活動頁：圓山園區環形廣場，9/5–9/6 12:00–18:00，自由入場。',
        phrase: 'Chill秋市',
        expectedTokens: [
          '花博公園圓山園區｜環形廣場',
          '9/5',
          '9/6',
          '12:00',
          '18:00',
          '自由入場',
        ],
      },
      {
        externalIdPrefix: 'expo-towel-festival',
        name: '巾喜一夏·雲林毛巾嘉年華',
        dates: ['2026-09-05', '2026-09-06'],
        startsAt: '10:00:00',
        endsAt: '18:00:00',
        evidenceQuote:
          '花博公園官方活動頁：圓山園區花海廣場，9/5–9/6 10:00–18:00，自由入場。',
        phrase: '巾喜一夏',
        expectedTokens: [
          '花博公園圓山園區｜花海廣場',
          '9/5',
          '9/6',
          '10:00',
          '18:00',
          '自由入場',
        ],
      },
    ];
    if (expoText) {
      for (const event of expoEvents) {
        let offset = 0;
        let verifiedContext = null;
        while (offset < expoText.length) {
          const phraseIndex = expoText.indexOf(event.phrase, offset);
          if (phraseIndex < 0) break;
          const candidateContext = expoText.slice(
            phraseIndex,
            phraseIndex + 700,
          );
          if (
            event.expectedTokens.every((token) =>
              candidateContext.includes(token),
            )
          ) {
            verifiedContext = candidateContext;
            break;
          }
          offset = phraseIndex + event.phrase.length;
        }
        if (!verifiedContext) {
          warnings.push(
            `花博頁面未同時驗證「${event.phrase}」的場地、日期、時間與入場方式。`,
          );
          continue;
        }
        for (const eventDate of event.dates) {
          addCuratedOpportunity({
            sourceKey: 'expoPark',
            externalId: `${event.externalIdPrefix}-${eventDate}`,
            venueExternalId: 'taipei-expo-park-yuanshan',
            placeName: '花博公園圓山園區',
            address: '臺北市中山區玉門街1號',
            latitude: anchor.latitude,
            longitude: anchor.longitude,
            coordinateSourceKey: 'youbike',
            coordinateQuote:
              '以官方 YouBike 捷運圓山站（1號出口）站點作為花博公園圓山園區入口定位錨點。',
            attributes: {
              coordinateBasis: 'NEARBY_OFFICIAL_TRANSIT_ANCHOR',
              coordinateAccuracy: 'ENTRANCE_APPROXIMATION',
            },
            websiteUrl: sourceDefinitions.find(
              (source) => source.key === 'expoPark',
            ).landingUrl,
            name: event.name,
            category: 'EVENT',
            startsAt: `${eventDate}T${event.startsAt}+08:00`,
            endsAt: `${eventDate}T${event.endsAt}+08:00`,
            evidenceQuote: `${event.evidenceQuote} 本筆以 ${eventDate} 單日場次儲存。`,
          });
        }
      }
    }

    const completedAt = new Date().toISOString();
    const summary = {
      importerVersion: IMPORTER_VERSION,
      runId,
      startedAt,
      completedAt,
      area: {
        id: areaId,
        name: '圓山生活圈（圓山站 2 km）',
        radiusM: RADIUS_M,
        anchor,
      },
      counts: {
        places: rowsByTable.places.length,
        restaurants: rowsByTable.restaurants.length,
        opportunities: rowsByTable.opportunities.length,
        evidenceAssertions: rowsByTable.evidence_assertions.length,
        sourcesFetched: fetchResults.size,
      },
      byPlaceKind: Object.fromEntries(
        ['RESTAURANT', 'STORE', 'VENUE', 'PUBLIC_RESOURCE', 'TRANSIT'].map(
          (kind) => [
            kind,
            rowsByTable.places.filter((place) => place.kind === kind).length,
          ],
        ),
      ),
      sourceStats,
      warnings,
      integrityNotes: [
        '餐館清冊只證明登記資料，不證明目前營業；status 保持 UNKNOWN。',
        '政府開放資料未提供圓山餐廳即時菜單價；未建立任何推測 menu item 或 offer。',
        '文化快遞是官方分發的投稿資料，不等於官方背書；預設 UNVERIFIED，衝突資料標為 CONFLICTED。',
        '文化部附近活動依 showInfo 拆成逐場次；官方平台來源與事件內容驗證分層，事件預設 UNVERIFIED。',
        '異常長活動區間、已過期列、可疑凌晨時段、僅行政區地址與場地／座標明顯衝突列會進 REJECTED 稽核紀錄。',
        '文化活動只有在票價原文明示且沒有費用衝突時才寫入 0；其餘費用保持 NULL。',
        'YouBike 可借還數量與站點狀態只存在短效 assertion，valid_until 為來源觀測時間後 5 分鐘。',
        '官方網頁型來源只保存必要短摘、雜湊與 canonical URL。',
      ],
    };

    if (warnings.length > 0) {
      throw new Error(
        `Refresh was incomplete; keeping the last-good artifacts. ${warnings.join(' | ')}`,
      );
    }

    rowsByTable.import_runs.push({
      id: runId,
      area_id: areaId,
      importer_version: IMPORTER_VERSION,
      started_at: startedAt,
      completed_at: completedAt,
      status: 'COMPLETED',
      summary_json: JSON.stringify(summary),
    });

    const dataStatements = [
      ...rowsByTable.sources.map((row) => upsertSql('sources', row, ['id'])),
      ...rowsByTable.source_resources.map((row) =>
        upsertSql('source_resources', row, ['id']),
      ),
      ...rowsByTable.source_snapshots.map((row) =>
        upsertSql('source_snapshots', row, ['id']),
      ),
      ...rowsByTable.areas.map((row) => upsertSql('areas', row, ['id'])),
      ...rowsByTable.import_runs.map((row) =>
        upsertSql(
          'import_runs',
          { ...row, completed_at: null, status: 'RUNNING' },
          ['id'],
        ),
      ),
      ...rowsByTable.places.map((row) => upsertSql('places', row, ['id'])),
      ...rowsByTable.external_place_refs.map((row) =>
        upsertSql('external_place_refs', row, ['place_id', 'provider']),
      ),
      ...rowsByTable.restaurants.map((row) =>
        upsertSql('restaurants', row, ['place_id']),
      ),
      ...rowsByTable.opportunities.map((row) =>
        upsertSql('opportunities', row, ['id']),
      ),
      ...rowsByTable.evidence_assertions.map((row) =>
        upsertSql('evidence_assertions', row, ['id']),
      ),
      ...rowsByTable.import_items.map((row) =>
        upsertSql('import_items', row, [
          'run_id',
          'source_resource_id',
          'external_id',
        ]),
      ),
      ...rowsByTable.import_runs.map(
        (row) =>
          `UPDATE import_runs SET completed_at=${sqlLiteral(row.completed_at)}, status=${sqlLiteral(row.status)}, summary_json=${sqlLiteral(row.summary_json)} WHERE id=${sqlLiteral(row.id)};`,
      ),
    ];
    const seedSql = [
      '-- Generated by scripts/import-yuanshan-open-data.mjs.',
      `-- Captured at ${startedAt}; area center ${anchor.latitude}, ${anchor.longitude}; radius ${RADIUS_M} m.`,
      '-- Apply after 0001_p0_core.sql, 0002_product_flow.sql and 0003_open_data_ingestion.sql.',
      '-- Bootstrap seed for a new database; incremental reconciliation is not implemented.',
      '-- No explicit transaction is included so wrangler d1 execute --file can manage execution.',
      '',
      ...dataStatements,
      '',
    ].join('\n');

    const placeDistanceById = new Map(
      rowsByTable.import_items
        .filter((item) => item.subject_type === 'PLACE')
        .map((item) => [item.subject_id, item.distance_m]),
    );
    const snapshot = {
      meta: summary,
      sources: sourceDefinitions.map((source) => ({
        id: source.id,
        title: source.title,
        publisher: source.publisher,
        landingUrl: source.landingUrl,
        resourceUrl: source.resourceUrl,
        license: source.license,
        rightsBasis: source.license
          ? 'OPEN_LICENSE'
          : 'OFFICIAL_FACT_EXTRACTION',
        termsUrl: source.license
          ? (source.termsUrl ?? OPEN_DATA_TERMS_URL)
          : null,
        contentScope:
          source.contentScope ??
          '來源提供之結構化欄位、必要短摘、內容雜湊與原始連結',
        fetchedAt: fetchResults.get(source.key)?.fetchedAt ?? null,
        contentHash: fetchResults.get(source.key)?.hash ?? null,
      })),
      places: rowsByTable.places.map((place) => {
        const catalogMeta = placeCatalogMetaById.get(place.id) ?? {};
        return {
          id: place.id,
          kind: place.kind,
          name: place.name,
          address: place.address_text,
          latitude: place.lat_e6 === null ? null : place.lat_e6 / 1_000_000,
          longitude: place.lng_e6 === null ? null : place.lng_e6 / 1_000_000,
          distanceM: placeDistanceById.get(place.id) ?? null,
          status: place.status,
          websiteUrl: place.website_url,
          provider: catalogMeta.provider ?? null,
          sourceId: catalogMeta.sourceId ?? null,
          sourceTitle: catalogMeta.sourceTitle ?? null,
          publisher: catalogMeta.publisher ?? null,
          sourceUrl: catalogMeta.sourceUrl ?? null,
          verifiedAt: catalogMeta.verifiedAt ?? null,
          attributes: catalogMeta.attributes ?? null,
          evidenceQuote: catalogMeta.evidenceQuote ?? null,
        };
      }),
      opportunities: rowsByTable.opportunities.map((opportunity) => {
        const source = sourceDefinitions.find(
          (candidate) => candidate.id === opportunity.source_id,
        );
        return {
          id: opportunity.id,
          name: opportunity.name,
          category: opportunity.category,
          placeId: opportunity.place_id,
          startsAt: opportunity.starts_at,
          endsAt: opportunity.ends_at,
          directCostTwd: opportunity.direct_cost_twd,
          admissionCostTwd: opportunity.admission_cost_twd,
          registrationRequired:
            opportunity.registration_required === null
              ? null
              : Boolean(opportunity.registration_required),
          verificationStatus: opportunity.verification_status,
          actionUrl: opportunity.action_url,
          sourceId: opportunity.source_id,
          sourceTitle: source?.title ?? null,
          publisher: source?.publisher ?? null,
          sourceUrl: source?.landingUrl ?? opportunity.action_url,
          verifiedAt: opportunity.last_verified_at,
        };
      }),
    };

    writeFileSync(stagedPaths.seed, seedSql, 'utf8');
    writeFileSync(
      stagedPaths.snapshot,
      `${JSON.stringify(snapshot, null, 2)}\n`,
      'utf8',
    );

    const database = new DatabaseSync(stagedPaths.database);
    try {
      database.exec(
        readFileSync(path.join(drizzleDirectory, '0001_p0_core.sql'), 'utf8'),
      );
      database.exec(
        readFileSync(
          path.join(drizzleDirectory, '0002_product_flow.sql'),
          'utf8',
        ),
      );
      database.exec(
        readFileSync(
          path.join(drizzleDirectory, '0003_open_data_ingestion.sql'),
          'utf8',
        ),
      );
      database.exec('BEGIN IMMEDIATE;');
      try {
        database.exec(dataStatements.join('\n'));
        database.exec('COMMIT;');
      } catch (error) {
        database.exec('ROLLBACK;');
        throw error;
      }
      database.exec('PRAGMA optimize;');

      const integrity = database
        .prepare('PRAGMA integrity_check')
        .get()?.integrity_check;
      const foreignKeyErrors = database
        .prepare('PRAGMA foreign_key_check')
        .all();
      const actualCounts = {
        places: database.prepare('SELECT count(*) AS count FROM places').get()
          .count,
        restaurants: database
          .prepare('SELECT count(*) AS count FROM restaurants')
          .get().count,
        publicResources: database
          .prepare(
            "SELECT count(*) AS count FROM places WHERE kind = 'PUBLIC_RESOURCE'",
          )
          .get().count,
        transit: database
          .prepare(
            "SELECT count(*) AS count FROM places WHERE kind = 'TRANSIT'",
          )
          .get().count,
        opportunities: database
          .prepare('SELECT count(*) AS count FROM opportunities')
          .get().count,
        evidenceAssertions: database
          .prepare('SELECT count(*) AS count FROM evidence_assertions')
          .get().count,
      };
      if (integrity !== 'ok')
        throw new Error(`SQLite integrity_check failed: ${integrity}`);
      if (foreignKeyErrors.length > 0) {
        throw new Error(
          `SQLite foreign_key_check returned ${foreignKeyErrors.length} errors`,
        );
      }
      if (
        actualCounts.places < 20 ||
        actualCounts.restaurants < 7 ||
        actualCounts.publicResources < 7 ||
        actualCounts.transit < 1
      ) {
        throw new Error(
          `Imported database is below the MVP minimum: ${JSON.stringify(actualCounts)}`,
        );
      }
    } finally {
      database.close();
    }

    promoteStagedFiles(
      Object.keys(outputPaths).map((key) => ({
        stagedPath: stagedPaths[key],
        outputPath: outputPaths[key],
      })),
      promotionToken,
    );
    console.log(JSON.stringify({ ...summary, outputPaths }, null, 2));
  } finally {
    process.off('SIGINT', handleSigint);
    process.off('SIGTERM', handleSigterm);
    if (stagedPaths) cleanupStagedPaths(stagedPaths);
    releaseRefreshLock();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
