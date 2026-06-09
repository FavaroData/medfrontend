/**
 * Imager Dashboard JavaScript
 * Handles imager worklist functionality with 3-step filtering and real-time updates
 */

/**
 * Shows a notification message in the alertsContainer.
 * @param {string} message The message to display.
 * @param {string} type The type of alert ('success', 'error', 'info', 'warning').
 */
function showNotification(message, type) {
    const alertsContainer = $('#alertsContainer');
    if (!alertsContainer.length) {
        console.error('Alerts container #alertsContainer not found. Cannot display notification:', message);
        // Fallback to console if container is missing
        (type === 'error' ? console.error : console.log)(`Notification (${type}): ${message}`);
        return;
    }

    let alertClass = 'alert-info'; // Default
    if (type === 'success') {
        alertClass = 'alert-success';
    } else if (type === 'error') {
        alertClass = 'alert-danger';
    } else if (type === 'warning') {
        alertClass = 'alert-warning';
    }

    const alertId = 'notification-' + Date.now();
    const alertHtml = `
        <div id="${alertId}" class="alert ${alertClass} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;

    alertsContainer.append(alertHtml);

    // Optional: Auto-dismiss after some time (e.g., 5 seconds)
    setTimeout(() => {
        $('#' + alertId).alert('close');
    }, 5000);
}

let imagerWorklistTable;
let refreshInterval;
let currentStep = 'step1';
let currentExam = '';
let currentGroup = '';
let groupNamesById = {};
let currentDateFilter = '7'; // Default to last 7 days
let currentUnlinkedOnly = true; // Step 2 only: show only files not linked to an order ("Somente Pendentes") - checked by default
// Removed currentViewMode - step3 always uses tree view
let isLoadingStats = false;
let statsLoadTimeout = null;
// Track expanded tree nodes to prevent auto-refresh when user is working
let expandedTreeNodes = new Set();
// Prevent multiple dashboard initializations
let isDashboardInitialized = false;

// Manual matching variables - now declared in imager-files.js
// Access via window object to ensure we're using the same instances
// selectedDocumentIds = window.selectedDocumentIds (set in imager-files.js)
// manualMatchButton = window.manualMatchButton (set in imager-files.js)
// selectedExam = window.selectedExam (set in imager-files.js)

// Modal instances for Bootstrap 5
let examSelectionModalInstance = null;
let manualMatchConfirmationModalInstance = null;

// Table column configurations for different steps
const stepConfigurations = {
    'step1': null, // Will be loaded from imager-order.js
    'step2': { // LISTA_ARQUIVOS
        title: 'Etapa 2 - Arquivos de Imagem',
        columns: [
            {
                data: 'dtArquivo',
                title: 'Data',
                defaultContent: '-',
                width: '10%',
                className: 'text-start',
                render: function(data) {
                    if (!data) return '-';
                    const date = new Date(data);
                    const day = String(date.getDate()).padStart(2, '0');
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const year = String(date.getFullYear()).slice(-2);
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');
                    return `${day}/${month}/${year} ${hours}:${minutes}`;
                }
            },
            {
                data: 'nmArquivo',
                title: 'Arquivo',
                defaultContent: '-',
                width: '32%',
                className: 'text-start file-name',
                render: function(data, type, row) {
                    if (type === 'display' && data) {
                        let html = '<div>';
                        // File name with truncation
                        if (data.length > 55) {
                            html += '<span title="' + data + '">' + data.substr(0, 55) + '...</span>';
                        } else {
                            html += '<span title="' + data + '">' + data + '</span>';
                        }

                        // Add second line with PDF type info if available
                        if (row.pdfType) {
                            const pdfTypeLabel = row.pdfType === 'TEXT' ? 'Texto' :
                                                 row.pdfType === 'IMAGE' ? 'Imagem' :
                                                 row.pdfType === 'MIXED' ? 'Misto' : row.pdfType;
                            const pageInfo = row.filePageCount ? ' · ' + row.filePageCount + ' pág.' : '';
                            html += '<div class="small text-muted mt-1">' +
                                    'PDF ' + pdfTypeLabel + pageInfo +
                                    '</div>';
                        }
                        html += '</div>';
                        return html;
                    }
                    return data || '-';
                }
            },
            {
                data: 'dsArquivo',
                title: 'Conteúdo',
                defaultContent: '-',
                width: '28%',
                className: 'text-start',
                render: function(data, type, row) {
                    if (type === 'display' && data) {
                        if (data.length > 70) {
                            return '<span title="' + data + '">' + data.substr(0, 70) + '...</span>';
                        }
                        return data;
                    }
                    return data || '-';
                }
            },
            {
                data: 'dsProcesso',
                title: 'Repositório',
                defaultContent: '-',
                width: '14%',
                className: 'text-center',
                render: function(data, type) {
                    if (!data) return '-';
                    if (type === 'display') {
                        const safe = $('<div>').text(data).html();
                        return `<span title="${safe}">${safe}</span>`;
                    }
                    return data;
                }
            },
            {
                data: 'linkedOrderNumber',
                title: 'Ordem Vinculada',
                defaultContent: null,
                width: '12%',
                className: 'text-center',
                render: function(data, type, row) {
                    if (type === 'display') {
                        if (data) {
                            // Document is linked to an order - show badge with order number
                            return `<span class="badge bg-success" title="Documento vinculado à ordem ${data}">${data}</span>`;
                        } else {
                            // Document is not linked - show "Disponível" badge
                            return '<span class="badge bg-secondary" title="Documento disponível para vinculação">Disponível</span>';
                        }
                    }
                    return data || '-';
                }
            },
            {
                data: null,
                title: '<input type="checkbox" id="select-all-documents" title="Selecionar todos">',
                orderable: false,
                width: '4%',
                className: 'text-center',
                render: function(data, type, row) {
                    return `<input type="checkbox" class="document-select-checkbox" data-document-id="${row.id}" title="Selecionar arquivo">`;
                }
            },
            {
                data: null,
                title: 'Ações',
                defaultContent: '',
                width: '10%',
                className: 'text-center',
                orderable: false,
                render: function(data, type, row) {
                    if (type === 'display') {
                        const fileId = row.id;
                        const filePath = row.filePath || '';
                        const fileName = (row.nmArquivo || '').replace(/'/g, "\\'");
                        let buttons = '';

                        // PDF viewer button
                        if (filePath && filePath.toLowerCase().endsWith('.pdf')) {
                            buttons += `<button type="button" class="btn-icon-only me-1"
                                           onclick="openPdfFile(${fileId})"
                                           title="Abrir PDF">
                                        <i class="fas fa-eye"></i>
                                    </button>`;
                        }

                        // Archive/delete button
                        buttons += `<button type="button" class="btn-icon-only"
                                       onclick="archiveDocument(${fileId}, '${fileName}')"
                                       title="Arquivar arquivo">
                                    <i class="fas fa-trash-alt"></i>
                                </button>`;

                        return buttons || '-';
                    }
                    return '-';
                }
            }
        ],
        endpoint: '/api/imager/exam-documents/ui/datatable',
        defaultOrder: [[0, 'desc']] // Column 0 = dtArquivo (Data) - most recent first
    },
    'step3': { // PROCESSING_EXAM Tree View
        title: 'Etapa 3 - Fila de Processamento (Aprovação)',
        columns: [
            {
                data: 'orderDateTime',
                title: 'Data Prescr',
                defaultContent: '-',
                width: '10%',
                className: 'text-start',
                render: function(data, type) {
                    if (!data) return '-';

                    // For sorting, return ISO string as-is (sorts correctly)
                    if (type === 'sort' || type === 'type') {
                        return data;
                    }

                    // For display, format the date
                    const date = new Date(data);
                    const day = date.getDate().toString().padStart(2, '0');
                    const month = (date.getMonth() + 1).toString().padStart(2, '0');
                    const year = date.getFullYear().toString().substr(-2);
                    const hours = date.getHours().toString().padStart(2, '0');
                    const minutes = date.getMinutes().toString().padStart(2, '0');
                    return `${day}/${month}/${year} ${hours}:${minutes}`;
                }
            },
            {
                data: 'nmPaciente',
                title: 'Paciente',
                defaultContent: '-',
                width: '24%',
                className: 'text-start',
                render: function(data, type, row) {
                    if (type === 'display' && data) {
                        // Format birth date
                        let birthDateFormatted = '-';
                        if (row.dtNascimento) {
                            try {
                                const parts = row.dtNascimento.toString().split('-');
                                if (parts.length === 3) {
                                    const dayStr = String(parts[2]).padStart(2, '0');
                                    const monthStr = String(parts[1]).padStart(2, '0');
                                    const yearStr = String(parts[0]);
                                    birthDateFormatted = `${dayStr}/${monthStr}/${yearStr}`;
                                }
                            } catch (error) {
                                console.warn('Error formatting birth date:', row.dtNascimento, error);
                            }
                        }

                        // Format CPF
                        let cpfFormatted = '-';
                        if (row.cpf) {
                            const cpfStr = String(row.cpf);
                            const digitsOnly = cpfStr.replace(/\D/g, '');
                            if (digitsOnly.length === 11) {
                                cpfFormatted = digitsOnly.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
                            } else {
                                cpfFormatted = cpfStr;
                            }
                        }

                        return `${data}<br><small class="text-muted">Nasc: ${birthDateFormatted} | CPF: ${cpfFormatted}</small>`;
                    }
                    return data || '-';
                }
            },
            {
                data: 'procedimento',
                title: 'Procedimento',
                defaultContent: '-',
                width: '20%',
                className: 'text-start',
                render: function(data, type, row) {
                    if (type === 'display') {
                        const procedimento = data || '-';

                        // Build second line with visit number and prescription
                        let secondLineItems = [];

                        // Add visit number if available
                        if (row.visitNumber) {
                            secondLineItems.push(`Atend: ${row.visitNumber}`);
                        }

                        // Add prescription number if available
                        if (row.nrPrescricao || row.nrSeqPrescricao) {
                            const placer = row.nrPrescricao || '';
                            const filler = row.nrSeqPrescricao || '';

                            if (placer && filler) {
                                secondLineItems.push(`Prescr: ${placer}-${filler}`);
                            } else if (placer) {
                                secondLineItems.push(`Prescr: ${placer}`);
                            } else if (filler) {
                                secondLineItems.push(`Seq: ${filler}`);
                            }
                        }

                        const orderInfo = secondLineItems.length > 0
                            ? `<br><small class="text-muted">${secondLineItems.join(' | ')}</small>`
                            : '';

                        return `${procedimento}${orderInfo}`;
                    }
                    return data || '-';
                }
            },
            { data: 'nmMedico', title: 'Médico', defaultContent: '-', width: '14%', className: 'text-start' },
            {
                data: 'parentStatus',
                title: 'Status',
                defaultContent: '-',
                width: '10%',
                className: 'text-start',
                render: function(data, type, row) {
                    if (type === 'display' && data) {
                        let statusText = data;
                        let badgeClass = 'bg-secondary';

                        switch(data) {
                            case 'PENDING':
                                statusText = 'Pendente';
                                badgeClass = 'bg-warning';
                                break;
                            case 'COMPLETED':
                                statusText = 'Concluído';
                                badgeClass = 'bg-success';
                                break;
                            case 'READY':
                                statusText = 'Pronto';
                                badgeClass = 'bg-info';
                                break;
                            case 'APPROVED':
                                statusText = 'Aprovado';
                                badgeClass = 'bg-primary';
                                break;
                            case 'AUTO_APPROVED':
                            case 'AUTOAPPROVED':
                                statusText = 'Auto-Aprovado';
                                badgeClass = 'bg-primary';
                                break;
                            case 'PROCESSED':
                                statusText = 'Processado';
                                badgeClass = 'bg-success';
                                break;
                            case 'FAILED':
                                if (row.orderStatus === 'STEP4_FAILED') {
                                    statusText = 'Falha Step 4';
                                } else {
                                    statusText = 'Falhou';
                                }
                                badgeClass = 'bg-danger';
                                break;
                            case 'PROCESSING':
                                statusText = 'Processando';
                                badgeClass = 'bg-info';
                                break;
                            case 'INCOMPLETE':
                                statusText = 'Incompleto';
                                badgeClass = 'bg-warning';
                                break;
                        }

                        let badge = `<span class="badge ${badgeClass}">${statusText}</span>`;

                        // Add file count on second line
                        let fileCountFormatted = '';
                        if (row.actualFileCount !== undefined && row.expectedFileCount !== undefined) {
                            fileCountFormatted = `<br><small class="text-muted">Arquivos: ${row.actualFileCount}/${row.expectedFileCount}</small>`;
                        }

                        return `${badge}${fileCountFormatted}`;
                    }
                    return data || '-';
                }
            },
            {
                data: 'createdAt',
                title: 'Criado',
                defaultContent: '-',
                width: '10%',
                className: 'text-start',
                render: function(data, type) {
                    if (!data) return '-';

                    // For sorting, return ISO string as-is
                    if (type === 'sort' || type === 'type') {
                        return data;
                    }

                    // For display, format the date
                    try {
                        const date = new Date(data);
                        const day = String(date.getDate()).padStart(2, '0');
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const year = String(date.getFullYear()).slice(-2);
                        const hours = String(date.getHours()).padStart(2, '0');
                        const minutes = String(date.getMinutes()).padStart(2, '0');
                        return `${day}/${month}/${year} ${hours}:${minutes}`;
                    } catch (error) {
                        console.warn('Error formatting createdAt:', data, error);
                        return '-';
                    }
                }
            },
            {
                data: null,
                title: 'Ações',
                defaultContent: '',
                width: '12%',
                className: 'text-start',
                orderable: false,
                render: function(data, type, row) {
                    if (type === 'display') {
                        const groupKey = row.groupKey || '';

                        console.log(`Rendering actions for ${row.nrPrescricao}: parentStatus=${row.parentStatus}, actualFileCount=${row.actualFileCount}, expectedFileCount=${row.expectedFileCount}`);

                        // Retry button for STEP4_FAILED exams
                        let retryButton = '';
                        if (row.orderStatus === 'STEP4_FAILED') {
                            retryButton = `
                                <button type="button" class="btn-icon-only text-warning"
                                       onclick="step3_retryStep4('${row.nrPrescricao}', '${row.nrSeqPrescricao}', ${row.configId || 'null'})"
                                       title="Reprocessar Step 4">
                                    <i class="fas fa-redo"></i>
                                </button>`;
                        }

                        // Clear blacklist button when there are file exclusions on this exam
                        let clearBlacklistButton = '';
                        if (row.exclusionCount && row.exclusionCount > 0) {
                            const blacklistTitle = `Limpar blacklist (${row.exclusionCount} arquivo${row.exclusionCount === 1 ? '' : 's'} vetado${row.exclusionCount === 1 ? '' : 's'})`;
                            clearBlacklistButton = `
                                <button type="button" class="btn-icon-only text-info"
                                       onclick="step3_clearExclusions('${row.nrPrescricao}', '${row.nrSeqPrescricao}', ${row.configId || 'null'}, ${row.exclusionCount})"
                                       title="${blacklistTitle}">
                                    <i class="fas fa-user-slash"></i>
                                </button>`;
                        }

                        let actionsHtml = `
                            <div class="d-flex align-items-center gap-1 flex-nowrap">
                                <span class="tree-toggle" onclick="step3_toggleTreeNode('${groupKey}')">
                                    <i class="fas fa-chevron-right" id="toggle-${groupKey}"></i>
                                </span>
                                ${retryButton}
                                ${clearBlacklistButton}
                                <button type="button" class="btn-icon-only"
                                       onclick='openApprovalReviewModal(${JSON.stringify(row)})'
                                       title="Revisar e Aprovar Imagens">
                                    <i class="fas fa-file-circle-check"></i>
                                </button>
                                <button type="button" class="btn-icon-only"
                                       onclick="step3_deletePatientGroup('${row.nrPrescricao}', '${row.nrSeqPrescricao}', '${row.dsProcesso}', ${row.configId || 'null'})"
                                       title="Excluir Grupo Inteiro">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        `;

                        return actionsHtml;
                    }
                    return '-';
                }
            }
        ],
        endpoint: '/api/imager/processing-exams/ui/parent',
        statusFilter: 'step3',  // Add status filter for step 3
        defaultOrder: [[0, 'desc']]  // Sort by orderDateTime (prescription date) desc
    },
    'step4': null // Will be loaded from imager-completed.js
};

/**
 * Initialize the imager dashboard
 */
function initImagerDashboard() {
    console.log('Initializing Imager Dashboard...');
    
    // Clean up any existing state first
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
    
    if (statsLoadTimeout) {
        clearTimeout(statsLoadTimeout);
        statsLoadTimeout = null;
    }
    
    // If DataTable already exists, destroy it first
    if (imagerWorklistTable) {
        try {
            imagerWorklistTable.destroy();
        } catch (e) {
            console.debug('Error destroying existing DataTable:', e);
        }
        imagerWorklistTable = null;
    }
    
    isDashboardInitialized = true;
    
    // Preserve current filter values from UI elements to maintain user selections
    // This prevents the filter options from resetting when returning to the dashboard
    const stepFilterElement = $('#stepFilter');
    const examFilterElement = $('#examFilter');
    const dateFilterElement = $('#dateFilter');
    const unlinkedOnlyElement = $('#unlinkedOnlyFilter');

    if (stepFilterElement.length && stepFilterElement.val()) {
        currentStep = stepFilterElement.val();
    }
    if (examFilterElement.length && examFilterElement.val()) {
        currentExam = examFilterElement.val();
    }
    const groupFilterElement = $('#groupFilter');
    if (groupFilterElement.length && groupFilterElement.val()) {
        currentGroup = groupFilterElement.val();
    } else {
        const stored = sessionStorage.getItem('imagerGroupFilter');
        if (stored) currentGroup = stored;
    }
    if (dateFilterElement.length && dateFilterElement.val()) {
        currentDateFilter = dateFilterElement.val();
    }
    if (unlinkedOnlyElement.length) {
        unlinkedOnlyElement.prop('checked', currentUnlinkedOnly);
    }
    
    console.log('Preserved filter values:', {
        currentStep: currentStep,
        currentExam: currentExam,
        currentDateFilter: currentDateFilter
    });
    
    // Load available groups then exams for filter (group must be loaded first to populate groupNamesById)
    loadGroupOptions().then(() => loadExamOptions());
    
    // Initialize DataTable
    initImagerDataTable();
    
    // Load initial data
    loadImagerStats();
    
    // Setup auto-refresh
    setupAutoRefresh();
    
    // Setup event handlers
    setupEventHandlers();
    
    // Set initial active card based on current step
    $('.stats-card').removeClass('active');
    $(`#${currentStep}-${getStepCardSuffix(currentStep)}-card .stats-card`).addClass('active');
    
    // Date filter is always visible but only functional for Step 3 and 4

    // Inicializa o modal de adição manual de paciente (apenas visível quando HIS=AMPLIMED)
    if (typeof initImagerManualOrder === 'function') {
        initImagerManualOrder();
    }
}

