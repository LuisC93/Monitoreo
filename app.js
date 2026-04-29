/* ============================================================
   app.js — Dashboard de Monitoreo
   ============================================================ */

const API        = "https://script.google.com/macros/s/AKfycbzYkS6QUFYIQNHzLQLmKZ85ccfMYWXNPrvsw0dKX62k33c0IGVHD64ybDo2z8SSbzOWJA/exec";
const API2       = "https://script.google.com/macros/s/AKfycbzB61eR5m06XqG-dj_9nv_CQA-a3DdeFpYWHgUQgVZ_cLe0bkjFSsBvL1cvdwZPC5sVQA/exec";
const API3       = "https://script.google.com/macros/s/AKfycbwVwrRPrH2oqZfndxcopcngM-9F0mTR7Qp08gK83mo-rYpI35iOlDy2CXe4PrhG3MMzpw/exec";
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
];

// Saturación de Sesiones se cuenta como Problema de Navegación
const ESTADOS_REMAP = {
  "saturación":             "prob_nav",
  "saturacion":             "prob_nav",
  "saturación de sesiones": "prob_nav",
  "saturacion de sesiones": "prob_nav",
};

// Resuelve el key correcto considerando el remap
function _resolverEstadoKey(estadoLabel) {
  const norm = (estadoLabel || "").trim().toLowerCase();
  if (!norm) return null;
  // 1) ¿está remapeado?
  if (ESTADOS_REMAP[norm]) return ESTADOS_REMAP[norm];
  // 2) ¿coincide directo con algún estado?
  const m = ESTADOS_CONEXION.find(e => e.label.toLowerCase() === norm);
  return m ? m.key : null;
}

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

