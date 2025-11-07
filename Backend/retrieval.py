import os
import re
import time
from uuid import uuid4
from datetime import datetime
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from pymongo import MongoClient
import bcrypt
import jwt
from google.oauth2 import id_token
from google.auth.transport import requests as grequests

from langchain_huggingface import HuggingFaceEmbeddings
from langchain_mongodb.vectorstores import MongoDBAtlasVectorSearch
from langchain_groq import ChatGroq
from langchain.chains import ConversationalRetrievalChain
from langchain.prompts import PromptTemplate

load_dotenv()

# --- Config (env overrides)
MONGODB_URI = os.getenv("MONGODB_URI")
MONGODB_DB = os.getenv("MONGODB_DB", "brainydocs_db")
MONGODB_COLLECTION = os.getenv("MONGODB_COLLECTION", "vector_docs")

JWT_SECRET = os.getenv("JWT_SECRET", "supersecretyoushouldchange")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXP_SECONDS = int(os.getenv("JWT_EXP_SECONDS", 7 * 24 * 3600))

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

# Summarization/trimming thresholds (configurable via env)
MAX_SESSION_MESSAGES = int(os.getenv("MAX_SESSION_MESSAGES", 15))   # when to summarize
TRIM_TO_MESSAGES = int(os.getenv("TRIM_TO_MESSAGES", 5))           # keep last n messages after summarization
MAX_USER_SESSIONS = int(os.getenv("MAX_USER_SESSIONS", 10))        # keep top n recent sessions

app = FastAPI(title="BrainyDocs RAG Backend (retrieval)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "Authorization"],
)

# ----- MongoDB + Collections -----
client = MongoClient(MONGODB_URI)
db = client[MONGODB_DB]

# Vector store uses the vector docs collection (unchanged)
collection = db[MONGODB_COLLECTION]

# Session-based chat storage
chat_history_col = db["chat_history"]                   # stores one doc per chat session (session_id: uuid hex)
user_chat_summary_col = db["user_chat_summary"]         # stores recent_chats list per user for sidebar

# Keep users collection for auth
users_col = db["users"]

# ----- Embeddings, Vectorstore, LLM, Chain (loaded once) -----
embedding = HuggingFaceEmbeddings(model_name="intfloat/e5-large-v2")

vector_store = MongoDBAtlasVectorSearch(
    embedding=embedding,
    collection=collection,
    index_name="vector_index"
)

llm = ChatGroq(model="llama-3.3-70b-versatile",
               api_key=GROQ_API_KEY,
               temperature=0.2)

PROMPT_TEMPLATE = """
You are a knowledgeable technical assistant specialized in reading and explaining enterprise documents. 
You must answer the user's question ONLY using the information provided in the document context below. 
Do NOT use outside or generic knowledge — your answer must be entirely based on the provided context.

If the answer cannot be found within the context, reply exactly:
"I could not find that information in the provided documents."

When information is available, provide a **detailed, step-by-step, and technically comprehensive answer**, written clearly and logically.
- Expand on explanations using all relevant parts of the context.
- Connect related concepts from different parts of the context.
- If instructions, definitions, or examples are available in the context, include them.
- Do not skip technical depth; aim for completeness rather than brevity.
- Maintain factual accuracy; every statement must trace back to the context.

Always answer using proper Markdown formatting:
- Use headings (#, ##, ###)
- Use bullet lists where helpful
- Use fenced code blocks (```language)
- Use **bold** and *italic* for emphasis
- Use blockquotes for explanations
- Use tables when showing comparisons
- Don't use extra newlines or unnecessary spaces
Ensure the output is clean Markdown.

Context:
{context}

User Question:
{question}

Answer:
"""

prompt = PromptTemplate(input_variables=["context", "question"], template=PROMPT_TEMPLATE)

# create retriever + chain once (reuse)
retriever = vector_store.as_retriever(search_kwargs={"k": 3})
conversational_chain = ConversationalRetrievalChain.from_llm(
    llm=llm,
    retriever=retriever,
    combine_docs_chain_kwargs={"prompt": prompt},
    return_source_documents=True,
)

# ----- Utilities -----
def normalize_text(text: str) -> str:
    """Normalization used for documents (keeps compatibility with ingestion)."""
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text).strip().lower()
    text = re.sub(r"[^a-z0-9\s\.\-_:\/]", " ", text)
    return text.strip()

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))

def create_jwt_token(user_id: str, email: str):
    now = int(time.time())
    payload = {"sub": user_id, "email": email, "iat": now, "exp": now + JWT_EXP_SECONDS}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_jwt_token(token: str):
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_current_user(request: Request):
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
    if not auth_header:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid auth format")
    payload = decode_jwt_token(token)
    user_id = payload.get("sub")
    user = users_col.find_one({"_id": __import__("bson").ObjectId(user_id)}) if user_id else None
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    user.pop("password", None)
    user["_id"] = str(user["_id"])
    return user

