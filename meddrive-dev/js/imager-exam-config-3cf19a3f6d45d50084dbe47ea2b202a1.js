// ================================================================================
// IMAGER EXAM CONFIGURATION MANAGEMENT
// ================================================================================
// This file handles exam configuration management including CRUD operations,
// DataTable initialization, and event handlers

// ================================================================================
// STATE VARIABLES
// ================================================================================

let imagerConfigTable;
let currentEditingConfigId = null;
let isImagerConfigInitialized = false;

// ================================================================================
// INITIALIZATION FUNCTIONS
// ================================================================================

/**
 * Reset function to clean up when switching pages
 */
function resetImagerConfig() {
    console.log('Resetting imager config...');
    isImagerConfigInitialized = false;
    currentEditingConfigId = null;

    // Destroy exam config table
    if (imagerConfigTable) {
        try {
            imagerConfigTable.destroy();
        } catch (e) {
            console.warn('Error destroying imagerConfigTable during reset:', e);
        }
        imagerConfigTable = null;
    }

    // Also destroy file repo table if it exists
    if (typeof window.fileRepoTable !== 'undefined' && window.fileRepoTable) {
        try {
            // Check if it's a DataTable instance before destroying
            if (typeof window.fileRepoTable.destroy === 'function') {
                window.fileRepoTable.destroy();
            } else if ($.fn.DataTable && $.fn.DataTable.isDataTable('#fileRepoTable')) {
                $('#fileRepoTable').DataTable().destroy();
            }
        } catch (e) {
            console.warn('Error destroying fileRepoTable during reset:', e);
        }
        window.fileRepoTable = null;
        fileRepoTable = null;
    }

    // Reset OCR Masks module
    if (typeof window.resetOcrMasks === 'function') {
        window.resetOcrMasks();
    }
}

/**
 * Initialize when the imager config page is loaded
 */
function initializeImagerConfig() {
    // Check if DOM elements are available before proceeding
    if (!document.getElementById('imagerConfigTable')) {
        console.log('DOM elements not ready, skipping initialization...');
        return;
    }

    // Prevent multiple initializations on the same DOM
    if (isImagerConfigInitialized && imagerConfigTable) {
        console.log('Imager config already initialized and table exists, skipping...');
        return;
    }

    console.log('=== STARTING IMAGER CONFIG INITIALIZATION ===');
    console.log('Current DOM state - addImagerConfigBtn exists:', document.getElementById('addImagerConfigBtn'));
    console.log('Current DOM state - addImagerConfigModal exists:', document.getElementById('addImagerConfigModal'));

    // Add a delay to ensure all modal elements are loaded
    setTimeout(() => {
        // Initialize event handlers first
        console.log('1. Initializing event handlers...');
        initializeExamConfigHandlers();
        initializeRepositoryHandlers();

        // Initialize DataTable
        console.log('2. Initializing DataTable...');
        initializeImagerConfigTable();

        // Load initial data with a slight delay to ensure table is ready
        console.log('3. Loading initial data...');
        setTimeout(() => {
            loadImagerConfigurations();
            loadImagerConfigStats();
            loadExamGroupsForSelect();
            loadDestinationOptions();
            // Also load file repositories data to prevent empty table when switching tabs
            if (typeof loadFileRepositories === 'function') {
                loadFileRepositories();
            }
        }, 100);

        // Test modal availability
        console.log('4. Testing modal elements:');
        console.log('addImagerConfigModal:', document.getElementById('addImagerConfigModal'));
        console.log('addRepositoryModal:', document.getElementById('addRepositoryModal'));
        console.log('manageExamReposModal:', document.getElementById('manageExamReposModal'));
        console.log('Bootstrap available:', window.bootstrap);
        console.log('jQuery available:', window.jQuery);

        // Initialize OCR Masks module if available
        if (typeof initializeOcrMasks === 'function') {
            console.log('5. Initializing OCR Masks module...');
            initializeOcrMasks();
        } else {
            console.warn('initializeOcrMasks function not found');
        }

        isImagerConfigInitialized = true;
        console.log('=== IMAGER CONFIG INITIALIZATION COMPLETE ===');
    }, 200); // Increased delay to ensure DOM is fully ready
}

// ================================================================================
// DATATABLE INITIALIZATION
// ================================================================================

/**
 * Initialize DataTable for exam configurations
 * USES: Meddrive DataTables Componentization System
 */
