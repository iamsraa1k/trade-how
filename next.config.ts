import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The four constitution pages became tabs of the Autopilot page.
  async redirects() {
    return ["/constitution", "/routine", "/discipline", "/automation"].map(source => ({
      source,
      destination: "/autopilot",
      permanent: false,
    }));
  },
};

export default nextConfig;
