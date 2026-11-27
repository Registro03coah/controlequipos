import { STATE_DOC_REF, setDoc, onSnapshot } from "../firebase-config.js";

// ==================== CONFIGURACIÓN Y ESTADO (ESQUEMA V2 LIMPIO) ====================
export const ADMIN_PASS = "admin123";
export const LOCAL_CACHE_KEY = "macs_inventory_cache_v2";
export const SESSION_STORAGE_KEY = "macs_active_session_v2";
export const SCHEMA_VERSION = 2;
export const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23cbd5e1'/><circle cx='50' cy='38' r='18' fill='%2364748b'/><path d='M20 88 C20 65, 80 65, 80 88' fill='%2364748b'/></svg>";

export const DISTRICT_AREAS = [
    { key: "vrfe", label: "VRFE (Vocal del Registro Federal de Electores)", shortLabel: "VRFE", persons: 1 },
    { key: "josa", label: "JOSA (Jefe de Oficina y Seguimiento de Analisis)", shortLabel: "JOSA", persons: 1 },
    { key: "verificador_campo", label: "Verificador de Campo", shortLabel: "Verificador de Campo", persons: 1 },
    { key: "soporte_tecnico", label: "Soporte Tecnico", shortLabel: "Soporte Tecnico", persons: 1 },
    { key: "cartografia", label: "Cartografia", shortLabel: "Cartografia", persons: 2 }
];

