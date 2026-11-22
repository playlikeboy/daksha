import type { SVGProps } from "react";

// One small set of line icons, drawn on a 24px grid with a 2px round stroke so
// they all match. They are decoration: the words next to them carry the meaning.
type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const PenIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
    <path d="m13.5 6.5 4 4" />
  </Icon>
);

export const AskIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.1A8 8 0 1 1 20 12Z" />
    <path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.4v.3" />
    <path d="M12 16.5h.01" />
  </Icon>
);

export const EyeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const MicIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
    <path d="M12 17.5V21" />
  </Icon>
);

export const PlugIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 3v4M15 3v4" />
    <path d="M6.5 7h11v3.5a5.5 5.5 0 0 1-11 0V7Z" />
    <path d="M12 16v5" />
  </Icon>
);

export const BellIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
    <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
  </Icon>
);

export const ImageIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m20.5 16-4.5-4.5L7 19.5" />
  </Icon>
);

export const KeyIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="m11 12 8.5-8.5M16.5 6.5l2.5 2.5M14 9l2 2" />
  </Icon>
);

export const PageIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3.5h8l4 4v13H6v-17Z" />
    <path d="M14 3.5v4h4M9 12h6M9 16h4" />
  </Icon>
);

export const SourceIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 4.5h10.5L19 8v11.5H5v-15Z" />
    <path d="m8.5 13 2.3 2.3 4.7-4.8" />
  </Icon>
);

export const ArrowIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const PlayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 4.5v15l12-7.5-12-7.5Z" />
  </Icon>
);

export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
  </Icon>
);

export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
  </Icon>
);

export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const ShieldIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5 5 6v5.5c0 4.3 2.9 7.6 7 9 4.1-1.4 7-4.7 7-9V6l-7-2.5Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </Icon>
);

export const GiftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 10.5h15V20h-15zM3.5 7h17v3.5h-17zM12 7v13" />
    <path d="M12 7C10.5 4 7 3.5 7 5.8 7 7 9.5 7 12 7Zm0 0c1.5-3 5-3.5 5-1.2C17 7 14.5 7 12 7Z" />
  </Icon>
);

export const UploadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 16V4M7 8.5l5-5 5 5M5 20h14" />
  </Icon>
);

export const FaceIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9 10v.5M15 10v.5M8.5 14.5c1.9 2 5.1 2 7 0" />
  </Icon>
);

export const ChatIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 5.5h15v10h-9L6 19.5v-4H4.5v-10Z" />
  </Icon>
);

export const BriefcaseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 8h17v11h-17zM9 8V5.5h6V8M3.5 13h17" />
  </Icon>
);

export const HeartIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 19.5s-7.5-4.3-7.5-9.6A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.3c0 5.3-7.5 9.6-7.5 9.6Z" />
  </Icon>
);

export const FlowerIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8.5" r="2.5" />
    <path d="M12 6c-.8-3 3.2-3.4 2.4-.2M14.5 8.5c3-.8 3.4 3.2.2 2.4M12 11c.8 3-3.2 3.4-2.4.2M9.5 8.5c-3 .8-3.4-3.2-.2-2.4M12 11v9.5M12 17c-2-2.3-4.5-2.3-5.5-1.3 1.2 1.6 3.3 2.1 5.5 1.3Z" />
  </Icon>
);

export const GlobeIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.4 2.5 3.5 5.3 3.5 8.5s-1.1 6-3.5 8.5c-2.4-2.5-3.5-5.3-3.5-8.5S9.6 6 12 3.5Z" />
  </Icon>
);

export const ChartIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4.5v15h16" />
    <path d="m7.5 14.5 3.5-4 3 2.5 5-6" />
  </Icon>
);

export const BookIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 5.5c2.8-1 5.3-.7 7.5 1v13c-2.2-1.7-4.7-2-7.5-1v-13ZM19.5 5.5c-2.8-1-5.3-.7-7.5 1v13c2.2-1.7 4.7-2 7.5-1v-13Z" />
  </Icon>
);

export const WandIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4.5 19.5 9-9M14 4.5l1.2 2.3 2.3 1.2-2.3 1.2L14 11.5l-1.2-2.3-2.3-1.2 2.3-1.2L14 4.5Z" />
  </Icon>
);

export const StarMoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 15A7.5 7.5 0 0 1 9 5a7.5 7.5 0 1 0 10 10Z" />
    <path d="M17 3.5v3M15.5 5h3" />
  </Icon>
);