/**
 * Load available exam group options for filter
 */
function loadGroupOptions() {
    return fetch('/api/imager/exam-groups')
        .then(r => r.json())
        .then(data => {
            const filter = $('#groupFilter');
            const prev = currentGroup;
            filter.empty().append('<option value="">Todos os Grupos</option>');
            groupNamesById = {};
            (data || []).forEach(g => {
                filter.append(`<option value="${g.id}">${$('<div>').text(g.name).html()}</option>`);
                groupNamesById[g.id] = g.name;
            });
            if (prev && filter.find(`option[value="${prev}"]`).length > 0) {
                filter.val(prev);
            }
        })
        .catch(err => console.error('Error loading group options:', err));
}

/**
 * Load available exam options for filter
 */
function loadExamOptions() {
    const url = currentGroup
        ? `/api/imager/exams?groupFilter=${encodeURIComponent(currentGroup)}`
        : '/api/imager/exams';

    return fetch(url)
        .then(response => response.json())
        .then(data => {
            const examFilter = $('#examFilter');
            const previouslySelectedExam = currentExam; // Store the previously selected value

            const placeholder = currentGroup && groupNamesById[currentGroup]
                ? `Todos — ${groupNamesById[currentGroup]}`
                : 'Todos os Exames';
            examFilter.empty().append(`<option value="">${placeholder}</option>`);

            if (data && data.length > 0) {
                // Sort exams alphabetically by name
                data.sort((a, b) => a.name.localeCompare(b.name));

                data.forEach(exam => {
                    // Use config ID as value, display name as text
                    examFilter.append(`<option value="${exam.id}">${$('<div>').text(exam.name).html()}</option>`);
                });
            }

            // Restore the previously selected exam value if it exists in the filtered list
            if (previouslySelectedExam &&
                examFilter.find(`option[value="${previouslySelectedExam}"]`).length > 0) {
                examFilter.val(previouslySelectedExam);
                console.log('Restored exam filter to:', previouslySelectedExam);
            } else {
                currentExam = '';
            }
        })
        .catch(error => {
            console.error('Error loading exam options:', error);
        });
}

/**
 * Initialize the imager worklist DataTable based on current step
 */
