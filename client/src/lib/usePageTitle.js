import { useEffect } from "react";

/** Sets the tab title and moves focus to the page heading, so screen readers announce route changes. */
export default function usePageTitle(title) {
  useEffect(() => {
    document.title = `${title} · StockMan`;
    document.querySelector("main h1")?.focus({ preventScroll: true });
  }, [title]);
}
