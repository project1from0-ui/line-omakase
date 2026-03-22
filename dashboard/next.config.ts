import type { NextConfig } from "next";

console.log("[next.config] NEXT_PUBLIC_FIREBASE_API_KEY:", process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? "SET" : "EMPTY");

const nextConfig: NextConfig = {
  turbopack: {
    root: ".",
  },
};

export default nextConfig;
