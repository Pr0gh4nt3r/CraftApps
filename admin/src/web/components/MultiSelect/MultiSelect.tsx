import { useEffect, useRef, useState } from 'react';

export interface MultiSelectOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  /** Name of the control, for screen readers */
  label: string;
  options: MultiSelectOption<T>[];
  selected: T[];
  onChange: (selected: T[]) => void;
  /** Text of the row that ticks or unticks everything – and of the button when all are ticked */
  allLabel: string;
  /** Text of the button when nothing is ticked */
  noneLabel: string;
  /** Text of the button when several but not all are ticked */
  someLabel: (count: number, total: number) => string;
  /** At least this many stay ticked – their checkboxes can't be unticked then */
  minSelected?: number;
  /** E.g. "narrow" for a button that only fits short summaries */
  className?: string;
}

/**
 * Drop-down list with a checkbox per option, like a select where each entry can be ticked and
 * unticked. Stays open while ticking; a click outside or Escape closes it.
 */
export function MultiSelect<T extends string>({
  label,
  options,
  selected,
  onChange,
  allLabel,
  noneLabel,
  someLabel,
  minSelected = 0,
  className,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const allRef = useRef<HTMLInputElement>(null);

  const all = options.every((o) => selected.includes(o.value));
  const none = !options.some((o) => selected.includes(o.value));
  // "All" shows a dash while only some are ticked
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = !all && !none;
  });

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const ticked = options.filter((o) => selected.includes(o.value));
  const atMinimum = ticked.length <= minSelected;
  const summary = all ? allLabel : none ? noneLabel : ticked.length === 1 ? ticked[0].label : someLabel(ticked.length, options.length);
  // Keeps the order of the options, whatever order they were ticked in
  const toggle = (value: T) =>
    onChange(options.map((o) => o.value).filter((v) => (v === value ? !selected.includes(v) : selected.includes(v))));

  return (
    <div className={className ? `multi-select ${className}` : 'multi-select'} ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="multi-select-button"
        aria-label={`${label}: ${summary}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {summary}
      </button>
      {open && (
        <div className="multi-select-panel" role="group" aria-label={label}>
          <label className="multi-select-option all">
            <input
              ref={allRef}
              type="checkbox"
              checked={all}
              // Unticking all would go below the minimum
              disabled={all && minSelected > 0}
              onChange={() => onChange(all ? [] : options.map((o) => o.value))}
            />
            {allLabel}
          </label>
          {options.map((o) => (
            <label key={o.value} className="multi-select-option">
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                disabled={atMinimum && selected.includes(o.value)}
                onChange={() => toggle(o.value)}
              />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
