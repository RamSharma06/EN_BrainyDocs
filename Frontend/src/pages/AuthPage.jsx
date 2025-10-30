// import { useState, useContext, useEffect } from "react";
// import { AuthContext } from "../context/AuthContext";
// import API from "../api/axiosClient";
// import { FcGoogle } from "react-icons/fc";
// import { useNavigate } from "react-router-dom";


// export default function AuthPage() {
//   const { login } = useContext(AuthContext);
//   const navigate = useNavigate();
//   const [isLogin, setIsLogin] = useState(true);
//   const [formData, setFormData] = useState({ email: "", password: "", name: "" });
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState("");

//   // 🔹 Initialize Google One-Tap / Button
//   useEffect(() => {
//     if (window.google && import.meta.env.VITE_GOOGLE_CLIENT_ID) {
//       window.google.accounts.id.initialize({
//         client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
//         callback: handleGoogleResponse,
//       });

//       // Optional: Render button automatically
//       window.google.accounts.id.renderButton(
//         document.getElementById("googleSignInDiv"),
//         { theme: "outline", size: "large", width: 320}
//       );
//     }
//   }, []);

//   const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     setError("");
//     setLoading(true);
//     try {
//       const endpoint = isLogin ? "/login" : "/signup";
//       const { data } = await API.post(endpoint, formData);
//       login(data.user, data.access_token);
//       // window.location.href = "/chat";
//       navigate("/chat");
//     } catch (err) {
//       setError(err.response?.data?.detail || "Something went wrong");
//     } finally {
//       setLoading(false);
//     }
//   };

//   // 🔹 Handle Google token
//   const handleGoogleResponse = async (response) => {
//     try {
//       const { data } = await API.post("/google", { id_token: response.credential });
//       login(data.user, data.access_token);
//       //window.location.href = "/chat";
//       navigate("/chat");
//     } catch (err) {
//       console.error("Google Auth Error:", err);
//       setError("Google authentication failed.");
//     }
//   };

//   return (
//     <div className="min-h-screen flex items-center justify-center bg-black text-white">
//       <div className="w-full max-w-md bg-[#111] rounded-2xl shadow-lg p-8 border border-[#7b2cbf]/40">
//         <h2 className="text-3xl font-bold text-center mb-6">
//           {isLogin ? "Welcome Back 👋" : "Create Account"}
//         </h2>

//         <form onSubmit={handleSubmit} className="space-y-4">
//           {!isLogin && (
//             <input
//               type="text"
//               name="name"
//               placeholder="Full Name"
//               value={formData.name}
//               onChange={handleChange}
//               required
//               className="w-full p-3 rounded-lg bg-[#222] border border-[#7b2cbf]/40 focus:border-[#9b5de5] outline-none"
//             />
//           )}
//           <input
//             type="email"
//             name="email"
//             placeholder="Email Address"
//             value={formData.email}
//             onChange={handleChange}
//             required
//             className="w-full p-3 rounded-lg bg-[#222] border border-[#7b2cbf]/40 focus:border-[#9b5de5] outline-none"
//           />
//           <input
//             type="password"
//             name="password"
//             placeholder="Password"
//             value={formData.password}
//             onChange={handleChange}
//             required
//             className="w-full p-3 rounded-lg bg-[#222] border border-[#7b2cbf]/40 focus:border-[#9b5de5] outline-none"
//           />

//           {error && <p className="text-red-500 text-sm">{error}</p>}

//           <button
//             type="submit"
//             disabled={loading}
//             className="w-full bg-gradient-to-r from-[#9b5de5] to-[#7b2cbf] text-white py-3 rounded-lg font-semibold hover:opacity-90 transition disabled:opacity-50"
//           >
//             {loading ? "Please wait..." : isLogin ? "Login" : "Sign Up"}
//           </button>
//         </form>

//         <div className="my-4 text-center text-gray-400">or</div>

//         {/* 🔹 Google Sign-In Button */}
//         <div id="googleSignInDiv" className="w-full flex justify-center"></div>

//         <p className="mt-6 text-center text-gray-400 text-sm">
//           {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
//           <button
//             onClick={() => setIsLogin(!isLogin)}
//             className="text-[#9b5de5] hover:underline"
//           >
//             {isLogin ? "Sign Up" : "Login"}
//           </button>
//         </p>
//       </div>
//     </div>
//   );
// }


