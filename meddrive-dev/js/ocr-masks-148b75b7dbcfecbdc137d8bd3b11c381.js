/**
 * OCR Masks Management
 * Manages reusable OCR mask configurations
 *
 * USES: Meddrive DataTables Componentization System
 * - datatables-config.js for consistent configuration
 * - datatables-renderers.js for consistent column rendering
 */

let ocrMasksTable = null;
let currentEditingMaskId = null;
let ocrMasksInitialized = false;
let ocrMasksLoading = false;

/**
 * Reset OCR Masks module state
 * Called when navigating away from the config page
 */
function resetOcrMasks() {
    console.log('[OCR Masks] Resetting module state...');
    ocrMasksInitialized = false;
    currentEditingMaskId = null;
    ocrMasksLoading = false;

    // Destroy existing table if present
    if (ocrMasksTable) {
        try {
            ocrMasksTable.destroy();
            console.log('[OCR Masks] Table destroyed');
        } catch (e) {
            console.warn('[OCR Masks] Error destroying table during reset:', e);
        }
        ocrMasksTable = null;
    }
}

// Export for global access
window.resetOcrMasks = resetOcrMasks;

/**
 * Load all OCR masks and initialize DataTable
 */
function loadOcrMasks() {
    // Prevent concurrent loads
    if (ocrMasksLoading) {
        console.log('[OCR Masks] Already loading, skipping...');
        return;
    }

    ocrMasksLoading = true;
    console.log('[OCR Masks] Loading masks from API...');

    fetch('/api/imager/masks')
        .then(response => response.json())
        .then(masks => {
            console.log(`[OCR Masks] Loaded ${masks.length} masks from API`);
            initializeOcrMasksTable(masks);
        })
        .catch(error => {
            console.error('Error loading OCR masks:', error);
            showAlert('Erro ao carregar máscaras OCR: ' + error.message, 'danger');
        })
        .finally(() => {
            ocrMasksLoading = false;
        });
}

/**
 * Initialize DataTable for OCR masks
 */
function initializeOcrMasksTable(masks) {
    console.log('[OCR Masks] initializeOcrMasksTable called with', masks.length, 'masks');

    // Check if table exists in DOM
    const tableElement = document.getElementById('ocrMasksTable');
    if (!tableElement) {
        console.error('[OCR Masks] Table element #ocrMasksTable not found in DOM');
        return;
    }

    // Destroy existing table if present
    if (ocrMasksTable) {
        try {
            console.log('[OCR Masks] Destroying existing DataTable instance');
            ocrMasksTable.clear();
            ocrMasksTable.rows.add(masks).draw();
            console.log('[OCR Masks] Table updated with new data');
            return; // Just update existing table instead of recreating
        } catch (e) {
            console.warn('[OCR Masks] Error updating table, will recreate:', e);
            try {
                ocrMasksTable.destroy(true);
                console.log('[OCR Masks] Table destroyed');
            } catch (e2) {
                console.warn('[OCR Masks] Error destroying table:', e2);
            }
            ocrMasksTable = null;
        }
    }

    // Clear the table body to ensure clean state
    const tableBody = tableElement.querySelector('tbody');
    if (tableBody) {
        tableBody.innerHTML = '';
    }

    // Process masks to add regionCount
    const processedMasks = masks.map(mask => {
        try {
            const regions = JSON.parse(mask.masks || '[]');
            mask.regionCount = regions.length;
        } catch (e) {
            mask.regionCount = 0;
        }
        return mask;
    });

    // Use compact configuration from datatables-config.js
    const config = window.MeddriveDataTables.configs.compact({
        data: processedMasks,
        columns: [
            {
                data: 'id',
                title: 'ID',
                width: '8%',
                className: 'text-center'
            },
            {
                data: null,
                title: 'Nome / Descrição',
                width: '30%',
                render: window.MeddriveRenderers.titleSubtitle('name', 'description')
            },
            {
                data: 'regionCount',
                title: 'Nº Regiões',
                width: '12%',
                className: 'text-center',
                render: function(data) {
                    if (data === 0) {
                        return '<span class="badge bg-secondary">0</span>';
                    }
                    return '<span class="badge bg-primary">' + data + '</span>';
                }
            },
            {
                data: 'createdAt',
                title: 'Criado em',
                width: '15%',
                render: window.MeddriveRenderers.shortDateTime
            },
            {
                data: 'updatedAt',
                title: 'Atualizado em',
                width: '15%',
                render: window.MeddriveRenderers.shortDateTime
            },
            {
                data: null,
                title: 'Ações',
                width: '20%',
                orderable: false,
                className: 'text-end',
                render: function(data, type, row) {
                    return `
                        <button class="btn-icon-only" onclick="editOcrMask(${row.id})" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon-only" onclick="deleteOcrMask(${row.id})" title="Excluir">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    `;
                }
            }
        ],
        order: [[1, 'asc']], // Order by name
        language: {
            emptyTable: '<i class="fas fa-info-circle me-2"></i>Nenhuma máscara OCR cadastrada. Clique em "Adicionar Máscara" para criar uma.'
        }
    });

    // Initialize table using helper from datatables-config.js
    ocrMasksTable = window.MeddriveDataTables.init('#ocrMasksTable', config);
}

