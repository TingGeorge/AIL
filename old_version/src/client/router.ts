import { useEffect, useState } from "react";

// Hash routes so the phone's back button and a home-screen PWA both work without a server rewrite.
// "#/" | "#/confirm" | "#/search" | "#/results" | "#/results/<category>" | "#/card/<id>" | "#/list"
export const useHashRoute = () => {
  const read = () => decodeURIComponent(location.hash.replace(/^#/, "") || "/");
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
};

export const go = (path: string) => { location.hash = path; };
export const back = () => (history.length > 1 ? history.back() : go("/"));
