import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  experimental: {
    agentFeedback: true,
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/step_1",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
