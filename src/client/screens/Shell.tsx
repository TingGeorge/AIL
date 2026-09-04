import type { ReactNode } from "react";
import { back, go } from "../router.ts";

// Page frame: header with back or wordmark, list counter, settings gear, tag.
export function Shell({ surface, title, listCount, children, home, survival }: { surface: "black" | "white"; title?: string; listCount: number; children: ReactNode; home?: boolean; survival?: boolean }) {
  return (
    <main data-surface={surface} data-survival={survival ? "1" : undefined}>
      <header className="bar rise">
        {home ? (
          <span className="wordmark">ALL in life<small>生活全包</small></span>
        ) : (
          <button className="back" onClick={back} aria-label="返回">← <span>{title ?? "返回"}</span></button>
        )}
        <span className="bar-right">
          <button className="listbtn" onClick={() => go("/list")} aria-label={`清單，${listCount} 筆`}>清單 <b>{listCount}</b></button>
          <button className="gear" onClick={() => go("/settings")} aria-label="設定">⚙</button>
          <span className="tag">{survival ? "生存" : "圓山區"}</span>
        </span>
      </header>
      {children}
    </main>
  );
}
