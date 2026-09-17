import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/",
        headers: [
          {
            key: "Link",
            value:
              '</.well-known/api-catalog>; rel="api-catalog", </openapi.json>; rel="service-desc"',
          },
        ],
      },
      {
        source: "/.well-known/api-catalog",
        headers: [
          {
            key: "Content-Type",
            value: "application/linkset+json",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