function initializeImagerConfigTable() {
    console.log('Initializing DataTable with componentization system...');

    // Use standard configuration with custom dom for external toolbar
    const config = window.MeddriveDataTables.configs.standard({
        data: [],  // Will be populated later by loadImagerConfigurations
        dom: 'rt<"bottom"ip><"clear">',  // Remove default search and length controls (using custom toolbar)
        scrollY: false,  // Disable vertical scroll - table is short enough
        scrollX: false,  // Disable horizontal scroll - columns fit well
        columns: [
            {
                data: 'id',
                title: 'ID',
                width: '5%',
                className: 'text-center'
            },
            {
                data: 'dsProcesso',
                title: 'Processo',
                width: '18%'
            },
            {
                data: 'exameCode',
                title: 'Código do Exame',
                width: '14%'
            },
            {
                data: 'exameName',
                title: 'Nome do Exame',
                width: '18%'
            },
            {
                data: 'examGroupName',
                title: 'Grupo',
                width: '12%',
                render: function(d) {
                    return d ? $('<div>').text(d).html() : '<span class="text-muted">—</span>';
                }
            },
            {
                data: 'destinationType',
                title: 'Destino',
                width: '8%',
                className: 'text-center',
                render: function(data) {
                    if (data === 'REPORT') {
                        return '<span class="badge bg-primary">Laudo</span>';
                    }
                    return '<span class="badge bg-secondary">Imagem</span>';
                }
            },
            {
                data: 'enabled',
                title: 'Status',
                width: '10%',
                className: 'text-center',
                render: window.MeddriveRenderers.status
            },
            {
                data: null,
                title: 'Ações',
                width: '15%',
                orderable: false,
                className: 'text-center',
                render: function(data, type, row) {
                    if (type !== 'display') return '';

                    const dsProcessoEscaped = (row.dsProcesso || '').replace(/'/g, "\\'");

                    return `
                        <button class="btn-icon-only" onclick="manageExamRepositories(${row.id}, '${dsProcessoEscaped}')" title="Gerenciar Repositórios">
                            <i class="fas fa-folder-tree"></i>
                        </button>
                        <button class="btn-icon-only" onclick="editConfig(${row.id})" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon-only" onclick="toggleConfig(${row.id})" title="${row.enabled ? 'Desativar' : 'Ativar'}">
                            <i class="fas fa-${row.enabled ? 'pause' : 'play'}"></i>
                        </button>
                        <button class="btn-icon-only" onclick="deleteConfig(${row.id}, '${dsProcessoEscaped}')" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    `;
                }
            }
        ]
    });

    // Initialize using helper
    imagerConfigTable = window.MeddriveDataTables.init('#imagerConfigTable', config);

    if (imagerConfigTable) {
        console.log('DataTable initialized successfully with componentization');
    } else {
        console.error('Failed to initialize DataTable');
    }
}

// ================================================================================
// EVENT HANDLERS
// ================================================================================

/**
 * Initialize event handlers for exam configurations
 */
function initializeExamConfigHandlers() {
    console.log('Initializing exam config event handlers...');

    // Toolbar event handlers
    // Items per page selector
    $('#imagerConfigItemsPerPageSelect').off('change').on('change', function() {
        const pageLength = parseInt($(this).val());
        if (imagerConfigTable) {
            imagerConfigTable.page.len(pageLength).draw();
        }
    });

    // Search input
    $('#imagerConfigSearchInput').off('input').on('input', function() {
        const searchValue = $(this).val();
        if (imagerConfigTable) {
            imagerConfigTable.search(searchValue).draw();
        }
        // Show/hide clear button
        $('#imagerConfigClearSearchBtn').toggle(searchValue.length > 0);
    });

    // Clear search button
    $('#imagerConfigClearSearchBtn').off('click').on('click', function() {
        $('#imagerConfigSearchInput').val('');
        if (imagerConfigTable) {
            imagerConfigTable.search('').draw();
        }
        $(this).hide();
    });

    // Add configuration button
    $('#addImagerConfigBtn').off('click').on('click', function() {
        console.log('Add config button clicked!');
        console.log('showModal function exists:', typeof showModal);
        console.log('Modal element exists:', document.getElementById('addImagerConfigModal'));
        showModal('addImagerConfigModal');
    });

    // Add configuration form
    $('#addImagerConfigForm').off('submit').on('submit', function(e) {
        e.preventDefault();
        addConfiguration();
    });

    // Edit configuration form
    $('#editImagerConfigForm').off('submit').on('submit', function(e) {
        e.preventDefault();
        updateConfiguration();
    });

    // Delete confirmation
    $('#confirmDeleteImagerConfigBtn').on('click', function() {
        confirmDeleteConfiguration();
    });

    // OFT Attachment toggle (Add modal)
    $(document).on('change', '#oftAttachmentEnabled', function() {
        if ($(this).is(':checked')) {
            $('#oftAttachmentFields').show();
        } else {
            $('#oftAttachmentFields').hide();
        }
    });

    // OFT Attachment toggle (Edit modal)
    $(document).on('change', '#editOftAttachmentEnabled', function() {
        if ($(this).is(':checked')) {
            $('#editOftAttachmentFields').show();
        } else {
            $('#editOftAttachmentFields').hide();
        }
    });

    // Reload destination options when Add/Edit modals are shown (ensures fresh list)
    $(document).on('shown.bs.modal', '#addImagerConfigModal, #editImagerConfigModal', loadDestinationOptions);

    // Initialize tooltips
    $('[data-bs-toggle="tooltip"]').tooltip();

    // Initialize modals manually to avoid Bootstrap issues
    try {
        // Only initialize if Bootstrap and modals exist
        if (window.bootstrap && window.bootstrap.Modal) {
            const addModal = document.getElementById('addImagerConfigModal');
            const editModal = document.getElementById('editImagerConfigModal');
            const deleteModal = document.getElementById('deleteImagerConfigModal');

            if (addModal && !addModal._modal) {
                addModal._modal = new bootstrap.Modal(addModal, {
                    backdrop: true,
                    keyboard: true,
                    focus: true
                });
            }

            if (editModal && !editModal._modal) {
                editModal._modal = new bootstrap.Modal(editModal, {
                    backdrop: true,
                    keyboard: true,
                    focus: true
                });
            }

            if (deleteModal && !deleteModal._modal) {
                deleteModal._modal = new bootstrap.Modal(deleteModal, {
                    backdrop: true,
                    keyboard: true,
                    focus: true
                });
            }
        }
    } catch (error) {
        console.warn('Bootstrap modal initialization warning:', error);
    }
}

// ================================================================================
// DATA LOADING FUNCTIONS
// ================================================================================

/**
 * Load configurations data
 */
function loadImagerConfigurations() {
    console.log('Loading imager configurations...');

    // Check if table is initialized before loading data
    if (!imagerConfigTable) {
        console.warn('DataTable not initialized, retrying in 500ms...');
        setTimeout(() => {
            if (imagerConfigTable) {
                loadImagerConfigurations();
            } else {
                console.error('DataTable still not initialized after retry');
                showAlert('Erro: Tabela não foi inicializada corretamente', 'danger');
            }
        }, 500);
        return;
    }

    fetch('/api/imager/config')
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            console.log('Loaded configurations:', data);
            populateConfigurationsTable(data);
        })
        .catch(error => {
            console.error('Error loading configurations:', error);
            showAlert('Erro ao carregar configurações: ' + error.message, 'danger');
        });
}

