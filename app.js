/* ============================================================
   app.js — Dashboard de Monitoreo
   ============================================================ */

const API        = "https://script.google.com/macros/s/AKfycbydHIjKuTOrIl8uX5CboBHcFSNAw0IuqS_oqAqo4hnWwizGLMXIuf5BtroFVmVJBzbqSw/exec";
const REFRESH_MS = 30_000;

const ESTADOS_CONEXION = [
  { label: "Navegación estable",         key: "nav_estable", pill: "p-green",   statId: "sEstable" },
  { label: "Corte FO externa",           key: "corte_fo",    pill: "p-red",     statId: "sCorte"   },
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

function procesarDatos(rows) {
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

  return { total, enMonitoreo, prioridad, globales, bloques, fechaDatos,
           totalHist, globalesHist, rawRows: rowsValidas };
}

// ─── FETCH ────────────────────────────────────────────────────

async function fetchData() {
  try {
    const url      = `${API}?t=${Date.now()}&r=${Math.random()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("HTTP " + response.status);

    const json = await response.json();
    const rows = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : null);
    if (!rows) throw new Error("La API no devolvió un array de datos");

    const datos = procesarDatos(rows);
    render(datos);
    document.getElementById("errb").style.display = "none";

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

  const fechaEl    = document.getElementById("fbadge");
  const secFechaEl = document.getElementById("secFecha");
  if (fechaEl)    fechaEl.textContent    = d.fechaDatos;
  if (secFechaEl) secFechaEl.textContent = d.fechaDatos;

  const gBloquesEl = document.getElementById("gBloques");
  if (gBloquesEl) gBloquesEl.textContent = `${d.bloques.length} bloques`;

  renderKPIs(d);
  renderStatCards(d);        // <-- pasa d completo
  renderTabla(d.bloques);

  _rowsCache = d.rawRows || [];
  poblarSelectores(_rowsCache);
  renderRegistros(_rowsCache);
}

// ─── KPIs GLOBALES ────────────────────────────────────────────

function renderKPIs(d) {
  const { total, enMonitoreo: mon, prioridad: pri } = d;

  animateNumber("gTotal", total);
  animateNumber("gMon",   mon);
  animateNumber("gPri",   pri);

  const pctMon = total ? Math.round(mon / total * 100) : 0;
  const pctPri = total ? Math.round(pri / total * 100) : 0;

  document.getElementById("gMonPct").textContent = `${pctMon}% del total`;
  document.getElementById("gPriPct").textContent = `${pctPri}% del total`;

  setTimeout(() => {
    setBarWidth("bMon", pctMon);
    setBarWidth("bPri", pctPri);
  }, 100);
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

// ─── PANEL INICIO ─────────────────────────────────────────────

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
  fetchData();
  setInterval(fetchData, REFRESH_MS);
}

document.addEventListener("DOMContentLoaded", init);