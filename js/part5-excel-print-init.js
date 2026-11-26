import {
    appState,
    currentUser,
    normalizeText,
    sortAlphaEs,
    isNoAplicaComponent,
    countRealComponents,
    normalizeComponentRecord,
    isMonitorType,
    isCameraType,
    isLaptopType,
    formatStationLabel,
    getOperatorByStation,
    fillStationOptions,
    restoreSession,
    saveState,
    initFirebaseRealtimeListener
} from "./part1-core.js";

import {
    previewImageFile,
    clearImageField,
    showPhotoModal,
    onCompCpuSelectChange,
    onModalBrandOrTypeChange,
    openComponentModal,
    saveComponentFromModal,
    editComponentById,
    deleteComponent,
    renderAdminInventoryGrouped,
    switchOpTab,
    refreshOperatorUI,
    openScanner,
    closeScanner
} from "./part2-inventory.js";

import {
    onStockStatusChange,
    onStockDesincChange,
    openStockModal,
    editStockById,
    saveStockFromModal,
    deleteStockItem,
    markStockAsDesincorporated,
    openAssignStockModal,
    populateAssignStockEstaciones,
    confirmAssignStockToModule,
    renderAdminStockTable,
    exportStockExcel,
    openMoveToStockModal,
    onMtsStatusChange,
    confirmMoveComponentToStock,
    onTransferSourceChange,
    onTransferComponentSelected,
    onTransferActionChange,
    onTransferTargetModuloChange,
    updateTransferTargetHint,
    onTrStockStatusChange,
    submitDirectTransfer,
    openPrintTransferFormat
} from "./part3-stock-transfers.js";

import {
    switchLoginTab,
    onLoginModuloChange,
    previewOperatorProfile,
    loginAsOperator,
    loginAsAdmin,
    enterApp,
    logout,
    switchAdminTab,
    refreshAdminUI,
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
    openPrintFaultFormat
} from "./part4-operators-faults.js";

// ==================== HOOKS DE COORDINACIÓN ====================
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

function onAdminCompModuloChange() {
    const modulo = document.getElementById("compModulo").value;
    fillStationOptions(document.getElementById("compEstacion"), modulo, { selectedValue: 0 });
    onModalBrandOrTypeChange();
    updateCompAssignedOperatorHint();
}

function onAdminStationOrBrandChange() {
    onModalBrandOrTypeChange();
    updateCompAssignedOperatorHint();
}

// ==================== CARGA RÁPIDA DE TABLAS MAC (RESPALDO) ====================
function buildComponentsFromTable(modulo, tableRows, sourceTag) {
    return tableRows.map((item, idx) => {
        const isNA =
            String(item.serie || "").trim().toUpperCase() === "NO APLICA" ||
            String(item.marca || "").trim().toUpperCase() === "NO APLICA" ||
            String(item.estado || "").trim().toLowerCase() === "no aplica";

        return normalizeComponentRecord({
            id: `CMP-${modulo}-E${item.est}-${idx + 1}-${Date.now()}`,
            modulo,
            estacion: item.est,
            tipo_componente: item.tipo,
            marca: isNA ? "NO APLICA" : item.marca,
            modelo: isNA ? "NO APLICA" : item.modelo,
            numero_serie: isNA ? "NO APLICA" : item.serie,
            inventario_ine: isNA || item.inv === "NO APLICA" ? "" : item.inv,
            serie_cpu_vinculada: !isNA && isMonitorType(item.tipo) ? item.cpuVinc : "",
            serie_lente: !isNA && isCameraType(item.tipo) ? item.lente : "",
            serie_docking: !isNA && isLaptopType(item.tipo) ? item.docking : "",
            estado_fisico: isNA ? "No Aplica" : item.estado,
            observaciones: isNA ? "" : item.obs,
            registrado_por: sourceTag,
            fecha_registro: new Date().toLocaleString("es-MX")
        });
    });
}

