import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { FiArrowLeft, FiUser, FiMail } from "react-icons/fi";

export default function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-600 dark:text-gray-300">
        Loading profile...
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gray-100 dark:bg-[#0f172a] flex flex-col px-4 sm:px-10 py-10 transition-colors duration-300">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-purple-600 transition-colors"
        >
          <FiArrowLeft size={18} /> Back
        </button>

        <h1 className="text-2xl sm:text-3xl font-semibold text-purple-600">
          Profile
        </h1>
      </div>

      {/* Profile Info Section */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-10 sm:gap-16 w-full">
        {/* Profile Avatar */}
        <div className="flex flex-col items-center">
          <div className="bg-gradient-to-r from-purple-500 to-indigo-500 p-8 sm:p-10 rounded-full shadow-lg">
            <FiUser className="text-white text-5xl sm:text-6xl" />
          </div>
        </div>

        {/* Profile Details */}
        <div className="flex flex-col gap-6 text-center sm:text-left w-full">
          {/* Username */}
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-800 dark:text-gray-200 mb-1">
              Username
            </h2>
            <div className="flex flex-col sm:flex-row items-center sm:items-center gap-2 text-gray-600 dark:text-gray-400 break-words">
              <FiUser size={18} />
              <span className="text-base sm:text-lg">{user?.name || "N/A"}</span>
            </div>
          </div>

          {/* Email */}
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-800 dark:text-gray-200 mb-1">
              Email
            </h2>
            <div className="flex flex-col sm:flex-row items-center sm:items-center gap-2 text-gray-600 dark:text-gray-400 break-words">
              <FiMail size={18} />
              <span className="text-base sm:text-lg">{user.email || "N/A"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-16 text-center text-xs sm:text-sm text-gray-500 dark:text-gray-400">
        Member since {new Date().getFullYear()}
      </div>
    </div>
  );
}
