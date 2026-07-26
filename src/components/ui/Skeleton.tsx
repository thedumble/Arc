export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`bg-[#3D6B4D]/50 rounded-lg animate-pulse ${className}`}
      style={{ animationDuration: '1.4s' }}
    />
  );
}
