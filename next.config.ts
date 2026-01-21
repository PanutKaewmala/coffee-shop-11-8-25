/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // Unsplash (ของเดิม)
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },

      // Supabase Storage
      {
        protocol: "https",
        hostname: "udgxrvtbhytqncmyhmiv.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

module.exports = nextConfig;
