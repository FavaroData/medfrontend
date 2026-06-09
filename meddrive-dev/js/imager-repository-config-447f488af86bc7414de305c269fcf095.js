// ================================================================================
// IMAGER REPOSITORY CONFIGURATION MANAGEMENT
// ================================================================================
// This file handles file repository management including CRUD operations
// and tab-specific event handlers

// ================================================================================
// VALIDATION FUNCTIONS
// ================================================================================
// (No validation functions currently needed)

// ================================================================================
// EVENT HANDLERS
// ================================================================================

/**
 * Initialize event handlers for repository management
 */
function initializeRepositoryHandlers() {
    console.log('Initializing repository event handlers...');

    // Toolbar event handlers
    // Items per page selector
    $('#fileRepoItemsPerPageSelect').off('change').on('change', function() {
        const pageLength = parseInt($(this).val());
        if (fileRepoTable) {
            fileRepoTable.page.len(pageLength).draw();
        }
    });

    // Search input
    $('#fileRepoSearchInput').off('input').on('input', function() {
        const searchValue = $(this).val();
        if (fileRepoTable) {
            fileRepoTable.search(searchValue).draw();
        }
        // Show/hide clear button
        $('#fileRepoClearSearchBtn').toggle(searchValue.length > 0);
    });

    // Clear search button
    $('#fileRepoClearSearchBtn').off('click').on('click', function() {
        $('#fileRepoSearchInput').val('');
        if (fileRepoTable) {
            fileRepoTable.search('').draw();
        }
        $(this).hide();
    });

    // Add repository button - with better error handling
    $('#addRepositoryBtn').off('click').on('click', function() {
        console.log('Add repository button clicked!');

        // Wait a bit and try again if elements are not found
        const tryOpenModal = (attempts = 0) => {
            const form = document.getElementById('addRepositoryForm');
            const modalElement = document.getElementById('addRepositoryModal');

            if (!form || !modalElement) {
                if (attempts < 3) {
                    console.log(`Repository modal elements not ready, retrying... (attempt ${attempts + 1})`);
                    setTimeout(() => tryOpenModal(attempts + 1), 100);
                    return;
                }
                console.error('Repository form or modal not found in DOM after retries');
                console.error('addRepositoryForm exists:', form);
                console.error('addRepositoryModal exists:', modalElement);
                console.error('All modals in DOM:', document.querySelectorAll('.modal').length);
                return;
            }

            form.reset();

            // Load available OCR masks
            loadOcrMasksIntoRepoSelect();

            const modal = new bootstrap.Modal(modalElement);
            modal.show();
        };

        tryOpenModal();
    });

    // Archive toggle for add repository modal
    $('#repoAutoArchiveEnabled').off('change').on('change', function() {
        document.getElementById('repoArchiveSettings').style.display = this.checked ? 'block' : 'none';
    });

    // Archive toggle for edit repository modal
    $('#editRepoAutoArchiveEnabled').off('change').on('change', function() {
        document.getElementById('editRepoArchiveSettings').style.display = this.checked ? 'block' : 'none';
    });

    // Rename-on-ingestion toggle for add repository modal
    $('#repoRenameOnIngestionEnabled').off('change').on('change', function() {
        document.getElementById('repoRenamePrefixSettings').style.display = this.checked ? 'flex' : 'none';
        if (!this.checked) {
            document.getElementById('repoRenameFilenamePrefix').value = '';
        }
    });

    // Rename-on-ingestion toggle for edit repository modal
    $('#editRepoRenameOnIngestionEnabled').off('change').on('change', function() {
        document.getElementById('editRepoRenamePrefixSettings').style.display = this.checked ? 'flex' : 'none';
        if (!this.checked) {
            document.getElementById('editRepoRenameFilenamePrefix').value = '';
        }
    });

    // Form submit handler for add repository
    $('#addRepositoryForm').off('submit').on('submit', function(e) {
        e.preventDefault();
        createRepository();
    });

    // Form submit handler for edit repository
    $('#editRepositoryForm').off('submit').on('submit', function(e) {
        e.preventDefault();
        updateRepository();
    });

    // Tab switch handler to load repositories when tab is shown
    $('#file-repos-tab').off('shown.bs.tab').on('shown.bs.tab', function() {
        console.log('File repos tab shown event triggered, loading repositories...');
        // Check if DataTable is initialized on the table element
        const isDataTableInitialized = $.fn.DataTable && $.fn.DataTable.isDataTable('#fileRepoTable');
        if (!isDataTableInitialized) {
            console.log('File repo table not initialized, will initialize when loading data...');
        }
        loadFileRepositories();
    });

    // Add Profile button handler
    $('#addProfileBtn').off('click').on('click', function() {
        console.log('Add profile button clicked!');
        openAddProfileModal();
    });
}