async function replaceMac050351WithNewTable() {
    const table050351 = [
        { est: 0, tipo: "Computadora / CPU", marca: "Lenovo", modelo: "LENOVO", serie: "J101CBVA", inv: "22-J101CBVA", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Monitor", marca: "Lenovo", modelo: "ThinkVision", serie: "FALTA DATO 01", inv: "22-FALTA DATO 01", cpuVinc: "J101CBVA", lente: "", docking: "", estado: "En Revision", obs: "Estacion 0 - Serie pendiente" },
        { est: 0, tipo: "Camara Fotografica", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 0, tipo: "Pad de Firmas", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 0, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939581299", inv: "971977", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Impresora", marca: "Samsung", modelo: "M4020ND", serie: "ZD7YBJCGC000TEN", inv: "22-882385", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Escaner Digitalizador", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 0, tipo: "Lector QR / Codigo Barras", marca: "Syble", modelo: "SYBLE", serie: "9286360", inv: "22-9286360", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 1, tipo: "Computadora / CPU", marca: "Lenovo", modelo: "LENOVO", serie: "MZ006XB6", inv: "22-MZ006XB6", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Monitor", marca: "Lenovo", modelo: "ThinkVision", serie: "1563EBMARZLAVNAA5DYL", inv: "22-A5DYL", cpuVinc: "MZ006XB6", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Camara Fotografica", marca: "Canon", modelo: "EOS REBEL T7", serie: "182072002447", inv: "22-1119350", cpuVinc: "", lente: "7797051400", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-540", serie: "1AQ0021006261", inv: "20210763", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939653071", inv: "1498521", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Impresora", marca: "Brother", modelo: "HL-L6400DW", serie: "U64185C3N148105", inv: "C-2023-0127", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Escaner Digitalizador", marca: "HP", modelo: "SCANJET2500F1", serie: "CN78GAIOMF", inv: "920941", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Lector QR / Codigo Barras", marca: "Nextep", modelo: "NE-503", serie: "22030479", inv: "C-INE-084-2022-0131", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 2, tipo: "Computadora / CPU", marca: "Lenovo", modelo: "LENOVO", serie: "MZ006X9G", inv: "22-MZ006X9G", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Monitor", marca: "Lenovo", modelo: "ThinkVision", serie: "1563EBMAR2LVNAA7BXD", inv: "22-7BXD", cpuVinc: "MZ006X9G", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Camara Fotografica", marca: "Canon", modelo: "EOS REBEL T7", serie: "182072035453", inv: "22-1119352", cpuVinc: "", lente: "7897038386", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-540", serie: "1AQ00210006264", inv: "20210764", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939591234", inv: "1025911", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Impresora", marca: "Brother", modelo: "HL-L6200DW", serie: "U64180G9N592971", inv: "22-1120418", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Escaner Digitalizador", marca: "Xerox", modelo: "Duplex Combo", serie: "06CUQ30426", inv: "EM-000360", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Lector QR / Codigo Barras", marca: "Datalogic", modelo: "Quickscan QW2100", serie: "G13H03190", inv: "22-G13H03190", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 3, tipo: "Computadora / CPU", marca: "Lenovo", modelo: "LENOVO", serie: "MZ006XB5", inv: "22-MZ006XB5", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 3" },
        { est: 3, tipo: "Monitor", marca: "Lenovo", modelo: "ThinkVision", serie: "FALTA DATO 01-E3", inv: "22-FALTA DATO 01", cpuVinc: "MZ006XB5", lente: "", docking: "", estado: "En Revision", obs: "Estacion 3 - Serie original: FALTA DATO 01" },
        { est: 3, tipo: "Camara Fotografica", marca: "Canon", modelo: "EOS REBEL T7", serie: "182072003396", inv: "22-1119351", cpuVinc: "", lente: "7797057314", docking: "", estado: "Operativo", obs: "Estacion 3" },
        { est: 3, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-540", serie: "1AQ00210006263", inv: "20210765", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 3" },
        { est: 3, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939581300", inv: "971978", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 3" },
        { est: 3, tipo: "Impresora", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 3, tipo: "Escaner Digitalizador", marca: "HP", modelo: "SCANJET2500F1", serie: "CN77UA10MD", inv: "915529", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 3" },
        { est: 3, tipo: "Lector QR / Codigo Barras", marca: "Datalogic", modelo: "Quickscan QW2100", serie: "G13H03199", inv: "22-G13H03199", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 3" },
        { est: 4, tipo: "Computadora / CPU", marca: "Lenovo", modelo: "LENOVO", serie: "MZ006XCH", inv: "22-MZ006XCH", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 4" },
        { est: 4, tipo: "Monitor", marca: "Lenovo", modelo: "ThinkVision", serie: "FALTA DATO 02", inv: "22-FALTA DATO 02", cpuVinc: "MZ006XCH", lente: "", docking: "", estado: "En Revision", obs: "Estacion 4 - Serie pendiente" },
        { est: 4, tipo: "Camara Fotografica", marca: "Canon", modelo: "EOS REBEL T7", serie: "542076008381", inv: "22-1938463", cpuVinc: "", lente: "1839000871", docking: "", estado: "Operativo", obs: "Estacion 4" },
        { est: 4, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-540", serie: "1AQ0021006262", inv: "20210767", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 4" },
        { est: 4, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939581303", inv: "971977", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 4" },
        { est: 4, tipo: "Impresora", marca: "Brother", modelo: "HL-L6400DW", serie: "U64185C3N146921", inv: "C-2023-0127", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 4" },
        { est: 4, tipo: "Escaner Digitalizador", marca: "HP", modelo: "SCANJET2500F1", serie: "CN77UA10MB", inv: "915928", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 4" },
        { est: 4, tipo: "Lector QR / Codigo Barras", marca: "Syble", modelo: "SYBLE", serie: "92868361", inv: "22-92868361", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 4" },
        { est: 5, tipo: "Computadora / CPU", marca: "Lenovo", modelo: "LENOVO", serie: "MZ006XC2", inv: "22-MZ006XC2", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 5" },
        { est: 5, tipo: "Monitor", marca: "Lenovo", modelo: "ThinkVision", serie: "FALTA DATO 03", inv: "22-FALTA DATO 03", cpuVinc: "MZ006XC2", lente: "", docking: "", estado: "En Revision", obs: "Estacion 5 - Serie pendiente" },
        { est: 5, tipo: "Camara Fotografica", marca: "Canon", modelo: "EOS REBEL T7", serie: "542076008341", inv: "22-1938423", cpuVinc: "", lente: "1839003531", docking: "", estado: "Operativo", obs: "Estacion 5" },
        { est: 5, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-540", serie: "1AQ0021006265", inv: "20210766", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 5" },
        { est: 5, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939653070", inv: "1498520", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 5" },
        { est: 5, tipo: "Impresora", marca: "Brother", modelo: "HL-L6400DW", serie: "U64185C3N148136", inv: "C-2023-0125", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 5" },
        { est: 5, tipo: "Escaner Digitalizador", marca: "HP", modelo: "SCANJET2500F1", serie: "CN77UA10RB", inv: "915530", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 5" },
        { est: 5, tipo: "Lector QR / Codigo Barras", marca: "Datalogic", modelo: "Quickscan QW2100", serie: "G13H03198", inv: "22-G13H03198", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 5" },
        { est: 6, tipo: "Computadora / CPU", marca: "Lenovo", modelo: "LENOVO", serie: "MZ006X8C", inv: "22-MZ006X8C", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 6" },
        { est: 6, tipo: "Monitor", marca: "Lenovo", modelo: "ThinkVision", serie: "FALTA DATO 04", inv: "22-FALTA DATO 04", cpuVinc: "MZ006X8C", lente: "", docking: "", estado: "En Revision", obs: "Estacion 6 - Serie pendiente" },
        { est: 6, tipo: "Camara Fotografica", marca: "Canon", modelo: "EOS REBEL T7", serie: "182072002426", inv: "22-1119353", cpuVinc: "", lente: "7797051361", docking: "", estado: "Operativo", obs: "Estacion 6" },
        { est: 6, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-540", serie: "1AQ002100777", inv: "20220020", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 6" },
        { est: 6, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939591235", inv: "1025912", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 6" },
        { est: 6, tipo: "Impresora", marca: "Brother", modelo: "HL-L6200DW", serie: "U64185G9N592966", inv: "22-1120407", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 6" },
        { est: 6, tipo: "Escaner Digitalizador", marca: "HP", modelo: "SCANJET2500F1", serie: "CN75BA1086", inv: "893584", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 6" },
        { est: 6, tipo: "Lector QR / Codigo Barras", marca: "Nextep", modelo: "NE-503", serie: "22030471", inv: "C-INE-084-2022-0129", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 6" },
        { est: 7, tipo: "Computadora / CPU", marca: "Lenovo", modelo: "LENOVO", serie: "MZ006X9Z", inv: "22-MZ006X9Z", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 7" },
        { est: 7, tipo: "Monitor", marca: "Lenovo", modelo: "ThinkVision", serie: "FALTA DATO 05", inv: "22-FALTA DATO 05", cpuVinc: "MZ006X9Z", lente: "", docking: "", estado: "En Revision", obs: "Estacion 7 - Serie pendiente" },
        { est: 7, tipo: "Camara Fotografica", marca: "Canon", modelo: "EOS REBEL T8", serie: "542076008365", inv: "22-1938446", cpuVinc: "", lente: "1839003590", docking: "", estado: "Operativo", obs: "Estacion 7" },
        { est: 7, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-540", serie: "1AQ0021006289", inv: "20220026", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 7" },
        { est: 7, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939681297", inv: "971976", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 7" },
        { est: 7, tipo: "Impresora", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 7, tipo: "Escaner Digitalizador", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 7, tipo: "Lector QR / Codigo Barras", marca: "Syble", modelo: "SYBLE", serie: "92770092", inv: "22-92770092", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 7" }
    ];

    const otherModulesComponents = appState.componentes.filter(c => c.modulo !== "050351");
    const new050351Components = buildComponentsFromTable("050351", table050351, "Carga Tabla 050351");

    appState.estaciones["050351"] = Math.max(7, Number(appState.estaciones["050351"] ?? 7));
    new050351Components.forEach(c => {
        if (!isNoAplicaComponent(c) && c.marca && !appState.marcas.some(m => normalizeText(m) === normalizeText(c.marca))) {
            appState.marcas.push(c.marca);
        }
        if (c.tipo_componente && !appState.tipos_componente.some(t => normalizeText(t) === normalizeText(c.tipo_componente))) {
            appState.tipos_componente.push(c.tipo_componente);
        }
    });
    appState.marcas = sortAlphaEs(appState.marcas);
    appState.tipos_componente = sortAlphaEs(appState.tipos_componente);

    appState.componentes = [...otherModulesComponents, ...new050351Components];
    await saveState();
    if (currentUser && currentUser.role === "admin") refreshAdminUI({ preserveSelection: true });
    alert(`Listo: se cargaron ${countRealComponents(new050351Components)} equipos reales del MAC 050351 (Estaciones 0 a 7).`);
}

async function replaceMac050353WithNewTable() {
    const table050353 = [
        { est: 0, tipo: "Laptop", marca: "Lenovo", modelo: "THINK PAD", serie: "PW0ADNN0", inv: "22-PW0ADNN0", cpuVinc: "", lente: "", docking: "ZVQ1GKN6", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Camara Fotografica", marca: "Canon", modelo: "EOS REBEL T3", serie: "322174038405", inv: "698585", cpuVinc: "", lente: "747048982", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-540", serie: "1AQ0021006292", inv: "20220027", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939653073", inv: "1498523", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Impresora", marca: "Brother", modelo: "HL-L6400DW", serie: "U64185C3N146918", inv: "C-2023-0129", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Escaner Digitalizador", marca: "HP", modelo: "SCANJET2500F1", serie: "CN75BA107F", inv: "893585", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Lector QR / Codigo Barras", marca: "Syble", modelo: "QCPASS", serie: "92770091", inv: "22-92770091", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 1, tipo: "Laptop", marca: "Lenovo", modelo: "THINK PAD", serie: "PW0ADNGF", inv: "22-PW0ADNGF", cpuVinc: "", lente: "", docking: "ZVQ1GKLQ", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Camara Fotografica", marca: "Canon", modelo: "EOS REBEL T7", serie: "542076008401", inv: "1938477", cpuVinc: "", lente: "1839000903", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-540", serie: "1AQ0021006291", inv: "20220028", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939591237", inv: "1025910", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Impresora", marca: "Brother", modelo: "HL-L6400DW", serie: "U64185M2N935019", inv: "C-2023-0128", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Escaner Digitalizador", marca: "Xerox", modelo: "LEX COMBO", serie: "06CUQ30558", inv: "202100013", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Lector QR / Codigo Barras", marca: "Nextep", modelo: "NE-503", serie: "22030448", inv: "22-22030448", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 2, tipo: "Laptop", marca: "Lenovo", modelo: "THINK PAD", serie: "PW0ADNNB", inv: "22-PW0ADNNB", cpuVinc: "", lente: "", docking: "ZVQ1GEFW", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Camara Fotografica", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 2, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-500B", serie: "3LZT001600", inv: "22-FALTA DATO01", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2 - Inv. pendiente: 22-FALTA DATO01" },
        { est: 2, tipo: "Escaner de Huellas", marca: "Morpho", modelo: "IDEMIA MORPHO TOP", serie: "1826S002646", inv: "853342", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Impresora", marca: "Brother", modelo: "HL-L6200DW", serie: "U6418G9N592969", inv: "C-2023-0129", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Escaner Digitalizador", marca: "HP", modelo: "SCANJET2500F1", serie: "CN75BA107K", inv: "893586", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Lector QR / Codigo Barras", marca: "Syble", modelo: "QCPASS", serie: "92770093", inv: "22-893586", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 3, tipo: "Laptop", marca: "Lenovo", modelo: "THINK PAD", serie: "PW0ADNN7", inv: "22-PW0ADNN7", cpuVinc: "", lente: "", docking: "FALTA DATO", estado: "Operativo", obs: "Estacion 3 - Docking pendiente" },
        { est: 3, tipo: "Camara Fotografica", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 3, tipo: "Pad de Firmas", marca: "Generico", modelo: "FALTA DATO", serie: "FALTA DATO-050353-E3", inv: "FALTA DATO", cpuVinc: "", lente: "", docking: "", estado: "En Revision", obs: "Estacion 3 - Datos pendientes (FALTA DATO)" },
        { est: 3, tipo: "Escaner de Huellas", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 3, tipo: "Impresora", marca: "Samsung", modelo: "M4020ND", serie: "ZD7YBJCGC000SFA", inv: "C-2023-0130", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 3" },
        { est: 3, tipo: "Escaner Digitalizador", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 3, tipo: "Lector QR / Codigo Barras", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" }
    ];

    const otherModulesComponents = appState.componentes.filter(c => c.modulo !== "050353");
    const new050353Components = buildComponentsFromTable("050353", table050353, "Carga Tabla 050353");

    appState.estaciones["050353"] = Math.max(3, Number(appState.estaciones["050353"] ?? 3));
    new050353Components.forEach(c => {
        if (!isNoAplicaComponent(c) && c.marca && !appState.marcas.some(m => normalizeText(m) === normalizeText(c.marca))) {
            appState.marcas.push(c.marca);
        }
        if (c.tipo_componente && !appState.tipos_componente.some(t => normalizeText(t) === normalizeText(c.tipo_componente))) {
            appState.tipos_componente.push(c.tipo_componente);
        }
    });
    appState.marcas = sortAlphaEs(appState.marcas);
    appState.tipos_componente = sortAlphaEs(appState.tipos_componente);

    appState.componentes = [...otherModulesComponents, ...new050353Components];
    await saveState();
    if (currentUser && currentUser.role === "admin") refreshAdminUI({ preserveSelection: true });
    alert(`Listo: se cargaron ${countRealComponents(new050353Components)} equipos reales del MAC 050353 (Estaciones 0 a 3).`);
}

async function replaceMac050354WithNewTable() {
    const table050354 = [
        { est: 0, tipo: "Laptop", marca: "Lenovo", modelo: "Lenovo", serie: "PW-0ADNMX", inv: "22-PW-0ADNMX", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Camara Fotografica", marca: "Canon", modelo: "EOS REBEL T7", serie: "542076008407", inv: "1938483", cpuVinc: "", lente: "1839000909", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-540", serie: "1AQ0021006290", inv: "20210771", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939585760", inv: "1025913", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Impresora", marca: "Brother", modelo: "HL-L6400DW", serie: "U64185C3N146912", inv: "C-2023-0131", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Escaner Digitalizador", marca: "Xerox", modelo: "duplex combo CSANNR", serie: "06CUQ30488", inv: "202100012", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 0, tipo: "Lector QR / Codigo Barras", marca: "Nextep", modelo: "NE-503", serie: "22030449", inv: "20220136", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 0" },
        { est: 1, tipo: "Laptop", marca: "Lenovo", modelo: "Lenovo", serie: "PW-0ADNSE", inv: "22-PW-0ADNSE", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Camara Fotografica", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 1, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-540", serie: "1AQ0021006286", inv: "20210772", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Escaner de Huellas", marca: "Suprema", modelo: "REALSCAN.G10", serie: "939653074", inv: "1498524", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Impresora", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 1, tipo: "Escaner Digitalizador", marca: "Xerox", modelo: "duplex combo CSANNR", serie: "06CUQ30601", inv: "202100014", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 1, tipo: "Lector QR / Codigo Barras", marca: "Syble", modelo: "SYBLE", serie: "92770108", inv: "22-92770108", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 1" },
        { est: 2, tipo: "Laptop", marca: "Lenovo", modelo: "Lenovo", serie: "PW-0ADNVL", inv: "22-PW-0ADNVL", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Camara Fotografica", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 2, tipo: "Pad de Firmas", marca: "Wacom", modelo: "STU-500B", serie: "3LZT001758", inv: "850727", cpuVinc: "", lente: "", docking: "", estado: "Operativo", obs: "Estacion 2" },
        { est: 2, tipo: "Escaner de Huellas", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 2, tipo: "Impresora", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 2, tipo: "Escaner Digitalizador", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" },
        { est: 2, tipo: "Lector QR / Codigo Barras", marca: "NO APLICA", modelo: "NO APLICA", serie: "NO APLICA", inv: "NO APLICA", cpuVinc: "", lente: "", docking: "", estado: "No Aplica", obs: "" }
    ];

    const otherModulesComponents = appState.componentes.filter(c => c.modulo !== "050354");
    const new050354Components = buildComponentsFromTable("050354", table050354, "Carga Tabla 050354");

    appState.estaciones["050354"] = Math.max(2, Number(appState.estaciones["050354"] ?? 2));
    new050354Components.forEach(c => {
        if (!isNoAplicaComponent(c) && c.marca && !appState.marcas.some(m => normalizeText(m) === normalizeText(c.marca))) {
            appState.marcas.push(c.marca);
        }
        if (c.tipo_componente && !appState.tipos_componente.some(t => normalizeText(t) === normalizeText(c.tipo_componente))) {
            appState.tipos_componente.push(c.tipo_componente);
        }
    });
    appState.marcas = sortAlphaEs(appState.marcas);
    appState.tipos_componente = sortAlphaEs(appState.tipos_componente);

    appState.componentes = [...otherModulesComponents, ...new050354Components];
    await saveState();
    if (currentUser && currentUser.role === "admin") refreshAdminUI({ preserveSelection: true });
    alert(`Listo: se cargaron ${countRealComponents(new050354Components)} equipos reales del MAC 050354 (Estaciones 0 a 2).`);
}

// ==================== PLANTILLA, IMPORTACIÓN Y EXPORTACIÓN EXCEL ====================
function downloadImportTemplate() {
    const sampleRows = [
        {
            "modulo": "050351",
            "estacion": 0,
            "tipo_componente": "Computadora / CPU",
            "marca": "Lenovo",
            "modelo": "LENOVO",
            "numero_serie": "J101CBVA",
            "inventario_ine": "22-J101CBVA",
            "serie_cpu_vinculada": "",
            "serie_lente": "",
            "serie_docking": "",
            "estado_fisico": "Operativo",
            "observaciones": "Estacion 0"
        },
        {
            "modulo": "050351",
            "estacion": 1,
            "tipo_componente": "Monitor",
            "marca": "Lenovo",
            "modelo": "ThinkVision",
            "numero_serie": "1563EBMARZLAVNAA5DYL",
            "inventario_ine": "22-A5DYL",
            "serie_cpu_vinculada": "MZ006XB6",
            "serie_lente": "",
            "serie_docking": "",
            "estado_fisico": "Operativo",
            "observaciones": "Estacion 1"
        }
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    ws["!cols"] = [
        { wch: 10 }, { wch: 10 }, { wch: 24 }, { wch: 15 },
        { wch: 20 }, { wch: 24 }, { wch: 18 }, { wch: 22 },
        { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 25 }
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
            const estadoRaw = String(raw["estado_fisico"] ?? raw["Estado"] ?? "").trim();
            const serieRaw = String(raw["numero_serie"] ?? raw["Serie"] ?? raw["Número de Serie"] ?? "").trim().toUpperCase();

            const isNA =
                marcaRaw.toUpperCase() === "NO APLICA" ||
                estadoRaw.toLowerCase() === "no aplica" ||
                serieRaw === "NO APLICA";

            if (!["050351", "050353", "050354"].includes(modulo)) {
                invalidRows++;
                continue;
            }

            if (!isNA && !serieRaw) {
                invalidRows++;
                continue;
            }

            if (!isNA) {
                const exists = appState.componentes.some(c => !isNoAplicaComponent(c) && c.numero_serie === serieRaw);
                if (exists) {
                    skippedDup++;
                    continue;
                }
            }

            const marca = isNA ? "NO APLICA" : marcaRaw;
            const modelo = isNA ? "NO APLICA" : (String(raw["modelo"] ?? raw["Modelo"] ?? "N/A").trim() || "N/A");
            const numero_serie = isNA ? "NO APLICA" : serieRaw;
            const inventario_ine = isNA ? "" : String(raw["inventario_ine"] ?? raw["InventarioINE"] ?? raw["Inventario INE"] ?? "").trim().toUpperCase();
            const serie_cpu_vinculada = isNA ? "" : String(raw["serie_cpu_vinculada"] ?? raw["SerieCpuVinculada"] ?? "").trim().toUpperCase();
            const serie_lente = isNA ? "" : String(raw["serie_lente"] ?? raw["SerieLente"] ?? "").trim().toUpperCase();
            const serie_docking = isNA ? "" : String(raw["serie_docking"] ?? raw["SerieDocking"] ?? "").trim().toUpperCase();
            const observaciones = isNA ? "" : String(raw["observaciones"] ?? raw["Notas"] ?? "").trim();

            let estado_fisico = "No Aplica";
            if (!isNA) {
                const validStates = ["Operativo", "Stock", "En Falla", "En Revision", "En Revisión", "Baja"];
                estado_fisico = validStates.includes(estadoRaw) ? estadoRaw : "Operativo";
            }

            if (!isNA && marca && !appState.marcas.some(b => normalizeText(b) === normalizeText(marca))) {
                appState.marcas.push(marca);
            }
            if (tipo_componente && !appState.tipos_componente.some(t => normalizeText(t) === normalizeText(tipo_componente))) {
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
                serie_cpu_vinculada: !isNA && isMonitorType(tipo_componente) ? serie_cpu_vinculada : "",
                serie_lente: !isNA && isCameraType(tipo_componente) ? serie_lente : "",
                serie_docking: !isNA && isLaptopType(tipo_componente) ? serie_docking : "",
                estado_fisico,
                observaciones,
                foto_url: "",
                registrado_por: "Importacion Excel",
                fecha_registro: new Date().toLocaleString("es-MX")
            }));
            added++;
        }

        if (added > 0) {
            appState.marcas = sortAlphaEs(appState.marcas);
            appState.tipos_componente = sortAlphaEs(appState.tipos_componente);
            await saveState();
            refreshAdminUI({ preserveSelection: true });
        }

        alert(
            `Importacion finalizada:\n` +
            `• Registros procesados: ${added}\n` +
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
        const isNA = isNoAplicaComponent(c);
        return {
            "num": idx + 1,
            "modulo": c.modulo,
            "estacion": formatStationLabel(c.estacion),
            "usuario_responsable": op ? op.nombre_completo : "Sin asignar",
            "telefono": op ? op.telefono : "",
            "correo_institucional": op ? op.correo_institucional : "",
            "tipo_componente": c.tipo_componente,
            "marca": isNA ? "NO APLICA" : c.marca,
            "modelo": isNA ? "NO APLICA" : c.modelo,
            "numero_serie": isNA ? "NO APLICA" : c.numero_serie,
            "inventario_ine": isNA ? "" : (c.inventario_ine || ""),
            "serie_cpu_vinculada": isNA ? "" : (c.serie_cpu_vinculada || ""),
            "serie_lente": isNA ? "" : (c.serie_lente || ""),
            "serie_docking": isNA ? "" : (c.serie_docking || ""),
            "estado_fisico": isNA ? "No Aplica" : c.estado_fisico,
            "registrado_por": c.registrado_por || "Administrador",
            "observaciones": isNA ? "No aplica (sin equipo)" : (c.observaciones || ""),
            "fecha_registro": c.fecha_registro || ""
        };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
        { wch: 6 }, { wch: 12 }, { wch: 22 }, { wch: 28 }, { wch: 16 },
        { wch: 28 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 24 },
        { wch: 20 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 14 },
        { wch: 22 }, { wch: 25 }, { wch: 20 }
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

// ==================== IMPRESIÓN LIMPIA DE REPORTES ====================
function printReportArea() {
    const sourceEl = document.getElementById("printFormatArea");
    if (!sourceEl || !sourceEl.innerHTML.trim()) {
        alert("No hay contenido de reporte listo para imprimir.");
        return;
    }

    let printHost = document.getElementById("printSheetContainer");
    if (!printHost) {
        printHost = document.createElement("div");
        printHost.id = "printSheetContainer";
        document.body.appendChild(printHost);
    }

    printHost.innerHTML = sourceEl.innerHTML;

    let cleaned = false;
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        if (printHost) printHost.innerHTML = "";
        window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);

    setTimeout(() => {
        window.print();
        setTimeout(cleanup, 1000);
    }, 80);
}

// ==================== EXPOSICIÓN GLOBAL PARA EVENTOS HTML ====================
const hooks = {
    refreshAdminUI,
    refreshOperatorUI: () => refreshOperatorUI(openPrintFaultFormat),
    updateCompAssignedOperatorHint
};

Object.assign(window, {
    switchLoginTab,
    onLoginModuloChange,
    previewOperatorProfile,
    loginAsOperator,
    loginAsAdmin,
    logout,
    switchOpTab: (tab) => switchOpTab(tab, persistSession),
    openComponentModal: (ctx, item) => openComponentModal(ctx, item, hooks),
    saveComponentFromModal: (e) => saveComponentFromModal(e, hooks),
    onModalBrandOrTypeChange,
    onCompCpuSelectChange,
    editComponentById: (id) => editComponentById(id, hooks),
    switchAdminTab,
    onAdminCompModuloChange,
    onAdminStationOrBrandChange,
    updateCompAssignedOperatorHint,
    deleteComponent: (id) => deleteComponent(id, hooks),
    renderAdminInventoryGrouped,
    onStockStatusChange,
    onStockDesincChange,
    openStockModal,
    editStockById,
    saveStockFromModal: (e) => saveStockFromModal(e, refreshAdminUI),
    deleteStockItem: (id) => deleteStockItem(id, refreshAdminUI),
    markStockAsDesincorporated: (id) => markStockAsDesincorporated(id, refreshAdminUI),
    openAssignStockModal,
    populateAssignStockEstaciones,
    confirmAssignStockToModule: (e) => confirmAssignStockToModule(e, refreshAdminUI),
    renderAdminStockTable,
    exportStockExcel,
    openMoveToStockModal,
    onMtsStatusChange,
    confirmMoveComponentToStock: (e) => confirmMoveComponentToStock(e, hooks),
    onTransferSourceChange,
    onTransferComponentSelected,
    onTransferActionChange,
    onTransferTargetModuloChange,
    updateTransferTargetHint,
    onTrStockStatusChange,
    submitDirectTransfer: (e) => submitDirectTransfer(e, refreshAdminUI),
    openPrintTransferFormat,
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
    printReportArea,
    openScanner,
    closeScanner,
    replaceMac050351WithNewTable,
    replaceMac050353WithNewTable,
    replaceMac050354WithNewTable,
    previewImageFile,
    clearImageField,
    showPhotoModal,
    downloadImportTemplate,
    importInventoryExcel,
    exportInventoryExcel,
    exportFaultsExcel
});

// ==================== INICIALIZACIÓN ====================
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
            refreshOperatorUI(openPrintFaultFormat);
        }
    }
}

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

    initFirebaseRealtimeListener(refreshActiveScreens);
});
