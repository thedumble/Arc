import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger' | 'gold';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const base =
    'btn-press no-select font-medium rounded-xl inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:pointer-events-none';
  const sizes = {
    sm: 'text-xs px-3 py-2',
    md: 'text-sm px-4 py-3',
    lg: 'text-base px-5 py-4',
  };
  const variants = {
    primary: 'bg-[#FF6B00] text-white hover:bg-[#FF8C33] shadow-lg shadow-[#FF6B00]/20',
    outline:
      'bg-transparent border border-[#F5EDD0]/40 text-[#F5EDD0] hover:bg-[#F5EDD0]/10',
    ghost: 'bg-transparent text-[#A8C5B0] hover:bg-[#3D6B4D]/40',
    danger: 'bg-[#FF3131]/15 text-[#FF3131] hover:bg-[#FF3131]/25',
    gold: 'bg-[#FFD700] text-[#1E3D29] hover:brightness-110 shadow-lg shadow-[#FFD700]/20',
  };
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
