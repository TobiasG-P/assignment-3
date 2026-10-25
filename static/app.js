// Margin Study — frontend logic.
// Notes and decks live in localStorage; AI work goes through the Flask API.

const $ = (id) => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------------------------------------------------------------- storage
const store = {
  load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },
  save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
  },
};

const state = {
  notes: store.load("margin.notes", []),
  decks: store.load("margin.decks", []),
  currentNoteId: null,
  currentDeckId: null,
};
const saveNotes = () => store.save("margin.notes", state.notes);
const saveDecks = () => store.save("margin.decks", state.decks);
const noteById = (id) => state.notes.find((n) => n.id === id);
const deckById = (id) => state.decks.find((d) => d.id === id);

// ---------------------------------------------------------------- helpers
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2200);
}

async function api(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data;
  try { data = await res.json(); } catch { throw new Error("The server sent an unreadable reply. Is app.py running?"); }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

function busy(btn, on, label) {
  if (on) {
    btn.dataset.label = btn.textContent;
    btn.textContent = label;
    btn.classList.add("loading");
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.label || btn.textContent;
    btn.classList.remove("loading");
    btn.disabled = false;
  }
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const noteLabel = (n) => n.title.trim() || "Untitled note";

function fillNoteSelect(select, preferId) {
  select.innerHTML = "";
  const usable = state.notes.filter((n) => n.body.trim());
  if (!usable.length) {
    select.append(el("option", { value: "", text: "Write a note first" }));
    select.disabled = true;
    return;
  }
  select.disabled = false;
  for (const n of usable) select.append(el("option", { value: n.id, text: noteLabel(n) }));
  if (preferId && usable.some((n) => n.id === preferId)) select.value = preferId;
}

// ---------------------------------------------------------------- navigation
function showView(name) {
  for (const v of ["notes", "quiz", "cards"]) $(`view-${v}`).hidden = v !== name;
  document.querySelectorAll(".nav-btn").forEach((b) => {
    if (b.dataset.view === name) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  if (name === "quiz") fillNoteSelect($("quiz-note"), state.currentNoteId);
  if (name === "cards") renderDecks();
}
document.querySelectorAll(".nav-btn").forEach((b) =>
  b.addEventListener("click", () => showView(b.dataset.view))
);

// ---------------------------------------------------------------- notes
function renderNoteList() {
  const list = $("note-list");
  list.innerHTML = "";
  const sorted = [...state.notes].sort((a, b) => b.updated - a.updated);
  for (const n of sorted) {
    const btn = el("button", { onclick: () => openNote(n.id) },
      el("span", { class: "t", text: noteLabel(n) }),
      el("span", { class: "d", text: fmtDate(n.updated) }));
    if (n.id === state.currentNoteId) btn.setAttribute("aria-current", "true");
    list.append(el("li", {}, btn));
  }
  const has = state.notes.length > 0;
  $("notes-empty").hidden = has;
  $("editor").hidden = !has || !state.currentNoteId;
}

function openNote(id) {
  state.currentNoteId = id;
  const n = noteById(id);
  $("note-title").value = n.title;
  $("note-body").value = n.body;
  renderNoteList();
}

function newNote() {
  const n = { id: uid(), title: "", body: "", updated: Date.now() };
  state.notes.push(n);
  saveNotes();
  openNote(n.id);
  $("note-title").focus();
}
$("new-note").onclick = newNote;
$("new-note-empty").onclick = newNote;

let saveTimer;
function updateCurrentNote(fields) {
  const n = noteById(state.currentNoteId);
  if (!n) return;
  Object.assign(n, fields, { updated: Date.now() });
  $("saved").textContent = "Saving…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveNotes();
    $("saved").textContent = "Saved";
    renderNoteList();
  }, 400);
}
$("note-title").addEventListener("input", (e) => updateCurrentNote({ title: e.target.value }));
$("note-body").addEventListener("input", (e) => updateCurrentNote({ body: e.target.value }));

$("delete-note").onclick = () => {
  const n = noteById(state.currentNoteId);
  if (!n || !confirm(`Delete "${noteLabel(n)}"? This can't be undone.`)) return;
  state.notes = state.notes.filter((x) => x.id !== n.id);
  saveNotes();
  state.currentNoteId = state.notes[0]?.id || null;
  if (state.currentNoteId) openNote(state.currentNoteId);
  else renderNoteList();
  toast("Note deleted");
};

$("quiz-this").onclick = () => {
  showView("quiz");
  resetQuiz();
  fillNoteSelect($("quiz-note"), state.currentNoteId);
};
$("cards-this").onclick = () => {
  const n = noteById(state.currentNoteId);
  if (!n.body.trim()) return toast("Write something in the note first");
  let deck = state.decks.find((d) => d.sourceNoteId === n.id);
  if (!deck) {
    deck = { id: uid(), name: noteLabel(n), cards: [], sourceNoteId: n.id };
    state.decks.push(deck);
    saveDecks();
  }
  showView("cards");
  openDeck(deck.id);
  fillNoteSelect($("gen-note"), n.id);
};

// ---------------------------------------------------------------- focus mode
const focus = { end: 0, timer: null };

function startFocus(minutes) {
  const n = noteById(state.currentNoteId);
  if (!n) return;
  $("focus-title").value = n.title;
  $("focus-body").value = n.body;
  $("focus").hidden = false;
  $("focus-done").hidden = true;
  document.body.style.overflow = "hidden";
  focus.end = Date.now() + minutes * 60000;
  focus.minutes = minutes;
  tickFocus();
  clearInterval(focus.timer);
  focus.timer = setInterval(tickFocus, 500);
  document.documentElement.requestFullscreen?.().catch(() => {});
  $("focus-body").focus();
}

function tickFocus() {
  const left = Math.max(0, focus.end - Date.now());
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const t = $("focus-timer");
  t.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  t.classList.toggle("low", left < 60000);
  document.title = `${t.textContent} · Focus`;
  if (left === 0) finishFocus();
}

function finishFocus() {
  clearInterval(focus.timer);
  const words = $("focus-body").value.trim().split(/\s+/).filter(Boolean).length;
  $("focus-done-msg").textContent = `Nice work. This note now has ${words} words.`;
  $("focus-done").hidden = false;
  chime();
}

function closeFocus() {
  clearInterval(focus.timer);
  $("focus").hidden = true;
  document.body.style.overflow = "";
  document.title = "Margin Study";
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  openNote(state.currentNoteId);
}

function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.25);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.25);
      o.stop(ctx.currentTime + i * 0.25 + 0.6);
    });
  } catch { /* audio not available */ }
}