/**
 * Open add mask modal
 */
function openAddOcrMaskModal() {
    console.log('[OCR Masks] openAddOcrMaskModal called');
    currentEditingMaskId = null;

    // Reset mask editor state
    window.currentMasks = [];
    window.currentProfileId = null;
    window.maskEditorRepositoryId = null;

    // Change modal title
    const modalLabel = document.getElementById('maskEditorModalLabel');
    if (modalLabel) {
        modalLabel.textContent = 'Adicionar Máscara OCR';
        console.log('[OCR Masks] Modal title changed');
    } else {
        console.error('[OCR Masks] maskEditorModalLabel NOT found');
    }

    // Show metadata section (name/description)
    const metadataSection = document.getElementById('maskMetadataSection');
    if (metadataSection) {
        metadataSection.style.display = 'block';
        console.log('[OCR Masks] Metadata section shown');
    } else {
        console.error('[OCR Masks] maskMetadataSection NOT found');
    }

    // Clear form
    const maskNameField = document.getElementById('maskName');
    const maskDescField = document.getElementById('maskDescription');
    const maskPdfField = document.getElementById('maskPdfFile');

    if (maskNameField) maskNameField.value = '';
    if (maskDescField) maskDescField.value = '';
    if (maskPdfField) maskPdfField.value = '';

    // Hide PDF canvas and show instructions
    const pdfCanvasContainer = document.getElementById('pdfCanvasContainer');
    const drawingControls = document.getElementById('drawingControls');
    const pdfInstructions = document.getElementById('pdfInstructions');

    if (pdfCanvasContainer) pdfCanvasContainer.classList.add('d-none');
    if (drawingControls) drawingControls.classList.add('d-none');
    if (pdfInstructions) pdfInstructions.classList.remove('d-none');

    // Update mask list
    if (typeof updateMaskList === 'function') {
        updateMaskList();
        console.log('[OCR Masks] Mask list updated');
    } else {
        console.error('[OCR Masks] updateMaskList function NOT found');
    }

    // Change save button text and function
    const saveBtn = document.querySelector('#maskEditorModal .modal-footer .btn-primary');
    if (saveBtn) {
        saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>Salvar Máscara';
        saveBtn.onclick = saveNewOcrMask;
        console.log('[OCR Masks] Save button configured');
    } else {
        console.error('[OCR Masks] Save button NOT found');
    }

    // Show modal
    const modalElement = document.getElementById('maskEditorModal');
    if (modalElement) {
        console.log('[OCR Masks] Modal element found, showing modal');
        const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
        modal.show();
        console.log('[OCR Masks] Modal shown');
    } else {
        console.error('[OCR Masks] maskEditorModal element NOT found');
    }
}

/**
 * Edit existing mask
 */
function editOcrMask(maskId) {
    currentEditingMaskId = maskId;

    // Fetch mask data
    fetch(`/api/imager/masks/${maskId}`)
        .then(response => response.json())
        .then(mask => {
            // Set form values
            document.getElementById('maskName').value = mask.name || '';
            document.getElementById('maskDescription').value = mask.description || '';

            // Parse and load masks
            try {
                window.currentMasks = JSON.parse(mask.masks || '[]');
            } catch (e) {
                console.error('Error parsing masks:', e);
                window.currentMasks = [];
            }

            // Update mask list display
            updateMaskList();

            // Change modal title
            document.getElementById('maskEditorModalLabel').textContent = 'Editar Máscara OCR';

            // Show metadata section
            const metadataSection = document.getElementById('maskMetadataSection');
            if (metadataSection) metadataSection.style.display = 'block';

            // Change save button
            const saveBtn = document.querySelector('#maskEditorModal .modal-footer .btn-primary');
            if (saveBtn) {
                saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>Atualizar Máscara';
                saveBtn.onclick = updateExistingOcrMask;
            }

            // Show modal
            const modalElement = document.getElementById('maskEditorModal');
            const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
            modal.show();
        })
        .catch(error => {
            console.error('Error loading mask:', error);
            showAlert('Erro ao carregar máscara: ' + error.message, 'danger');
        });
}

/**
 * Save new OCR mask
 */
function saveNewOcrMask() {
    const name = document.getElementById('maskName').value.trim();
    const description = document.getElementById('maskDescription').value.trim();

    // Validation
    if (!name) {
        showAlert('Nome da máscara é obrigatório', 'danger');
        return;
    }

    if (!window.currentMasks || window.currentMasks.length === 0) {
        showAlert('Defina pelo menos uma região de máscara', 'danger');
        return;
    }

    const maskData = {
        name: name,
        description: description,
        masks: JSON.stringify(window.currentMasks)
    };

    fetch('/api/imager/masks', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(maskData)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => Promise.reject(err));
        }
        return response.json();
    })
    .then(data => {
        showAlert('Máscara criada com sucesso!', 'success');

        // Close modal
        const modalElement = document.getElementById('maskEditorModal');
        const modal = bootstrap.Modal.getInstance(modalElement);
        if (modal) modal.hide();

        // Reload table
        loadOcrMasks();
    })
    .catch(error => {
        console.error('Error creating mask:', error);
        showAlert('Erro ao criar máscara: ' + (error.error || error.message), 'danger');
    });
}