// Convierte DD/MM/YYYY → YYYY-MM-DDT12:00:00
// Se añade T12:00:00 para evitar que UTC medianoche caiga en el día anterior en GMT-6
function normalizarFecha(f) {
  if (!f) return f;
  let s = String(f);
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

    const matchKey = _resolverEstadoKey(estadoCnx);
    if (matchKey) globales[matchKey]++;

    const bt = bloquesMap[bloqueFixed.key].totales;
    bt.total++;
    if (matchKey) { bt[matchKey]++; }
    else          { bt.sinEstado++;  }
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
    const matchKey = _resolverEstadoKey(estadoCnx);
    totalHist++;
    if (matchKey) globalesHist[matchKey]++;
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
    fetchCFOGen();

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

  // 7 estados históricos
  ESTADOS_CONEXION.forEach(e => {
    animateNumber(e.statId, d.globalesHist[e.key] || 0);
  });

  // Ocultar cards cuyo valor sea 0 (incluye Total Centros)
  const sTotalCard = document.getElementById("sTotal")?.closest(".sc");
  if (sTotalCard) {
    sTotalCard.style.display = ((d.totalHist || 0) > 0) ? "" : "none";
  }
  ESTADOS_CONEXION.forEach(e => {
    const card = document.getElementById(e.statId)?.closest(".sc");
    if (card) {
      card.style.display = ((d.globalesHist[e.key] || 0) > 0) ? "" : "none";
    }
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

  // Ocultar columnas cuyo total general sea 0 (incluye sinEstado)
  const totales = { sinEstado: 0 };
  ESTADOS_CONEXION.forEach(e => { totales[e.key] = 0; });
  bloques.forEach(b => {
    totales.sinEstado += b.totales.sinEstado || 0;
    ESTADOS_CONEXION.forEach(e => {
      totales[e.key] += b.totales[e.key] || 0;
    });
  });

  const claves = [...ESTADOS_CONEXION.map(e => e.key), "sinEstado"];
  claves.forEach(key => {
    const ocultar = (totales[key] || 0) === 0;
    document.querySelectorAll(`[data-col="${key}"]`).forEach(el => {
      el.style.display = ocultar ? "none" : "";
    });
  });
}

function buildBloqueRow(bloque) {
  const t = bloque.totales;
  const celdas = ESTADOS_CONEXION.map(e => {
    const v = t[e.key] || 0;
    return `<td data-col="${e.key}">${v > 0 ? `<span class="pill ${e.pill}">${v}</span>` : `<span class="p0">—</span>`}</td>`;
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
      <td data-col="sinEstado">${sin > 0 ? `<span class="pill p-muted">${sin}</span>` : `<span class="p0">—</span>`}</td>
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
    return `<td data-col="${e.key}">${v > 0 ? `<span class="pill ${e.pill}">${v}</span>` : `<span class="p0">—</span>`}</td>`;
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
      <td data-col="sinEstado">${totGen.sinEstado > 0 ? `<span class="pill p-muted">${totGen.sinEstado}</span>` : `<span class="p0">—</span>`}</td>
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
    const matchKey = _resolverEstadoKey(estadoCnx);
    if (matchKey) globales[matchKey]++;
  });

  animateNumber("dTotal",   rows.length);
  animateNumber("dEstable", globales.nav_estable);
  animateNumber("dCorte",   globales.corte_fo);
  animateNumber("dApagado", globales.eq_apagado);
  animateNumber("dIntv",    globales.intervenida);
  animateNumber("dLat",     globales.latencia);
  animateNumber("dAncho",   globales.ancho_banda);
  animateNumber("dPNav",    globales.prob_nav);

  // Ocultar cards cuyo valor sea 0 (incluye Total Centros)
  const cardsDespega = [
    { id: "dTotal",   val: rows.length },
    { id: "dEstable", val: globales.nav_estable },
    { id: "dCorte",   val: globales.corte_fo    },
    { id: "dApagado", val: globales.eq_apagado  },
    { id: "dIntv",    val: globales.intervenida },
    { id: "dLat",     val: globales.latencia    },
    { id: "dAncho",   val: globales.ancho_banda },
    { id: "dPNav",    val: globales.prob_nav    },
  ];
  cardsDespega.forEach(c => {
    const card = document.getElementById(c.id)?.closest(".sc");
    if (card) card.style.display = ((c.val || 0) > 0) ? "" : "none";
  });

  // ── Tabla ──
  const tbody = document.getElementById("dBloquesBody");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="color:var(--txt-3);text-align:center;padding:32px">Sin registros Despega para esta fecha</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(row => {
    const estadoCnx = (row["Estado conexión"] || "").trim();
    const cnxKey    = _resolverEstadoKey(estadoCnx);
    const cnxMatch  = cnxKey ? ESTADOS_CONEXION.find(e => e.key === cnxKey) : null;
    const cnxPill = cnxMatch
      ? `<span class="pill ${cnxMatch.pill}">${cnxMatch.label}</span>`
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

// Filtros activos del panel SLA
// _slaFiltroActivo: 'todo' | 'hoy' | '5d' | 'rango'
let _slaFiltroActivo   = 'todo';
let _slaRangoDesde     = null; // string YYYY-MM-DD (solo si modo='rango')
let _slaRangoHasta     = null;
let _slaBloquesActivos = new Set(); // vacío = "Todo"

// Vista actual de los KPIs: 'totales' | 'promedio'
let _slaVistaActual = 'totales';
// Cache de los últimos cálculos para poder cambiar de vista sin recalcular
let _slaUltimaData = null;

// Cambiar entre tabs Totales / Promedio por día
function slaCambiarVista(vista) {
  _slaVistaActual = vista;
  document.querySelectorAll('.sla-vista-tab').forEach(b => {
    b.classList.toggle('on', b.dataset.vista === vista);
  });
  _slaPintarKPIs();
}

// Pinta los 7 KPIs (Total, Internas, Externas + 4 chips) según vista activa
function _slaPintarKPIs() {
  if (!_slaUltimaData) return;

  const data = _slaVistaActual === 'promedio'
    ? _slaUltimaData.promedio
    : _slaUltimaData.totales;

  animateNumber("slaTotalInc",   data.total);
  animateNumber("slaInternas",   data.internas);
  animateNumber("slaExternas",   data.externas);
  animateNumber("slaIntAbiertas", data.intAbiertas);
  animateNumber("slaIntCerradas", data.intCerradas);
  animateNumber("slaExtAbiertas", data.extAbiertas);
  animateNumber("slaExtCerradas", data.extCerradas);

  // Cambiar etiquetas de los chips según la vista (Abiertas vs Abiertas/día)
  const sufijo = _slaVistaActual === 'promedio' ? ' / día' : '';
  document.querySelectorAll('#panel-sla .cfo-des-item .cfo-des-lbl').forEach(el => {
    const base = el.dataset.base || el.textContent.replace(/\s*\/\s*día\s*$/, '');
    el.dataset.base = base;
    el.textContent = base + sufijo;
  });

  // Tooltip explicativo en cada card del modo promedio
  const isProm = _slaVistaActual === 'promedio';
  const setT = (sel, content) => {
    const el = document.querySelector(sel);
    if (el) el.title = content;
  };
  if (isProm) {
    const p = _slaUltimaData.promedio;
    const t = _slaUltimaData.totales;
    setT('#slaTotalInc',   `${t.total} ÷ ${p.diasTot} día${p.diasTot===1?'':'s'} = ${p.total}`);
    setT('#slaInternas',   `${t.internas} ÷ ${p.diasInt} día${p.diasInt===1?'':'s'} = ${p.internas}`);
    setT('#slaExternas',   `${t.externas} ÷ ${p.diasExt} día${p.diasExt===1?'':'s'} = ${p.externas}`);
  } else {
    setT('#slaTotalInc',   '');
    setT('#slaInternas',   '');
    setT('#slaExternas',   '');
  }
}

// Helper: convierte un Date a string YYYY-MM-DD en HORA LOCAL
function _fechaLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// Aplica filtros de fecha y bloque al cache y retorna subset
function _slaAplicarFiltros() {
  const ahora = new Date();
  const hoyStr = _fechaLocal(ahora);
  let rows = _rowsSLACache;

  // ── Filtro de fecha — comparación por DÍA COMPLETO en hora local ──
  if (_slaFiltroActivo === 'hoy') {
    rows = rows.filter(r => {
      if (!r["Fecha 1"]) return false;
      const f = new Date(r["Fecha 1"]);
      if (isNaN(f)) return false;
      return _fechaLocal(f) === hoyStr;
    });
  } else if (_slaFiltroActivo === '5d') {
    // Últimos 5 días incluyendo hoy
    const diasIncluidos = new Set();
    for (let i = 0; i < 5; i++) {
      const d = new Date(ahora);
      d.setDate(ahora.getDate() - i);
      diasIncluidos.add(_fechaLocal(d));
    }
    rows = rows.filter(r => {
      if (!r["Fecha 1"]) return false;
      const f = new Date(r["Fecha 1"]);
      if (isNaN(f)) return false;
      return diasIncluidos.has(_fechaLocal(f));
    });
  } else if (_slaFiltroActivo === 'rango' && _slaRangoDesde && _slaRangoHasta) {
    // Rango personalizado entre dos fechas (inclusive)
    const desde = _slaRangoDesde;
    const hasta = _slaRangoHasta;
    // Si están al revés, los intercambiamos para no confundirnos
    const [d0, d1] = desde <= hasta ? [desde, hasta] : [hasta, desde];
    rows = rows.filter(r => {
      if (!r["Fecha 1"]) return false;
      const f = new Date(r["Fecha 1"]);
      if (isNaN(f)) return false;
      const fStr = _fechaLocal(f);
      return fStr >= d0 && fStr <= d1;
    });
  }

  // ── Filtro de bloque (selección múltiple) ──
  if (_slaBloquesActivos.size > 0) {
    rows = rows.filter(r => {
      const b = String(r["Bloque"] || r["BLOQUE"] || "").trim().toUpperCase();
      return _slaBloquesActivos.has(b);
    });
  }

  return rows;
}

// Actualiza el label de fecha con el rango real del subset
function _slaActualizarFechaLabel(rows) {
  const lbl = document.getElementById("slaFechaLabel");
  if (!lbl) return;
  const ahora = new Date();
  const fmt = d => d.toLocaleDateString("es-SV", { day:"2-digit", month:"long", year:"numeric" });

  if (_slaFiltroActivo === 'hoy') {
    lbl.innerHTML = `<i class="fa-regular fa-calendar"></i> ${fmt(ahora)}`;
    return;
  }
  const fechas = rows
    .map(r => r["Fecha 1"] ? new Date(r["Fecha 1"]) : null)
    .filter(f => f && !isNaN(f));
  if (fechas.length) {
    const minF = new Date(Math.min(...fechas));
    const maxF = new Date(Math.max(...fechas));
    const mismo = _fechaLocal(minF) === _fechaLocal(maxF);
    lbl.innerHTML = mismo
      ? `<i class="fa-regular fa-calendar"></i> ${fmt(minF)}`
      : `<i class="fa-regular fa-calendar"></i> ${fmt(minF)} &nbsp;→&nbsp; ${fmt(maxF)}`;
  } else {
    lbl.innerHTML = `<i class="fa-regular fa-calendar"></i> Sin fechas disponibles`;
  }
}

// ─── DROPDOWN DE PERÍODO ─────────────────────────────────────────

// Actualiza el texto del botón principal según el filtro activo
function _slaActualizarPeriodoLabel() {
  const lbl = document.getElementById("slaPeriodoLabel");
  if (!lbl) return;
  const fmtCorto = s => {
    if (!s) return "";
    const [y, m, d] = s.split("-");
    const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    return `${parseInt(d)} ${meses[parseInt(m)-1]}`;
  };
  if (_slaFiltroActivo === 'todo') lbl.textContent = 'Todo';
  else if (_slaFiltroActivo === 'hoy') lbl.textContent = 'Hoy';
  else if (_slaFiltroActivo === '5d') lbl.textContent = 'Últimos 5 días';
  else if (_slaFiltroActivo === 'rango' && _slaRangoDesde && _slaRangoHasta) {
    const [a, b] = _slaRangoDesde <= _slaRangoHasta
      ? [_slaRangoDesde, _slaRangoHasta]
      : [_slaRangoHasta, _slaRangoDesde];
    lbl.textContent = a === b ? fmtCorto(a) : `${fmtCorto(a)} → ${fmtCorto(b)}`;
  }
}

// Sincroniza qué botón rápido se ve "on" en el panel
function _slaSincronizarQuickBtns() {
  document.querySelectorAll('.sla-periodo-quickBtn').forEach(b => {
    b.classList.toggle('on', b.dataset.periodo === _slaFiltroActivo);
  });
}

// Abre/cierra el panel del dropdown
function slaPeriodoToggle(e) {
  if (e) e.stopPropagation();
  const dd = document.getElementById("slaPeriodoDD");
  if (dd) dd.classList.toggle('open');
}

// Click en uno de los 3 botones rápidos del panel
function slaPeriodoRapido(periodo) {
  _slaFiltroActivo = periodo;
  _slaRangoDesde = null;
  _slaRangoHasta = null;
  // Limpiar inputs de rango
  const di = document.getElementById("slaFechaDesde");
  const hi = document.getElementById("slaFechaHasta");
  if (di) di.value = "";
  if (hi) hi.value = "";

  _slaSincronizarQuickBtns();
  _slaActualizarPeriodoLabel();

  // Cerrar dropdown y aplicar
  document.getElementById("slaPeriodoDD")?.classList.remove('open');

  const rows = _slaAplicarFiltros();
  _slaActualizarFechaLabel(rows);
  renderSLADatos(rows);
}

// Cambio en cualquiera de los dos inputs de fecha
function slaPeriodoRango() {
  const desde = document.getElementById("slaFechaDesde")?.value || "";
  const hasta = document.getElementById("slaFechaHasta")?.value || "";

  _slaRangoDesde = desde || null;
  _slaRangoHasta = hasta || null;

  // Si ambas fechas están llenas, activar modo rango
  if (desde && hasta) {
    _slaFiltroActivo = 'rango';
    _slaSincronizarQuickBtns();
    _slaActualizarPeriodoLabel();

    const rows = _slaAplicarFiltros();
    _slaActualizarFechaLabel(rows);
    renderSLADatos(rows);
  }
  // Si solo hay una, no hace nada todavía (esperamos la otra)
}

// Cerrar dropdown si se hace click afuera
document.addEventListener('click', (e) => {
  const dd = document.getElementById("slaPeriodoDD");
  if (!dd) return;
  if (dd.classList.contains('open') && !dd.contains(e.target)) {
    dd.classList.remove('open');
  }
});

function slaBloqueFiltro(bloque, btn) {
  const fila = btn.closest('.sla-filtro-rapido');
  const todosBtn = fila ? fila.querySelector('.sla-frBtn[data-bloque-todo]') : null;

  if (bloque === 'todo') {
    // "Todo" siempre limpia la selección
    _slaBloquesActivos.clear();
  } else {
    // Toggle: si ya está, lo quita; si no, lo agrega
    if (_slaBloquesActivos.has(bloque)) {
      _slaBloquesActivos.delete(bloque);
    } else {
      _slaBloquesActivos.add(bloque);
    }
  }

  // Sincronizar visualmente todos los botones de la fila
  if (fila) {
    fila.querySelectorAll('.sla-frBtn').forEach(b => {
      const key = b.dataset.bloque;
      if (b.hasAttribute('data-bloque-todo')) {
        // "Todo" se ilumina solo cuando no hay nada seleccionado
        b.classList.toggle('on', _slaBloquesActivos.size === 0);
      } else if (key) {
        b.classList.toggle('on', _slaBloquesActivos.has(key));
      }
    });
  }

  const rows = _slaAplicarFiltros();
  _slaActualizarFechaLabel(rows);
  renderSLADatos(rows);
}

function renderSLA(rows) {
  _rowsSLACache = rows;
  // Aplicar filtros activos (preserva fecha y bloque seleccionados)
  const subset = _slaAplicarFiltros();
  _slaActualizarFechaLabel(subset);
  renderSLADatos(subset);
}

function renderSLADatos(rows) {
  // Filtrar por monitor asignado ANTES del check de vacío
  // (si no hay filas con monitor, también es "sin datos")
  rows = rows.filter(r => String(r["Monitor"] || "").trim() !== "");

  if (!rows.length) {
    document.getElementById("slaTotalInc").textContent  = "—";
    document.getElementById("slaInternas").textContent  = "—";
    document.getElementById("slaExternas").textContent  = "—";
    document.getElementById("slaIntAbiertas").textContent = "—";
    document.getElementById("slaIntCerradas").textContent = "—";
    document.getElementById("slaExtAbiertas").textContent = "—";
    document.getElementById("slaExtCerradas").textContent = "—";
    document.getElementById("slaPromGrid").innerHTML    = '<div style="color:var(--txt-3);text-align:center;padding:32px;grid-column:1/-1">Sin datos SLA disponibles</div>';

    // Resetear cache (para que el cambio de tab no muestre datos viejos)
    _slaUltimaData = null;

    // Resetear las 15 cards de distribución (general + internas + externas)
    ["sla", "slaInt", "slaExt"].forEach(prefix => {
      for (let i = 1; i <= 5; i++) {
        const valEl = document.getElementById(prefix + "R" + i);
        const pctEl = document.getElementById(prefix + "R" + i + "Pct");
        if (valEl) valEl.textContent = "—";
        if (pctEl) pctEl.textContent = "—";
      }
    });
    return;
  }

  // ── KPIs ──
  const total    = rows.length;

  const esCerrado = r => (r["Estado"] || "").trim().toLowerCase() === "cerrado";
  const esAbierto = r => {
    const e = (r["Estado"] || "").trim().toLowerCase();
    return e === "abierto" || e === "revisión" || e === "revision";
  };
  const esInterna = r => (r["Incidencias"] || "").trim().toLowerCase() === "incidencia interna";
  const esExterna = r => (r["Incidencias"] || "").trim().toLowerCase() === "incidencia externa";

  const internas = rows.filter(esInterna).length;
  const externas = rows.filter(esExterna).length;

  // Cruces internas/externas × abiertas/cerradas
  const intAbiertas = rows.filter(r => esInterna(r) && esAbierto(r)).length;
  const intCerradas = rows.filter(r => esInterna(r) && esCerrado(r)).length;
  const extAbiertas = rows.filter(r => esExterna(r) && esAbierto(r)).length;
  const extCerradas = rows.filter(r => esExterna(r) && esCerrado(r)).length;

  // ── Calcular días únicos para promedios ──
  const diasTot = new Set();
  const diasInt = new Set();
  const diasExt = new Set();
  // Para los promedios de chips también
  const diasIntAb = new Set();
  const diasIntCe = new Set();
  const diasExtAb = new Set();
  const diasExtCe = new Set();
  rows.forEach(r => {
    if (!r["Fecha 1"]) return;
    const d = new Date(r["Fecha 1"]);
    if (isNaN(d)) return;
    const dia = _fechaLocal(d);
    diasTot.add(dia);
    if (esInterna(r)) {
      diasInt.add(dia);
      if (esAbierto(r)) diasIntAb.add(dia);
      if (esCerrado(r)) diasIntCe.add(dia);
    }
    if (esExterna(r)) {
      diasExt.add(dia);
      if (esAbierto(r)) diasExtAb.add(dia);
      if (esCerrado(r)) diasExtCe.add(dia);
    }
  });

  // Helper: formatea promedio (entero si es exacto, 1 decimal si no)
  const fmtProm = (n, d) => {
    if (d === 0) return 0;
    const v = n / d;
    return Number.isInteger(v) ? v : Math.round(v * 10) / 10;
  };

  // Guardar ambas vistas en cache para poder cambiar de tab sin recalcular
  _slaUltimaData = {
    totales: {
      total, internas, externas,
      intAbiertas, intCerradas, extAbiertas, extCerradas,
    },
    promedio: {
      total:       fmtProm(total,       diasTot.size),
      internas:    fmtProm(internas,    diasInt.size),
      externas:    fmtProm(externas,    diasExt.size),
      intAbiertas: fmtProm(intAbiertas, diasIntAb.size),
      intCerradas: fmtProm(intCerradas, diasIntCe.size),
      extAbiertas: fmtProm(extAbiertas, diasExtAb.size),
      extCerradas: fmtProm(extCerradas, diasExtCe.size),
      // Días usados para cada cálculo (para tooltips)
      diasTot: diasTot.size,
      diasInt: diasInt.size,
      diasExt: diasExt.size,
      diasIntAb: diasIntAb.size,
      diasIntCe: diasIntCe.size,
      diasExtAb: diasExtAb.size,
      diasExtCe: diasExtCe.size,
    },
  };

  // Renderizar según el tab activo
  _slaPintarKPIs();

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
    // Saltar tipos sin casos con duración registrada (no se puede calcular promedio)
    if (data.conDuracion === 0) return "";

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

    const cnxKey   = _resolverEstadoKey(estadoCnxVal);
    const cnxMatch = cnxKey ? ESTADOS_CONEXION.find(e => e.key === cnxKey) : null;
    const cnxPill = cnxMatch
      ? `<span class="pill ${cnxMatch.pill}">${cnxMatch.label}</span>`
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
  // Nota: la clase "light" ahora activa el modo oscuro (tema base = claro)
  document.body.classList.toggle("light", isLight);
  const btn = document.getElementById("btnDk");
  btn.innerHTML = isLight
    ? '<i class="fa-solid fa-sun"></i> Claro'
    : '<i class="fa-solid fa-moon"></i> Oscuro';
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
    const rows = Array.isArray(json.cfo?.rows) ? json.cfo.rows
               : Array.isArray(json.cfo)       ? json.cfo
               : [];
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

  // Totales simples Monitoreo (sin filtro enlace)
  const monTotalAbiertos = rowsMon.filter(r => (r["Estado del ticket"] || "").trim().toLowerCase() === "abierto").length;
  const monTotalCerrados = rowsMon.filter(r => (r["Estado del ticket"] || "").trim().toLowerCase() === "cerrado").length;

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

  // Desglose Instalación — totales simples sin filtro enlace
  const instCerrados = rowsInst.filter(r => (r["Estado del ticket"] || "").trim().toLowerCase() === "cerrado").length;
  const instAbiertos = rowsInst.filter(r => (r["Estado del ticket"] || "").trim().toLowerCase() === "abierto").length;

  animateNumber("cfoTotal",       total);
  animateNumber("cfoMonitoreo",   monitoreo);
  animateNumber("cfoInstalacion", instalacion);
  animateNumber("cfoCerrados",    cerrados);
  animateNumber("cfoAbiertos",    abiertos);
  animateNumber("cfoMonTotalAbiertos", monTotalAbiertos);
  animateNumber("cfoMonTotalCerrados", monTotalCerrados);
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

    // Tickets ABIERTOS con enlace DOWN (OFF)
    const enlaceTotal = conTicket.filter(r =>
      (r["Estado del ticket"] || "").trim().toLowerCase() === "abierto" &&
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
  const ordenFecha     = document.getElementById("cfoOrdenFecha")?.value || "";
  const ordenDias      = document.getElementById("cfoOrdenDias")?.value || "";

  const parseFecha = v => v ? new Date(v + "T00:00:00") : null;
  const creDesde = parseFecha(creacionDesde);
  const creHasta = parseFecha(creacionHasta);
  const cerDesde = parseFecha(cierreDesde);
  const cerHasta = parseFecha(cierreHasta);

  const conTicket = _rowsCFOCache.filter(r => (r["Ticket"] || "").toString().trim() !== "");

  let filtradas = conTicket.filter(r => {
    const nombre = (r["NOMBRE CE"]  || "").toLowerCase();
    const cod    = (r["CÓD CE"]     || "").toLowerCase();
    if (buscar && !nombre.includes(buscar) && !cod.includes(buscar)) return false;
    if (estado && (r["Estado del ticket"] || "").trim().toLowerCase() !== estado.toLowerCase()) return false;
    if (clasif) {
      const c = (r["CLASIFICACIÓN"] || "").trim().toLowerCase();
      if (!c.includes(clasif.toLowerCase())) return false;
    }
    if (creDesde || creHasta) {
      const fc = r["Fecha de creación tk"] ? new Date(r["Fecha de creación tk"]) : null;
      if (!fc || isNaN(fc)) return false;
      if (creDesde && fc < creDesde) return false;
      if (creHasta) { const h = new Date(creHasta); h.setHours(23,59,59); if (fc > h) return false; }
    }
    if (cerDesde || cerHasta) {
      const fci = r["Fecha de Finalización tk"] ? new Date(r["Fecha de Finalización tk"]) : null;
      if (!fci || isNaN(fci)) return false;
      if (cerDesde && fci < cerDesde) return false;
      if (cerHasta) { const h = new Date(cerHasta); h.setHours(23,59,59); if (fci > h) return false; }
    }
    return true;
  });

  // ── Ordenamiento ──
  if (ordenDias) {
    filtradas = [...filtradas].sort((a, b) => {
      const da = parseFloat(a["DIAS"] || "NaN");
      const db = parseFloat(b["DIAS"] || "NaN");
      const va = isNaN(da) ? -Infinity : da;
      const vb = isNaN(db) ? -Infinity : db;
      return ordenDias === "dias_desc" ? vb - va : va - vb;
    });
  } else if (ordenFecha) {
    filtradas = [...filtradas].sort((a, b) => {
      let da, db;
      if (ordenFecha === "fecha_asc" || ordenFecha === "fecha_desc") {
        da = a["Fecha de creación tk"]    ? new Date(a["Fecha de creación tk"]).getTime()    : 0;
        db = b["Fecha de creación tk"]    ? new Date(b["Fecha de creación tk"]).getTime()    : 0;
      } else {
        da = a["Fecha de Finalización tk"] ? new Date(a["Fecha de Finalización tk"]).getTime() : 0;
        db = b["Fecha de Finalización tk"] ? new Date(b["Fecha de Finalización tk"]).getTime() : 0;
      }
      return (ordenFecha === "fecha_asc" || ordenFecha === "cierre_asc") ? da - db : db - da;
    });
  }

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
    const diasNum = parseInt(dias);
    const diasColor = diasNum > 10 ? "var(--red)" : diasNum > 0 ? "var(--green)" : "var(--txt)";

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
      <td style="text-align:center;font-weight:700;color:${diasColor}">${dias || "—"}</td>
    </tr>`;
  }).join("");
}

function cfoLimpiarFiltros() {
  ["cfoFiltroNombre","cfoFiltroEstado","cfoFiltroClasif",
   "cfoFiltroCreacionDesde","cfoFiltroCreacionHasta",
   "cfoFiltroCierreDesde","cfoFiltroCierreHasta",
   "cfoOrdenFecha","cfoOrdenDias"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  renderCFOTabla();
}

function initFiltroCFO() {
  ["cfoFiltroNombre","cfoFiltroEstado","cfoFiltroClasif",
   "cfoFiltroCreacionDesde","cfoFiltroCreacionHasta",
   "cfoFiltroCierreDesde","cfoFiltroCierreHasta",
   "cfoOrdenFecha","cfoOrdenDias"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", renderCFOTabla);
    document.getElementById(id)?.addEventListener("change", renderCFOTabla);
  });
}

// ─── PANEL SLA CFO GENERAL ────────────────────────────────────

let _rowsCFOGenCache = [];
let _cgChartEstado  = null;
let _cgChartClasif  = null;

async function fetchCFOGen() {
  try {
    const url = `${API3}?t=${Date.now()}&r=${Math.random()}`;
    const res  = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();

    // El JSON viene con la clave "sdp" → sdp.rows
    const rows = Array.isArray(json.sdp?.rows) ? json.sdp.rows
               : Array.isArray(json.sdp)       ? json.sdp
               : Array.isArray(json.slacfo)    ? json.slacfo
               : [];

    if (!rows.length) return;
    _rowsCFOGenCache = rows;

    const el = document.getElementById("cfogenUpd");
    if (el) el.textContent = "Actualizado: " + new Date().toLocaleTimeString("es-SV");

    renderCFOGen(rows);
  } catch (e) {
    console.warn("CFOGen API error:", e.message);
    const el = document.getElementById("cfogenUpd");
    if (el) el.textContent = "Error al cargar: " + e.message;
  }
}

function _cgEstadoNorm(r) {
  return (r["Estado de solicitud"] || r["Estado"] || "").trim().toLowerCase();
}

function renderCFOGen(rows) {
  // ── KPIs ──────────────────────────────────────────────────
  const codKey    = "COD";
  const nombreKey = "Centro educativo";
  const grupoKey  = "Grupo";
  const tipKey1   = "Tipificación 1";
  const tipKey3   = "Tipificación 3";
  const creKey    = "Hora de creación";
  const finKey    = "Hora de finalización";
  const modKey    = "Modalidad";

  // Solo filas con código de CE
  const validas = rows.filter(r => (r[codKey] || "").toString().trim() !== "");

  // Cerrado = "cerrado" / "finalizado" / "resuelto" — todo lo demás = Abierto
  const esCerrado = r => {
    const e = _cgEstadoNorm(r);
    return e === "cerrado" || e === "finalizado" || e === "resuelto";
  };

  const cerrados = validas.filter(r => esCerrado(r));
  const abiertos = validas.filter(r => !esCerrado(r));

  // ── Helper: horas entre creación y finalización ──
  const diffHrs = r => {
    const cre = r[creKey]; const fin = r[finKey];
    if (!cre || !fin) return null;
    const dc = new Date(cre); const df = new Date(fin);
    if (isNaN(dc) || isNaN(df)) return null;
    const h = (df - dc) / 3600000;
    return h >= 0 ? h : null;
  };

  // Promedio días cerrados
  const diasCerrados = cerrados
    .map(r => { const h = diffHrs(r); return h !== null ? h / 24 : null; })
    .filter(n => n !== null && !isNaN(n));

  const promDias = diasCerrados.length
    ? diasCerrados.reduce((a, b) => a + b, 0) / diasCerrados.length
    : 0;

  const promEl = document.getElementById("cgPromDias");
  if (promEl) {
    if (promDias <= 0)     promEl.textContent = "0d";
    else if (promDias < 1) promEl.textContent = `${Math.round(promDias * 24)}h`;
    else                   promEl.textContent = `${Math.round(promDias)}d`;
  }

  // CEs con tickets de más de 10 días
  const cesMas10 = [...new Set(
    validas.filter(r => { const h = diffHrs(r); return h !== null && h > 240; })
           .map(r => r[codKey])
  )].length;

  // CEs únicos
  animateNumber("cgTotal",    validas.length);
  animateNumber("cgAbiertos", abiertos.length);
  animateNumber("cgCerrados", cerrados.length);

  animateNumber("cgMas10", cesMas10);

  // ── Gráfico Donut Estado — solo Cerrado / Abierto ──
  const estadosNorm = { "Cerrado": cerrados.length, "Abierto": abiertos.length };
  _renderDonutEstado("cgDonutEstado", estadosNorm, "cgLegendEstado", "cgDonutTotal", validas.length);

  // ── CEs únicos / repetidos ──
  const ceConteo = {};
  validas.forEach(r => {
    const cod = (r[codKey] || "").toString().trim();
    if (cod) ceConteo[cod] = (ceConteo[cod] || 0) + 1;
  });
  const cesArr    = Object.values(ceConteo);
  const cesUnicos = cesArr.length;
  const cesRep    = cesArr.filter(n => n > 1).length;
  const cesSolo   = cesArr.filter(n => n === 1).length;
  const cesMax    = cesArr.length ? Math.max(...cesArr) : 0;

  animateNumber("cgCesTotal", cesUnicos);
  animateNumber("cgCesRep",   cesRep);
  animateNumber("cgCesSolo",  cesSolo);
  animateNumber("cgCesMax",   cesMax);

  // ── Tickets por Bloque ──
  const bloques = {};
  validas.forEach(r => {
    let b = (r["Bloque"] || r["BLOQUE"] || "Sin bloque").trim();
    if (!b) b = "Sin bloque";
    bloques[b] = (bloques[b] || 0) + 1;
  });
  const bloqueArr = Object.entries(bloques).sort((a, b) => b[1] - a[1]);
  const maxB = bloqueArr[0]?.[1] || 1;

  const BLOQUE_COLORS = ["#2563eb","#059669","#d97706","#7c3aed","#0891b2","#be185d","#65a30d","#ea580c","#94a3b8"];
  const bloqueEl = document.getElementById("cgBloqueList");
  if (bloqueEl) {
    bloqueEl.innerHTML = bloqueArr.map(([name, cnt], i) => `
      <div class="cgbloque-item">
        <div class="cgbloque-name">${name}</div>
        <div class="cgbloque-bar-wrap">
          <div class="cgbloque-bar-track">
            <div class="cgbloque-bar-fill" style="width:${Math.round(cnt/maxB*100)}%;background:${BLOQUE_COLORS[i % BLOQUE_COLORS.length]}"></div>
          </div>
          <span class="cgbloque-cnt" style="color:${BLOQUE_COLORS[i % BLOQUE_COLORS.length]}">${cnt}</span>
          <span class="cgbloque-pct">${Math.round(cnt/validas.length*100)}%</span>
        </div>
      </div>
    `).join("");
  }

  // ── Gráfico Donut Modalidad ──
  const modalidades = {};
  validas.forEach(r => {
    let m = (r[modKey] || "No asignado").trim();
    m = m.toUpperCase() || "NO ASIGNADO";
    modalidades[m] = (modalidades[m] || 0) + 1;
  });
  _renderDonutModalidad("cgDonutModalidad", modalidades, "cgLegendModalidad", "cgDonutModalidadTotal", validas.length);

  // ── Tipificaciones ──
  const tips = {};
  validas.forEach(r => {
    const t3 = (r[tipKey3] || "").trim();
    if (t3) tips[t3] = (tips[t3] || 0) + 1;
  });
  const tipSorted = Object.entries(tips).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxTip = tipSorted[0]?.[1] || 1;
  const tipListEl = document.getElementById("cgTipList");
  if (tipListEl) {
    tipListEl.innerHTML = tipSorted.map(([name, cnt]) => `
      <div class="cfogen-tip-item">
        <div class="cfogen-tip-row">
          <span class="cfogen-tip-name" title="${name}">${name}</span>
          <span class="cfogen-tip-cnt">${cnt}</span>
        </div>
        <div class="cfogen-tip-bar-track">
          <div class="cfogen-tip-bar-fill" style="width:${Math.round(cnt/maxTip*100)}%"></div>
        </div>
      </div>
    `).join("");
  }

  // ── Poblar selector Grupo ──
  const grupoSel = document.getElementById("cgFiltroGrupo");
  if (grupoSel && grupoSel.options.length <= 1) {
    const gruposUnicos = [...new Set(validas.map(r => (r[grupoKey] || "").trim()).filter(Boolean))].sort();
    gruposUnicos.forEach(g => {
      const opt = document.createElement("option");
      opt.value = g; opt.textContent = g;
      grupoSel.appendChild(opt);
    });
  }

  renderCFOGenTabla();
}

// ── Helpers globales de tiempo CFO Gen ──
function cgParseTiempoHrs(t) {
  if (!t) return null;
  const s = String(t).trim();
  const direct = s.match(/^(\d+):(\d+):\d+$/);
  if (direct) return parseInt(direct[1]) + parseInt(direct[2]) / 60;
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const epoch = new Date("1899-12-30T00:00:00Z");
      const diffHrs = (d.getTime() - epoch.getTime()) / 3600000;
      if (diffHrs >= 0 && diffHrs < 99999) return diffHrs;
    }
  } catch(e) {}
  return null;
}

function cgHrsADias(hrs) {
  if (hrs === null || hrs === undefined || isNaN(hrs)) return "—";
  const dias  = Math.floor(hrs / 24);
  const hRest = Math.floor(hrs % 24);
  if (hrs < 1)     return `${Math.round(hrs * 60)}m`;
  if (dias === 0)  return `${Math.floor(hrs)}h`;
  if (hRest === 0) return `${dias}d`;
  return `${dias}d ${hRest}h`;
}

function _renderDonutModalidad(canvasId, dataObj, legendId, totalId, totalVal) {
  const labels = Object.keys(dataObj).sort((a, b) => dataObj[b] - dataObj[a]);
  const vals   = labels.map(l => dataObj[l]);

  const PALETTE = {
    "PILOTO":         "#2563eb",
    "CONTROL":        "#059669",
    "STANDARD":       "#d97706",
    "STANDAR":        "#d97706",
    "ESTANDAR":       "#d97706",
    "NO ASIGNADO":    "#94a3b8",
    "SIN MODALIDAD":  "#64748b",
  };
  const FALLBACK = ["#7c3aed","#0891b2","#be185d","#65a30d","#ea580c"];
  let fi = 0;
  const colors = labels.map(l => PALETTE[l] || FALLBACK[fi++ % FALLBACK.length]);

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (window["_cgChartModalidad"]) window["_cgChartModalidad"].destroy();

  window["_cgChartModalidad"] = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: vals,
        backgroundColor: colors,
        borderWidth: 0,
        borderRadius: 5,
        hoverOffset: 8,
        spacing: 3
      }]
    },
    options: {
      cutout: "75%",
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "var(--surface)",
          titleColor: "var(--txt)",
          bodyColor: "var(--txt-2)",
          borderColor: "var(--border)",
          borderWidth: 1,
          cornerRadius: 8,
          padding: 10,
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.parsed.toLocaleString()} (${Math.round(ctx.parsed/totalVal*100)}%)`
          }
        }
      },
      animation: { duration: 800, easing: "easeOutQuart" }
    }
  });

  const totalEl = document.getElementById(totalId);
  if (totalEl) totalEl.textContent = totalVal.toLocaleString();

  const legendEl = document.getElementById(legendId);
  if (legendEl) {
    legendEl.innerHTML = labels.map((lbl, i) => `
      <div class="cgmod-item">
        <div class="cgmod-dot" style="background:${colors[i]}"></div>
        <div class="cgmod-info">
          <div class="cgmod-name">${lbl}</div>
          <div class="cgmod-bar-track">
            <div class="cgmod-bar-fill" style="width:${Math.round(vals[i]/totalVal*100)}%;background:${colors[i]}"></div>
          </div>
        </div>
        <div class="cgmod-vals">
          <span class="cgmod-num">${vals[i].toLocaleString()}</span>
          <span class="cgmod-pct">${Math.round(vals[i]/totalVal*100)}%</span>
        </div>
      </div>
    `).join("");
  }
}