function initImagerDataTable() {
    console.log('Initializing DataTable for step:', currentStep);
    
    // Destroy existing table if it exists
    if ($.fn.DataTable.isDataTable('#imagerWorklistTable')) {
        console.log('Destroying existing DataTable');
        $('#imagerWorklistTable').DataTable().clear().destroy();
    }

    // Load external step configurations if available
    if (currentStep === 'step1' && typeof step1ColumnConfig !== 'undefined') {
        stepConfigurations['step1'] = step1ColumnConfig;
    }
    if (currentStep === 'step4' && typeof step4ColumnConfig !== 'undefined') {
        stepConfigurations['step4'] = step4ColumnConfig;
    }

    const effectiveStepKey = currentStep;
    const config = stepConfigurations[effectiveStepKey];
    console.log('Effective step key:', effectiveStepKey);
    console.log('Step configuration:', config);
    console.log('Number of columns:', config.columns.length);

    // "Somente Pendentes" checkbox is meaningful only for Etapa 2 (Arquivos)
    $('#unlinkedOnlyFilterWrapper').toggle(effectiveStepKey === 'step2');

    // Update table title
    $('#tableTitle').html(`<i class="fas fa-table"></i> ${config.title}`);
    
    // Completely rebuild table structure
    const headerRow = config.columns.map(col => `<th>${col.title}</th>`).join('');
    console.log('Generated header row:', headerRow);
    
    const tableHtml = `
        <thead class="table-dark" id="tableHeader">
            <tr>${headerRow}</tr>
        </thead>
        <tbody>
            <!-- DataTable will populate this -->
        </tbody>
    `;
    
    $('#imagerWorklistTable').html(tableHtml);
    $('#imagerWorklistTable').addClass('compact');
      imagerWorklistTable = $('#imagerWorklistTable').DataTable({
        "processing": true,
        "serverSide": true,
        "ajax": {
            "url": config.endpoint,
            "type": "GET",
            "data": function(d) {
                const params = {
                    draw: d.draw,
                    start: d.start,
                    length: d.length,
                    search: d.search.value,
                    orderColumn: d.order[0]?.column || 0,
                    orderDir: d.order[0]?.dir || 'asc',
                    groupFilter: currentGroup,
                    examFilter: currentExam,
                    stepFilter: currentStep
                };
                
                // For tree view, use different params
                if (effectiveStepKey === 'step3' || effectiveStepKey === 'step4') {
                    params.groupFilter = currentGroup;
                    params.examFilter = currentExam;
                    params.page = Math.floor(d.start / d.length);
                    params.size = d.length;
                    // Include search parameter for patient name filtering
                    if (d.search && d.search.value) {
                        params.search = d.search.value;
                    }
                    // Add status filter for step3
                    if (effectiveStepKey === 'step3') {
                        params.statusFilter = 'step3';
                    }
                    // Add date filter for step4 only
                    if (effectiveStepKey === 'step4' && currentDateFilter) {
                        params.dateFilter = currentDateFilter;
                    }
                }

                // Step 2 only: "Somente Pendentes" - show only files not linked to an order
                if (effectiveStepKey === 'step2' && currentUnlinkedOnly) {
                    params.unlinkedOnly = true;
                }

                return params;
            },
            "dataSrc": function(json) {
                // For tree view, transform the grouped response
                if ((effectiveStepKey === 'step3' || effectiveStepKey === 'step4') && json.groups) {
                    // Set the pagination info
                    json.recordsTotal = json.totalGroups;
                    json.recordsFiltered = json.totalGroups;
                    
                    // Debug: Log the groups data
                    console.log(`${effectiveStepKey} groups data:`, json.groups);
                    
                    // Transform groups to flat array for DataTables
                    return json.groups.map(group => {
                        console.log('Group:', group.nrPrescricao, 'parentStatus:', group.parentStatus);
                        return {
                            ...group,
                            groupKey: group.nrPrescricao + '_' + group.nrSeqPrescricao + '_' + group.dsProcesso
                        };
                    });
                }
                return json.data || json;
            },
            "error": function(xhr, error, code) {
                console.error('DataTable AJAX error:', error);
                showNotification('Erro ao carregar dados da tabela', 'error');
            }        },
        "columns": config.columns,
        "language": {
            url: '/i18n/pt-BR.json'
        },"pageLength": 25,
        "order": config.defaultOrder || [[0, "desc"]],
        "responsive": true,
        "scrollX": false,
        "autoWidth": false,        "columnDefs": [
            {
                "targets": "_all",
                "className": "text-nowrap align-middle"
            },
            {
                "targets": [0], // Column 0: orderDateTime (date for all steps)
                "render": function(data, type, row, meta) {
                    if (type === 'display' && data) {
                        // For other steps (file name column), apply 20 char truncation
                        if (currentStep !== 'step1' && data.length > 20) {
                            return '<span title="' + data + '">' + data.substr(0, 20) + '...</span>';
                        }
                    }
                    return data || '-';
                }
            },
            {
                "targets": [1], // For step1: visitNumber (Atend.), for others: different columns
                "render": function(data, type, row, meta) {
                    if (type === 'display' && data) {
                        // For other steps, apply existing logic
                        if (currentStep !== 'step1' && data.length > 20) {
                            return '<span title="' + data + '">' + data.substr(0, 20) + '...</span>';
                        }
                    }
                    return data || '-';
                }
            },
            {
                "targets": [2], // For step1: nrPrescricao (7 chars max), for others: different columns
                "render": function(data, type, row, meta) {
                    if (type === 'display' && data) {
                        // For step1, nrPrescricao should be max 7 characters
                        if (currentStep === 'step1' && data.length > 7) {
                            return '<span title="' + data + '">' + data.substr(0, 7) + '...</span>';
                        }
                        // For other steps, apply truncation as before
                        if (currentStep !== 'step1' && data.length > 25) {
                            return '<span title="' + data + '">' + data.substr(0, 25) + '...</span>';
                        }
                    }
                    return data || '-';
                }
            },
            {
                "targets": [3], // For step1: nmPaciente (full name), for others: different columns
                "render": function(data, type, row, meta) {
                    if (type === 'display' && data) {
                        // For step1, show full patient name without truncation
                        if (currentStep === 'step1') {
                            return data;
                        }
                        // For other steps, apply existing logic
                        if (currentStep !== 'step1' && data.length > 20) {
                            return '<span title="' + data + '">' + data.substr(0, 20) + '...</span>';
                        }
                    }
                    return data || '-';
                }
            },
            {
                "targets": [4], // For step1: nmMedico (25 chars max), for others: different columns
                "render": function(data, type, row, meta) {
                    if (type === 'display' && data) {
                        // For step1, truncate doctor name to 25 characters
                        if (currentStep === 'step1' && data.length > 25) {
                            return '<span title="' + data + '">' + data.substr(0, 25) + '...</span>';
                        }
                        // For other steps, apply existing logic
                        if (currentStep !== 'step1' && data.length > 20) {
                            return '<span title="' + data + '">' + data.substr(0, 20) + '...</span>';
                        }
                    }
                    return data || '-';
                }
            }
        ],
        "dom": 'rtip', // Remove default length and filter controls (using custom controls)
        "createdRow": function(row, data, dataIndex) {
            // Add parent status as data attribute for CSS row highlighting
            if (data.parentStatus) {
                $(row).attr('data-parent-status', data.parentStatus);
            }
        },
        "drawCallback": function(settings) {
            // Note: Auto-refresh is disabled when tree nodes are expanded,
            // so this callback typically only runs on manual refresh or step changes
            console.log('DataTable draw callback executed');
        }
    });
    
    console.log('DataTable created successfully');
    console.log('Table columns count:', imagerWorklistTable.columns().count());

    // Setup custom page length control
    $('#imagerItemsPerPageSelect').off('change').on('change', function() {
        const length = parseInt($(this).val());
        imagerWorklistTable.page.len(length).draw();
    });

    // Setup custom search control
    $('#imagerSearchInput').off('keyup').on('keyup', function() {
        const searchValue = $(this).val();
        imagerWorklistTable.search(searchValue).draw();

        // Show/hide clear button
        if (searchValue.length > 0) {
            $('#imagerClearSearchBtn').show();
        } else {
            $('#imagerClearSearchBtn').hide();
        }
    });

    // Setup clear search button
    $('#imagerClearSearchBtn').off('click').on('click', function() {
        $('#imagerSearchInput').val('');
        imagerWorklistTable.search('').draw();
        $(this).hide();
    });

    // Initialize manual matching for step2
    if (currentStep === 'step2') {
        console.log('Initializing manual matching for step2');
        initManualMatchingWithConfig();
    }
}


/**
 * Load imager statistics and update dashboard with debouncing
 */
function loadImagerStats() {
    // Debounce rapid calls to prevent excessive loading
    if (statsLoadTimeout) {
        clearTimeout(statsLoadTimeout);
    }
    
    statsLoadTimeout = setTimeout(() => {
        loadImagerStatsInternal();
    }, 300); // 300ms debounce delay
}

/**
 * Internal function to actually load stats
 */
function loadImagerStatsInternal() {
    // Prevent multiple concurrent requests
    if (isLoadingStats) {
        console.log('Stats already loading, skipping request');
        return;
    }
    
    isLoadingStats = true;
    console.log('Loading imager stats...');

    const statsEndpoints = [
        { url: '/api/imager/exam-orders/ui/stats', cardId: '#step1-patients-card', field: 'total' },
        { url: '/api/imager/exam-documents/ui/stats', cardId: '#step2-files-card', field: 'total' },
        { url: '/api/imager/processing-exams/ui/stats', cardId: '#step3-queue-card', field: 'pending' },
        { url: '/api/imager/processing-exams/ui/step4/stats', cardId: '#step4-processed-card', field: 'completed' }
    ];

    const promises = statsEndpoints.map(endpoint => {
        // Add group and exam filter parameters if set
        let url = endpoint.url;
        if (currentGroup) {
            url += (url.includes('?') ? '&' : '?') + 'groupFilter=' + encodeURIComponent(currentGroup);
        }
        if (currentExam) {
            // Use 'examFilter' parameter for all steps for consistency
            url += (url.includes('?') ? '&' : '?') + 'examFilter=' + encodeURIComponent(currentExam);
        }
        
        // Add date filter for step4 stats only
        if (endpoint.cardId === '#step4-processed-card' && currentDateFilter) {
            url += (url.includes('?') ? '&' : '?') + 'dateFilter=' + encodeURIComponent(currentDateFilter);
        }

        // Step 2 card: mirror the "Pendentes" checkbox so the card matches the table
        if (endpoint.cardId === '#step2-files-card' && currentUnlinkedOnly) {
            url += (url.includes('?') ? '&' : '?') + 'unlinkedOnly=true';
        }
        
        return fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to fetch stats from ${url}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                let count = 0;
                if (endpoint.field === 'completed' && data.completed !== undefined) {
                    count = data.completed;
                } else if (endpoint.field === 'pending' && data.pending !== undefined) {
                    count = data.pending;
                } else if (endpoint.field === 'total' && data.total !== undefined) {
                    count = data.total;
                } else if (data.completed !== undefined) {
                    count = data.completed;
                } else if (data.total !== undefined) {
                    count = data.total;
                }
                return {
                    cardId: endpoint.cardId,
                    count: count
                };
            });
    });

    Promise.all(promises)
        .then(results => {
            console.log('Stats loaded successfully:', results);
            updateStatsCards(results);
        })
        .catch(error => {
            console.error('Error loading imager stats:', error);
            showNotification('Falha ao carregar estatísticas do imager. ' + error.message, 'error');
        })
        .finally(() => {
            isLoadingStats = false;
        });
}

/**
 * Update the statistics cards
 * @param {Array<Object>} results Array of objects with cardId and count
 */
function updateStatsCards(results) {
    if (!results) return;

    results.forEach(result => {
        const card = $(result.cardId);
        if (card.length) {
            const countElement = card.find('.stat-number');
            if (countElement.length) {
                countElement.text(result.count);
            } else {
                console.warn(`Stat number element not found in card: ${result.cardId}`);
            }
        } else {
            // Silently ignore missing cards - they may not be on current view
            console.debug(`Card element not found (may not be on current view): ${result.cardId}`);
        }
    });
}


/**
 * Setup auto-refresh functionality
 */
function setupAutoRefresh() {
    // Initial refresh after 10 seconds
    setTimeout(() => {
        refreshInterval = setInterval(() => {
            loadImagerStats();
            if (imagerWorklistTable) {
                // Only refresh table if no tree nodes are expanded or items selected (to preserve user's working state)
                if ((currentStep === 'step3' || currentStep === 'step4') && expandedTreeNodes.size > 0) {
                    console.log('Skipping table refresh - tree nodes are expanded');
                } else if (currentStep === 'step2' && window.selectedDocumentIds && window.selectedDocumentIds.size > 0) {
                    console.log('Skipping table refresh - documents selected in step2');
                } else {
                    imagerWorklistTable.ajax.reload(null, false);
                }
            }
        }, 30000); // Refresh every 30 seconds (reduced frequency)
    }, 10000); // Initial delay of 10 seconds
}

/**
 * Setup event handlers
 */
