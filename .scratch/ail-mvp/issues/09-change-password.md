# 09: 修改密碼與忘記密碼

**What to build:** 已登入的使用者可以在驗證目前 password 後改成新的；改完之後該帳號其他既有的 session 全部撤銷，需要重新登入。忘記密碼只顯示平台支援 Email，不在 App 內自動重設，也不會要求使用者用 Email 傳送明文 password。

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] 修改密碼需要帶目前 password；目前 password 錯誤時不改動任何資料
- [ ] 新 password 沿用註冊的長度規則；只保存新的 hash
- [ ] 修改成功後該使用者所有未撤銷的 session 被撤銷，前端回到登入畫面
- [ ] 忘記密碼只顯示支援 Email，畫面上沒有任何自動重設或寄送 password 的入口
