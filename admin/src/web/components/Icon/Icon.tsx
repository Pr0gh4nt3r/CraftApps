// An icon from src/assets/icons/ in the text color: the styles (_icon.scss) draw the file as a
// mask, so there is no SVG markup in the code. The start page uses the same classes.
export type IconName =
  | 'chevron-left'
  | 'chevron-right'
  | 'close'
  | 'grid'
  | 'info'
  | 'list'
  | 'logout'
  | 'monitor'
  | 'moon'
  | 'sun'
  | 'user';

export function Icon({ name }: { name: IconName }) {
  return <span className={`ui-icon ui-icon-${name}`} aria-hidden="true" />;
}
