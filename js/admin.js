/**
 * GOLNER SPORTS — Admin Panel Logic
 * ────────────────────────────────────────────────────────────
 * Requiere: parser.js · scoring.js (cargados antes de este módulo)
 * Usa Firebase Modular SDK (type="module")
 */

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, doc,
  getDocs, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ── BANDERAS ────────────────────────────────────────────────────
const FLAGS = {
  "México":"🇲🇽","Mexico":"🇲🇽",
  "Sudáfrica":"🇿🇦","Sudafrica":"🇿🇦",
  "Arabia Saudí":"🇸🇦","Arabia Saudita":"🇸🇦",
  "Uruguay":"🇺🇾",
  "España":"🇪🇸","Espana":"🇪🇸",
  "Cabo Verde":"🇨🇻",
  "Alemania":"🇩🇪",
  "Curazao":"🇨🇼",
  "Bélgica":"🇧🇪","Belgica":"🇧🇪",
  "Egipto":"🇪🇬",
  "EE.UU.":"🇺🇸","Estados Unidos":"🇺🇸",
  "Paraguay":"🇵🇾",
  "Australia":"🇦🇺",
  "Turquía":"🇹🇷","Turquia":"🇹🇷",
  "Escocia":"🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "Marruecos":"🇲🇦",
  "Brasil":"🇧🇷","Brazil":"🇧🇷",
  "Haití":"🇭🇹","Haiti":"🇭🇹",
  "Países Bajos":"🇳🇱","Paises Bajos":"🇳🇱",
  "Suecia":"🇸🇪",
  "Túnez":"🇹🇳","Tunez":"🇹🇳",
  "Japón":"🇯🇵","Japon":"🇯🇵",
  "Ecuador":"🇪🇨",
  "Argentina":"🇦🇷",
  "Austria":"🇦🇹",
  "Jordania":"🇯🇴",
  "Argelia":"🇩🇿",
  "Francia":"🇫🇷",
  "Irak":"🇮🇶",
  "Noruega":"🇳🇴",
  "Senegal":"🇸🇳",
  "Portugal":"🇵🇹",
  "Uzbekistán":"🇺🇿","Uzbekistan":"🇺🇿",
  "Colombia":"🇨🇴",
  "RD Congo":"🇨🇩",
  "Inglaterra":"🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "Ghana":"🇬🇭",
  "Panamá":"🇵🇦","Panama":"🇵🇦",
  "Croacia":"🇭🇷",
  "República Checa":"🇨🇿","Republica Checa":"🇨🇿",
  "Corea del Sur":"🇰🇷",
  "Suiza":"🇨🇭",
  "Bosnia Herzegovina":"🇧🇦","Bosnia":"🇧🇦",
  "Canadá":"🇨🇦","Canada":"🇨🇦",
  "Qatar":"🇶🇦","Catar":"🇶🇦",
  "Irán":"🇮🇷","Iran":"🇮🇷",
  "Nueva Zelanda":"🇳🇿",
  "Costa de Marfil":"🇨🇮",
  "Chequia":"🇨🇿",
  "Bosnia y Herzegovina":"🇧🇦",
  "República Democrática del Congo":"🇨🇩","Republica Democratica del Congo":"🇨🇩",
};
function getTeamFlag(team) { return FLAGS[team] || "🏳️"; }

// ── FIREBASE CONFIG ─────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyDBnLbLb-mOHIoS29k-G9hzPj285XG3QeI",
  authDomain:        "conteo-de-puntos-golner-sports.firebaseapp.com",
  projectId:         "conteo-de-puntos-golner-sports",
  storageBucket:     "conteo-de-puntos-golner-sports.firebasestorage.app",
  messagingSenderId: "440898623228",
  appId:             "1:440898623228:web:e4c0bc3693080e4e0d2979"
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// Capturar errores globales del módulo
window.addEventListener("error", e => {
  console.error("JS Error:", e.message, e.filename, e.lineno);
  const el = document.getElementById("parserPreview");
  if (el) el.innerHTML = `<div style="color:#ef4444;padding:12px;font-size:12px">⚠ JS Error: ${e.message} (línea ${e.lineno})</div>`;
});

// ── AUTH GUARD ──────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (!user) window.location.href = "login.html";
});

document.getElementById("logoutBtn").addEventListener("click", () =>
  signOut(auth).then(() => (window.location.href = "login.html"))
);

// ── STATE ───────────────────────────────────────────────────────
let allParticipants  = [];
let allMatches       = [];
let allResults       = {};   // matchKey → result object
let tournamentConfig = { phase: "groups", week: 1, cutoffPct: 0.4 };

// Cortes fijos por fase (cuántos se ELIMINAN al finalizar esa fase)
const PHASE_CUTS = {
  round_of_16:   { eliminate: 10, advance: 40, label: "Dieciseisavos" },
  round_of_8:    { eliminate: 10, advance: 30, label: "Octavos" },
  quarter_final: { eliminate: 15, advance: 15, label: "Cuartos" },
  semi_final:    { eliminate: 10, advance:  5, label: "Semifinales" },
};
function getPhaseCut(phase) { return PHASE_CUTS[phase] || null; }
let parsedData       = null; // Last parsed WhatsApp message

// ════════════════════════════════════════════════════════════════
// SIDEBAR / TAB NAVIGATION
// ════════════════════════════════════════════════════════════════
const tabTitles = {
  participants: "Participantes",
  live:         "Control en Vivo",
  results:      "Historial de Resultados",
  matches:      "Partidos",
  tournament:   "Configuración del Torneo",
  stats:        "Estadísticas",
  notifications:"Notificaciones"
};

// ── Tab switching (shared between sidebar + bottom nav) ──────────
function switchTab(tab) {
  document.querySelectorAll(".sidebar-link[data-tab]").forEach(l => l.classList.remove("active"));
  document.querySelectorAll(".bottom-nav-item[data-tab]").forEach(l => l.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));

  document.querySelectorAll(`[data-tab="${tab}"]`).forEach(l => l.classList.add("active"));
  const tabEl = document.getElementById(`tab-${tab}`);
  if (tabEl) tabEl.classList.add("active");
  document.getElementById("tabTitle").textContent = tabTitles[tab] || tab;
  if (tab === "notifications") refreshNotifCount();

  // Close sidebar on mobile
  document.getElementById("sidebar").classList.remove("open");
  const overlay = document.getElementById("sidebarOverlay");
  if (overlay) overlay.classList.remove("visible");

  if (tab === "stats") renderStats();
  if (tab === "tournament") updateCutPreview();
  if (tab === "live") renderLiveControl();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".sidebar-link[data-tab]").forEach(link => {
  link.addEventListener("click", e => {
    e.preventDefault();
    switchTab(link.dataset.tab);
  });
});

// Bottom nav
document.querySelectorAll(".bottom-nav-item[data-tab]").forEach(link => {
  link.addEventListener("click", () => switchTab(link.dataset.tab));
});

// Sidebar mobile toggle + overlay
const sidebarOverlay = document.getElementById("sidebarOverlay");
document.getElementById("sidebarToggle").addEventListener("click", () => {
  const sidebar = document.getElementById("sidebar");
  sidebar.classList.toggle("open");
  if (sidebarOverlay) sidebarOverlay.classList.toggle("visible", sidebar.classList.contains("open"));
});
if (sidebarOverlay) {
  sidebarOverlay.addEventListener("click", () => {
    document.getElementById("sidebar").classList.remove("open");
    sidebarOverlay.classList.remove("visible");
  });
}

// ════════════════════════════════════════════════════════════════
// REAL-TIME LISTENERS
// ════════════════════════════════════════════════════════════════

// Tournament config
onSnapshot(doc(db, "config", "tournament"), snap => {
  if (snap.exists()) {
    tournamentConfig = { ...tournamentConfig, ...snap.data() };
    // Sync form fields
    const phaseEl = document.getElementById("tournamentPhase");
    const weekEl  = document.getElementById("tournamentWeek");
    const pctEl   = document.getElementById("cutoffPct");
    if (phaseEl) phaseEl.value = tournamentConfig.phase || "groups";
    if (weekEl)  weekEl.value  = tournamentConfig.week  || 1;
    if (pctEl)   pctEl.value   = Math.round((tournamentConfig.cutoffPct || 0.4) * 100);
    const cutEl = document.getElementById("showCutLine");
    if (cutEl) {
      cutEl.checked = tournamentConfig.showCutLine !== false;
      document.getElementById("cutLineLabel").textContent = cutEl.checked ? "Visible" : "Oculta";
    }
    updateWeekGroupVisibility();
  }
});

