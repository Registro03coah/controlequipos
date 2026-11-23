import { STATE_DOC_REF, setDoc, onSnapshot } from "./firebase-config.js";

// ==================== CONFIGURACIÓN Y ESTADO ====================
const ADMIN_PASS = "admin123";
const LOCAL_CACHE_KEY = "macs_inventory_cache_v1";
const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23cbd5e1'/><circle cx='50' cy='38' r='18' fill='%2364748b'/><path d='M20 88 C20 65, 80 65, 80 88' fill='%2364748b'/></svg>";

const DEFAULT_STATE = {
    stations: { "050351": 4, "050353": 3, "050354": 3 },
    brands: ["HP", "Dell", "Lenovo", "Epson", "Zebra", "Canon", "Logitech", "Topaz", "Crossmatch", "Suprema", "Brother", "Genérico"],
    types: [
        "Computadora / CPU",
        "Monitor",
        "Escáner Plano",
        "Impresora",
        "Decadactilar (Huellas)",
        "Pad de Firmas",
        "Cámara Fotográfica",
        "Lector QR / Código Barras",
        "No-Break / UPS"
    ],
    operators: [],
    components: [],
    faults: []
};

let appState = loadLocalCache();
let currentUser = null;
let html5QrCode = null;
let targetScannerInputId = null;

// Variables temporales para imágenes base64
let currentCompPhoto = "";
let currentOpPhoto = "";
let currentFaultPhoto = "";

// ==================== SINCRONIZACIÓN FIRESTORE EN TIEMPO REAL ====================
function loadLocalCache() {
    try {
        const raw = localStorage.getItem(LOCAL_CACHE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return {
                stations: parsed.stations || DEFAULT_STATE.stations,
                brands: parsed.brands || DEFAULT_STATE.brands,
                types: parsed.types || DEFAULT_STATE.types,
                operators: parsed.operators || [],
                components: parsed.components || [],
                faults: parsed.faults || []
            };
        }
    } catch (e) {
        console.warn("Error leyendo caché local:", e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function updateCloudBadge(status) {
    const loginBadge = document.getElementById("loginSyncBadge");
    const appBadge = document.getElementById("cloudStatusBadge");
    if (status === "connected") {
        if (loginBadge) {
            loginBadge.className = "badge bg-success text-white";
            loginBadge.innerHTML = `<i class="bi bi-cloud-check-fill me-1"></i>Firebase Conectado`;
        }
        if (appBadge) {
            appBadge.className = "badge bg-success text-white py-2 px-2";
            appBadge.innerHTML = `<i class="bi bi-cloud-check-fill me-1"></i>Nube Conectada`;
        }
    } else if (status === "saving") {
        if (appBadge) {
            appBadge.className = "badge bg-info text-dark py-2 px-2";
            appBadge.innerHTML = `<i class="bi bi-cloud-arrow-up-fill me-1"></i>Sincronizando...`;
        }
    } else {
        if (loginBadge) {
            loginBadge.className = "badge bg-warning text-dark";
            loginBadge.innerHTML = `<i class="bi bi-wifi-off me-1"></i>Modo Respaldo Local`;
        }
        if (appBadge) {
            appBadge.className = "badge bg-warning text-dark py-2 px-2";
            appBadge.innerHTML = `<i class="bi bi-wifi-off me-1"></i>Respaldo Local`;
        }
    }
}

async function saveState() {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(appState));
    updateCloudBadge("saving");
    try {
        await setDoc(STATE_DOC_REF, {
            ...appState,
            updatedAt: new Date().toISOString()
        });
        updateCloudBadge("connected");
    } catch (err) {
        console.error("Error guardando en Firestore:", err);
        updateCloudBadge("offline");
    }
}

function initFirebaseRealtimeListener() {
    onSnapshot(STATE_DOC_REF, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            appState = {
                stations: data.stations || DEFAULT_STATE.stations,
                brands: data.brands || DEFAULT_STATE.brands,
                types: data.types || DEFAULT_STATE.types,
                operators: data.operators || [],
                components: data.components || [],
                faults: data.faults || []
            };
            localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(appState));
        } else {
            saveState();
        }
        updateCloudBadge("connected");
        refreshActiveScreens();
    }, (error) => {
        console.error("Error de suscripción Firestore:", error);
        updateCloudBadge("offline");
    });
}

function refreshActiveScreens() {
    if (!document.getElementById("loginScreen").classList.contains("d-none")) {
        const currentEst = document.getElementById("loginEstacion").value;
        updateLoginStations();
        if (currentEst) {
            const sel = document.getElementById("loginEstacion");
            if ([...sel.options].some(o => o.value === currentEst)) {
                sel.value = currentEst;
                previewOperatorProfile();
            }
        }
    }
    if (currentUser) {
        if (currentUser.role === "admin") {
            refreshAdminUI();
        } else {
            const updatedOp = getOperatorByStation(currentUser.modulo, currentUser.estacion);
            if (updatedOp) currentUser.operator = updatedOp;
            refreshOperatorUI();
        }
    }
}

// ==================== INICIALIZACIÓN ====================
window.addEventListener("DOMContentLoaded", () => {
    updateLoginStations();
    initFirebaseRealtimeListener();
});

