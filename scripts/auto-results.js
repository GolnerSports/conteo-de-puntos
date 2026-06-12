/**
 * GOLNER SPORTS — Auto Results Script
 * Consulta ESPN API, detecta partidos terminados,
 * actualiza Firestore, calcula puntos y envía notificaciones.
 */

const https = require("https");

// ── CONFIG ────────────────────────────────────────────────────────────────────
const PROJECT_ID = "conteo-de-puntos-golner-sports";
const ESPN_URL   = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

const SERVICE_ACCOUNT = {
  project_id:   PROJECT_ID,
  private_key_id: process.env.SA_PRIVATE_KEY_ID,
  private_key:    (process.env.SA_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  client_email:   process.env.SA_CLIENT_EMAIL,
  token_uri:      "https://oauth2.googleapis.com/token",
};

// ── ESPN TEAM NAME MAP ────────────────────────────────────────────────────────
const ESPN_NAME_MAP = {
  "south korea": "corea del sur", "korea republic": "corea del sur",
  "czechia": "chequia", "czech republic": "chequia",
  "united states": "estados unidos", "usa": "estados unidos",
  "ivory coast": "costa de marfil", "cote d'ivoire": "costa de marfil",
  "saudi arabia": "arabia saudita",
  "south africa": "sudafrica",
  "congo dr": "congo dr", "dr congo": "congo dr", "democratic republic of congo": "congo dr",
  "new zealand": "nueva zelanda",
  "bosnia-herzegovina": "bosnia", "bosnia and herzegovina": "bosnia",
  "turkiye": "turquia", "turkey": "turquia",
  "netherlands": "paises bajos", "holland": "paises bajos",
  "algeria": "argelia", "germany": "alemania", "belgium": "belgica",
  "switzerland": "suiza", "sweden": "suecia", "norway": "noruega",
  "morocco": "marruecos", "egypt": "egipto", "tunisia": "tunez",
  "cape verde": "cabo verde", "uzbekistan": "uzbekistan",
  "curacao": "curazao", "jordan": "jordania", "scotland": "escocia",
  "england": "inglaterra", "haiti": "haiti", "iran": "iran",
  "iraq": "irak", "austria": "austria", "qatar": "catar",
};

function normalize(s) {
  const clean = (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return ESPN_NAME_MAP[clean] || clean;
}

function buildMatchKey(home, away) {
  return normalize(home) + "_vs_" + normalize(away);
}

// ── SCORING ───────────────────────────────────────────────────────────────────
function calcMatchPoints(pred, real) {
  if (!real || real.result === undefined) return { total: 0, hitWinner: false, hitScore: false };
  const hitWinner = pred.prediction !== null && pred.prediction === real.result;
  const hitScore  = hitWinner &&
    pred.homeScore !== null && pred.awayScore !== null &&
    pred.homeScore === real.homeScore && pred.awayScore === real.awayScore;
  return { total: (hitWinner ? 3 : 0) + (hitScore ? 2 : 0), hitWinner, hitScore };
}

function calcParticipantTotal(predictions, allResults) {
  const weekPoints  = { 1: 0, 2: 0, 3: 0 };
  const phasePoints = {};
  const matchBreakdown = [];
  let totalPoints = 0;

  const predMap = {};
  for (const p of predictions) predMap[p.matchKey] = p;

  for (const [matchKey, real] of Object.entries(allResults)) {
    if (!real.played) continue;
    const pred = predMap[matchKey] || { prediction: null, homeScore: null, awayScore: null };
    const pts  = calcMatchPoints(pred, real);
    totalPoints += pts.total;
    const week  = real.week;
    if (week && weekPoints[week] !== undefined) weekPoints[week] += pts.total;
    const phase = real.phase || "groups";
    phasePoints[phase] = (phasePoints[phase] || 0) + pts.total;
    matchBreakdown.push({
      matchKey, homeTeam: real.homeTeam, awayTeam: real.awayTeam, week, phase, ...pts,
      predHome: pred.homeScore, predAway: pred.awayScore,
      realHome: real.homeScore, realAway: real.awayScore,
      predResult: pred.prediction, realResult: real.result
    });
  }
  return { totalPoints, weekPoints, phasePoints, matchBreakdown };
}

// ── HTTP HELPERS ──────────────────────────────────────────────────────────────
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    }).on("error", reject);
  });
}

