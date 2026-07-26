interface AvatarProps {
  name: string;
  size?: number;
  live?: boolean;
  className?: string;
}

export function Avatar({ name, size = 40, live = false, className = '' }: AvatarProps) {
  const initials = (() => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  })();

  const colors = ['#FF6B00', '#4CAF7D', '#FFD700', '#4A90D9', '#9B6B9E', '#C77B58'];
  const colorIdx =
    name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;

  return (
    <div
      className={`relative rounded-full flex items-center justify-center font-mono font-bold text-white shrink-0 ${live ? 'animate-pulse-green' : ''} ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: colors[colorIdx],
        fontSize: size * 0.38,
      }}
    >
      {initials}
    </div>
  );
}
