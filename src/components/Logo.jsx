import { useId } from 'react'

/** The CodeEasy mark: an open ring wrapping </>, with two stacked bars. */
export default function Logo({ size = 24, className }) {
  // Instances share a page, so gradient ids must be unique per render.
  const uid = useId()
  const arc = `arc-${uid}`
  const bar = `bar-${uid}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={arc} x1="6" y1="56" x2="50" y2="8" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b2fe8" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id={bar} x1="43" y1="24" x2="60" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c3aed" />
          <stop offset="1" stopColor="#3b5bf5" />
        </linearGradient>
      </defs>

      <path
        d="M42 12 H30 A20 20 0 0 0 30 52 H42"
        stroke={`url(#${arc})`}
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="43" y="24" width="17" height="9" rx="4.5" fill={`url(#${bar})`} />
      <rect x="43" y="37" width="17" height="9" rx="4.5" fill={`url(#${bar})`} />

      <path
        d="M26 24.5 L19.5 32 L26 39.5"
        stroke="#fff"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M35 24.5 L41.5 32 L35 39.5"
        stroke="#fff"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M33.5 22.5 L27.5 41.5" stroke="#22d3ee" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}
