// Line icons on a 24 grid, one stroke weight. Drawn here rather than borrowed so every icon in the
// app shares the same weight and corner; emoji are never used as icons.
const PATHS = {
  back: <path d="M15 5l-7 7 7 7" />,
  chevron: <path d="M9.5 5.5L16 12l-6.5 6.5" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  upload: (
    <>
      <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z" />
      <path d="M14 3.5V8h4.5" />
      <path d="M12 17v-5.5M9.5 14L12 11.5l2.5 2.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  browse: (
    <>
      <path d="M4 6a2 2 0 0 1 2-2h5v16H6a2 2 0 0 1-2-2z" />
      <path d="M20 6a2 2 0 0 0-2-2h-5v16h5a2 2 0 0 0 2-2z" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c1.2-3.4 3.9-5 7-5s5.8 1.6 7 5" />
    </>
  ),
  phone: (
    <path d="M6.5 4h2.8l1.5 4.2-2 1.3a11 11 0 0 0 5.7 5.7l1.3-2 4.2 1.5v2.8a1.5 1.5 0 0 1-1.6 1.5A15 15 0 0 1 5 5.6 1.5 1.5 0 0 1 6.5 4z" />
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
    </>
  ),
  external: <path d="M14 5h5v5M19 5l-7.5 7.5M17 13.5V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4.5" />,
  target: (
    <>
      <path d="M12 4.5a7.5 7.5 0 1 1-7.39 6.2" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
    </>
  ),
  plan: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <path d="M6 8v8M11 6h8M11 18h8M11 12h5" />
    </>
  ),
  award: (
    <>
      <circle cx="12" cy="9" r="5" />
      <path d="M9 13.2L7.5 20l4.5-2.3 4.5 2.3-1.5-6.8" />
    </>
  ),
  school: (
    <>
      <path d="M2.5 9L12 4l9.5 5L12 14z" />
      <path d="M6.5 11.2V16c1.6 1.4 3.4 2 5.5 2s3.9-.6 5.5-2v-4.8" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.4 2.4 2.4 13.6 0 16M12 4c-2.4 2.4-2.4 13.6 0 16" />
    </>
  ),
  restart: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.5 4.5v3.8h3.8" />
    </>
  ),
  seat: (
    <>
      <path d="M7 11V6.5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2V11" />
      <path d="M5 11h14v4H5z" />
      <path d="M7 15v4.5M17 15v4.5" />
    </>
  ),
  compare: (
    <>
      <path d="M7 4.5v15M17 4.5v15" />
      <path d="M4 8l3-3.5L10 8M14 16l3 3.5 3-3.5" />
    </>
  ),
  share: (
    <>
      <path d="M12 14.5V4M8 7.5L12 3.5l4 4" />
      <path d="M8.5 10.5H7a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5.5a2 2 0 0 0-2-2h-1.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.2l2.6 2.6" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </>
  ),
  bell: (
    <>
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  more: <path d="M5.5 12h.01M12 12h.01M18.5 12h.01" strokeWidth={3} />,
  signout: (
    <>
      <path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14" />
      <path d="M10 16l-4-4 4-4M6 12h9" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  down: <path d="M6 9.5l6 6 6-6" />,
  layers: (
    <>
      <path d="M12 4l8.5 4.5L12 13 3.5 8.5z" />
      <path d="M3.5 12.5L12 17l8.5-4.5" />
      <path d="M3.5 16.5L12 21l8.5-4.5" />
    </>
  ),
  spark: <path d="M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9-1.9 5.6-1.9-5.6-5.6-1.9 5.6-1.9z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
    </>
  ),
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
  device: (
    <>
      <rect x="3.5" y="5" width="17" height="11.5" rx="2" />
      <path d="M9 20h6M12 16.5V20" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
      <path d="M4 9.5h16M8 3.5v3M16 3.5v3" />
    </>
  ),
  table: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
      <path d="M4 10h16M9.5 5v14" />
    </>
  ),
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 22, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
