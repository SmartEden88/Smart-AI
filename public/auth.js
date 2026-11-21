const cfg = window.SMARTAI_CONFIG || {};
const ready = cfg.SUPABASE_URL?.startsWith("https://") && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_URL.includes("YOUR_");
const client = ready ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
let mode = "login";
const $ = id => document.getElementById(id);
function message(text, error=false) { $("authMessage").textContent = text; $("authMessage").className = "form-message " + (error ? "error" : "success"); }
function setMode(next) {
  mode = next;
  $("loginTab").classList.toggle("active", mode === "login");
  $("signupTab").classList.toggle("active", mode === "signup");
  $("authTitle").textContent = mode === "login" ? "Welcome back" : "Create your account";
  $("authSubtitle").textContent = mode === "login" ? "Log in to continue learning where you left off." : "Create an account to save your learning journey.";
  $("submitAuth").textContent = mode === "login" ? "Log in" : "Create account";
  $("password").autocomplete = mode === "login" ? "current-password" : "new-password";
  message("");
}
$("loginTab").addEventListener("click", () => setMode("login"));
$("signupTab").addEventListener("click", () => setMode("signup"));
$("forgotPassword").addEventListener("click", async () => {
  if (!client) return message("Configure Supabase first.", true);
  const email=$("email").value.trim();
  if(!email) return message("Enter your email address first.", true);
  try { const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+"/auth.html"}); if(error) throw error; message("If the account exists, a password reset email has been sent."); }
  catch(e){message(e.message||"Could not request a reset.",true);}
});
$("authForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!client) return message("Add your Supabase project URL and anon key in public/config.js first.", true);
  const email = $("email").value.trim();
  const password = $("password").value;
  $("submitAuth").disabled = true;
  message(mode === "login" ? "Logging in…" : "Creating your account…");
  try {
    const result = mode === "login"
      ? await client.auth.signInWithPassword({ email, password })
      : await client.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + "/auth.html" } });
    if (result.error) throw result.error;
    if (mode === "signup" && !result.data.session) {
      message("Account created! Check your email for a confirmation link, then log in.");
    } else {
      location.href = "index.html";
    }
  } catch (err) {
    message(err.message || "Unable to authenticate. Please try again.", true);
  } finally { $("submitAuth").disabled = false; }
});
if (client) client.auth.getSession().then(({data}) => { if (data.session && !location.hash.includes("type=recovery")) location.href = "index.html"; });
if(client){
  client.auth.onAuthStateChange((event) => {
    if(event==="PASSWORD_RECOVERY"){
      $("authForm").hidden=true;
      document.querySelector(".auth-tabs").hidden=true;
      $("passwordResetPanel").hidden=false;
      $("authTitle").textContent="Set a new password";
      $("authSubtitle").textContent="Choose a new password for your Smart AI account.";
    }
  });
  $("passwordResetForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const password=$("newPassword").value;
    if(password.length<8)return message("Use at least 8 characters.",true);
    try{
      const {error}=await client.auth.updateUser({password});
      if(error)throw error;
      message("Password updated. You can now continue learning.");
      setTimeout(()=>location.href="index.html",900);
    }catch(err){message(err.message||"Could not update your password.",true);}
  });
}
