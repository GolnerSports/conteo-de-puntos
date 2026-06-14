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
  "Arabia Saudí":"🇸🇦","Arabia Saudita":"🇸🇦","Arabia Saudi":"🇸🇦","Arabia Saúdi":"🇸🇦",
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
  "Nueva Zelanda":"🇳🇿","N. Zelanda":"🇳🇿","NZ":"🇳🇿",
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

// ── TEAM NAME NORMALIZATION (usado en import preview y save) ────
const TEAM_ALIASES = {
  // ── Abreviaciones en español ──
  "rep checa":             "republica checa",
  "rep. checa":            "republica checa",
  "chequia":               "republica checa",   // variante alternativa
  "bosnia herz":           "bosnia herzegovina",
  "bosnia herz.":          "bosnia herzegovina",
  "bosnia-herzegovina":    "bosnia herzegovina",
  "bosnia and herzegovina":"bosnia herzegovina",
  "rd congo":              "rd congo",
  "r.d. congo":            "rd congo",
  "republica democratica del congo": "rd congo",
  "ee.uu.":                "estados unidos",
  "ee uu":                 "estados unidos",
  "ee.uu":                 "estados unidos",
  "usa":                   "estados unidos",
  "eeuu":                  "estados unidos",
  "corea sur":             "corea del sur",
  "corea norte":           "corea del norte",
  "n. zelanda":            "nueva zelanda",
  "n zelanda":             "nueva zelanda",
  "irlanda norte":         "irlanda del norte",
  "cabo de verde":         "cabo verde",
  "arabia saudi":          "arabia saudita",
  "catar":                 "catar",             // Qatar en español
  // ── Nombres en inglés ──
  "united states":         "estados unidos",
  "u.s.":                  "estados unidos",
  "brazil":                "brasil",
  "germany":               "alemania",
  "france":                "francia",
  "spain":                 "espana",
  "england":               "inglaterra",
  "netherlands":           "paises bajos",
  "holland":               "paises bajos",
  "switzerland":           "suiza",
  "sweden":                "suecia",
  "denmark":               "dinamarca",
  "norway":                "noruega",
  "portugal":              "portugal",
  "argentina":             "argentina",
  "colombia":              "colombia",
  "morocco":               "marruecos",
  "senegal":               "senegal",
  "japan":                 "japon",
  "south korea":           "corea del sur",
  "korea republic":        "corea del sur",
  "iran":                  "iran",
  "australia":             "australia",
  "saudi arabia":          "arabia saudita",
  "ecuador":               "ecuador",
  "ghana":                 "ghana",
  "cameroon":              "camerun",
  "tunisia":               "tunez",
  "nigeria":               "nigeria",
  "ivory coast":           "costa de marfil",
  "cote d'ivoire":         "costa de marfil",
  "south africa":          "sudafrica",
  "dr congo":              "rd congo",
  "congo dr":              "rd congo",
  "turkiye":               "turquia",
  "turkey":                "turquia",
  "algeria":               "argelia",
  "belgium":               "belgica",
  "egypt":                 "egipto",
  "cape verde":            "cabo verde",
  "curacao":               "curazao",
  "jordan":                "jordania",
  "scotland":              "escocia",
  "haiti":                 "haiti",
  "iraq":                  "irak",
  "new zealand":           "nueva zelanda",
  "panama":                "panama",
  "croatia":               "croacia",
  "uzbekistan":            "uzbekistan",
  "mexico":                "mexico",
  "canada":                "canada",
  "uruguay":               "uruguay",
  "paraguay":              "paraguay",
  "czechia":               "republica checa",
  "czech republic":        "republica checa",
};
const normTeam = t => {
  const s = (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9 ]/gi,"").toLowerCase().trim();
  return TEAM_ALIASES[s] || s;
};
const fuzzyFindInMatches = (pred, matches) => {
  // 1. Exacto
  let m = matches.find(m => m.matchKey === pred.matchKey);
  if (m) return m;
  // 2. matchKey normalizado desde homeTeam/awayTeam de Firestore
  m = matches.find(m =>
    (m.homeTeam + "_vs_" + m.awayTeam).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g,"_") === pred.matchKey
  );
  if (m) return m;
  // 3. Por alias de nombre de equipo
  const pH = normTeam(pred.homeTeam);
  const pA = normTeam(pred.awayTeam);
  return matches.find(m => normTeam(m.homeTeam) === pH && normTeam(m.awayTeam) === pA) || null;
};
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

