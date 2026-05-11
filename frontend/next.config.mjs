/** @type {import('next').NextConfig} */
const nextConfig = {
    // Docker内での動作を安定させるための設定
    output: 'standalone',
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    }
};

export default nextConfig;
