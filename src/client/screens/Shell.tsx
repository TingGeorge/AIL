import type { ReactNode } from "react";
import { back, go } from "../router.ts";

// Page frame: header with back or wordmark, list counter, tag.
export function Shell({ surface, title, listCount, children, home }: { surface: "black" | "white"; title?: string; listCount: number; children: ReactNode; home?: boolean }) {
  return (
    <main data-surface={surface}>
      <header className="bar rise">
        {home ? (
          <span className="wordmark">ALL in life<small>生活全包</small></span>
        ) : (
          <button className="back" onClick={back} aria-label="返回">← <span>{title ?? "返回"}</span></button>
        )}
        <span className="bar-right">
          <button className="listbtn" onClick={() => go("/list")} aria-label={`清單，${listCount} 筆`}>清單 <b>{listCount}</b></button>
          <span className="tag">圓山區</span>
        </span>
      </header>
      {children}
    </main>
  );
}
