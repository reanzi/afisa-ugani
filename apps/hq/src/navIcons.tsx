/** Side menu icons, drawn on the same 24px grid as the Field app's. */
import type { ReactNode } from "react";

const Svg = ({ children }: { children: ReactNode }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const NAV_ICONS = {
  maombi: (
    <Svg>
      <path d="M4 13.5 6.5 5h11l2.5 8.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20" />
    </Svg>
  ),
  ripoti: (
    <Svg>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </Svg>
  ),
  wanachama: (
    <Svg>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
    </Svg>
  ),
  maeneo: (
    <Svg>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </Svg>
  ),
  kumbukumbu: (
    <Svg>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" />
      <path d="M3.5 4v4.5H8M12 7.5V12l3 2" />
    </Svg>
  ),
  mipangilio: (
    <Svg>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </Svg>
  ),
  halmashauri: (
    <Svg>
      <path d="M3 21h18M5 21V10M19 21V10M9 21v-6h6v6M2.5 10 12 4l9.5 6z" />
    </Svg>
  ),
} as const;
