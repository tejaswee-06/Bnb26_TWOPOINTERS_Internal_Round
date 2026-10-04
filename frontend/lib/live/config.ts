// Live mode = the UI talks to the authoritative Person-1 backend (through the Next.js server proxy /api/fd/*).
// Simulation mode (default) keeps the in-browser engine so the existing demo and Playwright suites still work offline.
export const LIVE = process.env.NEXT_PUBLIC_FAIRDROP_LIVE === '1'
export const FD = '/api/fd'
