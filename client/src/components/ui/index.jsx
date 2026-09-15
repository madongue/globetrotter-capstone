/**
 * GlobeTrotter UI primitives.
 *
 * Small, unopinionated building blocks that every redesigned page composes
 * from. They carry no business logic and fetch nothing — a page decides what
 * a card means; these decide only how it looks and how it behaves for a
 * keyboard or a screen reader.
 *
 * All styling lives in ui.css and reads from design/tokens.css, so nothing
 * here declares a colour, radius or shadow inline.
 */
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './ui.css';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ button */

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  icon = false,
  loading = false,
  className,
  children,
  disabled,
  ...rest
}) {
  return (
    <button
      type="button"
      className={cx('gt-btn', `gt-btn--${variant}`, `gt-btn--${size}`,
        block && 'gt-btn--block', icon && 'gt-btn--icon', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className="gt-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------- card */

export function Card({ as: Tag = 'div', interactive = false, padded = false, className, children, ...rest }) {
  return (
    <Tag
      className={cx('gt-card', interactive && 'gt-card--interactive', padded && 'gt-card--pad', className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * The photograph at the top of a card.
 *
 * `contextual` marks an image that shows the surrounding city rather than this
 * place. The catalogue flags those with `image_is_contextual`, and the honest
 * thing is to label them — a generic city photo presented as a photograph of a
 * specific waterfall is a small lie the traveller only discovers on arrival.
 */
export function CardMedia({ src, alt = '', contextual = false, contextLabel = 'City photo', overlay, action }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="gt-card__media">
      {src && !failed ? (
        <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <div className="gt-skeleton" style={{ width: '100%', height: '100%', borderRadius: 0 }} aria-hidden="true" />
      )}
      {(overlay || contextual) && <div className="gt-card__scrim" />}
      {contextual && <span className="gt-card__contextual">{contextLabel}</span>}
      {action}
      {overlay && <div className="gt-card__overlay">{overlay}</div>}
    </div>
  );
}

export const CardBody  = ({ className, children, ...r }) => <div className={cx('gt-card__body', className)} {...r}>{children}</div>;
export const CardTitle = ({ className, children, ...r }) => <h3 className={cx('gt-card__title', className)} {...r}>{children}</h3>;
export const CardMeta  = ({ className, children, ...r }) => <p className={cx('gt-card__meta', className)} {...r}>{children}</p>;

/* -------------------------------------------------------------- chip/badge */

export function Chip({ active = false, onClick, className, children, ...rest }) {
  // A chip that filters is a toggle button; one that only labels is not
  // interactive and should not be announced as a control.
  if (!onClick) {
    return <span className={cx('gt-chip', 'gt-chip--static', active && 'gt-chip--active', className)} {...rest}>{children}</span>;
  }
  return (
    <button type="button" className={cx('gt-chip', className)} aria-pressed={active} onClick={onClick} {...rest}>
      {children}
    </button>
  );
}

export const Badge = ({ tone = 'neutral', className, children, ...r }) => (
  <span className={cx('gt-badge', `gt-badge--${tone}`, className)} {...r}>{children}</span>
);

/* ------------------------------------------------------------------ fields */

export function Field({ label, hint, error, children, className }) {
  const id = useId();
  // Cloned rather than wrapped so the label's `for` reaches the real control
  // and the error is announced with it.
  const control = React.isValidElement(children)
    ? React.cloneElement(children, {
        id: children.props.id || id,
        'aria-invalid': error ? 'true' : undefined,
        'aria-describedby': error ? `${id}-err` : hint ? `${id}-hint` : undefined,
      })
    : children;

  return (
    <div className={cx('gt-field', className)}>
      {label && <label className="gt-field__label" htmlFor={control?.props?.id || id}>{label}</label>}
      {control}
      {hint && !error && <p className="gt-field__hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="gt-field__error" id={`${id}-err`} role="alert">{error}</p>}
    </div>
  );
}

export const Input    = ({ className, ...r }) => <input className={cx('gt-input', className)} {...r} />;
export const Select   = ({ className, children, ...r }) => <select className={cx('gt-select', className)} {...r}>{children}</select>;
export const Textarea = ({ className, ...r }) => <textarea className={cx('gt-textarea', className)} {...r} />;

export function SearchInput({ icon, className, ...rest }) {
  return (
    <div className={cx('gt-search', className)}>
      {icon && <span className="gt-search__icon" aria-hidden="true">{icon}</span>}
      <Input type="search" {...rest} />
    </div>
  );
}

/* -------------------------------------------------------- state placeholders */

export const EmptyState = ({ icon, title, body, action }) => (
  <div className="gt-empty">
    {icon && <div className="gt-empty__icon" aria-hidden="true">{icon}</div>}
    {title && <h3 className="gt-empty__title">{title}</h3>}
    {body && <p className="gt-empty__body">{body}</p>}
    {action}
  </div>
);

export const Skeleton = ({ height = '1rem', width = '100%', className, style }) => (
  <div className={cx('gt-skeleton', className)} style={{ height, width, ...style }} aria-hidden="true" />
);

/** A grid of card-shaped skeletons, so a loading list keeps the page's rhythm. */
export const SkeletonCards = ({ count = 6, wide = false }) => (
  <div className={cx('gt-grid', wide && 'gt-grid--wide')} aria-busy="true" aria-live="polite">
    <span className="gt-sr">Loading…</span>
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="gt-card">
        <Skeleton height="0" style={{ aspectRatio: '4 / 3', height: 'auto', borderRadius: 0 }} />
        <div className="gt-card__body">
          <Skeleton height="1.1rem" width="72%" />
          <Skeleton height="0.8rem" width="45%" />
        </div>
      </div>
    ))}
  </div>
);

export const Spinner = ({ label = 'Loading' }) => (
  <span className="gt-row gt-gap-2" role="status">
    <span className="gt-spinner" aria-hidden="true" />
    <span className="gt-sr">{label}</span>
  </span>
);

/* ------------------------------------------------------------------ dialog */

export function Dialog({ open, onClose, title, children, footer }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    // Focus moves into the dialog so a keyboard user is not left behind on
    // the page underneath.
    ref.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="gt-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="gt-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="gt-dialog__head">
          <h2 className="gt-dialog__title">{title}</h2>
          <Button variant="ghost" size="sm" icon onClick={onClose} aria-label="Close">✕</Button>
        </div>
        <div>{children}</div>
        {footer}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------- toast */

const ToastContext = React.createContext(null);

/**
 * Toasts, so a page can confirm an action without a panel-level alert bar.
 *
 * Deliberately additive: the existing `setAlert` in App.jsx keeps working
 * untouched, and screens adopt this only as they are migrated.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback((message, tone = 'info', ms = 4000) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    if (ms) setTimeout(() => dismiss(id), ms);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      {toasts.length > 0 && createPortal(
        <div className="gt-toasts" role="region" aria-label="Notifications">
          {toasts.map((t) => (
            <div key={t.id} className={cx('gt-toast', `gt-toast--${t.tone}`)} role="status">
              <span className="gt-toast__text">{t.message}</span>
              <Button variant="ghost" size="sm" icon onClick={() => dismiss(t.id)} aria-label="Dismiss">✕</Button>
            </div>
          ))}
        </div>, document.body)}
    </ToastContext.Provider>
  );
}

/** Returns a no-op outside a provider, so a component is never coupled to it. */
export function useToast() {
  return React.useContext(ToastContext) || { push: () => {}, dismiss: () => {} };
}

/* ----------------------------------------------------------------- section */

export const SectionHead = ({ title, subtitle, action }) => (
  <div className="gt-section-head">
    <div>
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const Grid = ({ wide = false, className, children, ...r }) => (
  <div className={cx('gt-grid', wide && 'gt-grid--wide', className)} {...r}>{children}</div>
);