// Participants (ordered by total points)
onSnapshot(
  query(collection(db, "participants"), orderBy("totalPoints", "desc")),
  snap => {
    allParticipants = snap.docs.map((d, i) => ({ id: d.id, rank: i + 1, ...d.data() }));
    renderParticipantsTable();
    updateCutPreview();
  }
);

// Matches
onSnapshot(
  query(collection(db, "matches"), orderBy("date", "asc")),
  snap => {
    allMatches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMatchesList();
    renderResultsList();
    renderLiveControl();
    updateBulkLoadButtons();
    checkWeeklyReminders();
  }
);

// ════════════════════════════════════════════════════════════════
// TAB: PARTICIPANTS — WhatsApp Parser
// ════════════════════════════════════════════════════════════════

document.getElementById("parseBtn").addEventListener("click", () => {
  try {
  const text = document.getElementById("whatsappInput").value.trim();
  if (!text) { showToast("Pega un mensaje de WhatsApp primero.", "error"); return; }

  parsedData = GolnerParser.parse(text);

  // Buscar si ya existe en el sistema
  const existing = parsedData.golnerId
    ? allParticipants.find(p => (p.golnerId || "").toUpperCase() === parsedData.golnerId)
    : allParticipants.find(p => (p.name || "").toLowerCase().trim() === parsedData.name.toLowerCase().trim());

  // Mostrar badge de estado en el preview
  const statusBadge = existing
    ? `<div style="margin:8px 0 4px;padding:6px 12px;background:rgba(57,255,20,0.1);border:1px solid rgba(57,255,20,0.3);border-radius:6px;font-size:12px;color:#39FF14;display:flex;align-items:center;gap:6px">
        <i class="fa-solid fa-rotate"></i> Participante existente — se actualizarán sus predicciones
       </div>`
    : `<div style="margin:8px 0 4px;padding:6px 12px;background:rgba(255,170,0,0.1);border:1px solid rgba(255,170,0,0.3);border-radius:6px;font-size:12px;color:#ffaa00;display:flex;align-items:center;gap:6px">
        <i class="fa-solid fa-user-plus"></i> Participante nuevo — se registrará por primera vez
       </div>`;

  // Show preview
  document.getElementById("parserPreview").innerHTML =
    statusBadge + GolnerParser.buildPreviewHTML(parsedData);

  // Summary bar
  const summaryEl = document.getElementById("parseSummary");
  summaryEl.classList.remove("hidden");
  document.getElementById("sumName").textContent        = parsedData.golnerId
    ? `${parsedData.name} (${parsedData.golnerId})`
    : parsedData.name;
  document.getElementById("sumPredictions").textContent = parsedData.predictions.length;

  const warnEl  = document.getElementById("sumWarning");
  const warnMsg = document.getElementById("sumWarningMsg");
  if (parsedData.warnings.length) {
    warnEl.style.display = "flex";
    warnMsg.textContent  = parsedData.warnings[0];
  } else {
    warnEl.style.display = "none";
  }

  // Enable save button
  document.getElementById("saveParticipantBtn").disabled = parsedData.predictions.length === 0;
  } catch(err) {
    showToast("Error: " + err.message, "error");
    document.getElementById("parserPreview").innerHTML = `<div style="color:#ef4444;padding:12px;font-size:13px">❌ Error: ${err.message}</div>`;
  }
});

