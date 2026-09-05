import { useEffect } from "react";
import { comparableTotal, groupTotal, money, type Rec, type Team as T } from "../../shared/records.ts";
import { Shell } from "./Shell.tsx";

// 揪團：join code, members as dots, per-person and new comparable total. No payment, no chat.
export function Team({ r, team, preview, joiners, join, share, listCount }: {
  r: Rec; team: T; preview: boolean; joiners: { name: string; color: string }[]; join: (m: { name: string; color: string }) => void; share: () => void; listCount: number;
}) {
  const offer = r.group_offer!;
  const n = team.members.length;
  const before = comparableTotal(r);
  const after = groupTotal(r, n);
  const reached = n >= offer.min_people;

  useEffect(() => {
    if (!preview) return;
    // Preview: two people "join" a few seconds later. Real sync needs a server.
    const t = joiners.filter((j) => !team.members.some((m) => m.name === j.name)).map((j, i) => window.setTimeout(() => join(j), 1800 + i * 1600));
    return () => t.forEach(clearTimeout);
  }, [preview]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Shell surface="black" title={r.title} listCount={listCount}>
      <section className="rise">
        <p className="eyebrow">TEAM · 揪團</p>
        <h1 className="display"><span className="outline">一起</span><br /><span className="fill">省更多</span></h1>
        <p className="lead">{r.title} · {r.provider}</p>
        <p className="lead quote">{offer.note}</p>
      </section>

      <section className="rise">
        <p className="eyebrow">CODE · 加入代碼</p>
        <div className="code">{team.code}</div>
        <button className="primary" onClick={share}>分享代碼</button>
        {preview && <p className="note">示範：幾秒後會有兩位示範成員加入。</p>}
      </section>

      <section className="rise">
        <p className="eyebrow">MEMBERS · 成員 <b className="count">{n} / {offer.min_people}</b></p>
        <div className="members">
          {team.members.map((m) => <span key={m.name} className="member rise"><span className="avatar" style={{ background: m.color }}>{m.name.slice(0, 1)}</span>{m.name}</span>)}
          {Array.from({ length: Math.max(0, offer.min_people - n) }).map((_, i) => <span key={i} className="member ghost"><span className="avatar" />還差 1</span>)}
        </div>
        <div className="meter"><span style={{ width: `${Math.min(100, (n / offer.min_people) * 100)}%` }} /><b>{reached ? "成團" : `${n}/${offer.min_people}`}</b></div>
      </section>

      <section className="rise">
        <p className="eyebrow">COST · 成本</p>
        <div className="rows">
          <div className="row"><span className="idx">01</span><span className="row-label">單獨</span><span className="value">{before === null ? "—" : money(before)}</span></div>
          <div className="row"><span className="idx">02</span><span className="row-label">成團後總計</span><span className="value">{after === null ? "—" : money(after)}</span></div>
          <div className="row total"><span className="idx">=</span><span className="row-label">每人</span>
            <span className="value">{after === null ? "—" : reached ? <span className="saving">{money(Math.round(after / n))}</span> : `${money(Math.round((before ?? 0) / Math.max(1, n)))}（未成團）`}</span></div>
        </div>
        <p className="note">優惠只在成員數達到來源列出的條件時套用。不代付、不下單；請以店家為準。</p>
      </section>
    </Shell>
  );
}