/**
 * Populate DataTable with configurations
 * @param {Array} configurations - Array of configuration objects
 */
function populateConfigurationsTable(configurations) {
    if (!imagerConfigTable) {
        console.error('imagerConfigTable is not initialized');
        return;
    }

    console.log('Populating table with', configurations.length, 'configurations');

    try {
        // Clear and reload with object-based data (componentization approach)
        imagerConfigTable.clear();
        imagerConfigTable.rows.add(configurations);
        imagerConfigTable.draw();

        console.log('Table populated successfully');
    } catch (error) {
        console.error('Error populating table:', error);
    }

    // Reinitialize tooltips after table redraw
    setTimeout(() => {
        $('[data-bs-toggle="tooltip"]').tooltip();
    }, 100);
}

/**
 * Load configuration statistics
 */
function loadImagerConfigStats() {
    fetch('/api/imager/config/stats')
        .then(response => response.json())
        .then(data => {
            $('#totalConfigs').text(data.totalConfigs || 0);
            $('#activeConfigs').text(data.activeConfigs || 0);
            $('#inactiveConfigs').text((data.totalConfigs - data.activeConfigs) || 0);

            // Format date more compactly: DD/MM HH:MM
            const now = new Date();
            const day = String(now.getDate()).padStart(2, '0');
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            $('#lastUpdate').text(`${day}/${month} ${hours}:${minutes}`);
        })
        .catch(error => {
            console.error('Error loading stats:', error);
        });
}

// ================================================================================
// EXAM GROUPS HELPER
// ================================================================================

/**
 * Load HIS destinations from API and populate the destination selects in Add/Edit modals
 * @returns {Promise}
 */
function loadDestinationOptions() {
    return $.get('/api/imager/his-destinations?enabledOnly=true').then(function(destinations) {
        let html = '<option value="">Selecione um destino...</option>';
        destinations.forEach(function(d) {
            html += '<option value="' + d.id + '">' + $('<div>').text(d.name).html() + '</option>';
        });
        // Preserva a seleção atual de cada select — caso contrário o re-render
        // (ex.: shown.bs.modal logo após editConfig setar val()) zera o dropdown.
        const selectors = ['#destinationId', '#editDestinationId', '#oftDestinationId', '#editOftDestinationId'];
        selectors.forEach(function(sel) {
            const $el = $(sel);
            const prev = $el.val();
            $el.html(html);
            if (prev) {
                $el.val(prev);
            }
        });
    }).catch(function(error) {
        console.warn('Could not load HIS destinations for selects:', error);
    });
}

