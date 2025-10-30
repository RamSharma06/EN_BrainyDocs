export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-center">
      <h1 className="text-7xl font-extrabold text-white animate-pulse">404</h1>
      <p className="mt-4 text-2xl font-medium text-gray-300">
        Oops! Page Not Found
      </p>
      <p className="mt-2 text-gray-500 max-w-md">
        The page you’re looking for doesn’t exist or has been moved.
      </p>
      <a
        href="/"
        className="mt-6 inline-block rounded-xl bg-blue-600 px-6 py-3 text-white font-semibold shadow-md hover:bg-blue-500 transition-all duration-200"
      >
        Go Back Home
      </a>
    </div>
  );
}