# Robust summarization helper: tries different invocation styles for llm to be compatible.
def summarization_call(prompt_text: str) -> str:
    """
    Attempts to call the LLM to produce a summary. Tries a few invocation patterns and returns
    the first successful response string. If all fail, returns an empty string.
    """
    try:
        # Many LangChain LLMs support __call__ as a convenience
        resp = llm(prompt_text)
        # resp might be a string or an object
        if isinstance(resp, str):
            return resp
        # some wrappers return object with 'generations' or 'content'
        if hasattr(resp, "generations"):
            gens = getattr(resp, "generations")
            if gens and isinstance(gens, list) and len(gens) > 0:
                if isinstance(gens[0], list) and len(gens[0]) > 0 and hasattr(gens[0][0], "text"):
                    return gens[0][0].text
        if hasattr(resp, "content"):
            return resp.content
    except Exception:
        pass

    # Try generate()
    try:
        resp2 = llm.generate([prompt_text])
        # resp2 may have a .generations structure
        if hasattr(resp2, "generations"):
            gens = resp2.generations
            if gens and len(gens) > 0 and len(gens[0]) > 0 and hasattr(gens[0][0], "text"):
                return gens[0][0].text
    except Exception:
        pass

    # Try invoke (used in examples)
    try:
        if hasattr(llm, "invoke"):
            inv = llm.invoke(prompt_text)
            if isinstance(inv, str):
                return inv
            if hasattr(inv, "content"):
                return inv.content
    except Exception:
        pass

    # fallback
    return ""

def generate_title_from_conversation(question: str, answer: str) -> str:
    """
    Generate a short descriptive title (<= 8 words) for a chat session.
    Uses the same LLM path as summarization_call to stay compatible.
    """
    prompt_text = (
        "Create a very short (<= 8 words) descriptive title for this conversation.\n"
        "The title should capture the main topic discussed.\n"
        "Avoid punctuation and keep it human-readable.\n\n"
        f"User asked: {question}\n\n"
        f"Assistant answered: {answer}\n\n"
        "Title:"
    )
    try:
        title_text = summarization_call(prompt_text).strip()
        title_text = title_text.replace('"', '').replace("'", "").strip()
        if not title_text:
            return "New Chat"
        if len(title_text) > 60:
            title_text = title_text[:57] + "..."
        return title_text
    except Exception:
        return "New Chat"

# ----- Pydantic models -----
class SignUpRequest(BaseModel):
    email: EmailStr
    password: str
    name: str | None = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class GoogleAuthRequest(BaseModel):
    id_token: str

class CreateSessionRequest(BaseModel):
    title: str | None = None

class ChatRequest(BaseModel):
    query: str

class RenameRequest(BaseModel):
    new_name: str

# ----- Auth endpoints (kept) -----
@app.post("/signup")
def signup(req: SignUpRequest):
    email = req.email.lower().strip()
    if users_col.find_one({"email": email, "provider": "local"}):
        raise HTTPException(status_code=400, detail="User already exists")

    hashed = hash_password(req.password)
    user_doc = {
        "email": email,
        "password": hashed,
        "name": req.name or email.split("@")[0],
        "provider": "local",
        "created_at": int(time.time())
    }
    res = users_col.insert_one(user_doc)
    token = create_jwt_token(str(res.inserted_id), email)
    return {"access_token": token, "token_type": "bearer",
            "user": {"email": email, "name": user_doc["name"], "id": str(res.inserted_id)}}

@app.post("/login")
def login(req: LoginRequest):
    email = req.email.lower().strip()
    user = users_col.find_one({"email": email, "provider": "local"})
    if not user or not verify_password(req.password, user["password"]):
        raise HTTPException(status_code=400, detail="Invalid credentials")

    token = create_jwt_token(str(user["_id"]), email)
    return {"access_token": token, "token_type": "bearer",
            "user": {"email": email, "name": user.get("name", ""), "id": str(user["_id"])}}

@app.post("/google")
def auth_google(req: GoogleAuthRequest):
    try:
        idinfo = id_token.verify_oauth2_token(req.id_token, grequests.Request(), GOOGLE_CLIENT_ID)
        userid = idinfo["sub"]
        email = idinfo.get("email")
        name = idinfo.get("name", email.split("@")[0])
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Google token: {e}")

    user = users_col.find_one({"email": email, "provider": "google"})
    if not user:
        user_doc = {"email": email, "name": name, "provider": "google",
                    "google_sub": userid, "created_at": int(time.time())}
        res = users_col.insert_one(user_doc)
        user_id = str(res.inserted_id)
    else:
        user_id = str(user["_id"])

    token_jwt = create_jwt_token(user_id, email)
    return {"access_token": token_jwt, "token_type": "bearer",
            "user": {"email": email, "name": name, "id": user_id}}

