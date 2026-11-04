import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  agentRules: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' https://openlibrary.org https://covers.openlibrary.org; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
          },
        ],
      },
    ];
  },
};
export default config;
