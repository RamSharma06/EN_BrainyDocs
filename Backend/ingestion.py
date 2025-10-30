import os 
import re
from dotenv import load_dotenv
from pymongo import MongoClient
from langchain_community.document_loaders import PyMuPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_mongodb.vectorstores import MongoDBAtlasVectorSearch

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
MONGODB_DB = os.getenv("MONGODB_DB", "brainydocs_db")
MONGODB_COLLECTION = os.getenv("MONGODB_COLLECTION", "vector_docs")
DOCS_DIR = os.getenv("DOCS_DIR", "./docs")

client = MongoClient(MONGODB_URI)
db = client[MONGODB_DB]
collection = db[MONGODB_COLLECTION]

def normalize_text(text: str) -> str:
    """
    Normalizes text by removing extra spaces, special chars, and lowercasing.
    Keeps technical tokens like slashes, dashes, underscores, and colons.
    Must be identical across ingestion and retrieval.
    """
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text).strip().lower()
    text = re.sub(r"[^a-z0-9\s\.\-_:\/]", " ", text)
    return text.strip()

pdf_files = [f for f in os.listdir(DOCS_DIR) if f.endswith(".pdf")]
if not pdf_files:
    print(" No PDFs found in directory:", DOCS_DIR)
    exit(0)
    
documents = []
for pdf in pdf_files:
    loader = PyMuPDFLoader(os.path.join(DOCS_DIR, pdf))
    docs = loader.load()
    for d in docs:
        d.metadata["pdf_name"] = pdf  
    documents.extend(docs)

print(f"Loaded {len(documents)} pages from {len(pdf_files)} PDF(s).")

splitter = RecursiveCharacterTextSplitter(
    chunk_size=2000,
    chunk_overlap=400,
    separators=["\n## ", "\n#", "\n\n", "\n", " "],
    keep_separator=False
)

split_docs = splitter.split_documents(documents)

for i, doc in enumerate(split_docs):
    doc.page_content = normalize_text(doc.page_content)
    
    pdf_name = doc.metadata.get("pdf_name", "unknown.pdf")
    page_num = doc.metadata.get("page", None)

    doc.metadata = {
        "pdf_name": pdf_name,
        "page_number": page_num if page_num is not None else "unknown"
    }


print(f" Created {len(split_docs)} normalized chunks for embedding.")

embedding = HuggingFaceEmbeddings(model_name="intfloat/e5-large-v2")

print(" Uploading embeddings to MongoDB Atlas Vector Search...")

vector_store = MongoDBAtlasVectorSearch.from_documents(
    documents=split_docs,
    embedding=embedding,
    collection=collection,
    index_name="vector_index"
)

print(" All normalized chunks uploaded successfully.")