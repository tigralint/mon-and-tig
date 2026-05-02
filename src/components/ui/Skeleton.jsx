import React from 'react';
import './Skeleton.css';

const Skeleton = ({ width, height, borderRadius, className = '', style = {} }) => {
  return (
    <div 
      className={`skeleton ${className}`}
      style={{ 
        width: width || '100%', 
        height: height || '1em',
        borderRadius: borderRadius || 'var(--radius-sm)',
        ...style 
      }}
    />
  );
};

export default Skeleton;
