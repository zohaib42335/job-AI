/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent webpack from bundling these Node-only CJS packages.
  // pdf-parse reads test fixtures at init time; mammoth uses native Node requires.
  // In Next.js 14+ this is the correct top-level key (not experimental).
  serverExternalPackages: ["pdf-parse", "mammoth"],
};

export default nextConfig;
