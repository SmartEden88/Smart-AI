const cfg = window.SMARTAI_CONFIG || {};
const configured = cfg.SUPABASE_URL?.startsWith("https://") && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_URL.includes("YOUR_");
const API_BASE = (cfg.API_BASE_URL || "").replace(/\/$/, "");
const apiUrl = path => `${API_BASE}${path}`;
const db = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
async function apiHeaders() { const {data:{session}} = await db.auth.getSession(); if (!session?.access_token) throw new Error("Your session has expired. Please log in again."); return {"Content-Type":"application/json","Authorization":`Bearer ${session.access_token}`}; }
const $ = id => document.getElementById(id);
let pendingImage = null, recognition = null;
let user = null, sessionId = null, messages = [], currentMode = "tutor", quizData = null, quizAnswers = [], flashcards = [], flashIndex = 0, flashRevealed = false;
const chatList = $("chatList");

function robotState(state) { const el=$("robotState"); if(el) el.textContent=state; const robot=$("robotGuide"); if(robot) robot.dataset.state=state.toLowerCase(); }
function toast(text) { const el=$("toast"); el.textContent=text; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),3200); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function renderMessage(role, content) {
  $("welcomePanel").style.display = "none";
  const node = document.createElement("article");
  node.className = `message ${role}`;
  node.innerHTML = `<div class="message-avatar">${role==="assistant"?"✦":"You"}</div><div class="message-body"><div class="message-label">${role==="assistant"?"SMART AI":"YOU"}</div><div class="message-content">${escapeHtml(content).replace(/\n/g,"<br>")}</div>${role==="assistant" ? '<button class="mode-chip solution-open">↗ Open in separate window</button>' : ''}</div>`;
  if (role === "assistant") {
    if(role==="assistant" && "speechSynthesis" in window) {
    const speak=document.createElement("button"); speak.className="mode-chip"; speak.textContent="🔊 Read aloud";
    speak.addEventListener("click",()=>{window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(content);u.lang="en-NG";window.speechSynthesis.speak(u);});
    node.querySelector(".message-body").appendChild(speak);
  }
  node.querySelector(".solution-open").addEventListener("click", () => {
      try { localStorage.setItem("mathmate-latest-solution", content); } catch {}
      const popup = window.open("solution.html", "mathmateSolution", "width=720,height=760");
      if ("BroadcastChannel" in window) {
        const channel = new BroadcastChannel("mathmate-solutions");
        channel.postMessage(content);
        setTimeout(() => channel.close(), 500);
      }
      if (!popup) toast("Allow pop-ups for this site to open the separate solution window.");
    });
  }
  chatList.appendChild(node); chatList.scrollTop = chatList.scrollHeight;
}
async function saveSession() {
  if (!db || !user || !sessionId || !messages.length) return;
  const first = messages.find(m=>m.role==="user")?.content || "Study session";
  const title = first.length > 58 ? first.slice(0,55)+"…" : first;
  const {error} = await db.from("work_sessions").upsert({
    id: sessionId, user_id: user.id, title, kind: "tutor", messages, updated_at: new Date().toISOString()
  });
  if (error) console.error("Could not save lesson:", error.message);
}
function newLesson() { sessionId = crypto.randomUUID(); messages=[]; chatList.innerHTML=""; $("welcomePanel").style.display="block"; $("question").value=""; }
async function askTutor(text, mode="tutor") {
  if (!text.trim()) return;
  messages.push({role:"user",content:text});
  renderMessage("user",text);
  $("sendButton").disabled=true; robotState("THINKING");
  const pending=document.createElement("div"); pending.className="typing"; pending.textContent="Smart AI is thinking…"; chatList.appendChild(pending);
  try {
    const res=await fetch(apiUrl("/api/solve"),{method:"POST",headers:await apiHeaders(),body:JSON.stringify({mode:pendingImage?"vision":mode,messages,subject:$("tutorSubject").value,topic:"student-selected school subject",image:pendingImage})});
    const data=await res.json();
    if(!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    const answer=data.answer || "I couldn't create an answer. Try again.";
    messages.push({role:"assistant",content:answer});
    pending.remove(); renderMessage("assistant",answer); robotState("CELEBRATING"); await saveSession(); setTimeout(()=>robotState("READY TO LEARN"),1800); pendingImage=null; $("attachmentStatus").textContent="Photo questions and voice input are supported when your browser allows them.";
  } catch(err) {
    pending.remove(); toast(err.message || "Something went wrong.");
    renderMessage("assistant","I couldn't reach the tutor just now. Please try again. If this continues, check the backend service status.");
  } finally { $("sendButton").disabled=false; }
}
async function loadHistory() {
  const list=$("historyList"); list.innerHTML='<p class="muted">Loading your saved work…</p>';
  const {data,error}=await db.from("work_sessions").select("id,title,kind,updated_at").eq("user_id",user.id).order("updated_at",{ascending:false}).limit(50);
  if(error){list.innerHTML=`<p class="error-text">${escapeHtml(error.message)}</p>`;return;}
  if(data){$("lessonCount").textContent=data.length; $("quizCount").textContent=data.filter(x=>x.kind==="quiz").length;}
  if(!data?.length){list.innerHTML='<div class="empty-state">No saved work yet. Start a lesson or quiz and it will appear here.</div>';return;}
  list.innerHTML="";
  data.forEach(item=>{
    const card=document.createElement("button"); card.className="history-card";
    card.innerHTML=`<span class="history-icon">${item.kind==="quiz"?"▤":"✦"}</span><span class="history-info"><strong>${escapeHtml(item.title)}</strong><small>${new Date(item.updated_at).toLocaleString()} · ${item.kind==="quiz"?"Practice quiz":"Study lesson"}</small></span><span>→</span>`;
    card.addEventListener("click",()=>openSession(item.id)); list.appendChild(card);
  });
}
async function openSession(id) {
  const {data,error}=await db.from("work_sessions").select("*").eq("id",id).eq("user_id",user.id).single();
  if(error){toast("Couldn't open that saved session.");return;}
  if(data.kind==="quiz"){
    const saved = data.messages?.[0]?.content;
    let record = null;
    try { record = JSON.parse(saved); } catch {}
    showView("history");
    const list = $("historyList");
    if (!record?.quiz) { toast("This saved quiz could not be opened."); return; }
    list.innerHTML = `<div class="quiz-paper"><div class="eyebrow">SAVED PRACTICE RESULT</div><h2>${escapeHtml(record.quiz.title || data.title)}</h2><div class="score-panel"><strong>Score: ${record.score}/${record.quiz.questions.length}</strong><p>Your previous answers and explanations are below.</p></div><div id="savedQuizReview"></div></div>`;
    const review = $("savedQuizReview");
    record.quiz.questions.forEach((q,i) => {
      const ok = Number(q.answer) === record.answers[i];
      const item = document.createElement("section");
      item.className = "quiz-question";
      item.innerHTML = `<h3>${i+1}. ${escapeHtml(q.question)}</h3><p class="${ok?"correct-text":"error-text"}">${ok?"Correct":"Your answer: "+escapeHtml(q.options[record.answers[i]] || "Not recorded")}</p><p><strong>Correct answer:</strong> ${escapeHtml(q.options[Number(q.answer)] || "")}</p><p>${escapeHtml(q.explanation || "")}</p>`;
      review.appendChild(item);
    });
    return;
  }
  sessionId=data.id; messages=data.messages||[]; chatList.innerHTML=""; $("welcomePanel").style.display=messages.length?"none":"block";
  messages.forEach(m=>renderMessage(m.role,m.content)); showView("tutor");
}
function showView(view) {
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(v=>v.classList.toggle("active",v.dataset.view===view));
  $(`${view}View`).classList.add("active");
  $("pageTitle").textContent=({tutor:"Smart AI Tutor",study:"Study hub",quiz:"Practice quiz",flashcards:"Smart flashcards",history:"Your past work"})[view];
  if(view==="history") loadHistory();
}
async function startQuiz() {
  const topic=$("quizTopic").value.trim()||"general topic", subject=$("quizSubject").value, difficulty=$("quizDifficulty").value;
  $("startQuiz").disabled=true; $("quizArea").innerHTML='<div class="empty-state">Creating your quiz…</div>';
  try {
    const res=await fetch(apiUrl("/api/solve"),{method:"POST",headers:await apiHeaders(),body:JSON.stringify({mode:"quiz",topic,subject,difficulty,messages:[{role:"user",content:`Create a five-question ${difficulty} quiz about ${topic}.`}]})});
    const data=await res.json(); if(!res.ok) throw new Error(data.error||"Quiz generation failed.");
    const parsed=JSON.parse(data.answer.replace(/```json|```/g,"").trim());
    if(!Array.isArray(parsed.questions)||parsed.questions.length===0) throw new Error("The quiz response was not in the expected format.");
    quizData=parsed; quizAnswers=Array(parsed.questions.length).fill(null); renderQuiz();
  } catch(err){$("quizArea").innerHTML=`<div class="empty-state error-text">${escapeHtml(err.message)}<br>Try again in a moment.</div>`;}
  finally{$("startQuiz").disabled=false;}
}
function renderQuiz() {
  const area=$("quizArea");
  area.innerHTML=`<div class="quiz-paper"><div class="eyebrow">YOUR QUIZ</div><h2>${escapeHtml(quizData.title||"Learning challenge")}</h2><div id="quizQuestions"></div><button class="primary" id="submitQuiz">Check my answers</button><div id="quizResult"></div></div>`;
  const wrap=$("quizQuestions");
  quizData.questions.forEach((q,i)=>{
    const el=document.createElement("section"); el.className="quiz-question";
    el.innerHTML=`<h3>${i+1}. ${escapeHtml(q.question)}</h3><div class="option-list">${q.options.map((o,j)=>`<button class="option ${quizAnswers[i]===j?"selected":""}" data-q="${i}" data-a="${j}">${escapeHtml(o)}</button>`).join("")}</div>`;
    el.querySelectorAll(".option").forEach(btn=>btn.addEventListener("click",()=>{quizAnswers[i]=Number(btn.dataset.a);renderQuiz();}));
    wrap.appendChild(el);
  });
  $("submitQuiz").addEventListener("click",gradeQuiz);
}
async function gradeQuiz() {
  if(quizAnswers.some(a=>a===null)){toast("Answer every question before checking your score.");return;}
  const correct=quizData.questions.filter((q,i)=>Number(q.answer)===quizAnswers[i]).length;
  const result=$("quizResult");
  result.innerHTML=`<div class="score-panel"><strong>Your score: ${correct}/${quizData.questions.length}</strong><p>${correct===5?"Brilliant work!":correct>=3?"Good effort. Review the explanations below.":"Keep practising. You can improve with each try."}</p></div>`;
  quizData.questions.forEach((q,i)=>{
    const ok=Number(q.answer)===quizAnswers[i];
    const el=document.createElement("p"); el.className=ok?"correct-text":"error-text";
    el.textContent=`${i+1}. ${ok?"Correct.":"Not quite."} ${q.explanation||""}`;
    result.appendChild(el);
  });
  if(db&&user){
    const id=crypto.randomUUID();
    const {error}=await db.from("work_sessions").insert({id,user_id:user.id,title:`${quizData.title||"Study quiz"} — ${correct}/${quizData.questions.length}`,kind:"quiz",messages:[{role:"assistant",content:JSON.stringify({quiz:quizData,answers:quizAnswers,score:correct})}]});
    if(error) console.error("Quiz save failed:",error.message);
  }
}

async function createStudyPlan() {
  const subject=$("studySubject").value, topic=$("studyGoal").value.trim() || "Build a strong foundation";
  $("makePlan").disabled=true; $("planArea").innerHTML='<p class="muted">Building your study plan…</p>';
  try {
    const res=await fetch(apiUrl("/api/solve"),{method:"POST",headers:await apiHeaders(),body:JSON.stringify({mode:"planner",subject,topic,messages:[{role:"user",content:`Create a practical 5-day study plan for ${subject}. My goal: ${topic}. Include short sessions, learning objectives and practice.`}]})});
    const data=await res.json(); if(!res.ok) throw new Error(data.error||"Could not create the plan.");
    $("planArea").innerHTML=`<div class="generated-content">${escapeHtml(data.answer||"").replace(/\n/g,"<br>")}</div>`;
  } catch(e) {$("planArea").innerHTML=`<p class="error-text">${escapeHtml(e.message)}</p>`;}
  finally {$("makePlan").disabled=false;}
}
async function createFlashcards() {
  const subject=$("flashSubject").value, topic=$("flashTopic").value.trim()||"key concepts";
  $("makeFlashcards").disabled=true; $("flashArea").innerHTML='<p class="muted">Creating your revision cards…</p>';
  try {
    const res=await fetch(apiUrl("/api/solve"),{method:"POST",headers:await apiHeaders(),body:JSON.stringify({mode:"flashcards",subject,topic,messages:[{role:"user",content:`Create 8 concise question-and-answer flashcards about ${topic} in ${subject}. Return JSON only with {"cards":[{"front":"...","back":"..."}]}.`}]})});
    const data=await res.json(); if(!res.ok) throw new Error(data.error||"Could not create flashcards.");
    const parsed=JSON.parse(String(data.answer||"").replace(/```json|```/g,"").trim());
    if(!Array.isArray(parsed.cards)||!parsed.cards.length) throw new Error("The flashcard response was not in the expected format.");
    flashcards=parsed.cards; flashIndex=0; flashRevealed=false; renderFlashcard();
  } catch(e) {$("flashArea").innerHTML=`<p class="error-text">${escapeHtml(e.message)}</p>`;}
  finally {$("makeFlashcards").disabled=false;}
}
function renderFlashcard() {
  const card=flashcards[flashIndex]; if(!card) return;
  $("flashArea").innerHTML=`<div class="flashcard" role="group" aria-label="Flashcard"><p class="eyebrow">CARD ${flashIndex+1} OF ${flashcards.length}</p><h3>${escapeHtml(flashRevealed?card.back:card.front)}</h3><button class="primary" id="revealCard">${flashRevealed?"Show question":"Reveal answer"}</button><div class="flash-nav"><button class="ghost" id="prevCard" ${flashIndex===0?"disabled":""}>← Previous</button><button class="ghost" id="nextCard" ${flashIndex===flashcards.length-1?"disabled":""}>Next →</button></div></div>`;
  $("revealCard").addEventListener("click",()=>{flashRevealed=!flashRevealed;renderFlashcard();});
  $("prevCard").addEventListener("click",()=>{flashIndex=Math.max(0,flashIndex-1);flashRevealed=false;renderFlashcard();});
  $("nextCard").addEventListener("click",()=>{flashIndex=Math.min(flashcards.length-1,flashIndex+1);flashRevealed=false;renderFlashcard();});
}


function setupVoice() {
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SpeechRecognition){$("voiceButton").disabled=true;$("voiceButton").title="Voice input is not supported in this browser";return;}
  recognition=new SpeechRecognition(); recognition.lang="en-NG"; recognition.interimResults=false;
  recognition.onstart=()=>{robotState("LISTENING");$("voiceButton").classList.add("active");};
  recognition.onresult=e=>{$("question").value=e.results[0][0].transcript;};
  recognition.onerror=()=>toast("Voice input was unavailable. You can type your question instead.");
  recognition.onend=()=>{$("voiceButton").classList.remove("active");robotState("READY TO LEARN");};
  $("voiceButton").addEventListener("click",()=>{try{recognition.start();}catch{recognition.stop();}});
}
function setupPhoto() {
  $("photoButton").addEventListener("click",()=>$("photoInput").click());
  $("photoInput").addEventListener("change",e=>{
    const file=e.target.files?.[0]; if(!file)return;
    if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>5*1024*1024){toast("Choose a PNG, JPEG or WebP image under 5 MB.");e.target.value="";return;}
    const reader=new FileReader();
    reader.onload=()=>{pendingImage=reader.result;$("attachmentStatus").textContent=`Attached: ${file.name}. Add a prompt and send to ask about this image.`;};
    reader.onerror=()=>toast("Could not read that image. Try another file.");
    reader.readAsDataURL(file);
  });
}


