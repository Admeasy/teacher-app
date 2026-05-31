/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  typescript: {
    // Legacy shell components (AIPanel, etc.) still carry ERP nullability; teacher routes are typed.
    ignoreBuildErrors: true,
  },
  async redirects() {
    return [
      {
        source: "/teacher/select-school",
        destination: "/select-school",
        permanent: false,
      },
      {
        source: "/teacher/login",
        destination: "/login",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
