import React from 'react';

/** Surface container: surface background, hairline border, large radius. */
export function Card({ as: Tag = 'section', className = '', children, ...rest }) {
  return (
    <Tag className={['card', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Tag>
  );
}
