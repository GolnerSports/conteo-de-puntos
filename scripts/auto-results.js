/**
 * GOLNER SPORTS — Auto Results Script
 * Consulta ESPN API, detecta partidos terminados,
 * actualiza Firestore, calcula puntos y envía notificaciones.
 */

const https = require("https");

// ── CONFIG ────────────────────────────────────────────────────────────────────
const PROJECT_ID   = "conteo-de-puntos-golner-sports";
const ESPN_URL     = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

// Service account desde env vars (GitHub Secrets)
const SERVICE_ACCOUNT = {
  type:                        "service_account",
  project_id:                  PROJECT_ID,
  private_key_id:              process.env.SA_PRIVATE_KEY_ID,
  private_key:                 (process.env.SA_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  client_email:                process.env.SA_CLIENT_EMAIL,
  client_id:                   process.env.SA_CLIENT_ID,
  token_uri:                   "https://oauth2.googleapis.com/token",
};

const VAPID_KEY    = process.env.VAPID_KEY;
const FCM_SENDER_ID = "440898623228";

// ── UTILIDADES HTTP ───────────────────────────────────────────────────────────

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error("JSON parse error: " + data.slice(0, 200))); }
      });
    }).on("error", reject);
  });
}

function httpPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const opts = {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), ...headers }
    };
    const u = new URL(url);
    opts.hostname = u.hostname;
    opts.path     = u.pathname + u.search;
    const req = https.request(opts, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function httpPatch(url, body, headers) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const opts = {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), ...headers }
    };
    const u = new URL(url);
    opts.hostname = u.hostname;
    opts.path     = u.pathname + u.search;
    const req = https.request(opts, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ── JWT / OAUTH ───────────────────────────────────────────────────────────────

async function getAccessToken() {
  const crypto = require("crypto");
  const header  = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const now     = Math.floor(Date.now() / 1000);
  const claims  = Buffer.from(JSON.stringify({
    iss:   SERVICE_ACCOUNT.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase.messaging",
    aud:   SERVICE_ACCOUNT.token_uri,
    exp:   now + 3600,
    iat:   now
  })).toString("base64url");

  const unsigned = `${header}.${claims}`;
  const sign     = crypto.createSign("RSA-SHA256");
  sign.update(unsigned);
  const sig = sign.sign(SERVICE_ACCOUNT.private_key, "base64url");
  const jwt = `${unsigned}.${sig}`;

  const res = await httpPost(SERVICE_ACCOUNT.token_uri, null, {});
  // Use form encoding for OAuth
  return new Promise((resolve, reject) => {
    const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
    const opts = {
      hostname: "oauth2.googleapis.com",
      path:     "/token",
      method:   "POST",
      headers:  { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) }
    };
    const req = https.request(opts, r => {
      let d = "";
      r.on("data", c => d += c);
      r.on("end", () => {
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

// ── FIRESTORE ─────────────────────────────────────────────────────────────────

function fsValue(val) {
  if (typeof val === "string")  return { stringValue: val };
  if (typeof val === "number")  return { integerValue: String(val) };
  if (typeof val === "boolean") return { booleanValue: val };
  if (val === null)             return { nullValue: null };
  return { stringValue: String(val) };
}

async function fsGet(token, path) {
  return new Promise((resolve, reject) => {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path:     u.pathname,
      method:   "GET",
      headers:  { Authorization: `Bearer ${token}` }
    };
    const req = https.request(opts, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function fsList(token, collection) {
  return new Promise((resolve, reject) => {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}?pageSize=500`;
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method:   "GET",
      headers:  { Authorization: `Bearer ${token}` }
    };
    const req = https.request(opts, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try { resolve(JSON.parse(d)); }
        catch(e) { resolve({}); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function fsPatch(token, path, fields) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
  const fieldMask = Object.keys(fields).join(",");
  const body = { fields: {} };
  for (const [k, v] of Object.entries(fields)) body.fields[k] = fsValue(v);
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const u = new URL(url + `?updateMask.fieldPaths=${Object.keys(fields).join("&updateMask.fieldPaths=")}`);
    const opts = {
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method:   "PATCH",
      headers:  { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
    };
    const req = https.request(opts, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve({ status: res.statusCode }));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ── ESPN ──────────────────────────────────────────────────────────────────────

async function fetchESPNMatches() {
  // Usar hora de México (UTC-6) para determinar la fecha correcta
  const now   = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const yyyy  = now.getUTCFullYear();
  const mm    = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd    = String(now.getUTCDate()).padStart(2, "0");
  const url   = `${ESPN_URL}?dates=${yyyy}${mm}${dd}`;
  console.log(`📡 Consultando ESPN: ${url}`);
  const data = await httpGet(url);
  return (data.events || []).map(ev => {
    const comp  = ev.competitions?.[0];
    const home  = comp?.competitors?.find(c => c.homeAway === "home");
    const away  = comp?.competitors?.find(c => c.homeAway === "away");
    const state = comp?.status?.type?.state;   // "pre" | "in" | "post"
    const completed = comp?.status?.type?.completed === true;
    return {
      id:        ev.id,
      homeTeam:  home?.team?.displayName || "",
      awayTeam:  away?.team?.displayName || "",
      homeScore: parseInt(home?.score || "0", 10),
      awayScore: parseInt(away?.score || "0", 10),
      status:    state,
      completed,
      clock:     comp?.status?.displayClock || "",
      startTime: ev.date
    };
  });
}

// ── SCORING ───────────────────────────────────────────────────────────────────

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
  const clean = (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  return ESPN_NAME_MAP[clean] || clean;
}

function buildMatchKey(home, away) {
  return normalize(home) + "_vs_" + normalize(away);
}

function calcPoints(pred, homeScore, awayScore) {
  if (!pred) return 0;
  const actual = homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "draw";
  let pts = 0;
  if (pred.prediction === actual) pts += 3;
  if (pred.homeScore === homeScore && pred.awayScore === awayScore) pts += 2;
  return pts;
}

// ── FCM ───────────────────────────────────────────────────────────────────────

async function sendPushNotification(token, title, body) {
  const allTokens = await fsList(token, "fcmTokens");
  const docs = allTokens.documents || [];
  console.log(`📲 Enviando a ${docs.length} dispositivos...`);
  let sent = 0;
  for (const doc of docs) {
    const fcmToken = doc.fields?.token?.stringValue || doc.name?.split("/").pop();
    if (!fcmToken || fcmToken.length < 10) continue;
    try {
      const res = await new Promise((resolve, reject) => {
        const payload = JSON.stringify({
          message: {
            token: fcmToken,
            data: { title, body }
          }
        });
        const opts = {
          hostname: "fcm.googleapis.com",
          path:     `/v1/projects/${PROJECT_ID}/messages:send`,
          method:   "POST",
          headers:  { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
        };
        const req = https.request(opts, r => {
          let d = "";
          r.on("data", c => d += c);
          r.on("end", () => resolve({ status: r.statusCode, body: d }));
        });
        req.on("error", reject);
        req.write(payload);
        req.end();
      });
      if (res.status === 200) sent++;
    } catch(e) {
      console.warn("FCM error:", e.message);
    }
  }
  console.log(`✅ Notificaciones enviadas: ${sent}/${docs.length}`);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 GOLNER SPORTS — Auto Results", new Date().toISOString());

  if (!SERVICE_ACCOUNT.private_key || !SERVICE_ACCOUNT.client_email) {
    console.error("❌ Faltan variables de entorno del service account");
    process.exit(1);
  }

  const accessToken = await getAccessToken();
  console.log("🔑 Token obtenido");

  // 1. Obtener partidos de ESPN
  const espnMatches = await fetchESPNMatches();
  console.log(`⚽ Partidos encontrados hoy: ${espnMatches.length}`);

  const finished = espnMatches.filter(m => m.completed);
  console.log(`✅ Terminados: ${finished.length}`);

  if (finished.length === 0) {
    console.log("No hay partidos terminados. Fin.");
    return;
  }

  // 2. Para cada partido terminado, buscar en Firestore
  for (const match of finished) {
    const matchKey = buildMatchKey(match.homeTeam, match.awayTeam);
    console.log(`\n🔍 Procesando: ${match.homeTeam} ${match.homeScore}-${match.awayScore} ${match.awayTeam}`);

    // Buscar en todas las semanas
    for (let week = 1; week <= 8; week++) {
      const weekId = `semana${week}`;
      const matchRes = await fsGet(accessToken, `weeks/${weekId}/matches/${matchKey}`);
      if (matchRes.status !== 200) continue;

      const matchData = matchRes.body.fields;
      // ¿Ya está finalizado?
      if (matchData?.finalized?.booleanValue === true) {
        console.log(`  ⏭️  Ya estaba finalizado en ${weekId}`);
        continue;
      }

      console.log(`  📝 Actualizando resultado en ${weekId}...`);

      // Actualizar partido con resultado
      await fsPatch(accessToken, `weeks/${weekId}/matches/${matchKey}`, {
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        finalized: true,
        autoUpdated: true,
        updatedAt: new Date().toISOString()
      });

      // 3. Obtener predicciones de participantes
      const predsRes = await fsList(accessToken, `weeks/${weekId}/predictions`);
      const predDocs = predsRes.documents || [];
      console.log(`  👥 Participantes: ${predDocs.length}`);

      let processed = 0;
      for (const predDoc of predDocs) {
        const participantId = predDoc.name?.split("/").pop();
        const preds = predDoc.fields?.predictions;
        if (!preds?.arrayValue?.values) continue;

        // Buscar la predicción de este partido
        const predValues = preds.arrayValue.values;
        let matchPred = null;
        for (const v of predValues) {
          const f = v.mapValue?.fields;
          if (!f) continue;
          const mk = f.matchKey?.stringValue || "";
          if (mk === matchKey) {
            matchPred = {
              prediction: f.prediction?.stringValue,
              homeScore:  parseInt(f.homeScore?.integerValue || f.homeScore?.stringValue || "-1"),
              awayScore:  parseInt(f.awayScore?.integerValue || f.awayScore?.stringValue || "-1"),
            };
            break;
          }
        }

        if (!matchPred) continue;

        const pts = calcPoints(matchPred, match.homeScore, match.awayScore);
        console.log(`    ${participantId}: +${pts} pts`);

        // Actualizar puntos del participante para esta semana
        // Leer puntos actuales
        const scoreRes = await fsGet(accessToken, `weeks/${weekId}/scores/${participantId}`);
        let currentPts = 0;
        if (scoreRes.status === 200 && scoreRes.body.fields?.points) {
          currentPts = parseInt(scoreRes.body.fields.points.integerValue || "0");
        }

        await fsPatch(accessToken, `weeks/${weekId}/scores/${participantId}`, {
          points: currentPts + pts,
          lastUpdated: new Date().toISOString()
        });
        processed++;
      }

      console.log(`  ✅ ${processed} participantes actualizados`);

      // 4. Enviar notificación
      const result = match.homeScore > match.awayScore
        ? `Ganó ${match.homeTeam}`
        : match.awayScore > match.homeScore
        ? `Ganó ${match.awayTeam}`
        : "Empate";

      await sendPushNotification(
        accessToken,
        `⚽ Resultado: ${match.homeTeam} vs ${match.awayTeam}`,
        `${match.homeScore} - ${match.awayScore} | ${result} | Puntos actualizados 🏆`
      );
    }
  }

  console.log("\n🏁 Script finalizado.");
}

main().catch(err => {
  console.error("❌ Error:", err);
  process.exit(1);
});
