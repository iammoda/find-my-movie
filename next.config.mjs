/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org"
      }
    ]
  },
  async redirects() {
    // The TV catalog UI was removed; keep old bookmarks working.
    return [
      {
        source: "/tv",
        destination: "/",
        permanent: false
      }
    ];
  }
};

export default nextConfig;