// ==================== UTILIDADES ====================
function getOperatorByStation(modulo, estacion) {
    return appState.operators.find(op => op.modulo === modulo && Number(op.estacion) === Number(estacion));
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
    if (status === "En Falla") return `<span class="badge bg-danger-subtle text-danger border border-danger-subtle">En Falla</span>`;
    if (status === "En Revisión") return `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">En Revisión</span>`;
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

function updateLoginStations() {
    const modulo = document.getElementById("loginModulo").value;
    const count = appState.stations[modulo] || 1;
    const select = document.getElementById("loginEstacion");
    select.innerHTML = "";
    for (let i = 1; i <= count; i++) {
        const op = getOperatorByStation(modulo, i);
        const label = op ? `Estación ${i} — ${op.nombre}` : `Estación ${i} (Sin operador asignado)`;
        select.innerHTML += `<option value="${i}">${label}</option>`;
    }
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
        photoEl.src = op.foto || DEFAULT_AVATAR;
        nameEl.textContent = op.nombre;
        emailEl.textContent = `${op.correo} • Tel: ${op.telefono}`;
    } else {
        photoEl.src = DEFAULT_AVATAR;
        nameEl.textContent = "Estación sin operador asignado";
        emailEl.textContent = "El Administrador debe registrar al operador de esta estación.";
    }
}

function loginAsOperator(e) {
    e.preventDefault();
    const modulo = document.getElementById("loginModulo").value;
    const estacion = Number(document.getElementById("loginEstacion").value);
    const op = getOperatorByStation(modulo, estacion);

    if (!op) {
        alert("Esta estación aún no tiene un operador registrado. Solicita al Administrador que te dé de alta en el sistema.");
        return;
    }

    currentUser = { role: "operator", modulo, estacion, operator: op };
    enterApp();
}

function loginAsAdmin(e) {
    e.preventDefault();
    const pass = document.getElementById("adminPassword").value;
    if (pass !== ADMIN_PASS) {
        alert("Contraseña incorrecta. Verifica con el responsable del sistema.");
        return;
    }
    currentUser = { role: "admin" };
    document.getElementById("adminPassword").value = "";
    enterApp();
}

function enterApp() {
    document.getElementById("loginScreen").classList.add("d-none");
    document.getElementById("mainApp").classList.remove("d-none");

    if (currentUser.role === "admin") {
        document.getElementById("adminView").classList.remove("d-none");
        document.getElementById("operatorView").classList.add("d-none");
        document.getElementById("sessionBadge").innerHTML = `<i class="bi bi-shield-fill-check text-danger me-1"></i>Administrador Global`;
        refreshAdminUI();
    } else {
        document.getElementById("operatorView").classList.remove("d-none");
        document.getElementById("adminView").classList.add("d-none");
        document.getElementById("sessionBadge").innerHTML = `<i class="bi bi-person-badge me-1"></i>Módulo ${currentUser.modulo} | Estación ${currentUser.estacion}`;
        refreshOperatorUI();
    }
}

function logout() {
    currentUser = null;
    document.getElementById("mainApp").classList.add("d-none");
    document.getElementById("loginScreen").classList.remove("d-none");
    updateLoginStations();
}

// ==================== LÓGICA VISTA DEL OPERADOR ====================
function switchOpTab(tab) {
    document.getElementById("op-tab-equipos").classList.toggle("active", tab === "equipos");
    document.getElementById("op-tab-fallas").classList.toggle("active", tab === "fallas");
    document.getElementById("opSectionEquipos").classList.toggle("d-none", tab !== "equipos");
    document.getElementById("opSectionFallas").classList.toggle("d-none", tab !== "fallas");
}

