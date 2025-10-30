import os
import re
import time
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from pymongo import MongoClient
from bson import ObjectId
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


MONGODB_URI = os.getenv("MONGODB_URI")
MONGODB_DB = os.getenv("MONGODB_DB", "brainydocs_db")
MONGODB_COLLECTION = os.getenv("MONGODB_COLLECTION", "vector_docs")


JWT_SECRET = os.getenv("JWT_SECRET", "supersecretyoushouldchange")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXP_SECONDS = int(os.getenv("JWT_EXP_SECONDS", 7 * 24 * 3600))

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")


app = FastAPI(title="BrainyDocs RAG Backend (retrieval)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "Authorization"],
)

client = MongoClient(MONGODB_URI)
db = client[MONGODB_DB]
collection = db[MONGODB_COLLECTION]
users_col = db["users"]
chats_col = db["chats"]
refs_col = db["references"]


embedding = HuggingFaceEmbeddings(model_name="intfloat/e5-large-v2")
vector_store = MongoDBAtlasVectorSearch(
    embedding=embedding,
    collection=collection,
    index_name="vector_index"
)


llm = ChatGroq(model="llama-3.3-70b-versatile",
               api_key=GROQ_API_KEY,
               temperature=0.2)

def normalize_text(text: str) -> str:
    """
    EXACT same normalization as ingestion.py 
    Light normalization that keeps technical tokens intact.
    """
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
    user = users_col.find_one({"_id": ObjectId(user_id)}) if user_id else None
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    user.pop("password", None)
    user["_id"] = str(user["_id"])
    return user

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

Your answer must be in markdown format.

Context:
{context}

User Question:
{question}

Answer:
"""


prompt = PromptTemplate(input_variables=["context", "question"], template=PROMPT_TEMPLATE)


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str
    name: str = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class GoogleAuthRequest(BaseModel):
    id_token: str

class ChatRequest(BaseModel):
    query: str
    
#AUTH Endpoints  matching frontend
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

@app.post("/chat")
def chat(req: ChatRequest, user=Depends(get_current_user)):
    query_raw = req.query.strip()
    if not query_raw:
        raise HTTPException(status_code=400, detail="Empty query")

    query_norm = normalize_text(query_raw)
    user_id = str(user["_id"])

    # ✅ Load full chat history for this user
    user_chat = chats_col.find_one({"user_id": user_id, "active": True})
    chat_history = []
    if user_chat and "messages" in user_chat:
        # build history in [(query, answer), ...] format
        chat_history = [(m["query"], m["answer"]) for m in user_chat["messages"]]

    retriever = vector_store.as_retriever(search_kwargs={"k": 6})

    # ✅ Build Conversational Retrieval Chain with prompt
    chain = ConversationalRetrievalChain.from_llm(
        llm=llm,
        retriever=retriever,
        combine_docs_chain_kwargs={"prompt": prompt},
        return_source_documents=True,
    )

    # ✅ Run the chain with full chat history
    result = chain({"question": query_norm, "chat_history": chat_history})
    answer = result.get("answer") or result.get("result") or ""
    docs = result.get("source_documents", [])

    # ✅ Include both PDF name + page number in sources
    sources = []
    for d in docs:
        meta = getattr(d, "metadata", {}) or {}
        pdf_name = meta.get("pdf_name", "unknown.pdf")
        page_number = meta.get("page_number", "unknown")
        sources.append(f"{pdf_name} (page {page_number})")

    # ✅ Save chat with full context
    chats_col.update_one(
        {"user_id": user_id},
        {
            "$set": {"active": True},  # mark as active session
            "$push": {
                "messages": {
                    "query": query_raw,
                    "answer": answer,
                    "sources": list(set(sources)),
                    "timestamp": int(time.time())
                }
            }
        },
        upsert=True
    )

    # ✅ Track referenced documents (for sidebar/history)
    for s in set(sources):
        refs_col.update_one(
            {"user_id": user_id, "source": s},
            {"$set": {"user_id": user_id, "source": s, "timestamp": int(time.time())}},
            upsert=True
        )

    return {"answer": answer, "sources": list(set(sources))}


#  Utility endpoints 
@app.get("/reset_memory")
async def reset_memory():
    """Reset all stored chat memory (clears conversation history)."""
    global memory
    try:
        # Initialize memory if it doesn't exist
        if 'memory' not in globals() or memory is None:
            memory = []
            return {"message": "No previous chat context found. Memory initialized."}
        
        # Clear chat context memory
        memory.clear()
        return {"message": "All active chat sessions cleared successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error clearing memory: {str(e)}")


@app.get("/")
def root():
    return {"message": "BrainyDocs RAG Backend (retrieval) is running."}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("retrieval:app", host="0.0.0.0", port=port, reload=True)
  