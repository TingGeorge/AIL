# ALL in life

圓山區生活決策助理。Hackathon MVP：語音說出需求與限制 → 確認 → 搜尋。

- 產品需求：[docs/PRD-all-in-life.md](docs/PRD-all-in-life.md)
- 語音輸入規格：[docs/SPEC-voice-input.md](docs/SPEC-voice-input.md)
- 詞彙表：[CONTEXT.md](CONTEXT.md)

## 開發

```sh
cp .env.example .env   # 填入 STT_* 與 LLM_*（OpenAI-compatible）
bun install
bun run dev            # Hono :3000 + Vite :5173（/api 代理到 Hono）
bun run typecheck
bun test               # 解析 fixtures 需要 LLM_* 設定，否則自動跳過
```

## 正式環境

```sh
bun run build          # 產出 dist/
bun run start          # Hono 提供 dist/ 與 /api
```