function setupEventHandlers() {
    // Filter change handlers
    $('#stepFilter').on('change', function() {
        currentStep = $(this).val();
        // Clear expanded tree nodes and checked items when switching steps
        expandedTreeNodes.clear();

        // Clear manual matching selections and reset warning
        clearManualMatchingSelections();
        sessionStorage.removeItem('examFilterWarningShown');
        
        // Update visual state of cards
        $('.stats-card').removeClass('active');
        $(`#${currentStep}-${getStepCardSuffix(currentStep)}-card .stats-card`).addClass('active');
        
        // Date filter is always visible but only affects Step 3 and 4
        
        initImagerDataTable();
        loadImagerStats();
    });
    
    $('#groupFilter').on('change', function() {
        currentGroup = $(this).val();
        currentExam = '';
        if (currentGroup) {
            sessionStorage.setItem('imagerGroupFilter', currentGroup);
        } else {
            sessionStorage.removeItem('imagerGroupFilter');
        }
        sessionStorage.removeItem('imagerExamFilter');
        sessionStorage.removeItem('examFilterWarningShown');
        loadExamOptions().then(() => {
            if (imagerWorklistTable) {
                imagerWorklistTable.ajax.reload();
            }
            loadImagerStats();
        });
    });

    $('#examFilter').on('change', function() {
        currentExam = $(this).val();

        // Reset exam filter warning when filter changes
        sessionStorage.removeItem('examFilterWarningShown');
        
        // Update manual matching UI based on configuration if we're in step2
        if (currentStep === 'step2') {
            initManualMatchingWithConfig();
        }
        
        if (imagerWorklistTable) {
            imagerWorklistTable.ajax.reload();
        }
        loadImagerStats();
    });
    
    $('#dateFilter').on('change', function() {
        currentDateFilter = $(this).val();
        if (imagerWorklistTable) {
            imagerWorklistTable.ajax.reload();
        }
        loadImagerStats();
    });

    // Step 2 only: "Somente Pendentes" toggle (files not linked to an order)
    $('#unlinkedOnlyFilter').on('change', function() {
        currentUnlinkedOnly = $(this).is(':checked');
        if (currentStep === 'step2' && imagerWorklistTable) {
            imagerWorklistTable.ajax.reload();
        }
        // Refresh stats so the "Etapa 2 - Arquivos" card mirrors the checkbox state
        loadImagerStats();
    });
    
    // View mode removed - step3 always uses tree view
    
    // Refresh button
    $('#refreshImagerData').on('click', function() {
        loadImagerStats();
        if (imagerWorklistTable) {
            // Check if user wants to refresh despite expanded tree nodes or selected items
            if ((currentStep === 'step3' || currentStep === 'step4') && expandedTreeNodes.size > 0) {
                if (confirm('Existem nós da árvore expandidos. Atualizar irá fechar todos os nós expandidos. Continuar?')) {
                    expandedTreeNodes.clear();
                    imagerWorklistTable.ajax.reload();
                    showNotification('Dados atualizados', 'success');
                } else {
                    showNotification('Atualização cancelada', 'info');
                    return;
                }
            } else if (currentStep === 'step2' && window.selectedDocumentIds && window.selectedDocumentIds.size > 0) {
                if (confirm('Existem documentos selecionados na Etapa 2. Atualizar irá limpar as seleções. Continuar?')) {
                    window.selectedDocumentIds.clear();
                    if (typeof clearManualMatchingSelections === 'function') {
                        clearManualMatchingSelections();
                    }
                    imagerWorklistTable.ajax.reload();
                    showNotification('Dados atualizados', 'success');
                } else {
                    showNotification('Atualização cancelada', 'info');
                    return;
                }
            } else {
                imagerWorklistTable.ajax.reload();
                showNotification('Dados atualizados', 'success');
            }
        } else {
            showNotification('Dados atualizados', 'success');
        }
    });

    // Add PDF button — opens modal with exam/repo/file selectors
    $('#addPdfButton').on('click', openAddPdfModal);

    $('#addPdfExamSelect').on('change', function() {
        loadAddPdfRepositories($(this).val());
    });

    $('#confirmAddPdfBtn').on('click', submitAddPdf);

    // Handle consolidated file button clicks (event delegation for dynamically created elements)
    $(document).off('click', '.consolidated-file-btn').on('click', '.consolidated-file-btn', function() {
        const filePathId = $(this).data('file-path-id');
        const filePath = window.consolidatedFilePaths && window.consolidatedFilePaths[filePathId];
        if (filePath) {
            openFinalConsolidatedFile(filePath);
        } else {
            showNotification('Caminho do arquivo consolidado não encontrado', 'error');
        }
    });
    
    // View mode removed - step3 always uses tree view
}

/**
 * Open the Add PDF modal — lets the user pick exam, repository and file.
 * Pre-selects the current examFilter value when one is active.
 */
function openAddPdfModal() {
    $('#addPdfFileInput').val('');
    $('#addPdfRepoSelect')
        .empty()
        .append('<option value="">Selecione primeiro um exame...</option>')
        .prop('disabled', true);

    const preselectedExamId = $('#examFilter').val();

    loadAddPdfExamOptions().then(() => {
        if (preselectedExamId && $('#addPdfExamSelect').find(`option[value="${preselectedExamId}"]`).length > 0) {
            $('#addPdfExamSelect').val(preselectedExamId).trigger('change');
        }
    });

    new bootstrap.Modal(document.getElementById('addPdfModal')).show();
}

function loadAddPdfExamOptions() {
    const $sel = $('#addPdfExamSelect');
    $sel.empty().append('<option value="">Carregando...</option>');

    return fetch('/api/imager/exams')
        .then(r => r.json())
        .then(data => {
            $sel.empty().append('<option value="">Selecione um exame...</option>');
            if (data && data.length) {
                data.sort((a, b) => a.name.localeCompare(b.name));
                data.forEach(e => {
                    $sel.append(`<option value="${e.id}">${$('<div>').text(e.name).html()}</option>`);
                });
            }
        })
        .catch(err => {
            console.error('Error loading exams for Add PDF modal:', err);
            $sel.empty().append('<option value="">Erro ao carregar exames</option>');
        });
}

function loadAddPdfRepositories(configId) {
    const $sel = $('#addPdfRepoSelect');
    $sel.empty().prop('disabled', true);

    if (!configId) {
        $sel.append('<option value="">Selecione primeiro um exame...</option>');
        return;
    }

    $sel.append('<option value="">Carregando repositórios...</option>');

    fetch(`/api/imager/config/${configId}/repositories`)
        .then(r => r.json())
        .then(repos => {
            $sel.empty();
            if (!repos || repos.length === 0) {
                $sel.append('<option value="">Nenhum repositório habilitado para este exame</option>');
                return;
            }
            if (repos.length === 1) {
                const r = repos[0];
                $sel.append(`<option value="${r.id}">${$('<div>').text(`${r.name} — ${r.sourcePath}`).html()}</option>`);
                $sel.val(r.id).prop('disabled', false);
            } else {
                $sel.append('<option value="">Selecione um repositório...</option>');
                repos.forEach(r => {
                    $sel.append(`<option value="${r.id}">${$('<div>').text(`${r.name} — ${r.sourcePath}`).html()}</option>`);
                });
                $sel.prop('disabled', false);
            }
        })
        .catch(err => {
            console.error('Error loading repositories for Add PDF modal:', err);
            $sel.empty().append('<option value="">Erro ao carregar repositórios</option>');
        });
}

function submitAddPdf() {
    const configId = $('#addPdfExamSelect').val();
    const repoId = $('#addPdfRepoSelect').val();
    const file = $('#addPdfFileInput')[0].files[0];

    if (!configId) {
        showNotification('Selecione um exame/configuração', 'error');
        return;
    }
    if (!repoId) {
        showNotification('Selecione um repositório', 'error');
        return;
    }
    if (!file) {
        showNotification('Selecione um arquivo PDF', 'error');
        return;
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
        showNotification('Apenas arquivos PDF são permitidos', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('repositoryId', repoId);

    const $btn = $('#confirmAddPdfBtn');
    const originalText = $btn.html();
    $btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm" role="status"></span> Enviando...');

    fetch(`/api/imager/config/${configId}/upload-pdf`, {
        method: 'POST',
        body: formData
    })
    .then(r => r.json())
    .then(result => {
        if (result.success) {
            showNotification(`PDF adicionado: ${result.fileName}`, 'success');
            bootstrap.Modal.getInstance(document.getElementById('addPdfModal')).hide();
            setTimeout(() => {
                if (imagerWorklistTable) imagerWorklistTable.ajax.reload();
            }, 1500);
        } else {
            showNotification(`Erro: ${result.message}`, 'error');
        }
    })
    .catch(err => {
        console.error('Error uploading PDF:', err);
        showNotification('Erro ao enviar arquivo. Verifique sua conexão.', 'error');
    })
    .finally(() => {
        $btn.prop('disabled', false).html(originalText);
    });
}

/**
 * View imager item details
 */
function viewImagerDetails(itemId) {
    fetch(`/api/imager/item/${itemId}`)
        .then(response => response.json())
        .then(data => {
            showImagerDetailsModal(data);
        })
        .catch(error => {
            console.error('Error loading imager details:', error);
            showNotification('Erro ao carregar detalhes', 'error');
        });
}

/**
 * Process imager item
 */
function processImagerItem(itemId) {
    if (!confirm('Confirma o processamento deste item?')) {
        return;
    }
    
    fetch(`/api/imager/process/${itemId}`, { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Item processado com sucesso', 'success');
                if (imagerWorklistTable) {
                    imagerWorklistTable.ajax.reload(null, false);
                }
                loadImagerStats();
            } else {
                showNotification('Erro ao processar item: ' + (data.message || 'Erro desconhecido'), 'error');
            }
        })
        .catch(error => {
            console.error('Error processing imager item:', error);
            showNotification('Erro ao processar item', 'error');
        });
}

/**
 * Cancel imager item
 */
function cancelImagerItem(itemId) {
    if (!confirm('Confirma o cancelamento deste item?')) {
        return;
    }
    
    fetch(`/api/imager/cancel/${itemId}`, { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Item cancelado com sucesso', 'success');
                if (imagerWorklistTable) {
                    imagerWorklistTable.ajax.reload(null, false);
                }
                loadImagerStats();
            } else {
                showNotification('Erro ao cancelar item: ' + (data.message || 'Erro desconhecido'), 'error');
            }
        })
        .catch(error => {
            console.error('Error canceling imager item:', error);
            showNotification('Erro ao cancelar item', 'error');
        });
}

/**
 * Show imager details modal
 */
function showImagerDetailsModal(data) {
    // Create modal content dynamically
    const modalContent = `
        <div class="modal fade" id="imagerDetailsModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Detalhes do Item</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <dl class="row">
                            <dt class="col-sm-3">Nº Atendimento:</dt><dd class="col-sm-9">${data.accessionNumber || 'N/A'}</dd>
                            <dt class="col-sm-3">Paciente:</dt><dd class="col-sm-9">${data.patientName || 'N/A'}</dd>
                            <dt class="col-sm-3">ID Paciente:</dt><dd class="col-sm-9">${data.patientId || 'N/A'}</dd>
                            <dt class="col-sm-3">Exame:</dt><dd class="col-sm-9">${data.studyDescription || 'N/A'}</dd>
                            <dt class="col-sm-3">Modalidade:</dt><dd class="col-sm-9">${data.modality || 'N/A'}</dd>
                            <dt class="col-sm-3">Pool:</dt><dd class="col-sm-9">${data.institution || 'N/A'}</dd>
                            <dt class="col-sm-3">Data/Hora:</dt><dd class="col-sm-9">${data.studyDate ? new Date(data.studyDate).toLocaleString() : 'N/A'}</dd>
                            <dt class="col-sm-3">Status:</dt><dd class="col-sm-9">${data.status || 'N/A'}</dd>
                            <dt class="col-sm-3">Última Atualização:</dt><dd class="col-sm-9">${data.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : 'N/A'}</dd>
                            <dt class="col-sm-3">Mensagem:</dt><dd class="col-sm-9">${data.message || 'N/A'}</dd>
                        </dl>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    // Remove any existing modal first
    $('#imagerDetailsModal').remove();
    $('body').append(modalContent);
    
    var modalInstance = new bootstrap.Modal(document.getElementById('imagerDetailsModal'));
    modalInstance.show();
}

/**
 * Open PDF file in a new window/tab
 */
function openPdfFile(fileId) {
    if (!fileId) {
        showNotification('ID do arquivo não encontrado', 'error');
        return;
    }
    
    // Create a safe URL for the PDF file (uses temporary copy)
    const pdfUrl = `/api/imager/exam-documents/${fileId}/view`;
    
    // Try to open the PDF in a new window/tab
    try {
        const newWindow = window.open(pdfUrl, '_blank');
        if (!newWindow) {
            // If popup was blocked, show alternative
            showNotification('Pop-ups bloqueados. Por favor, permita pop-ups para este site e tente novamente.', 'warning');
        } else {
            showNotification('PDF aberto em nova aba (cópia temporária para evitar interferência no processamento)', 'info');
        }
    } catch (error) {
        console.error('Error opening PDF:', error);
        showNotification('Erro ao abrir PDF: ' + error.message, 'error');
    }
}

// Legacy function for direct file access (kept for backward compatibility)
function openPdfFileDirect(fileId) {
    if (!fileId) {
        showNotification('ID do arquivo não encontrado', 'error');
        return;
    }
    
    // Create a direct URL for the PDF file (no copy, may interfere with processing)
    const pdfUrl = `/api/imager/exam-documents/${fileId}/view-direct`;
    
    // Try to open the PDF in a new window/tab
    try {
        const newWindow = window.open(pdfUrl, '_blank');
        if (!newWindow) {
            // If popup was blocked, show alternative
            showNotification('Pop-ups bloqueados. Por favor, permita pop-ups para este site e tente novamente.', 'warning');
        }
    } catch (error) {
        console.error('Error opening PDF:', error);
        showNotification('Erro ao abrir PDF: ' + error.message, 'error');
    }
}

/**
 * Archive/delete a document from step 2
 */
function archiveDocument(documentId, fileName) {
    if (!documentId) {
        showNotification('ID do documento não encontrado', 'error');
        return;
    }

    if (!confirm(`Tem certeza que deseja arquivar o documento "${fileName}"?\n\nO arquivo será movido para a pasta de arquivos processados.`)) {
        return;
    }

    // Call archive endpoint
    fetch(`/api/imager/exam-documents/${documentId}/archive`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            return response.text().then(text => {
                throw new Error(text || 'Erro ao arquivar documento');
            });
        }
        return response.json();
    })
    .then(data => {
        showNotification(data.message || 'Documento arquivado com sucesso', 'success');
        // Refresh the table
        if (imagerWorklistTable) {
            imagerWorklistTable.ajax.reload();
        }
        // Refresh stats
        loadImagerStats();
    })
    .catch(error => {
        console.error('Error archiving document:', error);
        showNotification('Erro ao arquivar documento: ' + error.message, 'error');
    });
}

function showDeleteItemModal(itemId) {
    // Create modal HTML
    const modalHtml = `
        <div class="modal fade" id="deleteItemModal" tabindex="-1" aria-labelledby="deleteItemModalLabel" aria-hidden="true">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="deleteItemModalLabel">Confirmar Exclusão</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <p>Tem certeza que deseja excluir este item da fila?</p>
                        <div class="form-check mt-3">
                            <input class="form-check-input" type="checkbox" id="returnToQueueCheckbox" name="returnToQueue">
                            <label class="form-check-label text-success" for="returnToQueueCheckbox">
                                <strong>Retornar o arquivo para fila de processamento?</strong>
                                <br><small class="text-muted">🔄 Se marcado: o arquivo volta para a fila e NÃO será casado novamente com este exame | Se desmarcado: o arquivo será descartado (lixeira)</small>
                            </label>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-danger" onclick="confirmDeleteItem(${itemId})">Excluir Item</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Remove any existing modal
    const existingModal = document.getElementById('deleteItemModal');
    if (existingModal) {
        existingModal.remove();
    }

    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('deleteItemModal'));
    modal.show();

    // Clean up modal after it's hidden
    document.getElementById('deleteItemModal').addEventListener('hidden.bs.modal', function () {
        this.remove();
    });
}