export const DEFAULT_STATE = {
    version_esquema: SCHEMA_VERSION,
    estaciones: { "050351": 8, "050353": 3, "050354": 2 },
    areas_distritales: {
        vrfe: 1,
        josa: 1,
        verificador_campo: 1,
        soporte_tecnico: 1,
        cartografia: 2
    },
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

export let appState = loadLocalCache();
export let currentUser = null;
export let activeAdminTab = "inventario";
export let activeOpTab = "equipos";
export let html5QrCode = null;
export let targetScannerInputId = null;

export let currentCompPhoto = "";
export let currentOpPhoto = "";
export let currentFaultPhoto = "";

export function setCurrentUser(val) { currentUser = val; }
export function setActiveAdminTab(val) { activeAdminTab = val; }
export function setActiveOpTab(val) { activeOpTab = val; }
export function setHtml5QrCode(val) { html5QrCode = val; }
export function setTargetScannerInputId(val) { targetScannerInputId = val; }
export function setCurrentCompPhoto(val) { currentCompPhoto = val; }
export function setCurrentOpPhoto(val) { currentOpPhoto = val; }
export function setCurrentFaultPhoto(val) { currentFaultPhoto = val; }

// ==================== HELPERS DE TEXTO, ORDEN, ÁREAS Y "NO APLICA" ====================
export function normalizeText(value = "") {
    return String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeUnitKey(value = "") {
    const raw = String(value || "").trim();
    if (raw === "500351") return "050351";
    if (/^\d+$/.test(raw)) return raw.padStart(6, "0");

    const clean = normalizeText(raw).replace(/\s+/g, "_");
    if (clean === "vocal" || clean === "vrfe" || clean.startsWith("vrfe_")) return "vrfe";
    if (clean === "josa" || clean.startsWith("josa_")) return "josa";
    if (clean === "tecnico" || clean.includes("verificador")) return "verificador_campo";
    if (clean === "soporte" || clean.includes("soporte")) return "soporte_tecnico";
    if (clean.includes("cartograf")) return "cartografia";
    return clean || "050351";
}

export function isDistrictArea(unitKey) {
    const key = normalizeUnitKey(unitKey);
    return DISTRICT_AREAS.some(a => a.key === key);
}

export function getAreaMeta(unitKey) {
    const key = normalizeUnitKey(unitKey);
    return DISTRICT_AREAS.find(a => a.key === key) || null;
}

export function formatUnitLabel(unitKey, { short = false } = {}) {
    const key = normalizeUnitKey(unitKey);
    const area = getAreaMeta(key);
    if (area) return short ? area.shortLabel : area.label;
    return key;
}

export function sortAlphaEs(list = []) {
    return [...list].sort((a, b) => String(a).localeCompare(String(b), "es", { sensitivity: "base" }));
}

export function deduplicateComponentTypes(typesList = [], componentsList = []) {
    const canonicalByNorm = new Map();

    componentsList.forEach(c => {
        const rawType = String(c?.tipo_componente || "").trim();
        const key = normalizeText(rawType);
        if (key && !canonicalByNorm.has(key)) {
            canonicalByNorm.set(key, key === "camara fotografica" ? "Camara Fotografica" : rawType);
        }
    });

    typesList.forEach(t => {
        const rawType = String(t || "").trim();
        const key = normalizeText(rawType);
        if (key && !canonicalByNorm.has(key)) {
            canonicalByNorm.set(key, key === "camara fotografica" ? "Camara Fotografica" : rawType);
        }
    });

    return sortAlphaEs(Array.from(canonicalByNorm.values()));
}

export function deduplicateBrands(brandsList = [], componentsList = []) {
    const canonicalByNorm = new Map();

    componentsList.forEach(c => {
        if (isNoAplicaComponent(c)) return;
        const rawBrand = String(c?.marca || "").trim();
        const key = normalizeText(rawBrand);
        if (key && !canonicalByNorm.has(key)) {
            canonicalByNorm.set(key, rawBrand);
        }
    });

    brandsList.forEach(b => {
        const rawBrand = String(b || "").trim();
        const key = normalizeText(rawBrand);
        if (key && !canonicalByNorm.has(key)) {
            canonicalByNorm.set(key, rawBrand);
        }
    });

    return sortAlphaEs(Array.from(canonicalByNorm.values()));
}

export function isNoAplicaComponent(comp) {
    if (!comp) return false;
    const estado = String(comp.estado_fisico || comp.estado || "").trim().toLowerCase();
    const marca = String(comp.marca || "").trim().toUpperCase();
    const serie = String(comp.numero_serie || comp.serie || "").trim().toUpperCase();
    return estado === "no aplica" || marca === "NO APLICA" || serie === "NO APLICA" || serie.startsWith("NA-");
}

export function countRealComponents(list = []) {
    return list.filter(c => !isNoAplicaComponent(c)).length;
}

// ==================== MIGRACIÓN A NOMBRES NORMALIZADOS ====================
export function normalizeComponentRecord(raw = {}) {
    const estadoRaw = String(raw.estado_fisico ?? raw.estado ?? "Operativo").trim();
    const marcaRaw = String(raw.marca ?? "Generico").trim();
    const serieRaw = String(raw.numero_serie ?? raw.serie ?? "").trim().toUpperCase();
    const isNA =
        estadoRaw.toLowerCase() === "no aplica" ||
        marcaRaw.toUpperCase() === "NO APLICA" ||
        serieRaw === "NO APLICA" ||
        serieRaw.startsWith("NA-");

    let tipo = String(raw.tipo_componente ?? raw.tipo ?? "Computadora / CPU").trim();
    if (normalizeText(tipo) === "camara fotografica") tipo = "Camara Fotografica";

    const unitKey = normalizeUnitKey(raw.modulo || "050351");
    const defaultEst = isDistrictArea(unitKey) ? 1 : 0;

    return {
        id: String(raw.id || "CMP-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5)),
        modulo: unitKey,
        estacion: Number(raw.estacion ?? defaultEst),
        tipo_componente: tipo,
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

export function normalizeStockRecord(raw = {}) {
    const desincRaw = normalizeText(raw.desincorporacion ?? "No");
    const oficio = String(raw.oficio_desincorporacion ?? raw.oficioDesincorporacion ?? "").trim().toUpperCase();
    const fechaDesinc = String(raw.fecha_desincorporacion ?? raw.fechaDesincorporacion ?? "").trim();

    const isDesinc = desincRaw === "si" || Boolean(oficio);
    const desincorporacion = isDesinc ? "Si" : "No";

    const estRaw = String(raw.estatus ?? "Stock").trim().toLowerCase();
    let estatus = estRaw === "falla" ? "Falla" : (estRaw === "desincorporado" ? "Desincorporado" : "Stock");
    if (isDesinc && estatus === "Falla") {
        estatus = "Desincorporado";
    }

    const origenRaw = raw.origen ?? raw.ubicacion ?? "050351";
    const origen = String(origenRaw).trim().toLowerCase() === "jde03" ? "jde03" : normalizeUnitKey(origenRaw);

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

export function normalizeOperatorRecord(raw = {}) {
    const unitKey = normalizeUnitKey(raw.modulo || "050351");
    const defaultEst = isDistrictArea(unitKey) ? 1 : 0;
    return {
        id: String(raw.id || "OP-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5)),
        modulo: unitKey,
        estacion: Number(raw.estacion ?? defaultEst),
        nombre_completo: String(raw.nombre_completo ?? raw.nombre ?? "").trim(),
        telefono: String(raw.telefono ?? "").trim(),
        correo_institucional: String(raw.correo_institucional ?? raw.correo ?? "").trim().toLowerCase(),
        foto_url: String(raw.foto_url ?? raw.foto ?? "")
    };
}

export function normalizeFaultTicketRecord(raw = {}) {
    const unitKey = normalizeUnitKey(raw.modulo || "050351");
    const defaultEst = isDistrictArea(unitKey) ? 1 : 0;
    return {
        id: String(raw.id || "FLT-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5)),
        folio_ticket: String(raw.folio_ticket ?? raw.folio ?? "").trim(),
        fecha_reporte: String(raw.fecha_reporte ?? raw.fecha ?? new Date().toLocaleString("es-MX")),
        modulo: unitKey,
        estacion: Number(raw.estacion ?? defaultEst),
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

export function migrateStateToV2(raw = {}) {
    const estacionesRaw = raw.estaciones || raw.stations || DEFAULT_STATE.estaciones;
    const areasRaw = raw.areas_distritales || DEFAULT_STATE.areas_distritales;
    const marcasRaw = raw.marcas || raw.brands || DEFAULT_STATE.marcas;
    const tiposRaw = raw.tipos_componente || raw.types || DEFAULT_STATE.tipos_componente;
    const operadoresRaw = raw.operadores || raw.operators || [];
    const componentesRaw = raw.componentes || raw.components || [];
    const stockRaw = raw.stock_resguardo || raw.stock || [];
    const ticketsRaw = raw.tickets_fallas || raw.faults || [];
    const transfersRaw = raw.historial_traspasos || [];

    const normalizedComponents = Array.isArray(componentesRaw) ? componentesRaw.map(normalizeComponentRecord) : [];
    const cleanBrands = deduplicateBrands(Array.isArray(marcasRaw) && marcasRaw.length ? marcasRaw : DEFAULT_STATE.marcas, normalizedComponents);
    const cleanTypes = deduplicateComponentTypes(Array.isArray(tiposRaw) && tiposRaw.length ? tiposRaw : DEFAULT_STATE.tipos_componente, normalizedComponents);

    const hasLegacyStockFields = Array.isArray(stockRaw) && stockRaw.some(s =>
        String(s?.ubicacion || "").trim() === "500351" ||
        (s && Object.prototype.hasOwnProperty.call(s, "ubicacion") && !Object.prototype.hasOwnProperty.call(s, "origen"))
    );

    const needsCloudSync =
        Number(raw.version_esquema || 0) !== SCHEMA_VERSION ||
        Boolean(raw.stations || raw.brands || raw.types || raw.operators || raw.components || raw.faults) ||
        !raw.areas_distritales ||
        hasLegacyStockFields ||
        JSON.stringify(marcasRaw) !== JSON.stringify(cleanBrands) ||
        JSON.stringify(tiposRaw) !== JSON.stringify(cleanTypes);

    const migratedState = {
        version_esquema: SCHEMA_VERSION,
        estaciones: {
            "050351": Math.max(0, Number(estacionesRaw["050351"] ?? 8)),
            "050353": Math.max(0, Number(estacionesRaw["050353"] ?? 3)),
            "050354": Math.max(0, Number(estacionesRaw["050354"] ?? 2))
        },
        areas_distritales: {
            vrfe: Math.max(1, Number(areasRaw.vrfe ?? 1)),
            josa: Math.max(1, Number(areasRaw.josa ?? 1)),
            verificador_campo: Math.max(1, Number(areasRaw.verificador_campo ?? 1)),
            soporte_tecnico: Math.max(1, Number(areasRaw.soporte_tecnico ?? 1)),
            cartografia: Math.max(2, Number(areasRaw.cartografia ?? 2))
        },
        marcas: cleanBrands,
        tipos_componente: cleanTypes,
        operadores: Array.isArray(operadoresRaw) ? operadoresRaw.map(normalizeOperatorRecord) : [],
        componentes: normalizedComponents,
        stock_resguardo: Array.isArray(stockRaw) ? stockRaw.map(normalizeStockRecord) : [],
        tickets_fallas: Array.isArray(ticketsRaw) ? ticketsRaw.map(normalizeFaultTicketRecord) : [],
        historial_traspasos: Array.isArray(transfersRaw) ? transfersRaw : []
    };

    return { migratedState, needsCloudSync };
}

// ==================== ÍCONOS, ESTACIONES/PUESTOS Y VINCULACIONES ====================
export function getComponentIcon(tipo) {
    const t = normalizeText(tipo);
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

export function isMonitorType(tipo) {
    const t = normalizeText(tipo);
    return t.includes("monitor") || t.includes("pantalla");
}

export function isCpuType(tipo) {
    const t = normalizeText(tipo);
    return t.includes("computadora") || t.includes("cpu") || t.includes("pc") || t.includes("servidor") || t.includes("laptop");
}

export function isCameraType(tipo) {
    return normalizeText(tipo).includes("camara");
}

export function isLaptopType(tipo) {
    const t = normalizeText(tipo);
    return t.includes("laptop") || t.includes("portatil");
}

export function getAvailableCpusForStation(modulo, estacion) {
    const unitKey = normalizeUnitKey(modulo);
    return appState.componentes.filter(c =>
        !isNoAplicaComponent(c) &&
        normalizeUnitKey(c.modulo) === unitKey &&
        Number(c.estacion) === Number(estacion) &&
        isCpuType(c.tipo_componente)
    );
}

export function formatStationLabel(estacion, includeRoleHint = false, modulo = null) {
    const num = Number(estacion);
    if (modulo && isDistrictArea(modulo)) {
        const count = Math.max(1, Number(appState.areas_distritales?.[normalizeUnitKey(modulo)] ?? 1));
        return count > 1 ? `Persona ${num}` : `Persona ${num} (Unica)`;
    }
    if (num === 0) {
        return includeRoleHint ? "Estacion 0 - Servidor (Responsable de Modulo)" : "Estacion 0 (Servidor)";
    }
    return `Estacion ${num}`;
}

export function getOperatorByStation(modulo, estacion) {
    const unitKey = normalizeUnitKey(modulo);
    return appState.operadores.find(op => normalizeUnitKey(op.modulo) === unitKey && Number(op.estacion) === Number(estacion));
}

export function fillStationOptions(selectEl, modulo, options = {}) {
    const { onlyUserName = false, includeRoleHint = false, selectedValue = null } = options;
    const unitKey = normalizeUnitKey(modulo);
    selectEl.innerHTML = "";

    if (isDistrictArea(unitKey)) {
        const areaMeta = getAreaMeta(unitKey);
        const count = Math.max(1, Number(appState.areas_distritales?.[unitKey] ?? areaMeta?.persons ?? 1));

        for (let i = 1; i <= count; i++) {
            let label = formatStationLabel(i, includeRoleHint, unitKey);
            if (onlyUserName) {
                const op = getOperatorByStation(unitKey, i);
                label = op ? `${op.nombre_completo} (${formatStationLabel(i, false, unitKey)})` : `Sin asignar (${formatStationLabel(i, false, unitKey)})`;
            }
            selectEl.innerHTML += `<option value="${i}">${label}</option>`;
        }

        const numericSelected = Number(selectedValue);
        if (selectedValue !== null && !Number.isNaN(numericSelected) && numericSelected >= 1 && numericSelected <= count) {
            selectEl.value = String(numericSelected);
        } else {
            selectEl.value = "1";
        }
        return;
    }

    const rawCount = appState.estaciones[unitKey];
    const count = Math.max(0, Number(rawCount !== undefined && rawCount !== null ? rawCount : 0));

    for (let i = 0; i <= count; i++) {
        let label = formatStationLabel(i, includeRoleHint, unitKey);
        if (onlyUserName) {
            const op = getOperatorByStation(unitKey, i);
            label = op ? op.nombre_completo : "Sin asignar";
        }
        selectEl.innerHTML += `<option value="${i}">${label}</option>`;
    }

    const numericSelected = Number(selectedValue);
    if (selectedValue !== null && !Number.isNaN(numericSelected) && numericSelected >= 0 && numericSelected <= count) {
        selectEl.value = String(numericSelected);
    } else {
        selectEl.value = "0";
    }
}

export function populateUnitSelect(selectEl, { includeAll = false, allLabel = "Todos los Modulos y Areas" } = {}) {
    if (!selectEl) return;
    const prev = selectEl.value;
    const macsHtml = `
        <optgroup label="Modulos (MAC)">
            <option value="050351">Modulo 050351</option>
            <option value="050353">Modulo 050353</option>
            <option value="050354">Modulo 050354</option>
        </optgroup>
    `;
    const areasHtml = `
        <optgroup label="Areas Distritales">
            ${DISTRICT_AREAS.map(a => `<option value="${a.key}">${a.label}</option>`).join("")}
        </optgroup>
    `;
    selectEl.innerHTML = (includeAll ? `<option value="ALL">${allLabel}</option>` : "") + macsHtml + areasHtml;
    if (prev && [...selectEl.options].some(o => o.value === prev)) {
        selectEl.value = prev;
    }
}

// ==================== PERSISTENCIA DE SESIÓN Y CACHÉ ====================
export function persistSession() {
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

export function restoreSession() {
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

export function loadLocalCache() {
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

export function updateCloudBadge(status) {
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

export async function saveState() {
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

export function initFirebaseRealtimeListener(onSyncCallback) {
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
        if (typeof onSyncCallback === "function") onSyncCallback();
    }, (error) => {
        console.error("Error de suscripcion Firestore:", error);
        updateCloudBadge("offline");
    });
}
