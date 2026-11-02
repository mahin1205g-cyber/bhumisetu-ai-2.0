import React, { forwardRef } from 'react';

const BUTTON_VARIANTS = new Set(['primary', 'secondary', 'tertiary']);

function inferVariant(className = '') {
  if (/\b(?:gov-btn-primary|btn-3d-dark|glass-primary)\b/.test(className)) return 'primary';
  if (/\b(?:gov-btn-secondary|gov-btn-gold|btn-3d-gold)\b/.test(className)) return 'secondary';
  if (/\b(?:glass-control|glass-pill|glass-nav-item)\b/.test(className)) return 'tertiary';
  return 'tertiary';
}

/** Shared native button with consistent variants, focus, disabled, and loading behavior. */
const Button = forwardRef(function Button({
  variant = 'auto',
  loading = false,
  className = '',
  children,
  disabled = false,
  ...props
}, ref) {
  const requestedBusy = props['aria-busy'];
  const isLoading = loading || requestedBusy === true || requestedBusy === 'true';
  const inferredVariant = variant === 'auto' ? inferVariant(className) : variant;
  const resolvedVariant = BUTTON_VARIANTS.has(inferredVariant) ? inferredVariant : 'tertiary';
  const isDisabled = disabled || isLoading;

  return (
    <button
      {...props}
      ref={ref}
      disabled={isDisabled}
      aria-busy={isLoading ? true : requestedBusy}
      data-variant={resolvedVariant}
      className={`ui-button ui-button--${resolvedVariant} ${className}`.trim()}
    >
      {isLoading && <span className="ui-button-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
});

Button.displayName = 'Button';

export default Button;
