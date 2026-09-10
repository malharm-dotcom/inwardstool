import type { CSSProperties } from "react";

const paths = {
  box: "M21 8l-9 5-9-5m9 5v9M3 7l9-5 9 5v10l-9 5-9-5V7Zm4-2 10 6",
  scan: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 7v10m3-10v10m4-10v10m3-10v10",
  grid: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  plus: "M12 5v14M5 12h14",
  check: "m5 12 4 4L19 6",
  download: "M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5",
  search: "M21 21l-6-6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  help: "M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  logout: "M9 4H4v16h5m-1-8h13m-5-5 5 5-5 5",
  camera: "M8 5l2-2h4l2 2h5v15H3V5h5Zm8 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  back: "M19 12H5m6-6-6 6 6 6",
  edit: "m15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z",
  close: "m6 6 12 12M6 18 18 6",
  lock: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5V10Zm7 4v3",
};
export default function Icon({
  name,
  size = 20,
  style,
}: {
  name: keyof typeof paths;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
