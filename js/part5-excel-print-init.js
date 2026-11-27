import {
    appState,
    currentUser,
    activeOpTab,
    DEFAULT_AVATAR,
    normalizeText,
    sortAlphaEs,
    isNoAplicaComponent,
    countRealComponents,
    getTotalConfiguredStations,
    normalizeComponentRecord,
    formatStationLabel,
    getOperatorByStation,
    fillStationOptions,
    saveState,
    initCloudSync,
    DEFAULT_ADMIN_PASS
} from "./part1-core.js";

import {
    previewImageFile,
    clearImageField,
    showPhotoModal,
    onModalBrandOrTypeChange,
    onCompCpuSelectChange,
    openComponentModal as openComponentModalBase,
    saveComponentFromModal as saveComponentFromModalBase,
    editComponentById as editComponentByIdBase,
    deleteComponent as deleteComponentBase,
    populateFilterDropdown,
    renderAdminInventoryGrouped,
    switchOpTab as switchOpTabBase,
    refreshOperatorUI as refreshOperatorUIBase,
    openScanner,
    closeScanner
} from "./part2-inventory.js";

import {
    onStockStatusChange,
    onStockDesincChange,
    openStockModal,
    editStockById as editStockByIdBase,
    saveStockFromModal as saveStockFromModalBase,
    deleteStockItem as deleteStockItemBase,
    markStockAsDesincorporated as markStockAsDesincorporatedBase,
    sortStockByColumn,
    openAssignStockModal,
    populateAssignStockEstaciones,
    updateAssignStockOperatorHint,
    confirmAssignStockToModule as confirmAssignStockToModuleBase,
    renderAdminStockTable,
    exportStockExcel,
    openMoveToStockModal,
    onMtsStatusChange,
    confirmMoveComponentToStock as confirmMoveComponentToStockBase,
    renderTransfersPanel,
    onTransferSourceChange,
    onTransferComponentSelected,
    onTransferActionChange,
    onTransferTargetModuloChange,
    updateTransferTargetHint,
    onTrStockStatusChange,
    submitDirectTransfer as submitDirectTransferBase,
    renderTransferHistoryTable,
    openPrintTransferFormat
} from "./part3-stock-transfers.js";

import {
    switchLoginTab,
    onLoginModuloChange,
    previewOperatorProfile,
    loginAsOperator,
    loginAsAdmin,
    logout,
    onOpRegModuloChange,
    updateOpRoleHint,
    resetOperatorForm,
    saveOperator,
    renderOperatorsTable,
    editOperator,
    deleteOperator,
    openReportFaultModal,
    submitFaultReport as submitFaultReportBase,
    openResolveFaultModal,
    submitResolveFault as submitResolveFaultBase,
    renderAdminFaultsTable,
    openPrintFaultFormat,
    saveStationCounts,
    renderCatalogs,
    addCatalogItem,
    removeCatalogItem
} from "./part4-operators-faults.js";

// ==================== PERSISTENCIA DE SESIÓN ====================
const SESSION_STORAGE_KEY = "mac_inventario_session_v1";

function persistSession() {
    try {
        if (!currentUser) {
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
            return;
        }
        if (currentUser.role === "admin") {
            sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
                role: "admin",
                admTab: getActiveAdminTab()
            }));
        } else if (currentUser.role === "operator") {
            sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
                role: "operator",
                modulo: currentUser.modulo,
                estacion: Number(currentUser.estacion),
                opTab: activeOpTab || "equipos"
            }));
        }
    } catch (_) {}
}

function getActiveAdminTab() {
    const tabs = ["inventario", "stock", "traspasos", "operadores", "fallas", "config"];
    for (const t of tabs) {
        const el = document.getElementById(`adm-tab-${t}`);
        if (el && el.classList.contains("active")) return t;
    }
    return "inventario";
}

