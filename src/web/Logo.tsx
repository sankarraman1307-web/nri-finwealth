/** The NRI FinWealth mark: a coin, euro on the teal half and rupee on the amber half. Drawn inline so it needs no extra request. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg className="logoMark" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path d="M50 2A48 48 0 0 0 50 98Z" fill="#0f6b73" />
      <path d="M50 2A48 48 0 0 1 50 98Z" fill="#d9902b" />
      <g fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M41.7 38.1A16 16 0 1 0 41.7 61.9M11 45.6H38.2M11 54.4H38.2" />
        <path d="M56.2 34H82.6M56.2 43.6H82.6M62.6 34C85 34 85 54.8 62.6 54.8L79.4 69.2" />
      </g>
    </svg>
  );
}
