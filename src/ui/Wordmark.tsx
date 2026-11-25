/** Wordmark: a survey stake with flag tape beside the name. */
export function Wordmark({ size = 20, tone = 'ink' }: { size?: number; tone?: 'ink' | 'book' }) {
  return (
    <span className={`wordmark wordmark--${tone}`} style={{ fontSize: size }}>
      <svg className="wordmark-mark" viewBox="0 0 22 26" width={size * 0.9} height={size * 1.06} aria-hidden>
        <path d="M5 2v22" stroke="currentColor" strokeWidth="2.2" />
        <path d="M5 3h14l-3.2 3.6L19 10.2H5z" fill="var(--flag)" />
        <path d="M2 24h6" stroke="currentColor" strokeWidth="2.2" />
      </svg>
      <span className="wordmark-text">Wherewise</span>
    </span>
  );
}
