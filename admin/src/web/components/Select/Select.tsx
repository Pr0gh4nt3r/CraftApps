import type { SelectHTMLAttributes } from 'react';

/**
 * Drop-down for a single choice: the browser's select – keyboard and the pickers on phones as
 * usual – with the same arrow as MultiSelect. Takes everything a <select> takes.
 */
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={className ? `select ${className}` : 'select'}>
      <select {...props} />
    </span>
  );
}
