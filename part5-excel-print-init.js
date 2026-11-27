import {
    ADMIN_PASS,
    appState,
    currentUser,
    activeOpTab,
    DEFAULT_AVATAR,
    DISTRICT_AREAS,
    normalizeText,
    normalizeUnitKey,
    isDistrictArea,
    formatUnitLabel,
    populateUnitSelect,
    sortAlphaEs,
    isNoAplicaComponent,
    countRealComponents,
    normalizeComponentRecord,
    formatStationLabel,
    getOperatorByStation,
    fillStationOptions,
    saveState,
    initFirebaseRealtimeListener
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
    onAreaConfigSelectChange,
    onAreaSlotsInputChange,
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
            const mod = normalizeUnitKey(saved.modulo);
            const est = Number(saved.estacion);
            const op = getOperatorByStation(mod, est);
            if (!op) return false;

            window.currentUser = { role: "operator", modulo: mod, estacion: est, operator: op };
            document.getElementById("loginScreen").classList.add("d-none");
            document.getElementById("mainApp").classList.remove("d-none");
            document.getElementById("adminView").classList.add("d-none");
            document.getElementById("operatorView").classList.remove("d-none");
            const unitShort = formatUnitLabel(mod, { short: true });
            const estTxt = formatStationLabel(est, false, mod);
            document.getElementById("sessionBadge").innerHTML = `<i class="bi bi-person-badge-fill text-danger me-1"></i>${op.nombre_completo} (${unitShort} • ${estTxt})`;
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
        const btn = document.getElementById(`adm-tab-${t}`);
        const sec = document.getElementById(`admSection${t.charAt(0).toUpperCase() + t.slice(1)}`);
        if (btn) btn.classList.toggle("active", t === tab);
        if (sec) sec.classList.toggle("d-none", t !== tab);
    });
    if (tab === "inventario") renderAdminInventoryGrouped();
    if (tab === "stock") renderAdminStockTable();
    if (tab === "traspasos") renderTransfersPanel();
    if (tab === "operadores") renderOperatorsTable();
    if (tab === "fallas") renderAdminFaultsTable();
    if (tab === "config") renderCatalogs();
    persistSession();
}

function getTotalSlotsCount() {
    const macSlots = Object.values(appState.estaciones || {}).reduce((acc, n) => acc + 1 + Math.max(0, Number(n || 0)), 0);
    const areaSlots = Object.values(appState.areas_distritales || {}).reduce((acc, n) => acc + Math.max(1, Number(n || 1)), 0);
    return macSlots + areaSlots;
}

