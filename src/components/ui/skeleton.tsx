import React from 'react';

interface SkeletonProps {
  className?: string;
  children?: React.ReactNode;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', children }) => {
  return (
    <div 
      className={`animate-pulse bg-gray-300 rounded ${className}`}
      style={{ minHeight: children ? 'auto' : '1rem' }}
    >
      {children}
    </div>
  );
};

export default Skeleton;