const SECTIONS = {
  vocab: { title: "Vocabulary", bank: window.VOCAB_BANK },
  comp:  { title: "Comprehension", bank: window.COMP_BANK },
  cloze: { title: "Cloze", bank: window.CLOZE_BANK },
};
const RESUME_KEY = "judys_appalachia_review_resume_v1";

const coverSection  = document.getElementById("coverSection");
const statsSection  = document.getElementById("view-stats");
const quizSection   = document.getElementById("view-quiz");
const resultSection = document.getElementById("view-result");

const tabs          = document.querySelectorAll(".tab");
const startBtn      = document.getElementById("startBtn");
const resumeBtn     = document.getElementById("resumeBtn");
const statsBtn      = document.getElementById("statsBtn");
const backFromStats = document.getElementById("backFromStats");
const clearStatsBtn = document.getElementById("clearStatsBtn");

const quizTitleEl   = document.getElementById("quizTitle");
const counterEl     = document.getElementById("questionCounter");
const progressBarEl = document.getElementById("progressBar");
const promptEl      = document.getElementById("prompt");
const readAloudBtn  = document.getElementById("readAloudBtn");
const choicesWrap   = document.getElementById("choicesWrap");
const feedbackEl    = document.getElementById("feedback");
const checkBtn      = document.getElementById("checkBtn");
const nextBtn       = document.getElementById("nextBtn");

const resultTitleEl = document.getElementById("resultTitle");
const resultStatsEl = document.getElementById("resultStats");
const retryBtn      = document.getElementById("retryBtn");
const toTopBtn      = document.getElementById("toTop");

const vocabHistoryEl = document.getElementById("vocabHistory");
const compHistoryEl  = document.getElementById("compHistory");
const clozeHistoryEl = document.getElementById("clozeHistory");

let currentSectionKey = "vocab";
let session       = null;
let selected      = new Set();
let questionLocked = false;
let isQuizActive  = false;

// ── Resume & History ──────────────────────────────────────────
function saveResume() {
  if (session && isQuizActive) localStorage.setItem(RESUME_KEY, JSON.stringify(session));
}

function checkResume() {
  const saved = localStorage.getItem(RESUME_KEY);
  if (saved && resumeBtn) {
    const data = JSON.parse(saved);
    resumeBtn.textContent = "Resume " + data.title + " (" + (data.idx + 1) + "/" + data.total + ")";
    resumeBtn.style.display = "inline-block";
  } else if (resumeBtn) {
    resumeBtn.style.display = "none";
  }
}

function clearHistory() {
  const pin = prompt("Enter Teacher PIN (9377) to clear history:");
  if (pin === "9377") {
    if (confirm("Delete all progress reports?")) {
      localStorage.removeItem("kids_review_history");
      showStats();
    }
  } else if (pin !== null) {
    alert("Incorrect PIN.");
  }
}

// ── Read Aloud with Word Highlighting ────────────────────────
function wrapWords(text, idPrefix) {
  return text.split(' ').map((word, i) =>
    '<span id="' + idPrefix + '-' + i + '">' + word + '</span>'
  ).join(' ');
}

function speakQuestion() {
  window.speechSynthesis.cancel();
  const parts = [];
  parts.push({ text: promptEl.innerText.replace(/_+/g, "blank"), prefix: 'prompt' });
  document.querySelectorAll(".choice").forEach((btn, i) => {
    parts.push({
      text: "Choice " + String.fromCharCode(65 + i) + ". " + btn.querySelector('.choice-text').innerText.replace(/_+/g, "blank"),
      prefix: "choice-" + i
    });
  });

  let partIdx = 0;
  function speakNext() {
    if (partIdx >= parts.length) {
      document.querySelectorAll('.highlight-word').forEach(el => el.classList.remove('highlight-word'));
      return;
    }
    const part = parts[partIdx];
    const utterance = new SpeechSynthesisUtterance(part.text);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        const textUpToHere = part.text.substring(0, event.charIndex);
        let wordIdx = textUpToHere.trim().split(/\s+/).length - 1;
        if (event.charIndex === 0) wordIdx = 0;
        if (part.prefix.startsWith('choice')) wordIdx -= 2;
        document.querySelectorAll('.highlight-word').forEach(el => el.classList.remove('highlight-word'));
        const target = document.getElementById(part.prefix + "-" + wordIdx);
        if (target) target.classList.add('highlight-word');
      }
    };
    utterance.onend = () => { partIdx++; speakNext(); };
    window.speechSynthesis.speak(utterance);
  }
  speakNext();
}