import { useState, useContext, useEffect } from "react";
import { AuthContext } from "../context/AuthContext";
import API from "../api/axiosClient";
import { FcGoogle } from "react-icons/fc";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { useNavigate } from "react-router-dom";

export default function AuthPage() {
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ email: "", password: "", name: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (window.google && import.meta.env.VITE_GOOGLE_CLIENT_ID) {
      const renderGoogleButton = () => {
        const container = document.getElementById("googleSignInDiv");
        if (container) {
          container.innerHTML = ""; // clear previous render to avoid duplicates
          window.google.accounts.id.initialize({
            client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
            callback: handleGoogleResponse,
          });
          window.google.accounts.id.renderButton(container, {
            theme: "outline",
            size: "large",
            width: window.innerWidth < 480 ? "250" : "320", // 🔹 responsive width
            shape: "pill",
            text: "signin_with",
          });
        }
      };

      renderGoogleButton();

      // Re-render on window resize for responsiveness
      window.addEventListener("resize", renderGoogleButton);
      return () => window.removeEventListener("resize", renderGoogleButton);
    }
  }, []);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const validateForm = () => {
    if (!formData.email || !/\S+@\S+\.\S+/.test(formData.email)) {
      return "Please enter a valid email address.";
    }

    if (!isLogin) {
      if (formData.name.trim().length < 3) {
        return "Name must be at least 3 characters long.";
      }
      if (!/^[A-Za-z\s]+$/.test(formData.name.trim())) {
        return "Name can only contain letters and spaces (no numbers or symbols).";
      }
      if (formData.password.length < 6) {
        return "Password must be at least 6 characters long.";
      }
      if (!/[0-9!@#$%^&*]/.test(formData.password)) {
        return "Password must include at least one number or symbol.";
      }
    } else {
      if (!formData.password) {
        return "Please enter your password.";
      }
    }

    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const endpoint = isLogin ? "/login" : "/signup";
      const { data } = await API.post(endpoint, formData);
      login(data.user, data.access_token);
      navigate("/chat");
    } catch (err) {
      setError(err.response?.data?.detail || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleResponse = async (response) => {
    try {
      const { data } = await API.post("/google", { id_token: response.credential });
      login(data.user, data.access_token);
      navigate("/chat");
    } catch (err) {
      console.error("Google Auth Error:", err);
      setError("Google authentication failed.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#312e81] text-white px-4">
      <div className="w-full max-w-md bg-white/5 backdrop-blur-2xl border border-purple-400/30 rounded-3xl shadow-2xl p-8 transition-all duration-300 hover:border-purple-300/50">
        <h2 className="text-4xl font-extrabold text-center mb-8 text-purple-200 drop-shadow">
          {isLogin ? "Welcome Back 👋" : "Create Account"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          {!isLogin && (
            <input
              type="text"
              name="name"
              placeholder="Full Name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full p-3 rounded-xl bg-[#181a2a]/80 border border-purple-400/30 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          )}

          <input
            type="email"
            name="email"
            placeholder="Email Address"
            value={formData.email}
            onChange={handleChange}
            required
            className="w-full p-3 rounded-xl bg-[#181a2a]/80 border border-purple-400/30 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400"
          />

          {/* Password with toggle */}
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              required
              className="w-full p-3 pr-10 rounded-xl bg-[#181a2a]/80 border border-purple-400/30 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-3 text-gray-400 hover:text-purple-400 transition-colors"
            >
              {showPassword ? <FaEyeSlash size={20} /> : <FaEye size={20} />}
            </button>
          </div>

          {error && (
            <p className="text-red-400 text-sm font-medium bg-red-500/10 p-2 rounded-lg border border-red-500/30">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 text-white py-3 rounded-xl font-semibold shadow-md hover:opacity-90 transition-all duration-200 disabled:opacity-50"
          >
            {loading ? "Please wait..." : isLogin ? "Login" : "Sign Up"}
          </button>
        </form>

        <div className="my-5 text-center text-gray-400 text-sm">or</div>

        {/* 🔹 Responsive Google Sign-In Button */}
        <div
          id="googleSignInDiv"
          className="w-full flex justify-center sm:justify-center md:justify-center"
        ></div>

        <p className="mt-6 text-center text-gray-400 text-sm">
          {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-purple-400 hover:underline transition-colors"
          >
            {isLogin ? "Sign Up" : "Login"}
          </button>
        </p>
      </div>
    </div>
  );
}