// ========================================================================================
// OCR MASKS FOR REPOSITORIES
// ========================================================================================

let availableOcrMasksForRepos = []; // Cache of available OCR masks

/**
 * Load OCR masks into repository select dropdown
 */
function loadOcrMasksIntoRepoSelect(selectedMaskId = null) {
    fetch('/api/imager/masks')
        .then(response => response.json())
        .then(masks => {
            availableOcrMasksForRepos = masks;
            const select = document.getElementById('repoOcrMask');
            if (!select) return;

            select.innerHTML = '<option value="">Nenhuma máscara</option>';

            masks.forEach(mask => {
                const option = document.createElement('option');
                option.value = mask.id;

                let regionCount = 0;
                try {
                    const regions = JSON.parse(mask.masks || '[]');
                    regionCount = regions.length;
                } catch (e) {
                    regionCount = 0;
                }

                option.textContent = `${mask.name} (${regionCount} região${regionCount !== 1 ? 'ões' : ''})`;

                if (selectedMaskId && mask.id == selectedMaskId) {
                    option.selected = true;
                }

                select.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Error loading OCR masks:', error);
        });
}

/**
 * Load OCR masks into edit repository select dropdown
 */
function loadOcrMasksIntoEditRepoSelect(selectedMaskId = null) {
    fetch('/api/imager/masks')
        .then(response => response.json())
        .then(masks => {
            const select = document.getElementById('editRepoOcrMask');
            if (!select) return;

            select.innerHTML = '<option value="">Nenhuma máscara</option>';

            masks.forEach(mask => {
                const option = document.createElement('option');
                option.value = mask.id;

                let regionCount = 0;
                try {
                    const regions = JSON.parse(mask.masks || '[]');
                    regionCount = regions.length;
                } catch (e) {
                    regionCount = 0;
                }

                option.textContent = `${mask.name} (${regionCount} região${regionCount !== 1 ? 'ões' : ''})`;

                if (selectedMaskId && mask.id == selectedMaskId) {
                    option.selected = true;
                }

                select.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Error loading OCR masks for edit:', error);
        });
}

// ========================================================================================
// FILE REPOSITORY MANAGEMENT
// ========================================================================================

// DataTable instance
let fileRepoTable = null;

/**
 * Initialize DataTable for file repositories
 * USES: Meddrive DataTables Componentization System
 */
function initializeFileRepoTable(repositories = []) {
    const config = window.MeddriveDataTables.configs.standard({
        data: repositories,
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
                data: 'name',
                title: 'Nome',
                width: '15%'
            },
            {
                data: 'sourcePath',
                title: 'Caminho',
                width: '20%',
                render: function(data, type, row) {
                    if (type !== 'display') return data;
                    return `<small>${window.MeddriveRenderers.escapeHtml(data)}</small>`;
                }
            },
            {
                data: 'processingMaxAgeMinutes',
                title: 'Filtro Idade',
                width: '8%',
                className: 'text-center',
                render: function(data) {
                    if (!data || data <= 0) return '<span class="text-muted">—</span>';
                    return data + 'm';
                }
            },
            {
                data: 'ocrEnabled',
                title: 'OCR',
                width: '8%',
                className: 'text-center',
                render: window.MeddriveRenderers.booleanBadge('Habilitado', 'Desabilitado')
            },
            {
                data: 'autoArchiveEnabled',
                title: 'Auto-Arquivo',
                width: '10%',
                className: 'text-center',
                render: window.MeddriveRenderers.booleanBadge('Habilitado', 'Desabilitado')
            },
            {
                data: 'enabled',
                title: 'Status',
                width: '7%',
                className: 'text-center',
                render: window.MeddriveRenderers.status
            },
            {
                data: 'displayOrder',
                title: 'Ordem',
                width: '5%',
                className: 'text-center',
                render: function(data) {
                    return data || 0;
                }
            },
            {
                data: null,
                title: 'Ações',
                width: '20%',
                orderable: false,
                className: 'text-center',
                render: function(data, type, row) {
                    if (type !== 'display') return '';

                    return `
                        <button class="btn-icon-only" onclick="editRepository(${row.id})" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon-only" onclick="toggleRepository(${row.id})" title="${row.enabled ? 'Desativar' : 'Ativar'}">
                            <i class="fas fa-${row.enabled ? 'pause' : 'play'}"></i>
                        </button>
                        <button class="btn-icon-only" onclick="deleteRepository(${row.id})" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    `;
                }
            }
        ],
        order: [[7, 'asc'], [1, 'asc']] // Order by displayOrder (now col 7) then name
    });

    fileRepoTable = window.MeddriveDataTables.init('#fileRepoTable', config);
    // Export to window for access from reset function
    window.fileRepoTable = fileRepoTable;
}

/**
 * Load and display file repositories
 */
function loadFileRepositories() {
    console.log('loadFileRepositories called, current fileRepoTable instance:', fileRepoTable);
    console.log('window.fileRepoTable type:', typeof window.fileRepoTable);
    console.log('window.fileRepoTable is DataTable?', window.fileRepoTable && typeof window.fileRepoTable.clear === 'function');

    fetch('/api/imager/repositories')
        .then(response => response.json())
        .then(repositories => {
            console.log('Repositories loaded from API:', repositories.length, 'items');

            // Check if table element exists and if DataTable is initialized
            const $table = $('#fileRepoTable');
            const isDataTableInitialized = $.fn.DataTable && $.fn.DataTable.isDataTable('#fileRepoTable');
            
            // Check if we have a valid DataTable instance
            let tableInstance = null;
            if (isDataTableInitialized) {
                tableInstance = $table.DataTable();
            } else if (fileRepoTable && typeof fileRepoTable.clear === 'function') {
                tableInstance = fileRepoTable;
            } else if (window.fileRepoTable && typeof window.fileRepoTable.clear === 'function') {
                tableInstance = window.fileRepoTable;
            }

            if (!tableInstance || !isDataTableInitialized) {
                // First load or table was destroyed - initialize table
                console.log('Initializing file repo table...');
                initializeFileRepoTable(repositories);
            } else {
                // Subsequent loads - update data
                console.log('Updating existing file repo table...');
                try {
                    tableInstance.clear();
                    tableInstance.rows.add(repositories);
                    tableInstance.draw();

                    // Ensure both references are updated
                    fileRepoTable = tableInstance;
                    window.fileRepoTable = tableInstance;
                } catch (error) {
                    console.warn('Error updating table, reinitializing:', error);
                    initializeFileRepoTable(repositories);
                }
            }
        })
        .catch(error => {
            console.error('Error loading repositories:', error);
            showNotification('Erro ao carregar repositórios', 'error');
        });
}

/**
 * Valida prefixo de renomeação no front (espelho da validação do backend).
 * @returns {string|null} mensagem de erro ou null se válido
 */
function validateRenameConfig(renameEnabled, renamePrefix) {
    if (!renameEnabled) return null;
    if (!renamePrefix || renamePrefix.trim() === '') {
        return 'Prefixo de renomeação é obrigatório quando a renomeação na ingestão está habilitada';
    }
    const invalidChars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
    for (const c of invalidChars) {
        if (renamePrefix.includes(c)) {
            return `Prefixo de renomeação contém caractere inválido: '${c}'`;
        }
    }
    return null;
}

/**
 * Create new repository
 */
function createRepository() {
    // Disable ALL buttons in the form to prevent double-submission
    const form = document.getElementById('addRepositoryForm');
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

    const formData = new FormData(document.getElementById('addRepositoryForm'));
    const repoData = {
        name: formData.get('name'),
        sourcePath: formData.get('sourcePath'),
        description: formData.get('description'),
        displayOrder: parseInt(formData.get('displayOrder')) || 0,
        enabled: true,

        // Filename filtering
        inclusionWildcard: formData.get('inclusionWildcard') || null,
        exclusionWildcard: formData.get('exclusionWildcard') || null,
        pdfMinSizeKb: parseInt(formData.get('pdfMinSizeKb')) || 0,
        processingMaxAgeMinutes: parseInt(formData.get('processingMaxAgeMinutes')) || 0,

        // File rename on ingestion
        renameOnIngestionEnabled: formData.get('renameOnIngestionEnabled') === 'on',
        renameFilenamePrefix: formData.get('renameFilenamePrefix') || null,

        // Intelligent extraction settings
        useIntelligentExtraction: formData.get('useIntelligentExtraction') === 'on',
        textExtractionMinChars: parseInt(formData.get('textExtractionMinChars')) || 10,

        // PDF rotation correction
        autoCorrectPdfRotation: formData.get('autoCorrectPdfRotation') === 'on',
        verticalTextThreshold: parseFloat(formData.get('verticalTextThreshold')) || 0.05,

        // OCR settings
        ocrEnabled: formData.get('ocrEnabled') === 'on',
        extractFirstPageOnly: formData.get('extractFirstPageOnly') === 'on',
        ocrPageSegMode: parseInt(formData.get('ocrPageSegMode')) || 1,
        ocrEngineMode: parseInt(formData.get('ocrEngineMode')) || 3,
        ocrCharWhitelist: formData.get('ocrCharWhitelist') || null,
        ocrCharBlacklist: formData.get('ocrCharBlacklist') || null,
        ocrOptimizedForNumbers: formData.get('ocrOptimizedForNumbers') === 'on',
        ocrDpi: parseInt(formData.get('ocrDpi')) || 300,
        ocrSkipImagePreprocessing: formData.get('ocrSkipImagePreprocessing') === 'on',
        ocrTextordMinLinesize: parseFloat(formData.get('ocrTextordMinLinesize')) || 2.5,
        ocrDisableInvert: formData.get('ocrDisableInvert') === 'on',
        ocrDebugSaveImages: formData.get('ocrDebugSaveImages') === 'on',
        denoiseStrength: parseInt(formData.get('denoiseStrength')) || 0,

        // Advanced preprocessing
        unsharpMaskEnabled: formData.get('unsharpMaskEnabled') === 'on',
        unsharpMaskSigma: parseFloat(formData.get('unsharpMaskSigma')) || 2.0,
        unsharpMaskAmount: parseFloat(formData.get('unsharpMaskAmount')) || 1.5,
        contrastStretchingEnabled: formData.get('contrastStretchingEnabled') === 'on',
        contrastBlackThreshold: parseInt(formData.get('contrastBlackThreshold')) || 110,
        contrastWhiteThreshold: formData.get('contrastWhiteThreshold') ? parseInt(formData.get('contrastWhiteThreshold')) : null,

        // OCR Mask
        ocrMaskId: formData.get('ocrMaskId') ? parseInt(formData.get('ocrMaskId')) : null,

        // Archive settings
        autoArchiveEnabled: formData.get('autoArchiveEnabled') === 'on',
        imageConversionEnabled: formData.get('imageConversionEnabled') === 'on',
        autoArchiveAgeMinutes: parseInt(formData.get('autoArchiveAgeMinutes')) || 60,
        autoArchivePath: formData.get('autoArchivePath') || null,
        autoArchiveFrequencyMinutes: parseInt(formData.get('autoArchiveFrequencyMinutes')) || 60,

        // Repository scanning settings
        scanFrequencySeconds: parseInt(formData.get('scanFrequencySeconds')) || 60
    };

    const renameError = validateRenameConfig(
        repoData.renameOnIngestionEnabled,
        repoData.renameFilenamePrefix
    );
    if (renameError) {
        showNotification(renameError, 'error');
        allButtons.forEach(btn => {
            const originalState = buttonStates.get(btn);
            if (originalState) {
                btn.disabled = originalState.disabled;
                btn.innerHTML = originalState.html;
            }
        });
        return;
    }

    fetch('/api/imager/repositories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(repoData)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => Promise.reject(err));
        }
        return response.json();
    })
    .then(() => {
        bootstrap.Modal.getInstance(document.getElementById('addRepositoryModal')).hide();
        loadFileRepositories();
        showNotification('Repositório criado com sucesso', 'success');
    })
    .catch(error => {
        console.error('Error creating repository:', error);
        showNotification(error.error || 'Erro ao criar repositório', 'error');
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
 * Edit repository
 * @param {number} id - The repository ID to edit
 */
function editRepository(id) {
    fetch(`/api/imager/repositories/${id}`)
        .then(response => response.json())
        .then(repo => {
            // Populate form
            document.getElementById('editRepoId').value = repo.id;
            document.getElementById('editRepoName').value = repo.name;
            document.getElementById('editRepoSourcePath').value = repo.sourcePath;
            document.getElementById('editRepoDescription').value = repo.description || '';
            document.getElementById('editRepoDisplayOrder').value = repo.displayOrder || 0;

            // Filename filtering
            document.getElementById('editRepoInclusionWildcard').value = repo.inclusionWildcard || '';
            document.getElementById('editRepoExclusionWildcard').value = repo.exclusionWildcard || '';
            document.getElementById('editRepoPdfMinSizeKb').value = repo.pdfMinSizeKb || 0;
            document.getElementById('editRepoProcessingMaxAgeMinutes').value = repo.processingMaxAgeMinutes || 0;

            // File rename on ingestion
            const renameEnabled = repo.renameOnIngestionEnabled === true;
            document.getElementById('editRepoRenameOnIngestionEnabled').checked = renameEnabled;
            document.getElementById('editRepoRenamePrefixSettings').style.display = renameEnabled ? 'flex' : 'none';
            document.getElementById('editRepoRenameFilenamePrefix').value = repo.renameFilenamePrefix || '';

            // Intelligent extraction settings
            document.getElementById('editRepoUseIntelligentExtraction').checked = repo.useIntelligentExtraction !== false; // Default true
            document.getElementById('editRepoTextExtractionMinChars').value = repo.textExtractionMinChars || 10;

            // PDF rotation correction
            document.getElementById('editRepoAutoCorrectPdfRotation').checked = repo.autoCorrectPdfRotation === true;
            document.getElementById('editRepoVerticalTextThreshold').value = repo.verticalTextThreshold || 0.05;

            // OCR settings
            document.getElementById('editRepoOcrEnabled').checked = repo.ocrEnabled === true;
            document.getElementById('editRepoExtractFirstPageOnly').checked = repo.extractFirstPageOnly === true;
            document.getElementById('editRepoOcrPageSegMode').value = repo.ocrPageSegMode || 1;
            document.getElementById('editRepoOcrEngineMode').value = repo.ocrEngineMode || 3;
            document.getElementById('editRepoOcrCharWhitelist').value = repo.ocrCharWhitelist || '';
            document.getElementById('editRepoOcrCharBlacklist').value = repo.ocrCharBlacklist || '';
            document.getElementById('editRepoOcrOptimizedForNumbers').checked = repo.ocrOptimizedForNumbers === true;
            document.getElementById('editRepoOcrDpi').value = repo.ocrDpi || 300;
            document.getElementById('editRepoOcrSkipImagePreprocessing').checked = repo.ocrSkipImagePreprocessing === true;
            document.getElementById('editRepoOcrTextordMinLinesize').value = repo.ocrTextordMinLinesize || 2.5;
            document.getElementById('editRepoOcrDisableInvert').checked = repo.ocrDisableInvert !== false; // Default true
            document.getElementById('editRepoOcrDebugSaveImages').checked = repo.ocrDebugSaveImages === true;
            document.getElementById('editRepoDenoiseStrength').value = repo.denoiseStrength || 0;

            // Advanced preprocessing
            document.getElementById('editRepoUnsharpMaskEnabled').checked = repo.unsharpMaskEnabled === true;
            document.getElementById('editRepoUnsharpMaskSigma').value = repo.unsharpMaskSigma !== null && repo.unsharpMaskSigma !== undefined ? repo.unsharpMaskSigma : 2.0;
            document.getElementById('editRepoUnsharpMaskAmount').value = repo.unsharpMaskAmount !== null && repo.unsharpMaskAmount !== undefined ? repo.unsharpMaskAmount : 1.5;
            document.getElementById('editRepoContrastStretchingEnabled').checked = repo.contrastStretchingEnabled !== false; // Default true
            document.getElementById('editRepoContrastBlackThreshold').value = repo.contrastBlackThreshold !== null && repo.contrastBlackThreshold !== undefined ? repo.contrastBlackThreshold : 110;
            document.getElementById('editRepoContrastWhiteThreshold').value = repo.contrastWhiteThreshold !== null && repo.contrastWhiteThreshold !== undefined ? repo.contrastWhiteThreshold : '';

            // Load OCR masks and select current value
            loadOcrMasksIntoEditRepoSelect(repo.ocrMaskId);

            // Archive settings
            document.getElementById('editRepoAutoArchiveEnabled').checked = repo.autoArchiveEnabled === true;
            // Image conversion setting
            document.getElementById('editRepoImageConversionEnabled').checked = repo.imageConversionEnabled === true;
            document.getElementById('editRepoArchiveSettings').style.display = repo.autoArchiveEnabled ? 'block' : 'none';
            document.getElementById('editRepoAutoArchivePath').value = repo.autoArchivePath || '';
            document.getElementById('editRepoAutoArchiveAgeMinutes').value = repo.autoArchiveAgeMinutes || 60;
            document.getElementById('editRepoAutoArchiveFrequencyMinutes').value = repo.autoArchiveFrequencyMinutes || 60;

            // Repository scanning settings
            document.getElementById('editRepoScanFrequencySeconds').value = repo.scanFrequencySeconds || 60;

            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('editRepositoryModal'));
            modal.show();

            // Load profiles for this repository
            if (typeof loadRepositoryProfiles === 'function') {
                loadRepositoryProfiles(repo.id);
            }
        })
        .catch(error => {
            console.error('Error loading repository:', error);
            showNotification('Erro ao carregar repositório', 'error');
        });
}

/**
 * Update repository
 */
function updateRepository() {
    // Disable ALL buttons in the form to prevent double-submission
    const form = document.getElementById('editRepositoryForm');
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

    const formData = new FormData(document.getElementById('editRepositoryForm'));
    const id = document.getElementById('editRepoId').value;

    const repoData = {
        name: formData.get('name'),
        sourcePath: formData.get('sourcePath'),
        description: formData.get('description'),
        displayOrder: parseInt(formData.get('displayOrder')) || 0,
        enabled: true,

        // Filename filtering
        inclusionWildcard: formData.get('inclusionWildcard') || null,
        exclusionWildcard: formData.get('exclusionWildcard') || null,
        pdfMinSizeKb: parseInt(formData.get('pdfMinSizeKb')) || 0,
        processingMaxAgeMinutes: parseInt(formData.get('processingMaxAgeMinutes')) || 0,

        // File rename on ingestion
        renameOnIngestionEnabled: document.getElementById('editRepoRenameOnIngestionEnabled').checked,
        renameFilenamePrefix: formData.get('renameFilenamePrefix') || null,

        // Intelligent extraction settings
        useIntelligentExtraction: document.getElementById('editRepoUseIntelligentExtraction').checked,
        textExtractionMinChars: parseInt(formData.get('textExtractionMinChars')) || 10,

        // PDF rotation correction
        autoCorrectPdfRotation: document.getElementById('editRepoAutoCorrectPdfRotation').checked,
        verticalTextThreshold: parseFloat(formData.get('verticalTextThreshold')) || 0.05,

        // OCR settings
        ocrEnabled: document.getElementById('editRepoOcrEnabled').checked,
        extractFirstPageOnly: document.getElementById('editRepoExtractFirstPageOnly').checked,
        ocrPageSegMode: parseInt(formData.get('ocrPageSegMode')) || 1,
        ocrEngineMode: parseInt(formData.get('ocrEngineMode')) || 3,
        ocrCharWhitelist: formData.get('ocrCharWhitelist') || null,
        ocrCharBlacklist: formData.get('ocrCharBlacklist') || null,
        ocrOptimizedForNumbers: document.getElementById('editRepoOcrOptimizedForNumbers').checked,
        ocrDpi: parseInt(formData.get('ocrDpi')) || 300,
        ocrSkipImagePreprocessing: document.getElementById('editRepoOcrSkipImagePreprocessing').checked,
        ocrTextordMinLinesize: parseFloat(formData.get('ocrTextordMinLinesize')) || 2.5,
        ocrDisableInvert: document.getElementById('editRepoOcrDisableInvert').checked,
        ocrDebugSaveImages: document.getElementById('editRepoOcrDebugSaveImages').checked,
        denoiseStrength: parseInt(formData.get('denoiseStrength')) || 0,

        // Advanced preprocessing
        unsharpMaskEnabled: document.getElementById('editRepoUnsharpMaskEnabled').checked,
        unsharpMaskSigma: parseFloat(formData.get('unsharpMaskSigma')) || 2.0,
        unsharpMaskAmount: parseFloat(formData.get('unsharpMaskAmount')) || 1.5,
        contrastStretchingEnabled: document.getElementById('editRepoContrastStretchingEnabled').checked,
        contrastBlackThreshold: parseInt(formData.get('contrastBlackThreshold')) || 110,
        contrastWhiteThreshold: formData.get('contrastWhiteThreshold') ? parseInt(formData.get('contrastWhiteThreshold')) : null,

        // OCR Mask
        ocrMaskId: formData.get('ocrMaskId') ? parseInt(formData.get('ocrMaskId')) : null,

        // Archive settings
        autoArchiveEnabled: document.getElementById('editRepoAutoArchiveEnabled').checked,
        imageConversionEnabled: document.getElementById('editRepoImageConversionEnabled').checked,
        autoArchiveAgeMinutes: parseInt(formData.get('autoArchiveAgeMinutes')) || 60,
        autoArchivePath: formData.get('autoArchivePath') || null,
        autoArchiveFrequencyMinutes: parseInt(formData.get('autoArchiveFrequencyMinutes')) || 60,

        // Repository scanning settings
        scanFrequencySeconds: parseInt(formData.get('scanFrequencySeconds')) || 60
    };

    const renameError = validateRenameConfig(
        repoData.renameOnIngestionEnabled,
        repoData.renameFilenamePrefix
    );
    if (renameError) {
        showNotification(renameError, 'error');
        allButtons.forEach(btn => {
            const originalState = buttonStates.get(btn);
            if (originalState) {
                btn.disabled = originalState.disabled;
                btn.innerHTML = originalState.html;
            }
        });
        return;
    }

    fetch(`/api/imager/repositories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(repoData)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => Promise.reject(err));
        }
        return response.json();
    })
    .then(() => {
        bootstrap.Modal.getInstance(document.getElementById('editRepositoryModal')).hide();
        loadFileRepositories();
        showNotification('Repositório atualizado com sucesso', 'success');
    })
    .catch(error => {
        console.error('Error updating repository:', error);
        showNotification(error.error || 'Erro ao atualizar repositório', 'error');
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
 * Toggle repository status
 * @param {number} id - The repository ID to toggle
 */
function toggleRepository(id) {
    fetch(`/api/imager/repositories/${id}/toggle`, {
        method: 'POST'
    })
    .then(response => response.json())
    .then(() => {
        loadFileRepositories();
        showNotification('Status do repositório alterado com sucesso', 'success');
    })
    .catch(error => {
        console.error('Error toggling repository:', error);
        showNotification('Erro ao alterar status do repositório', 'error');
    });
}

/**
 * Delete repository
 * @param {number} id - The repository ID to delete
 */
function deleteRepository(id) {
    if (!confirm('Tem certeza que deseja excluir este repositório? Esta ação não pode ser desfeita.')) {
        return;
    }

    fetch(`/api/imager/repositories/${id}`, {
        method: 'DELETE'
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => Promise.reject(err));
        }
        return response.json();
    })
    .then(() => {
        loadFileRepositories();
        showNotification('Repositório excluído com sucesso', 'success');
    })
    .catch(error => {
        console.error('Error deleting repository:', error);
        showNotification(error.error || 'Erro ao excluir repositório', 'error');
    });
}

// ================================================================================
// EXPORT FUNCTIONS FOR GLOBAL ACCESS
// ================================================================================

window.initializeRepositoryHandlers = initializeRepositoryHandlers;
window.loadFileRepositories = loadFileRepositories;
window.createRepository = createRepository;
window.editRepository = editRepository;
window.updateRepository = updateRepository;
window.toggleRepository = toggleRepository;
window.deleteRepository = deleteRepository;
