import { useState, useEffect, useRef } from "react";
import API from "../api/axiosClient.js";
import { useAuth } from "../context/AuthContext.jsx";
import MarkdownRenderer from "../components/MarkdownRenderer.jsx";
import { Typewriter } from "react-simple-typewriter";
import { useNavigate } from "react-router-dom";
import {
  FiSun,
  FiMoon,
  FiLogOut,
  FiUser,
  FiPlus,
  FiTrash2,
  FiMenu,
} from "react-icons/fi";

export default function ChatPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [references, setReferences] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // sessions from backend: [{ session_id, title }]
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [currentTitle, setCurrentTitle] = useState("New Chat");

  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const chatEndRef = useRef(null);
  const userMenuTimer = useRef(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (showUserMenu) {
      clearTimeout(userMenuTimer.current);
      userMenuTimer.current = setTimeout(() => setShowUserMenu(false), 3000);
    }
  }, [showUserMenu]);

  // On mount: fetch sessions
  useEffect(() => {
    (async () => {
      await fetchSessions();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Server integration helpers ----

  // Fetch list of recent sessions (GET /sessions)
  const fetchSessions = async () => {
    try {
      const res = await API.get("/sessions");
      const recent = res.data?.recent_chats || [];
      setSessions(recent);

      if (recent.length > 0) {
        // Load first session automatically if none selected
        if (!currentSessionId) {
          await loadChatSessionById(recent[0].session_id);
        }
      } else {
        setMessages([]);
        setReferences([]);
        setCurrentSessionId(null);
        setCurrentTitle("New Chat");
      }
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    }
  };

  // Load a session by id (GET /chat/{session_id})
  const loadChatSessionById = async (session_id) => {
    if (!session_id) return;
    try {
      const res = await API.get(`/chat/${session_id}`);
      const session = res.data;
      const msgs = (session.messages || []).flatMap((m) => {
        if (m.role === "user") return [{ sender: "user", text: m.query }];
        if (m.role === "assistant")
          return [{ sender: "bot", text: m.answer || "" }];
        return [];
      });

      const refs = [];
      (session.messages || []).forEach((m) => {
        if (m.role === "assistant" && Array.isArray(m.sources)) {
          m.sources.forEach((s) => refs.push(s));
        }
      });

      setMessages(msgs);
      setReferences(uniqueRefs(refs));
      setCurrentSessionId(session_id);
      setCurrentTitle(session.title || "New Chat");
      setSidebarOpen(false);
    } catch (err) {
      console.error("Failed to load session:", err);
      await fetchSessions();
    }
  };

  // Create a new session on server (POST /new_session)
  const createNewSessionOnServer = async (title = null) => {
    try {
      const res = await API.post("/new_session", title ? { title } : null);
      const session_id = res.data?.session_id;
      await fetchSessions();
      if (session_id) {
        setMessages([]);
        setReferences([]);
        setCurrentSessionId(session_id);
        setCurrentTitle(res.data?.title || "New Chat");
      }
      return session_id;
    } catch (err) {
      console.error("Failed to create session:", err);
      return null;
    }
  };

  // Send message to session (POST /chat/{session_id})
  const postMessageToSession = async (session_id, query) => {
    try {
      const res = await API.post(`/chat/${session_id}`, { query });
      return res.data;
    } catch (err) {
      console.error("Chat API error:", err);
      throw err;
    }
  };

  const deleteSessionOnServer = async (session_id) => {
    try {
      await API.delete(`/chat/${session_id}`);
      await fetchSessions();
      if (currentSessionId === session_id) {
        setMessages([]);
        setReferences([]);
        setCurrentSessionId(null);
        setCurrentTitle("New Chat");
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  const renameSessionOnServer = async (session_id, newName) => {
    try {
      await API.patch(`/chat/rename/${session_id}`, { new_name: newName });
      await fetchSessions();
    } catch (err) {
      console.error("Failed to rename session:", err);
    }
  };

  const resetMemoryOnServer = async () => {
    try {
      await API.get("/reset_memory");
      await fetchSessions();
      setMessages([]);
      setReferences([]);
      setCurrentSessionId(null);
      setCurrentTitle("New Chat");
    } catch (err) {
      console.error("Failed to reset memory:", err);
    }
  };

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  // ---- Utilities ----
  const uniqueRefs = (refsArray) => {
    const flat = refsArray || [];
    const map = new Map();
    flat.forEach((r) => {
      const key = typeof r === "string" ? r : r.source || JSON.stringify(r);
      if (!map.has(key)) map.set(key, r);
    });
    return Array.from(map.values());
  };

  // ---- Event handlers ----
  const handleSend = async (e) => {
    e?.preventDefault();
    if (!input.trim()) return;
    setLoading(true);

    const userText = input.trim();
    setMessages((prev) => [...prev, { sender: "user", text: userText }]);
    setInput("");

    try {
      let sessionId = currentSessionId;
      if (!sessionId) {
        sessionId = await createNewSessionOnServer();
        if (!sessionId) throw new Error("Unable to create session");
      }

      const result = await postMessageToSession(sessionId, userText);
      const rawAnswer = result.answer || "";
      const cleanedAnswer = rawAnswer.replace(/\([^()]*\.pdf[^()]*\)/gi, "").trim();

      setMessages((prev) => [...prev, { sender: "bot", text: cleanedAnswer }]);

      const newRefs = result.sources || [];
      if (newRefs.length > 0 && !rawAnswer.toLowerCase().includes("could not find")) {
        setReferences((prev) => uniqueRefs([...prev, ...newRefs]));
      }

      // Update session title dynamically if backend assigned one
      await fetchSessions();
      const updated = sessions.find((s) => s.session_id === result.session_id);
      if (updated) setCurrentTitle(updated.title || "New Chat");

      if (result.session_id) setCurrentSessionId(result.session_id);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { sender: "bot", text: "❌ Error connecting to server." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleNewChat = async () => {
    setMessages([]);
    setReferences([]);
    setCurrentSessionId(null);
    setCurrentTitle("New Chat");
    try {
      const newId = await createNewSessionOnServer();
      if (newId) setCurrentSessionId(newId);
    } catch (err) {
      console.error("Failed to create new chat:", err);
    }
  };

  const handleResetMemory = async () => {
    // if (!confirm("This will delete all sessions on the server for your account. Continue?"))
    //   return;
    await resetMemoryOnServer();
  };

  const clearHistory = () => {
    localStorage.removeItem("chatSessions");
    setSessions([]);
    setMessages([]);
    setReferences([]);
    setCurrentSessionId(null);
    setCurrentTitle("New Chat");
  };

  const loadChatSession = async (session) => {
    if (!session || !session.session_id) return;
    await loadChatSessionById(session.session_id);
    setSidebarOpen(false);
  };

  const onSessionContextMenu = async (e, session) => {
    e.preventDefault();
    if (!session || !session.session_id) return;
    const ok = confirm(`Delete session "${session.title || session.session_id}"?`);
    if (!ok) return;
    await deleteSessionOnServer(session.session_id);
  };


  // ---- Rendering ----
  return (
    <div className="h-screen flex bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-gray-100 transition-colors duration-300 overflow-hidden">
      {/* Sidebar overlay */}
      <div
        className={`fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden transition-opacity ${
          sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-gray-200 dark:bg-gray-950 border-r border-gray-300 dark:border-gray-800 p-4 flex flex-col z-50 transform lg:transform-none transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:relative lg:translate-x-0`}
      >
        {/* References */}
        <div className="flex-1 mb-4 overflow-y-auto border-b border-gray-400 dark:border-gray-800 pb-2">
          <h2 className="text-lg font-semibold mb-2">References</h2>
          <div className="space-y-2 pr-2">
            {references.length > 0 ? (
              references.map((ref, idx) => (
                <div
                  key={idx}
                  className="bg-gray-300 dark:bg-gray-800 px-3 py-2 rounded-xl text-sm truncate hover:bg-gray-400 dark:hover:bg-gray-700 cursor-default"
                  title={typeof ref === "string" ? ref : ref.source || JSON.stringify(ref)}
                >
                  {typeof ref === "string" ? ref : ref.source || JSON.stringify(ref)}
                </div>
              ))
            ) : (
              <p className="text-gray-600 dark:text-gray-500 text-sm">No references yet</p>
            )}
          </div>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto pt-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Chat History</h2>
            <button
              onClick={handleResetMemory}
              className="text-gray-600 dark:text-gray-400 hover:text-red-500 transition"
              title="Clear local chat history"
            >
              <FiTrash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2 pr-2">
            {sessions.length > 0 ? (
              sessions.map((item) => (
                <div
                  key={item.session_id}
                  onClick={() => loadChatSession(item)}
                  onContextMenu={(e) => onSessionContextMenu(e, item)}
                  className={`cursor-pointer bg-gray-300 dark:bg-gray-800 px-3 py-2 rounded-xl text-sm truncate hover:bg-gray-400 dark:hover:bg-gray-700 ${
                    currentSessionId === item.session_id ? "ring-2 ring-purple-500" : ""
                  }`}
                  title={item.title || item.session_id}
                >
                  {item.title || "Untitled Chat"}
                </div>
              ))
            ) : (
              <p className="text-gray-600 dark:text-gray-500 text-sm">No chat history</p>
            )}
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col transition-all duration-300">
        {/* Navbar */}
        <div className="flex justify-between items-center bg-gray-200 dark:bg-gray-950 border-b border-gray-300 dark:border-gray-800 p-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 rounded-lg bg-gray-300 dark:bg-gray-800 hover:bg-gray-400 dark:hover:bg-gray-700"
              onClick={() => setSidebarOpen(true)}
            >
              <FiMenu className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold flex items-center gap-2 text-purple-600">
              {currentTitle}
            </h1>
          </div>

          <div className="flex items-center gap-3 relative">
            <button
              onClick={handleNewChat}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded-lg text-sm text-white shadow-sm"
            >
              <FiPlus className="w-4 h-4" /> New Chat
            </button>

            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-gray-300 dark:bg-gray-800 hover:bg-gray-400 dark:hover:bg-gray-700"
            >
              {theme === "dark" ? <FiSun className="text-yellow-400" /> : <FiMoon />}
            </button>

            {/* User Menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu((prev) => !prev)}
                className="p-2 rounded-lg bg-gray-300 dark:bg-gray-800 hover:bg-gray-400 dark:hover:bg-gray-700"
              >
                {user?.name || "User"}
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-40 bg-gray-200 dark:bg-gray-800 rounded-lg shadow-lg z-50">
                  <button
                    onClick={() => navigate("/profile")}
                    className="w-full px-4 py-2 text-left hover:bg-gray-300 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <FiUser /> Profile
                  </button>
                  <button
                    onClick={logout}
                    className="w-full px-4 py-2 text-left hover:bg-gray-300 dark:hover:bg-gray-700 flex items-center gap-2 text-red-500"
                  >
                    <FiLogOut /> Logout
                  </button>
                  
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !loading && (
            <div className="text-center text-gray-500 mt-20">
              <p className="text-xl font-semibold">
                ✨ Ask me anything — your documents are full of insights!
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-xl p-3 rounded-2xl text-sm leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-purple-600 text-white"
                    : "bg-gray-300 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                }`}
              >
                {msg.sender === "bot" ? <MarkdownRenderer text={msg.text} /> : msg.text}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-300 dark:bg-gray-800 text-gray-600 dark:text-gray-400 p-3 rounded-2xl text-sm">
                <Typewriter
                  words={["Thinking...", "Retrieving context...", "Generating response..."]}
                  loop
                  cursor
                  cursorStyle="_"
                  typeSpeed={70}
                  deleteSpeed={50}
                  delaySpeed={1000}
                />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Box */}
        <form
          onSubmit={handleSend}
          className="border-t border-gray-300 dark:border-gray-800 p-3 flex items-center gap-3 bg-gray-200 dark:bg-gray-950"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask something..."
            className="flex-1 bg-gray-300 dark:bg-gray-800 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-700 p-3 rounded-xl text-white transition disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </main>
    </div>
  );
}
