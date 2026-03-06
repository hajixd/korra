import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["metaapi.cloud-sdk", "@log4js-node/log4js-api", "log4js"]
};

export default nextConfig;
