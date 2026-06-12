/**
 * GOLNER SPORTS — WhatsApp Message Parser v2
 * ────────────────────────────────────────────
 * Soporta el formato oficial GOLNER:
 *
 *   Nombre: *prueba prueba*
 *
 *   01. México vs Sudáfrica
 *       Gana: *México* | Marcador: *1-0*
 *
 *   03. Canadá vs Bosnia
 *       Gana: *Empate* | Marcador: *0-0*
 */

const GolnerParser = (() => {

  // ── HELPERS ──────────────────────────────────────────────────

  // Elimina asteriscos de WhatsApp (*texto* → texto)
  function stripMarkdown(str) {
    return (str || "").replace(/\*/g, "").trim();
  }

  function removeAccents(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function normalizeKey(str) {
    return removeAccents(str.toLowerCase().trim());
  }

  // Detecta "X-Y" o "X:Y" como marcador
  function parseScore(str) {
    const clean = str.trim().replace(/\s/g, "");
    const match = clean.match(/^(\d{1,2})[-:](\d{1,2})$/);
    if (!match) return null;
    return { home: parseInt(match[1], 10), away: parseInt(match[2], 10) };
  }

  function resultFromScore(h, a) {
    if (h > a) return "home";
    if (a > h) return "away";
    return "draw";
  }

  // ── NOMBRE ───────────────────────────────────────────────────

  function extractName(lines) {
    for (const line of lines) {
      const clean = stripMarkdown(line);
      const norm  = normalizeKey(clean);
      if (norm.startsWith("nombre:") || norm.startsWith("name:") || norm.startsWith("participante:")) {
        const colonIdx = clean.indexOf(":");
        const name = stripMarkdown(clean.slice(colonIdx + 1));
        if (name.length > 0) return name;
      }
    }
    return "Participante desconocido";
  }

  // ── ID GOLNER ─────────────────────────────────────────────────

  function extractGolnerId(lines) {
    for (const line of lines) {
      const clean = stripMarkdown(line);
      const norm  = normalizeKey(clean);
      if (norm.startsWith("id golner:") || norm.startsWith("id:")) {
        const colonIdx = clean.indexOf(":");
        const id = stripMarkdown(clean.slice(colonIdx + 1));
        if (id.length > 0) return id.toUpperCase();
      }
    }
    return null;
  }

  // ── TELÉFONO ──────────────────────────────────────────────────

  function extractPhone(lines) {
    for (const line of lines) {
      const clean = stripMarkdown(line);
      const norm  = normalizeKey(clean);
      if (norm.startsWith("telefono:") || norm.startsWith("teléfono:") || norm.startsWith("tel:")) {
        const colonIdx = clean.indexOf(":");
        const phone = stripMarkdown(clean.slice(colonIdx + 1)).replace(/\s/g, "");
        if (phone.length > 0) return phone;
      }
    }
    return null;
  }

  // ── PARSEAR LÍNEA DE PREDICCIÓN ───────────────────────────────
  /**
   * Parsea: "Gana: *México* | Marcador: *1-0*"
   * o:      "Gana: *Empate* | Marcador: *0-0*"
   * Retorna: { prediction, homeScore, awayScore } o null
   */
  function parsePredictionLine(line, homeTeam, awayTeam) {
    const clean = stripMarkdown(line);
    const norm  = normalizeKey(clean);

    if (!norm.includes("gana:") && !norm.includes("winner:")) return null;

    let prediction = null;
    let homeScore  = null;
    let awayScore  = null;

    // Separar por "|"
    const parts = clean.split("|");

    // Parte 1: Gana: X
    const ganaPart = parts[0] || "";
    const ganaIdx  = ganaPart.toLowerCase().indexOf("gana:");
    const winerIdx = ganaPart.toLowerCase().indexOf("winner:");
    const idx      = ganaIdx >= 0 ? ganaIdx : winerIdx;
    if (idx >= 0) {
      const label = idx === ganaIdx ? "gana:" : "winner:";
      const winner = ganaPart.slice(ganaPart.toLowerCase().indexOf(label) + label.length).trim();
      const wNorm  = normalizeKey(winner);

      if (wNorm === "empate" || wNorm === "draw" || wNorm === "tie") {
        prediction = "draw";
      } else if (normalizeKey(homeTeam).includes(wNorm) || wNorm.includes(normalizeKey(homeTeam))) {
        prediction = "home";
      } else if (normalizeKey(awayTeam).includes(wNorm) || wNorm.includes(normalizeKey(awayTeam))) {
        prediction = "away";
      } else {
        // Comparación más flexible: palabras clave del ganador
        const homeWords = normalizeKey(homeTeam).split(/\s+/);
        const awayWords = normalizeKey(awayTeam).split(/\s+/);
        const winWords  = wNorm.split(/\s+/);

        const matchHome = winWords.some(w => homeWords.some(h => h.startsWith(w) || w.startsWith(h)));
        const matchAway = winWords.some(w => awayWords.some(a => a.startsWith(w) || w.startsWith(a)));

        if (matchHome && !matchAway)      prediction = "home";
        else if (matchAway && !matchHome) prediction = "away";
        else                              prediction = "home"; // fallback
      }
    }

    // Parte 2: Marcador: X-Y
    const marcadorPart = parts[1] || "";
    const marcNorm = normalizeKey(marcadorPart);
    const marcIdx  = marcNorm.indexOf("marcador:");
    const scoreStr = marcIdx >= 0
      ? marcadorPart.slice(marcadorPart.toLowerCase().indexOf("marcador:") + "marcador:".length).trim()
      : marcadorPart.trim();

    const score = parseScore(scoreStr);
    if (score) {
      homeScore = score.home;
      awayScore = score.away;

      // Si marcador contradice "Empate", la predicción explícita gana
      if (prediction === "draw" && homeScore !== awayScore) {
        // Mantenemos "draw" — el participante dijo empate
      }
      // Si no hay predicción aún, inferir del marcador
      if (prediction === null) {
        prediction = resultFromScore(homeScore, awayScore);
      }
    }

    return { prediction, homeScore, awayScore };
  }

  // ── DETECTAR LÍNEA DE PARTIDO ─────────────────────────────────
  /**
   * Detecta líneas como:
   *   "01. México vs Sudáfrica"
   *   "México vs Sudáfrica"
   *   "01. EE.UU. vs Paraguay"
   */
  function isMatchLine(line) {
    const clean = stripMarkdown(line).replace(/^\d+\.\s*/, "");
    return /\s+vs\.?\s+/i.test(clean);
  }

  function extractTeams(line) {
    const clean = stripMarkdown(line).replace(/^\d+\.\s*/, "").trim();
    const parts = clean.split(/\s+vs\.?\s+/i);
    if (parts.length < 2) return null;
    return {
      homeTeam: parts[0].trim(),
      awayTeam: parts.slice(1).join(" vs ").trim()
    };
  }

  // ── PARSE COMPLETO ────────────────────────────────────────────

  function parse(message) {
    const rawLines  = message.split("\n");
    const warnings  = [];
    const predictions = [];

    const name      = extractName(rawLines);
    const golnerId  = extractGolnerId(rawLines);
    const phone     = extractPhone(rawLines);

    let currentMatch = null; // { homeTeam, awayTeam }

    for (const rawLine of rawLines) {
      const line  = rawLine.trim();
      if (!line) continue;

      // ¿Es una línea de partido?
      if (isMatchLine(line)) {
        const teams = extractTeams(line);
        if (teams) {
          currentMatch = teams;
        }
        continue;
      }

      // ¿Es una línea de predicción (Gana: X | Marcador: X-Y)?
      if (currentMatch && /gana:|winner:/i.test(stripMarkdown(line))) {
        const pred = parsePredictionLine(line, currentMatch.homeTeam, currentMatch.awayTeam);
        if (pred) {
          const matchKey = buildMatchKey(currentMatch.homeTeam, currentMatch.awayTeam);
          predictions.push({
            matchKey,
            homeTeam:   currentMatch.homeTeam,
            awayTeam:   currentMatch.awayTeam,
            prediction: pred.prediction,
            homeScore:  pred.homeScore,
            awayScore:  pred.awayScore,
            raw:        line
          });

          if (pred.prediction === null) {
            warnings.push(`⚠️ No se detectó resultado: ${currentMatch.homeTeam} vs ${currentMatch.awayTeam}`);
          }
          if (pred.homeScore === null) {
            warnings.push(`⚠️ Sin marcador: ${currentMatch.homeTeam} vs ${currentMatch.awayTeam}`);
          }
        }
        currentMatch = null;
        continue;
      }

      // Línea de solo marcador (sin "Gana:")
      if (currentMatch) {
        const score = parseScore(stripMarkdown(line));
        if (score) {
          const matchKey = buildMatchKey(currentMatch.homeTeam, currentMatch.awayTeam);
          predictions.push({
            matchKey,
            homeTeam:   currentMatch.homeTeam,
            awayTeam:   currentMatch.awayTeam,
            prediction: resultFromScore(score.home, score.away),
            homeScore:  score.home,
            awayScore:  score.away,
            raw:        line
          });
          currentMatch = null;
        }
      }
    }

    if (predictions.length === 0) {
      warnings.push("⚠️ No se encontraron predicciones. Verifica el formato del mensaje.");
    }

    return { name, golnerId, phone, predictions, warnings };
  }

  // ── BUILD PREVIEW HTML ────────────────────────────────────────

  function buildPreviewHTML(parsed) {
    const { name, golnerId, predictions, warnings } = parsed;

    const predLabel = p => {
      if (!p.prediction) return `<span style="color:#ff4444">Sin detectar</span>`;
      if (p.prediction === "draw") return `<span style="color:#ffaa00">Empate</span>`;
      const winner = p.prediction === "home" ? p.homeTeam : p.awayTeam;
      return `<span style="color:#39FF14">Gana ${esc(winner)}</span>`;
    };

    const scoreLabel = p =>
      p.homeScore !== null && p.awayScore !== null
        ? `${p.homeScore} - ${p.awayScore}`
        : `<span style="color:#ff4444">Sin marcador</span>`;

    const warnHtml = warnings.length
      ? `<div style="margin-top:12px;font-size:12px;color:#ffaa00;line-height:1.7">
           ${warnings.map(w => `<div>${esc(w)}</div>`).join("")}
         </div>`
      : "";

    const matchesHtml = predictions.map(p => `
      <div class="preview-match">
        <div class="preview-match-teams">${esc(p.homeTeam)} vs ${esc(p.awayTeam)}</div>
        <div class="preview-match-prediction">${predLabel(p)}</div>
        <div class="preview-match-score">Marcador: ${scoreLabel(p)}</div>
      </div>
    `).join("");

    const idHtml = golnerId
      ? `<div class="preview-id"><i class="fa-solid fa-id-badge"></i> ${esc(golnerId)}</div>`
      : `<div class="preview-id" style="color:#ff4444"><i class="fa-solid fa-triangle-exclamation"></i> Sin ID Golner — no se podrá vincular entre semanas</div>`;

    return `
      <div class="preview-participant">
        <div class="preview-name"><i class="fa-solid fa-user"></i> ${esc(name)}</div>
        ${idHtml}
        ${matchesHtml || `<p style="color:rgba(255,255,255,0.4);font-size:13px">Sin partidos detectados</p>`}
        ${warnHtml}
      </div>
    `;
  }

  function buildMatchKey(home, away) {
    const norm = s => removeAccents(s.toLowerCase().trim());
    return norm(home) + "_vs_" + norm(away);
  }

  function esc(str) {
    return (str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  return { parse, buildPreviewHTML, buildMatchKey };

})();

if (typeof module !== "undefined") module.exports = GolnerParser;
window.GolnerParser = GolnerParser;
