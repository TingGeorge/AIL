import { sql } from "bun";

// SPEC-backend §5.2：連線與 schema 套用都必須 lazy。tests/routes.test.ts 直接 import app 而且
// 不需要資料庫；只要這個模組在載入時連線，沒有 PostgreSQL 的環境下整組測試都會爆。
// Bun.sql 本身是 lazy 的（第一次查詢才連線），所以這裡只 re-export。
export { sql };

export const dbConfigured = () => Boolean(process.env.DATABASE_URL);

// 只在 index.ts 的啟動路徑呼叫，不在模組載入時呼叫。
export async function applySchema() {
  const ddl = await Bun.file(new URL("./schema.sql", import.meta.url)).text();
  await sql.unsafe(ddl);
}