async function loadProfile() {
  const {data,error}=await db.from("profiles").select("display_name,learning_level,study_goal").eq("id",user.id).maybeSingle();
  if(error){console.warn("Profile read:",error.message);return;}
  if(data){$("profileName").value=data.display_name||"";$("profileLevel").value=data.learning_level||"Secondary";if(data.study_goal)$("studyGoal").value=data.study_goal;}
}
async function saveProfile() {
  const name=$("profileName").value.trim().slice(0,60)||"Student";
  const level=$("profileLevel").value;
  const goal=$("studyGoal").value.trim().slice(0,120);
  $("saveProfile").disabled=true;
  const {error}=await db.from("profiles").upsert({id:user.id,display_name:name,learning_level:level,study_goal:goal,updated_at:new Date().toISOString()});
  $("saveProfile").disabled=false;
  $("profileStatus").textContent=error?`Could not save: ${error.message}`:"Profile saved.";
  if(!error){$("userEmail").textContent=name;$("avatar").textContent=name.charAt(0).toUpperCase();}
}

async function init() {
  if(!db){document.body.innerHTML='<main class="setup-notice"><h1>One setup step left</h1><p>Add your Supabase project URL and anon key in <code>public/config.js</code>, then redeploy.</p><p>Your Groq API key must remain in Netlify environment variables only.</p></main>';return;}
  const {data:{session}}=await db.auth.getSession();
  if(!session){location.href="auth.html";return;}
  user=session.user; $("userEmail").textContent=user.email||"Student"; $("avatar").textContent=(user.email||"M").charAt(0).toUpperCase(); await loadProfile();
  $("chatForm").addEventListener("submit",e=>{e.preventDefault();const text=$("question").value.trim();if(text){$("question").value="";askTutor(text,currentMode);}});
  $("newChat").addEventListener("click",newLesson);
  $("tutorMode").addEventListener("click",()=>{currentMode="tutor";$("tutorMode").classList.add("active");$("hintMode").classList.remove("active");});
  $("hintMode").addEventListener("click",()=>{currentMode="hint";$("hintMode").classList.add("active");$("tutorMode").classList.remove("active");});
  document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
  document.querySelectorAll(".suggestion").forEach(b=>b.addEventListener("click",()=>askTutor(b.dataset.prompt)));
  $("startQuiz").addEventListener("click",startQuiz);
  $("makePlan").addEventListener("click",createStudyPlan);
  $("makeFlashcards").addEventListener("click",createFlashcards);
  $("saveProfile").addEventListener("click",saveProfile);
  setupVoice(); setupPhoto();
  $("logout").addEventListener("click",async()=>{await db.auth.signOut();location.href="auth.html";});
  newLesson();
}
init();