/**
 * Load exam groups from API and populate the group selects in Add/Edit modals
 * @returns {Promise}
 */
function loadExamGroupsForSelect() {
    return fetch('/api/imager/exam-groups')
        .then(r => r.json())
        .then(groups => {
            const opts = ['<option value="">— Sem grupo —</option>']
                .concat(groups.map(g => `<option value="${g.id}">${$('<div>').text(g.name).html()}</option>`));
            $('#examGroupIdField, #editExamGroupIdField').html(opts.join(''));
        })
        .catch(error => {
            console.warn('Could not load exam groups for selects:', error);
        });
}

// ================================================================================
// CRUD OPERATIONS
// ================================================================================

/**
 * Add new configuration
 */
function addConfiguration() {
    // Disable ALL buttons in the form to prevent double-submission
    const form = document.getElementById('addImagerConfigForm');
    const allButtons = form.querySelectorAll('button');
    const submitBtn = form.querySelector('button[type="submit"]');

    // Store original state
    const buttonStates = new Map();
    allButtons.forEach(btn => {
        buttonStates.set(btn, {
            disabled: btn.disabled,
            html: btn.innerHTML
        });
        btn.disabled = true;
    });

    // Update submit button with spinner
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    }

    const formData = new FormData(document.getElementById('addImagerConfigForm'));
    const configData = {
        dsProcesso: formData.get('dsProcesso'),
        exameCode: formData.get('exameCode'),
        exameName: formData.get('exameName'),
        enabled: formData.get('enabled') === 'on',
        ieStatusExecucao: formData.get('ieStatusExecucao') || null,
        nrSeqSituacaoProc: formData.get('nrSeqSituacaoProc') || null,
        matchCriteria1: formData.get('matchCriteria1') || null,
        matchCriteria2: formData.get('matchCriteria2') || null,
        matchCriteria3: formData.get('matchCriteria3') || null,
        matchCriteria4: formData.get('matchCriteria4') || null,
        matchPrefix1: formData.get('matchPrefix1') || null,
        matchPrefix2: formData.get('matchPrefix2') || null,
        matchPrefix3: formData.get('matchPrefix3') || null,
        matchPrefix4: formData.get('matchPrefix4') || null,
        matchSuffix1: formData.get('matchSuffix1') || null,
        matchSuffix2: formData.get('matchSuffix2') || null,
        matchSuffix3: formData.get('matchSuffix3') || null,
        matchSuffix4: formData.get('matchSuffix4') || null,
        matchWildcard: formData.get('matchWildcard') || null,
        matchWildcard2: formData.get('matchWildcard2') || null,
        matchWildcard3: formData.get('matchWildcard3') || null,
        matchWildcardRelation: formData.get('matchWildcardRelation') || 'AND',
        filenameWildcard: formData.get('filenameWildcard') || null,
        matchFilename: formData.get('matchFilename') || null,
        excludeText: formData.get('excludeText') || null,
        dateFormatPattern: formData.get('dateFormatPattern') || 'dd/MM/yyyy',
        processingFrequencySeconds: parseInt(formData.get('processingFrequencySeconds')) || 60,
        initialDelaySeconds: parseInt(formData.get('initialDelaySeconds')) || 0,
        expectedFileCount: parseInt(formData.get('expectedFileCount')) || 1,
        autoApprovalDelayMinutes: parseInt(formData.get('autoApprovalDelayMinutes')) || 0,
        step4Enabled: formData.get('step4Enabled') === 'on',
        archiveEnabled: formData.get('archiveEnabled') === 'on',
        oracleProcedureEnabled: formData.get('oracleProcedureEnabled') === 'on',
        destinationType: formData.get('destinationType') || 'IMAGE',
        dicomIntegrationEnabled: formData.get('dicomIntegrationEnabled') === 'on',
        autoApprovalEnabled: formData.get('autoApprovalEnabled') === 'on',
        destinationId: $('#destinationId').val() ? parseInt($('#destinationId').val(), 10) : null,
        oftAttachmentEnabled: formData.get('oftAttachmentEnabled') === 'on',
        oftDestinationId: $('#oftDestinationId').val() ? parseInt($('#oftDestinationId').val(), 10) : null,
        allowExtraFiles: formData.get('allowExtraFiles') === 'on',
        allowMatchOlderFiles: formData.get('allowMatchOlderFiles') === 'on',
        manualMatchingEnabled: formData.get('manualMatchingEnabled') === 'on',
        // Build allowed PDF types string from checkboxes
        allowedPdfTypes: (function() {
            let types = [];
            if (formData.get('allowTextPdf') === 'on') types.push('TEXT');
            if (formData.get('allowImagePdf') === 'on') types.push('IMAGE');
            if (formData.get('allowMixedPdf') === 'on') types.push('MIXED');
            return types.join(',') || 'TEXT,IMAGE,MIXED'; // Default to all if none selected
        })(),
        // Pre-processing tool fields
        preprocessingEnabled: formData.get('preprocessingEnabled') === 'on',
        preprocessingJarPath: formData.get('preprocessingJarPath') || null,
        preprocessingJavaPath: formData.get('preprocessingJavaPath') || 'java',
        preprocessingWorkingDir: formData.get('preprocessingWorkingDir') || null,
        preprocessingArguments: formData.get('preprocessingArguments') || null,
        preprocessingTimeoutMinutes: parseInt(formData.get('preprocessingTimeoutMinutes')) || 10,
        preprocessingWaitForCompletion: formData.get('preprocessingWaitForCompletion') === 'on',
        preprocessingLogLevel: formData.get('preprocessingLogLevel') || 'INFO'
        // NOTE: Auto-archive migrated to File Repository level
    };

    // Validacao Anexo OFT
    if (formData.get('oftAttachmentEnabled') === 'on') {
        const oftDest = $('#oftDestinationId').val();
        if (!oftDest) {
            allButtons.forEach(btn => {
                const originalState = buttonStates.get(btn);
                if (originalState) {
                    btn.disabled = originalState.disabled;
                    btn.innerHTML = originalState.html;
                }
            });
            showAlert('Destino HIS para OFT é obrigatório quando Anexo de Oftalmologia está habilitado.', 'danger');
            return;
        }
    }

        configData.examGroupId = $('#examGroupIdField').val() ? parseInt($('#examGroupIdField').val(), 10) : null;

    console.log('Adding configuration:', configData);

    fetch('/api/imager/config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(configData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showAlert('Configuração adicionada com sucesso!', 'success');
            hideModal('addImagerConfigModal');
            document.getElementById('addImagerConfigForm').reset();
            loadImagerConfigurations();
            loadImagerConfigStats();
        } else {
            showAlert('Erro ao adicionar configuração: ' + data.message, 'danger');
        }
    })
    .catch(error => {
        console.error('Error adding configuration:', error);
        showAlert('Erro ao adicionar configuração: ' + error.message, 'danger');
    })
    .finally(() => {
        // Re-enable all buttons and restore original state
        allButtons.forEach(btn => {
            const originalState = buttonStates.get(btn);
            if (originalState) {
                btn.disabled = originalState.disabled;
                btn.innerHTML = originalState.html;
            }
        });
    });
}