$("focus-btn").onclick = () => startFocus(Number($("focus-min").value));
$("focus-title").addEventListener("input", (e) => updateCurrentNote({ title: e.target.value }));
$("focus-body").addEventListener("input", (e) => updateCurrentNote({ body: e.target.value }));
$("focus-end").onclick = () => {
  if (Date.now() < focus.end && !confirm("End the focus session early?")) return;
  closeFocus();
};
$("focus-close").onclick = closeFocus;
$("focus-more").onclick = () => {
  $("focus-done").hidden = true;
  focus.end = Date.now() + 5 * 60000;
  focus.timer = setInterval(tickFocus, 500);
  $("focus-body").focus();
};

// ---------------------------------------------------------------- quiz
const quiz = { questions: [], i: 0, results: [], notes: "", noteId: null };

function resetQuiz() {
  $("quiz-setup").hidden = false;
  $("quiz-run").hidden = true;
  $("quiz-done").hidden = true;
  $("quiz-error").textContent = "";
}

async function startQuiz() {
  const noteId = $("quiz-note").value;
  const n = noteById(noteId);
  if (!n) { $("quiz-error").textContent = "Write a note first, then come back here."; return; }
  const type = document.querySelector('input[name="qtype"]:checked').value;
  const count = Number($("quiz-count").value) || 5;
  const btn = $("quiz-start");
  $("quiz-error").textContent = "";
  busy(btn, true, "Writing questions");
  try {
    const data = await api("/api/quiz", { notes: n.body, type, count });
    Object.assign(quiz, { questions: data.questions, i: 0, results: [], notes: n.body, noteId });
    $("quiz-setup").hidden = true;
    $("quiz-run").hidden = false;
    renderQuestion();
  } catch (e) {
    $("quiz-error").textContent = e.message;
  } finally {
    busy(btn, false);
  }
}
$("quiz-start").onclick = startQuiz;

