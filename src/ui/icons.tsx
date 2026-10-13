import type { JSX } from 'preact';

// Hand-drawn 24px stroke icons. Decorative by default (aria-hidden); pair with visible text or aria-label on the parent.
const P = {
  today: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.6" /></>,
  foods: <><path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0z" /><path d="M8.5 4.5c0 1.3 1 1.4 1 2.8M13.5 4.5c0 1.3 1 1.4 1 2.8" /></>,
  trends: <path d="M5 20v-8M12 20V5M19 20v-5M3 20h18" />,
  settings: <><path d="M4 7h8M18 7h2M4 17h2M12 17h8" /><circle cx="15" cy="7" r="2.4" /><circle cx="9" cy="17" r="2.4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  drop: <path d="M12 3.5c3.2 4 5.5 7.2 5.5 10a5.5 5.5 0 0 1-11 0c0-2.8 2.3-6 5.5-10z" />,
  shutter: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="5" /></>,
  image: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M5 17l4.5-4.5 3 3 2.5-2.5L19.5 17" /></>,
  bolt: <path d="M13 3L5.5 13H11l-1 8 7.5-10H12z" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  back: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  down: <path d="M6 9l6 6 6-6" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  star: <path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.8l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />,
  barcode: <path d="M4 5v14M7.5 5v14M11 5v14M14 5v14M17.5 5v14M20 5v14" />,
  camera: <><path d="M4 8.5h3l1.5-2.5h7L17 8.5h3v10H4z" /><circle cx="12" cy="13.2" r="3.2" /></>,
  trash: <path d="M5 7h14M10 7V4.5h4V7M7 7l.8 12.5h8.4L17 7" />,
  edit: <path d="M5 19l.8-3.8L16 5l3 3L8.8 18.2zM14 7l3 3" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  estimate: <path d="M4 12c2.7-3.5 5.3 3.5 8 0s5.3 3.5 8 0" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></>,
  lock: <><path d="M6 11h12v9H6z" /><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" /></>,
  alert: <><path d="M12 4l9 16H3z" /><path d="M12 10v4.5M12 17.5v.01" /></>,
  archive: <><path d="M4 6h16v3H4zM5.5 9v10h13V9" /><path d="M10 13h4" /></>,
  recipe: <><path d="M6 4h12v16H6z" /><path d="M9 8.5h6M9 12h6M9 15.5h3.5" /></>,
};
export type IconName = keyof typeof P;

export function Icon({ name, size = 22, filled = false, ...rest }: { name: IconName; size?: number; filled?: boolean } & JSX.SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {P[name]}
    </svg>
  );
}

/** Wordmark glyph: a thali plate with three katori. */
export function Mark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="22" fill="var(--forest)" />
      <circle cx="24" cy="24" r="17" fill="none" stroke="var(--on-forest)" stroke-opacity=".5" stroke-width="1.5" />
      <circle cx="24" cy="15.5" r="5" fill="var(--turmeric)" />
      <circle cx="16.5" cy="28.5" r="5" fill="var(--on-forest)" fill-opacity=".92" />
      <circle cx="31.5" cy="28.5" r="5" fill="var(--on-forest)" fill-opacity=".62" />
    </svg>
  );
}