function confirmDeleteItem(itemId) {
    const returnToQueueCheckbox = document.getElementById('returnToQueueCheckbox');
    const returnToQueue = returnToQueueCheckbox ? returnToQueueCheckbox.checked : false;

    // Invert logic: if returnToQueue is checked, don't delete file (return to source)
    // if returnToQueue is unchecked, delete file (move to trash)
    const deleteFile = !returnToQueue;

    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('deleteItemModal'));
    if (modal) {
        modal.hide();
    }

    // Perform deletion
    deleteQueueItem(itemId, deleteFile);
}

function deleteQueueItem(itemId, deleteFile = false) {
    if (deleteFile === undefined) {
        // Legacy call without deleteFile parameter - show confirmation
        if (!confirm('Tem certeza que deseja excluir este item da fila?')) {
            return;
        }
    }

    const url = deleteFile ?
        `/api/imager/processing-exams/items/${itemId}?deleteFile=true` :
        `/api/imager/processing-exams/items/${itemId}`;

    fetch(url, { method: 'DELETE' })
        .then(response => {
            if (response.ok) {
                return response.json();
            }
            throw new Error('Failed to delete item');
        })
        .then(data => {
            showNotification(data.message || 'Item excluído com sucesso', 'success');

            // If we're in tree view (step3 or step4), update tree intelligently without full reload
            if (currentStep === 'step3' || currentStep === 'step4') {
                updateTreeAfterItemDeletion(itemId);
            } else {
                // For other views, do normal reload
                if (imagerWorklistTable) {
                    imagerWorklistTable.ajax.reload(null, false);
                }
            }

            // Always refresh stats
            loadImagerStats();
        })
        .catch(error => {
            console.error('Error deleting item:', error);
            showNotification('Erro ao excluir item', 'error');
        });
}

/**
 * Update tree view after item deletion without full reload
 */
function updateTreeAfterItemDeletion(itemId) {
    // Find and remove the child row from DOM
    const childRow = $(`.tree-child[data-file-id="${itemId}"]`);

    if (!childRow.length) {
        // Item not found in DOM, do full reload
        if (imagerWorklistTable) {
            imagerWorklistTable.ajax.reload(null, false);
        }
        return;
    }

    const groupKey = childRow.data('group-key');

    // Remove the child row from DOM
    childRow.remove();

    // Count remaining child items for this group
    const remainingChildren = $(`.tree-child[data-group-key="${groupKey}"]`).length;

    if (remainingChildren === 0) {
        // No more children - reload to remove the parent group
        if (imagerWorklistTable) {
            imagerWorklistTable.ajax.reload(null, false);
        }
    } else {
        // Update the file count in the parent row
        const parentRow = $(`#toggle-${groupKey}`).closest('tr');
        const fileCountBadge = parentRow.find('.badge.bg-info');

        if (fileCountBadge.length) {
            fileCountBadge.text(`${remainingChildren} ${remainingChildren === 1 ? 'arquivo' : 'arquivos'}`);
        }

        // Update the data in DataTable's internal storage
        const tableData = imagerWorklistTable.data();
        tableData.each(function(row, index) {
            if (row.groupKey === groupKey && row.files) {
                // Remove the deleted file from the files array
                row.files = row.files.filter(f => f.id !== itemId);
                row.fileCount = row.files.length;
                // Update the row data
                imagerWorklistTable.row(index).data(row);
                return false; // break
            }
        });
    }
}

/**
 * Delete entire patient group from processing queue (Step 3 specific)
 */
function step3_deletePatientGroup(nrPrescricao, nrSeqPrescricao, dsProcesso, configId) {
    // If configId is not provided, we need to get it from somewhere
    if (!configId) {
        showNotification('Erro: ID da configuração não encontrado', 'error');
        return;
    }

    // Show custom confirmation dialog with TASY deletion option
    showDeleteConfirmationDialog(nrPrescricao, nrSeqPrescricao, dsProcesso, configId);
}

/**
 * Retry Step 4 for a STEP4_FAILED exam
 */
function step3_retryStep4(nrPrescricao, nrSeqPrescricao, configId) {
    if (!configId) {
        showNotification('Erro: ID da configuração não encontrado', 'error');
        return;
    }

    if (!confirm('Deseja reprocessar o Step 4 para esta prescrição?')) {
        return;
    }

    $.ajax({
        url: '/api/imager/processing-exams/retry-step4',
        type: 'POST',
        data: {
            nrPrescricao: nrPrescricao,
            nrSeqPrescricao: nrSeqPrescricao,
            configId: configId
        },
        success: function(data) {
            if (data.success) {
                showNotification(data.message || 'Step 4 será reprocessado.', 'success');
                if (imagerWorklistTable) {
                    imagerWorklistTable.ajax.reload(null, false);
                }
            } else {
                showNotification(data.message || 'Erro ao reprocessar.', 'error');
            }
        },
        error: function(xhr) {
            const msg = xhr.responseJSON && xhr.responseJSON.message ? xhr.responseJSON.message : 'Erro ao reprocessar Step 4.';
            showNotification(msg, 'error');
        }
    });
}

/**
 * Delete entire patient group from processing queue (Legacy - for compatibility)
 */
function deletePatientGroup(nrPrescricao, nrSeqPrescricao, dsProcesso, configId) {
    step3_deletePatientGroup(nrPrescricao, nrSeqPrescricao, dsProcesso, configId);
}

/**
 * Limpa o blacklist (PROCESSING_EXAM_ITEM_EXCLUSION) de um exame, liberando
 * os arquivos vetados para voltarem a ser candidatos no próximo matching.
 */
function step3_clearExclusions(nrPrescricao, nrSeqPrescricao, configId, exclusionCount) {
    if (!configId) {
        showNotification('Erro: ID da configuração não encontrado', 'error');
        return;
    }

    const count = exclusionCount || 0;
    const message = count > 0
        ? `Limpar o blacklist deste exame? ${count} arquivo${count === 1 ? '' : 's'} vetado${count === 1 ? '' : 's'} voltará${count === 1 ? '' : 'ão'} a ser candidato${count === 1 ? '' : 's'} no próximo matching.`
        : 'Limpar o blacklist deste exame?';

    if (!confirm(message)) {
        return;
    }

    $.ajax({
        url: '/api/imager/processing-exams/exclusions',
        type: 'DELETE',
        data: {
            nrPrescricao: nrPrescricao,
            nrSeqPrescricao: nrSeqPrescricao,
            configId: configId
        },
        success: function(data) {
            if (data && data.success) {
                showNotification(data.message || 'Blacklist limpo.', 'success');
                if (imagerWorklistTable) {
                    imagerWorklistTable.ajax.reload(null, false);
                }
            } else {
                showNotification((data && data.message) || 'Erro ao limpar blacklist.', 'error');
            }
        },
        error: function(xhr) {
            const msg = xhr.responseJSON && xhr.responseJSON.message ? xhr.responseJSON.message : 'Erro ao limpar blacklist.';
            showNotification(msg, 'error');
        }
    });
}

