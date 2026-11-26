import {
    appState,
    currentUser,
    normalizeText,
    isNoAplicaComponent,
    normalizeComponentRecord,
    normalizeStockRecord,
    getComponentIcon,
    formatStationLabel,
    getOperatorByStation,
    fillStationOptions,
    saveState
} from "./part1-core.js";

function findAssignedComponentBySerial(serie, excludeId = "") {
    const clean = String(serie || "").trim().toUpperCase();
    if (!clean || clean === "NO APLICA") return null;
    return (appState.componentes || []).find(
        c => !isNoAplicaComponent(c) &&
             String(c.numero_serie || "").trim().toUpperCase() === clean &&
             c.id !== excludeId
    ) || null;
}

// ==================== STOCK / BODEGA Y DESINCORPORACIÓN ====================
export function onStockStatusChange() {
    const estatus = document.getElementById("stockEstatus").value;
    const desincSel = document.getElementById("stockDesincorporacion");
    desincSel.value = estatus === "Falla" ? "Si" : "No";
    onStockDesincChange();
}

export function onStockDesincChange() {
    const desinc = document.getElementById("stockDesincorporacion").value;
    const fechaEl = document.getElementById("stockFechaDesinc");
    if (desinc === "Si" && !fechaEl.value) {
        fechaEl.value = new Date().toISOString().slice(0, 10);
    }
}