document.getElementById("saveParticipantBtn").addEventListener("click", async () => {
  if (!parsedData) return;
  const btn = document.getElementById("saveParticipantBtn");
  btn.disabled = true;
  btn.innerHTML = `<div class="btn-spinner"></div> Guardando…`;

  try {
    await saveParticipant(parsedData);
    showToast(`✅ ${parsedData.name} guardado y puntos calculados.`);
    document.getElementById("whatsappInput").value = "";
    document.getElementById("parserPreview").innerHTML = `
      <div class="preview-placeholder">
        <i class="fa-solid fa-circle-check" style="color:var(--green)"></i>
        <p>Participante guardado correctamente</p>
      </div>`;
    document.getElementById("parseSummary").classList.add("hidden");
    parsedData = null;
  } catch (err) {
    console.error(err);
    showToast("Error al guardar: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Guardar participante`;
  }
});

/**
 * Guarda o actualiza un participante en Firestore y calcula sus puntos.
 */
async function saveParticipant(parsed) {
  // Buscar si ya existe: primero por ID Golner, si no por nombre
  const existing = parsed.golnerId
    ? allParticipants.find(p => (p.golnerId || "").toUpperCase() === parsed.golnerId)
    : allParticipants.find(p => (p.name || "").toLowerCase().trim() === parsed.name.toLowerCase().trim());

  // Construir mapa de predicciones: matchKey → pred object
  const predictionsMap = {};
  for (const pred of parsed.predictions) {
    predictionsMap[pred.matchKey] = {
      matchKey:   pred.matchKey,
      homeTeam:   pred.homeTeam,
      awayTeam:   pred.awayTeam,
      prediction: pred.prediction,
      homeScore:  pred.homeScore,
      awayScore:  pred.awayScore
    };
  }

  // Calcular puntos con resultados reales actuales
  const { totalPoints, weekPoints, phasePoints, matchBreakdown } =
    GolnerScoring.calcParticipantTotal(parsed.predictions, allResults);

  const participantData = {
    name:            parsed.name,
    golnerId:        parsed.golnerId || null,
    phone:           parsed.phone   || null,
    totalPoints,
    weekPoints,
    phasePoints,
    matchBreakdown,
    predictions:     predictionsMap,
    updatedAt:       serverTimestamp()
  };

  if (existing) {
    await updateDoc(doc(db, "participants", existing.id), participantData);
  } else {
    await addDoc(collection(db, "participants"), {
      ...participantData,
      status:    "active",
      createdAt: serverTimestamp()
    });
  }
}

// ── Admin search ─────────────────────────────────────────────────
document.getElementById("adminSearch").addEventListener("input", renderParticipantsTable);

// ── Render participants table ─────────────────────────────────────
function renderParticipantsTable() {
  const tbody  = document.getElementById("adminParticipantsBody");
  const search = (document.getElementById("adminSearch").value || "").toLowerCase();

  const filtered = allParticipants
    .filter(p => !search || (p.name || "").toLowerCase().includes(search))
    .slice()
    .sort((a, b) => {
      const na = parseInt((a.golnerId || "").replace(/\D/g, "")) || 9999;
      const nb = parseInt((b.golnerId || "").replace(/\D/g, "")) || 9999;
      return na - nb;
    });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:32px;color:rgba(255,255,255,0.4)">Sin participantes aún</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const w1 = (p.weekPoints && p.weekPoints[1]) || 0;
    const w2 = (p.weekPoints && p.weekPoints[2]) || 0;
    const w3 = (p.weekPoints && p.weekPoints[3]) || 0;
    const predCount = Object.keys(p.predictions || {}).length;
    const statusBadge = `<span class="badge badge-${statusClass(p.status)}">${statusLabel(p.status)}</span>`;

    return `
      <tr>
        <td><span style="color:rgba(255,255,255,0.4);font-family:var(--font-display);font-weight:700">${p.rank}</span></td>
        <td><span style="font-size:12px;font-family:var(--font-display);color:var(--green);font-weight:700">${esc(p.golnerId || "—")}</span></td>
        <td><strong>${esc(p.name)}</strong></td>
        <td style="color:rgba(255,255,255,0.6)">${predCount}</td>
        <td>${w1}</td>
        <td>${w2}</td>
        <td>${w3}</td>
        <td style="color:var(--green);font-weight:700;font-family:var(--font-display);font-size:16px">${p.totalPoints || 0}</td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn-icon" title="Ver detalles" onclick="openParticipantDrawer('${p.id}')">
            <i class="fa-solid fa-eye"></i>
          </button>
          <button class="btn-icon" title="Editar nombre" onclick="editParticipantName('${p.id}','${esc(p.name)}')">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn-icon" title="Recalcular" onclick="recalcParticipant('${p.id}')">
            <i class="fa-solid fa-rotate"></i>
          </button>
          <button class="btn-icon danger" title="Eliminar" onclick="confirmDeleteParticipant('${p.id}','${esc(p.name)}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

function statusClass(s) {
  if (s === "classified") return "classified";
  if (s === "eliminated") return "eliminated";
  if (s === "at_risk")    return "risk";
  return "active";
}
function statusLabel(s) {
  if (s === "classified") return "Clasificado";
  if (s === "eliminated") return "Eliminado";
  if (s === "at_risk")    return "EN RIESGO";
  return "ACTIVO";
}

// ── Recalculate all ──────────────────────────────────────────────
document.getElementById("recalcAllBtn").addEventListener("click", async () => {
  if (!allParticipants.length) { showToast("Sin participantes.", "error"); return; }
  showToast("Recalculando todos…");
  const batch = writeBatch(db);

  for (const p of allParticipants) {
    const preds = Object.values(p.predictions || {});
    const { totalPoints, weekPoints, phasePoints, matchBreakdown } =
      GolnerScoring.calcParticipantTotal(preds, allResults);
    batch.update(doc(db, "participants", p.id), {
      totalPoints, weekPoints, phasePoints, matchBreakdown, updatedAt: serverTimestamp()
    });
  }
  await batch.commit();
  showToast("✅ Todos los puntos recalculados.");
});

// Global refs for inline onclick handlers
window.recalcParticipant = async (id) => {
  const p = allParticipants.find(x => x.id === id);
  if (!p) return;
  const preds = Object.values(p.predictions || {});
  const { totalPoints, weekPoints, phasePoints, matchBreakdown } =
    GolnerScoring.calcParticipantTotal(preds, allResults);
  await updateDoc(doc(db, "participants", id), {
    totalPoints, weekPoints, phasePoints, matchBreakdown, updatedAt: serverTimestamp()
  });
  showToast(`✅ ${p.name} recalculado.`);
};

window.editParticipantName = async (id, currentName) => {
  const newName = prompt(`Editar nombre de "${currentName}":`, currentName);
  if (!newName || newName.trim() === currentName.trim()) return;
  await updateDoc(doc(db, "participants", id), { name: newName.trim() });
  showToast(`✅ Nombre actualizado a "${newName.trim()}"`);
};

window.confirmDeleteParticipant = (id, name) => {
  showModal(
    `¿Eliminar a ${name}?`,
    "Se borrarán todos sus datos y predicciones. Esta acción no se puede deshacer.",
    async () => {
      await deleteDoc(doc(db, "participants", id));
      showToast(`${name} eliminado.`);
    }
  );
};


// ════════════════════════════════════════════════════════════════
// TAB: CONTROL EN VIVO
// ════════════════════════════════════════════════════════════════

function renderLiveControl() {
  const container = document.getElementById("liveControlList");
  if (!container) return;

  const live     = allMatches.filter(m => m.live && !m.played);
  const pending  = allMatches.filter(m => !m.live && !m.played);
  const finished = allMatches.filter(m => m.played);

  if (!allMatches.length) {
    container.innerHTML = `<p style="color:var(--white-40);padding:20px;font-size:13px">Sin partidos registrados.</p>`;
    return;
  }

  function matchCard(m, mode) {
    const hs = mode === "live" ? (m.liveHomeScore ?? 0) : mode === "finished" ? m.homeScore : 0;
    const as = mode === "live" ? (m.liveAwayScore ?? 0) : mode === "finished" ? m.awayScore : 0;
    const dateStr = m.date?.toDate
      ? m.date.toDate().toLocaleString("es-MX", { weekday:"short", day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })
      : (m.date ? new Date(m.date).toLocaleString("es-MX", { weekday:"short", day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" }) : "");

    const finishedStyle = mode === "finished" ? "color:var(--green);font-size:28px" : "font-size:28px";

    const scoreCtrlHome = mode === "live" ? `
      <div class="lc-score-ctrl">
        <button class="lc-score-btn minus" onclick="adjustScore('${m.id}',-1,0)">−</button>
        <span class="lc-score-num">${hs}</span>
        <button class="lc-score-btn" onclick="adjustScore('${m.id}',1,0)">+</button>
      </div>` : `<span class="lc-score-num" style="${finishedStyle}">${hs}</span>`;

    const scoreCtrlAway = mode === "live" ? `
      <div class="lc-score-ctrl">
        <button class="lc-score-btn minus" onclick="adjustScore('${m.id}',0,-1)">−</button>
        <span class="lc-score-num">${as}</span>
        <button class="lc-score-btn" onclick="adjustScore('${m.id}',0,1)">+</button>
      </div>` : `<span class="lc-score-num" style="${finishedStyle}">${as}</span>`;

    const actions = mode === "pending" ? `
      <div class="lc-actions">
        <button class="lc-btn-start" onclick="startLiveMatch('${m.id}')">
          <i class="fa-solid fa-circle" style="font-size:9px;color:#ef4444;margin-right:6px"></i> Iniciar partido
        </button>
      </div>` : mode === "live" ? `
      <div class="lc-actions">
        <button class="lc-btn-start" onclick="stopLive('${m.id}','${esc(m.homeTeam)}','${esc(m.awayTeam)}')">
          <i class="fa-solid fa-xmark" style="margin-right:6px"></i> Cancelar
        </button>
        <button class="lc-btn-finish" onclick="finalizeMatch('${m.id}')">
          <i class="fa-solid fa-flag-checkered" style="margin-right:6px"></i> Finalizar partido
        </button>
      </div>` : mode === "finished" ? `
      <div style="display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px;color:var(--green);font-weight:600">
        <i class="fa-solid fa-circle-check"></i>
        ${m.result === "draw" ? "Empate" : m.result === "home" ? `Gana ${esc(m.homeTeam)}` : `Gana ${esc(m.awayTeam)}`}
      </div>` : "";

    return `
      <div class="lc-card ${mode === "live" ? "is-live" : mode === "finished" ? "is-finished" : ""}">
        <div class="lc-teams">
          <div class="lc-team">
            <span class="lc-flag">${getTeamFlag(m.homeTeam)}</span>
            <span class="lc-team-name">${esc(m.homeTeam)}</span>
            ${scoreCtrlHome}
          </div>
          <span class="lc-vs">VS</span>
          <div class="lc-team">
            <span class="lc-flag">${getTeamFlag(m.awayTeam)}</span>
            <span class="lc-team-name">${esc(m.awayTeam)}</span>
            ${scoreCtrlAway}
          </div>
        </div>
        ${dateStr ? `<div class="lc-match-time"><i class="fa-regular fa-clock" style="margin-right:4px"></i>${dateStr}</div>` : ""}
        ${actions}
      </div>`;
  }

  let html = "";

  if (live.length) {
    html += `<div class="lc-section-title" style="color:#ef4444">● En Vivo (${live.length})</div>`;
    html += live.map(m => matchCard(m, "live")).join("");
  }

  if (pending.length) {
    html += `<div class="lc-section-title" style="margin-top:${live.length ? "16px":"0"}">Próximos partidos</div>`;
    html += pending.map(m => matchCard(m, "pending")).join("");
  }

  if (finished.length) {
    html += `<div class="lc-section-title" style="margin-top:16px">Finalizados</div>`;
    html += finished.map(m => matchCard(m, "finished")).join("");
  }

  container.innerHTML = `<div class="lc-list">${html}</div>`;
}

// Ajustar marcador en vivo con + o -
window.adjustScore = async (id, homeDelta, awayDelta) => {
  const match = allMatches.find(m => m.id === id);
  if (!match) return;
  const newHome = Math.max(0, (match.liveHomeScore ?? 0) + homeDelta);
  const newAway = Math.max(0, (match.liveAwayScore ?? 0) + awayDelta);
  await updateDoc(doc(db, "matches", id), { liveHomeScore: newHome, liveAwayScore: newAway });
};

// Iniciar partido en vivo
window.startLiveMatch = async (id) => {
  const match = allMatches.find(m => m.id === id);
  if (!match) return;
  await updateDoc(doc(db, "matches", id), {
    live: true, played: false, liveHomeScore: 0, liveAwayScore: 0
  });
  showToast(`🔴 ${match.homeTeam} vs ${match.awayTeam} — partido iniciado en vivo.`);
};

// Finalizar partido y calcular puntos (resultado se deduce del marcador)
window.finalizeMatch = async (id) => {
  const match = allMatches.find(m => m.id === id);
  if (!match) return;

  const homeScore = match.liveHomeScore ?? 0;
  const awayScore = match.liveAwayScore ?? 0;
  const result    = homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "draw";
  const matchKey  = buildMatchKey(match.homeTeam, match.awayTeam);

  await updateDoc(doc(db, "matches", id), {
    live: false, played: true, result, homeScore, awayScore, matchKey, playedAt: serverTimestamp()
  });

  allResults[matchKey] = {
    played: true, result, homeScore, awayScore,
    homeTeam: match.homeTeam, awayTeam: match.awayTeam,
    week: match.week, phase: match.phase || "groups"
  };

  const batch = writeBatch(db);
  for (const p of allParticipants) {
    const preds = Object.values(p.predictions || {});
    const { totalPoints, weekPoints, phasePoints, matchBreakdown } =
      GolnerScoring.calcParticipantTotal(preds, allResults);
    batch.update(doc(db, "participants", p.id), {
      totalPoints, weekPoints, phasePoints, matchBreakdown, updatedAt: serverTimestamp()
    });
  }
  await batch.commit();

  const winner = result === "draw" ? "Empate" : result === "home" ? `Gana ${match.homeTeam}` : `Gana ${match.awayTeam}`;
  showToast(`✅ ${match.homeTeam} ${homeScore}-${awayScore} ${match.awayTeam} · ${winner} · Puntos actualizados.`);
  autoNotifyMatchResult(match, homeScore, awayScore);
};

function renderResultsList() {
  const container = document.getElementById("resultsList");
  if (!container) return;
  const live   = allMatches.filter(m => m.live && !m.played);
  const played = allMatches.filter(m => m.played);
  if (!live.length && !played.length) {
    container.innerHTML = `<p style="color:rgba(255,255,255,0.4);padding:20px;font-size:13px">Sin resultados registrados aún.</p>`;
    return;
  }

  const liveHTML = live.map(m => `
    <div class="result-item" style="border-color:#39ff14;background:rgba(57,255,20,0.05)">
      <span style="font-size:10px;font-weight:700;color:#ef4444;display:flex;align-items:center;gap:5px">
        <span style="width:7px;height:7px;border-radius:50%;background:#ef4444;display:inline-block"></span>EN VIVO
      </span>
      <div class="result-item-teams">${getTeamFlag(m.homeTeam)} ${esc(m.homeTeam)} vs ${esc(m.awayTeam)} ${getTeamFlag(m.awayTeam)}</div>
      <div class="result-item-score" style="color:#39ff14">${m.liveHomeScore} - ${m.liveAwayScore}</div>
      <div style="display:flex;gap:6px;margin-left:auto">
        <button class="btn-icon" title="Actualizar marcador" onclick="editLive('${m.id}')">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="btn-icon danger" title="Quitar en vivo" onclick="stopLive('${m.id}','${esc(m.homeTeam)}','${esc(m.awayTeam)}')">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>`).join("");

  const playedHTML = played.map(m => `
    <div class="result-item">
      <div class="result-item-teams">${esc(m.homeTeam)} vs ${esc(m.awayTeam)}</div>
      <div class="result-item-score">${m.homeScore} - ${m.awayScore}</div>
      <div class="result-item-winner">
        ${m.result === "draw" ? "Empate" : m.result === "home" ? `Gana ${esc(m.homeTeam)}` : `Gana ${esc(m.awayTeam)}`}
      </div>
      <span style="font-size:10px;color:rgba(255,255,255,0.3)">${esc(m.phase || "Grupos")}</span>
      <div style="display:flex;gap:6px;margin-left:auto">
        <button class="btn-icon danger" title="Eliminar resultado" onclick="deleteResult('${m.id}','${esc(m.homeTeam)}','${esc(m.awayTeam)}')">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `).join("");

  container.innerHTML = liveHTML + playedHTML;
}

// Ir al control en vivo al dar editar en el historial
window.editLive = (id) => {
  switchTab("live");
  showToast("Actualiza el marcador en el panel de control.");
};

// Quitar estado en vivo de un partido
window.stopLive = (id, home, away) => {
  showModal(
    `¿Quitar en vivo?`,
    `Se quitará el marcador en vivo de ${home} vs ${away}. El partido volverá a Pendiente.`,
    async () => {
      await updateDoc(doc(db, "matches", id), {
        live: false, liveHomeScore: null, liveAwayScore: null
      });
      showToast(`${home} vs ${away} quitado de en vivo.`);
    }
  );
};

// Editar resultado — ir al Control en Vivo para corregir
window.editResult = (id) => {
  switchTab("live");
  showToast("Usa el panel de Control en Vivo para corregir el marcador.");
};

// Eliminar resultado — marca el partido como no jugado y recalcula
window.deleteResult = (id, home, away) => {
  showModal(
    `¿Eliminar resultado?`,
    `Se borrará el resultado de ${home} vs ${away} y se recalcularán los puntos.`,
    async () => {
      await updateDoc(doc(db, "matches", id), {
        played: false, result: null, homeScore: null, awayScore: null, matchKey: null
      });

      // Quitar del mapa en memoria y recalcular
      const match = allMatches.find(m => m.id === id);
      if (match) delete allResults[buildMatchKey(match.homeTeam, match.awayTeam)];

      const batch = writeBatch(db);
      for (const p of allParticipants) {
        const preds = Object.values(p.predictions || {});
        const { totalPoints, weekPoints, phasePoints, matchBreakdown } =
          GolnerScoring.calcParticipantTotal(preds, allResults);
        batch.update(doc(db, "participants", p.id), {
          totalPoints, weekPoints, phasePoints, matchBreakdown, updatedAt: serverTimestamp()
        });
      }
      await batch.commit();
      showToast("✅ Resultado eliminado. Puntos recalculados.");
    }
  );
};

// ════════════════════════════════════════════════════════════════
// TAB: MATCHES — Agregar partidos
// ════════════════════════════════════════════════════════════════

function updateMatchWeekVisibility() {
  const phase = document.getElementById("matchPhase").value;
  const grp   = document.getElementById("matchWeekGroup");
  if (grp) grp.style.display = phase === "groups" ? "" : "none";
}
document.getElementById("matchPhase").addEventListener("change", updateMatchWeekVisibility);
updateMatchWeekVisibility();

document.getElementById("addMatchBtn").addEventListener("click", async () => {
  const home  = document.getElementById("matchHome").value.trim();
  const away  = document.getElementById("matchAway").value.trim();
  const week  = parseInt(document.getElementById("matchWeek").value, 10);
  const phase = document.getElementById("matchPhase").value;
  const dateV = document.getElementById("matchDate").value;

  if (!home || !away) { showToast("Ingresa ambos equipos.", "error"); return; }

  const key = buildMatchKey(home, away);

  if (editingMatchId) {
    // Modo edición
    await updateDoc(doc(db, "matches", editingMatchId), {
      homeTeam: home, awayTeam: away,
      week, phase, matchKey: key,
      date: dateV ? new Date(dateV) : serverTimestamp()
    });
    showToast(`✅ Partido actualizado: ${home} vs ${away}`);
    resetMatchForm();
  } else {
    // Modo agregar
    await addDoc(collection(db, "matches"), {
      homeTeam: home, awayTeam: away,
      week, phase, matchKey: key,
      played: false,
      date: dateV ? new Date(dateV) : serverTimestamp(),
      createdAt: serverTimestamp()
    });
    document.getElementById("matchHome").value = "";
    document.getElementById("matchAway").value = "";
    showToast(`✅ Partido agregado: ${home} vs ${away}`);
  }
});

function renderMatchesList() {
  const container = document.getElementById("matchesList");
  if (!container) return;

  const countEl = document.getElementById("matchesCount");
  if (countEl) countEl.textContent = allMatches.length ? `(${allMatches.length})` : "";

  if (!allMatches.length) {
    container.innerHTML = `<p style="color:rgba(255,255,255,0.4);padding:20px;font-size:13px">Sin partidos registrados.</p>`;
    return;
  }
  container.innerHTML = allMatches.map(m => {
    const dateStr = m.date?.toDate
      ? m.date.toDate().toLocaleString("es-MX", { weekday:"short", day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })
      : (m.date ? new Date(m.date).toLocaleString("es-MX", { weekday:"short", day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" }) : "—");
    return `
    <div class="match-admin-item">
      <div style="display:flex;flex-direction:column;gap:3px;min-width:0;flex:1">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span class="match-phase-tag">${esc(m.phase || "Grupos")} · Sem ${m.week || 1}</span>
          <span class="match-teams-text">${getTeamFlag(m.homeTeam)} ${esc(m.homeTeam)} vs ${getTeamFlag(m.awayTeam)} ${esc(m.awayTeam)}</span>
        </div>
        <span style="font-size:11px;color:rgba(255,255,255,0.35)"><i class="fa-regular fa-clock" style="margin-right:4px"></i>${dateStr}</span>
      </div>
      ${m.played
        ? `<span class="match-played-badge">${m.homeScore}-${m.awayScore}</span>`
        : m.live
          ? `<span class="match-pending-badge" style="background:#7f1d1d;color:#fca5a5;border-color:#b91c1c"><span style="font-size:8px">●</span> ${m.liveHomeScore}-${m.liveAwayScore} En vivo</span>`
          : `<span class="match-pending-badge">Pendiente</span>`
      }
      <button class="btn-icon" title="Editar" onclick="editMatch('${m.id}')">
        <i class="fa-solid fa-pen"></i>
      </button>
      <button class="btn-icon danger" title="Eliminar" onclick="confirmDeleteMatch('${m.id}','${esc(m.homeTeam)}','${esc(m.awayTeam)}')">
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>`;
  }).join("");
}

// ════════════════════════════════════════════════════════════════
// BULK LOAD CALENDARS
// ════════════════════════════════════════════════════════════════

const CALENDARS = {
  2: [
    { home: "República Checa", away: "Sudáfrica",          date: "2026-06-18T10:00" },
    { home: "Suiza",           away: "Bosnia Herzegovina",  date: "2026-06-18T13:00" },
    { home: "Canadá",          away: "Qatar",               date: "2026-06-18T16:00" },
    { home: "México",          away: "Corea del Sur",       date: "2026-06-18T19:00" },
    { home: "Estados Unidos",  away: "Australia",           date: "2026-06-19T13:00" },
    { home: "Escocia",         away: "Marruecos",           date: "2026-06-19T16:00" },
    { home: "Brasil",          away: "Haití",               date: "2026-06-19T18:30" },
    { home: "Turquía",         away: "Paraguay",            date: "2026-06-19T21:00" },
    { home: "Países Bajos",    away: "Suecia",              date: "2026-06-20T11:00" },
    { home: "Alemania",        away: "Costa de Marfil",     date: "2026-06-20T14:00" },
    { home: "Ecuador",         away: "Curazao",             date: "2026-06-20T18:00" },
    { home: "Túnez",           away: "Japón",               date: "2026-06-20T22:00" },
    { home: "España",          away: "Arabia Saudita",      date: "2026-06-21T10:00" },
    { home: "Bélgica",         away: "Irán",                date: "2026-06-21T13:00" },
    { home: "Uruguay",         away: "Cabo Verde",          date: "2026-06-21T16:00" },
    { home: "Nueva Zelanda",   away: "Egipto",              date: "2026-06-21T19:00" },
    { home: "Argentina",       away: "Austria",             date: "2026-06-22T11:00" },
    { home: "Francia",         away: "Irak",                date: "2026-06-22T15:00" },
    { home: "Noruega",         away: "Senegal",             date: "2026-06-22T18:00" },
    { home: "Jordania",        away: "Argelia",             date: "2026-06-22T21:00" },
    { home: "Portugal",        away: "Uzbekistán",          date: "2026-06-23T11:00" },
    { home: "Inglaterra",      away: "Ghana",               date: "2026-06-23T14:00" },
    { home: "Panamá",          away: "Croacia",             date: "2026-06-23T17:00" },
    { home: "Colombia",        away: "RD Congo",            date: "2026-06-23T20:00" },
  ],
  3: [
    // Miércoles 24 junio
    { home: "Suiza",              away: "Canadá",           date: "2026-06-24T13:00" },
    { home: "Bosnia Herzegovina", away: "Qatar",            date: "2026-06-24T13:00" },
    { home: "Escocia",            away: "Brasil",           date: "2026-06-24T16:00" },
    { home: "Marruecos",          away: "Haití",            date: "2026-06-24T16:00" },
    { home: "Sudáfrica",          away: "Corea del Sur",    date: "2026-06-24T19:00" },
    { home: "República Checa",    away: "México",           date: "2026-06-24T19:00" },
    // Jueves 25 junio
    { home: "Ecuador",            away: "Alemania",         date: "2026-06-25T14:00" },
    { home: "Curazao",            away: "Costa de Marfil",  date: "2026-06-25T14:00" },
    { home: "Túnez",              away: "Países Bajos",     date: "2026-06-25T17:00" },
    { home: "Japón",              away: "Suecia",           date: "2026-06-25T17:00" },
    { home: "Paraguay",           away: "Australia",        date: "2026-06-25T20:00" },
    { home: "Turquía",            away: "Estados Unidos",   date: "2026-06-25T20:00" },
    // Viernes 26 junio
    { home: "Noruega",            away: "Francia",          date: "2026-06-26T13:00" },
    { home: "Senegal",            away: "Irak",             date: "2026-06-26T13:00" },
    { home: "Uruguay",            away: "España",           date: "2026-06-26T18:00" },
    { home: "Cabo Verde",         away: "Arabia Saudita",   date: "2026-06-26T18:00" },
    { home: "Egipto",             away: "Irán",             date: "2026-06-26T21:00" },
    { home: "Nueva Zelanda",      away: "Bélgica",          date: "2026-06-26T21:00" },
    // Sábado 27 junio
    { home: "Croacia",            away: "Ghana",            date: "2026-06-27T15:00" },
    { home: "Panamá",             away: "Inglaterra",       date: "2026-06-27T15:00" },
    { home: "Colombia",           away: "Portugal",         date: "2026-06-27T17:30" },
    { home: "RD Congo",           away: "Uzbekistán",       date: "2026-06-27T17:30" },
    { home: "Argelia",            away: "Austria",          date: "2026-06-27T20:00" },
    { home: "Jordania",           away: "Argentina",        date: "2026-06-27T20:00" },
  ]
};

window.bulkLoadWeek = async (week) => {
  const matches = CALENDARS[week];
  if (!matches || !matches.length) {
    showToast(`Aún no hay calendario cargado para Semana ${week}.`, "error");
    return;
  }

  const logEl = document.getElementById("bulkLoadLog");
  logEl.style.display = "block";
  logEl.textContent   = `Cargando Semana ${week}…\n`;

  const existing = new Set(allMatches.map(m => m.matchKey).filter(Boolean));

  let added = 0, skipped = 0;
  for (const m of matches) {
    const key = buildMatchKey(m.home, m.away);
    if (existing.has(key)) { skipped++; continue; }
    await addDoc(collection(db, "matches"), {
      homeTeam:  m.home,
      awayTeam:  m.away,
      matchKey:  key,
      week,
      phase:     "groups",
      played:    false,
      date:      new Date(m.date),
      createdAt: serverTimestamp()
    });
    logEl.textContent += `✅ ${m.home} vs ${m.away}\n`;
    added++;
  }

  logEl.textContent += `\n🏁 ${added} partidos agregados.`;
  showToast(`✅ Semana ${week} cargada: ${added} partidos agregados.`);
  updateBulkLoadButtons();
};

function updateBulkLoadButtons() {
  const existing = new Set(allMatches.map(m => m.matchKey).filter(Boolean));
  for (const week of [2, 3]) {
    const cal = CALENDARS[week] || [];
    const btn = document.querySelector(`button[onclick="bulkLoadWeek(${week})"]`);
    if (!btn) continue;
    // Si todos los partidos de esa semana ya existen, ocultar el botón
    const allLoaded = cal.length > 0 && cal.every(m => existing.has(buildMatchKey(m.home, m.away)));
    btn.style.display = allLoaded ? "none" : "";
  }
  // Ocultar toda la sección si ambos botones están ocultos
  const section = document.getElementById("bulkLoadSection");
  if (section) {
    const anyVisible = [2, 3].some(w => {
      const btn = document.querySelector(`button[onclick="bulkLoadWeek(${w})"]`);
      return btn && btn.style.display !== "none";
    });
    section.style.display = anyVisible ? "" : "none";
  }
}

// Editar partido — carga datos en el formulario y cambia el botón a "Guardar cambios"
let editingMatchId = null;

window.editMatch = (id) => {
  const m = allMatches.find(x => x.id === id);
  if (!m) return;

  editingMatchId = id;

  document.getElementById("matchHome").value  = m.homeTeam || "";
  document.getElementById("matchAway").value  = m.awayTeam || "";
  document.getElementById("matchWeek").value  = m.week  || 1;
  document.getElementById("matchPhase").value = m.phase || "groups";

  // Fecha
  if (m.date) {
    const d = m.date?.toDate ? m.date.toDate() : new Date(m.date);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString().slice(0,16);
    document.getElementById("matchDate").value = local;
  }

  const btn = document.getElementById("addMatchBtn");
  btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Guardar cambios`;
  btn.style.background = "#ffaa00";
  btn.style.color      = "#000";

  // Scroll al formulario
  document.getElementById("matchHome").scrollIntoView({ behavior:"smooth", block:"center" });
  showToast("Edita los datos y presiona Guardar cambios.");
};

function resetMatchForm() {
  editingMatchId = null;
  document.getElementById("matchHome").value = "";
  document.getElementById("matchAway").value = "";
  document.getElementById("matchDate").value = "";
  const btn = document.getElementById("addMatchBtn");
  btn.innerHTML = `<i class="fa-solid fa-plus"></i> Agregar partido`;
  btn.style.background = "";
  btn.style.color      = "";
}

window.confirmDeleteMatch = (id, home, away) => {
  showModal(
    `¿Eliminar partido?`,
    `${home} vs ${away} será eliminado permanentemente.`,
    async () => {
      await deleteDoc(doc(db, "matches", id));
      showToast("Partido eliminado.");
    }
  );
};

// ════════════════════════════════════════════════════════════════
// TAB: TOURNAMENT CONFIG
// ════════════════════════════════════════════════════════════════

// Toggle label de línea de corte
const cutLineCheckbox = document.getElementById("showCutLine");
const cutLineLabelEl  = document.getElementById("cutLineLabel");
cutLineCheckbox.addEventListener("change", () => {
  cutLineLabelEl.textContent = cutLineCheckbox.checked ? "Visible" : "Oculta";
});

// Mostrar/ocultar semana según fase
function updateWeekGroupVisibility() {
  const phase = document.getElementById("tournamentPhase").value;
  const weekGroup      = document.getElementById("weekGroup");
  const cutoffPctGroup = document.getElementById("cutoffPctGroup");
  if (weekGroup)      weekGroup.style.display      = phase === "groups" ? "" : "none";
  if (cutoffPctGroup) cutoffPctGroup.style.display = phase === "groups" ? "none" : "";
}
document.getElementById("tournamentPhase").addEventListener("change", updateWeekGroupVisibility);
updateWeekGroupVisibility();

document.getElementById("saveTournamentBtn").addEventListener("click", async () => {
  const phase       = document.getElementById("tournamentPhase").value;
  const week        = parseInt(document.getElementById("tournamentWeek").value, 10);
  const showCutLine = document.getElementById("showCutLine").checked;
  const cut         = getPhaseCut(phase);
  const cutoffPct   = cut ? cut.advance / 50 : 0.4; // mantener compatibilidad

  await setDoc(doc(db, "config", "tournament"), {
    phase, week, cutoffPct, showCutLine, updatedAt: serverTimestamp()
  }, { merge: true });

  showToast("✅ Configuración guardada.");
  updateCutPreview();
});

document.getElementById("applyCutBtn").addEventListener("click", () => {
  const phase = tournamentConfig.phase || "groups";
  if (phase === "groups" || phase === "final") {
    showToast("No hay corte en esta fase.", "error");
    return;
  }
  openCutPreview();
});

// Estado mutable del corte — se modifica al mover participantes manualmente
let cutState = {}; // id → "classified" | "eliminated"

function openCutPreview() {
  const phase = tournamentConfig.phase || "groups";
  const cut   = getPhaseCut(phase);
  if (!cut) return;

  // Ordenar por puntos → marcadores exactos → aciertos (criterios de desempate)
  const sorted = allParticipants.slice().sort((a, b) => {
    if ((b.totalPoints || 0) !== (a.totalPoints || 0)) return (b.totalPoints || 0) - (a.totalPoints || 0);
    const aExact = Object.values(a.matchBreakdown || {}).filter(x => x === 3).length;
    const bExact = Object.values(b.matchBreakdown || {}).filter(x => x === 3).length;
    if (bExact !== aExact) return bExact - aExact;
    const aHits = Object.values(a.matchBreakdown || {}).filter(x => x > 0).length;
    const bHits = Object.values(b.matchBreakdown || {}).filter(x => x > 0).length;
    return bHits - aHits;
  });

  cutState = {};
  sorted.forEach((p, idx) => {
    cutState[p.id] = idx < cut.advance ? "classified" : "eliminated";
  });

  renderCutModal();
  document.getElementById("cutModal").classList.remove("hidden");
}

function renderCutModal() {
  const advancing  = allParticipants.filter(p => cutState[p.id] === "classified");
  const eliminated = allParticipants.filter(p => cutState[p.id] === "eliminated");

  document.getElementById("cutModalSummary").textContent =
    `${allParticipants.length} participantes · Puedes mover participantes entre columnas antes de aplicar.`;
  document.getElementById("cutAdvanceCount").textContent   = `(${advancing.length})`;
  document.getElementById("cutEliminatedCount").textContent = `(${eliminated.length})`;

  function participantRow(p, currentStatus) {
    const isAdvancing = currentStatus === "classified";
    const btnLabel  = isAdvancing ? "→ Eliminar" : "→ Avanzar";
    const btnColor  = isAdvancing ? "#ff4444" : "#39FF14";
    const btnTextColor = isAdvancing ? "#fff" : "#000";
    const toggleTo  = isAdvancing ? "eliminated" : "classified";
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.04);border-radius:6px;padding:6px 8px;gap:6px">
        <div style="min-width:0">
          <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.4)">#${p.rank} · ${p.totalPoints || 0} pts</div>
        </div>
        <button onclick="toggleCutState('${p.id}')"
          style="flex-shrink:0;font-size:10px;font-weight:700;padding:4px 8px;border:none;border-radius:4px;cursor:pointer;background:${btnColor};color:${btnTextColor}">
          ${btnLabel}
        </button>
      </div>`;
  }

  document.getElementById("cutAdvanceList").innerHTML =
    advancing.map(p => participantRow(p, "classified")).join("") ||
    `<p style="font-size:12px;color:rgba(255,255,255,0.3);padding:8px">Ninguno</p>`;

  document.getElementById("cutEliminatedList").innerHTML =
    eliminated.map(p => participantRow(p, "eliminated")).join("") ||
    `<p style="font-size:12px;color:rgba(255,255,255,0.3);padding:8px">Ninguno</p>`;
}

window.toggleCutState = (id) => {
  cutState[id] = cutState[id] === "classified" ? "eliminated" : "classified";
  renderCutModal();
};

window.applyCutConfirmed = async () => {
  const btn = document.querySelector("#cutModal .btn-danger");
  btn.disabled = true;
  btn.innerHTML = `<div class="btn-spinner"></div> Aplicando…`;

  const batch = writeBatch(db);
  for (const [id, status] of Object.entries(cutState)) {
    batch.update(doc(db, "participants", id), { status });
  }
  await batch.commit();

  document.getElementById("cutModal").classList.add("hidden");
  showToast("✅ Corte aplicado. Estados actualizados.");
};

function updateCutPreview() {
  const el = document.getElementById("cutPreview");
  if (!el) return;
  const total = allParticipants.length;
  const phase = tournamentConfig.phase || "groups";
  const cut   = getPhaseCut(phase);

  if (phase === "groups") {
    const next = getPhaseCut("round_of_16");
    el.innerHTML =
      `<span style="color:rgba(255,255,255,0.5)">⏳ Fase de Grupos en curso — nadie es eliminado todavía.</span><br>` +
      `<span style="font-size:12px;color:rgba(255,255,255,0.35)">Al pasar a Dieciseisavos: avanzan ${next.advance} de ${total}, se eliminan ${next.eliminate}.</span>`;
  } else if (phase === "final") {
    el.innerHTML = `<span style="color:#39FF14">🏆 Gran Final — los 5 finalistas ya están definidos.</span>`;
  } else if (cut) {
    const active = allParticipants.filter(p => p.status !== "eliminated").length || total;
    el.innerHTML =
      `<span style="color:rgba(255,255,255,0.8)"><strong>${cut.label}:</strong> ${active} participantes activos · ` +
      `Eliminados al finalizar: <span style="color:#ff4444">${cut.eliminate}</span> · ` +
      `Avanzan: <span style="color:#39FF14">${cut.advance}</span></span>`;
  }
}

// ════════════════════════════════════════════════════════════════
// TAB: STATS
// ════════════════════════════════════════════════════════════════

function renderStats() {
  const playedMatches = allMatches.filter(m => m.played).length;
  const total = allParticipants.length;
  const avgPts = total
    ? (allParticipants.reduce((s, p) => s + (p.totalPoints || 0), 0) / total).toFixed(1)
    : 0;

  const exactHits = allParticipants.reduce((sum, p) => {
    const bd = p.matchBreakdown || [];
    return sum + bd.filter(m => m.hitScore).length;
  }, 0);

  document.getElementById("st-total").textContent   = total;
  document.getElementById("st-matches").textContent = playedMatches;
  document.getElementById("st-avg").textContent     = avgPts;
  document.getElementById("st-exact").textContent   = exactHits;

  // Top 10
  const top10 = document.getElementById("statsTop10");
  top10.innerHTML = allParticipants.slice(0, 10).map((p, i) => `
    <div class="top10-item">
      <span class="top10-rank" style="${i < 3 ? "color:var(--green)" : ""}">${i + 1}</span>
      <span class="top10-name">${esc(p.name)}</span>
      <span class="top10-pts">${p.totalPoints || 0} pts</span>
    </div>
  `).join("") || `<p style="color:rgba(255,255,255,0.4);padding:16px;font-size:13px">Sin datos</p>`;

  // Match accuracy
  const accContainer = document.getElementById("statsMatchAccuracy");
  const matchHits    = {};
  const matchTotals  = {};

  for (const p of allParticipants) {
    for (const m of (p.matchBreakdown || [])) {
      matchHits[m.matchKey]   = (matchHits[m.matchKey]   || 0) + (m.hitWinner ? 1 : 0);
      matchTotals[m.matchKey] = (matchTotals[m.matchKey] || 0) + 1;
    }
  }

  const accuracy = Object.entries(matchHits)
    .map(([key, hits]) => {
      const real = allMatches.find(m => m.matchKey === key) || {};
      return {
        label: `${real.homeTeam || key} vs ${real.awayTeam || ""}`,
        pct:   Math.round((hits / (matchTotals[key] || 1)) * 100)
      };
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 8);

  accContainer.innerHTML = accuracy.map(a => `
    <div class="accuracy-item">
      <span class="accuracy-item-match">${esc(a.label)}</span>
      <div class="accuracy-bar-wrap"><div class="accuracy-bar" style="width:${a.pct}%"></div></div>
      <span class="accuracy-pct">${a.pct}%</span>
    </div>
  `).join("") || `<p style="color:rgba(255,255,255,0.4);padding:16px;font-size:13px">Sin datos de precisión aún.</p>`;
}

// ════════════════════════════════════════════════════════════════
// LOAD RESULTS INTO MEMORY (for offline calc)
// ════════════════════════════════════════════════════════════════

onSnapshot(collection(db, "matches"), snap => {
  allResults = {};
  snap.docs.forEach(d => {
    const m = d.data();
    if (m.played && m.matchKey) {
      allResults[m.matchKey] = {
        played:   true,
        result:   m.result,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        homeTeam:  m.homeTeam,
        awayTeam:  m.awayTeam,
        week:      m.week,
        phase:     m.phase || "groups"
      };
    }
  });
});

// ════════════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════════════

function buildMatchKey(home, away) {
  const norm = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return norm(home) + "_vs_" + norm(away);
}

function esc(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── TOAST ────────────────────────────────────────────────────────
function showToast(msg, type = "success") {
  const toast = document.getElementById("toast");
  const icon  = toast.querySelector("i");
  document.getElementById("toastMsg").textContent = msg;

  if (type === "error") {
    toast.style.borderColor = "rgba(255,68,68,0.4)";
    toast.style.color       = "#ff4444";
    icon.className          = "fa-solid fa-circle-exclamation";
  } else {
    toast.style.borderColor = "rgba(57,255,20,0.4)";
    toast.style.color       = "var(--green)";
    icon.className          = "fa-solid fa-circle-check";
  }

  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3500);
}

// ── CONFIRM MODAL ────────────────────────────────────────────────
let confirmCallback = null;

function showModal(title, body, onConfirm) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").textContent  = body;
  document.getElementById("confirmModal").classList.remove("hidden");
  confirmCallback = onConfirm;
}

// ════════════════════════════════════════════════════════════════
// PARTICIPANT DETAILS DRAWER
// ════════════════════════════════════════════════════════════════

const detailsDrawer  = document.getElementById("detailsDrawer");
const drawerOverlay  = document.getElementById("drawerOverlay");

function closeDrawer() {
  detailsDrawer.classList.remove("open");
  detailsDrawer.addEventListener("transitionend", () => {
    detailsDrawer.classList.add("hidden");
    drawerOverlay.classList.add("hidden");
  }, { once: true });
}

document.getElementById("drawerClose").addEventListener("click", closeDrawer);
drawerOverlay.addEventListener("click", closeDrawer);

window.openParticipantDrawer = (id) => {
  const p = allParticipants.find(x => x.id === id);
  if (!p) return;

  // Header
  document.getElementById("drawerName").textContent = `#${p.rank} ${p.name}`;
  document.getElementById("drawerMeta").textContent =
    `${Object.keys(p.predictions || {}).length} predicciones · ${p.totalPoints || 0} pts totales`;

  // Build a matchKey → match lookup for week/phase data
  const matchByKey = {};
  for (const m of allMatches) {
    if (m.matchKey) matchByKey[m.matchKey] = m;
  }

  // Group ALL predictions (played + pending) by section key
  const sectionOrder = ["Semana 1","Semana 2","Semana 3",
    "Dieciseisavos","Octavos","Cuartos","Semifinal","Final"];

  const groups = {}; // sectionKey → array of items

  // Played matches (have breakdown entry with points)
  const breakdown = p.matchBreakdown || [];
  const playedKeys = new Set(breakdown.map(m => m.matchKey));

  for (const m of breakdown) {
    const key = m.phase === "groups"
      ? `Semana ${m.week || 1}`
      : phaseLabel(m.phase);
    if (!groups[key]) groups[key] = [];
    groups[key].push({ ...m, isPending: false });
  }

  // Pending predictions — cross-reference allMatches for week/phase
  for (const [matchKey, pred] of Object.entries(p.predictions || {})) {
    if (playedKeys.has(matchKey)) continue;
    const match = matchByKey[matchKey];
    const phase = match?.phase || "groups";
    const week  = match?.week  || 1;
    const key   = phase === "groups" ? `Semana ${week}` : phaseLabel(phase);
    if (!groups[key]) groups[key] = [];
    groups[key].push({ ...pred, isPending: true });
  }

  let html = `
    <div class="drawer-total-bar">
      <span class="drawer-total-label">Puntos totales</span>
      <span class="drawer-total-pts">${p.totalPoints || 0} pts</span>
    </div>`;

  const sortedKeys = Object.keys(groups).sort((a, b) => {
    const ia = sectionOrder.indexOf(a); const ib = sectionOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  for (const section of sortedKeys) {
    html += `<div class="drawer-section-title">${section}</div>`;

    for (const m of groups[section]) {
      if (m.isPending) {
        // Partido sin resultado aún
        const predScoreStr = (m.homeScore != null && m.awayScore != null)
          ? `${m.homeScore}-${m.awayScore}` : "—";
        const teamPicked = teamLabel(m.prediction, m.homeTeam, m.awayTeam);

        html += `
          <div class="pred-row pending">
            <div>
              <div class="pred-match">${esc(m.homeTeam || m.matchKey)} vs ${esc(m.awayTeam || "")}</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:2px">
                Eligió: <strong style="color:rgba(255,255,255,0.55)">${esc(teamPicked)}</strong> ${predScoreStr}
              </div>
            </div>
            <div class="pred-score-block">
              <div class="pred-score-pred">${predScoreStr}</div>
              <div class="pred-score-real" style="color:rgba(255,255,255,0.2)">pendiente</div>
            </div>
            <div class="pred-pts pending">—</div>
          </div>`;
      } else {
        // Partido ya jugado
        const rowClass = m.hitScore ? "hit-score" : m.hitWinner ? "hit-winner" : "miss";
        const predScoreStr = (m.predHome != null && m.predAway != null)
          ? `${m.predHome}-${m.predAway}` : "—";
        const realScoreStr = `${m.realHome}-${m.realAway}`;
        const ptsClass = m.total === 5 ? "pts-5" : m.total >= 3 ? "pts-3" : "pts-0";
        const teamPicked = teamLabel(m.predResult, m.homeTeam, m.awayTeam);
        const teamReal   = teamLabel(m.realResult, m.homeTeam, m.awayTeam);

        html += `
          <div class="pred-row ${rowClass}">
            <div>
              <div class="pred-match">${esc(m.homeTeam || m.matchKey)} vs ${esc(m.awayTeam || "")}</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px">
                Eligió: <strong style="color:rgba(255,255,255,0.65)">${esc(teamPicked)}</strong> ${predScoreStr}
                &nbsp;·&nbsp; Real: ${esc(teamReal)} ${realScoreStr}
              </div>
            </div>
            <div class="pred-score-block">
              <div class="pred-score-pred">${predScoreStr}</div>
              <div class="pred-score-real">${realScoreStr}</div>
            </div>
            <div class="pred-pts ${ptsClass}">${m.total}pts</div>
          </div>`;
      }
    }
  }

  if (!breakdown.length && !Object.keys(p.predictions || {}).length) {
    html += `<p style="color:rgba(255,255,255,0.35);padding:32px 0;text-align:center;font-size:13px">Sin predicciones registradas.</p>`;
  }

  document.getElementById("drawerBody").innerHTML = html;

  // Show drawer
  detailsDrawer.classList.remove("hidden");
  drawerOverlay.classList.remove("hidden");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => detailsDrawer.classList.add("open"));
  });
};