// ── Quiz Flow ─────────────────────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function startQuiz() {
  localStorage.removeItem(RESUME_KEY);
  const config = SECTIONS[currentSectionKey];
  let rawBank = [];

  if (currentSectionKey === "vocab") {
    rawBank = config.bank.map(wordPair => Math.random() < 0.5 ? wordPair.def : wordPair.usage);
  } else {
    rawBank = [...config.bank];
  }

  const bank = rawBank.map(q => {
    let choices = q.choices.map((text, i) => ({ text, originalIdx: i }));
    shuffle(choices);
    let newAns;
    if (Array.isArray(q.answer)) {
      newAns = q.answer.map(ansIdx => choices.findIndex(c => c.originalIdx === ansIdx));
    } else {
      newAns = choices.findIndex(c => c.originalIdx === q.answer);
    }
    return { q: q.q, choices: choices.map(c => c.text), answer: newAns };
  });

  shuffle(bank);
  session = { key: currentSectionKey, title: config.title, bank, idx: 0, correct: 0, total: bank.length };
  isQuizActive = true;
  showView(quizSection);
  renderQuestion();
}

function resumeQuiz() {
  session = JSON.parse(localStorage.getItem(RESUME_KEY));
  isQuizActive = true;
  showView(quizSection);
  renderQuestion();
}

function renderQuestion() {
  const q = session.bank[session.idx];
  quizTitleEl.textContent = session.title;
  counterEl.textContent = "Question " + (session.idx + 1) + " of " + session.total;
  progressBarEl.style.width = (session.idx / session.total) * 100 + "%";
  promptEl.innerHTML = wrapWords(q.q, 'prompt');
  choicesWrap.innerHTML = "";
  selected.clear();
  questionLocked = false;
  feedbackEl.textContent = "";
  nextBtn.disabled = true;
  checkBtn.disabled = false;

  q.choices.forEach((text, i) => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.innerHTML = '<strong>' + ["A","B","C","D","E"][i] + '.</strong> <span class="choice-text">' + wrapWords(text, "choice-" + i) + '</span>';
    btn.onclick = () => {
      if (!questionLocked) {
        if (Array.isArray(q.answer)) {
          if (selected.has(i)) { selected.delete(i); btn.classList.remove("selected"); }
          else { selected.add(i); btn.classList.add("selected"); }
        } else {
          selected.clear();
          document.querySelectorAll(".choice").forEach(b => b.classList.remove("selected"));
          btn.classList.add("selected");
          selected.add(i);
        }
      }
    };
    choicesWrap.appendChild(btn);
  });
  saveResume();
}

function grade() {
  if (selected.size === 0) return;
  const q = session.bank[session.idx];
  let isCorrect = false;

  if (Array.isArray(q.answer)) {
    isCorrect = selected.size === q.answer.length && [...selected].every(val => q.answer.includes(val));
  } else {
    isCorrect = Array.from(selected)[0] === q.answer;
  }

  if (isCorrect) {
    session.correct++;
    feedbackEl.textContent = "Correct!";
    feedbackEl.className = "feedback correct";
  } else {
    feedbackEl.textContent = "Not quite.";
    feedbackEl.className = "feedback incorrect";
  }

  questionLocked = true;
  checkBtn.disabled = true;
  nextBtn.disabled = false;

  choicesWrap.querySelectorAll(".choice").forEach((btn, i) => {
    if (Array.isArray(q.answer) ? q.answer.includes(i) : i === q.answer) btn.classList.add("correct");
    else if (selected.has(i)) btn.classList.add("incorrect");
  });
  saveResume();
}

