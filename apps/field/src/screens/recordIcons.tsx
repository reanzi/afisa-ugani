/**
 * Pictograms for record types and sections: 24px grid, 2px strokes, rounded
 * ends, drawn to read at a glance on a small screen in sunlight.
 */
import type { ReactNode } from "react";
import type { Section } from "@afisa/shared";

const svg = (children: ReactNode, size = 24) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const RECORD: Record<string, ReactNode> = {
  livestock_treatment: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
  vaccination: (
    <>
      <path d="m18 2 4 4M17 7l3-3" />
      <path d="M19 9 8.7 19.3a1 1 0 0 1-1.4 0l-2.6-2.6a1 1 0 0 1 0-1.4L15 5" />
      <path d="m9 11 4 4M5 19l-3 3M14 4l6 6" />
    </>
  ),
  livestock_service: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" />
    </>
  ),
  slaughter: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3M8 11l2 2 4-4" />
    </>
  ),
  livestock_products: (
    <>
      <path d="M8 2h8M9 2v3L7 8v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V8l-2-3V2" />
      <path d="M7 13h10" />
    </>
  ),
  pest_outbreak: (
    <>
      <rect x="8" y="6" width="8" height="14" rx="4" />
      <path d="M12 20v-9M9.5 3l1.2 2.2M14.5 3l-1.2 2.2M4 9.5l4 1M4 15h4M4.5 20.5l3.8-2M20 9.5l-4 1M20 15h-4M19.5 20.5l-3.8-2" />
    </>
  ),
  fertilizer: (
    <>
      <path d="M7 7h10l2 13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
      <path d="M7 7 6 4h12l-1 3" />
      <path d="M12 18v-4M12 14c0-1.7 1.3-3 3-3 0 1.7-1.3 3-3 3zM12 15.5c0-1.4-1.1-2.5-2.5-2.5 0 1.4 1.1 2.5 2.5 2.5z" />
    </>
  ),
  rainfall: (
    <>
      <path d="M20 15.5A4.5 4.5 0 0 0 17.5 7a6 6 0 0 0-11.4 1.8A4 4 0 0 0 6 16.5" />
      <path d="M8 19v2M12 17v4M16 19v2" />
    </>
  ),
  fish_farming: (
    <>
      <path d="M20.5 11c-2-3.3-5-5-8.5-5s-5.7 1.8-7 5c1.3 3.2 3.8 5 7 5s6.5-1.7 8.5-5z" />
      <path d="M5 11 2 8v6zM15.5 10h.01" />
      <path d="M3 20c2-1 4-1 6 0s4 1 6 0 4-1 6 0" />
    </>
  ),
  training: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M12 16v4M8 20h8M7 8.5h6M7 11.5h4" />
    </>
  ),
  price: (
    <>
      <path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </>
  ),
  event: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  visitor: (
    <>
      <circle cx="9" cy="7" r="3.5" />
      <path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5M19 8v6M16 11h6" />
    </>
  ),
  photo: (
    <>
      <path d="M14.5 4h-5L7.5 6.5H4a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8.5a2 2 0 0 0-2-2h-3.5z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  activity: (
    <>
      <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
      <path d="m15 5 4 4" />
    </>
  ),
};

const SECTION: Record<Section, ReactNode> = {
  kilimo: (
    <>
      <path d="M12 21v-9" />
      <path d="M12 12c0-4-3-7-8-7 0 4 3 7 8 7z" />
      <path d="M12 10c0-3.5 2.5-6 7-6 0 3.5-2.5 6-7 6z" />
      <path d="M6 21h12" />
    </>
  ),
  mifugo: (
    <>
      <path d="M7 7 3 5l1 4M17 7l4-2-1 4" />
      <path d="M7 7h10l1.2 6-1.9 6.2A2 2 0 0 1 14.4 20.6H9.6a2 2 0 0 1-1.9-1.4L5.8 13z" />
      <path d="M9.5 11h.01M14.5 11h.01M10.5 17h.01M13.5 17h.01" />
    </>
  ),
  uvuvi: RECORD.fish_farming,
};

export function RecordIcon({ type, size }: { type: string; size?: number }) {
  return svg(RECORD[type] ?? RECORD.activity, size);
}

export function SectionIcon({ section, size }: { section: Section; size?: number }) {
  return svg(SECTION[section], size);
}
