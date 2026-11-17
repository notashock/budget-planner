import React from 'react';

const VARIANT_CLASS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-subtle',
  danger: 'btn-danger'
};

/**
 * The one button. Variants: primary (main action), secondary (default),
 * ghost (low-emphasis, no border) and danger (destructive). Sizes: md, sm.
 * `icon` is rendered before the label.
 */
export const Button = React.forwardRef(function Button(
  { variant = 'secondary', size = 'md', icon = null, block = false, className = '', type = 'button', children, ...rest },
  ref
) {
  const classes = [
    'btn',
    VARIANT_CLASS[variant] || VARIANT_CLASS.secondary,
    size === 'sm' ? 'btn-sm' : '',
    block ? 'btn-block' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <button ref={ref} type={type} className={classes} {...rest}>
      {icon}
      {children}
    </button>
  );
});
