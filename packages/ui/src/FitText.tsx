/**
 * Text that must stay on one line: if it does not fit, the font shrinks a
 * little (down to `minScale`), and only then is it cut with an ellipsis. The
 * full text is always in the tooltip.
 */
import { useLayoutEffect, useRef } from "react";

export function FitText({ text, className, minScale = 0.8 }: { text: string; className?: string; minScale?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = "";
      const base = parseFloat(getComputedStyle(el).fontSize);
      let scale = 1;
      while (el.scrollWidth > el.clientWidth + 0.5 && scale > minScale) {
        scale = Math.max(minScale, scale - 0.04);
        el.style.fontSize = `${(base * scale).toFixed(2)}px`;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el.parentElement ?? el);
    return () => ro.disconnect();
  }, [text, minScale]);

  return (
    <span ref={ref} className={`fit-text${className ? ` ${className}` : ""}`} title={text}>
      {text}
    </span>
  );
}