function refreshOperatorUI() {
    const { modulo, estacion, operator } = currentUser;
    document.getElementById("opCardPhoto").src = operator.foto || DEFAULT_AVATAR;
    document.getElementById("opCardModulo").textContent = `Módulo ${modulo}`;
    document.getElementById("opCardEstacion").textContent = `Estación ${estacion}`;
    document.getElementById("opCardName").textContent = operator.nombre;
    document.getElementById("opCardPhone").textContent = operator.telefono;
    document.getElementById("opCardEmail").textContent = operator.correo;

    const myComps = appState.components.filter(c => c.modulo === modulo && Number(c.estacion) === estacion);
    document.getElementById("opTotalComponents").textContent = `${myComps.length} equipos`;

    const tbody = document.getElementById("opComponentsTableBody");
    if (myComps.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">Aún no hay componentes registrados por el Administrador en esta estación.</td></tr>`;
    } else {
        tbody.innerHTML = myComps.map(c => `
            <tr>
                <td>
                    ${c.foto
                        ? `<img src="${c.foto}" class="img-thumb" onclick="showPhotoModal('${c.foto}', '${c.tipo} - ${c.serie}')">`
                        : `<span class="badge bg-light text-muted border">Sin foto</span>`}
                </td>
                <td class="fw-bold">${c.tipo}</td>
                <td>${c.marca} <span class="text-muted">${c.modelo}</span></td>
                <td><span class="font-monospace fw-semibold bg-light px-2 py-1 rounded border">${c.serie}</span></td>
                <td>${getStatusBadge(c.estado)}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-danger fw-semibold" onclick="openReportFaultModal('${c.id}')">
                        <i class="bi bi-exclamation-triangle-fill me-1"></i>Reportar Falla
                    </button>
                </td>
            </tr>
        `).join("");
    }

    const myFaults = appState.faults.filter(f => f.modulo === modulo && Number(f.estacion) === estacion);
    const activeMyFaults = myFaults.filter(f => f.estatus !== "Finalizada");
    document.getElementById("opFaultCountBadge").textContent = activeMyFaults.length;

    const fbody = document.getElementById("opFaultsTableBody");
    if (myFaults.length === 0) {
        fbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No has generado reportes de falla en esta estación.</td></tr>`;
    } else {
        fbody.innerHTML = myFaults.slice().reverse().map(f => {
            const isSolved = f.estatus === "Finalizada";
            return `
            <tr>
                <td class="fw-bold text-danger font-monospace">${f.folio}</td>
                <td class="small">${f.fecha}</td>
                <td><strong>${f.compTipo}</strong><br><small class="font-monospace text-muted">${f.compSerie}</small></td>
                <td class="small"><strong>${f.categoria}:</strong> ${f.descripcion}</td>
                <td>
                    ${isSolved
                        ? `<span class="badge bg-success">Finalizada / Arreglada</span><div class="small text-muted mt-1">${f.fechaSolucion || ''}</div>`
                        : `<span class="badge bg-warning text-dark">${f.estatus}</span>`}
                </td>
                <td class="text-end">
                    <div class="d-flex justify-content-end gap-1 flex-wrap">
                        ${!isSolved ? `
                            <button class="btn btn-sm btn-success" title="Registrar solución" onclick="openResolveFaultModal('${f.id}')">
                                <i class="bi bi-check2-circle me-1"></i>Finalizar Falla
                            </button>
                            <button class="btn btn-sm btn-dark" onclick="openPrintFaultFormat('${f.id}', 'initial')">
                                <i class="bi bi-printer me-1"></i>Formato Falla
                            </button>
                        ` : `
                            <button class="btn btn-sm btn-outline-secondary" title="Formato inicial" onclick="openPrintFaultFormat('${f.id}', 'initial')">
                                <i class="bi bi-file-earmark-text"></i> Inicial
                            </button>
                            <button class="btn btn-sm btn-success" title="Formato de falla finalizada" onclick="openPrintFaultFormat('${f.id}', 'solved')">
                                <i class="bi bi-printer-fill me-1"></i>Reporte Finalizado
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
    const tabs = ["inventario", "operadores", "config", "fallas"];
    tabs.forEach(t => {
        document.getElementById(`adm-tab-${t}`).classList.toggle("active", t === tab);
        document.getElementById(`admSection${t.charAt(0).toUpperCase() + t.slice(1)}`).classList.toggle("d-none", t !== tab);
    });
}

function refreshAdminUI() {
    const activeFaults = appState.faults.filter(f => f.estatus !== "Finalizada");
    document.getElementById("adminStatTotal").textContent = appState.components.length;
    document.getElementById("adminStatOperators").textContent = appState.operators.length;
    const totalStations = Object.values(appState.stations).reduce((a, b) => a + Number(b), 0);
    document.getElementById("adminStatStations").textContent = totalStations;
    document.getElementById("adminStatFaults").textContent = activeFaults.length;
    document.getElementById("admFaultBadge").textContent = activeFaults.length;

    document.getElementById("cfg-050351").value = appState.stations["050351"];
    document.getElementById("cfg-050353").value = appState.stations["050353"];
    document.getElementById("cfg-050354").value = appState.stations["050354"];

    populateDropdowns();
    onAdminCompModuloChange();
    updateOpRegStations();
    renderAdminInventoryTable();
    renderOperatorsTable();
    renderCatalogs();
    renderAdminFaultsTable();
}

function populateDropdowns() {
    const brandSel = document.getElementById("compMarca");
    const currBrand = brandSel.value;
    brandSel.innerHTML = appState.brands.map(b => `<option value="${b}">${b}</option>`).join("");
    if (currBrand && appState.brands.includes(currBrand)) brandSel.value = currBrand;

    const typeSel = document.getElementById("compTipo");
    const currType = typeSel.value;
    typeSel.innerHTML = appState.types.map(t => `<option value="${t}">${t}</option>`).join("");
    if (currType && appState.types.includes(currType)) typeSel.value = currType;

    const filterType = document.getElementById("adminFilterTipo");
    const currFilter = filterType.value;
    filterType.innerHTML = `<option value="ALL">Todos los Componentes</option>` +
        appState.types.map(t => `<option value="${t}">${t}</option>`).join("");
    if (currFilter) filterType.value = currFilter;
}

function onAdminCompModuloChange() {
    const modulo = document.getElementById("compModulo").value;
    const count = appState.stations[modulo] || 1;
    const estSel = document.getElementById("compEstacion");
    const prev = estSel.value;
    estSel.innerHTML = "";
    for (let i = 1; i <= count; i++) {
        estSel.innerHTML += `<option value="${i}">Estación ${i}</option>`;
    }
    if (prev && Number(prev) <= count) estSel.value = prev;
    updateCompAssignedOperatorHint();
}

function updateCompAssignedOperatorHint() {
    const modulo = document.getElementById("compModulo").value;
    const estacion = Number(document.getElementById("compEstacion").value);
    const op = getOperatorByStation(modulo, estacion);
    const hint = document.getElementById("compOperatorHint");
    if (op) {
        hint.textContent = `${op.nombre} (${op.correo})`;
        hint.className = "text-success";
    } else {
        hint.textContent = "Sin operador asignado en esta estación";
        hint.className = "text-danger";
    }
}

async function saveComponent(e) {
    e.preventDefault();
    const editId = document.getElementById("editCompId").value;
    const modulo = document.getElementById("compModulo").value;
    const estacion = Number(document.getElementById("compEstacion").value);
    const tipo = document.getElementById("compTipo").value;
    const marca = document.getElementById("compMarca").value;
    const modelo = document.getElementById("compModelo").value.trim();
    const serie = document.getElementById("compSerie").value.trim().toUpperCase();
    const estado = document.getElementById("compEstado").value;
    const notas = document.getElementById("compNotas").value.trim();

    const dup = appState.components.find(c => c.serie === serie && c.id !== editId);
    if (dup) {
        alert(`El número de serie "${serie}" ya está registrado en el Módulo ${dup.modulo} - Estación ${dup.estacion}.`);
        return;
    }

    if (editId) {
        const idx = appState.components.findIndex(c => c.id === editId);
        if (idx !== -1) {
            appState.components[idx] = {
                ...appState.components[idx],
                modulo, estacion, tipo, marca, modelo, serie, estado, notas,
                foto: currentCompPhoto || appState.components[idx].foto
            };
        }
    } else {
        appState.components.push({
            id: "CMP-" + Date.now(),
            modulo,
            estacion,
            tipo,
            marca,
            modelo,
            serie,
            estado,
            notas,
            foto: currentCompPhoto,
            fechaRegistro: new Date().toLocaleString("es-MX")
        });
    }

    await saveState();
    resetComponentForm();
    refreshAdminUI();
}

function editComponent(id) {
    const c = appState.components.find(item => item.id === id);
    if (!c) return;
    switchAdminTab("inventario");
    document.getElementById("editCompId").value = c.id;
    document.getElementById("compModulo").value = c.modulo;
    onAdminCompModuloChange();
    document.getElementById("compEstacion").value = c.estacion;
    updateCompAssignedOperatorHint();
    document.getElementById("compTipo").value = c.tipo;
    document.getElementById("compMarca").value = c.marca;
    document.getElementById("compModelo").value = c.modelo;
    document.getElementById("compSerie").value = c.serie;
    document.getElementById("compEstado").value = c.estado;
    document.getElementById("compNotas").value = c.notas || "";

    currentCompPhoto = c.foto || "";
    if (c.foto) {
        document.getElementById("compPhotoImg").src = c.foto;
        document.getElementById("compPhotoPreview").classList.remove("d-none");
    } else {
        document.getElementById("compPhotoPreview").classList.add("d-none");
    }

    document.getElementById("compFormTitle").innerHTML = `<i class="bi bi-pencil-square text-warning me-2"></i>Editar Componente`;
    document.getElementById("btnCancelEditComp").classList.remove("d-none");
}

function resetComponentForm() {
    document.getElementById("componentForm").reset();
    document.getElementById("editCompId").value = "";
    clearImageField("compFotoInput", "compPhotoPreview", "currentCompPhoto");
    document.getElementById("compFormTitle").innerHTML = `<i class="bi bi-plus-circle-fill text-danger me-2"></i>Registrar Componente en Estación`;
    document.getElementById("btnCancelEditComp").classList.add("d-none");
    onAdminCompModuloChange();
}

async function deleteComponent(id) {
    if (!confirm("¿Seguro que deseas eliminar este componente del inventario?")) return;
    appState.components = appState.components.filter(c => c.id !== id);
    await saveState();
    refreshAdminUI();
}

function renderAdminInventoryTable() {
    const fMod = document.getElementById("adminFilterModulo").value;
    const fTipo = document.getElementById("adminFilterTipo").value;
    const search = document.getElementById("adminSearchInput").value.toLowerCase().trim();

    const filtered = appState.components.filter(c => {
        if (fMod !== "ALL" && c.modulo !== fMod) return false;
        if (fTipo !== "ALL" && c.tipo !== fTipo) return false;
        if (search) {
            const op = getOperatorByStation(c.modulo, c.estacion);
            const opName = op ? op.nombre.toLowerCase() : "";
            const haystack = `${c.serie} ${c.marca} ${c.modelo} ${c.tipo} ${opName}`.toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        return true;
    });

    const tbody = document.getElementById("adminComponentsTableBody");
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">No hay componentes registrados con los filtros seleccionados.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(c => {
        const op = getOperatorByStation(c.modulo, c.estacion);
        return `
            <tr>
                <td>
                    ${c.foto
                        ? `<img src="${c.foto}" class="img-thumb" onclick="showPhotoModal('${c.foto}', '${c.tipo} - ${c.serie}')">`
                        : `<span class="badge bg-light text-muted border">Sin foto</span>`}
                </td>
                <td><span class="badge bg-dark">Mód. ${c.modulo}</span><br><small class="fw-bold">Estación ${c.estacion}</small></td>
                <td class="small">${op ? `<strong>${op.nombre}</strong>` : `<span class="text-danger">Sin asignar</span>`}</td>
                <td class="fw-semibold">${c.tipo}</td>
                <td>${c.marca} <span class="text-muted">${c.modelo}</span></td>
                <td><span class="font-monospace fw-bold">${c.serie}</span></td>
                <td>${getStatusBadge(c.estado)}</td>
                <td class="text-end">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-danger" title="Levantar Falla" onclick="openReportFaultModal('${c.id}')"><i class="bi bi-exclamation-triangle"></i></button>
                        <button class="btn btn-outline-primary" title="Editar" onclick="editComponent('${c.id}')"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-outline-secondary" title="Eliminar" onclick="deleteComponent('${c.id}')"><i class="bi bi-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

// ==================== GESTIÓN DE OPERADORES (ADMIN) ====================
function updateOpRegStations() {
    const modulo = document.getElementById("opRegModulo").value;
    const count = appState.stations[modulo] || 1;
    const sel = document.getElementById("opRegEstacion");
    const prev = sel.value;
    sel.innerHTML = "";
    for (let i = 1; i <= count; i++) {
        sel.innerHTML += `<option value="${i}">Estación ${i}</option>`;
    }
    if (prev && Number(prev) <= count) sel.value = prev;
}

async function saveOperator(e) {
    e.preventDefault();
    const editId = document.getElementById("editOpId").value;
    const modulo = document.getElementById("opRegModulo").value;
    const estacion = Number(document.getElementById("opRegEstacion").value);
    const nombre = document.getElementById("opRegNombre").value.trim();
    const telefono = document.getElementById("opRegTelefono").value.trim();
    const correo = document.getElementById("opRegCorreo").value.trim().toLowerCase();

    const existingStationOp = appState.operators.find(o => o.modulo === modulo && Number(o.estacion) === estacion && o.id !== editId);
    if (existingStationOp) {
        if (!confirm(`La Estación ${estacion} del Módulo ${modulo} ya tiene asignado a ${existingStationOp.nombre}. ¿Deseas reemplazarlo?`)) {
            return;
        }
        appState.operators = appState.operators.filter(o => o.id !== existingStationOp.id);
    }

    if (editId) {
        const idx = appState.operators.findIndex(o => o.id === editId);
        if (idx !== -1) {
            appState.operators[idx] = {
                ...appState.operators[idx],
                modulo, estacion, nombre, telefono, correo,
                foto: currentOpPhoto || appState.operators[idx].foto
            };
        }
    } else {
        appState.operators.push({
            id: "OP-" + Date.now(),
            modulo,
            estacion,
            nombre,
            telefono,
            correo,
            foto: currentOpPhoto
        });
    }

    await saveState();
    resetOperatorForm();
    refreshAdminUI();
}

function editOperator(id) {
    const op = appState.operators.find(o => o.id === id);
    if (!op) return;
    document.getElementById("editOpId").value = op.id;
    document.getElementById("opRegModulo").value = op.modulo;
    updateOpRegStations();
    document.getElementById("opRegEstacion").value = op.estacion;
    document.getElementById("opRegNombre").value = op.nombre;
    document.getElementById("opRegTelefono").value = op.telefono;
    document.getElementById("opRegCorreo").value = op.correo;

    currentOpPhoto = op.foto || "";
    if (op.foto) {
        document.getElementById("opPhotoImg").src = op.foto;
        document.getElementById("opPhotoPreview").classList.remove("d-none");
    } else {
        document.getElementById("opPhotoPreview").classList.add("d-none");
    }

    document.getElementById("opFormTitle").innerHTML = `<i class="bi bi-pencil-square text-warning me-2"></i>Editar Operador`;
    document.getElementById("btnCancelEditOp").classList.remove("d-none");
}

function resetOperatorForm() {
    document.getElementById("operatorForm").reset();
    document.getElementById("editOpId").value = "";
    clearImageField("opFotoInput", "opPhotoPreview", "currentOpPhoto");
    document.getElementById("opFormTitle").innerHTML = `<i class="bi bi-person-plus-fill text-danger me-2"></i>Registrar / Asignar Operador`;
    document.getElementById("btnCancelEditOp").classList.add("d-none");
    updateOpRegStations();
}

async function deleteOperator(id) {
    if (!confirm("¿Eliminar este operador del sistema?")) return;
    appState.operators = appState.operators.filter(o => o.id !== id);
    await saveState();
    refreshAdminUI();
}

function renderOperatorsTable() {
    const filterMod = document.getElementById("filterOpModulo").value;
    const list = appState.operators
        .filter(o => filterMod === "ALL" || o.modulo === filterMod)
        .sort((a, b) => a.modulo.localeCompare(b.modulo) || a.estacion - b.estacion);

    const tbody = document.getElementById("operatorsTableBody");
    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No hay operadores registrados.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(o => `
        <tr>
            <td><img src="${o.foto || DEFAULT_AVATAR}" class="avatar-table" onclick="showPhotoModal('${o.foto || DEFAULT_AVATAR}', '${o.nombre}')"></td>
            <td><span class="badge bg-dark">Mód. ${o.modulo}</span> <span class="badge btn-pink">Est. ${o.estacion}</span></td>
            <td class="fw-bold">${o.nombre}</td>
            <td class="small">${o.telefono}</td>
            <td class="small text-primary">${o.correo}</td>
            <td class="text-end">
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="editOperator('${o.id}')"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-outline-danger" onclick="deleteOperator('${o.id}')"><i class="bi bi-trash"></i></button>
                </div>
            </td>
        </tr>
    `).join("");
}

// ==================== CONFIGURACIÓN DE ESTACIONES Y CATÁLOGOS ====================
async function saveStationCounts() {
    appState.stations["050351"] = Math.max(1, Number(document.getElementById("cfg-050351").value));
    appState.stations["050353"] = Math.max(1, Number(document.getElementById("cfg-050353").value));
    appState.stations["050354"] = Math.max(1, Number(document.getElementById("cfg-050354").value));
    await saveState();
    refreshAdminUI();
    alert("Cantidad de estaciones actualizada correctamente y sincronizada en la nube.");
}

function renderCatalogs() {
    document.getElementById("brandsListContainer").innerHTML = appState.brands.map((b, idx) => `
        <span class="badge bg-light text-dark border p-2 d-inline-flex align-items-center gap-2">
            ${b}
            <i class="bi bi-x-circle-fill text-danger" style="cursor:pointer" onclick="removeCatalogItem('brands', ${idx})"></i>
        </span>
    `).join("");

    document.getElementById("typesListContainer").innerHTML = appState.types.map((t, idx) => `
        <span class="badge bg-light text-dark border p-2 d-inline-flex align-items-center gap-2">
            ${t}
            <i class="bi bi-x-circle-fill text-danger" style="cursor:pointer" onclick="removeCatalogItem('types', ${idx})"></i>
        </span>
    `).join("");
}

async function addCatalogItem(key, inputId) {
    const val = document.getElementById(inputId).value.trim();
    if (!val) return;
    if (!appState[key].some(item => item.toLowerCase() === val.toLowerCase())) {
        appState[key].push(val);
        await saveState();
        refreshAdminUI();
    }
    document.getElementById(inputId).value = "";
}

async function removeCatalogItem(key, idx) {
    if (appState[key].length <= 1) {
        alert("Debe existir al menos un elemento en el catálogo.");
        return;
    }
    appState[key].splice(idx, 1);
    await saveState();
    refreshAdminUI();
}

// ==================== REPORTES DE FALLA (INICIAL + SOLUCIÓN / FINALIZACIÓN) ====================
function openReportFaultModal(compId) {
    const comp = appState.components.find(c => c.id === compId);
    if (!comp) return;
    const op = getOperatorByStation(comp.modulo, comp.estacion);

    document.getElementById("faultCompId").value = comp.id;
    document.getElementById("faultCompInfo").textContent = `${comp.tipo} — ${comp.marca} ${comp.modelo}`;
    document.getElementById("faultCompSerie").textContent = comp.serie;
    document.getElementById("faultLocationInfo").textContent = `Módulo ${comp.modulo} | Estación ${comp.estacion} (${op ? op.nombre : "Sin operador"})`;

    document.getElementById("faultForm").reset();
    clearImageField("faultPhotoInput", "faultPhotoPreview", "currentFaultPhoto");
    new bootstrap.Modal(document.getElementById("reportFaultModal")).show();
}

async function submitFaultReport(e) {
    e.preventDefault();
    const compId = document.getElementById("faultCompId").value;
    const comp = appState.components.find(c => c.id === compId);
    if (!comp) return;

    const op = getOperatorByStation(comp.modulo, comp.estacion);
    const consecutive = String(appState.faults.length + 1).padStart(3, "0");
    const year = new Date().getFullYear();
    const folio = `FALLA-${comp.modulo}-${year}-${consecutive}`;

    const newFault = {
        id: "FLT-" + Date.now(),
        folio,
        fecha: new Date().toLocaleString("es-MX"),
        modulo: comp.modulo,
        estacion: comp.estacion,
        operadorNombre: op ? op.nombre : "Administrador / No asignado",
        operadorTelefono: op ? op.telefono : "N/A",
        operadorCorreo: op ? op.correo : "N/A",
        compId: comp.id,
        compTipo: comp.tipo,
        compMarca: comp.marca,
        compModelo: comp.modelo,
        compSerie: comp.serie,
        categoria: document.getElementById("faultCategory").value,
        descripcion: document.getElementById("faultDescription").value.trim(),
        foto: currentFaultPhoto,
        estatus: "Pendiente de Atención",
        // Campos de cierre / solución
        fechaSolucion: "",
        tecnicoSolucion: "",
        tipoSolucion: "",
        notasSolucion: ""
    };

    comp.estado = "En Falla";
    appState.faults.push(newFault);
    await saveState();

    bootstrap.Modal.getInstance(document.getElementById("reportFaultModal")).hide();
    if (currentUser.role === "admin") refreshAdminUI();
    else refreshOperatorUI();

    openPrintFaultFormat(newFault.id, "initial");
}

function openResolveFaultModal(faultId) {
    const f = appState.faults.find(item => item.id === faultId);
    if (!f) return;

    document.getElementById("resolveFaultId").value = f.id;
    document.getElementById("resolveFolioInfo").textContent = f.folio;
    document.getElementById("resolveCompInfo").textContent = `${f.compTipo} (${f.compMarca} ${f.compModelo} - Serie: ${f.compSerie})`;
    document.getElementById("resolveOriginalDesc").textContent = `${f.categoria}: ${f.descripcion}`;
    document.getElementById("resolveFaultForm").reset();
    document.getElementById("resolveRestoreComponent").checked = true;

    new bootstrap.Modal(document.getElementById("resolveFaultModal")).show();
}

async function submitResolveFault(e) {
    e.preventDefault();
    const faultId = document.getElementById("resolveFaultId").value;
    const f = appState.faults.find(item => item.id === faultId);
    if (!f) return;

    f.estatus = "Finalizada";
    f.fechaSolucion = new Date().toLocaleString("es-MX");
    f.tecnicoSolucion = document.getElementById("resolveTechnician").value.trim();
    f.tipoSolucion = document.getElementById("resolveActionType").value;
    f.notasSolucion = document.getElementById("resolveNotes").value.trim();

    if (document.getElementById("resolveRestoreComponent").checked) {
        const comp = appState.components.find(c => c.id === f.compId);
        if (comp) comp.estado = "Operativo";
    }

    await saveState();
    bootstrap.Modal.getInstance(document.getElementById("resolveFaultModal")).hide();

    if (currentUser.role === "admin") refreshAdminUI();
    else refreshOperatorUI();

    openPrintFaultFormat(f.id, "solved");
}

function renderAdminFaultsTable() {
    const tbody = document.getElementById("adminFaultsTableBody");
    if (appState.faults.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No hay reportes de falla registrados.</td></tr>`;
        return;
    }
    tbody.innerHTML = appState.faults.slice().reverse().map(f => {
        const isSolved = f.estatus === "Finalizada";
        return `
        <tr>
            <td class="fw-bold text-danger font-monospace">${f.folio}<br><small class="text-muted fw-normal">${f.fecha}</small></td>
            <td><span class="badge bg-dark">Mód. ${f.modulo}</span><br><small>Estación ${f.estacion}</small></td>
            <td class="small"><strong>${f.operadorNombre}</strong><br><span class="text-muted">${f.operadorTelefono}</span></td>
            <td><strong>${f.compTipo}</strong><br><small class="font-monospace">${f.compSerie}</small></td>
            <td class="small"><strong>${f.categoria}:</strong> ${f.descripcion}</td>
            <td>
                ${isSolved
                    ? `<span class="badge bg-success">Finalizada / Arreglada</span><div class="small text-muted mt-1">Atendió: ${f.tecnicoSolucion}</div>`
                    : `<span class="badge bg-warning text-dark">${f.estatus}</span>`}
            </td>
            <td class="text-end">
                <div class="d-flex justify-content-end gap-1 flex-wrap">
                    ${!isSolved ? `
                        <button class="btn btn-sm btn-success fw-semibold" title="Dar solución y finalizar" onclick="openResolveFaultModal('${f.id}')">
                            <i class="bi bi-check2-circle me-1"></i>Resolver
                        </button>
                        <button class="btn btn-sm btn-dark" onclick="openPrintFaultFormat('${f.id}', 'initial')">
                            <i class="bi bi-printer"></i> Formato
                        </button>
                    ` : `
                        <button class="btn btn-sm btn-outline-secondary" title="Ver formato inicial" onclick="openPrintFaultFormat('${f.id}', 'initial')">
                            <i class="bi bi-file-earmark-text"></i> Inicial
                        </button>
                        <button class="btn btn-sm btn-success fw-semibold" title="Imprimir formato de falla finalizada" onclick="openPrintFaultFormat('${f.id}', 'solved')">
                            <i class="bi bi-printer-fill me-1"></i>Finalizado
                        </button>
                    `}
                </div>
            </td>
        </tr>
    `}).join("");
}

function openPrintFaultFormat(faultId, mode = "initial") {
    const f = appState.faults.find(item => item.id === faultId);
    if (!f) return;

    const isSolvedMode = mode === "solved" && f.estatus === "Finalizada";
    document.getElementById("printModalHeaderTitle").innerHTML = isSolvedMode
        ? `<i class="bi bi-file-earmark-check-fill text-success me-2"></i>Formato de Falla Finalizada / Arreglada`
        : `<i class="bi bi-printer me-2"></i>Formato Oficial de Reporte de Falla`;

    const headerTitle = isSolvedMode
        ? "DICTAMEN Y REPORTE DE FALLA FINALIZADA / ARREGLADA"
        : "REPORTE DE FALLA EN EQUIPAMIENTO DIGITAL";

    const solvedBlockHtml = isSolvedMode ? `
        <div class="print-box" style="border-color: #065f46;">
            <div class="print-box-title-solved">4. Dictamen Técnico de Solución y Cierre de Falla</div>
            <div class="row mb-1">
                <div class="col-6"><strong>Fecha y Hora de Solución:</strong> ${f.fechaSolucion}</div>
                <div class="col-6"><strong>Estatus Final:</strong> <span style="color:#065f46; font-weight:bold;">OPERATIVO / FALLA FINALIZADA</span></div>
            </div>
            <div class="row mb-2">
                <div class="col-6"><strong>Técnico / Responsable:</strong> ${f.tecnicoSolucion}</div>
                <div class="col-6"><strong>Tipo de Solución:</strong> ${f.tipoSolucion}</div>
            </div>
            <div><strong>Trabajos Realizados y Pruebas de Funcionamiento:</strong></div>
            <p class="mb-0 mt-1" style="min-height: 45px;">${f.notasSolucion}</p>
        </div>
    ` : "";

    const signaturesHtml = isSolvedMode ? `
        <div class="row text-center mt-4 pt-3">
            <div class="col-4">
                <div style="border-top: 1px solid #000; margin: 0 10px; padding-top: 4px;">
                    <strong>${f.operadorNombre}</strong><br>
                    <small>Operador MAC (Recibe de Conformidad)</small>
                </div>
            </div>
            <div class="col-4">
                <div style="border-top: 1px solid #000; margin: 0 10px; padding-top: 4px;">
                    <strong>${f.tecnicoSolucion}</strong><br>
                    <small>Técnico / Responsable de Solución</small>
                </div>
            </div>
            <div class="col-4">
                <div style="border-top: 1px solid #000; margin: 0 10px; padding-top: 4px;">
                    <strong>Vo. Bo. Responsable de Módulo / RFE</strong><br>
                    <small>Validación de Cierre</small>
                </div>
            </div>
        </div>
    ` : `
        <div class="row text-center mt-5 pt-4">
            <div class="col-6">
                <div style="border-top: 1px solid #000; margin: 0 25px; padding-top: 5px;">
                    <strong>${f.operadorNombre}</strong><br>
                    <small>Firma del Operador del Módulo MAC</small>
                </div>
            </div>
            <div class="col-6">
                <div style="border-top: 1px solid #000; margin: 0 25px; padding-top: 5px;">
                    <strong>Responsable de Módulo / Soporte Técnico</strong><br>
                    <small>Nombre y Firma de Recepción</small>
                </div>
            </div>
        </div>
    `;

    const printHtml = `
        <div class="d-flex justify-content-between align-items-center border-bottom border-2 border-dark pb-2 mb-3">
            <div>
                <h5 class="fw-bold mb-0">MÓDULOS DE ATENCIÓN CIUDADANA (MAC)</h5>
                <div class="fw-semibold" style="color: ${isSolvedMode ? '#065f46' : '#D5007F'};">${headerTitle}</div>
            </div>
            <div class="text-end">
                <div class="fw-bold fs-6 text-danger">${f.folio}</div>
                <div class="small">Emisión: ${f.fecha}</div>
            </div>
        </div>

        <div class="print-box">
            <div class="print-box-title">1. Datos de Ubicación y Operador Responsable</div>
            <div class="row">
                <div class="col-6"><strong>Módulo MAC:</strong> ${f.modulo}</div>
                <div class="col-6"><strong>Estación de Trabajo:</strong> Estación ${f.estacion}</div>
                <div class="col-12 mt-1"><strong>Nombre del Operador:</strong> ${f.operadorNombre}</div>
                <div class="col-6 mt-1"><strong>Teléfono:</strong> ${f.operadorTelefono}</div>
                <div class="col-6 mt-1"><strong>Correo Institucional:</strong> ${f.operadorCorreo}</div>
            </div>
        </div>

        <div class="print-box">
            <div class="print-box-title">2. Identificación del Componente Afectado</div>
            <div class="row">
                <div class="col-6"><strong>Tipo de Componente:</strong> ${f.compTipo}</div>
                <div class="col-6"><strong>Marca / Modelo:</strong> ${f.compMarca} ${f.compModelo}</div>
                <div class="col-12 mt-1"><strong>Número de Serie / Inventario:</strong> <span class="font-monospace fw-bold">${f.compSerie}</span></div>
            </div>
        </div>

        <div class="print-box">
            <div class="print-box-title">3. Diagnóstico y Descripción de la Falla Reportada</div>
            <div class="mb-1"><strong>Clasificación:</strong> ${f.categoria}</div>
            <div><strong>Descripción detallada:</strong></div>
            <p class="mb-0 mt-1" style="min-height: ${isSolvedMode ? '38px' : '60px'};">${f.descripcion}</p>
            ${f.foto && !isSolvedMode ? `<div class="mt-2 text-center"><img src="${f.foto}" style="max-height: 150px; border: 1px solid #94a3b8;"></div>` : ""}
        </div>

        ${solvedBlockHtml}
        ${signaturesHtml}

        <div class="text-muted text-center mt-3" style="font-size: 10px;">
            Formato temporal generado por Sistema de Control de Componentes MAC • Módulos 050351, 050353 y 050354
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
            alert("No se pudo iniciar la cámara. Verifica permisos o ingresa el código manualmente.\nDetalle: " + err);
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

// ==================== EXPORTACIÓN EXCEL (.XLSX) ====================
function exportInventoryExcel() {
    if (appState.components.length === 0) {
        alert("No hay componentes registrados para exportar.");
        return;
    }

    const rows = appState.components.map((c, idx) => {
        const op = getOperatorByStation(c.modulo, c.estacion);
        return {
            "#": idx + 1,
            "Módulo MAC": c.modulo,
            "Estación": `Estación ${c.estacion}`,
            "Operador Asignado": op ? op.nombre : "Sin asignar",
            "Teléfono Operador": op ? op.telefono : "",
            "Correo Institucional": op ? op.correo : "",
            "Tipo de Componente": c.tipo,
            "Marca": c.marca,
            "Modelo": c.modelo,
            "Número de Serie": c.serie,
            "Estado": c.estado,
            "Observaciones": c.notas || "",
            "Fecha Registro": c.fechaRegistro || ""
        };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
        { wch: 5 }, { wch: 12 }, { wch: 12 }, { wch: 28 }, { wch: 16 },
        { wch: 28 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 22 },
        { wch: 14 }, { wch: 25 }, { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Inventario Componentes");

    if (appState.operators.length > 0) {
        const opRows = appState.operators.map((o, i) => ({
            "#": i + 1,
            "Módulo": o.modulo,
            "Estación": `Estación ${o.estacion}`,
            "Nombre Completo": o.nombre,
            "Teléfono": o.telefono,
            "Correo Institucional": o.correo
        }));
        const wsOp = XLSX.utils.json_to_sheet(opRows);
        XLSX.utils.book_append_sheet(wb, wsOp, "Operadores Asignados");
    }

    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Inventario_Componentes_MACs_${fecha}.xlsx`);
}

function exportFaultsExcel() {
    if (appState.faults.length === 0) {
        alert("No hay reportes de falla para exportar.");
        return;
    }

    const rows = appState.faults.map((f, i) => ({
        "#": i + 1,
        "Folio": f.folio,
        "Fecha Reporte": f.fecha,
        "Módulo": f.modulo,
        "Estación": `Estación ${f.estacion}`,
        "Operador": f.operadorNombre,
        "Teléfono": f.operadorTelefono,
        "Correo": f.operadorCorreo,
        "Componente": f.compTipo,
        "Marca / Modelo": `${f.compMarca} ${f.compModelo}`,
        "Número de Serie": f.compSerie,
        "Tipo Falla": f.categoria,
        "Descripción Falla": f.descripcion,
        "Estatus": f.estatus,
        "Fecha Solución": f.fechaSolucion || "Pendiente",
        "Técnico Responsable": f.tecnicoSolucion || "",
        "Tipo Solución": f.tipoSolucion || "",
        "Trabajos Realizados": f.notasSolucion || ""
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
        { wch: 5 }, { wch: 20 }, { wch: 18 }, { wch: 10 }, { wch: 12 },
        { wch: 26 }, { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 20 },
        { wch: 20 }, { wch: 22 }, { wch: 35 }, { wch: 18 }, { wch: 18 },
        { wch: 24 }, { wch: 24 }, { wch: 35 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Bitácora de Fallas");
    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Bitacora_Fallas_MACs_${fecha}.xlsx`);
}

// ==================== EXPOSICIÓN GLOBAL PARA EVENTOS HTML ====================
Object.assign(window, {
    switchLoginTab,
    updateLoginStations,
    previewOperatorProfile,
    loginAsOperator,
    loginAsAdmin,
    logout,
    switchOpTab,
    switchAdminTab,
    onAdminCompModuloChange,
    updateCompAssignedOperatorHint,
    saveComponent,
    editComponent,
    resetComponentForm,
    deleteComponent,
    renderAdminInventoryTable,
    updateOpRegStations,
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
    exportInventoryExcel,
    exportFaultsExcel
});