function tryRestoreSession() {
    try {
        const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) return false;
        const saved = JSON.parse(raw);
        if (!saved || !saved.role) return false;

        if (saved.role === "admin") {
            window.currentUser = { role: "admin" };
            document.getElementById("loginScreen").classList.add("d-none");
            document.getElementById("mainApp").classList.remove("d-none");
            document.getElementById("operatorView").classList.add("d-none");
            document.getElementById("adminView").classList.remove("d-none");
            document.getElementById("sessionBadge").innerHTML = `<i class="bi bi-shield-lock-fill text-danger me-1"></i>Administrador Global`;
            refreshAdminUI();
            switchAdminTab(saved.admTab || "inventario");
            return true;
        }

        if (saved.role === "operator") {
            const mod = saved.modulo;
            const est = Number(saved.estacion);
            const op = getOperatorByStation(mod, est);
            if (!op) return false;

            window.currentUser = { role: "operator", modulo: mod, estacion: est, operator: op };
            document.getElementById("loginScreen").classList.add("d-none");
            document.getElementById("mainApp").classList.remove("d-none");
            document.getElementById("adminView").classList.add("d-none");
            document.getElementById("operatorView").classList.remove("d-none");
            document.getElementById("sessionBadge").innerHTML = `<i class="bi bi-person-badge-fill text-danger me-1"></i>${op.nombre_completo} (${mod} • ${Number(est) === 0 ? "Est. 0" : "Est. " + est})`;
            refreshOperatorUI();
            switchOpTab(saved.opTab || "equipos");
            return true;
        }
    } catch (_) {}
    return false;
}

// ==================== WRAPPERS DE UI Y NAVEGACIÓN ====================
export function switchOpTab(tab) {
    switchOpTabBase(tab, persistSession);
}

export function refreshOperatorUI() {
    refreshOperatorUIBase(openPrintFaultFormat);
}

export function switchAdminTab(tab) {
    const tabs = ["inventario", "stock", "traspasos", "operadores", "fallas", "config"];
    tabs.forEach(t => {
        document.getElementById(`adm-tab-${t}`).classList.toggle("active", t === tab);
        document.getElementById(`admSection${t.charAt(0).toUpperCase() + t.slice(1)}`).classList.toggle("d-none", t !== tab);
    });
    if (tab === "inventario") renderAdminInventoryGrouped();
    if (tab === "stock") renderAdminStockTable();
    if (tab === "traspasos") renderTransfersPanel();
    if (tab === "operadores") renderOperatorsTable();
    if (tab === "fallas") renderAdminFaultsTable();
    if (tab === "config") renderCatalogs();
    persistSession();
}

export function refreshAdminUI({ preserveSelection = false } = {}) {
    const realAssignedCount = countRealComponents(appState.componentes);
    document.getElementById("adminStatTotal").textContent = realAssignedCount;
    document.getElementById("adminStatOperators").textContent = appState.operadores.length;
    document.getElementById("adminStatStations").textContent = getTotalConfiguredStations();

    const openFaults = appState.tickets_fallas.filter(f => f.estatus_ticket !== "Finalizada").length;
    document.getElementById("adminStatFaults").textContent = openFaults;
    document.getElementById("admFaultBadge").textContent = openFaults;
    document.getElementById("admStockBadge").textContent = (appState.stock_resguardo || []).length;

    const alertBar = document.getElementById("adminTicketAlertBar");
    if (openFaults > 0) {
        alertBar.classList.remove("d-none");
        alertBar.classList.add("d-flex");
        document.getElementById("adminTicketAlertCount").textContent = openFaults;
    } else {
        alertBar.classList.add("d-none");
        alertBar.classList.remove("d-flex");
    }

    const prevMod = document.getElementById("compModulo").value || "050351";
    const prevEst = Number(document.getElementById("compEstacion").value || 0);

    document.getElementById("cfg-050351").value = appState.config_estaciones["050351"];
    document.getElementById("cfg-050353").value = appState.config_estaciones["050353"];
    document.getElementById("cfg-050354").value = appState.config_estaciones["050354"];

    fillStationOptions(document.getElementById("compEstacion"), prevMod, {
        selectedValue: preserveSelection ? prevEst : 0
    });
    updateCompAssignedOperatorHint();

    populateFilterDropdown();
    renderAdminInventoryGrouped();
    renderAdminStockTable();
    renderTransfersPanel();
    renderOperatorsTable();
    renderAdminFaultsTable();
    renderCatalogs();
}

export function onAdminCompModuloChange() {
    const mod = document.getElementById("compModulo").value;
    fillStationOptions(document.getElementById("compEstacion"), mod, { selectedValue: 0 });
    updateCompAssignedOperatorHint();
}