# ----- Session endpoints -----
@app.post("/new_session")
def new_session(req: CreateSessionRequest | None = None, user=Depends(get_current_user)):
    """
    Create a new session for the user. Returns session_id.
    """
    user_id = str(user["_id"])
    session_id = uuid4().hex
    now = int(time.time())
    session_doc = {
        "user_id": user_id,
        "session_id": session_id,
        "title": req.title.strip() if (req and req.title) else None,
        "created_at": now,
        "updated_at": now,
        "summary": None,
        "messages": []  # each message: { role: "user"|"assistant", query/answer, sources?, timestamp }
    }
    chat_history_col.insert_one(session_doc)

    # add to user's recent chats front (maintain top N)
    user_chat_summary_col.update_one(
        {"user_id": user_id},
        {"$pull": {"recent_chats": {"session_id": session_id}}},
    )
    user_chat_summary_col.update_one(
        {"user_id": user_id},
        {"$push": {"recent_chats": {"$each": [{"session_id": session_id, "title": session_doc.get("title") or ""}], "$position": 0, "$slice": MAX_USER_SESSIONS}}},
        upsert=True
    )

    return {"session_id": session_id, "created_at": now, "title": session_doc.get("title")}

@app.post("/chat/{session_id}")
def chat_with_session(session_id: str, req: ChatRequest, user=Depends(get_current_user)):
    """
    Post a user query to a specific session. Uses only this session's messages as context.
    If session_id does not exist, returns 404.
    """
    query_raw = req.query.strip()
    if not query_raw:
        raise HTTPException(status_code=400, detail="Empty query")

    user_id = str(user["_id"])

    # Load session (session_id is stored as a field, not _id)
    session = chat_history_col.find_one({"user_id": user_id, "session_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    now = int(time.time())

    # Append user message
    user_msg = {"role": "user", "query": query_raw, "timestamp": now}
    chat_history_col.update_one(
        {"user_id": user_id, "session_id": session_id},
        {"$push": {"messages": user_msg}, "$set": {"updated_at": now}}
    )

    # Reload session to include appended user msg
    session = chat_history_col.find_one({"user_id": user_id, "session_id": session_id})
    messages = session.get("messages", [])

    # Build chat history pairs [(q,a), ...] from session messages
    chat_history_pairs = []
    last_user = None
    for m in messages:
        if m.get("role") == "user":
            last_user = m.get("query")
        elif m.get("role") == "assistant" and last_user is not None:
            chat_history_pairs.append((last_user, m.get("answer", "")))
            last_user = None

    # Run RAG chain using **only this session** chat history
    chain_input = {"question": query_raw, "chat_history": chat_history_pairs}
    try:
        result = conversational_chain(chain_input)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error running retrieval chain: {str(e)}")

    answer = result.get("answer") or result.get("result") or ""
    docs = result.get("source_documents", []) or []

    # Build sources
    sources = []
    for d in docs:
        meta = getattr(d, "metadata", {}) or {}
        pdf_name = meta.get("pdf_name", "unknown.pdf")
        page_number = meta.get("page_number", "unknown")
        sources.append(f"{pdf_name} (page {page_number})")

    # Save assistant reply
    assistant_msg = {
        "role": "assistant",
        "answer": answer,
        "sources": list(dict.fromkeys(sources)),  # deduplicate preserving order
        "timestamp": int(time.time())
    }
    chat_history_col.update_one(
        {"user_id": user_id, "session_id": session_id},
        {"$push": {"messages": assistant_msg}, "$set": {"updated_at": int(time.time())}}
    )

    # --- Auto-generate a descriptive title for this session (like ChatGPT) ---
    auto_title = None
    if not session.get("title"):  # Only set title if it's still None
        try:
            auto_title = generate_title_from_conversation(query_raw, answer)
            if auto_title:
                chat_history_col.update_one(
                    {"user_id": user_id, "session_id": session_id},
                    {"$set": {"title": auto_title}}
                )
                # Also update sidebar recent chats
                user_chat_summary_col.update_one(
                    {"user_id": user_id},
                    {"$pull": {"recent_chats": {"session_id": session_id}}}
                )
                user_chat_summary_col.update_one(
                    {"user_id": user_id},
                    {"$push": {
                        "recent_chats": {
                            "$each": [{"session_id": session_id, "title": auto_title}],
                            "$position": 0,
                            "$slice": MAX_USER_SESSIONS
                        }
                    }},
                    upsert=True
                )
        except Exception as e:
            print(f" Auto title generation failed for session {session_id}: {e}")

    # Update user's recent_chats (move to front and update title if available)
    # Use the freshest known title (auto_title if just created, else session.title)
    current_title = (auto_title or session.get("title") or "")
    user_chat_summary_col.update_one(
        {"user_id": user_id},
        {"$pull": {"recent_chats": {"session_id": session_id}}},
    )
    user_chat_summary_col.update_one(
        {"user_id": user_id},
        {"$push": {
            "recent_chats": {
                "$each": [{"session_id": session_id, "title": current_title}],
                "$position": 0,
                "$slice": MAX_USER_SESSIONS
            }
        }},
        upsert=True
    )

    # --- Summarize & Trim if session exceeds threshold ---
    # Note: summarization is best-effort; failures won't break the chat flow.
    session = chat_history_col.find_one({"user_id": user_id, "session_id": session_id})  # reload
    total_msgs = len(session.get("messages", []))
    if total_msgs > MAX_SESSION_MESSAGES:
        # Build human-friendly Q/A text from messages
        qa_lines = []
        for m in session["messages"]:
            if m.get("role") == "user":
                qa_lines.append(f"Q: {m.get('query')}")
            elif m.get("role") == "assistant":
                qa_lines.append(f"A: {m.get('answer')}")
        qa_text = "\n\n".join(qa_lines)

        summary_prompt = (
            "Summarize the following conversation in a concise, technical paragraph (<= 120 words). "
            "Focus on the key topics discussed, decisions, and important referenced documents.\n\n"
            f"{qa_text}\n\nSummary:"
        )

        try:
            summary_text = summarization_call(summary_prompt).strip()
            if summary_text:
                # store summary and trim messages to the last TRIM_TO_MESSAGES
                last_msgs = session["messages"][-TRIM_TO_MESSAGES:] if TRIM_TO_MESSAGES > 0 else []
                chat_history_col.update_one(
                    {"user_id": user_id, "session_id": session_id},
                    {"$set": {"summary": summary_text, "messages": last_msgs, "updated_at": int(time.time())}}
                )
        except Exception as e:
            # non-fatal: log and continue
            print(f"Warning: summarization failed for session {session_id}: {e}")

    return {"answer": answer, "sources": list(dict.fromkeys(sources)), "session_id": session_id}

@app.patch("/chat/rename/{session_id}")
def rename_chat(session_id: str, req: RenameRequest, user=Depends(get_current_user)):
    """
    Rename a session (user-visible title).
    """
    user_id = str(user["_id"])
    new_name = req.new_name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="New name must be non-empty")
    res = chat_history_col.update_one(
        {"user_id": user_id, "session_id": session_id},
        {"$set": {"title": new_name, "updated_at": int(time.time())}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    # update summary list too
    user_chat_summary_col.update_one({"user_id": user_id}, {"$pull": {"recent_chats": {"session_id": session_id}}})
    user_chat_summary_col.update_one(
        {"user_id": user_id},
        {"$push": {"recent_chats": {"$each": [{"session_id": session_id, "title": new_name}], "$position": 0, "$slice": MAX_USER_SESSIONS}}},
        upsert=True
    )
    return {"message": "Session renamed", "session_id": session_id, "title": new_name}

@app.get("/sessions")
def list_sessions(user=Depends(get_current_user)):
    """
    Return the top N recent sessions for the authenticated user (for UI sidebar).
    """
    user_id = str(user["_id"])
    doc = user_chat_summary_col.find_one({"user_id": user_id}, {"_id": 0, "recent_chats": 1})
    recent = doc.get("recent_chats", []) if doc else []
    return {"recent_chats": recent}

@app.get("/chat/{session_id}")
def get_session(session_id: str, user=Depends(get_current_user)):
    """
    Retrieve full session (title, summary, messages) for UI display.
    """
    user_id = str(user["_id"])
    session = chat_history_col.find_one({"user_id": user_id, "session_id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@app.delete("/chat/{session_id}")
def delete_session(session_id: str, user=Depends(get_current_user)):
    user_id = str(user["_id"])
    res = chat_history_col.delete_one({"user_id": user_id, "session_id": session_id})
    user_chat_summary_col.update_one({"user_id": user_id}, {"$pull": {"recent_chats": {"session_id": session_id}}})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Session deleted"}

@app.get("/reset_memory")
def reset_memory(user=Depends(get_current_user)):
    """
    Deletes all sessions for this user (use for dev/testing).
    """
    user_id = str(user["_id"])
    chat_history_col.delete_many({"user_id": user_id})
    user_chat_summary_col.delete_one({"user_id": user_id})
    return {"message": "All sessions cleared for user."}

@app.get("/")
def root():
    return {"message": "BrainyDocs RAG Backend (retrieval) is running."}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("retrieval:app", host="0.0.0.0", port=port, reload=True)
