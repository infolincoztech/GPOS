import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.1.83",
    "192.168.1.*",
    "192.168.0.*",
    "10.0.2.2",
    "localhost",
  ],
};

export default nextConfig;
