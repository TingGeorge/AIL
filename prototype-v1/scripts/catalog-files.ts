import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { prepareCandidate, type ImportRecord } from "../src/shared/ingestion.ts";

export const defaultDataDirectory = Bun.fileURLToPath(new URL("../data/live/", import.meta.url));
export async function readCatalog(directory = process.env.DATA_DIR || defaultDataDirectory, allowDemo = process.env.ALLOW_DEMO_DATA === "1") {
  const absolute = resolve(directory);
  const root = pathToFileURL(`${absolute}/`);
  const files = [...new Bun.Glob("*.json").scanSync(absolute)].sort();
  if (!files.length) throw new Error(`${absolute} 沒有任何候選 JSON 檔案。`);
  const records: ImportRecord[] = [];
  const now = Date.now();
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    try {
      const json: unknown = await Bun.file(new URL(file, root)).json();
      if (!Array.isArray(json)) throw new Error("最外層必須是陣列");
      for (let index = 0; index < json.length; index++) {
        try {
          const row = prepareCandidate(json[index], { allowDemo, now });
          if (seen.has(row.id)) throw new Error(`重複 id ${row.id}`);
          seen.add(row.id);
          records.push(row);
        } catch(error) { errors.push(`${file} 第 ${index + 1} 筆：${error instanceof Error ? error.message : "資料格式錯誤"}`); }
      }
    } catch(error) { errors.push(`${file}：${error instanceof Error ? error.message : "檔案讀取失敗"}`); }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  if (!records.length) throw new Error(`${absolute} 沒有任何候選紀錄。`);
  return { records, files, directory: absolute };
}
