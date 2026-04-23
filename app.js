/* ============================================================
   app.js — Dashboard de Monitoreo
   ============================================================ */

const API        = "https://script.google.com/macros/s/AKfycbzYkS6QUFYIQNHzLQLmKZ85ccfMYWXNPrvsw0dKX62k33c0IGVHD64ybDo2z8SSbzOWJA/exec";
const API2       = "https://script.google.com/macros/s/AKfycbzB61eR5m06XqG-dj_9nv_CQA-a3DdeFpYWHgUQgVZ_cLe0bkjFSsBvL1cvdwZPC5sVQA/exec";
const API3       = "https://script.google.com/macros/s/AKfycby0m17R1Dg5I3k5CwdCJ5EE0LRP3nf1Sls36wsySMNSU8vcr5TWe7O33WXRq-JbNb2KtQ/exec";
const REFRESH_MS = 30_000;

// Supervisores que tienen monitores asignados
const SUPERVISORES_CON_MONITOR = [
  "alejandra", "boris", "jonatan", "erick", "jose luis",
  "jose antonio", "andrea", "jazmin", "jazmín", "jimy", "jimmy",
  "marta", "sandor", "sandor hernandez", "linda aviles"
];

const ESTADOS_CONEXION = [
  { label: "Navegación estable",         key: "nav_estable", pill: "p-green",   statId: "sEstable" },
  { label: "Corte F.O externa",          key: "corte_fo",    pill: "p-red",     statId: "sCorte"   },
  { label: "Equipo apagado",             key: "eq_apagado",  pill: "p-yellow",  statId: "sApagado" },
  { label: "Intervenida",                key: "intervenida", pill: "p-purple",  statId: "sIntv"    },
  { label: "Latencia",                   key: "latencia",    pill: "p-orange",  statId: "sLat"     },
  { label: "Problema de ancho de banda", key: "ancho_banda", pill: "p-teal",    statId: "sAncho"   },
  { label: "Problema de navegación",     key: "prob_nav",    pill: "p-blue",    statId: "sPNav"    },
  { label: "Saturación",                 key: "saturacion",  pill: "p-slate",   statId: "sSat"     },
];

const ESTADO_MONITOREO = "monitoreo";
const ESTADO_PRIORIDAD = "prioridad";

const BLOQUES_FIJOS = [
  { key: "B1",      label: "B1"             },
  { key: "B2",      label: "B2"             },
  { key: "B3",      label: "B3"             },
  { key: "B4",      label: "B4"             },
  { key: "B5",      label: "B5"             },
  { key: "B6",      label: "B6"             },
  { key: "CONTROL", label: "Bloque Control" },
  { key: "",        label: "Sin Asignar"    },
];

function totalesVacios() {
  const t = { sinEstado: 0, total: 0 };
  ESTADOS_CONEXION.forEach(e => { t[e.key] = 0; });
  return t;
}

let _rowsCache = [];

// ─── PROCESAMIENTO ───────────────────────────────────────────

// Normaliza fechas con año "AA" → "2026" y convierte DD/MM/YYYY → YYYY-MM-DDT12:00:00
// Se añade T12:00:00 para evitar que UTC medianoche caiga en el día anterior en GMT-6
function normalizarFecha(f) {
  if (!f) return f;
  let s = String(f).replace(/\/AA$/i, "/2026").replace(/-AA$/i, "-2026");
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) s = m[3] + "-" + m[2].padStart(2,"0") + "-" + m[1].padStart(2,"0") + "T12:00:00";
  return s;
}

function procesarDatos(rows, rowsBase = []) {
  // Ignorar filas incompletas (sin CE ni Nombre de CE)
  const rowsValidas = rows.filter(r =>
    (r["CE"] || r[""]) && String(r["CE"] || r[""]).trim() !== "" &&
    r["Nombre de CE"] && String(r["Nombre de CE"]).trim() !== ""
  );

  const fechasTs = rowsValidas
    .map(r => normalizarFecha(r["Fecha"]))
    .filter(Boolean)
    .map(f => new Date(f).getTime())
    .filter(t => !isNaN(t));

  const ultimaTs  = fechasTs.length ? Math.max(...fechasTs) : null;
  const ultimaStr = ultimaTs
    ? new Date(ultimaTs).toISOString().slice(0, 10)
    : null;

  // Tabla de bloques → solo última fecha
  const rowsFecha = ultimaStr
    ? rowsValidas.filter(r => normalizarFecha(r["Fecha"]) &&
        new Date(normalizarFecha(r["Fecha"])).toISOString().slice(0, 10) === ultimaStr)
    : rowsValidas;

  const fechaDatos = ultimaTs
    ? new Date(ultimaTs).toLocaleDateString("es-SV", {
        weekday: "long", day: "2-digit", month: "long", year: "numeric"
      })
    : "Hoy";

  const bloquesMap = {};
  BLOQUES_FIJOS.forEach(b => {
    bloquesMap[b.key] = { key: b.key, label: b.label, totales: totalesVacios() };
  });

  let total = 0, enMonitoreo = 0, prioridad = 0;
  const globales = {};
  ESTADOS_CONEXION.forEach(e => { globales[e.key] = 0; });

  rowsFecha.forEach(row => {
    const estadoCE  = (row["Estado C.E"]      || "").trim().toLowerCase();
    const estadoCnx = (row["Estado conexión"] || "").trim();

    const bloqueRaw   = (row["Bloque"] || "").trim();
    const bloqueFixed = BLOQUES_FIJOS.find(
      b => b.key.toLowerCase() === bloqueRaw.toLowerCase()
    ) || BLOQUES_FIJOS.find(b => b.key === "");

    total++;
    if (estadoCE === ESTADO_MONITOREO) enMonitoreo++;
    if (estadoCE === ESTADO_PRIORIDAD) prioridad++;

    const match = ESTADOS_CONEXION.find(
      e => e.label.toLowerCase() === estadoCnx.toLowerCase()
    );
    if (match) globales[match.key]++;

    const bt = bloquesMap[bloqueFixed.key].totales;
    bt.total++;
    if (match) { bt[match.key]++; }
    else        { bt.sinEstado++;  }
  });

  const bloques = BLOQUES_FIJOS.map(b => ({
    nombre:  b.label,
    totales: bloquesMap[b.key].totales,
  }));

  // Histórico completo para las cards superiores
  const globalesHist = {};
  ESTADOS_CONEXION.forEach(e => { globalesHist[e.key] = 0; });
  let totalHist = 0;
  rowsValidas.forEach(row => {
    const estadoCnx = (row["Estado conexión"] || "").trim();
    const match = ESTADOS_CONEXION.find(e => e.label.toLowerCase() === estadoCnx.toLowerCase());
    totalHist++;
    if (match) globalesHist[match.key]++;
  });

  // ── Totales desde Base General ───────────────────────────────
  const totalBase = rowsBase.filter(r =>
    r["CÓD CE"] && String(r["CÓD CE"]).trim() !== ""
  ).length;

  const monBase = rowsBase.filter(r =>
    (r["Prioridad"] || "").trim().toLowerCase() === "monitoreo"
  ).length;

  const priBase = rowsBase.filter(r =>
    (r["Prioridad"] || "").trim().toLowerCase() === "prioridad"
  ).length;

  const despegaBase = rowsBase.filter(r =>
    String(r["DESPEGA"] || r["Despega"] || r["despega"] || "").trim().toLowerCase() === "despega"
  ).length;

  return { total, enMonitoreo, prioridad, globales, bloques, fechaDatos,
           totalHist, globalesHist, rawRows: rowsValidas,
           totalBase, monBase, priBase, despegaBase, ultimaStr };
}

