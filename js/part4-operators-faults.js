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
    const modulo = document.getElementById("loginModulo").value;
    fillStationOptions(document.getElementById("loginEstacion"), modulo, {
        onlyUserName: true,
        selectedValue: 0
    });
    previewOperatorProfile();
}

export function previewOperatorProfile() {
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

export function loginAsOperator(e) {
    e.preventDefault();
    const modulo = document.getElementById("loginModulo").value;
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
        const estText = Number(currentUser.estacion) === 0 ? "Estacion 0 • Servidor" : `Estacion ${currentUser.estacion}`;
        document.getElementById("sessionBadge").innerHTML = `<i class="bi bi-person-badge me-1"></i>${currentUser.modulo} | ${estText}`;
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

// ==================== OPERADORES ====================
export function onOpRegModuloChange() {
    const modulo = document.getElementById("opRegModulo").value;
    fillStationOptions(document.getElementById("opRegEstacion"), modulo, {
        includeRoleHint: true,
        selectedValue: 0
    });
    updateOpRoleHint();
}

export function updateOpRoleHint() {
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

export async function saveOperator(e) {
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

export function editOperator(id) {
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
    const modToKeep = keepModulo ?? document.getElementById("opRegModulo").value;
    const estToKeep = keepEstacion ?? 0;

    document.getElementById("operatorForm").reset();
    document.getElementById("editOpId").value = "";
    document.getElementById("opFotoInput").value = "";
    document.getElementById("opPhotoPreview").classList.add("d-none");
    setCurrentOpPhoto("");
    document.getElementById("opFormTitle").innerHTML = `<i class="bi bi-person-plus-fill text-danger me-2"></i>Registrar Operador / Responsable`;
    document.getElementById("btnCancelEditOp").classList.add("d-none");

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

// ==================== ESTACIONES Y CATÁLOGOS (ORDEN ALFABÉTICO) ====================
export async function saveStationCounts() {
    appState.estaciones["050351"] = Math.max(0, Number(document.getElementById("cfg-050351").value));
    appState.estaciones["050353"] = Math.max(0, Number(document.getElementById("cfg-050353").value));
    appState.estaciones["050354"] = Math.max(0, Number(document.getElementById("cfg-050354").value));
    await saveState();
    refreshAdminUI({ preserveSelection: true });
    alert("Estaciones actualizadas correctamente.");
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
    document.getElementById("faultLocationInfo").textContent = `${comp.modulo} | ${formatStationLabel(comp.estacion)} (${op ? op.nombre_completo : "Sin asignar"})`;

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
    else refreshOperatorUI(openPrintFaultFormat);

    alert(`Ticket de Servicio generado: ${folio_ticket}\nSe ha registrado para seguimiento del Administrador y se abrira la Hoja de Servicio para firmas.`);
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

export function openPrintFaultFormat(faultId, mode = "initial") {
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
