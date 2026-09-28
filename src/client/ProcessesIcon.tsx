/**
 * Processes guide / tab icon: lightning bolt.
 *
 * Reads clearly at guide sizes (22–26px); literal "process power", same
 * stroke weight as the long-horizon horizon and slot-health ECG siblings.
 * currentColor rides the theme.
 */
interface GuideIconProps {
  size?: number
  className?: string
}

export function ProcessesGuideIcon({ size = 26, className }: GuideIconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path
        d="M15.5 3.5 L8 15.5 H13 L12 24.5 L20 12.5 H15 Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