// ─── FETCH ────────────────────────────────────────────────────

let _totalGeneral   = 0;
let _totalMonitor   = 0;
let _monitoreoCount = 0;
let _prioridadCount = 0;
let _reformaCount   = 0;  // CE Reforma Educativa
let _noReformaCount = 0;  // CE No Reforma Educativa
let _despegaCount   = 0;  // CE Despega (finalizadas)
let _despegaTotal   = 0;  // CE Despega (total)

async function fetchAPI2() {
  try {
    const url = `${API2}?t=${Date.now()}&r=${Math.random()}`;
    const res  = await fetch(url);
    if (!res.ok) return;
    const json = await res.json();

    // Estructura confirmada: { base_general: [...] }
    const rows = Array.isArray(json)                  ? json
               : Array.isArray(json.base_general)     ? json.base_general
               : Array.isArray(json.data)             ? json.data
               : [];

    if (!rows.length) return;

    // Total general = todos los CEs con "CÓD CE" válido
    const rowsValidas = rows.filter(r => String(r["CÓD CE"] || "").trim() !== "");
    _totalGeneral = rowsValidas.length;

    const MONITORES = [
      "alejandra", "boris", "jonatan", "erick",
      "jose luis", "jose cruz", "jose antonio", "andrea",
      "jazmin", "jimy", "marta", "sandor", "sandor hernandez", "linda aviles"
    ];

    // ── DEBUG: valores únicos en columna Monitoreo ──
    const valoresUnicos = [...new Set(
      rowsValidas.map(r => String(r["Monitoreo"] || "").trim()).filter(Boolean)
    )].sort();
    console.log("📋 Valores únicos en columna Monitoreo:", valoresUnicos);

    const tieneMonitor = (r) => {
      const val = String(r["Monitoreo"] || "").trim().toLowerCase();
      if (!val) return false;
      return MONITORES.some(m => val === m || val.startsWith(m + " ") || val.endsWith(" " + m) || val.includes(m));
    };

    _totalMonitor = rowsValidas.filter(tieneMonitor).length;
    console.log(`✅ Con monitor: ${_totalMonitor} | Sin match: ${rowsValidas.filter(r => !tieneMonitor(r)).length}`);

    // Solo CEs con monitor asignado
    const conMonitor = rowsValidas.filter(tieneMonitor);

    // Reforma Educativa = con monitor + Bloque B1-B6
    const BLOQUES_REFORMA = ["b1","b2","b3","b4","b5","b6"];
    _reformaCount = conMonitor.filter(r => {
      const bloque = String(r["BLOQUE"] || r["Bloque"] || "").trim().toLowerCase();
      return BLOQUES_REFORMA.includes(bloque);
    }).length;

    // No Reforma Educativa = con monitor + Bloque CONTROL o vacío
    _noReformaCount = conMonitor.filter(r => {
      const bloque = String(r["BLOQUE"] || r["Bloque"] || "").trim().toLowerCase();
      return bloque === "control" || bloque === "";
    }).length;

    console.log(`API2 → Total: ${_totalGeneral} | Monitor: ${_totalMonitor} | Reforma: ${_reformaCount} | No Reforma: ${_noReformaCount}`);

    actualizarKPITotal();
  } catch (e) {
    console.warn("API2 error:", e.message);
  }
}

function actualizarKPITotal() {
  // ── KPI 4: CE Despega (Finalizadas / Total) — siempre actualizar ──
  const elDes = document.getElementById("gDes");
  if (elDes) {
    const finStr = _despegaCount.toLocaleString("es-SV");
    const totStr = _despegaTotal.toLocaleString("es-SV");
    elDes.innerHTML = _despegaTotal > 0
      ? `${finStr}<span class="kpi-total-sep"> / </span><span class="kpi-total-general">${totStr}</span>`
      : finStr;
  }
  const pctDes = _despegaTotal > 0 ? Math.round(_despegaCount / _despegaTotal * 100) : 0;
  const elDesPct = document.getElementById("gDesPct");
  if (elDesPct) elDesPct.textContent = _despegaTotal > 0 ? `${pctDes}%` : "—";
  setTimeout(() => setBarWidth("bDes", pctDes), 200);

  // Los KPIs 1-3 dependen de API2
  if (_totalGeneral === 0) return;

  // ── KPI 1: Con Monitor / Total CEs ──
  const elTotal = document.getElementById("gTotal");
  if (elTotal) {
    const monStr   = _totalMonitor.toLocaleString("es-SV");
    const totalStr = _totalGeneral.toLocaleString("es-SV");
    elTotal.innerHTML = monStr;
  }
  const sub1 = document.getElementById("gTotalSub");
  if (sub1) sub1.textContent = `${Math.round(_totalMonitor / _totalGeneral * 100)}% del universo`;
  setTimeout(() => setBarWidth("bTot", Math.round(_totalMonitor / _totalGeneral * 100)), 200);

  // ── KPI 2: CE Reforma Educativa ──
  const elRef = document.getElementById("gRef");
  if (elRef) animateNumber("gRef", _reformaCount);
  const pctRef = _totalGeneral ? Math.round(_reformaCount / _totalGeneral * 100) : 0;
  const elRefPct = document.getElementById("gRefPct");
  if (elRefPct) elRefPct.textContent = _reformaCount > 0 ? `${pctRef}%` : "—";
  setTimeout(() => setBarWidth("bRef", pctRef), 200);

  // ── KPI 3: CE No Reforma Educativa ──
  const elNoRef = document.getElementById("gNoRef");
  if (elNoRef) animateNumber("gNoRef", _noReformaCount);
  const pctNoRef = _totalGeneral ? Math.round(_noReformaCount / _totalGeneral * 100) : 0;
  const elNoRefPct = document.getElementById("gNoRefPct");
  if (elNoRefPct) elNoRefPct.textContent = _noReformaCount > 0 ? `${pctNoRef}%` : "—";
  setTimeout(() => setBarWidth("bNoRef", pctNoRef), 200);

}

