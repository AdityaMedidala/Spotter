/** @type {import('next').NextConfig} */
const nextConfig = {
  // Leaflet imports its CSS via require() which needs this
  transpilePackages: ['leaflet', 'react-leaflet'],
};

module.exports = nextConfig;