import type { ReactNode } from 'react';

const paths = {
  mark: <><path d="M2 3h7v7H2zM11 3h7v7h-7zM2 12h7v7H2z" /><path d="M11 12h7v7h-7z" opacity=".45" /></>,
  map: <><path d="M3 5.5 7.7 3l4.6 2.5L17 3v11.5L12.3 17l-4.6-2.5L3 17z" /><path d="M7.7 3v11.5m4.6-9V17" /></>,
  history: <><rect x="3" y="3" width="14" height="14" rx="2" /><path d="M3 7.5h14M3 12h14M7.5 7.5V17" /></>,
  chart: <><path d="M3 3v14h14M5.5 12l4-4 3 2.5 4-5" /></>,
  left: <path d="m12 5-5 5 5 5" />,
  right: <path d="m8 5 5 5-5 5" />,
  down: <path d="m5 8 5 5 5-5" />,
  arrow: <path d="M4 10h11m-4-4 4 4-4 4" />,
  shuffle: <><path d="M3 5h2c4 0 6 10 10 10h2m-3-3 3 3-3 3M3 15h2c1.5 0 2.6-1.4 3.6-3M11.4 8c1-1.6 2.1-3 3.6-3h2m-3-3 3 3-3 3" /></>,
  rules: <><path d="M3 5h14M3 10h14M3 15h14" /><path d="M7 3v4m6 1v4m-4 1v4" strokeWidth="2.4" /></>,
  play: <path d="m7 4 9 6-9 6z" />,
  pause: <path d="M7 4v12m6-12v12" />,
  restart: <><path d="M4 8a6 6 0 1 1 0 5M4 4v4h4" /></>,
  download: <path d="M10 3v10m-4-4 4 4 4-4M4 14v3h12v-3" />,
  stats: <path d="M3 17h14M5 14V9m5 5V4m5 10V7" />,
  link: <><path d="m8 12 4-4M7.5 14.5l-1 1a3 3 0 0 1-4-4l3-3a3 3 0 0 1 4 0m1-3 1-1a3 3 0 0 1 4 4l-3 3a3 3 0 0 1-4 0" /></>,
  check: <path d="m4 10 4 4 8-8" />,
  close: <path d="m5 5 10 10m0-10L5 15" />,
  bookmark: <path d="M5.5 3h9v14L10 13.5 5.5 17z" />,
  search: <><circle cx="8.5" cy="8.5" r="4.5" /><path d="m12 12 4 4" /></>,
} satisfies Record<string, ReactNode>;

export function Icon({ name, size = 17 }: { name: keyof typeof paths; size?: number }) {
  const mark = name === 'mark';
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" fill={mark ? 'currentColor' : 'none'}
    stroke={mark ? 'none' : 'currentColor'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