function phaseLabel(phase) {
  const map = {
    groups: "Fase de Grupos", round_of_16: "Dieciseisavos",
    round_of_8: "Octavos", quarter_final: "Cuartos",
    semi_final: "Semifinal", final: "Final"
  };
  return map[phase] || phase;
}

/** Devuelve el nombre del equipo elegido en lugar de "Local/Visitante" */
function teamLabel(result, homeTeam, awayTeam) {
  if (result === "home") return homeTeam || "Local";
  if (result === "away") return awayTeam || "Visitante";
  if (result === "draw") return "Empate";
  return "—";
}

// ── NOTIFICATIONS ───────────────────────────────────────────────

window.refreshNotifCount = async () => {
  try {
    const snap = await getDocs(collection(db, "fcmTokens"));
    document.getElementById("notifCount").textContent = snap.size;
  } catch (e) {
    document.getElementById("notifCount").textContent = "—";
  }
};

// Build a JWT and exchange it for a Google OAuth2 access token
async function getGoogleAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim  = {
    iss:   serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud:   "https://oauth2.googleapis.com/token",
    iat:   now,
    exp:   now + 3600
  };
  const encode = obj => btoa(JSON.stringify(obj))
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  const sigInput = `${encode(header)}.${encode(claim)}`;

  // Import RSA private key
  const pemBody = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/,"")
    .replace(/-----END PRIVATE KEY-----/,"")
    .replace(/\s+/g,"");
  const keyBytes = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", keyBytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(sigInput)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  const jwt = `${sigInput}.${sigB64}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(data.error_description || "No access_token");
  return data.access_token;
}