export function onAdminStationOrBrandChange() {
    updateCompAssignedOperatorHint();
    onModalBrandOrTypeChange();
}

export function updateCompAssignedOperatorHint() {
    const mod = document.getElementById("compModulo").value;
    const est = Number(document.getElementById("compEstacion").value ?? 0);
    const hint = document.getElementById("compOperatorHint");
    const op = getOperatorByStation(mod, est);
    if (op) {
        hint.textContent = `Asignado a: ${op.nombre_completo} (${op.correo_institucional})`;
        hint.className = "text-success fw-semibold";
    } else {
        hint.textContent = est === 0
            ? "Estacion 0 (Servidor): sin responsable asignado aun"
            : "Estacion sin operador registrado aun";
        hint.className = "text-danger fw-semibold";
    }
}

const uiHooks = { refreshAdminUI, refreshOperatorUI, updateCompAssignedOperatorHint };

export function openComponentModal(context = "admin", compToEdit = null) {
    openComponentModalBase(context, compToEdit, uiHooks);
}
export function editComponentById(id) {
    editComponentByIdBase(id, uiHooks);
}
export async function deleteComponent(id) {
    await deleteComponentBase(id, uiHooks);
}
export async function saveComponentFromModal(e) {
    await saveComponentFromModalBase(e, uiHooks);
}
export async function saveStockFromModal(e) {
    await saveStockFromModalBase(e, refreshAdminUI);
}
export async function deleteStockItem(id) {
    await deleteStockItemBase(id, refreshAdminUI);
}
export async function markStockAsDesincorporated(id) {
    await markStockAsDesincorporatedBase(id, refreshAdminUI);
}
export async function confirmAssignStockToModule(e) {
    await confirmAssignStockToModuleBase(e, refreshAdminUI);
}
export async function confirmMoveComponentToStock(e) {
    await confirmMoveComponentToStockBase(e, uiHooks);
}
export async function submitDirectTransfer(e) {
    await submitDirectTransferBase(e, refreshAdminUI);
}
export async function submitFaultReport(e) {
    await submitFaultReportBase(e, uiHooks);
}
export async function submitResolveFault(e) {
    await submitResolveFaultBase(e, uiHooks);
}

