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
        "050351": 4,
        "050353": 3,
        "050354": 3
    },
    config_estaciones: {
        "050351": 4,
        "050353": 3,
        "050354": 3
    },
    areas_distritales: {
        vrfe: 3,
        josa: 3,
        verificador_campo: 4,
        soporte_tecnico: 2,
        cartografia: 3
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
        vrfe: Math.max(1, Number(appState.areas_distritales?.vrfe ?? 1)),
        josa: Math.max(1, Number(appState.areas_distritales?.josa ?? 1)),
        verificador_campo: Math.max(1, Number(appState.areas_distritales?.verificador_campo ?? 1)),
        soporte_tecnico: Math.max(1, Number(appState.areas_distritales?.soporte_tecnico ?? 1)),
        cartografia: Math.max(1, Number(appState.areas_distritales?.cartografia ?? 1))
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
```[cite: 19]

---

### 2. Código completo de `js/part4-operators-faults.js`

```javascript
import {
    ADMIN_PASS,
    appState,
    currentUser,
    activeAdminTab,
    currentOpPhoto,
    currentFaultPhoto,
    DEFAULT_AVATAR,
    setCurrentUser,
    setActiveAdminTab,
    setCurrentOpPhoto,
    setCurrentFaultPhoto,
    normalizeText,
    normalizeUnitKey,
    isDistrictArea,
    formatUnitLabel,
    populateUnitSelect,
    sortAlphaEs,
    isNoAplicaComponent,
    countRealComponents,
    normalizeOperatorRecord,
    normalizeFaultTicketRecord,
    getComponentIcon,
    formatStationLabel,
    getOperatorByStation,
    fillStationOptions,
    persistSession,
    saveState
} from "./part1-core.js";

import {
    populateFilterDropdown,
    renderAdminInventoryGrouped,
    switchOpTab,
    refreshOperatorUI
} from "./part2-inventory.js";

import {
    renderAdminStockTable,
    renderTransfersPanel
} from "./part3-stock-transfers.js";

// ==================== LOGIN Y SESIÓN ====================
export function switchLoginTab(role) {
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

export function onLoginModuloChange() {
    const modulo = normalizeUnitKey(document.getElementById("loginModulo").value);
    const defaultSel = isDistrictArea(modulo) ? 1 : 0;
    fillStationOptions(document.getElementById("loginEstacion"), modulo, {
        onlyUserName: true,
        selectedValue: defaultSel
    });
    previewOperatorProfile();
}

export function previewOperatorProfile() {
    const modulo = normalizeUnitKey(document.getElementById("loginModulo").value);
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

export function loginAsOperator(e) {
    e.preventDefault();
    const modulo = normalizeUnitKey(document.getElementById("loginModulo").value);
    const estacion = Number(document.getElementById("loginEstacion").value);
    const op = getOperatorByStation(modulo, estacion);

    if (!op) {
        alert("Este usuario aun no esta registrado. Solicita al Administrador que te de de alta en el sistema.");
        return;
    }

    setCurrentUser({ role: "operator", modulo, estacion, operator: op });
    switchOpTab("equipos", persistSession);
    persistSession();
    enterApp();
}

export function loginAsAdmin(e) {
    e.preventDefault();
    const pass = document.getElementById("adminPassword").value;
    if (pass !== ADMIN_PASS) {
        alert("Contrasena incorrecta. Verifica con el responsable del sistema.");
        return;
    }
    setCurrentUser({ role: "admin" });
    setActiveAdminTab("inventario");
    document.getElementById("adminPassword").value = "";
    persistSession();
    enterApp();
}

export function enterApp({ skipInitialReset = false } = {}) {
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
        const estText = isDistrictArea(currentUser.modulo)
            ? `${formatUnitLabel(currentUser.modulo, { short: true })} • ${formatStationLabel(currentUser.estacion, false, currentUser.modulo)}`
            : (Number(currentUser.estacion) === 0 ? "Estacion 0 • Servidor" : `Estacion ${currentUser.estacion}`);
        document.getElementById("sessionBadge").innerHTML = `<i class="bi bi-person-badge me-1"></i>${formatUnitLabel(currentUser.modulo, { short: true })} | ${estText}`;
        switchOpTab("equipos", persistSession);
        refreshOperatorUI(openPrintFaultFormat);
    }
}

export function logout() {
    setCurrentUser(null);
    persistSession();
    document.getElementById("mainApp").classList.add("d-none");
    document.getElementById("loginScreen").classList.remove("d-none");
    onLoginModuloChange();
}

// ==================== VISTA ADMINISTRADOR ====================
export function switchAdminTab(tab) {
    setActiveAdminTab(tab);
    persistSession();
    const tabs = ["inventario", "stock", "traspasos", "operadores", "config", "fallas"];
    tabs.forEach(t => {
        const tabBtn = document.getElementById(`adm-tab-${t}`);
        const secDiv = document.getElementById(`admSection${t.charAt(0).toUpperCase() + t.slice(1)}`);
        if (tabBtn) tabBtn.classList.toggle("active", t === tab);
        if (secDiv) secDiv.classList.toggle("d-none", t !== tab);
    });
}

export function refreshAdminUI({ preserveSelection = false } = {}) {
    const activeFaults = appState.tickets_fallas.filter(f => f.estatus_ticket !== "Finalizada");
    document.getElementById("adminStatTotal").textContent = countRealComponents(appState.componentes);
    document.getElementById("adminStatOperators").textContent = appState.operadores.length;
    const macStationsTotal = Object.values(appState.estaciones || {}).reduce((a, b) => a + 1 + Math.max(0, Number(b || 0)), 0);
    const areaStationsTotal = Object.values(appState.areas_distritales || {}).reduce((a, b) => a + Math.max(1, Number(b || 1)), 0);
    document.getElementById("adminStatStations").textContent = macStationsTotal + areaStationsTotal;
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
    onAreaConfigSelectChange();

    const opModVal = preserveSelection ? normalizeUnitKey(document.getElementById("opRegModulo").value) : "050351";
    const opEstVal = preserveSelection ? Number(document.getElementById("opRegEstacion").value) : (isDistrictArea(opModVal) ? 1 : 0);

    populateUnitSelect(document.getElementById("adminFilterModulo"), { includeAll: true });
    populateUnitSelect(document.getElementById("filterOpModulo"), { includeAll: true });
    populateUnitSelect(document.getElementById("compModulo"));
    populateUnitSelect(document.getElementById("opRegModulo"));
    populateUnitSelect(document.getElementById("assignStockModulo"));
    populateUnitSelect(document.getElementById("trSourceModulo"), { includeAll: true, allLabel: "Todos los Modulos y Areas" });
    populateUnitSelect(document.getElementById("trTargetModulo"));

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

// ==================== OPERADORES ====================
export function onOpRegModuloChange() {
    const modulo = normalizeUnitKey(document.getElementById("opRegModulo").value);
    const defaultEst = isDistrictArea(modulo) ? 1 : 0;
    fillStationOptions(document.getElementById("opRegEstacion"), modulo, {
        includeRoleHint: true,
        selectedValue: defaultEst
    });
    updateOpRoleHint();
}

export function updateOpRoleHint() {
    const modulo = normalizeUnitKey(document.getElementById("opRegModulo").value);
    const est = Number(document.getElementById("opRegEstacion").value);
    const hint = document.getElementById("opRoleHint");

    if (isDistrictArea(modulo)) {
        hint.textContent = `Integrante de ${formatUnitLabel(modulo)} (${formatStationLabel(est, false, modulo)})`;
        hint.className = "text-success";
        return;
    }

    if (est === 0) {
        hint.textContent = "Responsable de Modulo (Estacion 0 - Servidor)";
        hint.className = "text-primary";
    } else {
        hint.textContent = `Operador de Estacion ${est}`;
        hint.className = "text-dark";
    }
}

export async function saveOperator(e) {
    e.preventDefault();
    const editId = document.getElementById("editOpId").value;
    const modulo = normalizeUnitKey(document.getElementById("opRegModulo").value);
    const estacion = Number(document.getElementById("opRegEstacion").value);
    const nombre_completo = document.getElementById("opRegNombre").value.trim();
    const telefono = document.getElementById("opRegTelefono").value.trim();
    const correo_institucional = document.getElementById("opRegCorreo").value.trim().toLowerCase();

    const existingStationOp = appState.operadores.find(o => normalizeUnitKey(o.modulo) === modulo && Number(o.estacion) === estacion && o.id !== editId);
    if (existingStationOp) {
        const estText = `${formatUnitLabel(modulo, { short: true })} - ${formatStationLabel(estacion, false, modulo)}`;
        if (!confirm(`${estText} ya tiene asignado a ${existingStationOp.nombre_completo}. ¿Deseas reemplazarlo?`)) {
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

export function editOperator(id) {
    const op = appState.operadores.find(o => o.id === id);
    if (!op) return;
    const unitKey = normalizeUnitKey(op.modulo);
    populateUnitSelect(document.getElementById("opRegModulo"));
    document.getElementById("editOpId").value = op.id;
    document.getElementById("opRegModulo").value = unitKey;
    fillStationOptions(document.getElementById("opRegEstacion"), unitKey, {
        includeRoleHint: true,
        selectedValue: op.estacion
    });
    updateOpRoleHint();
    document.getElementById("opRegNombre").value = op.nombre_completo;
    document.getElementById("opRegTelefono").value = op.telefono;
    document.getElementById("opRegCorreo").value = op.correo_institucional;

    setCurrentOpPhoto(op.foto_url || "");
    if (op.foto_url) {
        document.getElementById("opPhotoImg").src = op.foto_url;
        document.getElementById("opPhotoPreview").classList.remove("d-none");
    } else {
        document.getElementById("opPhotoPreview").classList.add("d-none");
    }

    document.getElementById("opFormTitle").innerHTML = `<i class="bi bi-pencil-square text-warning me-2"></i>Editar Registro`;
    document.getElementById("btnCancelEditOp").classList.remove("d-none");
}

export function resetOperatorForm({ keepModulo = null, keepEstacion = null } = {}) {
    const modToKeep = normalizeUnitKey(keepModulo ?? document.getElementById("opRegModulo").value);
    const estToKeep = keepEstacion ?? (isDistrictArea(modToKeep) ? 1 : 0);

    document.getElementById("operatorForm").reset();
    document.getElementById("editOpId").value = "";
    document.getElementById("opFotoInput").value = "";
    document.getElementById("opPhotoPreview").classList.add("d-none");
    setCurrentOpPhoto("");
    document.getElementById("opFormTitle").innerHTML = `<i class="bi bi-person-plus-fill text-danger me-2"></i>Registrar Operador / Responsable`;
    document.getElementById("btnCancelEditOp").classList.add("d-none");

    populateUnitSelect(document.getElementById("opRegModulo"));
    document.getElementById("opRegModulo").value = modToKeep;
    fillStationOptions(document.getElementById("opRegEstacion"), modToKeep, {
        includeRoleHint: true,
        selectedValue: estToKeep
    });
    updateOpRoleHint();
}

export async function deleteOperator(id) {
    if (!confirm("¿Eliminar este registro del sistema?")) return;
    appState.operadores = appState.operadores.filter(o => o.id !== id);
    await saveState();
    refreshAdminUI({ preserveSelection: true });
}

export function renderOperatorsTable() {
    const filterMod = document.getElementById("filterOpModulo").value;
    const list = appState.operadores
        .filter(o => filterMod === "ALL" || normalizeUnitKey(o.modulo) === normalizeUnitKey(filterMod))
        .sort((a, b) => normalizeUnitKey(a.modulo).localeCompare(normalizeUnitKey(b.modulo)) || Number(a.estacion) - Number(b.estacion));

    const tbody = document.getElementById("operatorsTableBody");
    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No hay operadores ni responsables registrados.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(o => {
        const unitKey = normalizeUnitKey(o.modulo);
        const areaMode = isDistrictArea(unitKey);
        const isServer = !areaMode && Number(o.estacion) === 0;
        const unitBadgeText = formatUnitLabel(unitKey, { short: true });
        const estBadgeText = areaMode
            ? formatStationLabel(o.estacion, false, unitKey)
            : (isServer ? "Est. 0 • Servidor" : `Est. ${o.estacion}`);

        return `
        <tr>
            <td><img src="${o.foto_url || DEFAULT_AVATAR}" class="avatar-table" onclick="showPhotoModal('${o.foto_url || DEFAULT_AVATAR}', '${o.nombre_completo}')"></td>
            <td>
                <span class="badge bg-dark">${unitBadgeText}</span>
                <span class="badge ${areaMode ? "bg-info text-dark" : (isServer ? "bg-primary" : "btn-pink")}">${estBadgeText}</span>
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

// ==================== ESTACIONES, ÁREAS Y CATÁLOGOS ====================
export function onAreaConfigSelectChange() {
    const sel = document.getElementById("areaConfigSelect");
    const inp = document.getElementById("areaSlotsInput");
    const hint = document.getElementById("areaSlotsHint");
    const badge = document.getElementById("areaSlotsSummaryBadge");
    if (!sel || !inp) return;

    const key = normalizeUnitKey(sel.value);
    if (!appState.areas_distritales) appState.areas_distritales = {};
    const currentVal = Math.max(1, Number(appState.areas_distritales[key] ?? 1));
    inp.value = currentVal;

    const areaKeys = ["vrfe", "josa", "verificador_campo", "soporte_tecnico", "cartografia"];
    const resumen = areaKeys
        .map(k => `${formatUnitLabel(k, { short: true })}: ${Math.max(1, Number(appState.areas_distritales?.[k] ?? 1))}`)
        .join(" • ");

    if (badge) {
        const totalAreaSlots = areaKeys.reduce((acc, k) => acc + Math.max(1, Number(appState.areas_distritales?.[k] ?? 1)), 0);
        badge.textContent = `${totalAreaSlots} puestos`;
    }
    if (hint) hint.textContent = resumen;
}

export function onAreaSlotsInputChange() {
    const sel = document.getElementById("areaConfigSelect");
    const inp = document.getElementById("areaSlotsInput");
    if (!sel || !inp) return;

    const key = normalizeUnitKey(sel.value);
    const rawVal = parseInt(inp.value, 10);
    if (!Number.isFinite(rawVal) || rawVal < 1) return;

    if (!appState.areas_distritales) appState.areas_distritales = {};
    appState.areas_distritales[key] = rawVal;

    const hint = document.getElementById("areaSlotsHint");
    const badge = document.getElementById("areaSlotsSummaryBadge");
    const areaKeys = ["vrfe", "josa", "verificador_campo", "soporte_tecnico", "cartografia"];
    const resumen = areaKeys
        .map(k => `${formatUnitLabel(k, { short: true })}: ${Math.max(1, Number(appState.areas_distritales?.[k] ?? 1))}`)
        .join(" • ");
    if (badge) {
        const totalAreaSlots = areaKeys.reduce((acc, k) => acc + Math.max(1, Number(appState.areas_distritales?.[k] ?? 1)), 0);
        badge.textContent = `${totalAreaSlots} puestos`;
    }
    if (hint) hint.textContent = resumen;
}

export async function saveStationCounts() {
    const sel = document.getElementById("areaConfigSelect");
    const inp = document.getElementById("areaSlotsInput");
    if (sel && inp) {
        const key = normalizeUnitKey(sel.value);
        const val = Math.max(1, parseInt(inp.value, 10) || 1);
        inp.value = val;
        if (!appState.areas_distritales) appState.areas_distritales = {};
        appState.areas_distritales[key] = val;
    }
    appState.estaciones["050351"] = Math.max(0, Number(document.getElementById("cfg-050351").value));
    appState.estaciones["050353"] = Math.max(0, Number(document.getElementById("cfg-050353").value));
    appState.estaciones["050354"] = Math.max(0, Number(document.getElementById("cfg-050354").value));
    appState.config_estaciones = { ...appState.estaciones };
    await saveState();
    refreshAdminUI({ preserveSelection: true });
    alert("Estaciones y puestos por área actualizados correctamente.");
}

export function renderCatalogs() {
    const sortedBrands = sortAlphaEs(appState.marcas);
    document.getElementById("brandsListContainer").innerHTML = sortedBrands.map(b => {
        const realIdx = appState.marcas.findIndex(item => item === b);
        return `
        <span class="badge bg-light text-dark border p-2 d-inline-flex align-items-center gap-2">
            ${b}
            <i class="bi bi-x-circle-fill text-danger" style="cursor:pointer" onclick="removeCatalogItem('marcas', ${realIdx})"></i>
        </span>
    `}).join("");

    const sortedTypes = sortAlphaEs(appState.tipos_componente);
    document.getElementById("typesListContainer").innerHTML = sortedTypes.map(t => {
        const realIdx = appState.tipos_componente.findIndex(item => item === t);
        return `
        <span class="badge bg-light text-dark border p-2 d-inline-flex align-items-center gap-2">
            <i class="bi ${getComponentIcon(t)} text-danger"></i>
            ${t}
            <i class="bi bi-x-circle-fill text-danger" style="cursor:pointer" onclick="removeCatalogItem('tipos_componente', ${realIdx})"></i>
        </span>
    `}).join("");
}

export async function addCatalogItem(key, inputId) {
    const val = document.getElementById(inputId).value.trim();
    if (!val) return;
    if (!appState[key].some(item => normalizeText(item) === normalizeText(val))) {
        appState[key].push(val);
        appState[key] = sortAlphaEs(appState[key]);
        await saveState();
        refreshAdminUI({ preserveSelection: true });
    }
    document.getElementById(inputId).value = "";
}

export async function removeCatalogItem(key, idx) {
    if (idx < 0) return;
    if (appState[key].length <= 1) {
        alert("Debe existir al menos un elemento en el catalogo.");
        return;
    }
    appState[key].splice(idx, 1);
    appState[key] = sortAlphaEs(appState[key]);
    await saveState();
    refreshAdminUI({ preserveSelection: true });
}

// ==================== TICKETS DE SERVICIO Y REPORTES DE FALLA ====================
export function openReportFaultModal(compId) {
    const comp = appState.componentes.find(c => c.id === compId);
    if (!comp || isNoAplicaComponent(comp)) return;
    const op = getOperatorByStation(comp.modulo, comp.estacion);

    document.getElementById("faultCompId").value = comp.id;
    document.getElementById("faultCompInfo").textContent = `${comp.tipo_componente} - ${comp.marca} ${comp.modelo}`;
    document.getElementById("faultCompSerie").textContent = comp.numero_serie;
    document.getElementById("faultLocationInfo").textContent = `${formatUnitLabel(comp.modulo, { short: true })} | ${formatStationLabel(comp.estacion, false, comp.modulo)} (${op ? op.nombre_completo : "Sin asignar"})`;

    document.getElementById("faultForm").reset();
    document.getElementById("faultPhotoInput").value = "";
    document.getElementById("faultPhotoPreview").classList.add("d-none");
    setCurrentFaultPhoto("");
    new bootstrap.Modal(document.getElementById("reportFaultModal")).show();
}

export async function submitFaultReport(e) {
    e.preventDefault();
    const compId = document.getElementById("faultCompId").value;
    const comp = appState.componentes.find(c => c.id === compId);
    if (!comp || isNoAplicaComponent(comp)) return;

    const unitKey = normalizeUnitKey(comp.modulo);
    const op = getOperatorByStation(unitKey, comp.estacion);
    const consecutive = String(appState.tickets_fallas.length + 1).padStart(3, "0");
    const year = new Date().getFullYear();
    const folio_ticket = `TKT-${unitKey.toUpperCase()}-${year}-${consecutive}`;

    const newFault = normalizeFaultTicketRecord({
        id: "FLT-" + Date.now(),
        folio_ticket,
        fecha_reporte: new Date().toLocaleString("es-MX"),
        modulo: unitKey,
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
    else refreshOperatorUI(openPrintFaultFormat);

    alert(`Ticket de Servicio generado: ${folio_ticket}
Se ha registrado para seguimiento del Administrador y se abrira la Hoja de Servicio para firmas.`);
    openPrintFaultFormat(newFault.id, "initial");
}

export function openResolveFaultModal(faultId) {
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

export async function submitResolveFault(e) {
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
    else refreshOperatorUI(openPrintFaultFormat);

    openPrintFaultFormat(f.id, newStatus === "Finalizada" ? "solved" : "initial");
}

export function renderAdminFaultsTable() {
    const tbody = document.getElementById("adminFaultsTableBody");
    if (appState.tickets_fallas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No hay tickets de servicio ni reportes de falla registrados.</td></tr>`;
        return;
    }
    tbody.innerHTML = appState.tickets_fallas.slice().reverse().map(f => {
        const isSolved = f.estatus_ticket === "Finalizada";
        const compIcon = getComponentIcon(f.tipo_componente);
        const unitKey = normalizeUnitKey(f.modulo);
        return `
        <tr>
            <td class="fw-bold text-danger font-monospace">
                <i class="bi bi-ticket-perforated-fill me-1"></i>${f.folio_ticket}
                <br><small class="text-muted fw-normal">${f.fecha_reporte}</small>
            </td>
            <td><span class="badge bg-dark">${formatUnitLabel(unitKey, { short: true })}</span><br><small>${formatStationLabel(f.estacion, false, unitKey)}</small></td>
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

export function openPrintFaultFormat(faultId, mode = "initial") {
    const f = appState.tickets_fallas.find(item => item.id === faultId);
    if (!f) return;

    const unitKey = normalizeUnitKey(f.modulo);
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
                    <small>${Number(f.estacion) === 0 && !isDistrictArea(unitKey) ? "Responsable de Modulo" : "Usuario MAC"} (Firma de Conformidad)</small>
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
                    <small>Firma (${Number(f.estacion) === 0 && !isDistrictArea(unitKey) ? "Responsable de Modulo" : "Usuario del Modulo MAC"})</small>
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
                <div class="col-6"><strong>Modulo / Area:</strong> ${formatUnitLabel(unitKey, { short: true })}</div>
                <div class="col-6"><strong>Estacion / Puesto:</strong> ${formatStationLabel(f.estacion, false, unitKey)}</div>
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
```[cite: 17]

---

### Pasos rápidos para aplicarlo
1. Pega ambos códigos en `js/part1-core.js` y `js/part4-operators-faults.js` en tu repositorio y espera a que termine el despliegue de GitHub Pages.
2. En el navegador, haz recarga forzada con **`Ctrl + Shift + R`**.
3. Entra con **`admin123`**, ve a **Estaciones y Catálogos → Puestos por Área Distrital**, configura **1, 1, 1, 1, 2** (seleccionando cada área en el desplegable, poniendo su cantidad y guardando), y luego prueba con **F5**[cite: 17, 19].

¿Necesitas también el código completo de `index.html` o `js/part5-excel-print-init.js`?