// Participants (todos, sin orderBy para incluir los que no tienen totalPoints aún)
onSnapshot(
  collection(db, "participants"),
  snap => {
    const raw = snap.docs.map(d => ({ id: d.id, totalPoints: 0, ...d.data() }));
    raw.sort((a, b) => {
      const ptsDiff = (b.totalPoints || 0) - (a.totalPoints || 0);
      if (ptsDiff !== 0) return ptsDiff;
      return (b.exactScores || 0) - (a.exactScores || 0);
    });
    allParticipants = raw.map((p, i) => ({ ...p, rank: i + 1 }));
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

  // Buscar SOLO por ID Golner — nunca por nombre (puede haber participantes con el mismo nombre)
  const existing = parsedData.golnerId
    ? allParticipants.find(p => (p.golnerId || "").toUpperCase() === parsedData.golnerId)
    : null;

  // ── Tarjeta de confirmación de identidad ──
  const idDetectado   = parsedData.golnerId || "—";
  const nombreDetect  = parsedData.name     || "—";
  const nombreSistema = existing ? existing.name              : "—";
  const idSistema     = existing ? (existing.golnerId || "Sin ID") : "—";

  const matchOk = existing && (
    (parsedData.golnerId && (existing.golnerId || "").toUpperCase() === parsedData.golnerId)
  );
  const matchNombre = existing && !matchOk; // encontrado solo por nombre

  const identityCard = `
    <div style="margin:0 0 10px;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,0.1)">
      <div style="padding:8px 14px;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;
                  background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.4)">
        Verificación de identidad
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;border-top:1px solid rgba(255,255,255,0.07)">
        <div style="padding:12px 14px;border-right:1px solid rgba(255,255,255,0.07)">
          <div style="font-size:10px;color:rgba(255,255,255,0.35);margin-bottom:6px;letter-spacing:0.5px">MENSAJE RECIBIDO</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:3px">ID: <span style="color:#fff;font-weight:700">${idDetectado}</span></div>
          <div style="font-size:11px;color:rgba(255,255,255,0.5)">Nombre: <span style="color:#fff;font-weight:600">${nombreDetect}</span></div>
        </div>
        <div style="padding:12px 14px">
          <div style="font-size:10px;color:rgba(255,255,255,0.35);margin-bottom:6px;letter-spacing:0.5px">PARTICIPANTE EN SISTEMA</div>
          ${existing ? `
            <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:3px">ID: <span style="color:#39FF14;font-weight:700">${idSistema}</span></div>
            <div style="font-size:11px;color:rgba(255,255,255,0.5)">Nombre: <span style="color:#39FF14;font-weight:600">${nombreSistema}</span></div>
          ` : `
            <div style="font-size:12px;color:#ffaa00;font-weight:600;margin-top:4px">No encontrado</div>
          `}
        </div>
      </div>
      <div style="padding:8px 14px;border-top:1px solid rgba(255,255,255,0.07);
                  ${existing ? "background:rgba(57,255,20,0.06)" : "background:rgba(255,170,0,0.06)"}">
        ${existing
          ? `<span style="font-size:11px;color:#39FF14;font-weight:600">
               <i class="fa-solid fa-circle-check" style="margin-right:5px"></i>
               ${matchOk ? "Vinculado por ID — se actualizarán sus predicciones" : "Vinculado por nombre — se actualizarán sus predicciones y se guardará el ID"}
             </span>`
          : `<span style="font-size:11px;color:#ffaa00;font-weight:600">
               <i class="fa-solid fa-user-plus" style="margin-right:5px"></i>
               Participante nuevo — se registrará por primera vez
             </span>`
        }
      </div>
    </div>`;
  const statusBadge = identityCard;


  // Agrupar predicciones por semana para el preview
  const previewGroups = {};
  for (const pred of parsedData.predictions) {
    const fsMatch = fuzzyFindInMatches(pred, allMatches);
    const week = fsMatch?.week || "?";
    const label = fsMatch ? `Semana ${week}` : "Sin asignar";
    if (!previewGroups[label]) previewGroups[label] = [];
    previewGroups[label].push(pred);
  }
  const weekOrder = ["Semana 1","Semana 2","Semana 3","Sin asignar"];
  const groupedPreviewHtml = weekOrder.filter(k => previewGroups[k]).map(label => `
    <div style="margin-top:12px;font-size:11px;font-weight:700;color:rgba(57,255,20,0.7);text-transform:uppercase;letter-spacing:1px;padding:4px 0">${label}</div>
    ${previewGroups[label].map(p => {
      const predLabel = !p.prediction ? `<span style="color:#ff4444">Sin detectar</span>`
        : p.prediction === "draw" ? `<span style="color:#ffaa00">Empate</span>`
        : `<span style="color:#39FF14">Gana ${p.prediction === "home" ? p.homeTeam : p.awayTeam}</span>`;
      const scoreLabel = p.homeScore !== null && p.awayScore !== null
        ? `${p.homeScore} - ${p.awayScore}` : `<span style="color:#ff4444">Sin marcador</span>`;
      return `<div class="preview-match">
        <div class="preview-match-teams">${p.homeTeam} vs ${p.awayTeam}</div>
        <div class="preview-match-prediction">${predLabel}</div>
        <div class="preview-match-score">Marcador: ${scoreLabel}</div>
      </div>`;
    }).join("")}
  `).join("");

  // Show preview
  document.getElementById("parserPreview").innerHTML =
    statusBadge + `<div class="preview-participant" style="padding:8px 0">${groupedPreviewHtml}</div>`;

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

  // Habilitar guardar solo si hay ID detectado (sin ID no se puede vincular correctamente)
  const canSave = parsedData.predictions.length > 0 && !!parsedData.golnerId;
  document.getElementById("saveParticipantBtn").disabled = !canSave;
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
  // Buscar SOLO por ID Golner — nunca por nombre
  const existing = parsed.golnerId
    ? allParticipants.find(p => (p.golnerId || "").toUpperCase() === parsed.golnerId)
    : null;

  // Construir mapa de matchKey → match de Firestore (para enriquecer con week/phase)
  const matchByKey = {};
  for (const m of allMatches) {
    if (m.matchKey) matchByKey[m.matchKey] = m;
    // También indexar por matchKey normalizado de los equipos
    const normKey = (m.homeTeam + "_vs_" + m.awayTeam)
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g,"_");
    matchByKey[normKey] = m;
  }


  // Construir mapa de predicciones: matchKey → pred object
  const predictionsMap = {};
  for (const pred of parsed.predictions) {
    const fsMatch = fuzzyFindInMatches(pred, allMatches);
    predictionsMap[pred.matchKey] = {
      matchKey:   pred.matchKey,
      homeTeam:   pred.homeTeam,
      awayTeam:   pred.awayTeam,
      prediction: pred.prediction,
      homeScore:  pred.homeScore,
      awayScore:  pred.awayScore,
      week:       fsMatch?.week  || null,
      phase:      fsMatch?.phase || null,
    };
  }

  // Combinar predicciones existentes con las nuevas (no borrar semanas anteriores)
  const existingPredictions = existing ? (existing.predictions || {}) : {};
  const mergedPredictions = { ...existingPredictions, ...predictionsMap };

  // Calcular puntos con TODAS las predicciones combinadas
  const allPredsList = Object.values(mergedPredictions);
  const { totalPoints, weekPoints, phasePoints, matchBreakdown } =
    GolnerScoring.calcParticipantTotal(allPredsList, allResults);

  const participantData = {
    // Si ya existe, conservar el nombre original — solo actualizar si es nuevo
    name:            existing ? existing.name : parsed.name,
    // Si el participante no tenía ID, aprovechar para guardarlo ahora
    golnerId:        existing?.golnerId || parsed.golnerId || null,
    phone:           existing ? (existing.phone || null) : (parsed.phone || null),
    totalPoints,
    weekPoints,
    phasePoints,
    matchBreakdown,
    predictions:     mergedPredictions,
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

  if (!allParticipants.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:32px;color:rgba(255,255,255,0.4)">Sin participantes aún</td></tr>`;
    return;
  }

  // 1. Ordenar todos por puntos para asignar ranking y calcular EN RIESGO
  const byPoints = allParticipants.slice().sort((a, b) => {
    const ptsDiff = (b.totalPoints || 0) - (a.totalPoints || 0);
    if (ptsDiff !== 0) return ptsDiff;
    const exactDiff = (b.exactScores || 0) - (a.exactScores || 0);
    if (exactDiff !== 0) return exactDiff;
    return (b.correctResults || 0) - (a.correctResults || 0);
  });

  // 2. Asignar rank a cada participante
  const rankMap = {};
  byPoints.forEach((p, i) => { rankMap[p.id] = i + 1; });

  // 3. Calcular EN RIESGO: últimos atRiskCount de los no-eliminados
  const atRiskCount = getAtRiskCount();
  const activeByPoints = byPoints.filter(p => p.status !== "eliminated");
  const atRiskIds = new Set(
    activeByPoints.slice(Math.max(0, activeByPoints.length - atRiskCount)).map(p => p.id)
  );

  // 4. Filtrar y ordenar para mostrar (por golnerId o búsqueda)
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
    const rank = rankMap[p.id] || "—";
    const w1 = (p.weekPoints && p.weekPoints[1]) || 0;
    const w2 = (p.weekPoints && p.weekPoints[2]) || 0;
    const w3 = (p.weekPoints && p.weekPoints[3]) || 0;
    const predCount = Object.keys(p.predictions || {}).length;
    const effectiveStatus = p.status === "eliminated" ? "eliminated"
      : atRiskIds.has(p.id) ? "at_risk"
      : "active";
    const statusBadge = `<span class="badge badge-${statusClass(effectiveStatus)}">${statusLabel(effectiveStatus)}</span>`;

    return `
      <tr>
        <td><span style="color:rgba(255,255,255,0.4);font-family:var(--font-display);font-weight:700">${rank}</span></td>
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

// Cuántos están EN RIESGO según la fase actual
const PHASE_RISK = {
  groups:        10,
  round_of_16:   10,
  round_of_8:    10,
  quarter_final: 15,
  semi_final:    10,
  final:          0,
};

function getAtRiskCount() {
  return PHASE_RISK[tournamentConfig.phase] || 0;
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

  // NO incluir matchKey en el update para no sobreescribir la clave original de Firestore
  await updateDoc(doc(db, "matches", id), {
    live: false, played: true, result, homeScore, awayScore, playedAt: serverTimestamp()
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
      if (match) {
        delete allResults[buildMatchKey(match.homeTeam, match.awayTeam)];
        if (match.matchKey) delete allResults[match.matchKey];
      }

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
    const aExact = (a.matchBreakdown || []).filter(m => m.hitScore).length;
    const bExact = (b.matchBreakdown || []).filter(m => m.hitScore).length;
    if (bExact !== aExact) return bExact - aExact;
    const aHits = (a.matchBreakdown || []).filter(m => m.hitWinner).length;
    const bHits = (b.matchBreakdown || []).filter(m => m.hitWinner).length;
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

  // Construir índice de matchKey canónico → partido real
  // para resolver desfases (ej: "chequia" vs "republica checa" para el mismo partido)
  const canonicalMap = {};
  for (const am of allMatches) {
    if (!am.matchKey) continue;
    const normKey = buildMatchKey(am.homeTeam || "", am.awayTeam || "");
    canonicalMap[am.matchKey] = am.matchKey;
    if (normKey !== am.matchKey) canonicalMap[normKey] = am.matchKey;
  }

  for (const p of allParticipants) {
    for (const m of (p.matchBreakdown || [])) {
      // Usar la clave canónica del partido para evitar duplicados
      const normKey  = buildMatchKey(m.homeTeam || "", m.awayTeam || "");
      const canonical = canonicalMap[m.matchKey] || canonicalMap[normKey] || m.matchKey;
      matchHits[canonical]   = (matchHits[canonical]   || 0) + (m.hitWinner ? 1 : 0);
      matchTotals[canonical] = (matchTotals[canonical] || 0) + 1;
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
      const entry = {
        played:   true,
        result:   m.result,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        homeTeam:  m.homeTeam,
        awayTeam:  m.awayTeam,
        week:      m.week,
        phase:     m.phase || "groups"
      };
      // Indexar por clave almacenada en Firestore
      allResults[m.matchKey] = entry;
      // Indexar también por variante normalizada (resuelve desfases de nombres)
      const normKey = buildMatchKey(m.homeTeam || "", m.awayTeam || "");
      if (normKey && normKey !== m.matchKey) allResults[normKey] = entry;
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
  // Construir set de matchKeys jugados incluyendo variantes normalizadas
  const playedKeys = new Set();
  for (const m of breakdown) {
    playedKeys.add(m.matchKey);
    // También agregar variante normalizada (quita puntos, aplica aliases)
    if (m.homeTeam && m.awayTeam) {
      const normKey = normTeam(m.homeTeam).replace(/\s+/g,"_") + "_vs_" + normTeam(m.awayTeam).replace(/\s+/g,"_");
      playedKeys.add(normKey);
      // Y variante sin underscores en el nombre
      const spaceKey = normTeam(m.homeTeam) + "_vs_" + normTeam(m.awayTeam);
      playedKeys.add(spaceKey);
    }
  }

  for (const m of breakdown) {
    const key = m.phase === "groups"
      ? `Semana ${m.week || 1}`
      : phaseLabel(m.phase);
    if (!groups[key]) groups[key] = [];
    groups[key].push({ ...m, isPending: false });
  }

  // Pending predictions — cross-reference allMatches for week/phase
  for (const [matchKey, pred] of Object.entries(p.predictions || {})) {
    // Verificar si ya está jugado (incluyendo variantes normalizadas del matchKey)
    const normMatchKey = pred.homeTeam && pred.awayTeam
      ? normTeam(pred.homeTeam) + "_vs_" + normTeam(pred.awayTeam)
      : matchKey;
    if (playedKeys.has(matchKey) || playedKeys.has(normMatchKey)) continue;
    const match = matchByKey[matchKey] || fuzzyFindInMatches({ ...pred, matchKey }, allMatches);
    // Usar week/phase del partido en Firestore, o del campo guardado en la predicción
    const phase = match?.phase || pred.phase || "groups";
    const week  = match?.week  || pred.week  || 1;
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

    // Ordenar por fecha del partido
    const getDate = m => {
      const found = matchByKey[m.matchKey] || fuzzyFindInMatches(m, allMatches);
      return found?.date || m.date || "";
    };
    groups[section].sort((a, b) => {
      const da = getDate(a), db = getDate(b);
      return da < db ? -1 : da > db ? 1 : 0;
    });

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
      const rawDate   = weekMatches[0].date;
      const firstDate = (rawDate?.toDate ? rawDate.toDate() : new Date(rawDate)).getTime();
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
