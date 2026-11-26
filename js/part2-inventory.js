import {
    appState,
    currentUser,
    activeOpTab,
    DEFAULT_AVATAR,
    html5QrCode,
    targetScannerInputId,
    currentCompPhoto,
    setCurrentCompPhoto,
    setHtml5QrCode,
    setTargetScannerInputId,
    normalizeText,
    sortAlphaEs,
    isNoAplicaComponent,
    countRealComponents,
    normalizeComponentRecord,
    getComponentIcon,
    isMonitorType,
    isCpuType,
    isCameraType,
    isLaptopType,
    getAvailableCpusForStation,
    formatStationLabel,
    getOperatorByStation,
    fillStationOptions,
    saveState
} from "./part1-core.js";

// ==================== UTILIDADES DE IMAGEN, ESTADO Y MODAL DE COMPONENTE ====================
export function previewImageFile(event, previewDivId, imgId, targetVarName) {
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

            if (targetVarName === "currentCompPhoto") setCurrentCompPhoto(compressed);

            document.getElementById(imgId).src = compressed;
            document.getElementById(previewDivId).classList.remove("d-none");
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

export function clearImageField(inputId, previewDivId, targetVarName) {
    document.getElementById(inputId).value = "";
    document.getElementById(previewDivId).classList.add("d-none");
    if (targetVarName === "currentCompPhoto") setCurrentCompPhoto("");
}

export function showPhotoModal(src, title) {
    document.getElementById("modalFullImage").src = src;
    document.getElementById("photoModalTitle").textContent = title;
    new bootstrap.Modal(document.getElementById("photoModal")).show();
}

export function getStatusBadge(status) {
    if (status === "Operativo") return `<span class="badge bg-success-subtle text-success border border-success-subtle">Operativo</span>`;
    if (status === "Stock") return `<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle">Stock</span>`;
    if (status === "En Falla") return `<span class="badge bg-danger-subtle text-danger border border-danger-subtle">En Falla</span>`;
    if (status === "En Revision" || status === "En Revisión") return `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">En Revision</span>`;
    if (status === "No Aplica") return `<span class="badge bg-light text-secondary border">No Aplica</span>`;
    return `<span class="badge bg-secondary-subtle text-secondary border">Baja</span>`;
}

export function updateCpuLinkSelector(currentSerieValue = "") {
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

export function onCompCpuSelectChange() {
    const selVal = document.getElementById("compCpuSelect").value;
    if (selVal) {
        document.getElementById("compSerieCpuVinculada").value = selVal;
    }
}

export function updateLensFieldVisibility(currentLensValue = "") {
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

export function updateDockingFieldVisibility(currentDockingValue = "") {
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

export function populateModalDropdowns() {
    const brandSel = document.getElementById("compMarca");
    const currBrand = brandSel.value;
    const sortedBrands = sortAlphaEs(appState.marcas);
    const brandsList = sortedBrands.includes("NO APLICA") ? sortedBrands : ["NO APLICA", ...sortedBrands];
    brandSel.innerHTML = brandsList.map(b => `<option value="${b}">${b}</option>`).join("");
    if (currBrand && brandsList.includes(currBrand)) brandSel.value = currBrand;

    const typeSel = document.getElementById("compTipo");
    const currType = typeSel.value;
    const sortedTypes = sortAlphaEs(appState.tipos_componente);
    typeSel.innerHTML = sortedTypes.map(t => `<option value="${t}">${t}</option>`).join("");
    if (currType && sortedTypes.includes(currType)) typeSel.value = currType;
}

export function applyModalBrandLockState() {
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

export function onModalBrandOrTypeChange() {
    applyModalBrandLockState();
    updateCpuLinkSelector();
    updateLensFieldVisibility();
    updateDockingFieldVisibility();
}

export function openComponentModal(context = "admin", compToEdit = null, hooks = {}) {
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
        if (typeof hooks.updateCompAssignedOperatorHint === "function") hooks.updateCompAssignedOperatorHint();
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

        setCurrentCompPhoto(isNA ? "" : (compToEdit.foto_url || ""));
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

export async function saveComponentFromModal(e, hooks = {}) {
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

    if (isOp && typeof hooks.refreshOperatorUI === "function") hooks.refreshOperatorUI();
    else if (typeof hooks.refreshAdminUI === "function") hooks.refreshAdminUI({ preserveSelection: true });
}

// ==================== RENDERIZADO AGRUPADO, FILTROS Y ESCÁNER ====================
export function groupComponentsByType(list) {
    const map = new Map();
    list.forEach(c => {
        const key = c.tipo_componente || "Sin Tipo";
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(c);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "es", { sensitivity: "base" }));
}

export function renderGroupedCardsHtml(items, { showLocation = false } = {}) {
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

export function editComponentById(id, hooks = {}) {
    const c = appState.componentes.find(item => item.id === id);
    if (!c) return;
    const ctx = currentUser && currentUser.role === "operator" ? "op" : "admin";
    openComponentModal(ctx, c, hooks);
}

export async function deleteComponent(id, hooks = {}) {
    if (!confirm("¿Seguro que deseas eliminar este registro del inventario?")) return;
    appState.componentes = appState.componentes.filter(c => c.id !== id);
    await saveState();
    if (currentUser && currentUser.role === "operator" && typeof hooks.refreshOperatorUI === "function") {
        hooks.refreshOperatorUI();
    } else if (typeof hooks.refreshAdminUI === "function") {
        hooks.refreshAdminUI({ preserveSelection: true });
    }
}

export function populateFilterDropdown() {
    const filterType = document.getElementById("adminFilterTipo");
    const currFilter = normalizeText(filterType.value);
    const sortedTypes = sortAlphaEs(appState.tipos_componente);
    filterType.innerHTML = `<option value="ALL">Todos los Componentes</option>` +
        sortedTypes.map(t => `<option value="${t}">${t}</option>`).join("");
    if (currFilter && currFilter !== "all") {
        const match = [...filterType.options].find(o => normalizeText(o.value) === currFilter);
        if (match) filterType.value = match.value;
    }
}

export function renderAdminInventoryGrouped() {
    const fMod = document.getElementById("adminFilterModulo").value;
    const fTipo = document.getElementById("adminFilterTipo").value;
    const search = normalizeText(document.getElementById("adminSearchInput").value);

    const filtered = appState.componentes.filter(c => {
        if (fMod !== "ALL" && c.modulo !== fMod) return false;
        if (fTipo !== "ALL" && normalizeText(c.tipo_componente) !== normalizeText(fTipo)) return false;
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

            const haystack = normalizeText(`${c.tipo_componente} ${c.estado_fisico} ${compDetails} ${opName} ${estLabel} ${estAliases}`);
            const terms = search.split(/\s+/).filter(Boolean);
            if (!terms.every(term => haystack.includes(term))) return false;
        }
        return true;
    });

    document.getElementById("adminGroupedComponentsContainer").innerHTML =
        renderGroupedCardsHtml(filtered, { showLocation: true });
}

export function switchOpTab(tab, persistSessionFn) {
    setActiveOpTab(tab);
    if (typeof persistSessionFn === "function") persistSessionFn();
    document.getElementById("op-tab-equipos").classList.toggle("active", tab === "equipos");
    document.getElementById("op-tab-fallas").classList.toggle("active", tab === "fallas");
    document.getElementById("opSectionEquipos").classList.toggle("d-none", tab !== "equipos");
    document.getElementById("opSectionFallas").classList.toggle("d-none", tab !== "fallas");
}

export function refreshOperatorUI(openPrintFaultFormatFn) {
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
    if (typeof openPrintFaultFormatFn === "function" && window.openPrintFaultFormat !== openPrintFaultFormatFn) {
        window.openPrintFaultFormat = openPrintFaultFormatFn;
    }
}

export function openScanner(inputId) {
    setTargetScannerInputId(inputId);
    const modal = new bootstrap.Modal(document.getElementById("scannerModal"));
    modal.show();

    setTimeout(() => {
        const scanner = new Html5Qrcode("reader");
        setHtml5QrCode(scanner);
        scanner.start(
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

export function closeScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
            setHtml5QrCode(null);
        }).catch(() => {});
    }
    const modalEl = document.getElementById("scannerModal");
    const modalInstance = bootstrap.Modal.getInstance(modalEl);
    if (modalInstance) modalInstance.hide();
}