async function fetchData() {
  try {
    const url      = `${API}?t=${Date.now()}&r=${Math.random()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("HTTP " + response.status);

    const json = await response.json();
    if (json.error) throw new Error(json.error);

    // Nuevo formato: { monitoreo: [...], base: [...], sla: [...] }
    const rowsMon  = Array.isArray(json.monitoreo) ? json.monitoreo : [];
    const rowsBase = Array.isArray(json.base)      ? json.base      : [];
    const rowsSLA     = Array.isArray(json.sla)     ? json.sla     : [];
    const rowsDespega = Array.isArray(json.despega1) ? json.despega1 : [];
    

    if (!rowsMon.length && !rowsBase.length) throw new Error("La API no devolvió datos");

    const datos = procesarDatos(rowsMon, rowsBase);
    datos.rowsSLA     = rowsSLA;
    datos.rowsDespega = rowsDespega;
    render(datos);
    document.getElementById("errb").style.display = "none";

    // Cargar API2 en paralelo para el KPI de Total Escuelas
    fetchAPI2();
    fetchCFO();

  } catch (err) {
    const errEl = document.getElementById("errb");
    errEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Error al cargar datos: ' + err.message;
    errEl.style.display = "flex";

  } finally {
    hideLoader();
  }
}

function hideLoader() {
  const loader = document.getElementById("ldr");
  if (!loader) return;
  loader.classList.add("gone");
  setTimeout(() => loader.remove(), 600);
}

// ─── RENDER PRINCIPAL ─────────────────────────────────────────

function render(d) {
  document.getElementById("upd").textContent =
    new Date().toLocaleTimeString("es-SV");

  // Fecha de la última jornada (para el badge y la sección)
  const fechaEl    = document.getElementById("fbadge");
  const secFechaEl = document.getElementById("secFecha");
  if (fechaEl)    fechaEl.textContent    = d.fechaDatos;
  if (secFechaEl) secFechaEl.textContent = d.fechaDatos;

  // Badge de bloques
  const gBloquesEl = document.getElementById("gBloques");
  if (gBloquesEl) gBloquesEl.textContent = `${d.bloques.length} bloques`;

  // KPIs grandes (histórico completo)
  // KPI Despega: finalizadas / total desde hoja Despega1
  const _rd = d.rowsDespega || [];
  _despegaTotal = _rd.length;
  _despegaCount = _rd.filter(r =>
    (r["Instalación"] || "").trim().toUpperCase() === "FINALIZADA"
  ).length;
  renderKPIs(d);
  actualizarKPITotal();

  // 9 cards superiores del panel (histórico completo)
  renderStatCards(d);

  // Tabla de bloques (solo última fecha)
  renderTabla(d.bloques);

  // Panel Registros (histórico completo con filtros)
  _rowsCache = d.rawRows || [];
  poblarSelectores(_rowsCache);
  renderRegistros(_rowsCache);

  // Panel Despega
  renderDespega(_rowsCache, d.fechaDatos, d.ultimaStr);

  // Panel SLA
  renderSLA(d.rowsSLA || []);

  // Panel Despega2
  renderDespega2(d.rowsDespega || []);
}

// ─── KPIs GLOBALES — solo API2 los actualiza ─────────────────

function renderKPIs(d) {
  // Los 3 KPI de arriba son 100% de API2.
  // API1 solo alimenta stat cards y tabla de bloques.
  // No tocamos gTotal, gMon, gPri aquí.
  // actualizarKPITotal() se llama desde fetchAPI2() cuando llegan los datos.
}


// ─── STAT CARDS (8 estados + total) ──────────────────────────

function renderStatCards(d) {
  // Total histórico (todas las fechas acumuladas)
  animateNumber("sTotal", d.totalHist);

  // 8 estados históricos
  ESTADOS_CONEXION.forEach(e => {
    animateNumber(e.statId, d.globalesHist[e.key] || 0);
  });
}

// ─── TABLA DE BLOQUES ─────────────────────────────────────────

function renderTabla(bloques) {
  const tbody = document.getElementById("bloquesBody");

  if (!bloques.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" style="color:var(--txt-3);text-align:center;padding:20px">
          Sin datos disponibles.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = bloques.map(buildBloqueRow).join("") + buildTotalRow(bloques);
}

function buildBloqueRow(bloque) {
  const t = bloque.totales;
  const celdas = ESTADOS_CONEXION.map(e => {
    const v = t[e.key] || 0;
    return `<td>${v > 0 ? `<span class="pill ${e.pill}">${v}</span>` : `<span class="p0">—</span>`}</td>`;
  }).join("");
  const sin = t.sinEstado || 0;
  return `
    <tr>
      <td>
        <span class="bloque-name">
          <i class="fa-solid fa-layer-group"></i>
          ${bloque.nombre}
          <span class="bloque-chip">${t.total}</span>
        </span>
      </td>
      ${celdas}
      <td>${sin > 0 ? `<span class="pill p-muted">${sin}</span>` : `<span class="p0">—</span>`}</td>
      <td><span class="pill p-total">${t.total}</span></td>
    </tr>`;
}

function buildTotalRow(bloques) {
  const totGen = { sinEstado: 0, total: 0 };
  ESTADOS_CONEXION.forEach(e => { totGen[e.key] = 0; });
  bloques.forEach(b => {
    const t = b.totales;
    totGen.sinEstado += t.sinEstado || 0;
    totGen.total     += t.total     || 0;
    ESTADOS_CONEXION.forEach(e => { totGen[e.key] += t[e.key] || 0; });
  });
  const celdasGen = ESTADOS_CONEXION.map(e => {
    const v = totGen[e.key];
    return `<td>${v > 0 ? `<span class="pill ${e.pill}">${v}</span>` : `<span class="p0">—</span>`}</td>`;
  }).join("");
  return `
    <tr class="tr-total">
      <td>
        <span class="bloque-name">
          <i class="fa-solid fa-sigma"></i>
          TOTAL GENERAL
        </span>
      </td>
      ${celdasGen}
      <td>${totGen.sinEstado > 0 ? `<span class="pill p-muted">${totGen.sinEstado}</span>` : `<span class="p0">—</span>`}</td>
      <td><span class="pill p-total">${totGen.total}</span></td>
    </tr>`;
}

// ─── PANEL DESPEGA ────────────────────────────────────────────

function renderDespega(rawRows, fechaDatos, ultimaStr) {
  // Filtrar por "Estado" = "Despega" y última fecha
  const rows = ultimaStr
    ? rawRows.filter(r => {
        const esDespega = (r["Estado"] || "").trim().toLowerCase() === "despega";
        const fechaRow  = r["Fecha"] ? new Date(normalizarFecha(r["Fecha"])).toISOString().slice(0, 10) : "";
        return esDespega && fechaRow === ultimaStr;
      })
    : rawRows.filter(r => (r["Estado"] || "").trim().toLowerCase() === "despega");

  // Fecha mostrada — igual que panel de estadísticas
  const fechaEl = document.getElementById("dSecFecha");
  if (fechaEl) fechaEl.textContent = fechaDatos || "—";

  // ── Stat cards — el estado real está en "Bloque" ──
  const globales = {};
  ESTADOS_CONEXION.forEach(e => { globales[e.key] = 0; });

  rows.forEach(row => {
    const estadoCnx = (row["Estado conexión"] || "").trim();
    const match = ESTADOS_CONEXION.find(
      e => e.label.toLowerCase() === estadoCnx.toLowerCase()
    );
    if (match) globales[match.key]++;
  });

  animateNumber("dTotal",   rows.length);
  animateNumber("dEstable", globales.nav_estable);
  animateNumber("dCorte",   globales.corte_fo);
  animateNumber("dApagado", globales.eq_apagado);
  animateNumber("dIntv",    globales.intervenida);
  animateNumber("dLat",     globales.latencia);
  animateNumber("dAncho",   globales.ancho_banda);
  animateNumber("dPNav",    globales.prob_nav);
  animateNumber("dSat",     globales.saturacion);

  // ── Tabla ──
  const tbody = document.getElementById("dBloquesBody");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="color:var(--txt-3);text-align:center;padding:32px">Sin registros Despega para esta fecha</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(row => {
    const estadoCnx = (row["Estado conexión"] || "").trim();
    const cnxMatch  = ESTADOS_CONEXION.find(
      e => e.label.toLowerCase() === estadoCnx.toLowerCase()
    );
    const cnxPill = cnxMatch
      ? `<span class="pill ${cnxMatch.pill}">${estadoCnx}</span>`
      : estadoCnx
        ? `<span class="pill p-muted">${estadoCnx}</span>`
        : `<span class="p0">—</span>`;

    return `
      <tr>
        <td style="text-align:center;font-family:'DM Mono',monospace;font-weight:700;color:var(--blue)">
          ${row["CE"] || row[""] || "—"}
        </td>
        <td style="font-weight:600;text-align:left">${row["Nombre de CE"] || "—"}</td>
        <td>${row["Departamento"] || "—"}</td>
        <td style="text-align:center">${cnxPill}</td>
        <td style="text-align:center"><span class="pill p-purple">Despega</span></td>
      </tr>`;
  }).join("");
}

// ─── PANEL SLA ────────────────────────────────────────────────

// Convierte duración textual a minutos: "2 h" → 120, "15 min" → 15, "1 día" → 480
function duracionAMinutos(str) {
  if (!str) return null;
  const s = str.trim().toLowerCase();
  const num = parseFloat(s);
  if (isNaN(num)) return null;
  if (s.includes("día") || s.includes("dia") || s.includes("d ")) return num * 480; // 8h laborales
  if (s.includes("h"))   return num * 60;
  if (s.includes("min")) return num;
  return null;
}

// Formatea minutos a texto legible: 90 → "1.5 h", 30 → "30 min"
function minutosATexto(min) {
  if (min === null || isNaN(min)) return "—";
  if (min >= 60) return `${(min / 60).toFixed(1)} h`;
  return `${Math.round(min)} min`;
}

// Filtro rápido activo
let _slaFiltroActivo = 'todo';

function slaFiltroRapido(filtro, btn) {
  _slaFiltroActivo = filtro;

  // Resaltar botón activo
  document.querySelectorAll('.sla-frBtn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');

  // Filtrar desde cache
  const ahora   = new Date();
  const hoyStr  = ahora.toISOString().slice(0, 10);

  let rows = _rowsSLACache;

  if (filtro === 'hoy') {
    rows = rows.filter(r => {
      const f = r["Fecha 1"] ? new Date(r["Fecha 1"]).toISOString().slice(0, 10) : "";
      return f === hoyStr;
    });
  } else if (filtro === '3d') {
    const desde = new Date(ahora); desde.setDate(ahora.getDate() - 2);
    rows = rows.filter(r => {
      if (!r["Fecha 1"]) return false;
      const f = new Date(r["Fecha 1"]);
      return f >= desde && f <= ahora;
    });
  } else if (filtro === '5d') {
    const desde = new Date(ahora); desde.setDate(ahora.getDate() - 4);
    rows = rows.filter(r => {
      if (!r["Fecha 1"]) return false;
      const f = new Date(r["Fecha 1"]);
      return f >= desde && f <= ahora;
    });
  }

  // Actualizar label de fecha con rango real
  const lbl = document.getElementById("slaFechaLabel");
  if (lbl) {
    const fmt = d => d.toLocaleDateString("es-SV", { day:"2-digit", month:"long", year:"numeric" });
    if (filtro === 'hoy') {
      lbl.innerHTML = `<i class="fa-regular fa-calendar"></i> ${fmt(ahora)}`;
    } else {
      // Calcular min y max de Fecha 1 en el subset filtrado
      const fechas = rows
        .map(r => r["Fecha 1"] ? new Date(r["Fecha 1"]) : null)
        .filter(f => f && !isNaN(f));
      if (fechas.length) {
        const minF = new Date(Math.min(...fechas));
        const maxF = new Date(Math.max(...fechas));
        const mismo = minF.toISOString().slice(0,10) === maxF.toISOString().slice(0,10);
        lbl.innerHTML = mismo
          ? `<i class="fa-regular fa-calendar"></i> ${fmt(minF)}`
          : `<i class="fa-regular fa-calendar"></i> ${fmt(minF)} &nbsp;→&nbsp; ${fmt(maxF)}`;
      } else {
        lbl.innerHTML = `<i class="fa-regular fa-calendar"></i> Sin fechas disponibles`;
      }
    }
  }

  // Re-renderizar todo el SLA con el subconjunto
  renderSLADatos(rows);
}

function renderSLA(rows) {
  _rowsSLACache = rows;

  // Disparar el label de fecha en el filtro activo
  const btnActivo = document.querySelector('.sla-frBtn.on');
  if (btnActivo) slaFiltroRapido(_slaFiltroActivo, btnActivo);

  // Respetar el filtro activo cuando los datos se refrescan automáticamente
  const ahora = new Date();
  let subset  = rows;

  if (_slaFiltroActivo === 'hoy') {
    const hoyStr = ahora.toISOString().slice(0, 10);
    subset = rows.filter(r => {
      const f = r["Fecha 1"] ? new Date(r["Fecha 1"]).toISOString().slice(0, 10) : "";
      return f === hoyStr;
    });
  } else if (_slaFiltroActivo === '3d') {
    const desde = new Date(ahora); desde.setDate(ahora.getDate() - 2);
    subset = rows.filter(r => {
      if (!r["Fecha 1"]) return false;
      return new Date(r["Fecha 1"]) >= desde;
    });
  } else if (_slaFiltroActivo === '5d') {
    const desde = new Date(ahora); desde.setDate(ahora.getDate() - 4);
    subset = rows.filter(r => {
      if (!r["Fecha 1"]) return false;
      return new Date(r["Fecha 1"]) >= desde;
    });
  }

  renderSLADatos(subset);
}

function renderSLADatos(rows) {
  if (!rows.length) {
    document.getElementById("slaTotalInc").textContent  = "—";
    document.getElementById("slaInternas").textContent  = "—";
    document.getElementById("slaExternas").textContent  = "—";
    document.getElementById("slaCerradas").textContent  = "—";
    document.getElementById("slaAbiertas").textContent  = "—";
    document.getElementById("slaPromGrid").innerHTML    = '<div style="color:var(--txt-3);text-align:center;padding:32px;grid-column:1/-1">Sin datos SLA disponibles</div>';
    return;
  }

  // ── Solo filas con monitor asignado ──
  rows = rows.filter(r => String(r["Monitor"] || "").trim() !== "");

  // ── KPIs ──
  const total    = rows.length;
  const cerradas = rows.filter(r => (r["Estado"] || "").trim().toLowerCase() === "cerrado").length;
  const abiertas = rows.filter(r => (r["Estado"] || "").trim().toLowerCase() === "abierto").length;
  const revision = rows.filter(r => (r["Estado"] || "").trim().toLowerCase() === "revisión" || (r["Estado"] || "").trim().toLowerCase() === "revision").length;

  // Internas vs Externas — columna "Incidencias": "Incidencia Interna" / "Incidencia Externa"
  const externas = rows.filter(r => (r["Incidencias"] || "").trim().toLowerCase() === "incidencia externa").length;
  const internas = rows.filter(r => (r["Incidencias"] || "").trim().toLowerCase() === "incidencia interna").length;

  animateNumber("slaTotalInc", total);
  animateNumber("slaInternas", internas);
  animateNumber("slaExternas", externas);
  animateNumber("slaCerradas", cerradas);
  animateNumber("slaAbiertas", abiertas + revision);

  // ── Promedio por tipo de problema ──
  const tiposMap = {};
  rows.forEach(r => {
    const tipo = (r["Motivo de solución"] || "").trim();
    if (!tipo) return;
    const mins = duracionAMinutos(r["Duración"] || "");
    const esExterna = (r["Incidencias"] || "").trim().toLowerCase() === "incidencia externa";
    if (!tiposMap[tipo]) tiposMap[tipo] = { total: 0, count: 0, conDuracion: 0, externas: 0 };
    tiposMap[tipo].total++;
    if (esExterna) tiposMap[tipo].externas++;
    if (mins !== null) {
      tiposMap[tipo].count     += mins;
      tiposMap[tipo].conDuracion++;
    }
  });

  // Ordenar por frecuencia
  const tiposSorted = Object.entries(tiposMap)
    .sort((a, b) => b[1].total - a[1].total);

  // Color por tipo: interna = azul/teal, externa = naranja/rojo
  // Una incidencia es "externa" si la mayoría de sus registros dicen "Incidencia Externa"
  const COLOR_INTERNA = "var(--teal)";
  const COLOR_EXTERNA = "var(--orange)";

  const grid = document.getElementById("slaPromGrid");
  if (!grid) return;

  grid.innerHTML = tiposSorted.map(([tipo, data]) => {
    const promedio = data.conDuracion > 0
      ? minutosATexto(data.count / data.conDuracion)
      : "—";
    const esExterna = data.externas > data.total / 2;
    const color     = esExterna ? COLOR_EXTERNA : COLOR_INTERNA;
    const tagLabel  = esExterna ? "Externa" : "Interna";
    const tagClass  = esExterna ? "sla-tag-ext" : "sla-tag-int";

    return `
      <div class="sla-tipo-card sla-card-${esExterna ? 'ext' : 'int'}">
        <div class="sla-tipo-header">
          <div class="sla-tipo-nombre">${tipo}</div>
          <span class="sla-tipo-tag ${tagClass}">${tagLabel}</span>
        </div>
        <div class="sla-tipo-prom" style="color:${color}">${promedio}</div>
        <div class="sla-tipo-casos">${data.conDuracion} casos con duración registrada</div>
      </div>`;
  }).join("");

  // ── Distribución por rangos de tiempo ──────────────────────
  function calcRangos(subset, prefix) {
    const mins = subset
      .map(r => duracionAMinutos(r["Duración"] || ""))
      .filter(m => m !== null);
    const tot = mins.length;
    const pct = n => tot > 0 ? Math.round(n / tot * 100) + "%" : "—";
    const vals = [
      mins.filter(m => m < 60).length,
      mins.filter(m => m >= 60  && m <= 480).length,
      mins.filter(m => m > 480  && m <= 720).length,
      mins.filter(m => m > 720  && m <= 1440).length,
      mins.filter(m => m > 1440).length,
    ];
    vals.forEach((val, i) => {
      const n = i + 1;
      animateNumber(prefix + "R" + n, val);
      const pctEl = document.getElementById(prefix + "R" + n + "Pct");
      if (pctEl) pctEl.textContent = pct(val);
    });
  }

  // General — todos los registros con duración
  calcRangos(rows, "sla");

  // Por tipo de incidencia
  const rowsInt = rows.filter(r => (r["Incidencias"] || "").trim().toLowerCase() === "incidencia interna");
  const rowsExt = rows.filter(r => (r["Incidencias"] || "").trim().toLowerCase() === "incidencia externa");

  calcRangos(rowsInt, "slaInt");
  calcRangos(rowsExt, "slaExt");
}



// ─── SLA DETALLE POR RANGO ───────────────────────────────────

function slaDetalle(grupo, rango) {
  const LABELS = ["", "Menos de 1 hora", "Hasta 8 horas", "Hasta 12 horas", "Hasta 24 horas", "Más de 24 horas"];
  const GRUPO_LABEL = { all: "General", int: "Internas", ext: "Externas" };

  // Filtrar por grupo
  let subset = _rowsSLACache;
  if (grupo === "int") subset = subset.filter(r => (r["Incidencias"] || "").trim().toLowerCase() === "incidencia interna");
  if (grupo === "ext") subset = subset.filter(r => (r["Incidencias"] || "").trim().toLowerCase() === "incidencia externa");

  // Filtrar por rango de minutos
  const filtros = [
    null,
    m => m !== null && m < 60,
    m => m !== null && m >= 60  && m <= 480,
    m => m !== null && m > 480  && m <= 720,
    m => m !== null && m > 720  && m <= 1440,
    m => m !== null && m > 1440,
  ];

  const filas = subset.filter(r => {
    const m = duracionAMinutos(r["Duración"] || "");
    return filtros[rango](m);
  });

  // Título
  const panel  = document.getElementById("slaDetallePanel");
  const titulo = document.getElementById("slaDetalleTitulo");
  titulo.innerHTML = `<i class="fa-solid fa-list"></i> ${GRUPO_LABEL[grupo]} — ${LABELS[rango]} <span class="sla-detalle-count">${filas.length} registro${filas.length !== 1 ? "s" : ""}</span>`;

  // Tabla
  const tbody = document.getElementById("slaDetalleBody");
  if (!filas.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--txt-3);padding:24px">Sin registros para este rango.</td></tr>`;
  } else {
    tbody.innerHTML = filas.map(r => {
      const fecha = r["Fecha 1"]
        ? new Date(r["Fecha 1"]).toLocaleDateString("es-SV", { day:"2-digit", month:"2-digit", year:"numeric" })
        : "—";
      const inc = (r["Incidencias"] || "—").trim();
      const incClass = inc.toLowerCase().includes("externa") ? "sla-tag-ext" : "sla-tag-int";
      return `<tr>
        <td>${fecha}</td>
        <td>${r["Monitor"]       || "—"}</td>
        <td style="font-family:'DM Mono',monospace;font-weight:700;color:var(--blue)">${r["COD"] || "—"}</td>
        <td><span class="sla-tipo-tag ${incClass}">${inc}</span></td>
        <td>${r["Motivo de solución"]          || "—"}</td>
        <td>${r["Tec  asignado"] || r["Tec asignado"] || "—"}</td>
        <td style="font-weight:700;color:var(--teal)">${r["Duración"]    || "—"}</td>
      </tr>`;
    }).join("");
  }

  // Mostrar con animación
  panel.style.display = "block";
  requestAnimationFrame(() => panel.classList.add("sla-detalle-visible"));
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function slaDetalleCerrar() {
  const panel = document.getElementById("slaDetallePanel");
  panel.classList.remove("sla-detalle-visible");
  setTimeout(() => { panel.style.display = "none"; }, 300);
}


function poblarSelectores(rows) {
  const deptos  = [...new Set(rows.map(r => r["Departamento"] || "").filter(Boolean))].sort();
  const bloques = [...new Set(rows.map(r => r["Bloque"]       || "").filter(Boolean))].sort();

  const fDepto  = document.getElementById("fDepto");
  const fBloque = document.getElementById("fBloque");

  if (fDepto && fDepto.options.length <= 1) {
    deptos.forEach(d => {
      const o = document.createElement("option");
      o.value = o.textContent = d;
      fDepto.appendChild(o);
    });
  }
  if (fBloque && fBloque.options.length <= 1) {
    bloques.forEach(b => {
      const o = document.createElement("option");
      o.value = o.textContent = b;
      fBloque.appendChild(o);
    });
  }
}

function renderRegistros(rows) {
  const buscar    = (document.getElementById("fBuscar")?.value    || "").toLowerCase();
  const depto     = (document.getElementById("fDepto")?.value     || "");
  const bloque    = (document.getElementById("fBloque")?.value    || "");
  const estadoCE  = (document.getElementById("fEstadoCE")?.value  || "");
  const estadoCnx = (document.getElementById("fEstadoCnx")?.value || "");

  const filtradas = rows.filter(row => {
    const nombre = (row["Nombre de CE"] || "").toLowerCase();
    const ce     = String(row["CE"] || row[""] || "").toLowerCase();
    const sup    = (row["Supervisor"]   || "").toLowerCase();

    if (buscar    && !nombre.includes(buscar) && !ce.includes(buscar) && !sup.includes(buscar)) return false;
    if (depto     && row["Departamento"]    !== depto)     return false;
    if (bloque    && row["Bloque"]          !== bloque)    return false;
    if (estadoCE  && row["Estado C.E"]      !== estadoCE)  return false;
    if (estadoCnx && row["Estado conexión"] !== estadoCnx) return false;
    return true;
  });

  const countEl = document.getElementById("fCount");
  if (countEl) countEl.textContent =
    `${filtradas.length} registro${filtradas.length !== 1 ? "s" : ""}`;

  const tbody = document.getElementById("registrosBody");
  if (!filtradas.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="color:var(--txt-3);text-align:center;padding:24px">
          Sin registros con esos filtros.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = filtradas.map(row => {
    const estadoCEval  = (row["Estado C.E"]     || "").trim();
    const estadoCnxVal = (row["Estado conexión"] || "").trim();
    const fechaVal     = row["Fecha"]
      ? new Date(row["Fecha"]).toLocaleDateString("es-SV",
          { day: "2-digit", month: "2-digit", year: "numeric" })
      : "—";

    const ceClass = estadoCEval.toLowerCase() === "prioridad" ? "pill-prioridad"
                  : estadoCEval.toLowerCase() === "monitoreo" ? "pill-monitoreo"
                  : "pill-otro";

    const cnxMatch = ESTADOS_CONEXION.find(
      e => e.label.toLowerCase() === estadoCnxVal.toLowerCase()
    );
    const cnxPill = cnxMatch
      ? `<span class="pill ${cnxMatch.pill}">${estadoCnxVal}</span>`
      : `<span class="pill-otro">${estadoCnxVal || "—"}</span>`;

    return `
      <tr>
        <td style="text-align:center;font-family:'DM Mono',monospace;font-weight:700;color:var(--blue)">
          ${row["CE"] || row[""] || "—"}
        </td>
        <td style="font-weight:600">${row["Nombre de CE"] || "—"}</td>
        <td>${row["Departamento"] || "—"}</td>
        <td>${row["Supervisor"]   || "—"}</td>
        <td><span class="${ceClass}">${estadoCEval || "—"}</span></td>
        <td style="color:var(--txt-3);font-size:.78rem">${fechaVal}</td>
        <td>${cnxPill}</td>
        <td style="font-family:'DM Mono',monospace;font-weight:700">${row["Bloque"] || "—"}</td>
      </tr>`;
  }).join("");
}

function initFiltros() {
  ["fBuscar", "fDepto", "fBloque", "fEstadoCE", "fEstadoCnx"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", () => renderRegistros(_rowsCache));
  });

  document.getElementById("btnLimpiar")?.addEventListener("click", () => {
    ["fBuscar", "fDepto", "fBloque", "fEstadoCE", "fEstadoCnx"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    renderRegistros(_rowsCache);
  });
}


// ─── PANEL DESPEGA2 (nueva hoja Despega) ─────────────────────

let _despega2Cache = [];
let _rowsSLACache  = [];
let _rowsCFOCache  = [];

function renderDespega2(rows) {
  _despega2Cache = rows;

  const total = rows.length;
  const fin   = rows.filter(r => (r["Instalación"] || "").trim().toUpperCase() === "FINALIZADA").length;
  const asig  = rows.filter(r => (r["Instalación"] || "").trim().toUpperCase() === "ASIGNADA").length;

  animateNumber("d2Total", total);
  animateNumber("d2Fin",   fin);
  animateNumber("d2Asig",  asig);

  const pct = total > 0 ? Math.round(fin / total * 100) : 0;
  const bar    = document.getElementById("d2BarFill");
  const pctLbl = document.getElementById("d2PctLabel");
  if (bar)    setTimeout(() => { bar.style.width = pct + "%"; }, 200);
  if (pctLbl) pctLbl.textContent = pct + "%";

  const bloques = [...new Set(rows.map(r => r["Bloque"] || "").filter(Boolean))].sort();
  const selBloque = document.getElementById("d2Bloque");
  if (selBloque && selBloque.options.length <= 1) {
    bloques.forEach(b => {
      const o = document.createElement("option");
      o.value = o.textContent = b;
      selBloque.appendChild(o);
    });
  }

  renderDespega2Tabla();
}

function renderDespega2Tabla() {
  const buscar = (document.getElementById("d2Buscar")?.value || "").toLowerCase();
  const estado = (document.getElementById("d2Estado")?.value || "").toUpperCase();
  const bloque = (document.getElementById("d2Bloque")?.value || "");

  const filtradas = _despega2Cache.filter(r => {
    const codigo = String(r["CODIGO"] || r["CÓDIGO"] || "").toLowerCase();
    const nombre = (r["Centro Educativo"] || "").toLowerCase();
    if (buscar && !codigo.includes(buscar) && !nombre.includes(buscar)) return false;
    if (estado && (r["Instalación"] || "").trim().toUpperCase() !== estado) return false;
    if (bloque && (r["Bloque"] || "").trim() !== bloque) return false;
    return true;
  });

  const countEl = document.getElementById("d2Count");
  if (countEl) countEl.textContent = filtradas.length + " registro" + (filtradas.length !== 1 ? "s" : "");

  const tbody = document.getElementById("d2Body");
  if (!tbody) return;

  if (!filtradas.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="color:var(--txt-3);text-align:center;padding:24px">Sin registros con esos filtros.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtradas.map(row => {
    const estadoVal = (row["Instalación"] || "").trim().toUpperCase();
    const pillClass = estadoVal === "FINALIZADA" ? "pill p-green"
                    : estadoVal === "ASIGNADA"   ? "pill p-yellow"
                    : "pill-otro";
    return `
      <tr>
        <td style="text-align:center;font-family:'DM Mono',monospace;font-weight:700;color:var(--blue)">
          ${row["CÓDIGO"] || row["CODIGO"] || "—"}
        </td>
        <td style="font-weight:600;text-align:left">${row["Centro Educativo"] || "—"}</td>
        <td style="text-align:center"><span class="${pillClass}">${estadoVal || "—"}</span></td>
      </tr>`;
  }).join("");
}

function initFiltrosDespega2() {
  ["d2Buscar", "d2Estado", "d2Bloque"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", renderDespega2Tabla);
  });
  document.getElementById("d2BtnLimpiar")?.addEventListener("click", () => {
    ["d2Buscar", "d2Estado", "d2Bloque"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    renderDespega2Tabla();
  });
}

// ─── RELOJ ────────────────────────────────────────────────────

function initClock() {
  const clkEl = document.getElementById("clk");
  const tick = () => {
    const n = new Date();
    clkEl.textContent = [n.getHours(), n.getMinutes(), n.getSeconds()]
      .map(v => String(v).padStart(2, "0")).join(":");
  };
  tick();
  setInterval(tick, 1000);
}

// ─── DARK / LIGHT MODE ────────────────────────────────────────

let isLight = false;

function toggleDark() {
  isLight = !isLight;
  document.body.classList.toggle("light", isLight);
  const btn = document.getElementById("btnDk");
  btn.innerHTML = isLight
    ? '<i class="fa-solid fa-moon"></i> Oscuro'
    : '<i class="fa-solid fa-sun"></i> Claro';
}

// ─── TABS ─────────────────────────────────────────────────────

function switchTab(name, clickedBtn) {
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("on"));
  document.querySelectorAll(".tab").forEach(b => b.classList.remove("on"));
  document.getElementById("panel-" + name).classList.add("on");
  clickedBtn.classList.add("on");
}

function initTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab, btn));
  });
}

