import React from 'react';
import type { BrushPreset } from '../types/brush';

export function BrandVoxelMark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M16 3L28 9.5V22.5L16 29L4 22.5V9.5L16 3Z"
        stroke="#BEF264"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M16 3L28 9.5L16 16L4 9.5L16 3Z"
        fill="#BEF264"
        fillOpacity="0.22"
      />
      <path
        d="M16 16V29M16 16L28 9.5M16 16L4 9.5"
        stroke="#BEF264"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="2.25" fill="#FFFFFF" />
    </svg>
  );
}

export function ShapeVectorIcon({
  shape,
  active = false,
  className = 'w-5 h-5',
}: {
  shape: string;
  active?: boolean;
  className?: string;
}) {
  const strokeColor = active ? '#000000' : '#BEF264';
  const secondaryColor = active ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';

  switch (shape) {
    case 'sphere':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" stroke={strokeColor} strokeWidth="1.75" />
          <ellipse cx="12" cy="12" rx="8.5" ry="3.2" stroke={secondaryColor} strokeWidth="1.25" />
          <ellipse cx="12" cy="12" rx="3.2" ry="8.5" stroke={secondaryColor} strokeWidth="1.25" />
        </svg>
      );
    case 'cube':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M12 3L20 7.5V16.5L12 21L4 16.5V7.5L12 3Z"
            stroke={strokeColor}
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
          <path
            d="M12 12V21M12 12L20 7.5M12 12L4 7.5"
            stroke={secondaryColor}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'cylinder':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <ellipse cx="12" cy="6.5" rx="7" ry="2.75" stroke={strokeColor} strokeWidth="1.75" />
          <path
            d="M5 6.5V17.5C5 19.02 8.13 20.25 12 20.25C15.87 20.25 19 19.02 19 17.5V6.5"
            stroke={strokeColor}
            strokeWidth="1.75"
          />
          <path
            d="M5 12C5 13.52 8.13 14.75 12 14.75C15.87 14.75 19 13.52 19 12"
            stroke={secondaryColor}
            strokeWidth="1.25"
            strokeDasharray="2 2"
          />
        </svg>
      );
    case 'dome':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M4 16C4 10.48 7.58 6 12 6C16.42 6 20 10.48 20 16"
            stroke={strokeColor}
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <ellipse cx="12" cy="16" rx="8" ry="2.6" stroke={strokeColor} strokeWidth="1.75" />
          <path d="M12 6V18.6" stroke={secondaryColor} strokeWidth="1.25" strokeDasharray="2 2" />
        </svg>
      );
    case 'cone':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M12 4L19 17.5" stroke={strokeColor} strokeWidth="1.75" strokeLinecap="round" />
          <path d="M12 4L5 17.5" stroke={strokeColor} strokeWidth="1.75" strokeLinecap="round" />
          <ellipse cx="12" cy="17.5" rx="7" ry="2.5" stroke={strokeColor} strokeWidth="1.75" />
          <path d="M12 4V19.5" stroke={secondaryColor} strokeWidth="1.25" strokeDasharray="2 2" />
        </svg>
      );
    case 'pyramid':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M12 4L20.5 16.5L12 20.5L3.5 16.5L12 4Z"
            stroke={strokeColor}
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
          <path d="M12 4V20.5" stroke={secondaryColor} strokeWidth="1.4" />
        </svg>
      );
    case 'disc':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <ellipse cx="12" cy="11" rx="8.5" ry="3.5" stroke={strokeColor} strokeWidth="1.75" />
          <path
            d="M3.5 11V14C3.5 15.93 7.31 17.5 12 17.5C16.69 17.5 20.5 15.93 20.5 14V11"
            stroke={strokeColor}
            strokeWidth="1.75"
          />
        </svg>
      );
    case 'line':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M5 19L19 5" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" />
          <circle cx="5" cy="19" r="2.2" fill={strokeColor} />
          <circle cx="19" cy="5" r="2.2" fill={strokeColor} />
          <circle cx="12" cy="12" r="1.6" fill={secondaryColor} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect
            x="4.5"
            y="4.5"
            width="15"
            height="15"
            rx="2"
            stroke={strokeColor}
            strokeWidth="1.75"
            strokeDasharray="3 2"
          />
          <circle cx="4.5" cy="4.5" r="1.75" fill={strokeColor} />
          <circle cx="19.5" cy="19.5" r="1.75" fill={strokeColor} />
        </svg>
      );
  }
}

export function PresetVectorIcon({
  iconKey,
  className = 'w-5 h-5',
}: {
  iconKey: BrushPreset['iconKey'];
  className?: string;
}) {
  switch (iconKey) {
    case 'mountain':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M3 19L9.5 7L14 14.5L16.5 11L21 19H3Z"
            stroke="#BEF264"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'cavern':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M3 19H21V11C21 6.58 16.97 4 12 4C7.03 4 3 6.58 3 11V19Z"
            stroke="#BEF264"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
          <path
            d="M8.5 19V14C8.5 11.79 10.07 10 12 10C13.93 10 15.5 11.79 15.5 14V19"
            stroke="#FFFFFF"
            strokeWidth="1.5"
          />
        </svg>
      );
    case 'river':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M4 7C7.5 7 7.5 10 11 10C14.5 10 14.5 7 18 7"
            stroke="#BEF264"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <path
            d="M3 13C6.5 13 6.5 16 10 16C13.5 16 13.5 13 17 13C18.8 13 19.8 14 21 14.5"
            stroke="#FFFFFF"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <path
            d="M5 18.5C8 18.5 8.5 20 12 20C15.5 20 16 18.5 19.5 18.5"
            stroke="#BEF264"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'dome':
      return <ShapeVectorIcon shape="dome" className={className} />;
    case 'wall':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="1.5" stroke="#BEF264" strokeWidth="1.75" />
          <path d="M3 10H21M3 14.5H21M9 5V10M15 10V14.5M9 14.5V19" stroke="#FFFFFF" strokeWidth="1.4" />
        </svg>
      );
    case 'scatter':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="4" y="4" width="4" height="4" rx="1" fill="#BEF264" />
          <rect x="14" y="5" width="4" height="4" rx="1" stroke="#FFFFFF" strokeWidth="1.5" />
          <rect x="9" y="11" width="4" height="4" rx="1" fill="#BEF264" />
          <rect x="16" y="14" width="4" height="4" rx="1" fill="#BEF264" />
          <rect x="4" y="15" width="4" height="4" rx="1" stroke="#FFFFFF" strokeWidth="1.5" />
        </svg>
      );
    case 'spire':
      return <ShapeVectorIcon shape="cone" className={className} />;
    case 'shell':
      return <ShapeVectorIcon shape="sphere" className={className} />;
  }
}