function _renderDonutEstado(canvasId, dataObj, legendId, totalId, totalVal) {
  const cerrado = dataObj["Cerrado"] || 0;
  const abierto = dataObj["Abierto"] || 0;
  const pctCer  = totalVal ? Math.round(cerrado / totalVal * 100) : 0;
  const pctAb   = totalVal ? Math.round(abierto / totalVal * 100) : 0;

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (window["_cgChartEstado"]) { window["_cgChartEstado"].destroy(); }

  window["_cgChartEstado"] = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["Cerrado", "Abierto"],
      datasets: [{
        data: [cerrado, abierto],
        backgroundColor: ["#059669", "#dc2626"],
        borderWidth: 0,
        borderRadius: 6,
        hoverOffset: 10,
        spacing: 3
      }]
    },
    options: {
      cutout: "78%",
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0f172a",
          titleColor: "#f8fafc",
          bodyColor: "#94a3b8",
          cornerRadius: 10,
          padding: 12,
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.parsed.toLocaleString()} (${Math.round(ctx.parsed/totalVal*100)}%)`
          }
        }
      },
      animation: { duration: 900, easing: "easeOutQuart" }
    }
  });

  const totalEl = document.getElementById(totalId);
  if (totalEl) totalEl.textContent = totalVal.toLocaleString();

  const legendEl = document.getElementById(legendId);
  if (legendEl) {
    legendEl.innerHTML = `
      <div class="cgestado-card">
        <div class="cgec-icon"><i class="fa-solid fa-circle-check"></i></div>
        <div class="cgec-body">
          <div class="cgec-val">${cerrado.toLocaleString()}</div>
          <div class="cgec-lbl">Cerrados</div>
        </div>
        <div class="cgec-pct">${pctCer}%</div>
        <div class="cgec-bar-track">
          <div class="cgec-bar-fill cgec-green" style="width:${pctCer}%"></div>
        </div>
      </div>
      <div class="cgesta-card">
        <div class="cgec-icon"><i class="fa-solid fa-circle-exclamation"></i></div>
        <div class="cgec-body">
          <div class="cgec-val">${abierto.toLocaleString()}</div>
          <div class="cgec-lbl">Abiertos</div>
        </div>
        <div class="cgec-pct">${pctAb}%</div>
        <div class="cgec-bar-track">
          <div class="cgec-bar-fill cgec-red" style="width:${pctAb}%"></div>
        </div>
      </div>`;
  }
}

const DONUT_COLORS = [
  "#2563eb","#059669","#dc2626","#d97706","#7c3aed",
  "#0891b2","#be185d","#65a30d","#9333ea","#ea580c"
];

function _renderDonut(canvasId, dataObj, legendId, totalId, totalVal, chartRefKey) {
  const labels = Object.keys(dataObj);
  const vals   = Object.values(dataObj);
  const colors = labels.map((_, i) => DONUT_COLORS[i % DONUT_COLORS.length]);

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Destruir chart existente
  if (window[chartRefKey]) { window[chartRefKey].destroy(); }

  window[chartRefKey] = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: vals, backgroundColor: colors, borderWidth: 2,
                   borderColor: "transparent", hoverOffset: 6 }]
    },
    options: {
      cutout: "72%",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.parsed} (${Math.round(ctx.parsed/totalVal*100)}%)`
          }
        }
      },
      animation: { duration: 700, easing: "easeOutQuart" }
    }
  });

  const totalEl = document.getElementById(totalId);
  if (totalEl) totalEl.textContent = totalVal;

  const legendEl = document.getElementById(legendId);
  if (legendEl) {
    legendEl.innerHTML = labels.map((lbl, i) => `
      <div class="cfogen-legend-item">
        <div class="cfogen-legend-dot" style="background:${colors[i]}"></div>
        <span class="cfogen-legend-label">${lbl}</span>
        <span class="cfogen-legend-val">${vals[i]}</span>
        <span class="cfogen-legend-pct">${Math.round(vals[i]/totalVal*100)}%</span>
      </div>
    `).join("");
  }
}

