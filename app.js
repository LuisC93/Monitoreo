/* ============================================================
   app.js — Dashboard de Monitoreo
   ============================================================ */

const API        = "https://script.google.com/macros/s/AKfycbwQ3ros87KulbvPwn-2SdSF1Ju4kTelm7tW4bjNIgSfLspW_ahdNb31TJHMVsWyWb6hNw/exec";
const API2       = "https://script.google.com/macros/s/AKfycbzB61eR5m06XqG-dj_9nv_CQA-a3DdeFpYWHgUQgVZ_cLe0bkjFSsBvL1cvdwZPC5sVQA/exec";
const REFRESH_MS = 30_000;

// Supervisores que tienen monitores asignados
const SUPERVISORES_CON_MONITOR = [
  "alejandra", "boris", "jonatan", "erick", "jose luis",
  "andrea", "jazmin", "jazmín", "jimmy", "marta", "sandro"
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

function procesarDatos(rows, rowsBase = []) {
  // Ignorar filas incompletas (sin CE ni Nombre de CE)
  const rowsValidas = rows.filter(r =>
    r["CE"] && String(r["CE"]).trim() !== "" &&
    r["Nombre de CE"] && String(r["Nombre de CE"]).trim() !== ""
  );

  const fechasTs = rowsValidas
    .map(r => r["Fecha"])
    .filter(Boolean)
    .map(f => new Date(f).getTime())
    .filter(t => !isNaN(t));

  const ultimaTs  = fechasTs.length ? Math.max(...fechasTs) : null;
  const ultimaStr = ultimaTs
    ? new Date(ultimaTs).toISOString().slice(0, 10)
    : null;

  // Tabla de bloques → solo última fecha
  const rowsFecha = ultimaStr
    ? rowsValidas.filter(r => r["Fecha"] &&
        new Date(r["Fecha"]).toISOString().slice(0, 10) === ultimaStr)
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
let _despegaCount   = 0;  // CE Despega

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
      "jose luis", "jose cruz", "andrea",
      "jazmin", "jimy", "marta", "sandor"
    ];

    _totalMonitor = rowsValidas.filter(r => {
      const val = String(r["Monitoreo"] || "").trim().toLowerCase();
      return MONITORES.includes(val);
    }).length;

    // Solo CEs con monitor asignado
    const conMonitor = rowsValidas.filter(r =>
      MONITORES.includes(String(r["Monitoreo"] || "").trim().toLowerCase())
    );

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
  if (_totalGeneral === 0) return;

  // ── KPI 1: Con Monitor / Total CEs ──
  const elTotal = document.getElementById("gTotal");
  if (elTotal) {
    const monStr   = _totalMonitor.toLocaleString("es-SV");
    const totalStr = _totalGeneral.toLocaleString("es-SV");
    elTotal.innerHTML = `${monStr}<span class="kpi-total-sep"> / </span><span class="kpi-total-general">${totalStr}</span>`;
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

  // ── KPI 4: CE Despega ──
  const elDes = document.getElementById("gDes");
  if (elDes) animateNumber("gDes", _despegaCount);
  const pctDes = _totalGeneral ? Math.round(_despegaCount / _totalGeneral * 100) : 0;
  const elDesPct = document.getElementById("gDesPct");
  if (elDesPct) elDesPct.textContent = _despegaCount > 0 ? `${pctDes}%` : "—";
  setTimeout(() => setBarWidth("bDes", pctDes), 200);
}

async function fetchData() {
  try {
    const url      = `${API}?t=${Date.now()}&r=${Math.random()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("HTTP " + response.status);

    const json = await response.json();
    if (json.error) throw new Error(json.error);

    // Nuevo formato: { monitoreo: [...], base: [...] }
    const rowsMon  = Array.isArray(json.monitoreo) ? json.monitoreo : [];
    const rowsBase = Array.isArray(json.base)      ? json.base      : [];

    if (!rowsMon.length && !rowsBase.length) throw new Error("La API no devolvió datos");

    const datos = procesarDatos(rowsMon, rowsBase);
    render(datos);
    document.getElementById("errb").style.display = "none";

    // Cargar API2 en paralelo para el KPI de Total Escuelas
    fetchAPI2();

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
  _despegaCount = d.despegaBase || 0;
  renderKPIs(d);
  // Si API2 ya cargó, actualizar KPI de despega
  if (_totalGeneral > 0) actualizarKPITotal();

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
  renderSLA(_rowsCache, d.sla || null);
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
  // Filtrar solo CE con Estado C.E = "Despega" de la última fecha del drive
  const rows = ultimaStr
    ? rawRows.filter(r => {
        const esDespega = (r["Estado C.E"] || "").trim().toLowerCase() === "despega";
        const fechaRow  = r["Fecha"] ? new Date(r["Fecha"]).toISOString().slice(0, 10) : "";
        return esDespega && fechaRow === ultimaStr;
      })
    : rawRows.filter(r => (r["Estado C.E"] || "").trim().toLowerCase() === "despega");

  // Fecha mostrada — igual que panel de estadísticas
  const fechaEl = document.getElementById("dSecFecha");
  if (fechaEl) fechaEl.textContent = fechaDatos || "—";

  // ── Stat cards ──
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

  // ── Tabla por bloques ──
  const bloquesMap = {};
  BLOQUES_FIJOS.forEach(b => {
    bloquesMap[b.key] = { key: b.key, label: b.label, totales: totalesVacios() };
  });

  rows.forEach(row => {
    const estadoCnx  = (row["Estado conexión"] || "").trim();
    const bloqueRaw  = (row["Bloque"] || "").trim();
    const bloqueFixed = BLOQUES_FIJOS.find(
      b => b.key.toLowerCase() === bloqueRaw.toLowerCase()
    ) || BLOQUES_FIJOS.find(b => b.key === "");

    const match = ESTADOS_CONEXION.find(
      e => e.label.toLowerCase() === estadoCnx.toLowerCase()
    );
    const bt = bloquesMap[bloqueFixed.key].totales;
    bt.total++;
    if (match) bt[match.key]++;
    else       bt.sinEstado++;
  });

  const bloques = BLOQUES_FIJOS.map(b => ({
    nombre:  b.label,
    totales: bloquesMap[b.key].totales,
  }));

  const tbody = document.getElementById("dBloquesBody");
  if (!tbody) return;

  const filas = bloques
    .filter(b => b.totales.total > 0)
    .map(b => buildBloqueRow(b))
    .join("");

  tbody.innerHTML = filas + buildTotalRow(bloques.filter(b => b.totales.total > 0));
}

// ─── PANEL SLA ────────────────────────────────────────────────

function renderSLA(rawRows, slaData) {
  const data = slaData || buildSLAFromRows(rawRows);

  // KPIs
  animateNumber("slaTotalInc",  data.total);
  animateNumber("slaResueltas", data.resueltas);
  animateNumber("slaPendientes",data.pendientes);

  const promEl = document.getElementById("slaPromedio");
  if (promEl) promEl.textContent = data.promedio || "—";

  // Top 5
  const top5El = document.getElementById("slaTop5");
  if (!top5El) return;

  if (!data.top5 || !data.top5.length) {
    top5El.innerHTML = `<div style="color:var(--txt-3);text-align:center;padding:32px">Sin datos disponibles</div>`;
    return;
  }

  const maxCount = data.top5[0].count;
  const rankClasses = ["top5-rank-1","top5-rank-2","top5-rank-3","top5-rank-4","top5-rank-5"];
  const barColors = ["var(--yellow)","var(--slate)","var(--orange)","var(--blue)","var(--teal)"];

  top5El.innerHTML = data.top5.map((item, i) => {
    const pct = Math.round(item.count / maxCount * 100);
    const total = data.total || 1;
    const itemPct = Math.round(item.count / total * 100);
    return `
      <div class="top5-item">
        <div class="top5-rank ${rankClasses[i]}">${i + 1}</div>
        <div class="top5-label">${item.label}</div>
        <div class="top5-bar-wrap">
          <div class="top5-bar-fill" style="width:${pct}%;background:${barColors[i]}"></div>
        </div>
        <div class="top5-count">${item.count}</div>
        <div class="top5-pct">${itemPct}%</div>
      </div>`;
  }).join("");
}

function buildSLAFromRows(rows) {
  // Calcula incidencias reales desde el histórico de monitoreo
  const counts = {};
  rows.forEach(r => {
    const est = (r["Estado conexión"] || "").trim();
    if (est && est.toLowerCase() !== "navegación estable") {
      counts[est] = (counts[est] || 0) + 1;
    }
  });

  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count }));

  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  const navEstable = rows.filter(r =>
    (r["Estado conexión"] || "").toLowerCase() === "navegación estable"
  ).length;

  return {
    total,
    resueltas:  navEstable,
    pendientes: total,
    promedio:   "N/A",
    top5:       sorted,
  };
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
    const ce     = String(row["CE"]     || "").toLowerCase();
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
          ${row["CE"] || "—"}
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

// ─── INIT ─────────────────────────────────────────────────────

function init() {
  initClock();
  initTabs();
  initFiltros();
  document.getElementById("btnDk").addEventListener("click", toggleDark);
  document.getElementById("btnRef").addEventListener("click", fetchData);
  document.getElementById("btnRefDespega")?.addEventListener("click", fetchData);
  fetchData();
  setInterval(fetchData, REFRESH_MS);
}

document.addEventListener("DOMContentLoaded", init);