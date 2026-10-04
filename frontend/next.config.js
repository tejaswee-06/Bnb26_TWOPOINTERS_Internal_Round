// NEXT_DIST_DIR lets a simulation-mode build and a live-mode build coexist (used by scripts/run_all_tests.sh).
module.exports = { reactStrictMode: true, eslint: { ignoreDuringBuilds: true }, distDir: process.env.NEXT_DIST_DIR || '.next' }