function renderCFOGenTabla() {
  const codKey    = "COD";
  const nombreKey = "Centro educativo";
  const grupoKey  = "Grupo";
  const tipKey1   = "Tipificación 1";
  const tipKey3   = "Tipificación 3";
  const modKey    = "Modalidad";
  const creKey    = "Hora de creación";
  const finKey    = "Hora de finalización";
  const tiempoKey = "Tiempo transcurrido";

  const filtroEstado = (document.getElementById("cgFiltroEstado")?.value || "").toLowerCase();
  const filtroGrupo  = (document.getElementById("cgFiltroGrupo")?.value || "");
  const buscar       = (document.getElementById("cgBuscar")?.value || "").toLowerCase();

  const validas = _rowsCFOGenCache.filter(r => (r[codKey] || "").toString().trim() !== "");

  const filtradas = validas.filter(r => {
    const cerr = (r["Estado de solicitud"] || r["Estado"] || "").trim().toLowerCase();
    const esCerr = cerr === "cerrado" || cerr === "finalizado" || cerr === "resuelto";
    if (filtroEstado === "abierto"  && esCerr)  return false;
    if (filtroEstado === "cerrado"  && !esCerr) return false;
    if (filtroGrupo && (r[grupoKey] || "").trim() !== filtroGrupo) return false;
    const nombre = (r[nombreKey] || "").toLowerCase();
    const cod    = (r[codKey]    || "").toString().toLowerCase();
    if (buscar && !nombre.includes(buscar) && !cod.includes(buscar)) return false;
    return true;
  });

  const countEl = document.getElementById("cgCount");
  if (countEl) countEl.textContent = `${filtradas.length} registro${filtradas.length !== 1 ? "s" : ""}`;

  // ── Ranking: agrupar por CE ──
  const ceMap = {};
  filtradas.forEach(r => {
    const cod    = (r[codKey]    || "—").toString().trim();
    const nombre = (r[nombreKey] || "—").trim();
    const grupo  = (r[grupoKey]  || "—").trim();
    const estNorm = (r["Estado de solicitud"] || r["Estado"] || "").trim().toLowerCase();
    const esCerrado  = estNorm === "cerrado" || estNorm === "finalizado" || estNorm === "resuelto";
    const esAbierto  = !esCerrado;
    if (!ceMap[cod]) ceMap[cod] = { cod, nombre, grupo, total: 0, abiertos: 0, cerrados: 0 };
    ceMap[cod].total++;
    if (esAbierto)  ceMap[cod].abiertos++;
    if (esCerrado)  ceMap[cod].cerrados++;
  });

  const orden = document.getElementById("cgFiltroOrden")?.value || "desc";

  const ceArr = Object.values(ceMap).sort((a, b) => {
    if (orden === "asc")      return a.total    - b.total;
    if (orden === "abiertos") return b.abiertos - a.abiertos;
    if (orden === "cerrados") return b.cerrados - a.cerrados;
    return b.total - a.total; // desc por defecto
  });
  const maxTotal = ceArr[0]?.total || 1;

  const rankEl = document.getElementById("cgRanking");
  if (rankEl) {
    rankEl.innerHTML = ceArr.slice(0, 24).map((ce, i) => {
      const rank = i + 1;
      const pctAb = Math.round(ce.abiertos / ce.total * 100);
      const pctCe = Math.round(ce.cerrados / ce.total * 100);
      const badgeClass = rank === 1 ? "rank-1" : rank === 2 ? "rank-2" : rank === 3 ? "rank-3" : "rank-n";
      return `
        <div class="cfogen-rank-card">
          <div class="cfogen-rank-top">
            <div class="cfogen-rank-badge ${badgeClass}">${rank}</div>
            <div class="cfogen-rank-info">
              <div class="cfogen-rank-cod">${ce.cod}</div>
              <div class="cfogen-rank-name cg-tooltip" data-tip="${ce.nombre}">${ce.nombre}</div>
              <div class="cfogen-rank-grupo cg-tooltip" data-tip="${ce.grupo}">${ce.grupo}</div>
            </div>
          </div>
          <div class="cfogen-rank-stats">
            <div class="cfogen-rank-stat rs-total">
              <div class="cfogen-rank-stat-val">${ce.total}</div>
              <div class="cfogen-rank-stat-lbl">Total</div>
            </div>
            <div class="cfogen-rank-stat rs-abierto">
              <div class="cfogen-rank-stat-val">${ce.abiertos}</div>
              <div class="cfogen-rank-stat-lbl">Abiertos</div>
            </div>
            <div class="cfogen-rank-stat rs-cerrado">
              <div class="cfogen-rank-stat-val">${ce.cerrados}</div>
              <div class="cfogen-rank-stat-lbl">Cerrados</div>
            </div>
          </div>
          <div class="cfogen-rank-bar-wrap">
            <div class="cfogen-rank-bar-lbl">
              <span>Abiertos ${pctAb}%</span><span>Cerrados ${pctCe}%</span>
            </div>
            <div class="cfogen-rank-bar-track">
              <div class="cfogen-rank-bar-fill bf-red" style="width:${pctAb}%;float:left"></div>
              <div class="cfogen-rank-bar-fill bf-green" style="width:${pctCe}%;float:left"></div>
            </div>
          </div>
        </div>`;
    }).join("");
  }

  // ── Tabla detalle ──
  const tbody = document.getElementById("cgTablaBody");
  if (!tbody) return;

  if (!filtradas.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--txt-3);padding:24px">Sin registros con esos filtros.</td></tr>`;
    return;
  }

  // Ordenamiento tabla detalle
  const ordenFecha   = document.getElementById("cgOrdenFecha")?.value || "";
  const ordenTiempo  = document.getElementById("cgOrdenTiempo")?.value || "";

  // Helper sort: diferencia creación-finalización en minutos
  const tiempoAMinutos = r => {
    const dc = new Date(r[creKey]); const df = new Date(r[finKey]);
    if (isNaN(dc) || isNaN(df) || !r[finKey]) return -1;
    return Math.round((df - dc) / 60000);
  };

  let tablaRows = [...filtradas];

  if (ordenTiempo) {
    tablaRows.sort((a, b) => {
      const ta = tiempoAMinutos(a);
      const tb = tiempoAMinutos(b);
      return ordenTiempo === "tiempo_desc" ? tb - ta : ta - tb;
    });
  } else if (ordenFecha) {
    tablaRows.sort((a, b) => {
      const keyA = (ordenFecha === "creado_asc" || ordenFecha === "creado_desc") ? creKey : finKey;
      const keyB = keyA;
      const da = a[keyA] ? new Date(a[keyA]).getTime() : 0;
      const db = b[keyB] ? new Date(b[keyB]).getTime() : 0;
      return (ordenFecha === "creado_asc" || ordenFecha === "fin_asc") ? da - db : db - da;
    });
  }

  const fmtFecha = v => {
    if (!v) return "—";
    try { return new Date(v).toLocaleDateString("es-SV",{day:"2-digit",month:"2-digit",year:"numeric"}); }
    catch(e) { return v; }
  };

  tbody.innerHTML = tablaRows.slice(0, 500).map(r => {
    const estado    = (r["Estado de solicitud"] || r["Estado"] || "—").trim();
    const eNorm     = estado.toLowerCase();
    const esCerr    = eNorm === "cerrado" || eNorm === "finalizado" || eNorm === "resuelto";
    const eClass    = esCerr ? "pill p-green" : "pill p-red";

    const dc = new Date(r[creKey]); const df = new Date(r[finKey]);
    const tHrs = (!isNaN(dc) && !isNaN(df) && r[finKey]) ? (df - dc) / 3600000 : null;
    const tiempo = tHrs !== null && tHrs >= 0 ? cgHrsADias(tHrs) : "—";

    return `<tr>
      <td style="font-family:'DM Mono',monospace;font-weight:700;color:var(--blue)">${r[codKey] || "—"}</td>
      <td style="font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r[nombreKey]||""}">${r[nombreKey] || "—"}</td>
      <td style="text-align:center"><span class="pill p-blue">${r[grupoKey] || "—"}</span></td>
      <td style="text-align:center;font-size:.78rem;color:var(--txt-2)">${r[modKey] || "—"}</td>
      <td><span class="${eClass}">${estado}</span></td>
      <td style="font-size:.78rem;color:var(--txt-2)">${r[tipKey1] || "—"}</td>
      <td style="font-size:.78rem;color:var(--txt-2)">${r[tipKey3] || "—"}</td>
      <td style="color:var(--txt-3);font-size:.78rem">${fmtFecha(r[creKey])}</td>
      <td style="color:var(--txt-3);font-size:.78rem">${fmtFecha(r[finKey])}</td>
      <td style="font-weight:700;font-size:.82rem">${tiempo}</td>
    </tr>`;
  }).join("");
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