function showDeleteConfirmationDialog(nrPrescricao, nrSeqPrescricao, dsProcesso, configId) {
    // Opções de TASY só fazem sentido quando o HIS atual é Tasy (TASY_JAVA/TASY_HTML5).
    // Para AMPLIMED (e qualquer HIS não-Tasy futuro) escondemos o checkbox e nunca chamamos a procedure.
    const hisIsTasy = typeof isImagerHisTasy === 'function' ? isImagerHisTasy() : true;
    const tasyCheckboxHtml = hisIsTasy ? `
                        <div class="form-check">
                            <input class="form-check-input" type="checkbox" id="deleteTasyDataCheck" checked>
                            <label class="form-check-label" for="deleteTasyDataCheck">
                                <strong>Excluir também os dados do TASY EMR</strong>
                                <small class="text-muted d-block">
                                    Se marcado, os dados também serão removidos das tabelas do TASY (prescr_procedimento_obs e laudo_paciente_imagem)
                                </small>
                            </label>
                        </div>` : '';

    // Create modal HTML
    const modalHtml = `
        <div class="modal fade" id="deleteConfirmModal" tabindex="-1" aria-labelledby="deleteConfirmModalLabel" aria-hidden="true">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="deleteConfirmModalLabel">
                            <i class="bi bi-exclamation-triangle text-warning"></i>
                            Confirmar Exclusão
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <p><strong>Tem certeza que deseja excluir TODO o grupo do paciente?</strong></p>
                        <div class="alert alert-info">
                            <strong>Dados do Grupo:</strong><br>
                            <strong>Prescrição:</strong> ${nrPrescricao}<br>
                            <strong>Seq. Prescrição:</strong> ${nrSeqPrescricao}<br>
                            <strong>Processo:</strong> ${dsProcesso}
                        </div>
                        <div class="alert alert-warning">
                            <i class="bi bi-exclamation-triangle"></i>
                            <strong>ATENÇÃO:</strong> ISTO EXCLUIRÁ TODOS OS ITENS DO GRUPO do banco local!
                        </div>
                        ${tasyCheckboxHtml}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-danger" id="confirmDeleteBtn">
                            <i class="bi bi-trash"></i>
                            Excluir Grupo
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if any
    const existingModal = document.getElementById('deleteConfirmModal');
    if (existingModal) {
        existingModal.remove();
    }

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
    modal.show();

    // Handle confirm button click
    document.getElementById('confirmDeleteBtn').addEventListener('click', function() {
        const tasyCheck = document.getElementById('deleteTasyDataCheck');
        const deleteTasyData = hisIsTasy && tasyCheck && tasyCheck.checked;
        executePatientGroupDeletion(nrPrescricao, nrSeqPrescricao, configId, deleteTasyData);
        modal.hide();
    });

    // Clean up modal when hidden
    document.getElementById('deleteConfirmModal').addEventListener('hidden.bs.modal', function() {
        document.getElementById('deleteConfirmModal').remove();
    });
}

function executePatientGroupDeletion(nrPrescricao, nrSeqPrescricao, configId, deleteTasyData) {
    const params = new URLSearchParams({
        nrPrescricao: nrPrescricao,
        nrSeqPrescricao: nrSeqPrescricao,
        configId: configId,
        deleteTasyData: deleteTasyData
    });

    fetch(`/api/imager/processing-exams/delete-parent?${params}`, { method: 'DELETE' })
        .then(response => {
            if (response.ok) {
                return response.json();
            } else {
                throw new Error('Erro ao excluir grupo');
            }
        })
        .then(data => {
            if (data.success) {
                showNotification(`${data.message} - ${data.deletedCount} item(s) removido(s).`, 'success');
                if (imagerWorklistTable) {
                    imagerWorklistTable.ajax.reload(null, false);
                }
                loadImagerStats();
            } else {
                showNotification('Erro ao excluir grupo: ' + (data.message || data.error || 'Erro desconhecido'), 'error');
            }
        })
        .catch(error => {
            console.error('Error deleting patient group:', error);
            showNotification('Erro ao excluir grupo do paciente', 'error');
        });
}

// View mode removed - step3 always uses tree view
// Tree node functions moved to respective files:
// - step3_toggleTreeNode, step3_expandTreeNode, step3_collapseTreeNode → imager-approval.js
// - step4_toggleTreeNode, step4_expandTreeNode, step4_collapseTreeNode → imager-completed.js

/**
 * Get CSS class for file status
 */
function getFileStatusClass(status) {
    switch(status) {
        case 'COMPLETED': return 'status-processed';
        case 'PROCESSING': return 'status-processing';
        case 'FAILED': return 'status-failed';
        case 'PENDING': return 'status-ready';
        case 'SKIPPED': return 'status-skipped';
        case 'CONSOLIDATED': return 'status-processed';  // Same as completed - processed as part of consolidated file
        default: return 'status-incomplete';
    }
}

/**
 * Get display text for file status
 */
function getFileStatusText(status) {
    switch(status) {
        case 'COMPLETED': return 'Processado';
        case 'PROCESSING': return 'Processando';
        case 'FAILED': return 'Falhou';
        case 'PENDING': return 'Pendente';
        case 'SKIPPED': return 'Ignorado';
        case 'CONSOLIDATED': return 'Consolidado';
        default: return 'Desconhecido';
    }
}

/**
 * Approve patient group for step 4 processing (Step 3 specific)
 * NOTE: This function is no longer called from the UI (button removed).
 * Approval is now done exclusively via the approval-review modal.
 * This is a duplicate of the function in imager-approval.js - kept for backwards compatibility.
 */
function step3_approvePatientGroup(nrPrescricao, nrSeqPrescricao, dsProcesso, configId) {
    // This function is deprecated - approval should be done via approval-review modal
    console.warn('step3_approvePatientGroup called but approval should be done via modal');

    if (typeof showNotification === 'function') {
        showNotification('Por favor, use o modal de revisão para aprovar arquivos', 'warning');
    } else {
        alert('Por favor, use o modal de revisão para aprovar arquivos');
    }
}

/**
 * Legacy function for compatibility - redirects to step3_approvePatientGroup
 * @deprecated Use approval-review modal instead
 */
function approvePatientGroup(nrPrescricao, nrSeqPrescricao, dsProcesso, configId) {
    step3_approvePatientGroup(nrPrescricao, nrSeqPrescricao, dsProcesso, configId);
}

/**
 * Process entire patient group (original functionality)
 */
function processPatientGroup(nrPrescricao, nrSeqPrescricao, dsProcesso, configId) {
    // Disable the button to prevent multiple clicks
    const button = event.target.closest('button');
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
    button.disabled = true;
    
    // Ensure configId is provided
    if (!configId) {
        showNotification('Erro: ID da configuração não encontrado', 'error');
        button.innerHTML = originalText;
        button.disabled = false;
        return;
    }
    
    const params = new URLSearchParams({
        nrPrescricao: nrPrescricao,
        nrSeqPrescricao: nrSeqPrescricao,
        configId: configId
    });
    
    fetch('/api/imager/processing-exams/approve-parent', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification(`Processamento concluído com sucesso!\n${data.message}`, 'success');
            
            // Refresh the table
            if (imagerWorklistTable) {
                imagerWorklistTable.ajax.reload(null, false);
            }
            loadImagerStats();
        } else {
            showNotification(`Erro no processamento: ${data.message || 'Erro desconhecido'}`, 'error');
        }
    })
    .catch(error => {
        console.error('Error approving patient group:', error);
        showNotification('Erro ao processar grupo do paciente', 'error');
    })
    .finally(() => {
        // Re-enable the button
        button.innerHTML = originalText;
        button.disabled = false;
    });
}

// Cleanup when leaving the page
function cleanupImagerDashboard() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
    
    // Clear stats loading timeout
    if (statsLoadTimeout) {
        clearTimeout(statsLoadTimeout);
        statsLoadTimeout = null;
    }
    
    // Reset stats loading flag
    isLoadingStats = false;

    // Clear expanded tree nodes
    expandedTreeNodes.clear();

    // Destroy DataTable
    if (imagerWorklistTable) {
        imagerWorklistTable.destroy();
        imagerWorklistTable = null;
    }
    
    // Reset initialization flag to allow re-initialization
    isDashboardInitialized = false;
}

/**
 * Apply step filter when clicking on a statistics card
 */
function applyStepFilter(step) {
    // Update the step filter dropdown
    $('#stepFilter').val(step);
    
    // Update current step
    currentStep = step;
    
    // Clear expanded tree nodes when switching steps
    expandedTreeNodes.clear();

    // Clear manual matching selections and reset warning
    clearManualMatchingSelections();
    sessionStorage.removeItem('examFilterWarningShown');
    
    // Update visual state of cards
    $('.stats-card').removeClass('active');
    $(`#${step}-${getStepCardSuffix(step)}-card .stats-card`).addClass('active');
    
    // Reload table and stats
    initImagerDataTable();
    loadImagerStats();
}

/**
 * Helper function to get card suffix for each step
 */
function getStepCardSuffix(step) {
    switch(step) {
        case 'step1': return 'patients';
        case 'step2': return 'files';
        case 'step3': return 'queue';
        case 'step4': return 'processed';
        default: return '';
    }
}

// Make functions globally available if they are called from HTML onclick or other scripts
/**
 * Open ProcessingQueue PDF file in a new window/tab (for step 3)
 */
function openProcessingQueuePdfFile(processingQueueId) {
    if (!processingQueueId) {
        showNotification('ID do arquivo na fila não encontrado', 'error');
        return;
    }
    
    // Create a safe URL for the ProcessingExamItem PDF file (uses temporary copy)
    const pdfUrl = `/api/imager/processing-exams/items/${processingQueueId}/view`;
    
    // Try to open the PDF in a new window/tab
    try {
        const newWindow = window.open(pdfUrl, '_blank');
        if (!newWindow) {
            // If popup was blocked, show alternative
            showNotification('Pop-ups bloqueados. Por favor, permita pop-ups para este site e tente novamente.', 'warning');
        } else {
            showNotification('PDF aberto em nova aba (cópia temporária para evitar interferência no processamento)', 'info');
        }
    } catch (error) {
        console.error('Error opening ProcessingQueue PDF:', error);
        showNotification('Erro ao abrir PDF da fila: ' + error.message, 'error');
    }
}

/**
 * View details of completed exam
 */
function viewCompletedExamDetails(nrPrescricao, nrSeqPrescricao, dsProcesso) {
    const params = new URLSearchParams({
        nrPrescricao: nrPrescricao,
        nrSeqPrescricao: nrSeqPrescricao,
        dsProcesso: dsProcesso
    });
    
    fetch(`/api/imager/processing-exams/completed-details?${params}`)
        .then(response => response.json())
        .then(data => {
            showCompletedExamDetailsModal(data);
        })
        .catch(error => {
            console.error('Error loading completed exam details:', error);
            showNotification('Erro ao carregar detalhes do exame', 'error');
        });
}

/**
 * Show completed exam details modal
 */
function showCompletedExamDetailsModal(data) {
    const filesHtml = data.files && data.files.length > 0 ? 
        data.files.map(file => `
            <tr>
                <td>${file.nmArquivo || 'Sem nome'}</td>
                <td>${file.status}</td>
                <td>${file.processedAt ? new Date(file.processedAt).toLocaleString('pt-BR') : '-'}</td>
                <td>${file.errorMessage || '-'}</td>
            </tr>
        `).join('') : 
        '<tr><td colspan="4" class="text-center">Nenhum arquivo encontrado</td></tr>';
    
    const modalContent = `
        <div class="modal fade" id="completedExamDetailsModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Detalhes do Exame Processado</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <dl class="row">
                            <dt class="col-sm-3">Prescrição:</dt><dd class="col-sm-9">${data.nrPrescricao || 'N/A'}</dd>
                            <dt class="col-sm-3">Paciente:</dt><dd class="col-sm-9">${data.nmPaciente || 'N/A'}</dd>
                            <dt class="col-sm-3">Médico:</dt><dd class="col-sm-9">${data.nmMedico || 'N/A'}</dd>
                            <dt class="col-sm-3">Processo:</dt><dd class="col-sm-9">${data.dsProcesso || 'N/A'}</dd>
                            <dt class="col-sm-3">Status:</dt><dd class="col-sm-9">${{'PENDING':'Pendente','COMPLETED':'Concluído','READY':'Pronto','APPROVED':'Aprovado','AUTOAPPROVED':'Auto-Aprovado','AUTO_APPROVED':'Auto-Aprovado','PROCESSED':'Processado','FAILED':'Falhou','PROCESSING':'Processando','INCOMPLETE':'Incompleto'}[data.parentStatus] || data.parentStatus || 'Concluído'}</dd>
                            <dt class="col-sm-3">Processado em:</dt><dd class="col-sm-9">${data.completedAt ? new Date(data.completedAt).toLocaleString('pt-BR') : 'N/A'}</dd>
                        </dl>
                        
                        <h6 class="mt-4">Arquivos Processados:</h6>
                        <div class="table-responsive">
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>Arquivo</th>
                                        <th>Status</th>
                                        <th>Processado em</th>
                                        <th>Observações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${filesHtml}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove any existing modal first
    $('#completedExamDetailsModal').remove();
    $('body').append(modalContent);
    
    var modalInstance = new bootstrap.Modal(document.getElementById('completedExamDetailsModal'));
    modalInstance.show();
}

/**
 * Open final processed file in patient path (for step 4)
 */
function openFinalProcessedFile(processingItemId) {
    if (!processingItemId) {
        showNotification('ID do arquivo não encontrado', 'error');
        return;
    }
    
    // Create URL for the final processed file
    const pdfUrl = `/api/imager/processing-exams/items/${processingItemId}/tasy-file`;
    
    // Try to open the PDF in a new window/tab
    try {
        const newWindow = window.open(pdfUrl, '_blank');
        if (!newWindow) {
            // If popup was blocked, show alternative
            showNotification('Pop-ups bloqueados. Por favor, permita pop-ups para este site e tente novamente.', 'warning');
        } else {
            showNotification('Abrindo arquivo final processado', 'info');
        }
    } catch (error) {
        console.error('Error opening final processed PDF:', error);
        showNotification('Erro ao abrir PDF final: ' + error.message, 'error');
    }
}

/**
 * Open the final consolidated TASY file for a parent group in step 4
 */
function openFinalConsolidatedFile(filePath) {
    if (!filePath) {
        showNotification('Caminho do arquivo consolidado não encontrado', 'error');
        return;
    }
    
    // Create URL for the consolidated TASY file using the file path
    const encodedPath = encodeURIComponent(filePath);
    const pdfUrl = `/api/imager/processing-exams/consolidated-file?path=${encodedPath}`;
    
    // Try to open the PDF in a new window/tab
    try {
        const newWindow = window.open(pdfUrl, '_blank');
        if (!newWindow) {
            // If popup was blocked, show alternative
            showNotification('Pop-ups bloqueados. Por favor, permita pop-ups para este site e tente novamente.', 'warning');
        } else {
            showNotification('Abrindo arquivo consolidado do TASY', 'info');
        }
    } catch (error) {
        console.error('Error opening consolidated TASY PDF:', error);
        showNotification('Erro ao abrir PDF consolidado: ' + error.message, 'error');
    }
}

/**
 * View MATCH_QUERY_CONDITIONS content for a processing exam item
 */
function viewMatchQueryConditions(processingItemId) {
    if (!processingItemId) {
        showNotification('ID do item não encontrado', 'error');
        return;
    }
    
    fetch(`/api/imager/processing-exams/items/${processingItemId}/match-conditions`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            showMatchQueryConditionsModal(data);
        })
        .catch(error => {
            console.error('Error loading match query conditions:', error);
            showNotification('Erro ao carregar condições de match: ' + error.message, 'error');
        });
}

/**
 * Show match query conditions modal
 */
function showMatchQueryConditionsModal(data) {
    const matchConditions = data.matchQueryConditions || 'Nenhuma condição de match encontrada';
    const fileName = data.fileName || 'Arquivo sem nome';
    
    const modalContent = `
        <div class="modal fade" id="matchConditionsModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-search text-info me-2"></i>
                            Condições de Match
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label class="form-label fw-bold">Arquivo:</label>
                            <div class="bg-light p-2 rounded">${fileName}</div>
                        </div>
                        <div class="mb-3">
                            <label class="form-label fw-bold">Condições de Match (MATCH_QUERY_CONDITIONS):</label>
                            <div class="bg-light p-3 rounded" style="max-height: 300px; overflow-y: auto;">
                                <pre class="mb-0" style="white-space: pre-wrap; word-wrap: break-word;">${matchConditions}</pre>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            <i class="fas fa-times me-1"></i>
                            Fechar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove any existing modal first
    $('#matchConditionsModal').remove();
    $('body').append(modalContent);
    
    var modalInstance = new bootstrap.Modal(document.getElementById('matchConditionsModal'));
    modalInstance.show();
}