export function refreshAdminUI({ preserveSelection = false } = {}) {
    const realAssignedCount = countRealComponents(appState.componentes);
    document.getElementById("adminStatTotal").textContent = realAssignedCount;
    document.getElementById("adminStatOperators").textContent = appState.operadores.length;
    document.getElementById("adminStatStations").textContent = getTotalSlotsCount();

    const openFaults = appState.tickets_fallas.filter(f => f.estatus_ticket !== "Finalizada").length;
    document.getElementById("adminStatFaults").textContent = openFaults;
    document.getElementById("admFaultBadge").textContent = openFaults;
    document.getElementById("admStockBadge").textContent = (appState.stock_resguardo || []).length;

    const alertBar = document.getElementById("adminTicketAlertBar");
    if (alertBar) {
        if (openFaults > 0) {
            alertBar.classList.remove("d-none");
            alertBar.classList.add("d-flex");
            document.getElementById("adminTicketAlertCount").textContent = openFaults;
        } else {
            alertBar.classList.add("d-none");
            alertBar.classList.remove("d-flex");
        }
    }

    const prevMod = normalizeUnitKey(document.getElementById("compModulo").value || "050351");
    const prevEst = Number(document.getElementById("compEstacion").value || (isDistrictArea(prevMod) ? 1 : 0));

    document.getElementById("cfg-050351").value = appState.estaciones["050351"] ?? 0;
    document.getElementById("cfg-050353").value = appState.estaciones["050353"] ?? 0;
    document.getElementById("cfg-050354").value = appState.estaciones["050354"] ?? 0;
    onAreaConfigSelectChange();

    populateUnitSelect(document.getElementById("compModulo"));
    document.getElementById("compModulo").value = prevMod;

    fillStationOptions(document.getElementById("compEstacion"), prevMod, {
        selectedValue: preserveSelection ? prevEst : (isDistrictArea(prevMod) ? 1 : 0)
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
    const mod = normalizeUnitKey(document.getElementById("compModulo").value);
    const defEst = isDistrictArea(mod) ? 1 : 0;
    fillStationOptions(document.getElementById("compEstacion"), mod, { selectedValue: defEst });
    updateCompAssignedOperatorHint();
}

export function onAdminStationOrBrandChange() {
    updateCompAssignedOperatorHint();
    onModalBrandOrTypeChange();
}

export function updateCompAssignedOperatorHint() {
    const mod = normalizeUnitKey(document.getElementById("compModulo").value);
    const est = Number(document.getElementById("compEstacion").value ?? (isDistrictArea(mod) ? 1 : 0));
    const hint = document.getElementById("compOperatorHint");
    const op = getOperatorByStation(mod, est);
    if (op) {
        hint.textContent = `Asignado a: ${op.nombre_completo} (${op.correo_institucional})`;
        hint.className = "text-success fw-semibold";
    } else if (isDistrictArea(mod)) {
        hint.textContent = `${formatUnitLabel(mod, { short: true })} (${formatStationLabel(est, false, mod)}): sin integrante asignado aun`;
        hint.className = "text-danger fw-semibold";
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
export function editStockById(id) {
    editStockByIdBase(id);
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
        const modKey = normalizeUnitKey(c.modulo);
        const op = getOperatorByStation(modKey, c.estacion);
        const isNA = isNoAplicaComponent(c);
        return {
            "num": idx + 1,
            "modulo": modKey,
            "area_o_modulo": formatUnitLabel(modKey, { short: true }),
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
        { wch: 6 }, { wch: 18 }, { wch: 20 }, { wch: 10 }, { wch: 22 },
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
            "operador": "",
            "telefono": "",
            "correo": "",
            "observaciones": "Equipo principal de estacion"
        },
        {
            "modulo": "cartografia",
            "estacion": 1,
            "tipo_componente": "Tableta",
            "marca": "Samsung",
            "modelo": "Galaxy Tab",
            "numero_serie": "TAB-EJEMPLO-001",
            "inventario_ine": "INV-002",
            "serie_cpu_vinculada": "",
            "serie_lente": "",
            "serie_docking": "",
            "estado_fisico": "Operativo",
            "operador": "Cartografo 1",
            "telefono": "8660000001",
            "correo": "cartografo1@ine.mx",
            "observaciones": ""
        },
        {
            "modulo": "soporte_tecnico",
            "estacion": 1,
            "tipo_componente": "Telefono IP",
            "marca": "Cisco",
            "modelo": "IP Phone 7841",
            "numero_serie": "TEL-EJEMPLO-001",
            "inventario_ine": "INV-003",
            "serie_cpu_vinculada": "",
            "serie_lente": "",
            "serie_docking": "",
            "estado_fisico": "Operativo",
            "operador": "",
            "telefono": "",
            "correo": "",
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

function ensureUnitCapacity(modulo, estacion) {
    if (isDistrictArea(modulo)) {
        if (!appState.areas_distritales) appState.areas_distritales = {};
        const actual = Math.max(1, Number(appState.areas_distritales[modulo] || 1));
        if (estacion > actual) appState.areas_distritales[modulo] = estacion;
    } else {
        const actual = Math.max(0, Number(appState.estaciones?.[modulo] || 0));
        if (estacion > actual) {
            appState.estaciones[modulo] = estacion;
            appState.config_estaciones = { ...appState.estaciones };
        }
    }
}

function upsertImportedOperator(modulo, estacion, nombre, telefono, correo) {
    if (!nombre) return false;
    if (!Array.isArray(appState.operadores)) appState.operadores = [];
    const idx = appState.operadores.findIndex(
        o => normalizeUnitKey(o.modulo) === modulo && Number(o.estacion) === estacion
    );
    if (idx !== -1) {
        appState.operadores[idx] = {
            ...appState.operadores[idx],
            nombre_completo: nombre,
            telefono: telefono || appState.operadores[idx].telefono || "N/A",
            correo_institucional: (correo || appState.operadores[idx].correo_institucional || "sin.correo@ine.mx").toLowerCase()
        };
    } else {
        appState.operadores.push({
            id: "OP-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
            modulo,
            estacion,
            nombre_completo: nombre,
            telefono: telefono || "N/A",
            correo_institucional: (correo || "sin.correo@ine.mx").toLowerCase(),
            foto_url: ""
        });
    }
    return true;
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
            let opsUpserted = 0;

            const validUnits = ["050351", "050353", "050354", ...DISTRICT_AREAS.map(a => a.key)];

            jsonRows.forEach(row => {
                const modRaw = parseRowValue(row, ["modulo", "Modulo", "MODULO", "módulo", "Módulo", "area", "Area"]);
                const normalizedMod = normalizeUnitKey(modRaw);
                const modulo = validUnits.includes(normalizedMod) ? normalizedMod : "050351";

                const defaultEst = isDistrictArea(modulo) ? 1 : 0;
                const estRaw = parseRowValue(row, ["estacion", "Estacion", "ESTACION", "estación", "Estación", "puesto", "Puesto", "persona", "Persona"]);
                const estacion = estRaw === "" ? defaultEst : Math.max(isDistrictArea(modulo) ? 1 : 0, parseInt(estRaw, 10) || defaultEst);

                ensureUnitCapacity(modulo, estacion);

                const opNombre = parseRowValue(row, ["operador", "Operador", "responsable", "Responsable", "nombre", "Nombre", "nombre_completo"]);
                const opTel = parseRowValue(row, ["telefono", "Telefono", "Teléfono", "tel"]);
                const opCorreo = parseRowValue(row, ["correo", "Correo", "email", "Email", "correo_institucional"]);
                if (upsertImportedOperator(modulo, estacion, opNombre, opTel, opCorreo)) {
                    opsUpserted++;
                }

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
                             normalizeUnitKey(c.modulo) === modulo &&
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
            alert(`Importacion completada.
• Equipos nuevos: ${added}
• Equipos actualizados: ${updated}
• Operadores/puestos procesados: ${opsUpserted}
• Omitidos: ${skipped}`);
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
        "modulo": normalizeUnitKey(f.modulo),
        "area_o_modulo": formatUnitLabel(f.modulo, { short: true }),
        "estacion": Number(f.estacion),
        "usuario": f.usuario_nombre,
        "correo_usuario": f.usuario_correo,
        "tipo_componente": f.tipo_componente,
        "marca": f.marca,
        "modelo": f.modelo,
        "numero_serie": f.numero_serie,
        "categoria_falla": f.categoria_falla,
        "descripcion_falla": f.descripcion_falla,
        "estatus_ticket": f.estatus_ticket,
        "fecha_cierre": f.fecha_cierre || "",
        "tecnico_responsable": f.tecnico_responsable || "",
        "tipo_solucion": f.tipo_solucion || "",
        "notas_seguimiento": f.notas_seguimiento || ""
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
    ADMIN_PASS,
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
    onAreaConfigSelectChange,
    onAreaSlotsInputChange,
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
    populateUnitSelect(document.getElementById("loginModulo"));
    populateUnitSelect(document.getElementById("adminFilterModulo"), { includeAll: true });
    populateUnitSelect(document.getElementById("trSourceModulo"), { includeAll: true, allLabel: "Todos los Modulos y Areas" });
    populateUnitSelect(document.getElementById("trTargetModulo"));
    populateUnitSelect(document.getElementById("opRegModulo"));
    populateUnitSelect(document.getElementById("filterOpModulo"), { includeAll: true });
    populateUnitSelect(document.getElementById("assignStockModulo"));
    populateUnitSelect(document.getElementById("compModulo"));

    onLoginModuloChange();
    onOpRegModuloChange();
    fillStationOptions(document.getElementById("compEstacion"), "050351", { selectedValue: 0 });
    renderCatalogs();

    const restored = tryRestoreSession();

    initFirebaseRealtimeListener(() => {
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
