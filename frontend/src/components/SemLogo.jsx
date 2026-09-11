import React from 'react';
import semLogo from '../assets/sem-logo.webp';

const SemLogo = ({ inverted = false, className = '', style = {}, alt = 'SEM' }) => (
  <img
    src={semLogo}
    alt={alt}
    className={className}
    style={{
      display: 'block',
      objectFit: 'contain',
      ...(inverted ? { filter: 'brightness(0) invert(1)' } : {}),
      ...style,
    }}
  />
);

export default SemLogo;
