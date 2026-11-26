import { STATE_DOC_REF, setDoc, onSnapshot } from "./firebase-config.js";

// ==================== CONFIGURACIÓN Y ESTADO (ESQUEMA V2 LIMPIO) ====================
const ADMIN_PASS = "admin123";
const LOCAL_CACHE_KEY = "macs_inventory_cache_v2";
const SESSION_STORAGE_KEY = "macs_active_session_v2";
const SCHEMA_VERSION = 2;
const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23cbd5e1'/><circle cx='50' cy='38' r='18' fill='%2364748b'/><path d='M20 88 C20 65, 80 65, 80 88' fill='%2364748b'/></svg>";

const DEFAULT_STATE = {
    version_esquema: SCHEMA_VERSION,
    estaciones: { "050351": 8, "050353": 3, "050354": 2 },
    marcas: ["HP", "Dell", "Lenovo", "Epson", "Zebra", "Canon", "Wacom", "Suprema", "Morpho", "Xerox", "Samsung", "Nextep", "ImageTeam", "Syble", "Brother", "Datalogic", "NO APLICA", "Generico"],
    tipos_componente: [
        "Computadora / CPU",
        "Laptop",
        "Servidor",
        "Monitor",
        "Camara Fotografica",
        "Pad de Firmas",
        "Escaner de Huellas",
        "Decadactilar",
        "Impresora",
        "Escaner Digitalizador",
        "Lector QR / Codigo Barras",
        "No-Break / UPS"
    ],
    operadores: [],
    componentes: [],
    stock_resguardo: [],
    tickets_fallas: [],
    historial_traspasos: []
};

let appState = loadLocalCache();
let currentUser = null;
let activeAdminTab = "inventario";
let activeOpTab = "equipos";
let html5QrCode = null;
let targetScannerInputId = null;

// Variables temporales para imágenes base64
let currentCompPhoto = "";
let currentOpPhoto = "";
let currentFaultPhoto = "";

// ==================== HELPERS DE "NO APLICA" ====================
function isNoAplicaComponent(comp) {
    if (!comp) return false;
    const estado = String(comp.estado_fisico || comp.estado || "").trim().toLowerCase();
    const marca = String(comp.marca || "").trim().toUpperCase();
    const serie = String(comp.numero_serie || comp.serie || "").trim().toUpperCase();
    return estado === "no aplica" || marca === "NO APLICA" || serie === "NO APLICA" || serie.startsWith("NA-");
}

function countRealComponents(list = []) {
    return list.filter(c => !isNoAplicaComponent(c)).length;
}