// ==================== IMPORTAR / EXPORTAR EXCEL ====================
export function exportInventoryExcel() {
    if (!appState.componentes.length) {
        alert("No hay componentes en el inventario para exportar.");
        return;
    }

    const rows = appState.componentes.map((c, idx) => {
        const op = getOperatorByStation(c.modulo, c.estacion);
        const isNA = isNoAplicaComponent(c);
        return {
            "num": idx + 1,
            "modulo": c.modulo,
            "estacion": Number(c.estacion),
            "tipo_componente": c.tipo_componente,
            "marca": isNA ? "NO APLICA" : c.marca,
            "modelo": isNA ? "NO APLICA" : c.modelo,
            "numero_serie": isNA ? "NO APLICA" : c.numero_serie,
            "inventario_ine": isNA ? "" : (c.inventario_ine || ""),
            "serie_cpu_vinculada": isNA ? "" : (c.serie_cpu_vinculada || ""),
            "serie_lente": isNA ? "" : (c.serie_lente || ""),
            "serie_docking": isNA ? "" : (c.serie_docking || ""),
            "estado_fisico": isNA ? "No Aplica" : c.estado_fisico,
            "operador_asignado": op ? op.nombre_completo : "Sin asignar",
            "correo_operador": op ? op.correo_institucional : "",
            "observaciones": isNA ? "" : (c.observaciones || ""),
            "registrado_por": c.registrado_por || "",
            "fecha_registro": c.fecha_registro || ""
        };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
        { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 22 },
        { wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 16 },
        { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
        { wch: 26 }, { wch: 28 }, { wch: 28 }, { wch: 20 }, { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "inventario_macs");
    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `inventario_macs_distrito03_${fecha}.xlsx`);
}

export function downloadImportTemplate() {
    const sampleRows = [
        {
            "modulo": "050351",
            "estacion": 0,
            "tipo_componente": "Computadora / CPU",
            "marca": "Dell",
            "modelo": "OptiPlex 7010",
            "numero_serie": "SERIE-EJEMPLO-001",
            "inventario_ine": "INV-001",
            "serie_cpu_vinculada": "",
            "serie_lente": "",
            "serie_docking": "",
            "estado_fisico": "Operativo",
            "observaciones": "Equipo principal de estacion"
        },
        {
            "modulo": "050351",
            "estacion": 1,
            "tipo_componente": "Monitor",
            "marca": "Dell",
            "modelo": "P2222H",
            "numero_serie": "MON-EJEMPLO-001",
            "inventario_ine": "INV-002",
            "serie_cpu_vinculada": "CPU-EJEMPLO-001",
            "serie_lente": "",
            "serie_docking": "",
            "estado_fisico": "Operativo",
            "observaciones": ""
        },
        {
            "modulo": "050353",
            "estacion": 2,
            "tipo_componente": "Escaner / Scanner",
            "marca": "NO APLICA",
            "modelo": "NO APLICA",
            "numero_serie": "NO APLICA",
            "inventario_ine": "",
            "serie_cpu_vinculada": "",
            "serie_lente": "",
            "serie_docking": "",
            "estado_fisico": "No Aplica",
            "observaciones": ""
        }
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    XLSX.utils.book_append_sheet(wb, ws, "plantilla_carga");
    XLSX.writeFile(wb, "plantilla_inventario_macs.xlsx");
}

function parseRowValue(row, keys) {
    for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") {
            return String(row[k]).trim();
        }
    }
    return "";
}

export async function importInventoryExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: "array" });
            const firstSheet = wb.Sheets[wb.SheetNames[0]];
            const jsonRows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });

            if (!jsonRows.length) {
                alert("El archivo seleccionado no contiene filas para importar.");
                event.target.value = "";
                return;
            }

            let added = 0;
            let updated = 0;
            let skipped = 0;

            jsonRows.forEach(row => {
                let modRaw = parseRowValue(row, ["modulo", "Modulo", "MODULO", "módulo", "Módulo"]);
                if (modRaw === "500351") modRaw = "050351";
                const modulo = ["050351", "050353", "050354"].includes(modRaw) ? modRaw : "050351";

                const estRaw = parseRowValue(row, ["estacion", "Estacion", "ESTACION", "estación", "Estación"]);
                const estacion = estRaw === "" ? 0 : Math.max(0, parseInt(estRaw, 10) || 0);

                const tipoRaw = parseRowValue(row, ["tipo_componente", "Tipo Componente", "tipo", "Tipo", "COMPONENTES", "Componente"]) || "Computadora / CPU";
                const matchedType = appState.tipos_componente.find(t => normalizeText(t) === normalizeText(tipoRaw));
                const tipo_componente = matchedType || tipoRaw;

                const marcaRaw = parseRowValue(row, ["marca", "Marca", "MARCA"]);
                const modeloRaw = parseRowValue(row, ["modelo", "Modelo", "MODELO"]);
                const serieRaw = parseRowValue(row, ["numero_serie", "Numero Serie", "numero de serie", "Número de Serie", "serie", "Serie", "SERIE"]).toUpperCase();
                const invIne = parseRowValue(row, ["inventario_ine", "Inventario INE", "inv_ine", "inventario"]).toUpperCase();
                const serieCpuVinculada = parseRowValue(row, ["serie_cpu_vinculada", "Serie CPU Vinculada", "cpu_vinculada", "serie_cpu"]).toUpperCase();
                const serieLente = parseRowValue(row, ["serie_lente", "Serie Lente", "lente"]).toUpperCase();
                const serieDocking = parseRowValue(row, ["serie_docking", "Serie Docking", "docking"]).toUpperCase();
                const estadoRaw = parseRowValue(row, ["estado_fisico", "Estado Fisico", "Estado Físico", "estado", "Estado", "ESTATUS"]);
                const observacionesRaw = parseRowValue(row, ["observaciones", "Observaciones", "OBSERVACIONES", "notas", "Notas"]);

                const isNA =
                    normalizeText(marcaRaw) === "no aplica" ||
                    normalizeText(estadoRaw) === "no aplica" ||
                    serieRaw === "NO APLICA" ||
                    serieRaw.startsWith("NA-") ||
                    (!marcaRaw && !modeloRaw && !serieRaw);

                if (isNA) {
                    const existingNA = appState.componentes.find(
                        c => isNoAplicaComponent(c) &&
                             c.modulo === modulo &&
                             Number(c.estacion) === estacion &&
                             normalizeText(c.tipo_componente) === normalizeText(tipo_componente)
                    );
                    if (existingNA) {
                        skipped++;
                        return;
                    }
                    appState.componentes.push(normalizeComponentRecord({
                        id: "CMP-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
                        modulo,
                        estacion,
                        tipo_componente,
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
                        registrado_por: "Importacion Excel",
                        fecha_registro: new Date().toLocaleString("es-MX")
                    }));
                    added++;
                    return;
                }

                if (!serieRaw) {
                    skipped++;
                    return;
                }

                const matchedBrand = appState.marcas.find(m => normalizeText(m) === normalizeText(marcaRaw));
                const marca = matchedBrand || (marcaRaw || "Generico");
                if (marca && marca !== "NO APLICA" && !appState.marcas.some(m => normalizeText(m) === normalizeText(marca))) {
                    appState.marcas.push(marca);
                }
                if (tipo_componente && !appState.tipos_componente.some(t => normalizeText(t) === normalizeText(tipo_componente))) {
                    appState.tipos_componente.push(tipo_componente);
                }

                const validStates = ["Operativo", "En Revision", "En Falla", "Stock", "Baja"];
                const matchedState = validStates.find(s => normalizeText(s) === normalizeText(estadoRaw));
                const estado_fisico = matchedState || "Operativo";

                const existingIdx = appState.componentes.findIndex(
                    c => !isNoAplicaComponent(c) && String(c.numero_serie || "").trim().toUpperCase() === serieRaw
                );

                if (existingIdx !== -1) {
                    const prev = appState.componentes[existingIdx];
                    appState.componentes[existingIdx] = normalizeComponentRecord({
                        ...prev,
                        modulo,
                        estacion,
                        tipo_componente,
                        marca,
                        modelo: modeloRaw || prev.modelo || "N/A",
                        numero_serie: serieRaw,
                        inventario_ine: invIne || prev.inventario_ine || "",
                        serie_cpu_vinculada: serieCpuVinculada || prev.serie_cpu_vinculada || "",
                        serie_lente: serieLente || prev.serie_lente || "",
                        serie_docking: serieDocking || prev.serie_docking || "",
                        estado_fisico,
                        observaciones: observacionesRaw || prev.observaciones || ""
                    });
                    updated++;
                } else {
                    appState.componentes.push(normalizeComponentRecord({
                        id: "CMP-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
                        modulo,
                        estacion,
                        tipo_componente,
                        marca,
                        modelo: modeloRaw || "N/A",
                        numero_serie: serieRaw,
                        inventario_ine: invIne,
                        serie_cpu_vinculada: serieCpuVinculada,
                        serie_lente: serieLente,
                        serie_docking: serieDocking,
                        estado_fisico,
                        observaciones: observacionesRaw,
                        foto_url: "",
                        registrado_por: "Importacion Excel",
                        fecha_registro: new Date().toLocaleString("es-MX")
                    }));
                    added++;
                }
            });

            await saveState();
            refreshAdminUI();
            alert(`Importacion completada.\n• Nuevos agregados: ${added}\n• Existentes actualizados: ${updated}\n• Omitidos: ${skipped}`);
        } catch (err) {
            alert("Error al leer el archivo Excel/CSV: " + err.message);
        } finally {
            event.target.value = "";
        }
    };
    reader.readAsArrayBuffer(file);
}

