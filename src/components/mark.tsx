export function AilerixMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M4 18.5C10 10 16 8 28 7.5C20.5 12.5 16 16 13 24.5C10.8 21.2 8 19.4 4 18.5Z"
        className="fill-primary"
      />
      <path
        d="M6 20.5C12 20 18 17.5 27 13"
        className="stroke-primary-foreground/70"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