// ==================== MIGRACIÓN A NOMBRES NORMALIZADOS ====================
function normalizeComponentRecord(raw = {}) {
    const estadoRaw = String(raw.estado_fisico ?? raw.estado ?? "Operativo").trim();
    const marcaRaw = String(raw.marca ?? "Generico").trim();
    const serieRaw = String(raw.numero_serie ?? raw.serie ?? "").trim().toUpperCase();
    const isNA =
        estadoRaw.toLowerCase() === "no aplica" ||
        marcaRaw.toUpperCase() === "NO APLICA" ||
        serieRaw === "NO APLICA" ||
        serieRaw.startsWith("NA-");

    return {
        id: String(raw.id || "CMP-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5)),
        modulo: String(raw.modulo || "050351").padStart(6, "0"),
        estacion: Number(raw.estacion ?? 0),
        tipo_componente: String(raw.tipo_componente ?? raw.tipo ?? "Computadora / CPU").trim(),
        marca: isNA ? "NO APLICA" : marcaRaw,
        modelo: isNA ? "NO APLICA" : String(raw.modelo ?? "").trim(),
        numero_serie: isNA ? "NO APLICA" : serieRaw,
        inventario_ine: isNA ? "" : String(raw.inventario_ine ?? raw.inventarioIne ?? "").trim().toUpperCase(),
        serie_cpu_vinculada: isNA ? "" : String(raw.serie_cpu_vinculada ?? raw.serieCpuVinculada ?? "").trim().toUpperCase(),
        serie_lente: isNA ? "" : String(raw.serie_lente ?? raw.serieLente ?? "").trim().toUpperCase(),
        serie_docking: isNA ? "" : String(raw.serie_docking ?? raw.serieDocking ?? "").trim().toUpperCase(),
        estado_fisico: isNA ? "No Aplica" : estadoRaw,
        observaciones: isNA ? "" : String(raw.observaciones ?? raw.notas ?? "").trim(),
        foto_url: isNA ? "" : String(raw.foto_url ?? raw.foto ?? ""),
        registrado_por: String(raw.registrado_por ?? raw.registradoPor ?? "Administrador").trim(),
        fecha_registro: String(raw.fecha_registro ?? raw.fechaRegistro ?? new Date().toLocaleString("es-MX"))
    };
}

function normalizeStockRecord(raw = {}) {
    const desincRaw = String(raw.desincorporacion ?? "No").trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const oficio = String(raw.oficio_desincorporacion ?? raw.oficioDesincorporacion ?? "").trim().toUpperCase();
    const fechaDesinc = String(raw.fecha_desincorporacion ?? raw.fechaDesincorporacion ?? "").trim();

    const isDesinc = desincRaw === "si" || Boolean(oficio);
    const desincorporacion = isDesinc ? "Si" : "No";

    const estRaw = String(raw.estatus ?? "Stock").trim().toLowerCase();
    let estatus = estRaw === "falla" ? "Falla" : (estRaw === "desincorporado" ? "Desincorporado" : "Stock");
    if (isDesinc && estatus === "Falla") {
        estatus = "Desincorporado";
    }

    let origen = String(raw.origen ?? raw.ubicacion ?? "050351").trim();
    if (origen === "500351") origen = "050351";

    return {
        id: String(raw.id || "STK-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5)),
        origen,
        destino: String(raw.destino ?? "").trim(),
        inventario_ine: String(raw.inventario_ine ?? raw.inventarioIne ?? "").trim().toUpperCase(),
        descripcion: String(raw.descripcion ?? raw.tipo_componente ?? "").trim(),
        marca: String(raw.marca ?? "").trim(),
        modelo: String(raw.modelo ?? "").trim(),
        numero_serie: String(raw.numero_serie ?? raw.serie ?? "").trim().toUpperCase(),
        serie_lente: String(raw.serie_lente ?? raw.lente ?? "").trim().toUpperCase(),
        estatus,
        desincorporacion,
        fecha_desincorporacion: fechaDesinc,
        oficio_desincorporacion: oficio,
        observaciones: String(raw.observaciones ?? "").trim(),
        fecha_registro: String(raw.fecha_registro ?? new Date().toLocaleString("es-MX"))
    };
}

function normalizeOperatorRecord(raw = {}) {
    return {
        id: String(raw.id || "OP-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5)),
        modulo: String(raw.modulo || "050351").padStart(6, "0"),
        estacion: Number(raw.estacion ?? 0),
        nombre_completo: String(raw.nombre_completo ?? raw.nombre ?? "").trim(),
        telefono: String(raw.telefono ?? "").trim(),
        correo_institucional: String(raw.correo_institucional ?? raw.correo ?? "").trim().toLowerCase(),
        foto_url: String(raw.foto_url ?? raw.foto ?? "")
    };
}

function normalizeFaultTicketRecord(raw = {}) {
    return {
        id: String(raw.id || "FLT-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5)),
        folio_ticket: String(raw.folio_ticket ?? raw.folio ?? "").trim(),
        fecha_reporte: String(raw.fecha_reporte ?? raw.fecha ?? new Date().toLocaleString("es-MX")),
        modulo: String(raw.modulo || "050351").padStart(6, "0"),
        estacion: Number(raw.estacion ?? 0),
        usuario_nombre: String(raw.usuario_nombre ?? raw.operadorNombre ?? "No asignado").trim(),
        usuario_telefono: String(raw.usuario_telefono ?? raw.operadorTelefono ?? "N/A").trim(),
        usuario_correo: String(raw.usuario_correo ?? raw.operadorCorreo ?? "N/A").trim(),
        componente_id: String(raw.componente_id ?? raw.compId ?? ""),
        tipo_componente: String(raw.tipo_componente ?? raw.compTipo ?? "").trim(),
        marca: String(raw.marca ?? raw.compMarca ?? "").trim(),
        modelo: String(raw.modelo ?? raw.compModelo ?? "").trim(),
        numero_serie: String(raw.numero_serie ?? raw.compSerie ?? "").trim().toUpperCase(),
        categoria_falla: String(raw.categoria_falla ?? raw.categoria ?? "Otro").trim(),
        descripcion_falla: String(raw.descripcion_falla ?? raw.descripcion ?? "").trim(),
        foto_evidencia: String(raw.foto_evidencia ?? raw.foto ?? ""),
        estatus_ticket: String(raw.estatus_ticket ?? raw.estatus ?? "Ticket Abierto / Pendiente").trim(),
        fecha_cierre: String(raw.fecha_cierre ?? raw.fechaSolucion ?? ""),
        tecnico_responsable: String(raw.tecnico_responsable ?? raw.tecnicoSolucion ?? "").trim(),
        tipo_solucion: String(raw.tipo_solucion ?? raw.tipoSolucion ?? "").trim(),
        notas_seguimiento: String(raw.notas_seguimiento ?? raw.notasSolucion ?? "").trim()
    };
}

function migrateStateToV2(raw = {}) {
    const estacionesRaw = raw.estaciones || raw.stations || DEFAULT_STATE.estaciones;
    const marcasRaw = raw.marcas || raw.brands || DEFAULT_STATE.marcas;
    const tiposRaw = raw.tipos_componente || raw.types || DEFAULT_STATE.tipos_componente;
    const operadoresRaw = raw.operadores || raw.operators || [];
    const componentesRaw = raw.componentes || raw.components || [];
    const stockRaw = raw.stock_resguardo || raw.stock || [];
    const ticketsRaw = raw.tickets_fallas || raw.faults || [];
    const transfersRaw = raw.historial_traspasos || [];

    const hasLegacyStockFields = Array.isArray(stockRaw) && stockRaw.some(s =>
        String(s?.ubicacion || "").trim() === "500351" ||
        (s && Object.prototype.hasOwnProperty.call(s, "ubicacion") && !Object.prototype.hasOwnProperty.call(s, "origen"))
    );

    const needsCloudSync =
        Number(raw.version_esquema || 0) !== SCHEMA_VERSION ||
        Boolean(raw.stations || raw.brands || raw.types || raw.operators || raw.components || raw.faults) ||
        hasLegacyStockFields;

    const migratedState = {
        version_esquema: SCHEMA_VERSION,
        estaciones: {
            "050351": Math.max(0, Number(estacionesRaw["050351"] ?? 8)),
            "050353": Math.max(0, Number(estacionesRaw["050353"] ?? 3)),
            "050354": Math.max(0, Number(estacionesRaw["050354"] ?? 2))
        },
        marcas: Array.isArray(marcasRaw) && marcasRaw.length ? marcasRaw : [...DEFAULT_STATE.marcas],
        tipos_componente: Array.isArray(tiposRaw) && tiposRaw.length ? tiposRaw : [...DEFAULT_STATE.tipos_componente],
        operadores: Array.isArray(operadoresRaw) ? operadoresRaw.map(normalizeOperatorRecord) : [],
        componentes: Array.isArray(componentesRaw) ? componentesRaw.map(normalizeComponentRecord) : [],
        stock_resguardo: Array.isArray(stockRaw) ? stockRaw.map(normalizeStockRecord) : [],
        tickets_fallas: Array.isArray(ticketsRaw) ? ticketsRaw.map(normalizeFaultTicketRecord) : [],
        historial_traspasos: Array.isArray(transfersRaw) ? transfersRaw : []
    };

    return { migratedState, needsCloudSync };
}

// ==================== ÍCONOS Y VINCULACIONES (CPU <-> MONITOR, LENTE, DOCKING) ====================
function getComponentIcon(tipo) {
    const t = String(tipo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (t.includes("laptop") || t.includes("portatil")) return "bi-laptop";
    if (t.includes("servidor") || t.includes("rack")) return "bi-hdd-rack-fill";
    if (t.includes("computadora") || t.includes("cpu") || t.includes("pc")) return "bi-pc-display";
    if (t.includes("monitor") || t.includes("pantalla")) return "bi-display";
    if (t.includes("camara") || t.includes("fotograf") || t.includes("digital")) return "bi-camera-fill";
    if (t.includes("firma") || t.includes("wacom") || t.includes("pad")) return "bi-pen-fill";
    if (t.includes("huella") || t.includes("dactilar") || t.includes("decadactilar") || t.includes("biometr")) return "bi-fingerprint";
    if (t.includes("impresora")) return "bi-printer-fill";
    if (t.includes("qr") || t.includes("codigo") || t.includes("lector")) return "bi-upc-scan";
    if (t.includes("escaner") || t.includes("digitalizador") || t.includes("cama")) return "bi-file-earmark-ruled-fill";
    if (t.includes("break") || t.includes("ups") || t.includes("energia")) return "bi-battery-charging";
    return "bi-cpu-fill";
}

function isMonitorType(tipo) {
    const t = String(tipo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return t.includes("monitor") || t.includes("pantalla");
}

function isCpuType(tipo) {
    const t = String(tipo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return t.includes("computadora") || t.includes("cpu") || t.includes("pc") || t.includes("servidor") || t.includes("laptop");
}

function isCameraType(tipo) {
    const t = String(tipo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return t.includes("camara");
}

function isLaptopType(tipo) {
    const t = String(tipo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return t.includes("laptop") || t.includes("portatil");
}

function getAvailableCpusForStation(modulo, estacion) {
    return appState.componentes.filter(c =>
        !isNoAplicaComponent(c) &&
        c.modulo === String(modulo).padStart(6, "0") &&
        Number(c.estacion) === Number(estacion) &&
        isCpuType(c.tipo_componente)
    );
}

function updateCpuLinkSelector(currentSerieValue = "") {
    const tipo = document.getElementById("compTipo").value;
    const isNA = document.getElementById("compMarca").value === "NO APLICA";
    const container = document.getElementById("compCpuLinkContainer");
    const selectEl = document.getElementById("compCpuSelect");
    const inputEl = document.getElementById("compSerieCpuVinculada");

    if (!container || !selectEl || !inputEl) return;

    if (!isMonitorType(tipo) || isNA) {
        container.classList.add("d-none");
        selectEl.innerHTML = `<option value="">-- Seleccionar CPU registrado --</option>`;
        inputEl.value = "";
        return;
    }

    container.classList.remove("d-none");

    const ctx = document.getElementById("compFormContext").value;
    const modulo = ctx === "op" && currentUser ? currentUser.modulo : document.getElementById("compModulo").value;
    const estacion = ctx === "op" && currentUser ? Number(currentUser.estacion) : Number(document.getElementById("compEstacion").value);

    const cpus = getAvailableCpusForStation(modulo, estacion);
    const valUpper = String(currentSerieValue || inputEl.value || "").trim().toUpperCase();

    selectEl.innerHTML = `<option value="">-- Seleccionar CPU en ${modulo} / ${formatStationLabel(estacion)} --</option>` +
        cpus.map(cpu => `<option value="${cpu.numero_serie}">${cpu.numero_serie} (${cpu.marca} ${cpu.modelo})</option>`).join("");

    if (valUpper) {
        inputEl.value = valUpper;
        selectEl.value = [...selectEl.options].some(o => o.value === valUpper) ? valUpper : "";
    } else if (cpus.length === 1) {
        selectEl.value = cpus[0].numero_serie;
        inputEl.value = cpus[0].numero_serie;
    } else {
        selectEl.value = "";
    }
}

function onCompCpuSelectChange() {
    const selVal = document.getElementById("compCpuSelect").value;
    if (selVal) {
        document.getElementById("compSerieCpuVinculada").value = selVal;
    }
}

function updateLensFieldVisibility(currentLensValue = "") {
    const tipo = document.getElementById("compTipo").value;
    const isNA = document.getElementById("compMarca").value === "NO APLICA";
    const container = document.getElementById("compLensLinkContainer");
    const inputEl = document.getElementById("compSerieLente");

    if (!container || !inputEl) return;

    if (!isCameraType(tipo) || isNA) {
        container.classList.add("d-none");
        inputEl.value = "";
        return;
    }

    container.classList.remove("d-none");
    const valUpper = String(currentLensValue || inputEl.value || "").trim().toUpperCase();
    if (valUpper) {
        inputEl.value = valUpper;
    }
}

function updateDockingFieldVisibility(currentDockingValue = "") {
    const tipo = document.getElementById("compTipo").value;
    const isNA = document.getElementById("compMarca").value === "NO APLICA";
    const container = document.getElementById("compDockingLinkContainer");
    const inputEl = document.getElementById("compSerieDocking");

    if (!container || !inputEl) return;

    if (!isLaptopType(tipo) || isNA) {
        container.classList.add("d-none");
        inputEl.value = "";
        return;
    }

    container.classList.remove("d-none");
    const valUpper = String(currentDockingValue || inputEl.value || "").trim().toUpperCase();
    if (valUpper) {
        inputEl.value = valUpper;
    }
}

// ==================== PERSISTENCIA DE SESIÓN AL REFRESCAR ====================
function persistSession() {
    try {
        if (currentUser) {
            sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
                user: currentUser,
                adminTab: activeAdminTab,
                opTab: activeOpTab
            }));
        } else {
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
        }
    } catch (e) {
        console.warn("No se pudo guardar sesion:", e);
    }
}

function restoreSession() {
    try {
        const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.user) return false;

        currentUser = parsed.user;
        activeAdminTab = parsed.adminTab || "inventario";
        activeOpTab = parsed.opTab || "equipos";

        if (currentUser.role === "operator") {
            const freshOp = getOperatorByStation(currentUser.modulo, currentUser.estacion);
            if (freshOp) currentUser.operator = freshOp;
        }
        return true;
    } catch (e) {
        return false;
    }
}

// ==================== HELPERS DE ESTACIÓN Y USUARIOS ====================
function formatStationLabel(estacion, includeRoleHint = false) {
    const num = Number(estacion);
    if (num === 0) {
        return includeRoleHint ? "Estacion 0 - Servidor (Responsable de Modulo)" : "Estacion 0 (Servidor)";
    }
    return `Estacion ${num}`;
}

function fillStationOptions(selectEl, modulo, options = {}) {
    const { onlyUserName = false, includeRoleHint = false, selectedValue = 0 } = options;
    const rawCount = appState.estaciones[modulo];
    const count = Math.max(0, Number(rawCount !== undefined && rawCount !== null ? rawCount : 0));

    selectEl.innerHTML = "";
    for (let i = 0; i <= count; i++) {
        let label = formatStationLabel(i, includeRoleHint);
        if (onlyUserName) {
            const op = getOperatorByStation(modulo, i);
            label = op ? op.nombre_completo : "Sin asignar";
        }
        selectEl.innerHTML += `<option value="${i}">${label}</option>`;
    }

    const numericSelected = Number(selectedValue);
    if (!Number.isNaN(numericSelected) && numericSelected >= 0 && numericSelected <= count) {
        selectEl.value = String(numericSelected);
    } else {
        selectEl.value = "0";
    }
}

// ==================== MODAL FLOTANTE DE COMPONENTE (REGISTRAR / EDITAR) ====================
function populateModalDropdowns() {
    const brandSel = document.getElementById("compMarca");
    const currBrand = brandSel.value;
    const brandsList = appState.marcas.includes("NO APLICA") ? appState.marcas : ["NO APLICA", ...appState.marcas];
    brandSel.innerHTML = brandsList.map(b => `<option value="${b}">${b}</option>`).join("");
    if (currBrand && brandsList.includes(currBrand)) brandSel.value = currBrand;

    const typeSel = document.getElementById("compTipo");
    const currType = typeSel.value;
    typeSel.innerHTML = appState.tipos_componente.map(t => `<option value="${t}">${t}</option>`).join("");
    if (currType && appState.tipos_componente.includes(currType)) typeSel.value = currType;
}

function applyModalBrandLockState() {
    const marca = document.getElementById("compMarca").value;
    const isNoAplica = marca === "NO APLICA";

    const modeloEl = document.getElementById("compModelo");
    const serieEl = document.getElementById("compSerie");
    const invIneEl = document.getElementById("compInventarioIne");
    const estadoEl = document.getElementById("compEstado");
    const notasEl = document.getElementById("compNotas");
    const scanBtnEl = document.getElementById("btnCompScanSerie");

    modeloEl.disabled = isNoAplica;
    serieEl.disabled = isNoAplica;
    invIneEl.disabled = isNoAplica;
    if (notasEl) notasEl.disabled = isNoAplica;
    if (scanBtnEl) scanBtnEl.disabled = isNoAplica;

    if (isNoAplica) {
        modeloEl.value = "NO APLICA";
        serieEl.value = "NO APLICA";
        invIneEl.value = "";
        estadoEl.value = "No Aplica";
        if (notasEl) notasEl.value = "";
    } else {
        if (modeloEl.value === "NO APLICA") modeloEl.value = "";
        if (serieEl.value === "NO APLICA" || serieEl.value.startsWith("NA-")) serieEl.value = "";
        if (estadoEl.value === "No Aplica") estadoEl.value = "Operativo";
    }
}

function onModalBrandOrTypeChange() {
    applyModalBrandLockState();
    updateCpuLinkSelector();
    updateLensFieldVisibility();
    updateDockingFieldVisibility();
}

function openComponentModal(context = "admin", compToEdit = null) {
    populateModalDropdowns();
    document.getElementById("componentForm").reset();
    clearImageField("compFotoInput", "compPhotoPreview", "currentCompPhoto");
    document.getElementById("compFormContext").value = context;

    const locRow = document.getElementById("compAdminLocationRow");
    if (context === "op" && currentUser) {
        locRow.classList.add("d-none");
    } else {
        locRow.classList.remove("d-none");
        const mod = compToEdit ? compToEdit.modulo : (document.getElementById("compModulo").value || "050351");
        const est = compToEdit ? compToEdit.estacion : 0;
        document.getElementById("compModulo").value = mod;
        fillStationOptions(document.getElementById("compEstacion"), mod, { selectedValue: est });
        updateCompAssignedOperatorHint();
    }

    if (compToEdit) {
        const isNA = isNoAplicaComponent(compToEdit);
        document.getElementById("editCompId").value = compToEdit.id;
        document.getElementById("compModalTitle").innerHTML = `<i class="bi bi-pencil-square text-warning me-2"></i>Editar Componente`;
        document.getElementById("compTipo").value = compToEdit.tipo_componente;

        const marcaSel = document.getElementById("compMarca");
        const marcaVal = isNA ? "NO APLICA" : compToEdit.marca;
        if (![...marcaSel.options].some(o => o.value === marcaVal)) {
            marcaSel.innerHTML = `<option value="${marcaVal}">${marcaVal}</option>` + marcaSel.innerHTML;
        }
        marcaSel.value = marcaVal;

        document.getElementById("compModelo").value = isNA ? "NO APLICA" : compToEdit.modelo;
        document.getElementById("compSerie").value = isNA ? "NO APLICA" : compToEdit.numero_serie;
        document.getElementById("compInventarioIne").value = isNA ? "" : (compToEdit.inventario_ine || "");

        const cpuInput = document.getElementById("compSerieCpuVinculada");
        if (cpuInput) cpuInput.value = isNA ? "" : (compToEdit.serie_cpu_vinculada || "");

        const lensInput = document.getElementById("compSerieLente");
        if (lensInput) lensInput.value = isNA ? "" : (compToEdit.serie_lente || "");

        const dockingInput = document.getElementById("compSerieDocking");
        if (dockingInput) dockingInput.value = isNA ? "" : (compToEdit.serie_docking || "");

        document.getElementById("compEstado").value = isNA ? "No Aplica" : compToEdit.estado_fisico;
        document.getElementById("compNotas").value = isNA ? "" : (compToEdit.observaciones || "");

        currentCompPhoto = isNA ? "" : (compToEdit.foto_url || "");
        if (currentCompPhoto) {
            document.getElementById("compPhotoImg").src = currentCompPhoto;
            document.getElementById("compPhotoPreview").classList.remove("d-none");
        }
    } else {
        document.getElementById("editCompId").value = "";
        const cpuInput = document.getElementById("compSerieCpuVinculada");
        if (cpuInput) cpuInput.value = "";
        const lensInput = document.getElementById("compSerieLente");
        if (lensInput) lensInput.value = "";
        const dockingInput = document.getElementById("compSerieDocking");
        if (dockingInput) dockingInput.value = "";

        document.getElementById("compModalTitle").innerHTML = context === "op"
            ? `<i class="bi bi-plus-circle-fill text-danger me-2"></i>Registrar Componente en mi Estacion`
            : `<i class="bi bi-plus-circle-fill text-danger me-2"></i>Registrar Componente en Estacion`;
    }

    applyModalBrandLockState();
    updateCpuLinkSelector(compToEdit && !isNoAplicaComponent(compToEdit) ? compToEdit.serie_cpu_vinculada : "");
    updateLensFieldVisibility(compToEdit && !isNoAplicaComponent(compToEdit) ? compToEdit.serie_lente : "");
    updateDockingFieldVisibility(compToEdit && !isNoAplicaComponent(compToEdit) ? compToEdit.serie_docking : "");
    new bootstrap.Modal(document.getElementById("componentModal")).show();
}

async function saveComponentFromModal(e) {
    e.preventDefault();
    const ctx = document.getElementById("compFormContext").value;
    const isOp = ctx === "op" && currentUser && currentUser.role === "operator";

    const editId = document.getElementById("editCompId").value;
    const modulo = isOp ? currentUser.modulo : document.getElementById("compModulo").value;
    const estacion = isOp ? Number(currentUser.estacion) : Number(document.getElementById("compEstacion").value);
    const tipo_componente = document.getElementById("compTipo").value;
    const marca = document.getElementById("compMarca").value;
    const estadoRaw = document.getElementById("compEstado").value;
    const isNA = marca === "NO APLICA" || estadoRaw === "No Aplica";

    const modelo = isNA ? "NO APLICA" : document.getElementById("compModelo").value.trim();
    const numero_serie = isNA ? "NO APLICA" : document.getElementById("compSerie").value.trim().toUpperCase();
    const inventario_ine = isNA ? "" : document.getElementById("compInventarioIne").value.trim().toUpperCase();
    const serie_cpu_vinculada = (!isNA && isMonitorType(tipo_componente))
        ? (document.getElementById("compSerieCpuVinculada")?.value || "").trim().toUpperCase()
        : "";
    const serie_lente = (!isNA && isCameraType(tipo_componente))
        ? (document.getElementById("compSerieLente")?.value || "").trim().toUpperCase()
        : "";
    const serie_docking = (!isNA && isLaptopType(tipo_componente))
        ? (document.getElementById("compSerieDocking")?.value || "").trim().toUpperCase()
        : "";
    const estado_fisico = isNA ? "No Aplica" : estadoRaw;
    const observaciones = isNA ? "" : document.getElementById("compNotas").value.trim();

    if (!isNA) {
        const dup = appState.componentes.find(c => !isNoAplicaComponent(c) && c.numero_serie === numero_serie && c.id !== editId);
        if (dup) {
            alert(`El numero de serie "${numero_serie}" ya esta registrado en ${dup.modulo} - ${formatStationLabel(dup.estacion)}.`);
            return;
        }
    }

    if (editId) {
        const idx = appState.componentes.findIndex(c => c.id === editId);
        if (idx !== -1) {
            appState.componentes[idx] = normalizeComponentRecord({
                ...appState.componentes[idx],
                modulo,
                estacion,
                tipo_componente,
                marca: isNA ? "NO APLICA" : marca,
                modelo,
                numero_serie,
                inventario_ine,
                serie_cpu_vinculada,
                serie_lente,
                serie_docking,
                estado_fisico,
                observaciones,
                foto_url: isNA ? "" : (currentCompPhoto || appState.componentes[idx].foto_url),
                registrado_por: isOp ? currentUser.operator.nombre_completo : (appState.componentes[idx].registrado_por || "Administrador")
            });
        }
    } else {
        appState.componentes.push(normalizeComponentRecord({
            id: "CMP-" + Date.now(),
            modulo,
            estacion,
            tipo_componente,
            marca: isNA ? "NO APLICA" : marca,
            modelo,
            numero_serie,
            inventario_ine,
            serie_cpu_vinculada,
            serie_lente,
            serie_docking,
            estado_fisico,
            observaciones,
            foto_url: isNA ? "" : currentCompPhoto,
            registrado_por: isOp ? currentUser.operator.nombre_completo : "Administrador",
            fecha_registro: new Date().toLocaleString("es-MX")
        }));
    }

    await saveState();
    const modalInstance = bootstrap.Modal.getInstance(document.getElementById("componentModal"));
    if (modalInstance) modalInstance.hide();

    if (isOp) refreshOperatorUI();
    else refreshAdminUI({ preserveSelection: true });
}

// ==================== RENDERIZADO AGRUPADO POR COMPONENTE CON ÍCONOS ====================
function groupComponentsByType(list) {
    const map = new Map();
    list.forEach(c => {
        const key = c.tipo_componente || "Sin Tipo";
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(c);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "es"));
}

function renderGroupedCardsHtml(items, { showLocation = false } = {}) {
    if (!items.length) {
        return `<div class="text-center text-muted py-4">No hay componentes registrados en este filtro.</div>`;
    }

    const groups = groupComponentsByType(items);
    return groups.map(([groupName, groupItems]) => {
        const iconClass = getComponentIcon(groupName);
        const realCount = countRealComponents(groupItems);
        return `
        <div class="border rounded-3 mb-3 overflow-hidden bg-white">
            <div class="bg-light px-3 py-2 border-bottom d-flex justify-content-between align-items-center">
                <span class="fw-bold text-dark"><i class="bi ${iconClass} text-danger me-2"></i>${groupName}</span>
                <span class="badge ${realCount > 0 ? "bg-secondary" : "bg-light text-muted border"}">${realCount} ${realCount === 1 ? "equipo" : "equipos"}</span>
            </div>
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>Foto</th>
                            <th>Componente</th>
                            ${showLocation ? `<th>Modulo / Estacion</th><th>Usuario / Resp.</th>` : ""}
                            <th>Marca y Modelo</th>
                            <th>N° Serie / Inv. INE</th>
                            <th>Estado</th>
                            <th class="text-end">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${groupItems.map(c => {
                            const op = getOperatorByStation(c.modulo, c.estacion);
                            const isServer = Number(c.estacion) === 0;
                            const isNA = isNoAplicaComponent(c);
                            const itemIcon = getComponentIcon(c.tipo_componente);
                            const linkedMonitors = (!isNA && isCpuType(c.tipo_componente))
                                ? appState.componentes.filter(m => !isNoAplicaComponent(m) && isMonitorType(m.tipo_componente) && m.serie_cpu_vinculada === c.numero_serie)
                                : [];

                            if (isNA) {
                                return `
                                    <tr class="table-light text-muted">
                                        <td><span class="badge bg-light text-muted border">—</span></td>
                                        <td>
                                            <i class="bi ${itemIcon} text-secondary me-1"></i>
                                            <span class="text-secondary">${c.tipo_componente}</span>
                                        </td>
                                        ${showLocation ? `
                                            <td>
                                                <span class="badge bg-secondary">${c.modulo}</span><br>
                                                <small class="${isServer ? "text-primary fw-semibold" : ""}">${formatStationLabel(c.estacion)}</small>
                                            </td>
                                            <td>
                                                ${op
                                                    ? `<span>${op.nombre_completo}</span>`
                                                    : `<span class="text-muted">Sin asignar</span>`}
                                            </td>
                                        ` : ""}
                                        <td><span class="fst-italic text-muted">No aplica (sin equipo)</span></td>
                                        <td><span class="fst-italic text-muted">Sin serie ni datos</span></td>
                                        <td><span class="badge bg-light text-secondary border">No Aplica</span></td>
                                        <td class="text-end">
                                            <div class="d-flex justify-content-end align-items-center gap-1 flex-nowrap">
                                                <button class="btn btn-outline-secondary py-0 px-1" style="font-size: 0.72rem;" title="Editar" onclick="editComponentById('${c.id}')">
                                                    <i class="bi bi-pencil"></i>
                                                </button>
                                                <button class="btn btn-outline-secondary py-0 px-1" style="font-size: 0.72rem;" title="Eliminar registro" onclick="deleteComponent('${c.id}')">
                                                    <i class="bi bi-trash"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }

                            return `
                                <tr>
                                    <td>
                                        ${c.foto_url
                                            ? `<img src="${c.foto_url}" class="img-thumb" onclick="showPhotoModal('${c.foto_url}', '${c.tipo_componente} - ${c.numero_serie}')">`
                                            : `<span class="badge bg-light text-muted border">Sin foto</span>`}
                                    </td>
                                    <td class="fw-bold">
                                        <i class="bi ${itemIcon} text-danger me-1"></i>${c.tipo_componente}
                                        ${isMonitorType(c.tipo_componente) && c.serie_cpu_vinculada
                                            ? `<div class="text-primary mt-1 fw-normal"><i class="bi bi-link-45deg"></i>CPU: <strong class="font-monospace">${c.serie_cpu_vinculada}</strong></div>`
                                            : ""}
                                        ${linkedMonitors.length
                                            ? `<div class="text-info-emphasis mt-1 fw-normal"><i class="bi bi-display"></i>Monitor: <strong class="font-monospace">${linkedMonitors.map(m => m.numero_serie).join(", ")}</strong></div>`
                                            : ""}
                                        ${isCameraType(c.tipo_componente) && c.serie_lente
                                            ? `<div class="text-secondary mt-1 fw-normal"><i class="bi bi-camera-reels"></i>Lente: <strong class="font-monospace">${c.serie_lente}</strong></div>`
                                            : ""}
                                        ${isLaptopType(c.tipo_componente) && c.serie_docking
                                            ? `<div class="text-secondary mt-1 fw-normal"><i class="bi bi-usb-plug"></i>Docking: <strong class="font-monospace">${c.serie_docking}</strong></div>`
                                            : ""}
                                    </td>
                                    ${showLocation ? `
                                        <td>
                                            <span class="badge bg-dark">${c.modulo}</span><br>
                                            <small class="fw-bold ${isServer ? "text-primary" : ""}">${formatStationLabel(c.estacion)}</small>
                                        </td>
                                        <td>
                                            ${op
                                                ? `<strong>${op.nombre_completo}</strong>${isServer ? `<br><span class="badge bg-info-subtle text-dark border">Resp. Modulo</span>` : ""}`
                                                : `<span class="text-danger">${isServer ? "Sin responsable" : "Sin asignar"}</span>`}
                                        </td>
                                    ` : ""}
                                    <td>
                                        <strong>${c.marca}</strong> <span class="text-muted">${c.modelo}</span>
                                        ${c.observaciones ? `<div class="text-muted">${c.observaciones}</div>` : ""}
                                    </td>
                                    <td>
                                        <span class="font-monospace fw-bold bg-light px-2 py-1 rounded border">${c.numero_serie}</span>
                                        ${c.inventario_ine ? `<div class="text-secondary mt-1">Inv. INE: <strong>${c.inventario_ine}</strong></div>` : ""}
                                    </td>
                                    <td>${getStatusBadge(c.estado_fisico)}</td>
                                    <td class="text-end">
                                        <div class="d-flex justify-content-end align-items-center gap-1 flex-nowrap">
                                            <button class="btn btn-outline-primary py-0 px-1" style="font-size: 0.72rem;" title="Editar" onclick="editComponentById('${c.id}')">
                                                <i class="bi bi-pencil"></i>
                                            </button>
                                            <button class="btn btn-outline-secondary py-0 px-1" style="font-size: 0.72rem;" title="Eliminar" onclick="deleteComponent('${c.id}')">
                                                <i class="bi bi-trash"></i>
                                            </button>
                                            <button class="btn btn-outline-danger fw-semibold py-0 px-1" style="font-size: 0.72rem;" title="Levantar Ticket de Servicio" onclick="openReportFaultModal('${c.id}')">
                                                <i class="bi bi-ticket-perforated-fill"></i> Falla
                                            </button>
                                            <button class="btn btn-outline-warning text-dark fw-semibold py-0 px-1" style="font-size: 0.72rem;" title="Quitar de asignacion y enviar a Stock" onclick="openMoveToStockModal('${c.id}')">
                                                <i class="bi bi-box-arrow-in-down"></i> A Stock
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join("")}
                    </tbody>
                </table>
            </div>
        </div>
    `}).join("");
}

function editComponentById(id) {
    const c = appState.componentes.find(item => item.id === id);
    if (!c) return;
    const ctx = currentUser && currentUser.role === "operator" ? "op" : "admin";
    openComponentModal(ctx, c);
}
// ==================== APARTADO DE STOCK / BODEGA Y DESINCORPORACIÓN ====================
function onStockStatusChange() {
    const estatus = document.getElementById("stockEstatus").value;
    const desincSel = document.getElementById("stockDesincorporacion");
    desincSel.value = estatus === "Falla" ? "Si" : "No";
    onStockDesincChange();
}

function onStockDesincChange() {
    const desinc = document.getElementById("stockDesincorporacion").value;
    const fechaEl = document.getElementById("stockFechaDesinc");
    if (desinc === "Si" && !fechaEl.value) {
        fechaEl.value = new Date().toISOString().slice(0, 10);
    }
}

function openStockModal(stockItemToEdit = null) {
    document.getElementById("stockForm").reset();
    if (stockItemToEdit) {
        document.getElementById("editStockId").value = stockItemToEdit.id;
        document.getElementById("stockModalTitle").innerHTML = `<i class="bi bi-pencil-square text-warning me-2"></i>Editar Equipo en Stock / Baja`;
        document.getElementById("stockOrigen").value = stockItemToEdit.origen === "500351" ? "050351" : (stockItemToEdit.origen || "050351");
        document.getElementById("stockDestino").value = stockItemToEdit.destino || "";
        document.getElementById("stockInventarioIne").value = stockItemToEdit.inventario_ine || "";
        document.getElementById("stockDescripcion").value = stockItemToEdit.descripcion || "";
        document.getElementById("stockMarca").value = stockItemToEdit.marca || "";
        document.getElementById("stockModelo").value = stockItemToEdit.modelo || "";
        document.getElementById("stockSerie").value = stockItemToEdit.numero_serie || "";
        document.getElementById("stockLente").value = stockItemToEdit.serie_lente || "";
        document.getElementById("stockEstatus").value = stockItemToEdit.estatus || "Stock";
        document.getElementById("stockDesincorporacion").value = stockItemToEdit.desincorporacion || "No";
        document.getElementById("stockFechaDesinc").value = stockItemToEdit.fecha_desincorporacion || "";
        document.getElementById("stockOficioDesinc").value = stockItemToEdit.oficio_desincorporacion || "";
        document.getElementById("stockObservaciones").value = stockItemToEdit.observaciones || "";
    } else {
        document.getElementById("editStockId").value = "";
        document.getElementById("stockModalTitle").innerHTML = `<i class="bi bi-box-seam-fill text-danger me-2"></i>Registrar Equipo en Stock / Baja`;
        document.getElementById("stockOrigen").value = "050351";
        document.getElementById("stockDestino").value = "";
        document.getElementById("stockEstatus").value = "Stock";
        document.getElementById("stockDesincorporacion").value = "No";
        document.getElementById("stockFechaDesinc").value = "";
        document.getElementById("stockOficioDesinc").value = "";
    }
    new bootstrap.Modal(document.getElementById("stockModal")).show();
}

function editStockById(id) {
    const item = appState.stock_resguardo.find(s => s.id === id);
    if (!item) return;
    openStockModal(item);
}

async function saveStockFromModal(e) {
    e.preventDefault();
    const editId = document.getElementById("editStockId").value;
    let origen = document.getElementById("stockOrigen").value.trim() || "050351";
    if (origen === "500351") origen = "050351";

    const destino = document.getElementById("stockDestino").value.trim();
    const inventario_ine = document.getElementById("stockInventarioIne").value.trim().toUpperCase();
    const descripcion = document.getElementById("stockDescripcion").value.trim();
    const marca = document.getElementById("stockMarca").value.trim();
    const modelo = document.getElementById("stockModelo").value.trim();
    const numero_serie = document.getElementById("stockSerie").value.trim().toUpperCase();
    const serie_lente = document.getElementById("stockLente").value.trim().toUpperCase();
    const estatus = document.getElementById("stockEstatus").value;
    const desincorporacion = document.getElementById("stockDesincorporacion").value;
    const fecha_desincorporacion = document.getElementById("stockFechaDesinc").value.trim();
    const oficio_desincorporacion = document.getElementById("stockOficioDesinc").value.trim().toUpperCase();
    const observaciones = document.getElementById("stockObservaciones").value.trim();

    const dup = appState.stock_resguardo.find(s => s.numero_serie === numero_serie && s.id !== editId);
    if (dup) {
        alert(`La serie "${numero_serie}" ya esta registrada en Stock (Origen: ${dup.origen}).`);
        return;
    }

    if (editId) {
        const idx = appState.stock_resguardo.findIndex(s => s.id === editId);
        if (idx !== -1) {
            appState.stock_resguardo[idx] = normalizeStockRecord({
                ...appState.stock_resguardo[idx],
                origen,
                destino,
                inventario_ine,
                descripcion,
                marca,
                modelo,
                numero_serie,
                serie_lente,
                estatus,
                desincorporacion,
                fecha_desincorporacion,
                oficio_desincorporacion,
                observaciones
            });
        }
    } else {
        appState.stock_resguardo.push(normalizeStockRecord({
            id: "STK-" + Date.now(),
            origen,
            destino,
            inventario_ine,
            descripcion,
            marca,
            modelo,
            numero_serie,
            serie_lente,
            estatus,
            desincorporacion,
            fecha_desincorporacion,
            oficio_desincorporacion,
            observaciones,
            fecha_registro: new Date().toLocaleString("es-MX")
        }));
    }

    await saveState();
    const modalInstance = bootstrap.Modal.getInstance(document.getElementById("stockModal"));
    if (modalInstance) modalInstance.hide();
    refreshAdminUI({ preserveSelection: true });
}

async function deleteStockItem(id) {
    if (!confirm("¿Seguro que deseas eliminar este registro del apartado de Stock?")) return;
    appState.stock_resguardo = appState.stock_resguardo.filter(s => s.id !== id);
    await saveState();
    refreshAdminUI({ preserveSelection: true });
}

async function markStockAsDesincorporated(id) {
    const idx = (appState.stock_resguardo || []).findIndex(s => s.id === id);
    if (idx === -1) return;
    const item = appState.stock_resguardo[idx];

    const oficio = prompt(
        `Marcar como DESINCORPORADO:\n${item.descripcion} (${item.numero_serie})\n\nIngresa el número de oficio (opcional):`,
        item.oficio_desincorporacion || ""
    );
    if (oficio === null) return;

    const fechaDefault = item.fecha_desincorporacion || new Date().toISOString().slice(0, 10);
    const fecha = prompt("Fecha de desincorporación (YYYY-MM-DD):", fechaDefault);
    if (fecha === null) return;

    appState.stock_resguardo[idx] = normalizeStockRecord({
        ...item,
        estatus: "Desincorporado",
        desincorporacion: "Si",
        oficio_desincorporacion: oficio.trim().toUpperCase(),
        fecha_desincorporacion: fecha.trim()
    });

    await saveState();
    refreshAdminUI({ preserveSelection: true });
}

function renderAdminStockTable() {
    const list = appState.stock_resguardo || [];
    const totalEl = document.getElementById("stockStatTotal");
    const dispEl = document.getElementById("stockStatDisponibles");
    const fallaEl = document.getElementById("stockStatFalla");
    const desincEl = document.getElementById("stockStatDesinc");
    const badgeEl = document.getElementById("admStockBadge");

    const isDesincRecord = (s) =>
        s.desincorporacion === "Si" ||
        s.estatus === "Desincorporado" ||
        Boolean(s.oficio_desincorporacion);

    const disponibles = list.filter(s => !isDesincRecord(s) && s.estatus === "Stock").length;
    const enFalla = list.filter(s => !isDesincRecord(s) && s.estatus === "Falla").length;
    const paraDesinc = list.filter(s => isDesincRecord(s)).length;

    if (totalEl) totalEl.textContent = list.length;
    if (dispEl) dispEl.textContent = disponibles;
    if (fallaEl) fallaEl.textContent = enFalla;
    if (desincEl) desincEl.textContent = paraDesinc;
    if (badgeEl) badgeEl.textContent = list.length;

    const tbody = document.getElementById("adminStockTableBody");
    if (!tbody) return;

    const fEstatus = document.getElementById("stockFilterEstatus")?.value || "ALL";
    const fDesinc = document.getElementById("stockFilterDesinc")?.value || "ALL";
    const search = (document.getElementById("stockSearchInput")?.value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    const filtered = list.filter(s => {
        const isDesinc = isDesincRecord(s);
        const effectiveStatus = isDesinc ? "Desincorporado" : (s.estatus || "Stock");
        const effectiveDesinc = isDesinc ? "Si" : "No";

        if (fEstatus !== "ALL" && effectiveStatus !== fEstatus) return false;
        if (fDesinc !== "ALL" && effectiveDesinc !== fDesinc) return false;
        if (search) {
            const haystack = `${s.origen} ${s.destino} ${s.inventario_ine} ${s.descripcion} ${s.marca} ${s.modelo} ${s.numero_serie} ${s.serie_lente} ${effectiveStatus} ${effectiveDesinc} ${s.fecha_desincorporacion} ${s.oficio_desincorporacion} ${s.observaciones}`
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");
            const terms = search.split(/\s+/).filter(Boolean);
            if (!terms.every(t => haystack.includes(t))) return false;
        }
        return true;
    });

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-4">No hay equipos registrados en Stock / Resguardo con este filtro.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(s => {
        const iconClass = getComponentIcon(s.descripcion);
        const isDesinc = isDesincRecord(s);
        const isFalla = !isDesinc && s.estatus === "Falla";

        return `
            <tr>
                <td><span class="badge bg-dark">${s.origen}</span></td>
                <td>${s.destino ? `<span class="fw-semibold text-primary">${s.destino}</span>` : `<span class="text-muted">—</span>`}</td>
                <td class="fw-bold font-monospace">${s.inventario_ine || "—"}</td>
                <td class="fw-semibold">
                    <i class="bi ${iconClass} text-danger me-1"></i>${s.descripcion}
                    ${s.observaciones ? `<div class="text-muted fw-normal small">${s.observaciones}</div>` : ""}
                </td>
                <td><strong>${s.marca}</strong> <span class="text-muted">${s.modelo}</span></td>
                <td>
                    <span class="font-monospace fw-bold bg-light px-2 py-1 rounded border">${s.numero_serie}</span>
                    ${s.serie_lente ? `<div class="text-secondary small mt-1"><i class="bi bi-camera-reels me-1"></i>Lente: <strong class="font-monospace">${s.serie_lente}</strong></div>` : ""}
                </td>
                <td>
                    ${isDesinc
                        ? `<span class="badge bg-secondary-subtle text-dark border">Desincorporado</span>`
                        : (isFalla
                            ? `<span class="badge bg-danger-subtle text-danger border border-danger-subtle">Falla</span>`
                            : `<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle">Stock</span>`)}
                </td>
                <td>
                    ${isDesinc
                        ? `<span class="badge bg-warning text-dark">Sí</span>`
                        : `<span class="badge bg-success-subtle text-success border border-success-subtle">No</span>`}
                </td>
                <td>
                    ${(s.fecha_desincorporacion || s.oficio_desincorporacion)
                        ? `<div>${s.fecha_desincorporacion ? `<small class="fw-semibold"><i class="bi bi-calendar-event me-1"></i>${s.fecha_desincorporacion}</small>` : ""}</div>
                           <div>${s.oficio_desincorporacion ? `<span class="badge bg-light text-dark border font-monospace mt-1">${s.oficio_desincorporacion}</span>` : ""}</div>`
                        : `<span class="text-muted">—</span>`}
                </td>
                <td class="text-end">
                    <div class="d-flex justify-content-end align-items-center gap-1 flex-nowrap">
                        ${!isDesinc ? `
                            <button class="btn btn-warning text-dark fw-semibold py-0 px-1" style="font-size: 0.72rem;" title="Marcar como desincorporado" onclick="markStockAsDesincorporated('${s.id}')">
                                <i class="bi bi-check2-square"></i> Desinc.
                            </button>
                        ` : ""}
                        <button class="btn btn-outline-primary py-0 px-1" style="font-size: 0.72rem;" title="Editar" onclick="editStockById('${s.id}')">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-outline-danger py-0 px-1" style="font-size: 0.72rem;" title="Eliminar" onclick="deleteStockItem('${s.id}')">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

function exportStockExcel() {
    const list = appState.stock_resguardo || [];
    if (!list.length) {
        alert("No hay registros en Stock / Desincorporacion para exportar.");
        return;
    }

    const rows = list.map((s, idx) => ({
        "num": idx + 1,
        "origen": s.origen,
        "destino": s.destino || "",
        "inventario_ine": s.inventario_ine || "",
        "descripcion": s.descripcion,
        "marca": s.marca,
        "modelo": s.modelo,
        "serie": s.numero_serie,
        "lente": s.serie_lente || "",
        "estatus": s.estatus,
        "desincorporacion": s.desincorporacion === "Si" ? "Sí" : "No",
        "fecha_desincorporacion": s.fecha_desincorporacion || "",
        "oficio_desincorporacion": s.oficio_desincorporacion || "",
        "observaciones": s.observaciones || ""
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
        { wch: 6 }, { wch: 12 }, { wch: 22 }, { wch: 16 },
        { wch: 24 }, { wch: 14 }, { wch: 18 }, { wch: 22 },
        { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 22 },
        { wch: 26 }, { wch: 28 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "stock_desincorporacion");
    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `stock_desincorporacion_macs_${fecha}.xlsx`);
}

// ==================== TRASPASOS Y ENVÍO A STOCK DESDE ASIGNACIÓN ====================
function formatTransferOriginLabel(comp) {
    const op = getOperatorByStation(comp.modulo, comp.estacion);
    const userTxt = op ? ` - ${op.nombre_completo}` : "";
    return `${comp.modulo} / ${formatStationLabel(comp.estacion)}${userTxt}`;
}

function recordTransferLog({ tipo_movimiento, comp, origen_texto, destino_texto, oficio, motivo }) {
    if (!Array.isArray(appState.historial_traspasos)) appState.historial_traspasos = [];
    const num = String(appState.historial_traspasos.length + 1).padStart(3, "0");
    const folio = `TRP-${comp.modulo}-${new Date().getFullYear()}-${num}`;
    const entry = {
        id: "TRP-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
        folio_traspaso: folio,
        fecha: new Date().toLocaleString("es-MX"),
        tipo_movimiento,
        tipo_componente: comp.tipo_componente,
        marca: comp.marca,
        modelo: comp.modelo,
        numero_serie: comp.numero_serie,
        inventario_ine: comp.inventario_ine || "",
        origen_texto,
        destino_texto,
        oficio: oficio || "",
        motivo: motivo || ""
    };
    appState.historial_traspasos.push(entry);
    return entry;
}

function openMoveToStockModal(compId) {
    const comp = appState.componentes.find(c => c.id === compId);
    if (!comp || isNoAplicaComponent(comp)) return;

    document.getElementById("moveToStockForm").reset();
    document.getElementById("mtsCompId").value = comp.id;
    document.getElementById("mtsCompSummary").textContent = `${comp.tipo_componente} - ${comp.marca} ${comp.modelo} (Serie: ${comp.numero_serie})`;
    document.getElementById("mtsOriginSummary").textContent = formatTransferOriginLabel(comp);
    document.getElementById("mtsDestino").value = "Stock / Resguardo";
    document.getElementById("mtsEstatus").value = comp.estado_fisico === "En Falla" ? "Falla" : "Stock";
    document.getElementById("mtsDesinc").value = comp.estado_fisico === "En Falla" ? "Si" : "No";
    document.getElementById("mtsFecha").value = "";
    document.getElementById("mtsOficio").value = "";
    new bootstrap.Modal(document.getElementById("moveToStockModal")).show();
}

function onMtsStatusChange() {
    const est = document.getElementById("mtsEstatus").value;
    document.getElementById("mtsDesinc").value = est === "Falla" ? "Si" : "No";
}

async function confirmMoveComponentToStock(e) {
    e.preventDefault();
    const compId = document.getElementById("mtsCompId").value;
    const idx = appState.componentes.findIndex(c => c.id === compId);
    if (idx === -1) return;

    const comp = appState.componentes[idx];
    const destino = document.getElementById("mtsDestino").value.trim() || "Stock / Resguardo";
    const estatus = document.getElementById("mtsEstatus").value;
    const desincorporacion = document.getElementById("mtsDesinc").value;
    const fecha_desincorporacion = document.getElementById("mtsFecha").value.trim();
    const oficio_desincorporacion = document.getElementById("mtsOficio").value.trim().toUpperCase();
    const motivo = document.getElementById("mtsMotivo").value.trim();

    const origenTexto = formatTransferOriginLabel(comp);
    const obsFinal = [motivo, comp.observaciones].filter(Boolean).join(" • ");

    appState.componentes.splice(idx, 1);
    appState.stock_resguardo.push(normalizeStockRecord({
        id: "STK-" + Date.now(),
        origen: comp.modulo,
        destino,
        inventario_ine: comp.inventario_ine || "",
        descripcion: comp.tipo_componente,
        marca: comp.marca,
        modelo: comp.modelo,
        numero_serie: comp.numero_serie,
        serie_lente: comp.serie_lente || "",
        estatus,
        desincorporacion,
        fecha_desincorporacion,
        oficio_desincorporacion,
        observaciones: obsFinal,
        fecha_registro: new Date().toLocaleString("es-MX")
    }));

    const logEntry = recordTransferLog({
        tipo_movimiento: "Envío a Stock / Resguardo",
        comp,
        origen_texto: origenTexto,
        destino_texto: `${destino} (${estatus}${desincorporacion === "Si" ? " / Desinc. Sí" : ""})`,
        oficio: oficio_desincorporacion,
        motivo
    });

    await saveState();
    const modalEl = document.getElementById("moveToStockModal");
    const inst = bootstrap.Modal.getInstance(modalEl);
    if (inst) inst.hide();

    if (currentUser?.role === "operator") refreshOperatorUI();
    else refreshAdminUI({ preserveSelection: true });

    openPrintTransferFormat(logEntry.id);
}

function renderTransfersPanel() {
    const srcMod = document.getElementById("trSourceModulo")?.value || "ALL";
    const sel = document.getElementById("trComponentSelect");
    if (!sel) return;

    const assignedItems = appState.componentes
        .filter(c => !isNoAplicaComponent(c) && (srcMod === "ALL" || c.modulo === srcMod))
        .sort((a, b) => a.modulo.localeCompare(b.modulo) || Number(a.estacion) - Number(b.estacion));

    const prevVal = sel.value;
    sel.innerHTML = assignedItems.length
        ? assignedItems.map(c => `<option value="${c.id}">${c.modulo} • ${formatStationLabel(c.estacion)} — ${c.tipo_componente} (${c.numero_serie})</option>`).join("")
        : `<option value="">No hay componentes asignados en este filtro</option>`;

    if (prevVal && assignedItems.some(i => i.id === prevVal)) sel.value = prevVal;

    const tgtModEl = document.getElementById("trTargetModulo");
    const tgtEstEl = document.getElementById("trTargetEstacion");
    if (tgtModEl && tgtEstEl) {
        const currentEst = tgtEstEl.value || 0;
        fillStationOptions(tgtEstEl, tgtModEl.value, { selectedValue: currentEst });
    }

    onTransferComponentSelected();
    onTransferActionChange();
    renderTransferHistoryTable();
}

function onTransferSourceChange() {
    renderTransfersPanel();
}

function onTransferComponentSelected() {
    const id = document.getElementById("trComponentSelect")?.value;
    const hint = document.getElementById("trCurrentAssignmentHint");
    if (!hint) return;
    const comp = appState.componentes.find(c => c.id === id);
    if (!comp) {
        hint.textContent = "";
        return;
    }
    hint.textContent = `Asignado actualmente en: ${formatTransferOriginLabel(comp)} • Estado: ${comp.estado_fisico}`;
}

function onTransferActionChange() {
    const action = document.getElementById("trActionType")?.value || "station";
    document.getElementById("trStationTargetBox")?.classList.toggle("d-none", action !== "station");
    document.getElementById("trStockTargetBox")?.classList.toggle("d-none", action !== "stock");
    if (action === "station") updateTransferTargetHint();
}

function onTransferTargetModuloChange() {
    const mod = document.getElementById("trTargetModulo").value;
    fillStationOptions(document.getElementById("trTargetEstacion"), mod, { selectedValue: 0 });
    updateTransferTargetHint();
}

function updateTransferTargetHint() {
    const mod = document.getElementById("trTargetModulo")?.value;
    const est = Number(document.getElementById("trTargetEstacion")?.value ?? 0);
    const hint = document.getElementById("trTargetOperatorHint");
    if (!hint || !mod) return;
    const op = getOperatorByStation(mod, est);
    hint.textContent = op
        ? `Usuario destino: ${op.nombre_completo} (${op.correo_institucional})`
        : "Sin usuario registrado en esta estación destino";
    hint.className = op ? "text-success d-block mt-1 fw-semibold" : "text-danger d-block mt-1 fw-semibold";
}

function onTrStockStatusChange() {
    const est = document.getElementById("trStockEstatus").value;
    document.getElementById("trStockDesinc").value = est === "Falla" ? "Si" : "No";
}

async function submitDirectTransfer(e) {
    e.preventDefault();
    const compId = document.getElementById("trComponentSelect").value;
    const idx = appState.componentes.findIndex(c => c.id === compId);
    if (idx === -1) {
        alert("Selecciona un componente asignado válido.");
        return;
    }

    const comp = appState.componentes[idx];
    const action = document.getElementById("trActionType").value;
    const motivo = document.getElementById("trMotivo").value.trim();
    const origenTexto = formatTransferOriginLabel(comp);

    if (action === "station") {
        const targetModulo = document.getElementById("trTargetModulo").value;
        const targetEstacion = Number(document.getElementById("trTargetEstacion").value);
        if (comp.modulo === targetModulo && Number(comp.estacion) === targetEstacion) {
            alert("El destino seleccionado es la misma estación y módulo actual.");
            return;
        }

        comp.modulo = targetModulo;
        comp.estacion = targetEstacion;
        comp.observaciones = [motivo, comp.observaciones].filter(Boolean).join(" • ");

        const logEntry = recordTransferLog({
            tipo_movimiento: "Reasignación entre Estaciones / MAC",
            comp,
            origen_texto: origenTexto,
            destino_texto: formatTransferOriginLabel(comp),
            oficio: "",
            motivo
        });

        await saveState();
        document.getElementById("transferForm").reset();
        refreshAdminUI({ preserveSelection: true });
        openPrintTransferFormat(logEntry.id);
    } else {
        const destino = document.getElementById("trStockDestino").value.trim() || "Stock / Resguardo";
        const estatus = document.getElementById("trStockEstatus").value;
        const desincorporacion = document.getElementById("trStockDesinc").value;
        const fecha_desincorporacion = document.getElementById("trStockFecha").value.trim();
        const oficio_desincorporacion = document.getElementById("trStockOficio").value.trim().toUpperCase();

        appState.componentes.splice(idx, 1);
        appState.stock_resguardo.push(normalizeStockRecord({
            id: "STK-" + Date.now(),
            origen: comp.modulo,
            destino,
            inventario_ine: comp.inventario_ine || "",
            descripcion: comp.tipo_componente,
            marca: comp.marca,
            modelo: comp.modelo,
            numero_serie: comp.numero_serie,
            serie_lente: comp.serie_lente || "",
            estatus,
            desincorporacion,
            fecha_desincorporacion,
            oficio_desincorporacion,
            observaciones: [motivo, comp.observaciones].filter(Boolean).join(" • "),
            fecha_registro: new Date().toLocaleString("es-MX")
        }));

        const logEntry = recordTransferLog({
            tipo_movimiento: "Envío a Stock / Resguardo",
            comp,
            origen_texto: origenTexto,
            destino_texto: `${destino} (${estatus})`,
            oficio: oficio_desincorporacion,
            motivo
        });

        await saveState();
        document.getElementById("transferForm").reset();
        refreshAdminUI({ preserveSelection: true });
        openPrintTransferFormat(logEntry.id);
    }
}

function renderTransferHistoryTable() {
    const list = appState.historial_traspasos || [];
    const badge = document.getElementById("transferHistoryCount");
    if (badge) badge.textContent = list.length;

    const tbody = document.getElementById("transferHistoryTableBody");
    if (!tbody) return;

    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Aún no se han registrado traspasos ni envíos a stock.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.slice().reverse().map(t => `
        <tr>
            <td>
                <div class="fw-bold font-monospace text-primary">${t.folio_traspaso}</div>
                <small class="text-muted">${t.fecha}</small>
            </td>
            <td>
                <div class="fw-semibold">${t.tipo_componente}</div>
                <small class="font-monospace">${t.numero_serie}</small>
            </td>
            <td><small>${t.origen_texto}</small></td>
            <td>
                <div class="fw-semibold">${t.destino_texto}</div>
                ${t.oficio ? `<span class="badge bg-light text-dark border font-monospace">Oficio: ${t.oficio}</span>` : ""}
            </td>
            <td class="text-end">
                <button class="btn btn-sm btn-dark" onclick="openPrintTransferFormat('${t.id}')">
                    <i class="bi bi-printer me-1"></i>Formato
                </button>
            </td>
        </tr>
    `).join("");
}

function openPrintTransferFormat(logId) {
    const t = (appState.historial_traspasos || []).find(item => item.id === logId);
    if (!t) return;

    document.getElementById("printModalHeaderTitle").innerHTML = `<i class="bi bi-arrow-left-right me-2"></i>Formato de Traspaso - ${t.folio_traspaso}`;
    document.getElementById("printFormatArea").innerHTML = `
        <div class="d-flex justify-content-between align-items-center border-bottom border-2 border-dark pb-2 mb-3">
            <div>
                <h5 class="fw-bold mb-0">MÓDULOS DE ATENCIÓN CIUDADANA (050351 • 050353 • 050354)</h5>
                <div class="fw-semibold text-pink">FORMATO DE TRASPASO / REASIGNACIÓN DE EQUIPO</div>
            </div>
            <div class="text-end">
                <div class="fw-bold text-primary">FOLIO: ${t.folio_traspaso}</div>
                <div>Fecha: ${t.fecha}</div>
            </div>
        </div>
        <div class="print-box">
            <div class="print-box-title">1. Movimiento y Origen / Destino</div>
            <div class="row">
                <div class="col-12 mb-1"><strong>Tipo de movimiento:</strong> ${t.tipo_movimiento}</div>
                <div class="col-md-6"><strong>Origen:</strong> ${t.origen_texto}</div>
                <div class="col-md-6"><strong>Destino:</strong> ${t.destino_texto}</div>
                ${t.oficio ? `<div class="col-12 mt-1"><strong>Oficio de referencia:</strong> <span class="font-monospace">${t.oficio}</span></div>` : ""}
            </div>
        </div>
        <div class="print-box">
            <div class="print-box-title">2. Datos del Bien</div>
            <div class="row">
                <div class="col-md-6"><strong>Componente:</strong> ${t.tipo_componente}</div>
                <div class="col-md-6"><strong>Marca / Modelo:</strong> ${t.marca} ${t.modelo}</div>
                <div class="col-md-6 mt-1"><strong>Serie:</strong> <span class="font-monospace fw-bold">${t.numero_serie}</span></div>
                <div class="col-md-6 mt-1"><strong>Inventario INE:</strong> ${t.inventario_ine || "—"}</div>
            </div>
        </div>
        <div class="print-box">
            <div class="print-box-title">3. Motivo / Observaciones</div>
            <p class="mb-0">${t.motivo || "Sin observaciones"}</p>
        </div>
        <div class="row text-center mt-5 pt-3">
            <div class="col-6">
                <div style="border-top: 1px solid #000; margin: 0 25px; padding-top: 5px;">
                    <strong>Entrega / Origen</strong><br><small>Nombre y Firma</small>
                </div>
            </div>
            <div class="col-6">
                <div style="border-top: 1px solid #000; margin: 0 25px; padding-top: 5px;">
                    <strong>Recibe / Destino / Vo. Bo.</strong><br><small>Nombre y Firma</small>
                </div>
            </div>
        </div>
    `;
    new bootstrap.Modal(document.getElementById("printModal")).show();
}

// ==================== SINCRONIZACIÓN FIRESTORE EN TIEMPO REAL CON MIGRACIÓN ====================
function loadLocalCache() {
    try {
        const raw = localStorage.getItem(LOCAL_CACHE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return migrateStateToV2(parsed).migratedState;
        }
    } catch (e) {
        console.warn("Error leyendo cache local:", e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function updateCloudBadge(status) {
    const loginBadge = document.getElementById("loginSyncBadge");
    const appBadge = document.getElementById("cloudStatusBadge");
    if (status === "connected") {
        if (loginBadge) {
            loginBadge.className = "badge bg-success text-white";
            loginBadge.innerHTML = `<i class="bi bi-cloud-fill me-1"></i>En Linea`;
        }
        if (appBadge) {
            appBadge.className = "badge bg-success text-white py-2 px-2";
            appBadge.innerHTML = `<i class="bi bi-cloud-fill me-1"></i>En Linea`;
        }
    } else if (status === "saving") {
        if (appBadge) {
            appBadge.className = "badge bg-info text-dark py-2 px-2";
            appBadge.innerHTML = `<i class="bi bi-cloud-arrow-up-fill me-1"></i>Sincronizando...`;
        }
    } else {
        if (loginBadge) {
            loginBadge.className = "badge bg-warning text-dark";
            loginBadge.innerHTML = `<i class="bi bi-cloud-slash-fill me-1"></i>Sin Conexion`;
        }
        if (appBadge) {
            appBadge.className = "badge bg-warning text-dark py-2 px-2";
            appBadge.innerHTML = `<i class="bi bi-cloud-slash-fill me-1"></i>Sin Conexion`;
        }
    }
}

async function saveState() {
    const cleanState = migrateStateToV2(appState).migratedState;
    appState = cleanState;
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(cleanState));
    updateCloudBadge("saving");
    try {
        await setDoc(STATE_DOC_REF, {
            ...cleanState,
            fecha_actualizacion: new Date().toISOString()
        });
        updateCloudBadge("connected");
    } catch (err) {
        console.error("Error guardando en Firestore:", err);
        updateCloudBadge("offline");
    }
}

function initFirebaseRealtimeListener() {
    onSnapshot(STATE_DOC_REF, async (docSnap) => {
        if (docSnap.exists()) {
            const rawData = docSnap.data();
            const { migratedState, needsCloudSync } = migrateStateToV2(rawData);
            appState = migratedState;
            localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(appState));

            if (needsCloudSync) {
                try {
                    await setDoc(STATE_DOC_REF, {
                        ...appState,
                        fecha_actualizacion: new Date().toISOString()
                    });
                } catch (syncErr) {
                    console.warn("No se pudo sobrescribir esquema migrado en nube:", syncErr);
                }
            }
        } else {
            await saveState();
        }
        updateCloudBadge("connected");
        refreshActiveScreens();
    }, (error) => {
        console.error("Error de suscripcion Firestore:", error);
        updateCloudBadge("offline");
    });
}

function refreshActiveScreens() {
    if (!document.getElementById("loginScreen").classList.contains("d-none")) {
        const currentEst = document.getElementById("loginEstacion").value;
        fillStationOptions(
            document.getElementById("loginEstacion"),
            document.getElementById("loginModulo").value,
            { onlyUserName: true, selectedValue: currentEst }
        );
        previewOperatorProfile();
    }
    if (currentUser) {
        if (currentUser.role === "admin") {
            refreshAdminUI({ preserveSelection: true });
        } else {
            const updatedOp = getOperatorByStation(currentUser.modulo, currentUser.estacion);
            if (updatedOp) currentUser.operator = updatedOp;
            persistSession();
            refreshOperatorUI();
        }
    }
}

// ==================== INICIALIZACIÓN ====================
window.addEventListener("DOMContentLoaded", () => {
    fillStationOptions(
        document.getElementById("loginEstacion"),
        document.getElementById("loginModulo").value,
        { onlyUserName: true, selectedValue: 0 }
    );
    previewOperatorProfile();

    if (restoreSession()) {
        enterApp({ skipInitialReset: true });
    }

    initFirebaseRealtimeListener();
});

// ==================== UTILIDADES ====================
function getOperatorByStation(modulo, estacion) {
    return appState.operadores.find(op => op.modulo === modulo && Number(op.estacion) === Number(estacion));
}

function previewImageFile(event, previewDivId, imgId, targetVarName) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement("canvas");
            const maxW = 550;
            const scale = Math.min(1, maxW / img.width);
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const compressed = canvas.toDataURL("image/jpeg", 0.72);

            if (targetVarName === "currentCompPhoto") currentCompPhoto = compressed;
            if (targetVarName === "currentOpPhoto") currentOpPhoto = compressed;
            if (targetVarName === "currentFaultPhoto") currentFaultPhoto = compressed;

            document.getElementById(imgId).src = compressed;
            document.getElementById(previewDivId).classList.remove("d-none");
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function clearImageField(inputId, previewDivId, targetVarName) {
    document.getElementById(inputId).value = "";
    document.getElementById(previewDivId).classList.add("d-none");
    if (targetVarName === "currentCompPhoto") currentCompPhoto = "";
    if (targetVarName === "currentOpPhoto") currentOpPhoto = "";
    if (targetVarName === "currentFaultPhoto") currentFaultPhoto = "";
}

function showPhotoModal(src, title) {
    document.getElementById("modalFullImage").src = src;
    document.getElementById("photoModalTitle").textContent = title;
    new bootstrap.Modal(document.getElementById("photoModal")).show();
}

function getStatusBadge(status) {
    if (status === "Operativo") return `<span class="badge bg-success-subtle text-success border border-success-subtle">Operativo</span>`;
    if (status === "Stock") return `<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle">Stock</span>`;
    if (status === "En Falla") return `<span class="badge bg-danger-subtle text-danger border border-danger-subtle">En Falla</span>`;
    if (status === "En Revision" || status === "En Revisión") return `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">En Revision</span>`;
    if (status === "No Aplica") return `<span class="badge bg-light text-secondary border">No Aplica</span>`;
    return `<span class="badge bg-secondary-subtle text-secondary border">Baja</span>`;
}

// ==================== AUTENTICACIÓN Y LOGIN ====================
function switchLoginTab(role) {
    const opForm = document.getElementById("operatorLoginForm");
    const admForm = document.getElementById("adminLoginForm");
    const tabOp = document.getElementById("tab-op-login");
    const tabAdm = document.getElementById("tab-admin-login");

    if (role === "operator") {
        opForm.classList.remove("d-none");
        admForm.classList.add("d-none");
        tabOp.classList.add("active");
        tabAdm.classList.remove("active");
    } else {
        opForm.classList.add("d-none");
        admForm.classList.remove("d-none");
        tabOp.classList.remove("active");
        tabAdm.classList.add("active");
    }
}

function onLoginModuloChange() {
    const modulo = document.getElementById("loginModulo").value;
    fillStationOptions(document.getElementById("loginEstacion"), modulo, {
        onlyUserName: true,
        selectedValue: 0
    });
    previewOperatorProfile();
}

function previewOperatorProfile() {
    const modulo = document.getElementById("loginModulo").value;
    const estacion = Number(document.getElementById("loginEstacion").value);
    const op = getOperatorByStation(modulo, estacion);

    const photoEl = document.getElementById("previewOpPhoto");
    const nameEl = document.getElementById("previewOpName");
    const emailEl = document.getElementById("previewOpEmail");

    if (op) {
        photoEl.src = op.foto_url || DEFAULT_AVATAR;
        nameEl.textContent = op.nombre_completo;
        emailEl.textContent = `${op.correo_institucional} • Tel: ${op.telefono}`;
    } else {
        photoEl.src = DEFAULT_AVATAR;
        nameEl.textContent = "Sin usuario asignado";
        emailEl.textContent = "El Administrador debe registrar al responsable u operador.";
    }
}

function loginAsOperator(e) {
    e.preventDefault();
    const modulo = document.getElementById("loginModulo").value;
    const estacion = Number(document.getElementById("loginEstacion").value);
    const op = getOperatorByStation(modulo, estacion);

    if (!op) {
        alert("Este usuario aun no esta registrado. Solicita al Administrador que te de de alta en el sistema.");
        return;
    }

    currentUser = { role: "operator", modulo, estacion, operator: op };
    activeOpTab = "equipos";
    persistSession();
    enterApp();
}

function loginAsAdmin(e) {
    e.preventDefault();
    const pass = document.getElementById("adminPassword").value;
    if (pass !== ADMIN_PASS) {
        alert("Contrasena incorrecta. Verifica con el responsable del sistema.");
        return;
    }
    currentUser = { role: "admin" };
    activeAdminTab = "inventario";
    document.getElementById("adminPassword").value = "";
    persistSession();
    enterApp();
}

function enterApp({ skipInitialReset = false } = {}) {
    document.getElementById("loginScreen").classList.add("d-none");
    document.getElementById("mainApp").classList.remove("d-none");

    if (currentUser.role === "admin") {
        document.getElementById("adminView").classList.remove("d-none");
        document.getElementById("operatorView").classList.add("d-none");
        document.getElementById("sessionBadge").innerHTML = `<i class="bi bi-shield-fill-check text-danger me-1"></i>Administrador Global`;
        switchAdminTab(activeAdminTab);
        refreshAdminUI({ preserveSelection: skipInitialReset });
    } else {
        document.getElementById("operatorView").classList.remove("d-none");
        document.getElementById("adminView").classList.add("d-none");
        const estText = Number(currentUser.estacion) === 0 ? "Estacion 0 • Servidor" : `Estacion ${currentUser.estacion}`;
        document.getElementById("sessionBadge").innerHTML = `<i class="bi bi-person-badge me-1"></i>${currentUser.modulo} | ${estText}`;
        switchOpTab(activeOpTab);
        refreshOperatorUI();
    }
}

function logout() {
    currentUser = null;
    persistSession();
    document.getElementById("mainApp").classList.add("d-none");
    document.getElementById("loginScreen").classList.remove("d-none");
    onLoginModuloChange();
}

// ==================== LÓGICA VISTA DEL OPERADOR / RESPONSABLE ====================
function switchOpTab(tab) {
    activeOpTab = tab;
    persistSession();
    document.getElementById("op-tab-equipos").classList.toggle("active", tab === "equipos");
    document.getElementById("op-tab-fallas").classList.toggle("active", tab === "fallas");
    document.getElementById("opSectionEquipos").classList.toggle("d-none", tab !== "equipos");
    document.getElementById("opSectionFallas").classList.toggle("d-none", tab !== "fallas");
}

function refreshOperatorUI() {
    const { modulo, estacion, operator } = currentUser;
    document.getElementById("opCardPhoto").src = operator.foto_url || DEFAULT_AVATAR;
    document.getElementById("opCardModulo").textContent = modulo;
    document.getElementById("opCardEstacion").textContent = Number(estacion) === 0 ? "Estacion 0 • Servidor" : `Estacion ${estacion}`;
    document.getElementById("opCardName").textContent = operator.nombre_completo;
    document.getElementById("opCardPhone").textContent = operator.telefono;
    document.getElementById("opCardEmail").textContent = operator.correo_institucional;

    const myComps = appState.componentes.filter(c => c.modulo === modulo && Number(c.estacion) === Number(estacion));
    const realCount = countRealComponents(myComps);
    document.getElementById("opTotalComponents").textContent = `${realCount} ${realCount === 1 ? "equipo" : "equipos"}`;
    document.getElementById("opGroupedComponentsContainer").innerHTML = renderGroupedCardsHtml(myComps, { showLocation: false });

    const myFaults = appState.tickets_fallas.filter(f => f.modulo === modulo && Number(f.estacion) === Number(estacion));
    const activeMyFaults = myFaults.filter(f => f.estatus_ticket !== "Finalizada");
    document.getElementById("opFaultCountBadge").textContent = activeMyFaults.length;

    const fbody = document.getElementById("opFaultsTableBody");
    if (myFaults.length === 0) {
        fbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No has generado tickets de servicio en esta estacion.</td></tr>`;
    } else {
        fbody.innerHTML = myFaults.slice().reverse().map(f => {
            const isSolved = f.estatus_ticket === "Finalizada";
            const compIcon = getComponentIcon(f.tipo_componente);
            return `
            <tr>
                <td class="fw-bold text-danger font-monospace"><i class="bi bi-ticket-perforated-fill me-1"></i>${f.folio_ticket}</td>
                <td>${f.fecha_reporte}</td>
                <td><strong><i class="bi ${compIcon} text-danger me-1"></i>${f.tipo_componente}</strong><br><small class="font-monospace text-muted">${f.numero_serie}</small></td>
                <td><strong>${f.categoria_falla}:</strong> ${f.descripcion_falla}</td>
                <td>
                    ${isSolved
                        ? `<span class="badge bg-success">Finalizada / Arreglada</span><div class="text-muted mt-1">${f.fecha_cierre || ''}</div>`
                        : `<span class="badge bg-warning text-dark">${f.estatus_ticket}</span>`}
                </td>
                <td class="text-end">
                    <div class="d-flex justify-content-end gap-1 flex-wrap">
                        ${!isSolved ? `
                            <button class="btn btn-sm btn-success" title="Registrar seguimiento o solucion" onclick="openResolveFaultModal('${f.id}')">
                                <i class="bi bi-check2-circle me-1"></i>Seguimiento / Cerrar
                            </button>
                            <button class="btn btn-sm btn-dark" onclick="openPrintFaultFormat('${f.id}', 'initial')">
                                <i class="bi bi-printer me-1"></i>Hoja de Servicio
                            </button>
                        ` : `
                            <button class="btn btn-sm btn-outline-secondary" title="Hoja de servicio inicial" onclick="openPrintFaultFormat('${f.id}', 'initial')">
                                <i class="bi bi-file-earmark-text"></i> Inicial
                            </button>
                            <button class="btn btn-sm btn-success" title="Hoja de servicio finalizada" onclick="openPrintFaultFormat('${f.id}', 'solved')">
                                <i class="bi bi-printer-fill me-1"></i>Hoja Finalizada
                            </button>
                        `}
                    </div>
                </td>
            </tr>
        `}).join("");
    }
}
// ==================== LÓGICA VISTA ADMINISTRADOR ====================
function switchAdminTab(tab) {
    activeAdminTab = tab;
    persistSession();
    const tabs = ["inventario", "stock", "traspasos", "operadores", "config", "fallas"];
    tabs.forEach(t => {
        const tabBtn = document.getElementById(`adm-tab-${t}`);
        const secDiv = document.getElementById(`admSection${t.charAt(0).toUpperCase() + t.slice(1)}`);
        if (tabBtn) tabBtn.classList.toggle("active", t === tab);
        if (secDiv) secDiv.classList.toggle("d-none", t !== tab);
    });
}

function refreshAdminUI({ preserveSelection = false } = {}) {
    const activeFaults = appState.tickets_fallas.filter(f => f.estatus_ticket !== "Finalizada");
    document.getElementById("adminStatTotal").textContent = countRealComponents(appState.componentes);
    document.getElementById("adminStatOperators").textContent = appState.operadores.length;
    const totalStations = Object.values(appState.estaciones).reduce((a, b) => a + 1 + Math.max(0, Number(b)), 0);
    document.getElementById("adminStatStations").textContent = totalStations;
    document.getElementById("adminStatFaults").textContent = activeFaults.length;
    document.getElementById("admFaultBadge").textContent = activeFaults.length;

    const alertBar = document.getElementById("adminTicketAlertBar");
    if (alertBar) {
        if (activeFaults.length > 0) {
            document.getElementById("adminTicketAlertCount").textContent = activeFaults.length;
            alertBar.classList.remove("d-none");
            alertBar.classList.add("d-flex");
        } else {
            alertBar.classList.add("d-none");
            alertBar.classList.remove("d-flex");
        }
    }

    document.getElementById("cfg-050351").value = appState.estaciones["050351"] ?? 0;
    document.getElementById("cfg-050353").value = appState.estaciones["050353"] ?? 0;
    document.getElementById("cfg-050354").value = appState.estaciones["050354"] ?? 0;

    const opModVal = preserveSelection ? document.getElementById("opRegModulo").value : "050351";
    const opEstVal = preserveSelection ? document.getElementById("opRegEstacion").value : 0;

    populateFilterDropdown();

    document.getElementById("opRegModulo").value = opModVal;
    fillStationOptions(document.getElementById("opRegEstacion"), opModVal, { includeRoleHint: true, selectedValue: opEstVal });
    updateOpRoleHint();

    renderAdminInventoryGrouped();
    renderAdminStockTable();
    renderTransfersPanel();
    renderOperatorsTable();
    renderCatalogs();
    renderAdminFaultsTable();
}

function populateFilterDropdown() {
    const filterType = document.getElementById("adminFilterTipo");
    const currFilter = filterType.value;
    filterType.innerHTML = `<option value="ALL">Todos los Componentes</option>` +
        appState.tipos_componente.map(t => `<option value="${t}">${t}</option>`).join("");
    if (currFilter) filterType.value = currFilter;
}

function onAdminCompModuloChange() {
    const modulo = document.getElementById("compModulo").value;
    fillStationOptions(document.getElementById("compEstacion"), modulo, { selectedValue: 0 });
    updateCompAssignedOperatorHint();
    applyModalBrandLockState();
    updateCpuLinkSelector();
    updateLensFieldVisibility();
    updateDockingFieldVisibility();
}

function onAdminStationOrBrandChange() {
    updateCompAssignedOperatorHint();
    applyModalBrandLockState();
    updateCpuLinkSelector();
    updateLensFieldVisibility();
    updateDockingFieldVisibility();
}

function updateCompAssignedOperatorHint() {
    const modulo = document.getElementById("compModulo").value;
    const estacion = Number(document.getElementById("compEstacion").value);
    const op = getOperatorByStation(modulo, estacion);
    const hint = document.getElementById("compOperatorHint");
    if (op) {
        const rolLabel = estacion === 0 ? "Responsable de Modulo" : "Operador";
        hint.textContent = `${op.nombre_completo} (${rolLabel} • ${op.correo_institucional})`;
        hint.className = "text-success";
    } else {
        hint.textContent = estacion === 0 ? "Sin Responsable de Modulo asignado en Estacion 0" : "Sin operador asignado en esta estacion";
        hint.className = "text-danger";
    }
}

async function deleteComponent(id) {
    if (!confirm("¿Seguro que deseas eliminar este registro del inventario?")) return;
    appState.componentes = appState.componentes.filter(c => c.id !== id);
    await saveState();
    if (currentUser && currentUser.role === "operator") refreshOperatorUI();
    else refreshAdminUI({ preserveSelection: true });
}

function renderAdminInventoryGrouped() {
    const fMod = document.getElementById("adminFilterModulo").value;
    const fTipo = document.getElementById("adminFilterTipo").value;
    const search = document.getElementById("adminSearchInput").value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    const filtered = appState.componentes.filter(c => {
        if (fMod !== "ALL" && c.modulo !== fMod) return false;
        if (fTipo !== "ALL" && c.tipo_componente !== fTipo) return false;
        if (search) {
            const isNA = isNoAplicaComponent(c);
            const op = getOperatorByStation(c.modulo, c.estacion);
            const opName = op ? op.nombre_completo : "";
            const estNum = Number(c.estacion);
            const estLabel = formatStationLabel(estNum);
            const estAliases = estNum === 0
                ? `0 estacion 0 est 0 e0 servidor`
                : `${estNum} estacion ${estNum} est ${estNum} e${estNum}`;

            const compDetails = isNA
                ? `no aplica sin equipo sin serie ni datos`
                : `${c.numero_serie} ${c.inventario_ine || ""} ${c.serie_cpu_vinculada || ""} ${c.serie_lente || ""} ${c.serie_docking || ""} ${c.marca} ${c.modelo} ${c.observaciones || ""}`;

            const rawHaystack = `${c.tipo_componente} ${c.estado_fisico} ${compDetails} ${opName} ${estLabel} ${estAliases}`;
            const haystack = rawHaystack
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");

            const terms = search.split(/\s+/).filter(Boolean);
            const matchesAllTerms = terms.every(term => haystack.includes(term));
            if (!matchesAllTerms) return false;
        }
        return true;
    });

    document.getElementById("adminGroupedComponentsContainer").innerHTML =
        renderGroupedCardsHtml(filtered, { showLocation: true });
}

// ==================== GESTIÓN DE OPERADORES (MAC DISTRITO 03) ====================
function onOpRegModuloChange() {
    const modulo = document.getElementById("opRegModulo").value;
    fillStationOptions(document.getElementById("opRegEstacion"), modulo, {
        includeRoleHint: true,
        selectedValue: 0
    });
    updateOpRoleHint();
}

function updateOpRoleHint() {
    const est = Number(document.getElementById("opRegEstacion").value);
    const hint = document.getElementById("opRoleHint");
    if (est === 0) {
        hint.textContent = "Responsable de Modulo (Estacion 0 - Servidor)";
        hint.className = "text-primary";
    } else {
        hint.textContent = `Operador de Estacion ${est}`;
        hint.className = "text-dark";
    }
}

async function saveOperator(e) {
    e.preventDefault();
    const editId = document.getElementById("editOpId").value;
    const modulo = document.getElementById("opRegModulo").value;
    const estacion = Number(document.getElementById("opRegEstacion").value);
    const nombre_completo = document.getElementById("opRegNombre").value.trim();
    const telefono = document.getElementById("opRegTelefono").value.trim();
    const correo_institucional = document.getElementById("opRegCorreo").value.trim().toLowerCase();

    const existingStationOp = appState.operadores.find(o => o.modulo === modulo && Number(o.estacion) === estacion && o.id !== editId);
    if (existingStationOp) {
        const estText = formatStationLabel(estacion);
        if (!confirm(`${estText} del ${modulo} ya tiene asignado a ${existingStationOp.nombre_completo}. ¿Deseas reemplazarlo?`)) {
            return;
        }
        appState.operadores = appState.operadores.filter(o => o.id !== existingStationOp.id);
    }

    if (editId) {
        const idx = appState.operadores.findIndex(o => o.id === editId);
        if (idx !== -1) {
            appState.operadores[idx] = normalizeOperatorRecord({
                ...appState.operadores[idx],
                modulo,
                estacion,
                nombre_completo,
                telefono,
                correo_institucional,
                foto_url: currentOpPhoto || appState.operadores[idx].foto_url
            });
        }
    } else {
        appState.operadores.push(normalizeOperatorRecord({
            id: "OP-" + Date.now(),
            modulo,
            estacion,
            nombre_completo,
            telefono,
            correo_institucional,
            foto_url: currentOpPhoto
        }));
    }

    await saveState();
    resetOperatorForm({ keepModulo: modulo, keepEstacion: estacion });
    refreshAdminUI({ preserveSelection: true });
}

function editOperator(id) {
    const op = appState.operadores.find(o => o.id === id);
    if (!op) return;
    document.getElementById("editOpId").value = op.id;
    document.getElementById("opRegModulo").value = op.modulo;
    fillStationOptions(document.getElementById("opRegEstacion"), op.modulo, {
        includeRoleHint: true,
        selectedValue: op.estacion
    });
    updateOpRoleHint();
    document.getElementById("opRegNombre").value = op.nombre_completo;
    document.getElementById("opRegTelefono").value = op.telefono;
    document.getElementById("opRegCorreo").value = op.correo_institucional;

    currentOpPhoto = op.foto_url || "";
    if (op.foto_url) {
        document.getElementById("opPhotoImg").src = op.foto_url;
        document.getElementById("opPhotoPreview").classList.remove("d-none");
    } else {
        document.getElementById("opPhotoPreview").classList.add("d-none");
    }

    document.getElementById("opFormTitle").innerHTML = `<i class="bi bi-pencil-square text-warning me-2"></i>Editar Registro`;
    document.getElementById("btnCancelEditOp").classList.remove("d-none");
}

function resetOperatorForm({ keepModulo = null, keepEstacion = null } = {}) {
    const modToKeep = keepModulo ?? document.getElementById("opRegModulo").value;
    const estToKeep = keepEstacion ?? 0;

    document.getElementById("operatorForm").reset();
    document.getElementById("editOpId").value = "";
    clearImageField("opFotoInput", "opPhotoPreview", "currentOpPhoto");
    document.getElementById("opFormTitle").innerHTML = `<i class="bi bi-person-plus-fill text-danger me-2"></i>Registrar Operador / Responsable`;
    document.getElementById("btnCancelEditOp").classList.add("d-none");

    document.getElementById("opRegModulo").value = modToKeep;
    fillStationOptions(document.getElementById("opRegEstacion"), modToKeep, {
        includeRoleHint: true,
        selectedValue: estToKeep
    });
    updateOpRoleHint();
}

async function deleteOperator(id) {
    if (!confirm("¿Eliminar este registro del sistema?")) return;
    appState.operadores = appState.operadores.filter(o => o.id !== id);
    await saveState();
    refreshAdminUI({ preserveSelection: true });
}

function renderOperatorsTable() {
    const filterMod = document.getElementById("filterOpModulo").value;
    const list = appState.operadores
        .filter(o => filterMod === "ALL" || o.modulo === filterMod)
        .sort((a, b) => a.modulo.localeCompare(b.modulo) || Number(a.estacion) - Number(b.estacion));

    const tbody = document.getElementById("operatorsTableBody");
    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No hay operadores ni responsables registrados.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(o => {
        const isServer = Number(o.estacion) === 0;
        return `
        <tr>
            <td><img src="${o.foto_url || DEFAULT_AVATAR}" class="avatar-table" onclick="showPhotoModal('${o.foto_url || DEFAULT_AVATAR}', '${o.nombre_completo}')"></td>
            <td>
                <span class="badge bg-dark">${o.modulo}</span>
                <span class="badge ${isServer ? "bg-primary" : "btn-pink"}">${isServer ? "Est. 0 • Servidor" : `Est. ${o.estacion}`}</span>
            </td>
            <td class="fw-bold">${o.nombre_completo}${isServer ? `<br><small class="text-primary">Responsable de Modulo</small>` : ""}</td>
            <td>${o.telefono}</td>
            <td class="text-primary">${o.correo_institucional}</td>
            <td class="text-end">
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="editOperator('${o.id}')"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-outline-danger" onclick="deleteOperator('${o.id}')"><i class="bi bi-trash"></i></button>
                </div>
            </td>
        </tr>
    `}).join("");
}

// ==================== CONFIGURACIÓN DE ESTACIONES Y CATÁLOGOS ====================
async function saveStationCounts() {
    appState.estaciones["050351"] = Math.max(0, Number(document.getElementById("cfg-050351").value));
    appState.estaciones["050353"] = Math.max(0, Number(document.getElementById("cfg-050353").value));
    appState.estaciones["050354"] = Math.max(0, Number(document.getElementById("cfg-050354").value));
    await saveState();
    refreshAdminUI({ preserveSelection: true });
    alert("Estaciones actualizadas correctamente.");
}

function renderCatalogs() {
    document.getElementById("brandsListContainer").innerHTML = appState.marcas.map((b, idx) => `
        <span class="badge bg-light text-dark border p-2 d-inline-flex align-items-center gap-2">
            ${b}
            <i class="bi bi-x-circle-fill text-danger" style="cursor:pointer" onclick="removeCatalogItem('marcas', ${idx})"></i>
        </span>
    `).join("");

    document.getElementById("typesListContainer").innerHTML = appState.tipos_componente.map((t, idx) => `
        <span class="badge bg-light text-dark border p-2 d-inline-flex align-items-center gap-2">
            <i class="bi ${getComponentIcon(t)} text-danger"></i>
            ${t}
            <i class="bi bi-x-circle-fill text-danger" style="cursor:pointer" onclick="removeCatalogItem('tipos_componente', ${idx})"></i>
        </span>
    `).join("");
}

async function addCatalogItem(key, inputId) {
    const val = document.getElementById(inputId).value.trim();
    if (!val) return;
    if (!appState[key].some(item => item.toLowerCase() === val.toLowerCase())) {
        appState[key].push(val);
        await saveState();
        refreshAdminUI({ preserveSelection: true });
    }
    document.getElementById(inputId).value = "";
}

async function removeCatalogItem(key, idx) {
    if (appState[key].length <= 1) {
        alert("Debe existir al menos un elemento en el catalogo.");
        return;
    }
    appState[key].splice(idx, 1);
    await saveState();
    refreshAdminUI({ preserveSelection: true });
}

// ==================== TICKETS DE SERVICIO Y REPORTES DE FALLA ====================
function openReportFaultModal(compId) {
    const comp = appState.componentes.find(c => c.id === compId);
    if (!comp || isNoAplicaComponent(comp)) return;
    const op = getOperatorByStation(comp.modulo, comp.estacion);

    document.getElementById("faultCompId").value = comp.id;
    document.getElementById("faultCompInfo").textContent = `${comp.tipo_componente} - ${comp.marca} ${comp.modelo}`;
    document.getElementById("faultCompSerie").textContent = comp.numero_serie;
    document.getElementById("faultLocationInfo").textContent = `${comp.modulo} | ${formatStationLabel(comp.estacion)} (${op ? op.nombre_completo : "Sin asignar"})`;

    document.getElementById("faultForm").reset();
    clearImageField("faultPhotoInput", "faultPhotoPreview", "currentFaultPhoto");
    new bootstrap.Modal(document.getElementById("reportFaultModal")).show();
}

async function submitFaultReport(e) {
    e.preventDefault();
    const compId = document.getElementById("faultCompId").value;
    const comp = appState.componentes.find(c => c.id === compId);
    if (!comp || isNoAplicaComponent(comp)) return;

    const op = getOperatorByStation(comp.modulo, comp.estacion);
    const consecutive = String(appState.tickets_fallas.length + 1).padStart(3, "0");
    const year = new Date().getFullYear();
    const folio_ticket = `TKT-${comp.modulo}-${year}-${consecutive}`;

    const newFault = normalizeFaultTicketRecord({
        id: "FLT-" + Date.now(),
        folio_ticket,
        fecha_reporte: new Date().toLocaleString("es-MX"),
        modulo: comp.modulo,
        estacion: Number(comp.estacion),
        usuario_nombre: op ? op.nombre_completo : "Administrador / No asignado",
        usuario_telefono: op ? op.telefono : "N/A",
        usuario_correo: op ? op.correo_institucional : "N/A",
        componente_id: comp.id,
        tipo_componente: comp.tipo_componente,
        marca: comp.marca,
        modelo: comp.modelo,
        numero_serie: comp.numero_serie,
        categoria_falla: document.getElementById("faultCategory").value,
        descripcion_falla: document.getElementById("faultDescription").value.trim(),
        foto_evidencia: currentFaultPhoto,
        estatus_ticket: "Ticket Abierto / Pendiente",
        fecha_cierre: "",
        tecnico_responsable: "",
        tipo_solucion: "",
        notas_seguimiento: ""
    });

    comp.estado_fisico = "En Falla";
    appState.tickets_fallas.push(newFault);
    await saveState();

    bootstrap.Modal.getInstance(document.getElementById("reportFaultModal")).hide();
    if (currentUser.role === "admin") refreshAdminUI({ preserveSelection: true });
    else refreshOperatorUI();

    alert(`Ticket de Servicio generado: ${folio_ticket}\nSe ha registrado para seguimiento del Administrador y se abrira la Hoja de Servicio para firmas.`);
    openPrintFaultFormat(newFault.id, "initial");
}

function openResolveFaultModal(faultId) {
    const f = appState.tickets_fallas.find(item => item.id === faultId);
    if (!f) return;

    document.getElementById("resolveFaultId").value = f.id;
    document.getElementById("resolveFolioInfo").textContent = f.folio_ticket;
    document.getElementById("resolveCompInfo").textContent = `${f.tipo_componente} (${f.marca} ${f.modelo} - Serie: ${f.numero_serie})`;
    document.getElementById("resolveOriginalDesc").textContent = `${f.categoria_falla}: ${f.descripcion_falla}`;
    document.getElementById("resolveFaultForm").reset();
    document.getElementById("resolveStatusSelect").value = "Finalizada";
    document.getElementById("resolveRestoreComponent").checked = true;

    new bootstrap.Modal(document.getElementById("resolveFaultModal")).show();
}

async function submitResolveFault(e) {
    e.preventDefault();
    const faultId = document.getElementById("resolveFaultId").value;
    const f = appState.tickets_fallas.find(item => item.id === faultId);
    if (!f) return;

    const newStatus = document.getElementById("resolveStatusSelect").value;
    f.estatus_ticket = newStatus;
    f.fecha_cierre = new Date().toLocaleString("es-MX");
    f.tecnico_responsable = document.getElementById("resolveTechnician").value.trim();
    f.tipo_solucion = document.getElementById("resolveActionType").value;
    f.notas_seguimiento = document.getElementById("resolveNotes").value.trim();

    if (newStatus === "Finalizada" && document.getElementById("resolveRestoreComponent").checked) {
        const comp = appState.componentes.find(c => c.id === f.componente_id);
        if (comp && !isNoAplicaComponent(comp)) comp.estado_fisico = "Operativo";
    }

    await saveState();
    bootstrap.Modal.getInstance(document.getElementById("resolveFaultModal")).hide();

    if (currentUser.role === "admin") refreshAdminUI({ preserveSelection: true });
    else refreshOperatorUI();

    openPrintFaultFormat(f.id, newStatus === "Finalizada" ? "solved" : "initial");
}

function renderAdminFaultsTable() {
    const tbody = document.getElementById("adminFaultsTableBody");
    if (appState.tickets_fallas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No hay tickets de servicio ni reportes de falla registrados.</td></tr>`;
        return;
    }
    tbody.innerHTML = appState.tickets_fallas.slice().reverse().map(f => {
        const isSolved = f.estatus_ticket === "Finalizada";
        const compIcon = getComponentIcon(f.tipo_componente);
        return `
        <tr>
            <td class="fw-bold text-danger font-monospace">
                <i class="bi bi-ticket-perforated-fill me-1"></i>${f.folio_ticket}
                <br><small class="text-muted fw-normal">${f.fecha_reporte}</small>
            </td>
            <td><span class="badge bg-dark">${f.modulo}</span><br><small>${formatStationLabel(f.estacion)}</small></td>
            <td><strong>${f.usuario_nombre}</strong><br><span class="text-muted">${f.usuario_telefono}</span></td>
            <td><strong><i class="bi ${compIcon} text-danger me-1"></i>${f.tipo_componente}</strong><br><small class="font-monospace">${f.numero_serie}</small></td>
            <td><strong>${f.categoria_falla}:</strong> ${f.descripcion_falla}</td>
            <td>
                ${isSolved
                    ? `<span class="badge bg-success">Finalizada / Arreglada</span><div class="text-muted mt-1">Atendio: ${f.tecnico_responsable}</div>`
                    : `<span class="badge bg-warning text-dark">${f.estatus_ticket}</span>${f.tecnico_responsable ? `<div class="text-muted mt-1">Seguimiento: ${f.tecnico_responsable}</div>` : ""}`}
            </td>
            <td class="text-end">
                <div class="d-flex justify-content-end gap-1 flex-wrap">
                    ${!isSolved ? `
                        <button class="btn btn-sm btn-success fw-semibold" title="Dar seguimiento o finalizar ticket" onclick="openResolveFaultModal('${f.id}')">
                            <i class="bi bi-check2-circle me-1"></i>Seguimiento / Resolver
                        </button>
                        <button class="btn btn-sm btn-dark" onclick="openPrintFaultFormat('${f.id}', 'initial')">
                            <i class="bi bi-printer me-1"></i>Hoja Servicio
                        </button>
                    ` : `
                        <button class="btn btn-sm btn-outline-secondary" title="Hoja de servicio inicial" onclick="openPrintFaultFormat('${f.id}', 'initial')">
                            <i class="bi bi-file-earmark-text"></i> Inicial
                        </button>
                        <button class="btn btn-sm btn-success fw-semibold" title="Imprimir hoja de servicio finalizada" onclick="openPrintFaultFormat('${f.id}', 'solved')">
                            <i class="bi bi-printer-fill me-1"></i>Hoja Finalizada
                        </button>
                    `}
                </div>
            </td>
        </tr>
    `}).join("");
}

function openPrintFaultFormat(faultId, mode = "initial") {
    const f = appState.tickets_fallas.find(item => item.id === faultId);
    if (!f) return;

    const isSolvedMode = mode === "solved" && f.estatus_ticket === "Finalizada";
    document.getElementById("printModalHeaderTitle").innerHTML = isSolvedMode
        ? `<i class="bi bi-file-earmark-check-fill text-success me-2"></i>Hoja de Servicio Finalizada`
        : `<i class="bi bi-printer me-2"></i>Hoja de Servicio - Ticket ${f.folio_ticket}`;

    const headerTitle = isSolvedMode
        ? "HOJA DE SERVICIO Y DICTAMEN DE FALLA FINALIZADA"
        : "HOJA DE SERVICIO - REPORTE DE FALLA Y TICKET DE ATENCION";

    const solvedBlockHtml = isSolvedMode ? `
        <div class="print-box" style="border-color: #065f46;">
            <div class="print-box-title-solved">4. Dictamen Tecnico de Solucion y Cierre de Ticket</div>
            <div class="row mb-1">
                <div class="col-6"><strong>Fecha y Hora de Cierre:</strong> ${f.fecha_cierre}</div>
                <div class="col-6"><strong>Estatus Final:</strong> <span style="color:#065f46; font-weight:bold;">OPERATIVO / TICKET CERRADO</span></div>
            </div>
            <div class="row mb-2">
                <div class="col-6"><strong>Tecnico / Responsable:</strong> ${f.tecnico_responsable}</div>
                <div class="col-6"><strong>Tipo de Solucion:</strong> ${f.tipo_solucion}</div>
            </div>
            <div><strong>Trabajos Realizados y Pruebas de Funcionamiento:</strong></div>
            <p class="mb-0 mt-1" style="min-height: 45px;">${f.notas_seguimiento}</p>
        </div>
    ` : "";

    const signaturesHtml = isSolvedMode ? `
        <div class="row text-center mt-4 pt-3">
            <div class="col-4">
                <div style="border-top: 1px solid #000; margin: 0 10px; padding-top: 4px;">
                    <strong>${f.usuario_nombre}</strong><br>
                    <small>${Number(f.estacion) === 0 ? "Responsable de Modulo" : "Usuario MAC"} (Firma de Conformidad)</small>
                </div>
            </div>
            <div class="col-4">
                <div style="border-top: 1px solid #000; margin: 0 10px; padding-top: 4px;">
                    <strong>${f.tecnico_responsable}</strong><br>
                    <small>Tecnico / Responsable de Servicio</small>
                </div>
            </div>
            <div class="col-4">
                <div style="border-top: 1px solid #000; margin: 0 10px; padding-top: 4px;">
                    <strong>Vo. Bo. Responsable de Modulo / RFE</strong><br>
                    <small>Firma de Validacion</small>
                </div>
            </div>
        </div>
    ` : `
        <div class="row text-center mt-5 pt-4">
            <div class="col-6">
                <div style="border-top: 1px solid #000; margin: 0 25px; padding-top: 5px;">
                    <strong>${f.usuario_nombre}</strong><br>
                    <small>Firma (${Number(f.estacion) === 0 ? "Responsable de Modulo" : "Usuario del Modulo MAC"})</small>
                </div>
            </div>
            <div class="col-6">
                <div style="border-top: 1px solid #000; margin: 0 25px; padding-top: 5px;">
                    <strong>Administrador / Soporte Tecnico</strong><br>
                    <small>Nombre y Firma de Recepcion de Servicio</small>
                </div>
            </div>
        </div>
    `;

    const printHtml = `
        <div class="d-flex justify-content-between align-items-center border-bottom border-2 border-dark pb-2 mb-3">
            <div>
                <h5 class="fw-bold mb-0">MODULOS DE ATENCION CIUDADANA (050351 • 050353 • 050354)</h5>
                <div class="fw-semibold" style="color: ${isSolvedMode ? '#065f46' : '#D5007F'};">${headerTitle}</div>
            </div>
            <div class="text-end">
                <div class="fw-bold text-danger">TICKET: ${f.folio_ticket}</div>
                <div>Emision: ${f.fecha_reporte}</div>
            </div>
        </div>

        <div class="print-box">
            <div class="print-box-title">1. Datos de Ubicacion y Usuario Responsable</div>
            <div class="row">
                <div class="col-6"><strong>Modulo:</strong> ${f.modulo}</div>
                <div class="col-6"><strong>Estacion de Trabajo:</strong> ${formatStationLabel(f.estacion)}</div>
                <div class="col-12 mt-1"><strong>Usuario:</strong> ${f.usuario_nombre}</div>
                <div class="col-6 mt-1"><strong>Telefono:</strong> ${f.usuario_telefono}</div>
                <div class="col-6 mt-1"><strong>Correo Institucional:</strong> ${f.usuario_correo}</div>
            </div>
        </div>

        <div class="print-box">
            <div class="print-box-title">2. Identificacion del Equipo Tecnologico</div>
            <div class="row">
                <div class="col-6"><strong>Componente:</strong> ${f.tipo_componente}</div>
                <div class="col-6"><strong>Marca / Modelo:</strong> ${f.marca} ${f.modelo}</div>
                <div class="col-12 mt-1"><strong>Numero de Serie / Inventario:</strong> <span class="font-monospace fw-bold">${f.numero_serie}</span></div>
            </div>
        </div>

        <div class="print-box">
            <div class="print-box-title">3. Diagnostico y Descripcion de la Falla Reportada</div>
            <div class="mb-1"><strong>Clasificacion:</strong> ${f.categoria_falla}</div>
            <div><strong>Descripcion detallada:</strong></div>
            <p class="mb-0 mt-1" style="min-height: ${isSolvedMode ? '38px' : '60px'};">${f.descripcion_falla}</p>
            ${f.foto_evidencia && !isSolvedMode ? `<div class="mt-2 text-center"><img src="${f.foto_evidencia}" style="max-height: 150px; border: 1px solid #94a3b8;"></div>` : ""}
        </div>

        ${solvedBlockHtml}
        ${signaturesHtml}

        <div class="text-muted text-center mt-3">
            Hoja de Servicio Oficial • Registro de Equipo Tecnologico • CarRivers Design
        </div>
    `;

    document.getElementById("printFormatArea").innerHTML = printHtml;
    new bootstrap.Modal(document.getElementById("printModal")).show();
}

// ==================== ESCÁNER DE CÓDIGO DE BARRAS ====================
function openScanner(inputId) {
    targetScannerInputId = inputId;
    const modal = new bootstrap.Modal(document.getElementById("scannerModal"));
    modal.show();

    setTimeout(() => {
        html5QrCode = new Html5Qrcode("reader");
        html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 150 } },
            (decodedText) => {
                document.getElementById(targetScannerInputId).value = decodedText.trim().toUpperCase();
                closeScanner();
            },
            () => {}
        ).catch(err => {
            alert("No se pudo iniciar la camara. Verifica permisos o ingresa el codigo manualmente.\nDetalle: " + err);
            closeScanner();
        });
    }, 350);
}

function closeScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
            html5QrCode = null;
        }).catch(() => {});
    }
    const modalEl = document.getElementById("scannerModal");
    const modalInstance = bootstrap.Modal.getInstance(modalEl);
    if (modalInstance) modalInstance.hide();
}

// ==================== CARGA RÁPIDA DE TABLAS MAC (050351, 050353, 050354) ====================
function buildComponentsFromTable(modulo, tableRows, sourceTag) {
    return tableRows.map((item, idx) => {
        const isNA =
            String(item.serie || "").trim().toUpperCase() === "NO APLICA" ||
            String(item.marca || "").trim().toUpperCase() === "NO APLICA" ||
            String(item.estado || "").trim().toLowerCase() === "no aplica";

        return normalizeComponentRecord({
            id: `CMP-${modulo}-E${item.est}-${idx + 1}-${Date.now()}`,
            modulo,
            estacion: item.est,
            tipo_componente: item.tipo,
            marca: isNA ? "NO APLICA" : item.marca,
            modelo: isNA ? "NO APLICA" : item.modelo,
            numero_serie: isNA ? "NO APLICA" : item.serie,
            inventario_ine: isNA || item.inv === "NO APLICA" ? "" : item.inv,
            serie_cpu_vinculada: !isNA && isMonitorType(item.tipo) ? item.cpuVinc : "",
            serie_lente: !isNA && isCameraType(item.tipo) ? item.lente : "",
            serie_docking: !isNA && isLaptopType(item.tipo) ? item.docking : "",
            estado_fisico: isNA ? "No Aplica" : item.estado,
            observaciones: isNA ? "" : item.obs,
            registrado_por: sourceTag,
            fecha_registro: new Date().toLocaleString("es-MX")
        });
    });
}

async function replaceMac050351WithNewTable() {
    const table050351 = [
        { est: 0, tipo: "Computadora / CPU", marca: "Lenovo", modelo: "LENOVO", serie: "J101CBVA", inv: "22-J101CBVA", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Monitor", marca: "Lenovo", modelo: "ThinkVision", serie: "FALTA DATO 01", inv: "22-FALTA DATO 01", cpuVinc: "J101CBVA", lente: "", docking: "", estado: "En Revision", obs: "Estacion 0 - Serie pendiente" },
        { est: 0, tipo: "Camara Fotografica", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 0, tipo: "Pad de Firmas", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 0, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939581299", inv: "971977", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Impresora", marca: "Samsung", modelo: "M4020ND", serie: "ZD7YBJCGC000TEN", inv: "22-882385", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Escaner Digitalizador", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 0, tipo: "Lector QR / Codigo Barras", marca: "Syble", modelo: "SYBLE", serie: "9286360", inv: "22-9286360", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },

        { est: 1, tipo: "Computadora / CPU", marca: "Lenovo", modelo: "LENOVO", serie: "MZ006XB6", inv: "22-MZ006XB6", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Monitor", marca: "Lenovo", modelo: "ThinkVision", serie: "1563EBMARZLAVNAA5DYL", inv: "22-A5DYL", cpuVinc: "MZ006XB6", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Camara Fotografica", marca: "Canon", modelo: "EOS REBEL T7", serie: "182072002447", inv: "22-1119350", cpuVinc: "", lente: "7797051400", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-540", serie: "1AQ0021006261", inv: "20210763", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939653071", inv: "1498521", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Impresora", marca: "Brother", modelo: "HL-L6400DW", serie: "U64185C3N148105", inv: "C-2023-0127", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Escaner Digitalizador", marca: "HP", modelo: "SCANJET2500F1", serie: "CN78GAIOMF", inv: "920941", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Lector QR / Codigo Barras", marca: "Nextep", modelo: "NE-503", serie: "22030479", inv: "C-INE-084-2022-0131", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },

        { est: 2, tipo: "Computadora / CPU", marca: "Lenovo", modelo: "LENOVO", serie: "MZ006X9G", inv: "22-MZ006X9G", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Monitor", marca: "Lenovo", modelo: "ThinkVision", serie: "1563EBMAR2LVNAA7BXD", inv: "22-7BXD", cpuVinc: "MZ006X9G", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Camara Fotografica", marca: "Canon", modelo: "EOS REBEL T7", serie: "182072035453", inv: "22-1119352", cpuVinc: "", lente: "7897038386", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-540", serie: "1AQ00210006264", inv: "20210764", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939591234", inv: "1025911", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Impresora", marca: "Brother", modelo: "HL-L6200DW", serie: "U64180G9N592971", inv: "22-1120418", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Escaner Digitalizador", marca: "Xerox", modelo: "Duplex Combo", serie: "06CUQ30426", inv: "EM-000360", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Lector QR / Codigo Barras", marca: "Datalogic", modelo: "Quickscan QW2100", serie: "G13H03190", inv: "22-G13H03190", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },

        { est: 3, tipo: "Computadora / CPU", marca: "Lenovo", modelo: "LENOVO", serie: "MZ006XB5", inv: "22-MZ006XB5", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 3" },
        { est: 3, tipo: "Monitor", marca: "Lenovo", modelo: "ThinkVision", serie: "FALTA DATO 01-E3", inv: "22-FALTA DATO 01", cpuVinc: "MZ006XB5", lente: "", docking: "", estado: "En Revision", obs: "Estacion 3 - Serie original: FALTA DATO 01" },
        { est: 3, tipo: "Camara Fotografica", marca: "Canon", modelo: "EOS REBEL T7", serie: "182072003396", inv: "22-1119351", cpuVinc: "", lente: "7797057314", docking: "", estado: "Operativo", obs: "Estacion 3" },
        { est: 3, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-540", serie: "1AQ00210006263", inv: "20210765", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 3" },
        { est: 3, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939581300", inv: "971978", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 3" },
        { est: 3, tipo: "Impresora", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 3, tipo: "Escaner Digitalizador", marca: "HP", modelo: "SCANJET2500F1", serie: "CN77UA10MD", inv: "915529", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 3" },
        { est: 3, tipo: "Lector QR / Codigo Barras", marca: "Datalogic", modelo: "Quickscan QW2100", serie: "G13H03199", inv: "22-G13H03199", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 3" },

        { est: 4, tipo: "Computadora / CPU", marca: "Lenovo", modelo: "LENOVO", serie: "MZ006XCH", inv: "22-MZ006XCH", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 4" },
        { est: 4, tipo: "Monitor", marca: "Lenovo", modelo: "ThinkVision", serie: "FALTA DATO 02", inv: "22-FALTA DATO 02", cpuVinc: "MZ006XCH", lente: "", docking: "", estado: "En Revision", obs: "Estacion 4 - Serie pendiente" },
        { est: 4, tipo: "Camara Fotografica", marca: "Canon", modelo: "EOS REBEL T7", serie: "542076008381", inv: "22-1938463", cpuVinc: "", lente: "1839000871", docking: "", estado: "Operativo", obs: "Estacion 4" },
        { est: 4, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-540", serie: "1AQ0021006262", inv: "20210767", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 4" },
        { est: 4, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939581303", inv: "971977", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 4" },
        { est: 4, tipo: "Impresora", marca: "Brother", modelo: "HL-L6400DW", serie: "U64185C3N146921", inv: "C-2023-0127", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 4" },
        { est: 4, tipo: "Escaner Digitalizador", marca: "HP", modelo: "SCANJET2500F1", serie: "CN77UA10MB", inv: "915928", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 4" },
        { est: 4, tipo: "Lector QR / Codigo Barras", marca: "Syble", modelo: "SYBLE", serie: "92868361", inv: "22-92868361", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 4" },

        { est: 5, tipo: "Computadora / CPU", marca: "Lenovo", modelo: "LENOVO", serie: "MZ006XC2", inv: "22-MZ006XC2", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 5" },
        { est: 5, tipo: "Monitor", marca: "Lenovo", modelo: "ThinkVision", serie: "FALTA DATO 03", inv: "22-FALTA DATO 03", cpuVinc: "MZ006XC2", lente: "", docking: "", estado: "En Revision", obs: "Estacion 5 - Serie pendiente" },
        { est: 5, tipo: "Camara Fotografica", marca: "Canon", modelo: "EOS REBEL T7", serie: "542076008341", inv: "22-1938423", cpuVinc: "", lente: "1839003531", docking: "", estado: "Operativo", obs: "Estacion 5" },
        { est: 5, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-540", serie: "1AQ0021006265", inv: "20210766", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 5" },
        { est: 5, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939653070", inv: "1498520", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 5" },
        { est: 5, tipo: "Impresora", marca: "Brother", modelo: "HL-L6400DW", serie: "U64185C3N148136", inv: "C-2023-0125", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 5" },
        { est: 5, tipo: "Escaner Digitalizador", marca: "HP", modelo: "SCANJET2500F1", serie: "CN77UA10RB", inv: "915530", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 5" },
        { est: 5, tipo: "Lector QR / Codigo Barras", marca: "Datalogic", modelo: "Quickscan QW2100", serie: "G13H03198", inv: "22-G13H03198", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 5" },

        { est: 6, tipo: "Computadora / CPU", marca: "Lenovo", modelo: "LENOVO", serie: "MZ006X8C", inv: "22-MZ006X8C", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 6" },
        { est: 6, tipo: "Monitor", marca: "Lenovo", modelo: "ThinkVision", serie: "FALTA DATO 04", inv: "22-FALTA DATO 04", cpuVinc: "MZ006X8C", lente: "", docking: "", estado: "En Revision", obs: "Estacion 6 - Serie pendiente" },
        { est: 6, tipo: "Camara Fotografica", marca: "Canon", modelo: "EOS REBEL T7", serie: "182072002426", inv: "22-1119353", cpuVinc: "", lente: "7797051361", docking: "", estado: "Operativo", obs: "Estacion 6" },
        { est: 6, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-540", serie: "1AQ002100777", inv: "20220020", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 6" },
        { est: 6, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939591235", inv: "1025912", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 6" },
        { est: 6, tipo: "Impresora", marca: "Brother", modelo: "HL-L6200DW", serie: "U64185G9N592966", inv: "22-1120407", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 6" },
        { est: 6, tipo: "Escaner Digitalizador", marca: "HP", modelo: "SCANJET2500F1", serie: "CN75BA1086", inv: "893584", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 6" },
        { est: 6, tipo: "Lector QR / Codigo Barras", marca: "Nextep", modelo: "NE-503", serie: "22030471", inv: "C-INE-084-2022-0129", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 6" },

        { est: 7, tipo: "Computadora / CPU", marca: "Lenovo", modelo: "LENOVO", serie: "MZ006X9Z", inv: "22-MZ006X9Z", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 7" },
        { est: 7, tipo: "Monitor", marca: "Lenovo", modelo: "ThinkVision", serie: "FALTA DATO 05", inv: "22-FALTA DATO 05", cpuVinc: "MZ006X9Z", lente: "", docking: "", estado: "En Revision", obs: "Estacion 7 - Serie pendiente" },
        { est: 7, tipo: "Camara Fotografica", marca: "Canon", modelo: "EOS REBEL T8", serie: "542076008365", inv: "22-1938446", cpuVinc: "", lente: "1839003590", docking: "", estado: "Operativo", obs: "Estacion 7" },
        { est: 7, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-540", serie: "1AQ0021006289", inv: "20220026", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 7" },
        { est: 7, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939681297", inv: "971976", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 7" },
        { est: 7, tipo: "Impresora", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 7, tipo: "Escaner Digitalizador", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 7, tipo: "Lector QR / Codigo Barras", marca: "Syble", modelo: "SYBLE", serie: "92770092", inv: "22-92770092", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 7" }
    ];

    const otherModulesComponents = appState.componentes.filter(c => c.modulo !== "050351");
    const new050351Components = buildComponentsFromTable("050351", table050351, "Carga Tabla 050351");

    appState.estaciones["050351"] = Math.max(7, Number(appState.estaciones["050351"] ?? 7));
    new050351Components.forEach(c => {
        if (!isNoAplicaComponent(c) && c.marca && !appState.marcas.some(m => m.toLowerCase() === c.marca.toLowerCase())) {
            appState.marcas.push(c.marca);
        }
        if (c.tipo_componente && !appState.tipos_componente.some(t => t.toLowerCase() === c.tipo_componente.toLowerCase())) {
            appState.tipos_componente.push(c.tipo_componente);
        }
    });

    appState.componentes = [...otherModulesComponents, ...new050351Components];
    await saveState();
    if (currentUser && currentUser.role === "admin") refreshAdminUI({ preserveSelection: true });
    alert(`Listo: se cargaron ${countRealComponents(new050351Components)} equipos reales del MAC 050351 (Estaciones 0 a 7).`);
}

async function replaceMac050353WithNewTable() {
    const table050353 = [
        { est: 0, tipo: "Laptop", marca: "Lenovo", modelo: "THINK PAD", serie: "PW0ADNN0", inv: "22-PW0ADNN0", cpuVinc: "", lente: "", docking: "ZVQ1GKN6", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Camara Fotografica", marca: "Canon", modelo: "EOS REBEL T3", serie: "322174038405", inv: "698585", cpuVinc: "", lente: "747048982", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-540", serie: "1AQ0021006292", inv: "20220027", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939653073", inv: "1498523", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Impresora", marca: "Brother", modelo: "HL-L6400DW", serie: "U64185C3N146918", inv: "C-2023-0129", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Escaner Digitalizador", marca: "HP", modelo: "SCANJET2500F1", serie: "CN75BA107F", inv: "893585", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Lector QR / Codigo Barras", marca: "Syble", modelo: "QCPASS", serie: "92770091", inv: "22-92770091", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },

        { est: 1, tipo: "Laptop", marca: "Lenovo", modelo: "THINK PAD", serie: "PW0ADNGF", inv: "22-PW0ADNGF", cpuVinc: "", lente: "", docking: "ZVQ1GKLQ", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Camara Fotografica", marca: "Canon", modelo: "EOS REBEL T7", serie: "542076008401", inv: "1938477", cpuVinc: "", lente: "1839000903", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-540", serie: "1AQ0021006291", inv: "20220028", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939591237", inv: "1025910", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Impresora", marca: "Brother", modelo: "HL-L6400DW", serie: "U64185M2N935019", inv: "C-2023-0128", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Escaner Digitalizador", marca: "Xerox", modelo: "LEX COMBO", serie: "06CUQ30558", inv: "202100013", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Lector QR / Codigo Barras", marca: "Nextep", modelo: "NE-503", serie: "22030448", inv: "22-22030448", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },

        { est: 2, tipo: "Laptop", marca: "Lenovo", modelo: "THINK PAD", serie: "PW0ADNNB", inv: "22-PW0ADNNB", cpuVinc: "", lente: "", docking: "ZVQ1GEFW", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Camara Fotografica", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 2, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-500B", serie: "3LZT001600", inv: "22-FALTA DATO01", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2 - Inv. pendiente: 22-FALTA DATO01" },
        { est: 2, tipo: "Escaner de Huellas", marca: "Morpho", modelo: "IDEMIA MORPHO TOP", serie: "1826S002646", inv: "853342", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Impresora", marca: "Brother", modelo: "HL-L6200DW", serie: "U6418G9N592969", inv: "C-2023-0129", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Escaner Digitalizador", marca: "HP", modelo: "SCANJET2500F1", serie: "CN75BA107K", inv: "893586", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Lector QR / Codigo Barras", marca: "Syble", modelo: "QCPASS", serie: "92770093", inv: "22-893586", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },

        { est: 3, tipo: "Laptop", marca: "Lenovo", modelo: "THINK PAD", serie: "PW0ADNN7", inv: "22-PW0ADNN7", cpuVinc: "", lente: "", docking: "FALTA DATO", estado: "Operativo", obs: "Estacion 3 - Docking pendiente" },
        { est: 3, tipo: "Camara Fotografica", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 3, tipo: "Pad de Firmas", marca: "Generico", modelo: "FALTA DATO", serie: "FALTA DATO-050353-E3", inv: "FALTA DATO", cpuVinc: "", lente: "", docking: "", estado: "En Revision", obs: "Estacion 3 - Datos pendientes (FALTA DATO)" },
        { est: 3, tipo: "Escaner de Huellas", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 3, tipo: "Impresora", marca: "Samsung", modelo: "M4020ND", serie: "ZD7YBJCGC000SFA", inv: "C-2023-0130", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 3" },
        { est: 3, tipo: "Escaner Digitalizador", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 3, tipo: "Lector QR / Codigo Barras", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" }
    ];

    const otherModulesComponents = appState.componentes.filter(c => c.modulo !== "050353");
    const new050353Components = buildComponentsFromTable("050353", table050353, "Carga Tabla 050353");

    appState.estaciones["050353"] = Math.max(3, Number(appState.estaciones["050353"] ?? 3));
    new050353Components.forEach(c => {
        if (!isNoAplicaComponent(c) && c.marca && !appState.marcas.some(m => m.toLowerCase() === c.marca.toLowerCase())) {
            appState.marcas.push(c.marca);
        }
        if (c.tipo_componente && !appState.tipos_componente.some(t => t.toLowerCase() === c.tipo_componente.toLowerCase())) {
            appState.tipos_componente.push(c.tipo_componente);
        }
    });

    appState.componentes = [...otherModulesComponents, ...new050353Components];
    await saveState();
    if (currentUser && currentUser.role === "admin") refreshAdminUI({ preserveSelection: true });
    alert(`Listo: se cargaron ${countRealComponents(new050353Components)} equipos reales del MAC 050353 (Estaciones 0 a 3).`);
}

async function replaceMac050354WithNewTable() {
    const table050354 = [
        { est: 0, tipo: "Laptop", marca: "Lenovo", modelo: "Lenovo", serie: "PW-0ADNMX", inv: "22-PW-0ADNMX", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Camara Fotografica", marca: "Canon", modelo: "EOS REBEL T7", serie: "542076008407", inv: "1938483", cpuVinc: "", lente: "1839000909", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-540", serie: "1AQ0021006290", inv: "20210771", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939585760", inv: "1025913", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Impresora", marca: "Brother", modelo: "HL-L6400DW", serie: "U64185C3N146912", inv: "C-2023-0131", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Escaner Digitalizador", marca: "Xerox", modelo: "duplex combo CSANNR", serie: "06CUQ30488", inv: "202100012", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Lector QR / Codigo Barras", marca: "Nextep", modelo: "NE-503", serie: "22030449", inv: "20220136", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },

        { est: 1, tipo: "Laptop", marca: "Lenovo", modelo: "Lenovo", serie: "PW-0ADNSE", inv: "22-PW-0ADNSE", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Camara Fotografica", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 1, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-540", serie: "1AQ0021006286", inv: "20210772", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939653074", inv: "1498524", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Impresora", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 1, tipo: "Escaner Digitalizador", marca: "Xerox", modelo: "duplex combo CSANNR", serie: "06CUQ30601", inv: "202100014", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Lector QR / Codigo Barras", marca: "Syble", modelo: "SYBLE", serie: "92770108", inv: "22-92770108", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },

        { est: 2, tipo: "Laptop", marca: "Lenovo", modelo: "Lenovo", serie: "PW-0ADNVL", inv: "22-PW-0ADNVL", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Camara Fotografica", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 2, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-500B", serie: "3LZT001758", inv: "850727", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Escaner de Huellas", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 2, tipo: "Impresora", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 2, tipo: "Escaner Digitalizador", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 2, tipo: "Lector QR / Codigo Barras", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" }
    ];

    const otherModulesComponents = appState.componentes.filter(c => c.modulo !== "050354");
    const new050354Components = buildComponentsFromTable("050354", table050354, "Carga Tabla 050354");

    appState.estaciones["050354"] = Math.max(2, Number(appState.estaciones["050354"] ?? 2));
    new050354Components.forEach(c => {
        if (!isNoAplicaComponent(c) && c.marca && !appState.marcas.some(m => m.toLowerCase() === c.marca.toLowerCase())) {
            appState.marcas.push(c.marca);
        }
        if (c.tipo_componente && !appState.tipos_componente.some(t => t.toLowerCase() === c.tipo_componente.toLowerCase())) {
            appState.tipos_componente.push(c.tipo_componente);
        }
    });

    appState.componentes = [...otherModulesComponents, ...new050354Components];
    await saveState();
    if (currentUser && currentUser.role === "admin") refreshAdminUI({ preserveSelection: true });
    alert(`Listo: se cargaron ${countRealComponents(new050354Components)} equipos reales del MAC 050354 (Estaciones 0 a 2).`);
}

// ==================== PLANTILLA, IMPORTACIÓN Y EXPORTACIÓN EXCEL (.XLSX / .CSV) ====================
function downloadImportTemplate() {
    const sampleRows = [
        {
            "modulo": "050351",
            "estacion": 0,
            "tipo_componente": "Computadora / CPU",
            "marca": "Lenovo",
            "modelo": "LENOVO",
            "numero_serie": "J101CBVA",
            "inventario_ine": "22-J101CBVA",
            "serie_cpu_vinculada": "",
            "serie_lente": "",
            "serie_docking": "",
            "estado_fisico": "Operativo",
            "observaciones": "Estacion 0"
        },
        {
            "modulo": "050351",
            "estacion": 1,
            "tipo_componente": "Monitor",
            "marca": "Lenovo",
            "modelo": "ThinkVision",
            "numero_serie": "1563EBMARZLAVNAA5DYL",
            "inventario_ine": "22-A5DYL",
            "serie_cpu_vinculada": "MZ006XB6",
            "serie_lente": "",
            "serie_docking": "",
            "estado_fisico": "Operativo",
            "observaciones": "Estacion 1"
        },
        {
            "modulo": "050351",
            "estacion": 1,
            "tipo_componente": "Camara Fotografica",
            "marca": "Canon",
            "modelo": "EOS REBEL T7",
            "numero_serie": "182072002447",
            "inventario_ine": "22-1119350",
            "serie_cpu_vinculada": "",
            "serie_lente": "7797051400",
            "serie_docking": "",
            "estado_fisico": "Operativo",
            "observaciones": "Estacion 1"
        },
        {
            "modulo": "050353",
            "estacion": 0,
            "tipo_componente": "Laptop",
            "marca": "Lenovo",
            "modelo": "THINK PAD",
            "numero_serie": "PW0ADNN0",
            "inventario_ine": "22-PW0ADNN0",
            "serie_cpu_vinculada": "",
            "serie_lente": "",
            "serie_docking": "ZVQ1GKN6",
            "estado_fisico": "Operativo",
            "observaciones": "Estacion 0"
        }
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    ws["!cols"] = [
        { wch: 10 }, { wch: 10 }, { wch: 24 }, { wch: 15 },
        { wch: 20 }, { wch: 24 }, { wch: 18 }, { wch: 22 },
        { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 25 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "plantilla_importacion");
    XLSX.writeFile(wb, "plantilla_importacion_macs.xlsx");
}

function parseStationFromExcel(val) {
    if (typeof val === "number") return Math.max(0, Math.floor(val));
    const txt = String(val ?? "").trim().toLowerCase();
    if (!txt || txt === "0" || txt.includes("servidor")) return 0;
    const match = txt.match(/(\d+)/);
    return match ? Number(match[1]) : 0;
}

async function importInventoryExcel(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });

        if (!rows.length) {
            alert("El archivo no contiene filas de datos.");
            event.target.value = "";
            return;
        }

        let added = 0;
        let skippedDup = 0;
        let invalidRows = 0;

        for (const raw of rows) {
            const moduloRaw = String(raw["modulo"] ?? raw["Modulo"] ?? raw["Módulo"] ?? "").trim();
            const modulo = moduloRaw.padStart(6, "0");
            const estacion = parseStationFromExcel(raw["estacion"] ?? raw["Estacion"] ?? raw["Estación"]);
            const tipo_componente = String(raw["tipo_componente"] ?? raw["Tipo"] ?? raw["Componente"] ?? "").trim() || "Computadora / CPU";
            const marcaRaw = String(raw["marca"] ?? raw["Marca"] ?? "Generico").trim() || "Generico";
            const estadoRaw = String(raw["estado_fisico"] ?? raw["Estado"] ?? "").trim();
            const serieRaw = String(raw["numero_serie"] ?? raw["Serie"] ?? raw["Número de Serie"] ?? "").trim().toUpperCase();

            const isNA =
                marcaRaw.toUpperCase() === "NO APLICA" ||
                estadoRaw.toLowerCase() === "no aplica" ||
                serieRaw === "NO APLICA";

            if (!["050351", "050353", "050354"].includes(modulo)) {
                invalidRows++;
                continue;
            }

            if (!isNA && !serieRaw) {
                invalidRows++;
                continue;
            }

            if (!isNA) {
                const exists = appState.componentes.some(c => !isNoAplicaComponent(c) && c.numero_serie === serieRaw);
                if (exists) {
                    skippedDup++;
                    continue;
                }
            }

            const marca = isNA ? "NO APLICA" : marcaRaw;
            const modelo = isNA ? "NO APLICA" : (String(raw["modelo"] ?? raw["Modelo"] ?? "N/A").trim() || "N/A");
            const numero_serie = isNA ? "NO APLICA" : serieRaw;
            const inventario_ine = isNA ? "" : String(raw["inventario_ine"] ?? raw["InventarioINE"] ?? raw["Inventario INE"] ?? "").trim().toUpperCase();
            const serie_cpu_vinculada = isNA ? "" : String(raw["serie_cpu_vinculada"] ?? raw["SerieCpuVinculada"] ?? "").trim().toUpperCase();
            const serie_lente = isNA ? "" : String(raw["serie_lente"] ?? raw["SerieLente"] ?? "").trim().toUpperCase();
            const serie_docking = isNA ? "" : String(raw["serie_docking"] ?? raw["SerieDocking"] ?? "").trim().toUpperCase();
            const observaciones = isNA ? "" : String(raw["observaciones"] ?? raw["Notas"] ?? "").trim();

            let estado_fisico = "No Aplica";
            if (!isNA) {
                const validStates = ["Operativo", "Stock", "En Falla", "En Revision", "En Revisión", "Baja"];
                estado_fisico = validStates.includes(estadoRaw) ? estadoRaw : "Operativo";
            }

            if (!isNA && marca && !appState.marcas.some(b => b.toLowerCase() === marca.toLowerCase())) {
                appState.marcas.push(marca);
            }
            if (tipo_componente && !appState.tipos_componente.some(t => t.toLowerCase() === tipo_componente.toLowerCase())) {
                appState.tipos_componente.push(tipo_componente);
            }

            const maxEst = Number(appState.estaciones[modulo] ?? 0);
            if (estacion > maxEst) {
                appState.estaciones[modulo] = estacion;
            }

            appState.componentes.push(normalizeComponentRecord({
                id: "CMP-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
                modulo,
                estacion,
                tipo_componente,
                marca,
                modelo,
                numero_serie,
                inventario_ine,
                serie_cpu_vinculada: !isNA && isMonitorType(tipo_componente) ? serie_cpu_vinculada : "",
                serie_lente: !isNA && isCameraType(tipo_componente) ? serie_lente : "",
                serie_docking: !isNA && isLaptopType(tipo_componente) ? serie_docking : "",
                estado_fisico,
                observaciones,
                foto_url: "",
                registrado_por: "Importacion Excel",
                fecha_registro: new Date().toLocaleString("es-MX")
            }));
            added++;
        }

        if (added > 0) {
            await saveState();
            refreshAdminUI({ preserveSelection: true });
        }

        alert(
            `Importacion finalizada:\n` +
            `• Registros procesados: ${added}\n` +
            `• Omitidos por serie duplicada: ${skippedDup}\n` +
            `• Filas incompletas/invalidas: ${invalidRows}`
        );
    } catch (err) {
        console.error("Error al importar archivo:", err);
        alert("No se pudo leer el archivo. Verifica que sea un .xlsx, .xls o .csv valido.");
    } finally {
        event.target.value = "";
    }
}

function exportInventoryExcel() {
    if (appState.componentes.length === 0) {
        alert("No hay componentes registrados para exportar.");
        return;
    }

    const rows = appState.componentes.map((c, idx) => {
        const op = getOperatorByStation(c.modulo, c.estacion);
        const isNA = isNoAplicaComponent(c);
        return {
            "num": idx + 1,
            "modulo": c.modulo,
            "estacion": formatStationLabel(c.estacion),
            "usuario_responsable": op ? op.nombre_completo : "Sin asignar",
            "telefono": op ? op.telefono : "",
            "correo_institucional": op ? op.correo_institucional : "",
            "tipo_componente": c.tipo_componente,
            "marca": isNA ? "NO APLICA" : c.marca,
            "modelo": isNA ? "NO APLICA" : c.modelo,
            "numero_serie": isNA ? "NO APLICA" : c.numero_serie,
            "inventario_ine": isNA ? "" : (c.inventario_ine || ""),
            "serie_cpu_vinculada": isNA ? "" : (c.serie_cpu_vinculada || ""),
            "serie_lente": isNA ? "" : (c.serie_lente || ""),
            "serie_docking": isNA ? "" : (c.serie_docking || ""),
            "estado_fisico": isNA ? "No Aplica" : c.estado_fisico,
            "registrado_por": c.registrado_por || "Administrador",
            "observaciones": isNA ? "No aplica (sin equipo)" : (c.observaciones || ""),
            "fecha_registro": c.fecha_registro || ""
        };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
        { wch: 6 }, { wch: 12 }, { wch: 22 }, { wch: 28 }, { wch: 16 },
        { wch: 28 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 24 },
        { wch: 20 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 14 },
        { wch: 22 }, { wch: 25 }, { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "inventario_componentes");

    if (appState.operadores.length > 0) {
        const opRows = appState.operadores.map((o, i) => ({
            "num": i + 1,
            "modulo": o.modulo,
            "estacion": formatStationLabel(o.estacion),
            "rol": Number(o.estacion) === 0 ? "Responsable de Modulo" : "Operador",
            "nombre_completo": o.nombre_completo,
            "telefono": o.telefono,
            "correo_institucional": o.correo_institucional
        }));
        const wsOp = XLSX.utils.json_to_sheet(opRows);
        XLSX.utils.book_append_sheet(wb, wsOp, "operadores_responsables");
    }

    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `inventario_componentes_macs_${fecha}.xlsx`);
}

function exportFaultsExcel() {
    if (appState.tickets_fallas.length === 0) {
        alert("No hay tickets ni reportes de falla para exportar.");
        return;
    }

    const rows = appState.tickets_fallas.map((f, i) => ({
        "num": i + 1,
        "folio_ticket": f.folio_ticket,
        "fecha_reporte": f.fecha_reporte,
        "modulo": f.modulo,
        "estacion": formatStationLabel(f.estacion),
        "usuario_nombre": f.usuario_nombre,
        "usuario_telefono": f.usuario_telefono,
        "usuario_correo": f.usuario_correo,
        "tipo_componente": f.tipo_componente,
        "marca_modelo": `${f.marca} ${f.modelo}`,
        "numero_serie": f.numero_serie,
        "categoria_falla": f.categoria_falla,
        "descripcion_falla": f.descripcion_falla,
        "estatus_ticket": f.estatus_ticket,
        "fecha_cierre": f.fecha_cierre || "Pendiente",
        "tecnico_responsable": f.tecnico_responsable || "",
        "tipo_solucion": f.tipo_solucion || "",
        "notas_seguimiento": f.notas_seguimiento || ""
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
        { wch: 6 }, { wch: 22 }, { wch: 18 }, { wch: 10 }, { wch: 22 },
        { wch: 26 }, { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 20 },
        { wch: 20 }, { wch: 22 }, { wch: 35 }, { wch: 22 }, { wch: 18 },
        { wch: 24 }, { wch: 24 }, { wch: 35 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "tickets_fallas");
    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `tickets_fallas_macs_${fecha}.xlsx`);
}

// ==================== IMPRESIÓN LIMPIA DE REPORTES ====================
function printReportArea() {
    const sourceEl = document.getElementById("printFormatArea");
    if (!sourceEl || !sourceEl.innerHTML.trim()) {
        alert("No hay contenido de reporte listo para imprimir.");
        return;
    }

    let printHost = document.getElementById("printSheetContainer");
    if (!printHost) {
        printHost = document.createElement("div");
        printHost.id = "printSheetContainer";
        document.body.appendChild(printHost);
    }

    printHost.innerHTML = sourceEl.innerHTML;

    let cleaned = false;
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        if (printHost) printHost.innerHTML = "";
        window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);

    setTimeout(() => {
        window.print();
        setTimeout(cleanup, 1000);
    }, 80);
}

// ==================== EXPOSICIÓN GLOBAL PARA EVENTOS HTML ====================
Object.assign(window, {
    switchLoginTab,
    onLoginModuloChange,
    previewOperatorProfile,
    loginAsOperator,
    loginAsAdmin,
    logout,
    switchOpTab,
    openComponentModal,
    saveComponentFromModal,
    onModalBrandOrTypeChange,
    onCompCpuSelectChange,
    editComponentById,
    switchAdminTab,
    onAdminCompModuloChange,
    onAdminStationOrBrandChange,
    updateCompAssignedOperatorHint,
    deleteComponent,
    renderAdminInventoryGrouped,
    onStockStatusChange,
    onStockDesincChange,
    openStockModal,
    editStockById,
    saveStockFromModal,
    deleteStockItem,
    markStockAsDesincorporated,
    renderAdminStockTable,
    exportStockExcel,
    openMoveToStockModal,
    onMtsStatusChange,
    confirmMoveComponentToStock,
    onTransferSourceChange,
    onTransferComponentSelected,
    onTransferActionChange,
    onTransferTargetModuloChange,
    updateTransferTargetHint,
    onTrStockStatusChange,
    submitDirectTransfer,
    openPrintTransferFormat,
    onOpRegModuloChange,
    updateOpRoleHint,
    saveOperator,
    editOperator,
    resetOperatorForm,
    deleteOperator,
    renderOperatorsTable,
    saveStationCounts,
    addCatalogItem,
    removeCatalogItem,
    openReportFaultModal,
    submitFaultReport,
    openResolveFaultModal,
    submitResolveFault,
    openPrintFaultFormat,
    printReportArea,
    openScanner,
    closeScanner,
    replaceMac050351WithNewTable,
    replaceMac050353WithNewTable,
    replaceMac050354WithNewTable,
    previewImageFile,
    clearImageField,
    showPhotoModal,
    downloadImportTemplate,
    importInventoryExcel,
    exportInventoryExcel,
    exportFaultsExcel
});