async function sendFCMToAll(title, body, accessToken, projectId) {
  const snap = await getDocs(collection(db, "fcmTokens"));
  // Token puede estar en el campo 'token' (nuevo formato) o en el id (formato viejo)
  const tokens = [...new Set(snap.docs.map(d => d.data().token || d.id).filter(Boolean))];
  let sent = 0, failed = 0;

  await Promise.all(tokens.map(async token => {
    try {
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            message: {
              token,
              // Solo data — el service worker muestra la notificación manualmente
              // Esto evita que iOS muestre la notificación automáticamente Y el SW también
              data: { title, body },
              webpush: { headers: { Urgency: "high" } }
            }
          })
        }
      );
      if (res.ok) sent++;
      else {
        // Remove invalid token
        const err = await res.json();
        if (err.error?.details?.some(d => d.errorCode === "UNREGISTERED")) {
          await deleteDoc(doc(db, "fcmTokens", token));
        }
        failed++;
      }
    } catch { failed++; }
  }));
  return { sent, failed, total: tokens.length };
}

window.sendManualNotification = async () => {
  const title = document.getElementById("notifTitle").value.trim();
  const body  = document.getElementById("notifBody").value.trim();
  const status = document.getElementById("notifStatus");
  const btn    = document.getElementById("notifSendBtn");

  if (!title || !body) {
    status.style.color = "#ef4444";
    status.textContent = "⚠ Escribe título y mensaje.";
    return;
  }
  btn.disabled = true;
  status.style.color = "#aaa";
  status.textContent = "Enviando…";

  try {
    const cfgSnap = await getDoc(doc(db, "config", "fcm"));
    if (!cfgSnap.exists()) throw new Error("No se encontró config/fcm en Firestore.");
    let sa = cfgSnap.data();
    // Si se guardó como string JSON, parsearlo
    if (typeof sa === "string") sa = JSON.parse(sa);
    // Si se guardó anidado bajo una clave
    if (!sa.private_key && sa.serviceAccount) sa = sa.serviceAccount;
    if (!sa.private_key && sa.json) sa = JSON.parse(sa.json);
    // Normalizar campos camelCase vs snake_case
    // Normalizar campos camelCase vs snake_case
    if (!sa.private_key  && sa.privateKey)  sa.private_key  = sa.privateKey;
    if (!sa.client_email && sa.clientEmail) sa.client_email = sa.clientEmail;
    if (!sa.project_id   && sa.projectId)   sa.project_id   = sa.projectId;
    if (!sa.private_key) throw new Error(`Campo private_key no encontrado. Campos disponibles: ${Object.keys(sa).join(", ")}`);
    const accessToken = await getGoogleAccessToken(sa);
    const { sent, failed, total } = await sendFCMToAll(title, body, accessToken, sa.project_id);
    status.style.color = "#39ff14";
    status.textContent = `✅ Enviado a ${sent}/${total} dispositivos${failed ? ` (${failed} fallaron)` : ""}.`;
    // Clear form
    document.getElementById("notifTitle").value = "";
    document.getElementById("notifBody").value  = "";
  } catch (e) {
    status.style.color = "#ef4444";
    status.textContent = `❌ Error: ${e.message}`;
  } finally {
    btn.disabled = false;
  }
};