function renderQuestion() {
  const q = quiz.questions[quiz.i];
  const total = quiz.questions.length;
  $("quiz-progress").style.width = `${(quiz.i / total) * 100}%`;
  $("q-count").textContent = `Question ${quiz.i + 1} of ${total} · ${q.type === "mc" ? "Multiple choice" : "Written answer"}`;
  $("q-text").textContent = q.question;
  $("q-feedback").hidden = true;
  $("q-next").hidden = true;
  const body = $("q-body");
  body.innerHTML = "";

  if (q.type === "mc") {
    const wrap = el("div", { class: "options" });
    q.options.forEach((opt, idx) => {
      wrap.append(el("button", { class: "option", onclick: () => answerMC(idx) },
        el("span", { class: "k", text: "ABCDEFG"[idx] }),
        el("span", { text: opt })));
    });
    body.append(wrap);
  } else {
    const ta = el("textarea", { id: "written-answer", placeholder: "Write your answer in your own words…", "aria-label": "Your answer" });
    const check = el("button", { class: "btn btn-primary", id: "check-btn", text: "Check answer", onclick: answerWritten });
    body.append(el("div", { class: "written" }, ta, check));
    ta.focus();
  }
}

function answerMC(idx) {
  const q = quiz.questions[quiz.i];
  const buttons = document.querySelectorAll(".option");
  buttons.forEach((b, i) => {
    b.disabled = true;
    if (i === q.answer_index) b.classList.add("right");
    else if (i === idx) b.classList.add("wrong");
  });
  const correct = idx === q.answer_index;
  quiz.results.push({ q, correct, score: correct ? 100 : 0, given: q.options[idx] });
  showFeedback(correct ? "good" : "bad",
    correct ? "Correct" : "Not quite",
    correct ? q.explanation : `The answer is "${q.options[q.answer_index]}". ${q.explanation}`);
}

async function answerWritten() {
  const q = quiz.questions[quiz.i];
  const answer = $("written-answer").value.trim();
  if (!answer) { toast("Write an answer first"); return; }
  const btn = $("check-btn");
  busy(btn, true, "Checking");
  try {
    const r = await api("/api/grade", { notes: quiz.notes, question: q.question, model_answer: q.model_answer, answer });
    $("written-answer").disabled = true;
    btn.hidden = true;
    const tone = r.score >= 75 ? "good" : r.score >= 40 ? "mid" : "bad";
    const title = { good: "Correct", mid: "Partly correct", bad: "Not quite" }[tone] + ` · ${r.score}/100`;
    quiz.results.push({ q, correct: tone === "good", partial: tone === "mid", score: r.score, given: answer });
    showFeedback(tone, title, r.feedback, r.correction);
  } catch (e) {
    busy(btn, false);
    toast(e.message);
    return;
  }
}

function showFeedback(tone, title, text, correction) {
  const fb = $("q-feedback");
  fb.className = `feedback ${tone}`;
  fb.innerHTML = "";
  fb.append(el("h3", { text: title }));
  if (text) fb.append(el("p", { text }));
  if (correction) fb.append(el("p", { class: "correction" }, el("strong", { text: "Correct answer: " }), correction));
  fb.hidden = false;
  const next = $("q-next");
  next.textContent = quiz.i + 1 < quiz.questions.length ? "Next question" : "See results";
  next.hidden = false;
  next.focus();
}

$("q-next").onclick = () => {
  quiz.i++;
  if (quiz.i < quiz.questions.length) renderQuestion();
  else finishQuiz();
};