function next() {
  window.speechSynthesis.cancel();
  session.idx++;
  if (session.idx >= session.total) {
    isQuizActive = false;
    localStorage.removeItem(RESUME_KEY);

    const history = JSON.parse(localStorage.getItem("kids_review_history") || "[]");
    const pct = Math.round((session.correct / session.total) * 100);
    history.push({
      key: session.key, title: session.title,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toLocaleDateString(),
      score: session.correct, total: session.total, pct
    });
    localStorage.setItem("kids_review_history", JSON.stringify(history));

    let letterGrade = "F", customMessage = "Let's study this again!";
    if (pct >= 90) { letterGrade = "A"; customMessage = "Outstanding Work!"; }
    else if (pct >= 80) { letterGrade = "B"; customMessage = "Great Job!"; }
    else if (pct >= 70) { letterGrade = "C"; customMessage = "Good Effort!"; }
    else if (pct >= 60) { letterGrade = "D"; customMessage = "Keep Practicing!"; }

    showView(resultSection);
    resultTitleEl.textContent = customMessage;
    resultStatsEl.innerHTML =
      '<div style="font-size:1.25rem;line-height:1.8;margin:20px 0;">' +
      '<div><strong>Score:</strong> ' + session.correct + ' out of ' + session.total + '</div>' +
      '<div><strong>Percentage:</strong> ' + pct + '%</div>' +
      '<div><strong>Letter Grade:</strong> <span style="font-size:1.4rem;color:' +
      (pct >= 70 ? 'var(--correct)' : 'var(--danger)') + ';">' + letterGrade + '</span></div>' +
      '</div>';
  } else {
    renderQuestion();
  }
}

// ── Views & Stats ─────────────────────────────────────────────
function showView(which) {
  [coverSection, statsSection, quizSection, resultSection].forEach(sec => sec.classList.remove("visible"));
  which.classList.add("visible");
  window.speechSynthesis.cancel();
}

function showStats() {
  const today = new Date().toLocaleDateString();
  const hist = JSON.parse(localStorage.getItem("kids_review_history") || "[]").filter(h => h.date === today);
  const add = (el, list) => {
    el.innerHTML = list.length === 0
      ? "<tr><td colspan='3'>No attempts.</td></tr>"
      : list.reverse().map(e => "<tr><td>" + e.time + "</td><td>" + e.score + "/" + e.total + "</td><td>" + e.pct + "%</td></tr>").join('');
  };
  add(vocabHistoryEl, hist.filter(h => h.key === "vocab"));
  add(compHistoryEl,  hist.filter(h => h.key === "comp"));
  add(clozeHistoryEl, hist.filter(h => h.key === "cloze"));
  showView(statsSection);
}

// ── Event Listeners ───────────────────────────────────────────
startBtn.onclick      = startQuiz;
resumeBtn.onclick     = resumeQuiz;
statsBtn.onclick      = showStats;
backFromStats.onclick = () => { checkResume(); showView(coverSection); };
clearStatsBtn.onclick = clearHistory;
checkBtn.onclick      = grade;
nextBtn.onclick       = next;
readAloudBtn.onclick  = speakQuestion;
toTopBtn.onclick      = () => { checkResume(); showView(coverSection); };
retryBtn.onclick      = () => { checkResume(); showView(coverSection); };
tabs.forEach(t => t.onclick = () => {
  currentSectionKey = t.dataset.section;
  tabs.forEach(btn => btn.classList.remove('active'));
  t.classList.add('active');
});

checkResume();