// Auto-notify on match finalize
async function autoNotifyMatchResult(match, homeScore, awayScore) {
  try {
    const cfgSnap = await getDoc(doc(db, "config", "fcm"));
    if (!cfgSnap.exists()) return;
    let sa = cfgSnap.data();
    if (typeof sa === "string") sa = JSON.parse(sa);
    if (!sa.private_key && sa.serviceAccount) sa = sa.serviceAccount;
    if (!sa.private_key && sa.json) sa = JSON.parse(sa.json);
    if (!sa.private_key  && sa.privateKey)  sa.private_key  = sa.privateKey;
    if (!sa.client_email && sa.clientEmail) sa.client_email = sa.clientEmail;
    if (!sa.project_id   && sa.projectId)   sa.project_id   = sa.projectId;
    if (!sa.private_key) return;
    const accessToken = await getGoogleAccessToken(sa);
    const winner = homeScore > awayScore
      ? `Gana ${match.homeTeam}`
      : awayScore > homeScore ? `Gana ${match.awayTeam}` : "Empate";
    await sendFCMToAll(
      `⚽ ${match.homeTeam} ${homeScore}–${awayScore} ${match.awayTeam}`,
      `${winner} · ¡Puntos actualizados! Revisa tu posición en la tabla.`,
      accessToken, sa.project_id
    );
  } catch (e) {
    console.warn("Auto-notif error:", e.message);
  }
}

