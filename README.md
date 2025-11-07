# 🧠BrainyDocs

**BrainyDocs** ✨ is your intelligent AI research companion - A next-gen **RAG-powered assistant** that transforms PDFs into interactive knowledge hubs. Ask any question, and BrainyDocs instantly retrieves, understands, and explains answers straight from your documents,  complete with real-time context and source citations.

---
## 🚀 Features  

- **📚 Pre-Uploaded Knowledge Base**  
  Works on a curated collection of **pre-ingested documents** stored in MongoDB for instant and efficient retrieval.  

- **💬 Conversational Q&A**  
  Ask any question in natural language, and BrainyDocs fetches relevant context from its knowledge base to generate accurate answers.  

- **🧠 Memory-Driven Conversations**  
  Equipped with a **conversation buffer memory** that maintains context across multiple turns for smooth, human-like dialogue.  

- **🔍 MongoDB Vector Store Integration**  
  Uses **MongoDB Atlas Vector Search** for fast and scalable semantic retrieval of document embeddings.  

- **⚡ LangChain + Groq LLM Pipeline**  
  Seamlessly integrates **LangChain’s retrieval framework** with the power of **Groq LLM** for lightning-fast inference and natural response generation.  

- **🧩 High-Quality Embeddings**  
  Utilizes **Hugging Face Sentence Transformers** to generate deep semantic embeddings for accurate contextual matching.  

- **🌐 FastAPI Backend**  
  Built using **FastAPI** to enable high-performance API communication between the frontend and backend systems.  

- **🪄 Context-Aware Source Reference**  
  Every generated answer includes the **reference source document**, ensuring transparency and reliability of responses.  

- **🧰 Modular & Scalable Architecture**  
  Clean, modular code structure for easy maintenance, debugging, and feature expansion.  

---

## ⚙️ Prerequisites 

- **Backend:** Python 3.11.7
- **Frontend:** Node.js 22.20.0, React (or compatible UI framework)

---
## 🛠️ Installation

### 1. Clone the Repository
```bash
git clone https://github.com/RamSharma06/BrainyDocs.git
cd BrainyDocs
```
### 2. Set Environment Variables
- Rename the .env.example files to .env in both the Backend and Frontend folders.
- Open the newly created .env files in each folder and set the required values.

### 3. Set Up Backend
```bash
cd Backend
# Install backend dependencies
pip install -r requirements.txt
   ```
### 4. Run Backend 
```bash
uvicorn Retrieval:app --reload
```
### 5. Set Up Frontend
```bash
cd Frontend
# Install backend dependencies
npm install
```
### 6. Run Frontend 
```bash
npm run dev
```
---
## Access the Application
- Backend 
```bash
http://localhost:8000
```
- Frontend
```bash
http://localhost:5173
```
---
## 🧠 How It Works
- Documents are pre-processed and stored in the MongoDB vector database.
- User questions trigger retrieval of relevant document chunks.
- LangChain + Groq LLM generates context-aware answers.
- Answers are returned with source references.
- Conversation buffer memory maintains chat history for contextual continuity.
---
## 🧩 Future Enhancements
- 📤 Add live document upload.
- 🧾 Support multi-format documents (PDF, DOCX, TXT).
- 🤖 Fine-tuned custom LLM integration.
- 🖥️ Enhanced chat UI with reference visualization
---