// ===== MANUAL MATCHING FUNCTIONS =====

/**
 * Initialize manual matching for step2 with configuration check
 */
async function initManualMatchingWithConfig() {
    console.log('Checking manual matching configuration for step2');
    
    const configId = $('#examFilter').val();
    if (!configId) {
        console.log('No config selected, skipping manual matching initialization');
        return;
    }
    
    try {
        const response = await fetch(`/api/imager/config/${configId}`);
        if (!response.ok) {
            console.error('Failed to load configuration:', response.statusText);
            return;
        }
        
        const config = await response.json();
        console.log('Configuration loaded:', config);
        
        if (config.manualMatchingEnabled === true) {
            console.log('Manual matching enabled for this configuration');
            initManualMatching();
        } else {
            console.log('Manual matching disabled for this configuration');
            hideManualMatchingUI();
        }
    } catch (error) {
        console.error('Error loading configuration:', error);
        // Default to showing manual matching if there's an error
        initManualMatching();
    }
}

/**
 * Hide manual matching UI when disabled
 */
function hideManualMatchingUI() {
    // Remove manual match button if it exists
    $('#manual-match-btn').parent().remove();
    window.manualMatchButton = null;
    
    // Clear any existing selections
    clearManualMatchingSelections();
}

/**
 * Initialize manual matching for step2
 */
function initManualMatching() {
    console.log('Initializing manual matching for step2');
    
    // Create manual match button if it doesn't exist
    if (!$('#manual-match-btn').length) {
        createManualMatchButton();
    }
    
    // Setup event listeners for checkboxes
    setupManualMatchEventListeners();
    
    // Update button visibility
    updateManualMatchButtonVisibility();
}

/**
 * Create the manual match button
 */
function createManualMatchButton() {
    const buttonHtml = `
        <div class="position-fixed bottom-0 end-0 p-3" style="z-index: 1000;">
            <div id="selection-count" class="text-white bg-dark px-2 py-1 rounded small mb-2" style="display: none;">
                0 arquivo(s) selecionado(s)
            </div>
            <button id="manual-match-btn" class="btn btn-primary shadow-lg" style="display: none;">
                <i class="bi bi-link-45deg"></i>
                Vincular Manualmente
            </button>
        </div>
    `;
    
    $('body').append(buttonHtml);
    window.manualMatchButton = $('#manual-match-btn');

    // Add click handler
    window.manualMatchButton.on('click', initiateManualMatch);
}

/**
 * Setup event listeners for manual matching
 */
function setupManualMatchEventListeners() {
    // Document selection checkbox changes
    $(document).on('change', '.document-select-checkbox', handleDocumentSelection);
    
    // Select all checkbox
    $(document).on('change', '#select-all-documents', handleSelectAll);
}

/**
 * Handle individual document selection
 */
function handleDocumentSelection(e) {
    const selectedDocs = window.selectedDocumentIds || new Set();
    const checkbox = $(e.target);
    const documentId = checkbox.data('document-id');

    if (checkbox.is(':checked')) {
        selectedDocs.add(documentId);
    } else {
        selectedDocs.delete(documentId);
        // Uncheck select all if any item is unchecked
        $('#select-all-documents').prop('checked', false);
    }

    // Update window reference if needed
    if (!window.selectedDocumentIds) {
        window.selectedDocumentIds = selectedDocs;
    }

    updateManualMatchButtonVisibility();
    updateSelectionCount();
}

/**
 * Handle select all checkbox
 */
function handleSelectAll(e) {
    const selectedDocs = window.selectedDocumentIds || new Set();
    const isChecked = $(e.target).is(':checked');

    if (isChecked) {
        // Select all visible checkboxes
        $('.document-select-checkbox:visible').each(function() {
            const checkbox = $(this);
            const documentId = checkbox.data('document-id');
            selectedDocs.add(documentId);
            checkbox.prop('checked', true);
        });
    } else {
        // Deselect all
        selectedDocs.clear();
        $('.document-select-checkbox').prop('checked', false);
    }

    // Update window reference if needed
    if (!window.selectedDocumentIds) {
        window.selectedDocumentIds = selectedDocs;
    }

    updateManualMatchButtonVisibility();
    updateSelectionCount();
}

/**
 * Update manual match button visibility
 */
function updateManualMatchButtonVisibility() {
    // Access variables from window object (set by imager-files.js)
    const manualMatchBtn = window.manualMatchButton || $('#manual-match-btn');
    const selectedDocs = window.selectedDocumentIds || new Set();

    if (!manualMatchBtn || !manualMatchBtn.length) {
        console.log('Manual match button not found');
        return;
    }

    console.log('UpdateManualMatchButtonVisibility called:', {
        selectedCount: selectedDocs.size,
        currentStep: currentStep,
        currentExam: currentExam,
        buttonExists: manualMatchBtn.length > 0
    });

    // Check if we have both selected documents, are in step2, AND have an exam filter selected
    if (selectedDocs.size > 0 && currentStep === 'step2' && currentExam) {
        // Show button
        manualMatchBtn.css('display', 'block');

        // Update button text with count
        const text = selectedDocs.size === 1
            ? 'Vincular Manualmente (1 arquivo)'
            : `Vincular Manualmente (${selectedDocs.size} arquivos)`;

        manualMatchBtn.html(`<i class="bi bi-link-45deg"></i> ${text}`);

        // Check for max documents
        if (selectedDocs.size > 50) {
            manualMatchBtn.prop('disabled', true)
                  .removeClass('btn-primary')
                  .addClass('btn-secondary')
                  .attr('title', 'Máximo de 50 documentos por vinculação');
        } else {
            manualMatchBtn.prop('disabled', false)
                  .removeClass('btn-secondary')
                  .addClass('btn-primary')
                  .attr('title', 'Vincular documentos selecionados manualmente');
        }
    } else {
        // Hide button
        manualMatchBtn.css('display', 'none');

        // Show notification if user has selections but no exam filter
        if (selectedDocs.size > 0 && currentStep === 'step2' && !currentExam) {
            // Only show this notification once per session to avoid spam
            if (!sessionStorage.getItem('examFilterWarningShown')) {
                showNotification('Selecione uma configuração de exame no filtro para habilitar a vinculação manual', 'warning');
                sessionStorage.setItem('examFilterWarningShown', 'true');
            }
        }
    }
}

/**
 * Update selection count display
 */
function updateSelectionCount() {
    const selectedDocs = window.selectedDocumentIds || new Set();
    const countElement = $('#selection-count');
    if (countElement.length) {
        if (selectedDocs.size > 0) {
            countElement.text(`${selectedDocs.size} arquivo(s) selecionado(s)`).show();
        } else {
            countElement.hide();
        }
    }
}

/**
 * Initiate manual match process
 */
function initiateManualMatch() {
    const selectedDocs = window.selectedDocumentIds || new Set();
    console.log('Initiating manual match for documents:', Array.from(selectedDocs));

    if (selectedDocs.size === 0) {
        showNotification('Selecione pelo menos um arquivo', 'warning');
        return;
    }

    // Show modal to select exam
    showExamSelectionModal();
}

/**
 * Show modal for exam selection
 */