function httpRequest(opts, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── OAUTH TOKEN ───────────────────────────────────────────────────────────────
async function getAccessToken() {
  const crypto = require("crypto");
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const now    = Math.floor(Date.now() / 1000);
  const claims = Buffer.from(JSON.stringify({
    iss: SERVICE_ACCOUNT.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase.messaging",
    aud:  SERVICE_ACCOUNT.token_uri,
    exp:  now + 3600, iat: now
  })).toString("base64url");

  const unsigned = `${header}.${claims}`;
  const sign     = crypto.createSign("RSA-SHA256");
  sign.update(unsigned);
  const jwt = `${unsigned}.${sign.sign(SERVICE_ACCOUNT.private_key, "base64url")}`;

  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "oauth2.googleapis.com", path: "/token", method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) }
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        const json = JSON.parse(d);
        if (json.access_token) resolve(json.access_token);
        else reject(new Error("Token error: " + d));
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── FIRESTORE REST API ────────────────────────────────────────────────────────
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function fsField(val) {
  if (typeof val === "string")  return { stringValue: val };
  if (typeof val === "number")  return { integerValue: String(Math.round(val)) };
  if (typeof val === "boolean") return { booleanValue: val };
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "object")  return { mapValue: { fields: Object.fromEntries(Object.entries(val).map(([k,v]) => [k, fsField(v)])) } };
  return { stringValue: String(val) };
}

function fsUnwrap(field) {
  if (!field) return null;
  if ("stringValue"  in field) return field.stringValue;
  if ("integerValue" in field) return parseInt(field.integerValue);
  if ("doubleValue"  in field) return parseFloat(field.doubleValue);
  if ("booleanValue" in field) return field.booleanValue;
  if ("nullValue"    in field) return null;
  if ("mapValue"     in field) {
    const f = field.mapValue.fields || {};
    return Object.fromEntries(Object.entries(f).map(([k,v]) => [k, fsUnwrap(v)]));
  }
  if ("arrayValue" in field) return (field.arrayValue.values || []).map(fsUnwrap);
  return null;
}

function fsDocToObj(doc) {
  if (!doc || !doc.fields) return null;
  return Object.fromEntries(Object.entries(doc.fields).map(([k,v]) => [k, fsUnwrap(v)]));
}

async function fsQuery(token, collection) {
  const url = `${FS_BASE}/${collection}?pageSize=500`;
  const u = new URL(url);
  const res = await httpRequest({
    hostname: u.hostname, path: u.pathname + u.search, method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });
  return (res.body.documents || []).map(d => ({
    id: d.name.split("/").pop(),
    ...fsDocToObj(d)
  }));
}

async function fsGet(token, path) {
  const u = new URL(`${FS_BASE}/${path}`);
  const res = await httpRequest({
    hostname: u.hostname, path: u.pathname, method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.status !== 200) return null;
  return { id: res.body.name?.split("/").pop(), ...fsDocToObj(res.body) };
}

async function fsPatch(token, path, fields) {
  const body = JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k,v]) => [k, fsField(v)])) });
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  const u = new URL(`${FS_BASE}/${path}?${mask}`);
  return httpRequest({
    hostname: u.hostname, path: u.pathname + u.search, method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
  }, body);
}

// ── ESPN ──────────────────────────────────────────────────────────────────────
async function fetchESPNMatches() {
  const now  = new Date(Date.now() - 6 * 60 * 60 * 1000); // hora México UTC-6
  const yyyy = now.getUTCFullYear();
  const mm   = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd   = String(now.getUTCDate()).padStart(2, "0");
  const url  = `${ESPN_URL}?dates=${yyyy}${mm}${dd}`;
  console.log(`📡 ESPN: ${url}`);
  const data = await httpGet(url);
  return (data.events || []).map(ev => {
    const comp = ev.competitions?.[0];
    const home = comp?.competitors?.find(c => c.homeAway === "home");
    const away = comp?.competitors?.find(c => c.homeAway === "away");
    return {
      id:        ev.id,
      homeTeam:  home?.team?.displayName || "",
      awayTeam:  away?.team?.displayName || "",
      homeScore: parseInt(home?.score || "0"),
      awayScore: parseInt(away?.score || "0"),
      completed: comp?.status?.type?.completed === true,
      state:     comp?.status?.type?.state,
    };
  });
}