/**
 * Update existing OCR mask
 */
function updateExistingOcrMask() {
    const name = document.getElementById('maskName').value.trim();
    const description = document.getElementById('maskDescription').value.trim();

    // Validation
    if (!name) {
        showAlert('Nome da máscara é obrigatório', 'danger');
        return;
    }

    if (!window.currentMasks || window.currentMasks.length === 0) {
        showAlert('Defina pelo menos uma região de máscara', 'danger');
        return;
    }

    const maskData = {
        name: name,
        description: description,
        masks: JSON.stringify(window.currentMasks)
    };

    fetch(`/api/imager/masks/${currentEditingMaskId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(maskData)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => Promise.reject(err));
        }
        return response.json();
    })
    .then(data => {
        showAlert('Máscara atualizada com sucesso!', 'success');

        // Close modal
        const modalElement = document.getElementById('maskEditorModal');
        const modal = bootstrap.Modal.getInstance(modalElement);
        if (modal) modal.hide();

        // Reload table
        loadOcrMasks();
    })
    .catch(error => {
        console.error('Error updating mask:', error);
        showAlert('Erro ao atualizar máscara: ' + (error.error || error.message), 'danger');
    });
}

/**
 * Delete OCR mask
 */
function deleteOcrMask(maskId) {
    // First check usage count
    fetch(`/api/imager/masks/${maskId}/usage-count`)
        .then(response => response.json())
        .then(data => {
            const usageCount = data.usageCount || 0;

            let message = 'Tem certeza que deseja deletar esta máscara?';
            if (usageCount > 0) {
                message = `Esta máscara está sendo usada por ${usageCount} perfil(is). Não será possível deletá-la até que seja removida de todos os perfis.`;
                showAlert(message, 'warning');
                return;
            }

            if (confirm(message)) {
                fetch(`/api/imager/masks/${maskId}`, {
                    method: 'DELETE'
                })
                .then(response => {
                    if (!response.ok) {
                        return response.json().then(err => Promise.reject(err));
                    }
                    return response.json();
                })
                .then(data => {
                    showAlert('Máscara deletada com sucesso!', 'success');
                    loadOcrMasks();
                })
                .catch(error => {
                    console.error('Error deleting mask:', error);
                    showAlert('Erro ao deletar máscara: ' + (error.error || error.message), 'danger');
                });
            }
        })
        .catch(error => {
            console.error('Error checking mask usage:', error);
            showAlert('Erro ao verificar uso da máscara', 'danger');
        });
}

// Note: showAlert is provided by ui-utils.js (loaded globally)

/**
 * Initialize OCR Masks module
 * Called by imager-exam-config.js after page content is loaded
 */
function initializeOcrMasks() {
    // Prevent double initialization
    if (ocrMasksInitialized) {
        console.log('[OCR Masks] Already initialized, skipping...');
        return;
    }

    console.log('[OCR Masks] initializeOcrMasks called');

    const ocrMasksTab = document.getElementById('ocr-masks-tab');
    if (ocrMasksTab) {
        console.log('[OCR Masks] OCR Masks tab found, adding shown.bs.tab listener');
        ocrMasksTab.addEventListener('shown.bs.tab', function() {
            console.log('[OCR Masks] Tab shown, loading masks and registering button handler');
            loadOcrMasks();

            // Register button handler when tab is shown (content is loaded dynamically)
            const addBtn = document.getElementById('addOcrMaskBtn');
            if (addBtn) {
                console.log('[OCR Masks] Add button found, registering click handler');
                // Use onclick to ensure only one handler
                addBtn.onclick = openAddOcrMaskModal;
            } else {
                console.warn('[OCR Masks] Add button NOT found');
            }
        });

        ocrMasksInitialized = true;
        console.log('[OCR Masks] Initialization complete');
    } else {
        console.error('[OCR Masks] OCR Masks tab NOT found');
    }
}

// Auto-initialize if DOM is already loaded (fallback)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        console.log('[OCR Masks] DOMContentLoaded - Attempting auto-init');
        // Try to initialize, but main initialization should come from imager-exam-config.js
        setTimeout(function() {
            if (document.getElementById('ocr-masks-tab')) {
                initializeOcrMasks();
            }
        }, 500);
    });
} else {
    console.log('[OCR Masks] DOM already loaded, attempting auto-init');
    setTimeout(function() {
        if (document.getElementById('ocr-masks-tab')) {
            initializeOcrMasks();
        }
    }, 500);
}
