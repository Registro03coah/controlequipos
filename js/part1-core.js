import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore,
    doc,
    setDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ==================== CONFIGURACIÓN FIREBASE Y AUTENTICACIÓN ====================
const firebaseConfig = {
    apiKey: "AIzaSyDfcsDQIJeUXVMMe0k32YelDKv5krbO1M0",
    authDomain: "componentes-45e77.firebaseapp.com",
    projectId: "componentes-45e77",
    storageBucket: "componentes-45e77.firebasestorage.app",
    messagingSenderId: "540395896737",
    appId: "1:540395896737:web:6ebc5f5de08854751a55e0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const STATE_DOC_REF = doc(db, "macs_sistema", "estado_global_v1");

export { db, STATE_DOC_REF, setDoc, onSnapshot };

const LOCAL_CACHE_KEY = "mac_inventario_cache_d03_v1";
const SESSION_STORAGE_KEY = "mac_inventario_session_v1";

export const ADMIN_PASS = "admin123";
export const DEFAULT_ADMIN_PASS = ADMIN_PASS;

export const DEFAULT_AVATAR = "data:image/svg+xml;utf8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <rect width="120" height="120" rx="60" fill="#e2e8f0"/>
  <circle cx="60" cy="45" r="21" fill="#64748b"/>
  <path d="M22 104c4-20 20-32 38-32s34 12 38 32" fill="#64748b"/>
</svg>
`);

export const DISTRICT_AREAS = [
    { key: "vrfe", label: "VRFE (Vocalía del RFE)", shortLabel: "VRFE", defaultSlots: 3, slotPrefix: "Integrante / Puesto" },
    { key: "josa", label: "JOSA (Junta / Organización)", shortLabel: "JOSA", defaultSlots: 3, slotPrefix: "Integrante / Puesto" },
    { key: "verificador_campo", label: "Verificador de Campo", shortLabel: "Verificador de Campo", defaultSlots: 4, slotPrefix: "Verificador" },
    { key: "soporte_tecnico", label: "Soporte Técnico", shortLabel: "Soporte Técnico", defaultSlots: 2, slotPrefix: "Soporte" },
    { key: "cartografia", label: "Cartografía", shortLabel: "Cartografía", defaultSlots: 3, slotPrefix: "Cartografía" }
];

export const MAC_MODULES = ["050351", "050353", "050354"];

// ==================== ESTADO GLOBAL Y MUTADORES ====================
export const DEFAULT_STATE = {
    estaciones: {
        "050351": 7,
        "050353": 3,
        "050354": 2
    },
    config_estaciones: {
        "050351": 7,
        "050353": 3,
        "050354": 2
    },
    areas_distritales: {
        vrfe: 1,
        josa: 1,
        verificador_campo: 1,
        soporte_tecnico: 1,
        cartografia: 2
    },
    marcas: [
        "NO APLICA",
        "Dell",
        "HP",
        "Lenovo",
        "Canon",
        "Epson",
        "Brother",
        "Cisco",
        "Yealink",
        "Grandstream",
        "Samsung",
        "Huawei",
        "Garmin",
        "Trimble",
        "Zebra",
        "Honeywell",
        "APC",
        "Generico"
    ],
    tipos_componente: [
        "Computadora / CPU",
        "Laptop",
        "Monitor",
        "Teclado",
        "Mouse",
        "Impresora",
        "Escaner / Scanner",
        "Camara / Biometrico",
        "Lector de Huella / Firma",
        "No Break / UPS",
        "Switch / Red",
        "Telefono IP",
        "Tableta",
        "GPS"
    ],
    operadores: [],
    componentes: [],
    stock_resguardo: [],
    tickets_fallas: [],
    historial_traspasos: []
};

export let appState = cloneDefaultState();
export let currentUser = null;
export let activeOpTab = "equipos";
export let activeAdminTab = "inventario";

export let html5QrCode = null;
export let targetScannerInputId = "compSerie";
export let currentCompPhoto = "";
export let currentOpPhoto = "";
export let currentFaultPhoto = "";

export function setCurrentUser(val) {
    currentUser = val;
    window.currentUser = val;
}

export function setActiveOpTab(tab) {
    activeOpTab = tab || "equipos";
}

export function setActiveAdminTab(tab) {
    activeAdminTab = tab || "inventario";
}

export function setHtml5QrCode(scanner) {
    html5QrCode = scanner;
}

export function setTargetScannerInputId(id) {
    targetScannerInputId = id;
}

export function setCurrentCompPhoto(dataUrl) {
    currentCompPhoto = dataUrl || "";
}

export function setCurrentOpPhoto(dataUrl) {
    currentOpPhoto = dataUrl || "";
}

export function setCurrentFaultPhoto(dataUrl) {
    currentFaultPhoto = dataUrl || "";
}

function cloneDefaultState() {
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

export function persistSession() {
    try {
        if (!currentUser) {
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
            return;
        }
        if (currentUser.role === "admin") {
            sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
                role: "admin",
                admTab: activeAdminTab || "inventario"
            }));
        } else if (currentUser.role === "operator") {
            sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
                role: "operator",
                modulo: normalizeUnitKey(currentUser.modulo),
                estacion: Number(currentUser.estacion),
                opTab: activeOpTab || "equipos"
            }));
        }
    } catch (_) {}
}

// ==================== NORMALIZACIÓN DE TEXTO Y UNIDADES (MAC / ÁREAS) ====================
export function normalizeText(str) {
    return String(str || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

export function sortAlphaEs(arr) {
    return [...(arr || [])].sort((a, b) =>
        String(a || "").localeCompare(String(b || ""), "es", { sensitivity: "base", numeric: true })
    );
}

export function normalizeUnitKey(val) {
    const raw = String(val || "").trim();
    if (!raw) return "050351";
    if (raw === "500351") return "050351";
    if (MAC_MODULES.includes(raw)) return raw;

    const norm = normalizeText(raw).replace(/[\s-]+/g, "_");
    if (norm === "050351" || norm === "50351" || norm === "500351" || norm.includes("050351")) return "050351";
    if (norm === "050353" || norm === "50353" || norm.includes("050353")) return "050353";
    if (norm === "050354" || norm === "50354" || norm.includes("050354")) return "050354";

    if (norm === "vrfe" || norm.includes("vocalia")) return "vrfe";
    if (norm === "josa" || norm.includes("organizacion")) return "josa";
    if (norm.includes("verificador") || norm.includes("campo")) return "verificador_campo";
    if (norm.includes("soporte") || norm.includes("tecnico")) return "soporte_tecnico";
    if (norm.includes("cartografia")) return "cartografia";

    return raw;
}

export function isDistrictArea(unitKey) {
    const key = normalizeUnitKey(unitKey);
    return DISTRICT_AREAS.some(a => a.key === key);
}

export function getDistrictAreaMeta(unitKey) {
    const key = normalizeUnitKey(unitKey);
    return DISTRICT_AREAS.find(a => a.key === key) || null;
}

export function formatUnitLabel(unitKey, { short = false } = {}) {
    const key = normalizeUnitKey(unitKey);
    if (MAC_MODULES.includes(key)) {
        return short ? `MAC ${key}` : `Módulo ${key}`;
    }
    const meta = getDistrictAreaMeta(key);
    if (meta) {
        return short ? meta.shortLabel : meta.label;
    }
    return key;
}

export function populateUnitSelect(selectEl, { includeAll = false, allLabel = "Todos los Módulos y Áreas" } = {}) {
    if (!selectEl) return;
    const prevVal = normalizeUnitKey(selectEl.value || "");
    const options = [];

    if (includeAll) {
        options.push(`<option value="ALL">${allLabel}</option>`);
    }

    MAC_MODULES.forEach(m => {
        options.push(`<option value="${m}">${formatUnitLabel(m)}</option>`);
    });

    DISTRICT_AREAS.forEach(area => {
        options.push(`<option value="${area.key}">${area.label}</option>`);
    });

    selectEl.innerHTML = options.join("");

    if (includeAll && (selectEl.value === "ALL" || !prevVal)) {
        selectEl.value = "ALL";
    } else if (prevVal && [...selectEl.options].some(o => o.value === prevVal)) {
        selectEl.value = prevVal;
    } else if (!includeAll && selectEl.options.length > 0) {
        selectEl.value = selectEl.options[0].value;
    }
}

// ==================== ESTACIONES / PUESTOS Y OPERADORES ====================
export function getConfiguredStationsCount(unitKey) {
    const key = normalizeUnitKey(unitKey);
    if (isDistrictArea(key)) {
        const meta = getDistrictAreaMeta(key);
        const val = Number(appState.areas_distritales?.[key]);
        return Number.isFinite(val) && val > 0 ? Math.floor(val) : (meta ? meta.defaultSlots : 2);
    }
    const val = Number(appState.estaciones?.[key] ?? appState.config_estaciones?.[key] ?? 0);
    return Number.isFinite(val) && val >= 0 ? Math.floor(val) : 0;
}

export function getTotalConfiguredStations() {
    const macTotal = MAC_MODULES.reduce((acc, m) => acc + 1 + getConfiguredStationsCount(m), 0);
    const areaTotal = DISTRICT_AREAS.reduce((acc, a) => acc + Math.max(1, getConfiguredStationsCount(a.key)), 0);
    return macTotal + areaTotal;
}

export function formatStationLabel(estacion, includeRoleHint = false, unitKey = "") {
    const estNum = Number(estacion);
    const key = normalizeUnitKey(unitKey);
    const areaMeta = getDistrictAreaMeta(key);

    if (areaMeta) {
        const slotNum = estNum <= 0 ? 1 : estNum;
        const base = `${areaMeta.shortLabel} • ${areaMeta.slotPrefix} ${slotNum}`;
        if (!includeRoleHint) return base;
        const op = getOperatorByStation(key, slotNum);
        return op ? `${base} (${op.nombre_completo})` : base;
    }

    if (estNum === 0) {
        return includeRoleHint ? "Estación 0 • Servidor / Resp. Módulo" : "Estación 0 • Servidor";
    }
    const base = `Estación ${estNum}`;
    if (!includeRoleHint) return base;
    const op = getOperatorByStation(key, estNum);
    return op ? `${base} (${op.nombre_completo})` : base;
}

export function fillStationOptions(selectEl, unitKey, { includeRoleHint = false, onlyUserName = false, selectedValue = null } = {}) {
    if (!selectEl) return;
    const key = normalizeUnitKey(unitKey);
    const count = getConfiguredStationsCount(key);
    const options = [];

    const buildLabel = (slotNum) => {
        if (onlyUserName) {
            const op = getOperatorByStation(key, slotNum);
            const base = formatStationLabel(slotNum, false, key);
            return op ? `${op.nombre_completo} — ${base}` : `${base} (Sin asignar)`;
        }
        return formatStationLabel(slotNum, includeRoleHint, key);
    };

    if (isDistrictArea(key)) {
        const totalSlots = Math.max(1, count);
        for (let i = 1; i <= totalSlots; i++) {
            options.push(`<option value="${i}">${buildLabel(i)}</option>`);
        }
    } else {
        options.push(`<option value="0">${buildLabel(0)}</option>`);
        for (let i = 1; i <= count; i++) {
            options.push(`<option value="${i}">${buildLabel(i)}</option>`);
        }
    }

    selectEl.innerHTML = options.join("");

    const targetVal = selectedValue !== null && selectedValue !== undefined
        ? String(Number(selectedValue))
        : (isDistrictArea(key) ? "1" : "0");

    if ([...selectEl.options].some(o => o.value === targetVal)) {
        selectEl.value = targetVal;
    } else if (selectEl.options.length > 0) {
        selectEl.value = selectEl.options[0].value;
    }
}

export function getOperatorByStation(unitKey, estacion) {
    const key = normalizeUnitKey(unitKey);
    const estNum = Number(estacion);
    return (appState.operadores || []).find(
        op => normalizeUnitKey(op.modulo) === key && Number(op.estacion) === estNum
    ) || null;
}

export function normalizeOperatorRecord(rec) {
    const modulo = normalizeUnitKey(rec.modulo);
    const estacion = Number.isFinite(Number(rec.estacion)) ? Number(rec.estacion) : (isDistrictArea(modulo) ? 1 : 0);
    return {
        id: rec.id || ("OP-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5)),
        modulo,
        estacion,
        nombre_completo: String(rec.nombre_completo || "").trim(),
        telefono: String(rec.telefono || "").trim(),
        correo_institucional: String(rec.correo_institucional || "").trim().toLowerCase(),
        foto_url: rec.foto_url || ""
    };
}

export function normalizeFaultTicketRecord(rec) {
    const modulo = normalizeUnitKey(rec.modulo);
    const estacion = Number.isFinite(Number(rec.estacion)) ? Number(rec.estacion) : (isDistrictArea(modulo) ? 1 : 0);
    return {
        id: rec.id || ("FLT-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5)),
        folio_ticket: rec.folio_ticket || ("TKT-" + Date.now()),
        fecha_reporte: rec.fecha_reporte || new Date().toLocaleString("es-MX"),
        modulo,
        estacion,
        usuario_nombre: rec.usuario_nombre || rec.operador_nombre || "Usuario",
        usuario_telefono: rec.usuario_telefono || "N/A",
        usuario_correo: rec.usuario_correo || rec.operador_correo || "N/A",
        componente_id: rec.componente_id || "",
        tipo_componente: rec.tipo_componente || "Equipo",
        marca: rec.marca || "",
        modelo: rec.modelo || "",
        numero_serie: String(rec.numero_serie || "").trim().toUpperCase(),
        categoria_falla: rec.categoria_falla || "Falla Tecnica",
        descripcion_falla: rec.descripcion_falla || "",
        foto_evidencia: rec.foto_evidencia || "",
        estatus_ticket: rec.estatus_ticket || "Ticket Abierto / Pendiente",
        fecha_cierre: rec.fecha_cierre || "",
        tecnico_responsable: rec.tecnico_responsable || rec.tecnico_solucion || "",
        tipo_solucion: rec.tipo_solucion || rec.accion_solucion || "",
        notas_seguimiento: rec.notas_seguimiento || rec.notas_solucion || ""
    };
}

// ==================== COMPONENTES, ÍCONOS Y NORMALIZACIÓN ====================
export function isNoAplicaComponent(comp) {
    if (!comp) return false;
    const marca = normalizeText(comp.marca);
    const modelo = normalizeText(comp.modelo);
    const serie = String(comp.numero_serie || "").trim().toUpperCase();
    const estado = normalizeText(comp.estado_fisico);
    return (
        marca === "no aplica" ||
        estado === "no aplica" ||
        serie === "NO APLICA" ||
        serie.startsWith("NA-") ||
        (marca === "no aplica" && modelo === "no aplica")
    );
}

export function countRealComponents(list) {
    return (list || []).filter(c => !isNoAplicaComponent(c)).length;
}

export function isMonitorType(tipo) {
    const t = normalizeText(tipo);
    return t.includes("monitor") || t.includes("pantalla") || t.includes("display");
}

export function isCpuType(tipo) {
    const t = normalizeText(tipo);
    return t.includes("cpu") || t.includes("computadora") || t.includes("escritorio") || t.includes("desktop") || t.includes("servidor");
}

export function isCameraType(tipo) {
    const t = normalizeText(tipo);
    return t.includes("camara") || t.includes("biometrico") || t.includes("foto");
}

export function isLaptopType(tipo) {
    const t = normalizeText(tipo);
    return t.includes("laptop") || t.includes("portatil") || t.includes("notebook");
}

export function getAvailableCpusForStation(unitKey, estacion) {
    const key = normalizeUnitKey(unitKey);
    const estNum = Number(estacion);
    return (appState.componentes || []).filter(
        c => !isNoAplicaComponent(c) &&
             normalizeUnitKey(c.modulo) === key &&
             Number(c.estacion) === estNum &&
             isCpuType(c.tipo_componente)
    );
}

export function getComponentIcon(tipo) {
    const t = normalizeText(tipo);
    if (t.includes("telefono") || t.includes("ip") || t.includes("voip") || t.includes("celular")) return "bi-telephone-fill";
    if (t.includes("tableta") || t.includes("tablet") || t.includes("ipad")) return "bi-tablet-landscape-fill";
    if (t.includes("gps") || t.includes("ubicacion") || t.includes("rastreo") || t.includes("geolocal")) return "bi-geo-alt-fill";
    if (t.includes("laptop") || t.includes("portatil") || t.includes("notebook")) return "bi-laptop";
    if (t.includes("monitor") || t.includes("pantalla") || t.includes("display")) return "bi-display";
    if (t.includes("teclado") || t.includes("keyboard")) return "bi-keyboard-fill";
    if (t.includes("mouse") || t.includes("raton")) return "bi-mouse2-fill";
    if (t.includes("impresora") || t.includes("printer")) return "bi-printer-fill";
    if (t.includes("escaner") || t.includes("scanner") || t.includes("escan")) return "bi-upc-scan";
    if (t.includes("camara") || t.includes("biometrico") || t.includes("foto")) return "bi-camera-fill";
    if (t.includes("huella") || t.includes("firma") || t.includes("lector")) return "bi-fingerprint";
    if (t.includes("no break") || t.includes("ups") || t.includes("energia") || t.includes("regulador")) return "bi-battery-charging";
    if (t.includes("switch") || t.includes("red") || t.includes("router") || t.includes("modem")) return "bi-hdd-network-fill";
    if (t.includes("servidor")) return "bi-server";
    return "bi-cpu-fill";
}

export function normalizeComponentRecord(rec) {
    const modulo = normalizeUnitKey(rec.modulo);
    const estacion = Number.isFinite(Number(rec.estacion)) ? Number(rec.estacion) : (isDistrictArea(modulo) ? 1 : 0);
    const isNA = isNoAplicaComponent(rec);

    if (isNA) {
        return {
            id: rec.id || ("CMP-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5)),
            modulo,
            estacion,
            tipo_componente: rec.tipo_componente || "Computadora / CPU",
            marca: "NO APLICA",
            modelo: "NO APLICA",
            numero_serie: "NO APLICA",
            inventario_ine: "",
            serie_cpu_vinculada: "",
            serie_lente: "",
            serie_docking: "",
            estado_fisico: "No Aplica",
            observaciones: "",
            foto_url: "",
            registrado_por: rec.registrado_por || "Sistema",
            fecha_registro: rec.fecha_registro || new Date().toLocaleString("es-MX")
        };
    }

    return {
        id: rec.id || ("CMP-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5)),
        modulo,
        estacion,
        tipo_componente: rec.tipo_componente || "Computadora / CPU",
        marca: rec.marca || "Generico",
        modelo: rec.modelo || "N/A",
        numero_serie: String(rec.numero_serie || "").trim().toUpperCase(),
        inventario_ine: String(rec.inventario_ine || "").trim().toUpperCase(),
        serie_cpu_vinculada: String(rec.serie_cpu_vinculada || "").trim().toUpperCase(),
        serie_lente: String(rec.serie_lente || "").trim().toUpperCase(),
        serie_docking: String(rec.serie_docking || "").trim().toUpperCase(),
        estado_fisico: rec.estado_fisico || "Operativo",
        observaciones: rec.observaciones || "",
        foto_url: rec.foto_url || "",
        registrado_por: rec.registrado_por || "Administrador",
        fecha_registro: rec.fecha_registro || new Date().toLocaleString("es-MX")
    };
}

export function normalizeStockRecord(rec) {
    const origen = normalizeUnitKey(rec.origen || "050351");
    const oficio = String(rec.oficio_desincorporacion || "").trim().toUpperCase();
    const isDesinc =
        rec.desincorporacion === "Si" ||
        rec.estatus === "Desincorporado" ||
        Boolean(oficio);

    return {
        id: rec.id || ("STK-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5)),
        origen,
        destino: rec.destino || "",
        inventario_ine: String(rec.inventario_ine || "").trim().toUpperCase(),
        descripcion: rec.descripcion || "Equipo",
        marca: rec.marca || "Generico",
        modelo: rec.modelo || "N/A",
        numero_serie: String(rec.numero_serie || "").trim().toUpperCase(),
        serie_lente: String(rec.serie_lente || "").trim().toUpperCase(),
        estatus: isDesinc ? "Desincorporado" : (rec.estatus || "Stock"),
        desincorporacion: isDesinc ? "Si" : "No",
        fecha_desincorporacion: rec.fecha_desincorporacion || "",
        oficio_desincorporacion: oficio,
        observaciones: rec.observaciones || "",
        fecha_registro: rec.fecha_registro || new Date().toLocaleString("es-MX")
    };
}

function hydrateState(raw) {
    const base = cloneDefaultState();
    const src = raw && typeof raw === "object" ? raw : {};

    const estSrc = src.estaciones || src.config_estaciones || {};
    MAC_MODULES.forEach(m => {
        const val = Number(estSrc[m]);
        base.estaciones[m] = Number.isFinite(val) && val >= 0 ? Math.floor(val) : base.estaciones[m];
    });
    base.config_estaciones = { ...base.estaciones };

    const areaSrc = src.areas_distritales || {};
    DISTRICT_AREAS.forEach(a => {
        const val = Number(areaSrc[a.key]);
        base.areas_distritales[a.key] = Number.isFinite(val) && val > 0 ? Math.floor(val) : a.defaultSlots;
    });

    const marcasMerged = Array.from(new Set([...base.marcas, ...(Array.isArray(src.marcas) ? src.marcas : [])])).filter(Boolean);
    const tiposMerged = Array.from(new Set([...base.tipos_componente, ...(Array.isArray(src.tipos_componente) ? src.tipos_componente : [])])).filter(Boolean);

    base.marcas = marcasMerged;
    base.tipos_componente = tiposMerged;

    base.operadores = (Array.isArray(src.operadores) ? src.operadores : []).map(normalizeOperatorRecord);
    base.componentes = (Array.isArray(src.componentes) ? src.componentes : []).map(normalizeComponentRecord);
    base.stock_resguardo = (Array.isArray(src.stock_resguardo) ? src.stock_resguardo : []).map(normalizeStockRecord);
    base.tickets_fallas = (Array.isArray(src.tickets_fallas) ? src.tickets_fallas : []).map(normalizeFaultTicketRecord);
    base.historial_traspasos = Array.isArray(src.historial_traspasos) ? src.historial_traspasos : [];

    return base;
}

// ==================== PERSISTENCIA LOCAL Y FIRESTORE ====================
function saveLocalCache(stateObj) {
    try {
        localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(stateObj));
    } catch (_) {}
}

function loadLocalCache() {
    try {
        const raw = localStorage.getItem(LOCAL_CACHE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

let isApplyingRemoteSnapshot = false;
let unsubscribeRealtime = null;

function updateSyncBadges(mode, labelText) {
    const badgeIds = ["loginSyncBadge", "cloudStatusBadge"];
    badgeIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (mode === "online") {
            el.className = "badge bg-success py-2 px-2";
            el.innerHTML = `<i class="bi bi-cloud-check-fill me-1"></i>${labelText || "Nube Activa"}`;
        } else if (mode === "saving") {
            el.className = "badge bg-warning text-dark py-2 px-2";
            el.innerHTML = `<i class="bi bi-cloud-arrow-up-fill me-1"></i>${labelText || "Guardando..."}`;
        } else {
            el.className = "badge bg-secondary py-2 px-2";
            el.innerHTML = `<i class="bi bi-hdd-network me-1"></i>${labelText || "Modo Local"}`;
        }
    });
}

export async function saveState() {
    appState.config_estaciones = { ...appState.estaciones };
appState.areas_distritales = {
        vrfe: Math.max(1, Math.floor(Number(appState.areas_distritales?.vrfe ?? 1) || 1)),
        josa: Math.max(1, Math.floor(Number(appState.areas_distritales?.josa ?? 1) || 1)),
        verificador_campo: Math.max(1, Math.floor(Number(appState.areas_distritales?.verificador_campo ?? 1) || 1)),
        soporte_tecnico: Math.max(1, Math.floor(Number(appState.areas_distritales?.soporte_tecnico ?? 1) || 1)),
        cartografia: Math.max(1, Math.floor(Number(appState.areas_distritales?.cartografia ?? 2) || 2))
    };
    saveLocalCache(appState);

    if (isApplyingRemoteSnapshot) return;

    try {
        updateSyncBadges("saving", "Guardando...");
        await setDoc(STATE_DOC_REF, {
            ...appState,
            updated_at: new Date().toISOString()
        });
        updateSyncBadges("online", "Nube Sincronizada");
    } catch (err) {
        console.error("Firestore save error:", err);
        updateSyncBadges("local", "Error Nube (Local)");
    }
}

export function initFirebaseRealtimeListener(onStateChange) {
    const cached = loadLocalCache();
    if (cached) {
        appState = hydrateState(cached);
        if (typeof onStateChange === "function") onStateChange();
    }

    updateSyncBadges("saving", "Conectando Nube...");

    if (typeof unsubscribeRealtime === "function") {
        unsubscribeRealtime();
    }

    unsubscribeRealtime = onSnapshot(
        STATE_DOC_REF,
        (snap) => {
            isApplyingRemoteSnapshot = true;
            try {
                if (snap.exists()) {
                    appState = hydrateState(snap.data());
                    saveLocalCache(appState);
                    updateSyncBadges("online", "Nube Activa");
                    if (typeof onStateChange === "function") onStateChange();
                } else {
                    appState = hydrateState(cached || DEFAULT_STATE);
                    saveLocalCache(appState);
                    setDoc(STATE_DOC_REF, {
                        ...appState,
                        updated_at: new Date().toISOString()
                    })
                        .then(() => updateSyncBadges("online", "Nube Inicializada"))
                        .catch((err) => {
                            console.error("Error al crear documento inicial en Firestore:", err);
                            updateSyncBadges("local", "Error Nube (Local)");
                        });
                    if (typeof onStateChange === "function") onStateChange();
                }
            } finally {
                isApplyingRemoteSnapshot = false;
            }
        },
        (err) => {
            console.error("Firestore onSnapshot error:", err);
            updateSyncBadges("local", "Sin Nube (Local)");
            if (typeof onStateChange === "function") onStateChange();
        }
    );
}