export function exportFaultsExcel() {
    if (!appState.tickets_fallas.length) {
        alert("No hay tickets de falla registrados para exportar.");
        return;
    }

    const rows = appState.tickets_fallas.map((f, idx) => ({
        "num": idx + 1,
        "folio_ticket": f.folio_ticket,
        "fecha_reporte": f.fecha_reporte,
        "modulo": f.modulo,
        "estacion": Number(f.estacion),
        "operador": f.operador_nombre,
        "correo_operador": f.operador_correo,
        "tipo_componente": f.tipo_componente,
        "marca": f.marca,
        "modelo": f.modelo,
        "numero_serie": f.numero_serie,
        "categoria_falla": f.categoria_falla,
        "descripcion_falla": f.descripcion_falla,
        "estatus_ticket": f.estatus_ticket,
        "fecha_cierre": f.fecha_cierre || "",
        "tecnico_solucion": f.tecnico_solucion || "",
        "accion_solucion": f.accion_solucion || "",
        "notas_solucion": f.notas_solucion || ""
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "tickets_fallas");
    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `tickets_fallas_macs_${fecha}.xlsx`);
}

// ==================== IMPRESIÓN LIMPIA DEDICADA ====================
export function printReportArea() {
    const sourceEl = document.getElementById("printFormatArea");
    const sheetEl = document.getElementById("printSheetContainer");
    if (!sourceEl || !sheetEl) return;

    sheetEl.innerHTML = sourceEl.innerHTML;

    const cleanup = () => {
        sheetEl.innerHTML = "";
        window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);

    setTimeout(() => {
        window.print();
        setTimeout(cleanup, 1500);
    }, 120);
}

// ==================== EXPOSICIÓN GLOBAL PARA HANDLERS HTML ====================
Object.assign(window, {
    DEFAULT_ADMIN_PASS,
    switchLoginTab,
    onLoginModuloChange,
    previewOperatorProfile,
    loginAsOperator,
    loginAsAdmin,
    logout,
    switchOpTab,
    switchAdminTab,
    onAdminCompModuloChange,
    onAdminStationOrBrandChange,
    onModalBrandOrTypeChange,
    onCompCpuSelectChange,
    openComponentModal,
    saveComponentFromModal,
    editComponentById,
    deleteComponent,
    renderAdminInventoryGrouped,
    onStockStatusChange,
    onStockDesincChange,
    openStockModal,
    editStockById,
    saveStockFromModal,
    deleteStockItem,
    markStockAsDesincorporated,
    sortStockByColumn,
    openAssignStockModal,
    populateAssignStockEstaciones,
    updateAssignStockOperatorHint,
    confirmAssignStockToModule,
    renderAdminStockTable,
    exportStockExcel,
    openMoveToStockModal,
    onMtsStatusChange,
    confirmMoveComponentToStock,
    renderTransfersPanel,
    onTransferSourceChange,
    onTransferComponentSelected,
    onTransferActionChange,
    onTransferTargetModuloChange,
    updateTransferTargetHint,
    onTrStockStatusChange,
    submitDirectTransfer,
    renderTransferHistoryTable,
    openPrintTransferFormat,
    onOpRegModuloChange,
    updateOpRoleHint,
    resetOperatorForm,
    saveOperator,
    renderOperatorsTable,
    editOperator,
    deleteOperator,
    openReportFaultModal,
    submitFaultReport,
    openResolveFaultModal,
    submitResolveFault,
    openPrintFaultFormat,
    saveStationCounts,
    addCatalogItem,
    removeCatalogItem,
    exportInventoryExcel,
    downloadImportTemplate,
    importInventoryExcel,
    exportFaultsExcel,
    printReportArea,
    previewImageFile,
    clearImageField,
    showPhotoModal,
    openScanner,
    closeScanner
});

// ==================== INICIALIZACIÓN DE LA APLICACIÓN ====================
window.addEventListener("DOMContentLoaded", () => {
    onLoginModuloChange();
    onOpRegModuloChange();
    fillStationOptions(document.getElementById("compEstacion"), "050351", { selectedValue: 0 });
    renderCatalogs();

    const restored = tryRestoreSession();

    initCloudSync(() => {
        if (restored && currentUser) {
            if (currentUser.role === "admin") {
                refreshAdminUI({ preserveSelection: true });
            } else if (currentUser.role === "operator") {
                const updatedOp = getOperatorByStation(currentUser.modulo, currentUser.estacion);
                if (updatedOp) currentUser.operator = updatedOp;
                refreshOperatorUI();
            }
            return;
        }

        if (!currentUser) {
            onLoginModuloChange();
            return;
        }
        if (currentUser.role === "operator") {
            const updatedOp = getOperatorByStation(currentUser.modulo, currentUser.estacion);
            if (updatedOp) currentUser.operator = updatedOp;
            refreshOperatorUI();
        } else if (currentUser.role === "admin") {
            refreshAdminUI({ preserveSelection: true });
        }
    });
});