function finishQuiz() {
  $("quiz-run").hidden = true;
  $("quiz-done").hidden = false;
  const avg = Math.round(quiz.results.reduce((s, r) => s + r.score, 0) / quiz.results.length);
  $("done-score").textContent = `You scored ${avg}%`;
  $("done-msg").textContent =
    avg >= 85 ? "You know this material well. Try written questions to push yourself."
    : avg >= 55 ? "A solid start. Look over the questions you missed, then try again."
    : "Worth another read of your notes. Then run a new quiz.";
  const list = $("done-review");
  list.innerHTML = "";
  for (const r of quiz.results) {
    const cls = r.correct ? "ok" : r.partial ? "part" : "no";
    const label = r.correct ? "Correct" : r.partial ? "Partly correct" : "Missed";
    list.append(el("li", {},
      el("strong", { text: r.q.question }),
      el("p", {}, el("span", { class: cls, text: label }), ` · Your answer: ${r.given}`)));
  }
}

$("quiz-retry").onclick = () => {
  $("quiz-done").hidden = true;
  $("quiz-setup").hidden = false;
  $("quiz-note").value = quiz.noteId;
  startQuiz();
};
$("quiz-back").onclick = resetQuiz;
$("quiz-quit").onclick = () => { if (confirm("Quit this quiz?")) resetQuiz(); };

// ---------------------------------------------------------------- flashcards
function renderDecks() {
  $("deck-index").hidden = false;
  $("deck-detail").hidden = true;
  $("study").hidden = true;
  const grid = $("deck-grid");
  grid.innerHTML = "";
  if (!state.decks.length) {
    grid.append(el("li", { class: "empty" }, el("p", { text: "No decks yet. Create one above, or open a note and choose Make flashcards." })));
    return;
  }
  for (const d of state.decks) {
    grid.append(el("li", {}, el("button", { onclick: () => openDeck(d.id) },
      el("span", { class: "n", text: d.name }),
      el("span", { class: "c", text: `${d.cards.length} card${d.cards.length === 1 ? "" : "s"}` }))));
  }
}

$("deck-form").onsubmit = (e) => {
  e.preventDefault();
  const name = $("deck-name").value.trim();
  if (!name) return;
  const d = { id: uid(), name, cards: [] };
  state.decks.push(d);
  saveDecks();
  $("deck-name").value = "";
  openDeck(d.id);
};

function openDeck(id) {
  state.currentDeckId = id;
  const d = deckById(id);
  $("deck-index").hidden = true;
  $("study").hidden = true;
  $("deck-detail").hidden = false;
  $("deck-title").value = d.name;
  $("gen-error").textContent = "";
  fillNoteSelect($("gen-note"), d.sourceNoteId || state.currentNoteId);
  renderCards();
}

function renderCards() {
  const d = deckById(state.currentDeckId);
  $("card-count").textContent = d.cards.length ? `${d.cards.length} card${d.cards.length === 1 ? "" : "s"}` : "No cards yet";
  $("study-btn").disabled = !d.cards.length;
  const list = $("card-list");
  list.innerHTML = "";
  for (const c of d.cards) {
    const edit = (field) => (e) => { c[field] = e.target.textContent.trim(); saveDecks(); };
    list.append(el("li", {},
      el("div", { class: "f", contenteditable: "true", "aria-label": "Front", onblur: edit("front"), text: c.front }),
      el("div", { class: "b", contenteditable: "true", "aria-label": "Back", onblur: edit("back"), text: c.back }),
      el("button", { class: "x", "aria-label": "Delete card", title: "Delete card", text: "×",
        onclick: () => { d.cards = d.cards.filter((x) => x.id !== c.id); saveDecks(); renderCards(); } })));
  }
}

$("deck-title").addEventListener("input", (e) => {
  deckById(state.currentDeckId).name = e.target.value.trim() || "Untitled deck";
  saveDecks();
});
$("deck-back").onclick = renderDecks;
$("delete-deck").onclick = () => {
  const d = deckById(state.currentDeckId);
  if (!confirm(`Delete the deck "${d.name}" and its ${d.cards.length} cards?`)) return;
  state.decks = state.decks.filter((x) => x.id !== d.id);
  saveDecks();
  renderDecks();
  toast("Deck deleted");
};

