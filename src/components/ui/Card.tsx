import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = '', onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-[#2D5A3D] border border-[#4A7A5A] rounded-2xl ${onClick ? 'cursor-pointer btn-press' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