document.getElementById("modalCancel").addEventListener("click", () => {
  document.getElementById("confirmModal").classList.add("hidden");
  confirmCallback = null;
});

document.getElementById("modalConfirm").addEventListener("click", async () => {
  document.getElementById("confirmModal").classList.add("hidden");
  if (confirmCallback) await confirmCallback();
  confirmCallback = null;
});

// ── RECORDATORIOS AUTOMÁTICOS 24H ANTES DE CADA SEMANA ──────────
async function checkWeeklyReminders() {
  // Solo fase de grupos, semanas 1-3
  if (!allMatches.length) return;
  try {
    const cfgSnap = await getDoc(doc(db, "config", "fcm"));
    if (!cfgSnap.exists()) return;
    let sa = cfgSnap.data();
    if (!sa.private_key  && sa.privateKey)  sa.private_key  = sa.privateKey;
    if (!sa.client_email && sa.clientEmail) sa.client_email = sa.clientEmail;
    if (!sa.project_id   && sa.projectId)   sa.project_id   = sa.projectId;
    if (!sa.private_key) return;

    const remSnap = await getDoc(doc(db, "config", "reminders"));
    const sent = remSnap.exists() ? (remSnap.data().sent || {}) : {};

    const now = Date.now();
    const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 horas

    // Agrupar partidos por semana y fase de grupos
    const groupMatches = allMatches.filter(m => (m.phase || "groups") === "groups");
    for (const week of [1, 2, 3]) {
      const weekMatches = groupMatches.filter(m => m.week === week);
      if (!weekMatches.length) continue;

      // Primer partido de la semana (ya están ordenados por fecha)
      const firstDate = new Date(weekMatches[0].date).getTime();
      const reminderTime = firstDate - WINDOW_MS;
      const reminderKey  = `week_${week}`;

      // ¿Ya se mandó este recordatorio?
      if (sent[reminderKey]) continue;

      // ¿Estamos dentro de la ventana? (entre 24h y 0h antes del partido)
      if (now >= reminderTime && now < firstDate) {
        // Mandar recordatorio
        const accessToken = await getGoogleAccessToken(sa);
        await sendFCMToAll(
          `⏰ Semana ${week} comienza mañana`,
          `¡Último día para enviar tu quiniela de la Semana ${week}! No te quedes fuera.`,
          accessToken, sa.project_id
        );
        // Marcar como enviado
        await setDoc(doc(db, "config", "reminders"), {
          sent: { ...sent, [reminderKey]: new Date().toISOString() }
        }, { merge: true });
        showToast(`📣 Recordatorio Semana ${week} enviado automáticamente.`);
      }
    }
  } catch (e) {
    console.warn("checkWeeklyReminders error:", e.message);
  }
}
