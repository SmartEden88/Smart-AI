import Groq from "groq-sdk";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const subjects = ["Mathematics","English Language","Biology","Chemistry","Physics","Basic Science","Agricultural Science","Economics","Government","Geography","History","Literature in English","Civic Education","Computer Studies","Business Studies","Accounting","French","Religious Studies"];
const jsonOnly = "Return only valid JSON. Do not wrap it in markdown fences.";

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers });
  try {
    const apiKey = process.env.Groq_Api_Key || process.env.GROQ_API_KEY;
    if (!apiKey) return new Response(JSON.stringify({ error: "Groq API key is missing. Add GROQ_API_KEY to Netlify environment variables." }), { status: 500, headers });
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    const bearer = req.headers.get("authorization") || "";
    const accessToken = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(JSON.stringify({ error: "Authentication is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to Netlify environment variables." }), { status: 503, headers });
    }
    if (!accessToken) return new Response(JSON.stringify({ error: "Please log in to use Smart AI." }), { status: 401, headers });
    const authCheck = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${accessToken}` }
    });
    if (!authCheck.ok) return new Response(JSON.stringify({ error: "Your login session is invalid or expired. Please log in again." }), { status: 401, headers });

    const body = await req.json();
    const { messages = [], mode = "tutor", topic = "general topic", difficulty = "medium" } = body;
    const subject = subjects.includes(body.subject) ? body.subject : "General Studies";
    const prompts = {
      tutor: `You are Smart AI, a supportive, expert school-subject tutor. The selected subject is ${subject}; topic: ${topic}. Teach learners across school subjects, not just mathematics. Explain accurately in clear, age-appropriate steps, define key vocabulary, give a relevant example, check understanding with one short question, and adapt to the learner's level. For languages, help with grammar, reading and writing; sciences, explain concepts and evidence; humanities, give context and balanced explanations; maths, show workings. Be encouraging and never shame the learner. If a question is outside school learning, answer briefly and safely or explain the limit.`,
      hint: `You are Smart AI's hint coach for ${subject}. Give one useful hint at a time without immediately giving the full answer. Explain the idea to consider and invite the learner to attempt the next step. Be supportive and age-appropriate.`,
      quiz: `${jsonOnly} Create exactly 5 accurate, age-appropriate multiple-choice questions for ${subject} about ${topic} at ${difficulty} difficulty. Use this shape: {"title":"...","questions":[{"question":"...","options":["A. ...","B. ...","C. ...","D. ..."],"answer":0,"explanation":"..."}]}. answer is the zero-based correct option index. Ensure exactly four options per question.`,
      explain: `You are Smart AI. Explain the learner's submitted work or concept in ${subject} clearly. Correct misunderstandings gently and show reasoning.`,
      flashcards: `${jsonOnly} Create 8 useful revision cards for ${subject} about ${topic}. Shape: {"cards":[{"front":"question or key term","back":"clear concise answer"}]}.`,
      planner: `You are Smart AI, a study coach. Create a realistic, encouraging five-day study plan for ${subject} based on this goal: ${topic}. Include a daily objective, a short learning activity, practice and a brief review. Use manageable sessions and plain text.`
    };
    const selectedPrompt = prompts[mode] || prompts.tutor;
    const safeMessages = Array.isArray(messages) ? messages.slice(-16).map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").slice(0, 6000)
    })) : [];
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      messages: [{ role: "system", content: selectedPrompt }, ...safeMessages],
      temperature: ["quiz","flashcards"].includes(mode) ? 0.35 : 0.6,
      max_tokens: mode === "quiz" ? 2200 : mode === "flashcards" ? 1800 : 1800
    });
    const answer = completion.choices?.[0]?.message?.content || "I couldn't generate a response. Please try again.";
    return new Response(JSON.stringify({ answer }), { status: 200, headers });
  } catch (error) {
    console.error("Smart AI function error:", error);
    return new Response(JSON.stringify({ error: error?.message || "Something went wrong while contacting Smart AI." }), { status: 500, headers });
  }
};
