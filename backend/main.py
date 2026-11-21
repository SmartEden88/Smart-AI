import os, time, json, base64, re
from collections import defaultdict, deque
from typing import Optional
import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from groq import Groq

APP_ORIGINS=[x.strip() for x in os.getenv("ALLOWED_ORIGINS", os.getenv("ALLOWED_ORIGIN","http://localhost:8888,http://127.0.0.1:8888")).split(",") if x.strip()]
app=FastAPI(title="Smart AI API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=APP_ORIGINS, allow_credentials=True, allow_methods=["GET","POST","OPTIONS"], allow_headers=["Authorization","Content-Type"])
limits=defaultdict(deque)
SUBJECTS={"Mathematics","English","English Language","Biology","Chemistry","Physics","Basic Science","Agricultural Science","Economics","Government","Geography","History","Literature","Literature in English","Civic Education","Computer Studies","Business Studies","Accounting","French","Religious Studies","General Studies"}
class Message(BaseModel):
    role: str
    content: str = Field(max_length=6000)
    @field_validator("role")
    @classmethod
    def valid_role(cls,v):
        if v not in ("user","assistant"): raise ValueError("Invalid message role")
        return v
class SolveRequest(BaseModel):
    mode: str="tutor"
    subject: str="General Studies"
    topic: str="general topic"
    difficulty: str="medium"
    messages: list[Message]=Field(default_factory=list, max_length=20)
    image: Optional[str]=None
    @field_validator("mode")
    @classmethod
    def valid_mode(cls,v):
        if v not in {"tutor","hint","quiz","explain","flashcards","planner","vision"}: raise ValueError("Unsupported learning mode")
        return v
    @field_validator("image")
    @classmethod
    def valid_image(cls,v):
        if v and (len(v)>7_000_000 or not re.match(r"^data:image/(png|jpeg|webp);base64,",v)): raise ValueError("Upload a PNG, JPEG or WebP image under 5 MB.")
        return v

async def student_from_token(authorization):
    if not authorization or not authorization.startswith("Bearer "): raise HTTPException(401,"Please log in to use Smart AI.")
    url=os.getenv("SUPABASE_URL","").rstrip("/"); key=os.getenv("SUPABASE_ANON_KEY","")
    if not url or not key: raise HTTPException(503,"Backend authentication is not configured.")
    async with httpx.AsyncClient(timeout=12) as client:
        try: r=await client.get(url+"/auth/v1/user",headers={"apikey":key,"Authorization":authorization})
        except httpx.HTTPError: raise HTTPException(503,"Could not verify your login right now.")
    if r.status_code!=200: raise HTTPException(401,"Your session is invalid or expired. Please log in again.")
    return r.json()

def rate_limit(uid):
    now=time.time(); q=limits[uid]
    while q and now-q[0]>60: q.popleft()
    if len(q)>=20: raise HTTPException(429,"You're sending requests too quickly. Please wait a minute.")
    q.append(now)

def prompts_for(data):
    subject=data.subject if data.subject in SUBJECTS else "General Studies"
    topic=data.topic[:160]
    common=f" You are Smart AI, a patient educational tutor. Subject: {subject}. Learner topic: {topic}. Adjust explanations to the learner's age and selected level; if level is unknown, use clear accessible language. Teach rather than merely dump answers: explain steps, define terms, use an example, gently address mistakes, and finish with one short understanding-check question. Never shame the learner."
    if data.mode=="hint": return "You are Smart AI's hint coach. Give one helpful hint only, not the full solution. Invite the learner to try the next step. Be encouraging and age-appropriate."
    if data.mode=="quiz": return f'Return only valid JSON. Create exactly 5 age-appropriate multiple-choice questions about {topic} in {subject}, difficulty {data.difficulty}. Shape: {{"title":"...","questions":[{{"question":"...","options":["A. ...","B. ...","C. ...","D. ..."],"answer":0,"explanation":"..."}}]}}. answer is a zero-based index. Exactly four options each.'
    if data.mode=="flashcards": return f'Return only valid JSON with shape {{"cards":[{{"front":"...","back":"..."}}]}}. Create 8 accurate concise revision flashcards about {topic} in {subject}.'
    if data.mode=="planner": return f"You are a supportive study coach. Create a realistic five-day plan for {subject}, goal: {topic}. Include daily objective, short activity, practice and review."
    if data.mode=="vision": return "You are Smart AI, a patient tutor. Read the learner's uploaded school-question image, transcribe the relevant question, mention uncertainty if text is unclear, then teach a step-by-step solution and ask one understanding-check question. Do not invent unreadable text."
    return "You are Smart AI, a patient multi-subject tutor."+common

@app.get("/health")
async def health(): return {"status":"ok","service":"smart-ai-api"}
@app.post("/api/solve")
async def solve(data:SolveRequest, request:Request, authorization:Optional[str]=Header(default=None)):
    student=await student_from_token(authorization); rate_limit(student["id"])
    api_key=os.getenv("GROQ_API_KEY")
    if not api_key: raise HTTPException(503,"AI service is not configured. Set GROQ_API_KEY on Render.")
    messages=[{"role":m.role,"content":m.content} for m in data.messages][-16:]
    if not messages: raise HTTPException(422,"Add a question before sending.")
    if data.image:
        if data.mode!="vision": raise HTTPException(422,"Image questions must use vision mode.")
        user_content=[{"type":"text","text":messages[-1]["content"]},{"type":"image_url","image_url":{"url":data.image}}]
        messages[-1]={"role":"user","content":user_content}
    try:
        client=Groq(api_key=api_key)
        model=os.getenv("GROQ_VISION_MODEL","meta-llama/llama-4-scout-17b-16e-instruct") if data.image else os.getenv("GROQ_MODEL","openai/gpt-oss-120b")
        completion=client.chat.completions.create(model=model,messages=[{"role":"system","content":prompts_for(data)},*messages],temperature=.35 if data.mode in ("quiz","flashcards") else .55,max_tokens=2400)
        answer=completion.choices[0].message.content or "I couldn't generate a response. Please try again."
        return {"answer":answer}
    except Exception as e:
        print("Groq request failed:",repr(e))
        raise HTTPException(502,"Smart AI couldn't reach the AI service. Check the model configuration and try again.")