$("card-form").onsubmit = (e) => {
  e.preventDefault();
  const front = $("card-front").value.trim();
  const back = $("card-back").value.trim();
  if (!front || !back) return;
  deckById(state.currentDeckId).cards.push({ id: uid(), front, back });
  saveDecks();
  $("card-front").value = "";
  $("card-back").value = "";
  $("card-front").focus();
  renderCards();
  toast("Card added");
};

$("gen-btn").onclick = async () => {
  const n = noteById($("gen-note").value);
  if (!n) { $("gen-error").textContent = "Write a note first, then come back here."; return; }
  const btn = $("gen-btn");
  $("gen-error").textContent = "";
  busy(btn, true, "Making cards");
  try {
    const data = await api("/api/flashcards", { notes: n.body, count: Number($("gen-count").value) || 10 });
    const d = deckById(state.currentDeckId);
    d.cards.push(...data.cards.map((c) => ({ id: uid(), ...c })));
    saveDecks();
    renderCards();
    toast(`Added ${data.cards.length} cards`);
  } catch (e) {
    $("gen-error").textContent = e.message;
  } finally {
    busy(btn, false);
  }
};

// Study session: cards marked "Again" go back into the queue.
const study = { queue: [], known: 0, again: 0 };

function startStudy() {
  const d = deckById(state.currentDeckId);
  study.queue = [...d.cards].sort(() => Math.random() - 0.5);
  study.total = study.queue.length;
  study.known = 0;
  study.again = 0;
  $("deck-detail").hidden = true;
  $("study").hidden = false;
  $("study-done").hidden = true;
  showCard();
}

function showCard() {
  const flip = $("flip");
  const c = study.queue[0];
  if (!c) {
    flip.parentElement.hidden = true;
    $("study-grade").hidden = true;
    document.querySelector(".hint").hidden = true;
    $("study-done").hidden = false;
    $("study-summary").textContent = `You went through ${study.total} cards and asked to see ${study.again} again.`;
    $("study-count").textContent = "";
    return;
  }
  flip.parentElement.hidden = false;
  document.querySelector(".hint").hidden = false;
  flip.classList.remove("flipped");
  $("study-grade").hidden = true;
  // Swap text after the card has turned back so the answer isn't revealed.
  setTimeout(() => {
    $("flip-front").textContent = c.front;
    $("flip-back").textContent = c.back;
  }, flip.dataset.used ? 250 : 0);
  flip.dataset.used = "1";
  $("study-count").textContent = `${study.known} of ${study.total} learned`;
  flip.focus();
}

function flipCard() {
  $("flip").classList.toggle("flipped");
  $("study-grade").hidden = false;
}

function gradeCard(knew) {
  const c = study.queue.shift();
  if (knew) study.known++;
  else { study.again++; study.queue.push(c); }
  showCard();
}

$("flip").onclick = flipCard;
$("got").onclick = () => gradeCard(true);
$("again").onclick = () => gradeCard(false);
$("study-btn").onclick = startStudy;
$("study-restart").onclick = startStudy;
$("study-exit").onclick = () => openDeck(state.currentDeckId);
$("study-leave").onclick = () => openDeck(state.currentDeckId);

document.addEventListener("keydown", (e) => {
  if ($("study").hidden || !$("study-done").hidden) return;
  if (e.target.matches("input, textarea, [contenteditable]")) return;
  if (e.code === "Space") { e.preventDefault(); flipCard(); }
  if (!$("study-grade").hidden) {
    if (e.key === "1") gradeCard(false);
    if (e.key === "2") gradeCard(true);
  }
});

// ---------------------------------------------------------------- start
fetch("/api/status")
  .then((r) => r.json())
  .then(({ provider, model }) => {
    $("provider").textContent = {
      anthropic: "AI: Claude",
      openai: "AI: OpenAI",
      ollama: `AI: Ollama (${model}), free and local`,
      mock: "AI: offline demo mode (start Ollama or add an API key for real feedback)",
    }[provider] || `AI: ${provider}`;
  })
  .catch(() => { $("provider").textContent = "AI server not reachable. Run python app.py"; });

if (state.notes.length) openNote([...state.notes].sort((a, b) => b.updated - a.updated)[0].id);
else renderNoteList();