/**
 * Edit configuration
 * @param {number} configId - The configuration ID to edit
 */
function editConfig(configId) {
    console.log('Editing configuration:', configId);
    currentEditingConfigId = configId;

    // Garante que os dropdowns de Destino HIS estejam populados ANTES de chamar
    // .val(config.destinationId) — senão o val() vira no-op (option ainda não existe).
    Promise.all([
        loadDestinationOptions(),
        fetch(`/api/imager/config/${configId}`).then(response => {
            if (!response.ok) {
                throw new Error('Configuration not found');
            }
            return response.json();
        })
    ])
        .then(([_, config]) => {
            console.log('Full config object received:', config);
            // Populate edit form - basic fields
            $('#editConfigId').val(config.id);
            $('#editDsProcesso').val(config.dsProcesso);
            $('#editExameCode').val(config.exameCode);
            $('#editIeStatusExecucao').val(config.ieStatusExecucao);
            $('#editNrSeqSituacaoProc').val(config.nrSeqSituacaoProc);
            $('#editExameName').val(config.exameName);
            $('#editEnabled').prop('checked', config.enabled);

            // Populate matching criteria fields
            $('#editMatchCriteria1').val(config.matchCriteria1 || '');
            $('#editMatchCriteria2').val(config.matchCriteria2 || '');
            $('#editMatchCriteria3').val(config.matchCriteria3 || '');
            $('#editMatchCriteria4').val(config.matchCriteria4 || '');

            // Populate prefix fields
            $('#editMatchPrefix1').val(config.matchPrefix1 || '');
            $('#editMatchPrefix2').val(config.matchPrefix2 || '');
            $('#editMatchPrefix3').val(config.matchPrefix3 || '');
            $('#editMatchPrefix4').val(config.matchPrefix4 || '');

            // Populate suffix fields
            $('#editMatchSuffix1').val(config.matchSuffix1 || '');
            $('#editMatchSuffix2').val(config.matchSuffix2 || '');
            $('#editMatchSuffix3').val(config.matchSuffix3 || '');
            $('#editMatchSuffix4').val(config.matchSuffix4 || '');

            $('#editMatchWildcard').val(config.matchWildcard || '');
            $('#editMatchWildcard2').val(config.matchWildcard2 || '');
            $('#editMatchWildcard3').val(config.matchWildcard3 || '');
            $('#editMatchWildcardRelation').val(config.matchWildcardRelation === 'OR' ? 'OR' : 'AND');
            $('#editFilenameWildcard').val(config.filenameWildcard || '');
            $('#editMatchFilename').val(config.matchFilename || '');
            $('#editExcludeText').val(config.excludeText || '');
            $('#editDateFormatPattern').val(config.dateFormatPattern || 'dd/MM/yyyy');
              // Populate processing control fields
            $('#editProcessingFrequencySeconds').val(config.processingFrequencySeconds !== null && config.processingFrequencySeconds !== undefined ? config.processingFrequencySeconds : '');
            $('#editInitialDelaySeconds').val(config.initialDelaySeconds !== null && config.initialDelaySeconds !== undefined ? config.initialDelaySeconds : '');
            $('#editExpectedFileCount').val(config.expectedFileCount || 1);

            // Populate Step 4 fields
            $('#editStep4Enabled').prop('checked', config.step4Enabled !== false);
            $('#editArchiveEnabled').prop('checked', config.archiveEnabled !== false);
            $('#editOracleProcedureEnabled').prop('checked', config.oracleProcedureEnabled !== false);
            $('#editDestinationType').val(config.destinationType || 'IMAGE');
            $('#editDicomIntegrationEnabled').prop('checked', config.dicomIntegrationEnabled === true);
            $('#editAutoApprovalEnabled').prop('checked', config.autoApprovalEnabled === true);

            // Populate Destino HIS
            $('#editDestinationId').val(config.destinationId || '');

            // Populate OFT attachment fields
            $('#editOftAttachmentEnabled').prop('checked', config.oftAttachmentEnabled === true);
            $('#editOftDestinationId').val(config.oftDestinationId || '');
            // Show/hide OFT fields based on checkbox state
            if (config.oftAttachmentEnabled === true) {
                $('#editOftAttachmentFields').show();
            } else {
                $('#editOftAttachmentFields').hide();
            }

            $('#editAllowExtraFiles').prop('checked', config.allowExtraFiles === true);
            $('#editAllowMatchOlderFiles').prop('checked', config.allowMatchOlderFiles === true);
            $('#editManualMatchingEnabled').prop('checked', config.manualMatchingEnabled === true);

            // Populate allowed PDF types checkboxes
            let allowedTypes = (config.allowedPdfTypes || 'TEXT,IMAGE,MIXED').split(',');
            $('#editAllowTextPdf').prop('checked', allowedTypes.includes('TEXT'));
            $('#editAllowImagePdf').prop('checked', allowedTypes.includes('IMAGE'));
            $('#editAllowMixedPdf').prop('checked', allowedTypes.includes('MIXED'));

            // NOTE: Auto-archive migrated to File Repository level

            // Populate auto-approval delay field
            $('#editAutoApprovalDelayMinutes').val(config.autoApprovalDelayMinutes || 0);

            // Populate pre-processing tool fields
            $('#editPreprocessingEnabled').prop('checked', config.preprocessingEnabled === true);
            $('#editPreprocessingJarPath').val(config.preprocessingJarPath || '');
            $('#editPreprocessingJavaPath').val(config.preprocessingJavaPath || 'java');
            $('#editPreprocessingWorkingDir').val(config.preprocessingWorkingDir || '');
            $('#editPreprocessingArguments').val(config.preprocessingArguments || '');
            $('#editPreprocessingTimeoutMinutes').val(config.preprocessingTimeoutMinutes || 10);
            $('#editPreprocessingWaitForCompletion').prop('checked', config.preprocessingWaitForCompletion !== false);
            $('#editPreprocessingLogLevel').val(config.preprocessingLogLevel || 'INFO');

            // Pre-select exam group
            $('#editExamGroupIdField').val(config.examGroupId || '');

            // Show modal
            showModal('editImagerConfigModal');
        })
        .catch(error => {
            console.error('Error loading configuration for edit:', error);
            showAlert('Erro ao carregar configuração: ' + error.message, 'danger');
        });
}