export function openStockModal(stockItemToEdit = null) {
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

export function editStockById(id) {
    const item = appState.stock_resguardo.find(s => s.id === id);
    if (!item) return;
    openStockModal(item);
}

export async function saveStockFromModal(e, refreshAdminUI) {
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

    const dupStock = (appState.stock_resguardo || []).find(
        s => String(s.numero_serie || "").trim().toUpperCase() === numero_serie && s.id !== editId
    );
    if (dupStock) {
        alert(`La serie "${numero_serie}" ya está registrada en Stock (Origen: ${dupStock.origen}).`);
        return;
    }

    const dupComp = findAssignedComponentBySerial(numero_serie);
    if (dupComp) {
        alert(
            `La serie "${numero_serie}" ya está asignada en Inventario Global:\n` +
            `• Módulo / Estación: ${dupComp.modulo} / ${formatStationLabel(dupComp.estacion)}\n` +
            `• Equipo: ${dupComp.tipo_componente} (${dupComp.marca} ${dupComp.modelo})\n\n` +
            `Primero envíalo a Stock desde su estación o retira la asignación previa antes de registrarlo aquí.`
        );
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
    if (typeof refreshAdminUI === "function") refreshAdminUI({ preserveSelection: true });
}

export async function deleteStockItem(id, refreshAdminUI) {
    if (!confirm("¿Seguro que deseas eliminar este registro del apartado de Stock?")) return;
    appState.stock_resguardo = appState.stock_resguardo.filter(s => s.id !== id);
    await saveState();
    if (typeof refreshAdminUI === "function") refreshAdminUI({ preserveSelection: true });
}

export async function markStockAsDesincorporated(id, refreshAdminUI) {
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
    if (typeof refreshAdminUI === "function") refreshAdminUI({ preserveSelection: true });
}

// ==================== ASIGNAR EQUIPO DESDE STOCK A MÓDULO / ESTACIÓN ====================
export function openAssignStockModal(stockId) {
    const item = (appState.stock_resguardo || []).find(s => s.id === stockId);
    if (!item) return;

    const formEl = document.getElementById("assignStockForm");
    if (formEl) formEl.reset();

    document.getElementById("assignStockId").value = item.id;
    document.getElementById("assignStockSummary").innerHTML = `
        <div><strong>${item.descripcion}</strong> — ${item.marca} ${item.modelo}</div>
        <div class="text-muted">Serie: <strong class="font-monospace">${item.numero_serie}</strong> | Inv. INE: <strong>${item.inventario_ine || "—"}</strong></div>
    `;

    const modSel = document.getElementById("assignStockModulo");
    const defaultMod = ["050351", "050353", "050354"].includes(item.origen) ? item.origen : "050351";
    modSel.value = defaultMod;
    populateAssignStockEstaciones(0);
    document.getElementById("assignStockObservaciones").value = item.observaciones || "";

    bootstrap.Modal.getOrCreateInstance(document.getElementById("assignStockModal")).show();
}

export function populateAssignStockEstaciones(selectedEst = 0) {
    const mod = document.getElementById("assignStockModulo").value || "050351";
    const estSel = document.getElementById("assignStockEstacion");
    fillStationOptions(estSel, mod, { includeRoleHint: true, selectedValue: selectedEst });
    updateAssignStockOperatorHint();
}

export function updateAssignStockOperatorHint() {
    const mod = document.getElementById("assignStockModulo")?.value;
    const est = Number(document.getElementById("assignStockEstacion")?.value ?? 0);
    const hint = document.getElementById("assignStockOperatorHint");
    if (!hint || !mod) return;
    const op = getOperatorByStation(mod, est);
    hint.textContent = op
        ? `Responsable/Operador destino: ${op.nombre_completo} (${op.correo_institucional})`
        : "Sin usuario asignado en esta estación destino";
    hint.className = op ? "text-success d-block mt-1 fw-semibold" : "text-danger d-block mt-1 fw-semibold";
}

export async function confirmAssignStockToModule(event, refreshAdminUI) {
    event.preventDefault();
    const stockId = document.getElementById("assignStockId").value;
    const stockIndex = (appState.stock_resguardo || []).findIndex(s => s.id === stockId);
    if (stockIndex === -1) return;

    const item = appState.stock_resguardo[stockIndex];
    const moduloDestino = document.getElementById("assignStockModulo").value;
    const estacionDestino = Number(document.getElementById("assignStockEstacion").value);
    const obsAsignacion = document.getElementById("assignStockObservaciones").value.trim();

    if (item.numero_serie) {
        const serieNorm = String(item.numero_serie || "").trim().toUpperCase();
        const dupComp = findAssignedComponentBySerial(serieNorm);
        const otherStockMatches = (appState.stock_resguardo || []).filter(
            (s, idx) => idx !== stockIndex && String(s.numero_serie || "").trim().toUpperCase() === serieNorm
        );

        if (dupComp) {
            const ubicacionModulo = `${dupComp.modulo} / ${formatStationLabel(dupComp.estacion)}`;
            const opModulo = getOperatorByStation(dupComp.modulo, dupComp.estacion);
            const respTxt = opModulo ? ` (${opModulo.nombre_completo})` : "";

            const detalleStock = otherStockMatches.length
                ? `\n• También aparece repetida en ${otherStockMatches.length} registro(s) adicional(es) de Stock.`
                : `\n• Actualmente también figura en Stock (Origen: ${item.origen || "—"}).`;

            const removeFromStock = confirm(
                `La serie "${item.numero_serie}" ya está asignada en:\n` +
                `• Módulo / Estación: ${ubicacionModulo}${respTxt}\n` +
                `• Componente: ${dupComp.tipo_componente} (${dupComp.marca} ${dupComp.modelo})` +
                detalleStock + `\n\n` +
                `No se asignará duplicada al ${moduloDestino} / ${formatStationLabel(estacionDestino)}.\n` +
                `¿Deseas eliminar este registro duplicado de Stock para que ya no aparezca ahí?`
            );

            if (removeFromStock) {
                appState.stock_resguardo.splice(stockIndex, 1);
                await saveState();
                const modalEl = document.getElementById("assignStockModal");
                const inst = bootstrap.Modal.getInstance(modalEl);
                if (inst) inst.hide();
                if (typeof refreshAdminUI === "function") refreshAdminUI({ preserveSelection: true });
            }
            return;
        }
    }

    const nuevoComponente = normalizeComponentRecord({
        id: "CMP-" + Date.now(),
        modulo: moduloDestino,
        estacion: estacionDestino,
        tipo_componente: item.descripcion || "Computadora / CPU",
        marca: item.marca || "Generico",
        modelo: item.modelo || "N/A",
        numero_serie: item.numero_serie,
        inventario_ine: item.inventario_ine || "",
        serie_lente: item.serie_lente || "",
        estado_fisico: "Operativo",
        observaciones: obsAsignacion || item.observaciones || "Asignado desde Stock",
        registrado_por: "Administrador",
        fecha_registro: new Date().toLocaleString("es-MX")
    });

    if (nuevoComponente.marca && nuevoComponente.marca !== "NO APLICA" && !appState.marcas.some(m => normalizeText(m) === normalizeText(nuevoComponente.marca))) {
        appState.marcas.push(nuevoComponente.marca);
    }
    if (nuevoComponente.tipo_componente && !appState.tipos_componente.some(t => normalizeText(t) === normalizeText(nuevoComponente.tipo_componente))) {
        appState.tipos_componente.push(nuevoComponente.tipo_componente);
    }

    appState.componentes.push(nuevoComponente);
    appState.stock_resguardo.splice(stockIndex, 1);

    const destinoTexto = `${moduloDestino} / ${formatStationLabel(estacionDestino)}${getOperatorByStation(moduloDestino, estacionDestino) ? " - " + getOperatorByStation(moduloDestino, estacionDestino).nombre_completo : ""}`;
    const logEntry = recordTransferLog({
        tipo_movimiento: "Asignación desde Stock a Módulo",
        comp: nuevoComponente,
        origen_texto: `Stock / Resguardo (Origen ${item.origen || "050351"})`,
        destino_texto: destinoTexto,
        oficio: item.oficio_desincorporacion || "",
        motivo: obsAsignacion || "Asignación desde Stock"
    });

    await saveState();
    const modalEl = document.getElementById("assignStockModal");
    const inst = bootstrap.Modal.getInstance(modalEl);
    if (inst) inst.hide();

    if (typeof refreshAdminUI === "function") refreshAdminUI({ preserveSelection: true });
    openPrintTransferFormat(logEntry.id);
}

export function renderAdminStockTable() {
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
    const search = normalizeText(document.getElementById("stockSearchInput")?.value || "");

    const filtered = list.filter(s => {
        const isDesinc = isDesincRecord(s);
        const effectiveStatus = isDesinc ? "Desincorporado" : (s.estatus || "Stock");
        const effectiveDesinc = isDesinc ? "Si" : "No";

        if (fEstatus !== "ALL" && effectiveStatus !== fEstatus) return false;
        if (fDesinc !== "ALL" && effectiveDesinc !== fDesinc) return false;
        if (search) {
            const haystack = normalizeText(`${s.origen} ${s.destino} ${s.inventario_ine} ${s.descripcion} ${s.marca} ${s.modelo} ${s.numero_serie} ${s.serie_lente} ${effectiveStatus} ${effectiveDesinc} ${s.fecha_desincorporacion} ${s.oficio_desincorporacion} ${s.observaciones}`);
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
        const dupComp = findAssignedComponentBySerial(s.numero_serie);

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
                    ${dupComp ? `<div class="text-danger small fw-semibold mt-1"><i class="bi bi-exclamation-triangle me-1"></i>También en ${dupComp.modulo} / ${formatStationLabel(dupComp.estacion)}</div>` : ""}
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
                            <button class="btn btn-outline-primary fw-semibold py-0 px-1" style="font-size: 0.72rem;" title="Asignar a Módulo y Estación" onclick="openAssignStockModal('${s.id}')">
                                <i class="bi bi-box-arrow-right"></i> Asignar
                            </button>
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

export function exportStockExcel() {
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

// ==================== TRASPASOS Y ENVÍO A STOCK ====================
export function formatTransferOriginLabel(comp) {
    const op = getOperatorByStation(comp.modulo, comp.estacion);
    const userTxt = op ? ` - ${op.nombre_completo}` : "";
    return `${comp.modulo} / ${formatStationLabel(comp.estacion)}${userTxt}`;
}

export function recordTransferLog({ tipo_movimiento, comp, origen_texto, destino_texto, oficio, motivo }) {
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

export function openMoveToStockModal(compId) {
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

export function onMtsStatusChange() {
    const est = document.getElementById("mtsEstatus").value;
    document.getElementById("mtsDesinc").value = est === "Falla" ? "Si" : "No";
}

export async function confirmMoveComponentToStock(e, hooks = {}) {
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

    if (currentUser?.role === "operator" && typeof hooks.refreshOperatorUI === "function") hooks.refreshOperatorUI();
    else if (typeof hooks.refreshAdminUI === "function") hooks.refreshAdminUI({ preserveSelection: true });

    openPrintTransferFormat(logEntry.id);
}

export function renderTransfersPanel() {
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

export function onTransferSourceChange() {
    renderTransfersPanel();
}

export function onTransferComponentSelected() {
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

export function onTransferActionChange() {
    const action = document.getElementById("trActionType")?.value || "station";
    document.getElementById("trStationTargetBox")?.classList.toggle("d-none", action !== "station");
    document.getElementById("trStockTargetBox")?.classList.toggle("d-none", action !== "stock");
    if (action === "station") updateTransferTargetHint();
}

export function onTransferTargetModuloChange() {
    const mod = document.getElementById("trTargetModulo").value;
    fillStationOptions(document.getElementById("trTargetEstacion"), mod, { selectedValue: 0 });
    updateTransferTargetHint();
}

export function updateTransferTargetHint() {
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

export function onTrStockStatusChange() {
    const est = document.getElementById("trStockEstatus").value;
    document.getElementById("trStockDesinc").value = est === "Falla" ? "Si" : "No";
}

export async function submitDirectTransfer(e, refreshAdminUI) {
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
        if (typeof refreshAdminUI === "function") refreshAdminUI({ preserveSelection: true });
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
        if (typeof refreshAdminUI === "function") refreshAdminUI({ preserveSelection: true });
        openPrintTransferFormat(logEntry.id);
    }
}

export function renderTransferHistoryTable() {
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

export function openPrintTransferFormat(logId) {
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
