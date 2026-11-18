/**
 * Navigation icons drawn for this app: 24px grid, 2px strokes, rounded ends.
 * `active` fills the main shape so the selected tab reads at a glance in sun.
 */
type IconProps = { active?: boolean };

const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** Leo: the sun rising over planted rows. */
export function IconToday({ active }: IconProps) {
  return (
    <svg {...base}>
      <path d="M6.5 13a5.5 5.5 0 0 1 11 0" fill={active ? "currentColor" : "none"} />
      <path d="M12 3.5v2M4.6 6.6l1.4 1.4M19.4 6.6 18 8M2.5 13h2M19.5 13h2" />
      <path d="M3 16.5h18M5 20l2-3.5M12 20v-3.5M19 20l-2-3.5" />
    </svg>
  );
}

/** Shughuli: a field notebook with ticked lines. */
export function IconLog({ active }: IconProps) {
  return (
    <svg {...base}>
      <rect x="4.5" y="3" width="15" height="18" rx="2" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.18 : 0} />
      <path d="M8 3v18" />
      <path d="m11 9 1.3 1.3L15 7.6M11 15.5h5" />
    </svg>
  );
}

/** Ripoti: a form sheet with a table. */
export function IconReport({ active }: IconProps) {
  return (
    <svg {...base}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.18 : 0} />
      <path d="M14 3v5h5" />
      <path d="M8.5 12h7v5.5h-7zM8.5 14.75h7M12 12v5.5" />
    </svg>
  );
}

/** Mimi: an officer with an ID card. */
export function IconMe({ active }: IconProps) {
  return (
    <svg {...base}>
      <circle cx="12" cy="8" r="3.5" fill={active ? "currentColor" : "none"} />
      <path d="M5 20.5c.6-3.6 3.5-6 7-6s6.4 2.4 7 6" />
    </svg>
  );
}
