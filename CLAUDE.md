# CLAUDE.md

本檔案供 Claude Code 及其他 AI 助理在本專案工作時參考。

## 專案定位

本專案為 BUILDMODE 2026 參賽作品「ALL in Life」。產品需求請見
[docs/PRD-all-in-life.md](docs/PRD-all-in-life.md)。

## 撰寫 README 時

專案根目錄的 `README.md` 必須依照
[docs/README-template.md](docs/README-template.md) 的章節結構撰寫，
不可缺章節。至少要涵蓋：問題與目標、核心功能、系統架構、使用技術、
安裝與執行、作品展示、限制與未來工作、第三方服務與素材、團隊成員、License。

規則：

- 模板內的引導文字（「請說明…」「請附上…」）必須全部換成實際內容，不可留在成品中。
- 「安裝與執行」要能讓評審從零重現，指令需可直接複製執行。
- 第三方套件、模型、資料與素材一律逐項列出來源連結與授權方式。
- 任何情況下都不要把 API Key、Token、密碼或個人資料寫進 README 或儲存庫。

## 繳交前檢查

送出作品前，逐條核對
[docs/submission-checklist.md](docs/submission-checklist.md)。

- 檢查表為唯一驗收依據；回報時請逐項說明「通過／未通過／不適用」，不要只給總結。
- 未通過的項目要指出缺什麼、要改哪個檔案，不要自行放寬標準。
- 無法由程式碼判斷的項目（例如影片長度、YouTube 權限、表單送出畫面）請明確標示為「需人工確認」，
  不要臆測為通過。
- 若使用者要求「檢查繳交狀態」「submission check」或類似需求，即依此檢查表執行。

## 文件慣例

- 對外文件以繁體中文撰寫。
- 新增的參考文件放在 `docs/`。
- `docs/README-template.md` 與 `docs/submission-checklist.md` 為賽制規範文件，
  除非使用者明確要求，否則不要改寫其內容。
