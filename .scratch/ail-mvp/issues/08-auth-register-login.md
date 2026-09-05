# 08: 帳號註冊、登入與工作階段

**What to build:** 提供可選的帳號入口，不破壞匿名閉環。使用者可以用全站唯一、不分大小寫的 username 加至少 12 字元的 password 註冊（nickname 可選，預設等於 username），登入後取得一個隨機 opaque token 放在同一分頁的 `sessionStorage`；重新整理時用這個 token 恢復登入狀態。token 建立後固定 30 分鐘到期、不因請求延長，登出立即撤銷。

伺服器只保存 password 的 Argon2id 雜湊與 token 的 sha256，原始 token 永不落地。username 不存在時仍要跑一次固定假 hash 的驗證，避免用回應時間差判斷帳號是否存在。登入失敗次數在記憶體內計數即可。

匿名使用者仍然可以完成語音輸入、需求解析與搜尋 — 這張票不改變那條路徑。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 註冊、登入、登出、以及「用目前 token 取回自己身分」四條路由可用；受保護路由靠共用 middleware 檢查 token 未撤銷且未過期
- [ ] username 規則（英數字、`_`、`-`，3–30 字元）與 password 長度在邊界檢查；username 以小寫儲存與比對；重複註冊回 409
- [ ] 錯誤訊息不洩漏資料庫或雜湊細節；username 不存在與 password 錯誤的回應時間沒有明顯差異
- [ ] password 只以 Argon2id hash 保存；token 只以 sha256 保存；瀏覽器端不保存 username／password，也不使用 Cookie
- [ ] 前端有註冊／登入入口與登出；登入後重新整理同一分頁仍是登入狀態
- [ ] token 過期後呼叫受保護功能回 401，前端清掉 token、回到匿名狀態並提示重新登入
- [ ] 註冊或登入時若帳號資料那列不存在就一併建立並回傳，前端一次呼叫就能還原狀態
- [ ] 帳號測試在沒有資料庫連線設定時自動跳過，不讓其他測試連帶失敗
