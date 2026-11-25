import { STATE_DOC_REF, setDoc, onSnapshot } from "./firebase-config.js";

// ==================== CONFIGURACIÓN Y ESTADO (ESQUEMA V2 LIMPIO) ====================
const ADMIN_PASS = "admin123";
const LOCAL_CACHE_KEY = "macs_inventory_cache_v2";
const SESSION_STORAGE_KEY = "macs_active_session_v2";
const SCHEMA_VERSION = 2;
const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23cbd5e1'/><circle cx='50' cy='38' r='18' fill='%2364748b'/><path d='M20 88 C20 65, 80 65, 80 88' fill='%2364748b'/></svg>";

const DEFAULT_STATE = {
    version_esquema: SCHEMA_VERSION,
    estaciones: { "050351": 8, "050353": 2, "050354": 2 },
    marcas: ["HP", "Dell", "Lenovo", "Epson", "Zebra", "Canon", "Wacom", "Suprema", "Morpho", "Xerox", "Samsung", "Nextep", "ImageTeam", "Syble", "Brother", "NO APLICA", "Generico"],
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
    tickets_fallas: []
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

// ==================== MIGRACIÓN A NOMBRES NORMALIZADOS (SIN ACENTOS, Ñ, ESPACIOS NI MAYÚSCULAS) ====================
function normalizeComponentRecord(raw = {}) {
    return {
        id: String(raw.id || "CMP-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5)),
        modulo: String(raw.modulo || "050351").padStart(6, "0"),
        estacion: Number(raw.estacion ?? 0),
        tipo_componente: String(raw.tipo_componente ?? raw.tipo ?? "Computadora / CPU").trim(),
        marca: String(raw.marca ?? "Generico").trim(),
        modelo: String(raw.modelo ?? "").trim(),
        numero_serie: String(raw.numero_serie ?? raw.serie ?? "").trim().toUpperCase(),
        inventario_ine: String(raw.inventario_ine ?? raw.inventarioIne ?? "").trim().toUpperCase(),
        estado_fisico: String(raw.estado_fisico ?? raw.estado ?? "Operativo").trim(),
        observaciones: String(raw.observaciones ?? raw.notas ?? "").trim(),
        foto_url: String(raw.foto_url ?? raw.foto ?? ""),
        registrado_por: String(raw.registrado_por ?? raw.registradoPor ?? "Administrador").trim(),
        fecha_registro: String(raw.fecha_registro ?? raw.fechaRegistro ?? new Date().toLocaleString("es-MX"))
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
    const ticketsRaw = raw.tickets_fallas || raw.faults || [];

    const needsCloudSync =
        Number(raw.version_esquema || 0) !== SCHEMA_VERSION ||
        Boolean(raw.stations || raw.brands || raw.types || raw.operators || raw.components || raw.faults);

    const migratedState = {
        version_esquema: SCHEMA_VERSION,
        estaciones: {
            "050351": Math.max(0, Number(estacionesRaw["050351"] ?? 8)),
            "050353": Math.max(0, Number(estacionesRaw["050353"] ?? 2)),
            "050354": Math.max(0, Number(estacionesRaw["050354"] ?? 2))
        },
        marcas: Array.isArray(marcasRaw) && marcasRaw.length ? marcasRaw : [...DEFAULT_STATE.marcas],
        tipos_componente: Array.isArray(tiposRaw) && tiposRaw.length ? tiposRaw : [...DEFAULT_STATE.tipos_componente],
        operadores: Array.isArray(operadoresRaw) ? operadoresRaw.map(normalizeOperatorRecord) : [],
        componentes: Array.isArray(componentesRaw) ? componentesRaw.map(normalizeComponentRecord) : [],
        tickets_fallas: Array.isArray(ticketsRaw) ? ticketsRaw.map(normalizeFaultTicketRecord) : []
    };

    return { migratedState, needsCloudSync };
}

// ==================== ÍCONOS POR TIPO DE COMPONENTE ====================
function getComponentIcon(tipo) {
    const t = String(tipo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (t.includes("laptop") || t.includes("portatil")) return "bi-laptop";
    if (t.includes("servidor") || t.includes("rack")) return "bi-hdd-rack-fill";
    if (t.includes("computadora") || t.includes("cpu") || t.includes("pc")) return "bi-pc-display";
    if (t.includes("monitor") || t.includes("pantalla")) return "bi-display";
    if (t.includes("camara") || t.includes("fotograf")) return "bi-camera-fill";
    if (t.includes("firma") || t.includes("wacom") || t.includes("pad")) return "bi-pen-fill";
    if (t.includes("huella") || t.includes("dactilar") || t.includes("decadactilar") || t.includes("biometr")) return "bi-fingerprint";
    if (t.includes("impresora")) return "bi-printer-fill";
    if (t.includes("qr") || t.includes("codigo") || t.includes("lector")) return "bi-upc-scan";
    if (t.includes("escaner") || t.includes("digitalizador")) return "bi-file-earmark-ruled-fill";
    if (t.includes("break") || t.includes("ups") || t.includes("energia")) return "bi-battery-charging";
    return "bi-cpu-fill";
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
    const ctx = document.getElementById("compFormContext").value;

    const modeloEl = document.getElementById("compModelo");
    const serieEl = document.getElementById("compSerie");
    const invIneEl = document.getElementById("compInventarioIne");
    const estadoEl = document.getElementById("compEstado");
    const scanBtnEl = document.getElementById("btnCompScanSerie");

    modeloEl.disabled = isNoAplica;
    serieEl.disabled = isNoAplica;
    invIneEl.disabled = isNoAplica;
    if (scanBtnEl) scanBtnEl.disabled = isNoAplica;

    if (isNoAplica) {
        const modulo = ctx === "op" && currentUser ? currentUser.modulo : document.getElementById("compModulo").value;
        const estacion = ctx === "op" && currentUser ? Number(currentUser.estacion) : Number(document.getElementById("compEstacion").value);
        const tipo = document.getElementById("compTipo").value;
        const editId = document.getElementById("editCompId").value;

        modeloEl.value = "NO APLICA";
        invIneEl.value = "NO APLICA";
        estadoEl.value = "No Aplica";

        const tag = tipo
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^A-Za-z0-9]/g, "")
            .toUpperCase()
            .slice(0, 12);

        let serieCandidate = `NA-${modulo}-E${estacion}-${tag}`;
        if (appState.componentes.some(c => c.numero_serie === serieCandidate && c.id !== editId)) {
            serieCandidate = `${serieCandidate}-${Date.now().toString().slice(-3)}`;
        }
        serieEl.value = serieCandidate;
    } else {
        if (modeloEl.value === "NO APLICA") modeloEl.value = "";
        if (invIneEl.value === "NO APLICA") invIneEl.value = "";
        if (serieEl.value.startsWith("NA-")) serieEl.value = "";
        if (estadoEl.value === "No Aplica") estadoEl.value = "Operativo";
    }
}

function onModalBrandOrTypeChange() {
    applyModalBrandLockState();
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
        document.getElementById("editCompId").value = compToEdit.id;
        document.getElementById("compModalTitle").innerHTML = `<i class="bi bi-pencil-square text-warning me-2"></i>Editar Componente`;
        document.getElementById("compTipo").value = compToEdit.tipo_componente;

        const marcaSel = document.getElementById("compMarca");
        if (![...marcaSel.options].some(o => o.value === compToEdit.marca)) {
            marcaSel.innerHTML = `<option value="${compToEdit.marca}">${compToEdit.marca}</option>` + marcaSel.innerHTML;
        }
        marcaSel.value = compToEdit.marca;

        document.getElementById("compModelo").value = compToEdit.modelo;
        document.getElementById("compSerie").value = compToEdit.numero_serie;
        document.getElementById("compInventarioIne").value = compToEdit.inventario_ine || "";
        document.getElementById("compEstado").value = compToEdit.estado_fisico;
        document.getElementById("compNotas").value = compToEdit.observaciones || "";

        currentCompPhoto = compToEdit.foto_url || "";
        if (compToEdit.foto_url) {
            document.getElementById("compPhotoImg").src = compToEdit.foto_url;
            document.getElementById("compPhotoPreview").classList.remove("d-none");
        }
    } else {
        document.getElementById("editCompId").value = "";
        document.getElementById("compModalTitle").innerHTML = context === "op"
            ? `<i class="bi bi-plus-circle-fill text-danger me-2"></i>Registrar Componente en mi Estacion`
            : `<i class="bi bi-plus-circle-fill text-danger me-2"></i>Registrar Componente en Estacion`;
    }

    applyModalBrandLockState();
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
    const modelo = document.getElementById("compModelo").value.trim();
    const numero_serie = document.getElementById("compSerie").value.trim().toUpperCase();
    const inventario_ine = document.getElementById("compInventarioIne").value.trim().toUpperCase();
    const estado_fisico = document.getElementById("compEstado").value;
    const observaciones = document.getElementById("compNotas").value.trim();

    const dup = appState.componentes.find(c => c.numero_serie === numero_serie && c.id !== editId);
    if (dup) {
        alert(`El numero de serie "${numero_serie}" ya esta registrado en ${dup.modulo} - ${formatStationLabel(dup.estacion)}.`);
        return;
    }

    if (editId) {
        const idx = appState.componentes.findIndex(c => c.id === editId);
        if (idx !== -1) {
            appState.componentes[idx] = normalizeComponentRecord({
                ...appState.componentes[idx],
                modulo,
                estacion,
                tipo_componente,
                marca,
                modelo,
                numero_serie,
                inventario_ine,
                estado_fisico,
                observaciones,
                foto_url: currentCompPhoto || appState.componentes[idx].foto_url,
                registrado_por: isOp ? currentUser.operator.nombre_completo : (appState.componentes[idx].registrado_por || "Administrador")
            });
        }
    } else {
        appState.componentes.push(normalizeComponentRecord({
            id: "CMP-" + Date.now(),
            modulo,
            estacion,
            tipo_componente,
            marca,
            modelo,
            numero_serie,
            inventario_ine,
            estado_fisico,
            observaciones,
            foto_url: currentCompPhoto,
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
        return `
        <div class="border rounded-3 mb-3 overflow-hidden bg-white">
            <div class="bg-light px-3 py-2 border-bottom d-flex justify-content-between align-items-center">
                <span class="fw-bold text-dark"><i class="bi ${iconClass} text-danger me-2"></i>${groupName}</span>
                <span class="badge bg-secondary">${groupItems.length}</span>
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
                            const isNA = c.estado_fisico === "No Aplica" || c.marca === "NO APLICA";
                            const itemIcon = getComponentIcon(c.tipo_componente);
                            return `
                                <tr>
                                    <td>
                                        ${c.foto_url
                                            ? `<img src="${c.foto_url}" class="img-thumb" onclick="showPhotoModal('${c.foto_url}', '${c.tipo_componente} - ${c.numero_serie}')">`
                                            : `<span class="badge bg-light text-muted border">Sin foto</span>`}
                                    </td>
                                    <td class="fw-bold">
                                        <i class="bi ${itemIcon} text-danger me-1"></i>${c.tipo_componente}
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
                                        <div class="d-flex justify-content-end gap-1 flex-wrap">
                                            <button class="btn btn-sm btn-outline-primary" title="Editar" onclick="editComponentById('${c.id}')">
                                                <i class="bi bi-pencil"></i>
                                            </button>
                                            <button class="btn btn-sm btn-outline-secondary" title="Eliminar" onclick="deleteComponent('${c.id}')">
                                                <i class="bi bi-trash"></i>
                                            </button>
                                            ${!isNA ? `
                                                <button class="btn btn-sm btn-outline-danger fw-semibold" title="Levantar Ticket de Servicio" onclick="openReportFaultModal('${c.id}')">
                                                    <i class="bi bi-ticket-perforated-fill me-1"></i>Reportar Falla
                                                </button>
                                            ` : ""}
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
    document.getElementById("opTotalComponents").textContent = `${myComps.length} equipos`;
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
    const tabs = ["inventario", "operadores", "config", "fallas"];
    tabs.forEach(t => {
        document.getElementById(`adm-tab-${t}`).classList.toggle("active", t === tab);
        document.getElementById(`admSection${t.charAt(0).toUpperCase() + t.slice(1)}`).classList.toggle("d-none", t !== tab);
    });
}

function refreshAdminUI({ preserveSelection = false } = {}) {
    const activeFaults = appState.tickets_fallas.filter(f => f.estatus_ticket !== "Finalizada");
    document.getElementById("adminStatTotal").textContent = appState.componentes.length;
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
}

function onAdminStationOrBrandChange() {
    updateCompAssignedOperatorHint();
    applyModalBrandLockState();
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
    if (!confirm("¿Seguro que deseas eliminar este componente del inventario?")) return;
    appState.componentes = appState.componentes.filter(c => c.id !== id);
    await saveState();
    if (currentUser && currentUser.role === "operator") refreshOperatorUI();
    else refreshAdminUI({ preserveSelection: true });
}

function renderAdminInventoryGrouped() {
    const fMod = document.getElementById("adminFilterModulo").value;
    const fTipo = document.getElementById("adminFilterTipo").value;
    const search = document.getElementById("adminSearchInput").value.toLowerCase().trim();

    const filtered = appState.componentes.filter(c => {
        if (fMod !== "ALL" && c.modulo !== fMod) return false;
        if (fTipo !== "ALL" && c.tipo_componente !== fTipo) return false;
        if (search) {
            const op = getOperatorByStation(c.modulo, c.estacion);
            const opName = op ? op.nombre_completo.toLowerCase() : "";
            const estText = formatStationLabel(c.estacion).toLowerCase();
            const haystack = `${c.numero_serie} ${c.inventario_ine || ""} ${c.marca} ${c.modelo} ${c.tipo_componente} ${c.estado_fisico} ${opName} ${estText}`.toLowerCase();
            if (!haystack.includes(search)) return false;
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
    if (!comp) return;
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
    if (!comp) return;

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
        if (comp) comp.estado_fisico = "Operativo";
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

// ==================== PLANTILLA, IMPORTACIÓN Y EXPORTACIÓN EXCEL (.XLSX / .CSV) ====================
function downloadImportTemplate() {
    const sampleRows = [
        {
            "modulo": "050351",
            "estacion": 0,
            "tipo_componente": "Servidor",
            "marca": "Dell",
            "modelo": "PowerEdge",
            "numero_serie": "J101CBVA",
            "inventario_ine": "",
            "estado_fisico": "Operativo",
            "observaciones": "Servidor 050351"
        },
        {
            "modulo": "050351",
            "estacion": 1,
            "tipo_componente": "Camara Fotografica",
            "marca": "Canon",
            "modelo": "EOS REBEL T7",
            "numero_serie": "182072002447",
            "inventario_ine": "",
            "estado_fisico": "Operativo",
            "observaciones": "Cliente 1"
        },
        {
            "modulo": "050351",
            "estacion": 1,
            "tipo_componente": "Pad de Firmas",
            "marca": "Wacom",
            "modelo": "STU-540",
            "numero_serie": "1AQ0021006261",
            "inventario_ine": "",
            "estado_fisico": "Operativo",
            "observaciones": "Cliente 1"
        }
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    ws["!cols"] = [
        { wch: 10 }, { wch: 10 }, { wch: 24 }, { wch: 15 },
        { wch: 20 }, { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 25 }
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
            const marca = marcaRaw.toUpperCase() === "NO APLICA" ? "NO APLICA" : marcaRaw;
            const modelo = String(raw["modelo"] ?? raw["Modelo"] ?? (marca === "NO APLICA" ? "NO APLICA" : "N/A")).trim() || "N/A";
            const inventario_ine = String(raw["inventario_ine"] ?? raw["InventarioINE"] ?? raw["Inventario INE"] ?? "").trim().toUpperCase();
            const observaciones = String(raw["observaciones"] ?? raw["Notas"] ?? "").trim();

            let numero_serie = String(raw["numero_serie"] ?? raw["Serie"] ?? raw["Número de Serie"] ?? "").trim().toUpperCase();
            if (!numero_serie && marca === "NO APLICA") {
                const tag = tipo_componente.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10);
                numero_serie = `NA-${modulo || "000000"}-E${estacion}-${tag}-${Date.now().toString().slice(-4)}-${added}`;
            }

            if (!["050351", "050353", "050354"].includes(modulo) || !numero_serie) {
                invalidRows++;
                continue;
            }

            const exists = appState.componentes.some(c => c.numero_serie === numero_serie);
            if (exists) {
                skippedDup++;
                continue;
            }

            let estado_fisico = String(raw["estado_fisico"] ?? raw["Estado"] ?? "").trim();
            const validStates = ["Operativo", "Stock", "En Falla", "En Revision", "En Revisión", "No Aplica", "Baja"];
            if (!validStates.includes(estado_fisico)) {
                estado_fisico = marca === "NO APLICA" ? "No Aplica" : "Operativo";
            }

            if (marca && !appState.marcas.some(b => b.toLowerCase() === marca.toLowerCase())) {
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
            `• Agregados: ${added}\n` +
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
        return {
            "num": idx + 1,
            "modulo": c.modulo,
            "estacion": formatStationLabel(c.estacion),
            "usuario_responsable": op ? op.nombre_completo : "Sin asignar",
            "telefono": op ? op.telefono : "",
            "correo_institucional": op ? op.correo_institucional : "",
            "tipo_componente": c.tipo_componente,
            "marca": c.marca,
            "modelo": c.modelo,
            "numero_serie": c.numero_serie,
            "inventario_ine": c.inventario_ine || "",
            "estado_fisico": c.estado_fisico,
            "registrado_por": c.registrado_por || "Administrador",
            "observaciones": c.observaciones || "",
            "fecha_registro": c.fecha_registro || ""
        };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
        { wch: 6 }, { wch: 12 }, { wch: 22 }, { wch: 28 }, { wch: 16 },
        { wch: 28 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 22 },
        { wch: 20 }, { wch: 14 }, { wch: 22 }, { wch: 25 }, { wch: 20 }
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
    editComponentById,
    switchAdminTab,
    onAdminCompModuloChange,
    onAdminStationOrBrandChange,
    updateCompAssignedOperatorHint,
    deleteComponent,
    renderAdminInventoryGrouped,
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
    openScanner,
    closeScanner,
    previewImageFile,
    clearImageField,
    showPhotoModal,
    downloadImportTemplate,
    importInventoryExcel,
    exportInventoryExcel,
    exportFaultsExcel
});