// ── FCM ───────────────────────────────────────────────────────────────────────
async function sendPushToAll(token, title, body) {
  const tokens = await fsQuery(token, "fcmTokens");
  console.log(`📲 Enviando a ${tokens.length} dispositivos...`);
  let sent = 0;
  for (const t of tokens) {
    const fcmToken = t.token || t.id;
    if (!fcmToken || fcmToken.length < 10) continue;
    try {
      const payload = JSON.stringify({ message: { token: fcmToken, data: { title, body } } });
      const res = await httpRequest({
        hostname: "fcm.googleapis.com",
        path: `/v1/projects/${PROJECT_ID}/messages:send`,
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
      }, payload);
      if (res.status === 200) sent++;
    } catch(e) { /* silencioso */ }
  }
  console.log(`✅ Notificaciones enviadas: ${sent}/${tokens.length}`);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 GOLNER SPORTS — Auto Results", new Date().toISOString());

  if (!SERVICE_ACCOUNT.private_key || !SERVICE_ACCOUNT.client_email) {
    console.error("❌ Faltan variables de entorno del service account");
    process.exit(1);
  }

  const token = await getAccessToken();
  console.log("🔑 Token obtenido");

  // 1. ESPN matches de hoy
  const espnMatches = await fetchESPNMatches();
  const finished = espnMatches.filter(m => m.completed);
  console.log(`⚽ Hoy: ${espnMatches.length} partidos, ${finished.length} terminados`);

  if (!finished.length) { console.log("Sin partidos terminados. Fin."); return; }

  // 2. Cargar todos los partidos de Firestore
  const allMatches = await fsQuery(token, "matches");
  console.log(`📋 Partidos en Firestore: ${allMatches.length}`);

  // 3. Cargar todos los participantes
  const allParticipants = await fsQuery(token, "participants");
  console.log(`👥 Participantes: ${allParticipants.length}`);

  // 4. Construir mapa de resultados actuales (partidos ya jugados)
  const allResults = {};
  for (const m of allMatches) {
    if (m.played && m.matchKey) {
      allResults[m.matchKey] = {
        played: true, result: m.result,
        homeScore: m.homeScore, awayScore: m.awayScore,
        homeTeam: m.homeTeam, awayTeam: m.awayTeam,
        week: m.week, phase: m.phase || "groups"
      };
    }
  }

  // 5. Procesar cada partido terminado de ESPN
  for (const espn of finished) {
    const matchKey = buildMatchKey(espn.homeTeam, espn.awayTeam);
    console.log(`\n🔍 ${espn.homeTeam} ${espn.homeScore}-${espn.awayScore} ${espn.awayTeam} (key: ${matchKey})`);

    // Buscar en Firestore por matchKey
    const fsMatch = allMatches.find(m => m.matchKey === matchKey || buildMatchKey(m.homeTeam, m.awayTeam) === matchKey);
    if (!fsMatch) {
      console.log(`  ⚠️  Partido no encontrado en Firestore. ¿Nombre diferente?`);
      continue;
    }

    if (fsMatch.played && fsMatch.finalized) {
      console.log(`  ⏭️  Ya estaba finalizado.`);
      continue;
    }

    const result = espn.homeScore > espn.awayScore ? "home" : espn.awayScore > espn.homeScore ? "away" : "draw";

    // 6. Actualizar partido en Firestore
    await fsPatch(token, `matches/${fsMatch.id}`, {
      live: false, played: true, finalized: true,
      result, homeScore: espn.homeScore, awayScore: espn.awayScore,
      matchKey, autoUpdated: true
    });
    console.log(`  ✅ Partido actualizado en Firestore`);

    // 7. Agregar al mapa de resultados
    allResults[matchKey] = {
      played: true, result,
      homeScore: espn.homeScore, awayScore: espn.awayScore,
      homeTeam: fsMatch.homeTeam, awayTeam: fsMatch.awayTeam,
      week: fsMatch.week, phase: fsMatch.phase || "groups"
    };

    // 8. Recalcular puntos de todos los participantes
    let updated = 0;
    for (const p of allParticipants) {
      const preds = Object.values(p.predictions || {});
      const { totalPoints, weekPoints, phasePoints, matchBreakdown } = calcParticipantTotal(preds, allResults);

      // Solo actualizar si cambiaron los puntos
      if (totalPoints !== (p.totalPoints || 0)) {
        await fsPatch(token, `participants/${p.id}`, {
          totalPoints, weekPoints, phasePoints
        });
        updated++;
      }
    }
    console.log(`  👥 ${updated} participantes actualizados`);

    // 9. Notificación push
    const winner = result === "draw" ? "Empate" : result === "home" ? `Gana ${fsMatch.homeTeam}` : `Gana ${fsMatch.awayTeam}`;
    await sendPushToAll(
      token,
      `⚽ ${fsMatch.homeTeam} ${espn.homeScore}-${espn.awayScore} ${fsMatch.awayTeam}`,
      `${winner} · ¡Puntos actualizados! 🏆`
    );
  }

  console.log("\n🏁 Finalizado.");
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
