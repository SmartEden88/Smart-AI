const target = document.getElementById("solutionContent");
function showSolution(text) { target.textContent = text || "No solution has been sent yet."; }
if ("BroadcastChannel" in window) {
  const channel = new BroadcastChannel("mathmate-solutions");
  channel.onmessage = event => showSolution(event.data);
}
window.addEventListener("storage", event => {
  if (event.key === "mathmate-latest-solution" && event.newValue) showSolution(event.newValue);
});
const saved = localStorage.getItem("mathmate-latest-solution");
if (saved) showSolution(saved);
