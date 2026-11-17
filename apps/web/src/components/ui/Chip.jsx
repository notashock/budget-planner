import React from 'react';
import { CheckIcon, AlertTriangleIcon, ShieldAlertIcon } from '../Icons.jsx';

// Status is never colour alone: each status tone carries its own icon and a text label.
const TONE_ICON = {
  neutral: null,
  good: CheckIcon,
  warning: AlertTriangleIcon,
  critical: ShieldAlertIcon
};

/**
 * Small status label. Tones: neutral, good, warning, critical.
 * Pass `icon={null}` to drop the default icon (neutral has none), or a
 * different icon component to replace it.
 */
export function Chip({ tone = 'neutral', icon, className = '', children, ...rest }) {
  const Icon = icon === undefined ? TONE_ICON[tone] : icon;
  return (
    <span className={['ui-chip', `ui-chip-${tone}`, className].filter(Boolean).join(' ')} {...rest}>
      {Icon && <Icon size={11} strokeWidth={2.6} aria-hidden="true" />}
      {children}
    </span>
  );
}