// ─── UTILIDADES ───────────────────────────────────────────────

function animateNumber(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent.replace(/\D/g, "")) || 0;
  const t0 = performance.now();
  const step = now => {
    const p = Math.min((now - t0) / 700, 1);
    el.textContent = Math.round(start + (target - start) * (1 - Math.pow(1 - p, 3)))
      .toLocaleString("es-SV");
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function setBarWidth(id, pct) {
  const el = document.getElementById(id);
  if (el) el.style.width = pct + "%";
}

// ─── PANEL CFO ───────────────────────────────────────────────

async function fetchCFO() {
  try {
    const url = `${API3}?t=${Date.now()}&r=${Math.random()}`;
    const res  = await fetch(url);
    if (!res.ok) return;
    const json = await res.json();
    const rows = Array.isArray(json.cfo) ? json.cfo : [];
    if (!rows.length) return;
    renderCFO(rows);
  } catch (e) {
    console.warn("CFO API error:", e.message);
  }
}

function renderCFO(rows) {
  _rowsCFOCache = rows;

  // Solo filas con Ticket válido
  const conTicket = rows.filter(r => (r["Ticket"] || "").toString().trim() !== "");

  const total       = conTicket.length;

  const rowsMon  = conTicket.filter(r => (r["CLASIFICACIÓN"] || "").trim().toLowerCase() === "monitoreo");
  const rowsInst = conTicket.filter(r => (r["CLASIFICACIÓN"] || "").trim().toLowerCase() === "instalación" || (r["CLASIFICACIÓN"] || "").trim().toLowerCase() === "instalacion");

  const monitoreo   = rowsMon.length;
  const instalacion = rowsInst.length;
  const cerrados    = conTicket.filter(r => (r["Estado del ticket"] || "").trim().toLowerCase() === "cerrado").length;
  const abiertos    = conTicket.filter(r => (r["Estado del ticket"] || "").trim().toLowerCase() === "abierto").length;

  // ── Obtener columna enlace primero (fecha dinámica) ──
  const enlaceKey = rows.length
    ? Object.keys(rows[0]).find(k => k.trim().toUpperCase().startsWith("ESTADO DEL ENLACE"))
    : null;

  // Desglose Monitoreo
  // Cerrados Monitoreo: cerrado + enlace ON
  const monCerrados = rowsMon.filter(r => {
    const esCerrado = (r["Estado del ticket"] || "").trim().toLowerCase() === "cerrado";
    const enlaceOn  = enlaceKey ? (r[enlaceKey] || "").trim().toUpperCase() === "ON" : false;
    return esCerrado && enlaceOn;
  }).length;
  // Abiertos Monitoreo: abierto + enlace OFF
  const monAbiertos = rowsMon.filter(r => {
    const esAbierto = (r["Estado del ticket"] || "").trim().toLowerCase() === "abierto";
    const enlaceOff = enlaceKey ? (r[enlaceKey] || "").trim().toUpperCase() === "OFF" : false;
    return esAbierto && enlaceOff;
  }).length;

  // Desglose Instalación
  const instCerrados = rowsInst.filter(r => (r["Estado del ticket"] || "").trim().toLowerCase() === "cerrado").length;
  const instAbiertos = rowsInst.filter(r => (r["Estado del ticket"] || "").trim().toLowerCase() === "abierto").length;

  animateNumber("cfoTotal",       total);
  animateNumber("cfoMonitoreo",   monitoreo);
  animateNumber("cfoInstalacion", instalacion);
  animateNumber("cfoCerrados",    cerrados);
  animateNumber("cfoAbiertos",    abiertos);
  animateNumber("cfoMonCerrados", monCerrados);
  animateNumber("cfoMonAbiertos", monAbiertos);
  animateNumber("cfoInstCerrados",instCerrados);
  animateNumber("cfoInstAbiertos",instAbiertos);

  // ── Estado del enlace ──

  if (enlaceKey) {
    // Cerrados con enlace OFF (DOWN)
    const enlaceDown = conTicket.filter(r =>
      (r["Estado del ticket"] || "").trim().toLowerCase() === "cerrado" &&
      (r[enlaceKey] || "").trim().toUpperCase() === "OFF"
    ).length;

    // Abiertos con enlace ON (UP)
    const enlaceUp = conTicket.filter(r =>
      (r["Estado del ticket"] || "").trim().toLowerCase() === "abierto" &&
      (r[enlaceKey] || "").trim().toUpperCase() === "ON"
    ).length;

    // Total tickets con enlace DOWN (sin importar estado)
    const enlaceTotal = conTicket.filter(r =>
      (r[enlaceKey] || "").trim().toUpperCase() === "OFF"
    ).length;

    animateNumber("cfoEnlaceDown",  enlaceDown);
    animateNumber("cfoEnlaceUp",    enlaceUp);
    animateNumber("cfoEnlaceTotal", enlaceTotal);
  }

  // ── Métricas de tiempo ──
  // Promedio días tickets CERRADOS usando columna DIAS
  const diasCerrados = conTicket
    .filter(r => (r["Estado del ticket"] || "").trim().toLowerCase() === "cerrado")
    .map(r => parseFloat(r["DIAS"] || ""))
    .filter(n => !isNaN(n) && n >= 0);
  const promCerrados = diasCerrados.length
    ? Math.round(diasCerrados.reduce((a,b) => a+b, 0) / diasCerrados.length)
    : 0;

  // Promedio antigüedad tickets ABIERTOS usando columna DIAS
  const diasAbiertos = conTicket
    .filter(r => (r["Estado del ticket"] || "").trim().toLowerCase() === "abierto")
    .map(r => parseFloat(r["DIAS"] || ""))
    .filter(n => !isNaN(n) && n >= 0);
  const promAbiertos = diasAbiertos.length
    ? Math.round(diasAbiertos.reduce((a,b) => a+b, 0) / diasAbiertos.length)
    : 0;

  // Porcentaje tickets abiertos con más de 10 días
  const abiertosRows = conTicket.filter(r => (r["Estado del ticket"] || "").trim().toLowerCase() === "abierto");
  const mas10 = abiertosRows.filter(r => {
    const pct = (r["Tickets abiertos con mas de 10 dias"] || "").toString().trim();
    // Si el campo trae porcentaje directo usarlo, sino calcular por DIAS
    const dias = parseFloat(r["DIAS"] || "");
    return pct !== "" ? true : (!isNaN(dias) && dias > 10);
  }).length;
  const pct10 = abiertosRows.length > 0 ? Math.round(mas10 / abiertosRows.length * 100) : 0;

  // Intentar usar el campo directo del primer registro que lo tenga
  const pctDirecto = (() => {
    for (const r of conTicket) {
      const v = (r["Tickets abiertos con mas de 10 dias"] || "").toString().trim();
      if (v !== "") return parseInt(v);
    }
    return null;
  })();

  const pctFinal = pctDirecto !== null ? pctDirecto : pct10;

  document.getElementById("cfoPromCerrados").textContent  = promCerrados || "—";
  document.getElementById("cfoPromAbiertos").textContent  = promAbiertos || "—";
  document.getElementById("cfoPct10dias").textContent     = pctFinal > 0 ? pctFinal : "—";
  document.getElementById("cfoPct10diasDesc").textContent =
    pctFinal > 0
      ? `El ${pctFinal}% de los tickets abiertos tiene más de 10 días sin resolverse.`
      : "Tickets abiertos con más de 10 días sin resolverse";

  // ── Auto-rellenar fechas de creación con rango real de los datos ──
  const fechasCreacion = conTicket
    .map(r => r["Fecha de creación tk"] ? new Date(r["Fecha de creación tk"]) : null)
    .filter(f => f && !isNaN(f));

  if (fechasCreacion.length) {
    const minFecha = new Date(Math.min(...fechasCreacion));
    const maxFecha = new Date(Math.max(...fechasCreacion));
    const toISO = d => d.toISOString().slice(0,10);

    const desdeEl = document.getElementById("cfoFiltroCreacionDesde");
    const hastaEl = document.getElementById("cfoFiltroCreacionHasta");

    // Solo auto-rellenar si el usuario no ha puesto nada
    if (desdeEl && !desdeEl.value) desdeEl.value = toISO(minFecha);
    if (hastaEl && !hastaEl.value) hastaEl.value = toISO(maxFecha);

    // Mostrar badge con rango
    const badgeEl = document.getElementById("cfoRangoFechas");
    if (badgeEl) {
      const fmt = d => d.toLocaleDateString("es-SV", { day:"2-digit", month:"short", year:"numeric" });
      badgeEl.innerHTML = `<i class="fa-regular fa-calendar"></i> Datos desde <strong>${fmt(minFecha)}</strong> hasta <strong>${fmt(maxFecha)}</strong>`;
      badgeEl.style.display = "flex";
    }
  }

  // Tabla
  renderCFOTabla();
}

function renderCFOTabla() {
  const buscar         = (document.getElementById("cfoFiltroNombre")?.value || "").toLowerCase();
  const estado         = (document.getElementById("cfoFiltroEstado")?.value || "");
  const clasif         = (document.getElementById("cfoFiltroClasif")?.value || "");
  const creacionDesde  = document.getElementById("cfoFiltroCreacionDesde")?.value || "";
  const creacionHasta  = document.getElementById("cfoFiltroCreacionHasta")?.value || "";
  const cierreDesde    = document.getElementById("cfoFiltroCierreDesde")?.value || "";
  const cierreHasta    = document.getElementById("cfoFiltroCierreHasta")?.value || "";

  const parseFecha = v => v ? new Date(v + "T00:00:00") : null;
  const creDesde = parseFecha(creacionDesde);
  const creHasta = parseFecha(creacionHasta);
  const cerDesde = parseFecha(cierreDesde);
  const cerHasta = parseFecha(cierreHasta);

  const conTicket = _rowsCFOCache.filter(r => (r["Ticket"] || "").toString().trim() !== "");

  const filtradas = conTicket.filter(r => {
    const nombre = (r["NOMBRE CE"]  || "").toLowerCase();
    const cod    = (r["CÓD CE"]     || "").toLowerCase();
    if (buscar && !nombre.includes(buscar) && !cod.includes(buscar)) return false;
    if (estado && (r["Estado del ticket"] || "").trim().toLowerCase() !== estado.toLowerCase()) return false;
    if (clasif) {
      const c = (r["CLASIFICACIÓN"] || "").trim().toLowerCase();
      if (!c.includes(clasif.toLowerCase())) return false;
    }
    // Filtro fecha creación
    if (creDesde || creHasta) {
      const fc = r["Fecha de creación tk"] ? new Date(r["Fecha de creación tk"]) : null;
      if (!fc || isNaN(fc)) return false;
      if (creDesde && fc < creDesde) return false;
      if (creHasta) { const h = new Date(creHasta); h.setHours(23,59,59); if (fc > h) return false; }
    }
    // Filtro fecha cierre
    if (cerDesde || cerHasta) {
      const fci = r["Fecha de Finalización tk"] ? new Date(r["Fecha de Finalización tk"]) : null;
      if (!fci || isNaN(fci)) return false;
      if (cerDesde && fci < cerDesde) return false;
      if (cerHasta) { const h = new Date(cerHasta); h.setHours(23,59,59); if (fci > h) return false; }
    }
    return true;
  });

  const countEl = document.getElementById("cfoCount");
  if (countEl) countEl.textContent = `${filtradas.length} registro${filtradas.length !== 1 ? "s" : ""}`;

  const tbody = document.getElementById("cfoTablaBody");
  if (!tbody) return;

  if (!filtradas.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--txt-3);padding:24px">Sin registros con esos filtros.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtradas.map(r => {
    const estado   = (r["Estado del ticket"] || "").trim();
    const estadoClass = estado.toLowerCase() === "cerrado" ? "pill p-green"
                      : estado.toLowerCase() === "abierto" ? "pill p-red"
                      : "pill-otro";

    const clasif   = (r["CLASIFICACIÓN"] || "").trim();
    const clasifClass = clasif.toLowerCase() === "monitoreo"   ? "pill p-blue"
                      : clasif.toLowerCase().includes("instal") ? "pill p-purple"
                      : "pill-otro";

    const fCreacion = r["Fecha de creación tk"]
      ? (() => { try { return new Date(r["Fecha de creación tk"]).toLocaleDateString("es-SV",{day:"2-digit",month:"2-digit",year:"numeric"}); } catch(e){ return r["Fecha de creación tk"]; }})()
      : "—";
    const fCierre = r["Fecha de Finalización tk"]
      ? (() => { try { return new Date(r["Fecha de Finalización tk"]).toLocaleDateString("es-SV",{day:"2-digit",month:"2-digit",year:"numeric"}); } catch(e){ return r["Fecha de Finalización tk"]; }})()
      : "—";

    const dias = (r["DIAS"] || "").toString().trim();

    return `<tr>
      <td style="font-family:'DM Mono',monospace;font-weight:700;color:var(--blue)">${r["CÓD CE"] || "—"}</td>
      <td style="font-weight:600">${r["NOMBRE CE"] || "—"}</td>
      <td style="text-align:center">${r["BLOQUE"] || "—"}</td>
      <td><span class="${clasifClass}">${clasif || "—"}</span></td>
      <td style="font-family:'DM Mono',monospace;color:var(--teal)">${r["Ticket"] || "—"}</td>
      <td><span class="${estadoClass}">${estado || "—"}</span></td>
      <td style="color:var(--txt-3);font-size:.78rem">${fCreacion}</td>
      <td style="color:var(--txt-3);font-size:.78rem">${fCierre}</td>
      <td style="font-weight:600">${r["Duración"] || "—"}</td>
      <td style="text-align:center;font-weight:700;color:${parseInt(dias)>10?"var(--red)":"var(--txt)"}">${dias || "—"}</td>
    </tr>`;
  }).join("");
}

function cfoLimpiarFiltros() {
  ["cfoFiltroNombre","cfoFiltroEstado","cfoFiltroClasif",
   "cfoFiltroCreacionDesde","cfoFiltroCreacionHasta",
   "cfoFiltroCierreDesde","cfoFiltroCierreHasta"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  renderCFOTabla();
}

function initFiltroCFO() {
  ["cfoFiltroNombre","cfoFiltroEstado","cfoFiltroClasif",
   "cfoFiltroCreacionDesde","cfoFiltroCreacionHasta",
   "cfoFiltroCierreDesde","cfoFiltroCierreHasta"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", renderCFOTabla);
    document.getElementById(id)?.addEventListener("change", renderCFOTabla);
  });
}

// ─── INIT ─────────────────────────────────────────────────────

function init() {
  initClock();
  initTabs();
  initFiltros();
  initFiltrosDespega2();
  initFiltroCFO();
  document.getElementById("btnDk").addEventListener("click", toggleDark);
  document.getElementById("btnRef").addEventListener("click", fetchData);
  document.getElementById("btnRefDespega")?.addEventListener("click", fetchData);
  fetchData();
  setInterval(fetchData, REFRESH_MS);
}

document.addEventListener("DOMContentLoaded", init);