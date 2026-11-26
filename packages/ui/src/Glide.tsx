/**
 * A highlight that slides to the active item of a tab row, segmented switch
 * or side menu, instead of jumping. Put <Glide /> as the last child of the
 * container; it finds the active child itself (aria-selected, aria-pressed,
 * aria-current="page" or .active) and follows it when that changes or when
 * the items resize (language switch, font load, window resize).
 *
 * `target` picks a part inside the active child to cover (e.g. ".tab-icon").
 * The first placement doesn't animate; later moves do, except with
 * prefers-reduced-motion (handled in CSS).
 */
import { useLayoutEffect, useRef } from "react";

const ACTIVE = '[aria-selected="true"],[aria-pressed="true"],[aria-current="page"],.active';

export function Glide({ target }: { target?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    box.classList.add("has-glide");
    let frame = 0;

    const place = () => {
      const item = Array.from(box.children).find((c) => c !== el && c.matches(ACTIVE)) as HTMLElement | undefined;
      const part = item && target ? (item.querySelector(target) as HTMLElement | null) ?? item : item;
      if (!part || part.offsetParent === null) {
        el.style.opacity = "0";
        return;
      }
      const b = box.getBoundingClientRect();
      const r = part.getBoundingClientRect();
      el.style.width = `${r.width}px`;
      el.style.height = `${r.height}px`;
      el.style.transform = `translate(${r.left - b.left - box.clientLeft + box.scrollLeft}px, ${r.top - b.top - box.clientTop + box.scrollTop}px)`;
      el.style.borderRadius = getComputedStyle(part).borderRadius;
      el.style.opacity = "1";
      // Turn the animation on only after the first placement has painted.
      if (!el.dataset.ready) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => (frame = requestAnimationFrame(() => (el.dataset.ready = "1"))));
      }
    };

    const ro = new ResizeObserver(() => place());
    const watch = () => {
      ro.observe(box);
      for (const c of Array.from(box.children)) if (c !== el) ro.observe(c);
    };
    const mo = new MutationObserver(() => {
      watch();
      place();
    });
    mo.observe(box, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-selected", "aria-pressed", "aria-current", "class"] });
    watch();
    place();

    return () => {
      mo.disconnect();
      ro.disconnect();
      cancelAnimationFrame(frame);
      box.classList.remove("has-glide");
    };
  }, [target]);

  return <span ref={ref} className="glide" aria-hidden="true" />;
}
