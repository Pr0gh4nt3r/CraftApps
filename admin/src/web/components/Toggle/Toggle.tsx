import type { ReactNode } from 'react';

export function Toggle({
  checked,
  onChange,
  children,
  label,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: ReactNode;
  /** Name for screen readers when there is no visible text */
  label?: string;
  className?: string;
}) {
  return (
    <label className={`toggle ${className ?? ''}`}>
      <input type="checkbox" checked={checked} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
      {children && <span>{children}</span>}
    </label>
  );
}