/**
 * Update configuration
 */
function updateConfiguration() {
    // Disable ALL buttons in the form to prevent double-submission
    const form = document.getElementById('editImagerConfigForm');
    const allButtons = form.querySelectorAll('button');
    const submitBtn = form.querySelector('button[type="submit"]');

    // Store original state
    const buttonStates = new Map();
    allButtons.forEach(btn => {
        buttonStates.set(btn, {
            disabled: btn.disabled,
            html: btn.innerHTML
        });
        btn.disabled = true;
    });

    // Update submit button with spinner
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    }

    const formData = new FormData(document.getElementById('editImagerConfigForm'));

    const configData = {
        dsProcesso: formData.get('dsProcesso'),
        exameCode: formData.get('exameCode'),
        exameName: formData.get('exameName'),
        enabled: formData.get('enabled') === 'on',
        ieStatusExecucao: formData.get('ieStatusExecucao') || null,
        nrSeqSituacaoProc: formData.get('nrSeqSituacaoProc') || null,
        matchCriteria1: formData.get('matchCriteria1') || null,
        matchCriteria2: formData.get('matchCriteria2') || null,
        matchCriteria3: formData.get('matchCriteria3') || null,
        matchCriteria4: formData.get('matchCriteria4') || null,
        matchPrefix1: formData.get('matchPrefix1') || null,
        matchPrefix2: formData.get('matchPrefix2') || null,
        matchPrefix3: formData.get('matchPrefix3') || null,
        matchPrefix4: formData.get('matchPrefix4') || null,
        matchSuffix1: formData.get('matchSuffix1') || null,
        matchSuffix2: formData.get('matchSuffix2') || null,
        matchSuffix3: formData.get('matchSuffix3') || null,
        matchSuffix4: formData.get('matchSuffix4') || null,
        matchWildcard: formData.get('matchWildcard') || null,
        matchWildcard2: formData.get('matchWildcard2') || null,
        matchWildcard3: formData.get('matchWildcard3') || null,
        matchWildcardRelation: formData.get('matchWildcardRelation') || 'AND',
        filenameWildcard: formData.get('filenameWildcard') || null,
        matchFilename: formData.get('matchFilename') || null,
        excludeText: formData.get('excludeText') || null,
        dateFormatPattern: formData.get('dateFormatPattern') || 'dd/MM/yyyy',
        processingFrequencySeconds: parseInt(formData.get('processingFrequencySeconds')) || 60,
        initialDelaySeconds: parseInt(formData.get('initialDelaySeconds')) || 0,
        expectedFileCount: parseInt(formData.get('expectedFileCount')) || 1,
        autoApprovalDelayMinutes: parseInt(formData.get('autoApprovalDelayMinutes')) || 0,
        step4Enabled: formData.get('step4Enabled') === 'on',
        archiveEnabled: formData.get('archiveEnabled') === 'on',
        oracleProcedureEnabled: formData.get('oracleProcedureEnabled') === 'on',
        destinationType: formData.get('destinationType') || 'IMAGE',
        dicomIntegrationEnabled: formData.get('dicomIntegrationEnabled') === 'on',
        autoApprovalEnabled: formData.get('autoApprovalEnabled') === 'on',
        destinationId: $('#editDestinationId').val() ? parseInt($('#editDestinationId').val(), 10) : null,
        oftAttachmentEnabled: formData.get('oftAttachmentEnabled') === 'on',
        oftDestinationId: $('#editOftDestinationId').val() ? parseInt($('#editOftDestinationId').val(), 10) : null,
        allowExtraFiles: formData.get('allowExtraFiles') === 'on',
        allowMatchOlderFiles: formData.get('allowMatchOlderFiles') === 'on',
        manualMatchingEnabled: formData.get('manualMatchingEnabled') === 'on',
        // Build allowed PDF types string from checkboxes
        allowedPdfTypes: (function() {
            let types = [];
            if (formData.get('allowTextPdf') === 'on') types.push('TEXT');
            if (formData.get('allowImagePdf') === 'on') types.push('IMAGE');
            if (formData.get('allowMixedPdf') === 'on') types.push('MIXED');
            return types.join(',') || 'TEXT,IMAGE,MIXED'; // Default to all if none selected
        })(),
        // Pre-processing tool fields
        preprocessingEnabled: formData.get('preprocessingEnabled') === 'on',
        preprocessingJarPath: formData.get('preprocessingJarPath') || null,
        preprocessingJavaPath: formData.get('preprocessingJavaPath') || 'java',
        preprocessingWorkingDir: formData.get('preprocessingWorkingDir') || null,
        preprocessingArguments: formData.get('preprocessingArguments') || null,
        preprocessingTimeoutMinutes: parseInt(formData.get('preprocessingTimeoutMinutes')) || 10,
        preprocessingWaitForCompletion: formData.get('preprocessingWaitForCompletion') === 'on',
        preprocessingLogLevel: formData.get('preprocessingLogLevel') || 'INFO'
        // NOTE: Auto-archive migrated to File Repository level
    };

    // Validacao Anexo OFT
    if (formData.get('oftAttachmentEnabled') === 'on') {
        const oftDest = $('#editOftDestinationId').val();
        if (!oftDest) {
            allButtons.forEach(btn => {
                const originalState = buttonStates.get(btn);
                if (originalState) {
                    btn.disabled = originalState.disabled;
                    btn.innerHTML = originalState.html;
                }
            });
            showAlert('Destino HIS para OFT é obrigatório quando Anexo de Oftalmologia está habilitado.', 'danger');
            return;
        }
    }

    configData.examGroupId = $('#editExamGroupIdField').val() ? parseInt($('#editExamGroupIdField').val(), 10) : null;

    console.log('Updating configuration:', currentEditingConfigId, configData);

    fetch(`/api/imager/config/${currentEditingConfigId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(configData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showAlert('Configuração atualizada com sucesso!', 'success');
            hideModal('editImagerConfigModal');
            loadImagerConfigurations();
            loadImagerConfigStats();
        } else {
            showAlert('Erro ao atualizar configuração: ' + data.message, 'danger');
        }
    })
    .catch(error => {
        console.error('Error updating configuration:', error);
        showAlert('Erro ao atualizar configuração: ' + error.message, 'danger');
    })
    .finally(() => {
        // Re-enable all buttons and restore original state
        allButtons.forEach(btn => {
            const originalState = buttonStates.get(btn);
            if (originalState) {
                btn.disabled = originalState.disabled;
                btn.innerHTML = originalState.html;
            }
        });
    });
}

/**
 * Toggle configuration status
 * @param {number} configId - The configuration ID to toggle
 */
function toggleConfig(configId) {
    console.log('Toggling configuration:', configId);

    fetch(`/api/imager/config/${configId}/toggle`, {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showAlert('Status da configuração alterado com sucesso!', 'success');
            loadImagerConfigurations();
            loadImagerConfigStats();
        } else {
            showAlert('Erro ao alterar status: ' + data.message, 'danger');
        }
    })
    .catch(error => {
        console.error('Error toggling configuration:', error);
        showAlert('Erro ao alterar status: ' + error.message, 'danger');
    });
}

/**
 * Delete configuration
 * @param {number} configId - The configuration ID to delete
 * @param {string} configName - The configuration name for confirmation
 */
function deleteConfig(configId, configName) {
    console.log('Preparing to delete configuration:', configId, configName);
    currentEditingConfigId = configId;
    $('#deleteConfigName').text(configName);
    showModal('deleteImagerConfigModal');
}

/**
 * Confirm delete configuration
 */
function confirmDeleteConfiguration() {
    console.log('Confirming delete configuration:', currentEditingConfigId);

    fetch(`/api/imager/config/${currentEditingConfigId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showAlert('Configuração excluída com sucesso!', 'success');
            hideModal('deleteImagerConfigModal');
            loadImagerConfigurations();
            loadImagerConfigStats();
        } else {
            showAlert('Erro ao excluir configuração: ' + data.message, 'danger');
        }
    })
    .catch(error => {
        console.error('Error deleting configuration:', error);
        showAlert('Erro ao excluir configuração: ' + error.message, 'danger');
    });
}

// ================================================================================
// UTILITY FUNCTIONS
// ================================================================================

/**
 * Refresh configurations
 */
function refreshConfigurations() {
    console.log('Refreshing configurations...');
    loadImagerConfigurations();
    loadImagerConfigStats();
    showAlert('Configurações atualizadas!', 'info');
}

/**
 * Enable all configurations
 */
function enableAllConfigs() {
    console.log('Enabling all configurations...');
    // This would require a bulk operation endpoint
    showAlert('Funcionalidade em desenvolvimento', 'info');
}

/**
 * Disable all configurations
 */
function disableAllConfigs() {
    console.log('Disabling all configurations...');
    // This would require a bulk operation endpoint
    showAlert('Funcionalidade em desenvolvimento', 'info');
}

// ================================================================================
// EXPORT FUNCTIONS FOR GLOBAL ACCESS
// ================================================================================

window.initializeImagerConfig = initializeImagerConfig;
window.resetImagerConfig = resetImagerConfig;
window.refreshConfigurations = refreshConfigurations;
window.enableAllConfigs = enableAllConfigs;
window.disableAllConfigs = disableAllConfigs;
window.editConfig = editConfig;
window.toggleConfig = toggleConfig;
window.deleteConfig = deleteConfig;