function showExamSelectionModal() {
    const selectedDocs = window.selectedDocumentIds || new Set();

    // Create modal HTML
    const modalHtml = `
        <div class="modal fade" id="examSelectionModal" tabindex="-1" aria-labelledby="examSelectionModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="examSelectionModalLabel">
                            <i class="bi bi-link-45deg"></i>
                            Vincular Arquivos Manualmente
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
                        <div class="alert alert-info">
                            <strong>Arquivos selecionados:</strong> ${selectedDocs.size} arquivo(s)
                            <br><small class="text-muted">Selecione um exame/paciente da lista abaixo para vincular os arquivos</small>
                        </div>
                        
                        <div class="mb-3">
                            <label for="examSearch" class="form-label">Buscar Exame:</label>
                            <input type="text" class="form-control" id="examSearch" placeholder="Digite nome do paciente, CPF ou procedimento...">
                        </div>
                        
                        <div class="table-responsive" style="max-height: 450px; overflow-y: auto;">
                            <table class="table table-hover table-sm" id="examSelectionTable">
                                <thead class="table-dark sticky-top">
                                    <tr>
                                        <th style="width: 10%;">Data</th>
                                        <th style="width: 10%;">Prescrição</th>
                                        <th style="width: 20%;">Paciente</th>
                                        <th style="width: 12%;">CPF</th>
                                        <th style="width: 30%;">Procedimento</th>
                                        <th style="width: 18%; text-align: center;">Ação</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td colspan="5" class="text-center">
                                            <div class="spinner-border text-primary" role="status">
                                                <span class="visually-hidden">Carregando...</span>
                                            </div>
                                            <br>Carregando exames disponíveis...
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="modal-footer border-top">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-primary" id="confirmExamSelectionBtn" disabled>
                            <i class="bi bi-check-circle"></i>
                            Confirmar Seleção
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    $('#examSelectionModal').remove();

    // Add modal to body
    $('body').append(modalHtml);

    // Show modal using Bootstrap 5 API
    examSelectionModalInstance = new bootstrap.Modal(document.getElementById('examSelectionModal'));
    examSelectionModalInstance.show();
    
    // Load available exams
    loadAvailableExams();
    
    // Setup search functionality
    setupExamSearch();
    
    // Setup confirm button
    $('#confirmExamSelectionBtn').on('click', function() {
        if (window.selectedExam) {
            showManualMatchConfirmation(
                window.selectedExam.placerOrder,
                window.selectedExam.fillerOrder,
                window.selectedExam.patientName,
                window.selectedExam.procedure
            );
        }
    });
}

/**
 * Load available exams for manual matching
 */
function loadAvailableExams() {
    console.log('Loading available exams for manual matching');
    
    // Get current config ID
    const configId = $('#examFilter').val();
    
    if (!configId) {
        showNotification('Selecione uma configuração primeiro', 'warning');
        if (examSelectionModalInstance) {
            examSelectionModalInstance.hide();
        }
        return;
    }
    
    // Fetch pending exam orders
    fetch(`/api/imager/exam-documents/pending-orders?configId=${configId}`)
        .then(response => response.json())
        .then(data => {
            console.log('Available exams loaded:', data);
            populateExamTable(data);
        })
        .catch(error => {
            console.error('Error loading exams:', error);
            showNotification('Erro ao carregar exames disponíveis', 'error');
            if (examSelectionModalInstance) {
                examSelectionModalInstance.hide();
            }
        });
}

/**
 * Populate exam selection table
 */
function populateExamTable(exams) {
    const tbody = $('#examSelectionTable tbody');
    tbody.empty();
    
    if (!exams || exams.length === 0) {
        tbody.append(`
            <tr>
                <td colspan="5" class="text-center text-muted">
                    <i class="bi bi-info-circle"></i>
                    Nenhum exame pendente encontrado para esta configuração
                </td>
            </tr>
        `);
        return;
    }
    
    exams.forEach(exam => {
        const patientName = exam.patientName || '-';
        const procedure = exam.procedureDescription || '-';
        const cpf = formatCPF(exam.patientId) || '-';
        const date = formatDateShort(exam.orderDateTime) || '-';
        const orderNumber = exam.placerOrderNumber || '-';
        
        const row = `
            <tr>
                <td title="${date}" class="text-nowrap">
                    <small>${date}</small>
                </td>
                <td title="${orderNumber}" class="text-nowrap">
                    <small><strong>${orderNumber}</strong></small>
                </td>
                <td title="${patientName}">
                    <div class="text-truncate" style="max-width: 200px;">
                        ${patientName}
                    </div>
                </td>
                <td title="${cpf}">
                    <small class="text-nowrap">${cpf}</small>
                </td>
                <td title="${procedure}">
                    <div class="text-truncate" style="max-width: 280px;">
                        <small>${procedure}</small>
                    </div>
                </td>
                <td class="text-center">
                    <button class="btn btn-sm btn-primary select-exam-btn" 
                            data-placer-order="${exam.placerOrderNumber}"
                            data-filler-order="${exam.fillerOrderNumber}"
                            data-patient-name="${patientName}"
                            data-patient-id="${exam.patientId}"
                            data-procedure="${procedure}">
                        <i class="bi bi-check-circle"></i>
                        Selecionar
                    </button>
                </td>
            </tr>
        `;
        tbody.append(row);
    });
    
    // Setup click handlers for select buttons
    $('.select-exam-btn').on('click', function() {
        // Clear previous selection
        $('.select-exam-btn').removeClass('btn-success').addClass('btn-primary')
            .html('<i class="bi bi-check-circle"></i> Selecionar');
        
        // Mark this button as selected
        $(this).removeClass('btn-primary').addClass('btn-success')
            .html('<i class="bi bi-check-circle-fill"></i> Selecionado');
        
        // Store selected exam data
        window.selectedExam = {
            placerOrder: $(this).data('placer-order'),
            fillerOrder: $(this).data('filler-order'),
            patientName: $(this).data('patient-name'),
            procedure: $(this).data('procedure'),
            patientId: $(this).data('patient-id') // Add patientId
        };

        console.log('Exam selected:', window.selectedExam);
        console.log('Selected exam data types:', {
            placerOrder: typeof window.selectedExam.placerOrder,
            fillerOrder: typeof window.selectedExam.fillerOrder,
            patientName: typeof window.selectedExam.patientName,
            procedure: typeof window.selectedExam.procedure
        });
        
        // Enable confirm button
        enableExamSelectionConfirm();
    });
}

/**
 * Setup exam search functionality
 */
function setupExamSearch() {
    $('#examSearch').on('input', function() {
        const searchTerm = $(this).val().toLowerCase();
        
        $('#examSelectionTable tbody tr').each(function() {
            const row = $(this);
            const text = row.text().toLowerCase();
            
            if (text.includes(searchTerm)) {
                row.show();
            } else {
                row.hide();
            }
        });
    });
}

/**
 * Enable exam selection confirm button
 */
function enableExamSelectionConfirm() {
    const confirmBtn = $('#confirmExamSelectionBtn');
    if (confirmBtn.length) {
        confirmBtn.prop('disabled', false);
    }
}

/**
 * Show manual match confirmation modal
 */
function showManualMatchConfirmation(placerOrder, fillerOrder, patientName, procedure) {
    console.log('showManualMatchConfirmation called with:', {
        placerOrder, fillerOrder, patientName, procedure
    });

    const selectedDocs = window.selectedDocumentIds || new Set();
    const documentIds = Array.from(selectedDocs);
    
    const confirmationHtml = `
        <div class="modal fade" id="manualMatchConfirmationModal" tabindex="-1" aria-labelledby="manualMatchConfirmationModalLabel" aria-hidden="true">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-warning">
                        <h5 class="modal-title" id="manualMatchConfirmationModalLabel">
                            <i class="bi bi-exclamation-triangle"></i>
                            Confirmar Vinculação Manual
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-warning">
                            <strong>ATENÇÃO:</strong> Você está realizando uma vinculação manual.
                            Verifique cuidadosamente se os dados estão corretos.
                        </div>
                        
                        <div class="row">
                            <div class="col-md-6">
                                <h6>Arquivos Selecionados:</h6>
                                <ul class="list-group list-group-flush">
                                    <li class="list-group-item d-flex justify-content-between align-items-center">
                                        Total de arquivos
                                        <span class="badge bg-primary rounded-pill">${documentIds.length}</span>
                                    </li>
                                </ul>
                            </div>
                            <div class="col-md-6">
                                <h6>Exame Selecionado:</h6>
                                <ul class="list-group list-group-flush">
                                    <li class="list-group-item"><strong>Paciente:</strong> ${patientName || '-'}</li>
                                    <li class="list-group-item"><strong>CPF:</strong> ${formatCPF(window.selectedExam?.patientId) || '-'}</li>
                                    <li class="list-group-item"><strong>Procedimento:</strong> ${procedure || '-'}</li>
                                    <li class="list-group-item"><strong>Nr. Prescrição:</strong> ${placerOrder}</li>
                                    <li class="list-group-item"><strong>Nr. Seq.:</strong> ${fillerOrder}</li>
                                </ul>
                            </div>
                        </div>
                        
                        <div class="mt-3">
                            <label for="matchComment" class="form-label">Comentário/Justificativa (opcional):</label>
                            <textarea class="form-control" id="matchComment" rows="3" placeholder="Descreva o motivo da vinculação manual..."></textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-primary" id="confirmManualMatchBtn">
                            <i class="bi bi-check-circle"></i>
                            Confirmar Vinculação
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing confirmation modal
    $('#manualMatchConfirmationModal').remove();

    // Add modal to body
    $('body').append(confirmationHtml);

    // Hide exam selection modal using Bootstrap 5 API
    if (examSelectionModalInstance) {
        examSelectionModalInstance.hide();
    }

    // Show confirmation modal using Bootstrap 5 API
    manualMatchConfirmationModalInstance = new bootstrap.Modal(document.getElementById('manualMatchConfirmationModal'));
    manualMatchConfirmationModalInstance.show();
    
    // Setup confirm button
    $('#confirmManualMatchBtn').on('click', function() {
        executeManualMatch(placerOrder, fillerOrder);
    });
}

/**
 * Execute manual match
 */
function executeManualMatch(placerOrder, fillerOrder) {
    const selectedDocs = window.selectedDocumentIds || new Set();
    const documentIds = Array.from(selectedDocs);
    const comment = $('#matchComment').val();
    const configId = $('#examFilter').val();
    
    const request = {
        documentIds: documentIds,
        placerOrderNumber: placerOrder,
        fillerOrderNumber: fillerOrder,
        configId: parseInt(configId),
        userComment: comment
    };
    
    console.log('Executing manual match:', request);
    
    // Show loading state
    $('#confirmManualMatchBtn').prop('disabled', true).html('<span class="spinner-border spinner-border-sm" role="status"></span> Processando...');
    
    fetch('/api/imager/exam-documents/manual-match', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
    })
    .then(response => response.json())
    .then(result => {
        console.log('Manual match result:', result);
        
        if (result.success) {
            showNotification('Vinculação realizada com sucesso!', 'success');
            if (manualMatchConfirmationModalInstance) {
                manualMatchConfirmationModalInstance.hide();
            }

            // Clear selections
            clearManualMatchingSelections();
            
            // Refresh table
            if (imagerWorklistTable) {
                imagerWorklistTable.ajax.reload();
            }
        } else {
            showNotification('Erro na vinculação: ' + (result.message || 'Erro desconhecido'), 'error');
        }
    })
    .catch(error => {
        console.error('Error executing manual match:', error);
        showNotification('Erro ao processar vinculação: ' + error.message, 'error');
    })
    .finally(() => {
        // Reset button state
        $('#confirmManualMatchBtn').prop('disabled', false).html('<i class="bi bi-check-circle"></i> Confirmar Vinculação');
    });
}

/**
 * Format CPF for display
 */
function formatCPF(cpf) {
    if (!cpf) return '';
    
    // Convert to string if it's not already
    const cpfStr = String(cpf);
    
    // Remove any non-digit characters
    const digitsOnly = cpfStr.replace(/\D/g, '');
    
    // Check if it has 11 digits
    if (digitsOnly.length !== 11) {
        return cpfStr; // Return original if not a valid CPF length
    }
    
    // Format as XXX.XXX.XXX-XX
    return digitsOnly.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/**
 * Format date time for display
 */
function formatDateTime(dateTime) {
    if (!dateTime) return '';
    
    try {
        const date = new Date(dateTime);
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            return String(dateTime); // Return original if invalid date
        }
        
        return date.toLocaleString('pt-BR');
    } catch (error) {
        console.warn('Error formatting date:', dateTime, error);
        return String(dateTime); // Return original on error
    }
}

/**
 * Format date to short format (dd/MM/yyyy)
 */
function formatDateShort(dateTime) {
    if (!dateTime) return '';
    
    try {
        const date = new Date(dateTime);
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            return String(dateTime); // Return original if invalid date
        }
        
        // Format to dd/MM/yyyy
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        
        return `${day}/${month}/${year}`;
    } catch (error) {
        console.warn('Error formatting date:', dateTime, error);
        return String(dateTime); // Return original on error
    }
}

/**
 * Clear manual matching selections
 * Note: This function is now defined in imager-files.js
 * Keeping a reference here for clarity
 */
// function clearManualMatchingSelections() - moved to imager-files.js

window.initImagerDashboard = initImagerDashboard;
window.cleanupImagerDashboard = cleanupImagerDashboard;
window.viewImagerDetails = viewImagerDetails;
window.processImagerItem = processImagerItem;
window.cancelImagerItem = cancelImagerItem;
window.openPdfFile = openPdfFile;
window.openProcessingQueuePdfFile = openProcessingQueuePdfFile;
window.openFinalProcessedFile = openFinalProcessedFile;
window.openFinalConsolidatedFile = openFinalConsolidatedFile;
window.showDeleteItemModal = showDeleteItemModal;
window.confirmDeleteItem = confirmDeleteItem;
window.deleteQueueItem = deleteQueueItem;
// Step 3 specific functions
window.step3_deletePatientGroup = step3_deletePatientGroup;
window.step3_retryStep4 = step3_retryStep4;
window.step3_toggleTreeNode = step3_toggleTreeNode;
window.step3_approvePatientGroup = step3_approvePatientGroup;
window.step3_clearExclusions = step3_clearExclusions;

// Legacy functions for compatibility
window.deletePatientGroup = deletePatientGroup;
// toggleTreeNode - use step3_toggleTreeNode or step4_toggleTreeNode instead
window.toggleTreeNode = function(groupKey) {
    // Default to step3 if step is not clear from context
    if (typeof step3_toggleTreeNode === 'function') {
        return step3_toggleTreeNode(groupKey);
    } else if (typeof step4_toggleTreeNode === 'function') {
        return step4_toggleTreeNode(groupKey);
    } else {
        console.warn('toggleTreeNode: No step-specific toggle function available');
    }
};
window.approvePatientGroup = approvePatientGroup;
window.viewCompletedExamDetails = viewCompletedExamDetails;
window.viewMatchQueryConditions = viewMatchQueryConditions;
// openApprovalReviewModal is now in imager-approval-review.js
// Note: showNotification is used internally, but if any inline script might call it, expose it too.
// window.showNotification = showNotification;

// If initImagerDashboard is meant to be called automatically when the script loads
// and the imager content is already on the page (not dynamically loaded),
// you might call it here. Otherwise, dashboard.js handles calling it after loading the fragment.
// $(document).ready(function() {
//     if ($('#imagerWorklistTable').length > 0) { // Check if imager content is present
//         initImagerDashboard();
//     }
// });
