/**
 * Imager Files Dashboard (Step 2) JavaScript
 *
 * Responsabilidades:
 * - Gerenciamento de seleção de documentos (checkboxes)
 * - Estado de manual matching (selectedDocumentIds, selectedExam)
 * - Funções de manipulação de arquivos (abrir PDF, arquivar)
 * - Controle de visibilidade do botão "Vincular Manualmente"
 *
 * Convenção: Step 2 NÃO usa prefixo step2_ (nomes específicos suficientes)
 */

// ========================================
// STATE (Step 2 Ownership)
// ========================================
let selectedDocumentIds = new Set();  // IDs de documentos selecionados
let manualMatchButton = null;         // Referência ao botão de matching manual
let selectedExam = null;              // Exame selecionado para vinculação

// ========================================
// FILE OPERATIONS
// ========================================

/**
 * Open PDF file from step 2 (creates temporary copy)
 * @param {number} fileId - ID do arquivo a ser aberto
 */
function openPdfFile(fileId) {
    if (!fileId) {
        if (typeof showNotification === 'function') {
            showNotification('ID do arquivo não encontrado', 'error');
        }
        return;
    }

    // Create a safe URL for the PDF file (uses temporary copy)
    const pdfUrl = `/api/imager/exam-documents/${fileId}/view`;

    // Try to open the PDF in a new window/tab
    try {
        const newWindow = window.open(pdfUrl, '_blank');
        if (!newWindow) {
            // If popup was blocked, show alternative
            if (typeof showNotification === 'function') {
                showNotification('Pop-ups bloqueados. Por favor, permita pop-ups para este site e tente novamente.', 'warning');
            }
        } else {
            if (typeof showNotification === 'function') {
                showNotification('PDF aberto em nova aba (cópia temporária para evitar interferência no processamento)', 'info');
            }
        }
    } catch (error) {
        console.error('Error opening PDF:', error);
        if (typeof showNotification === 'function') {
            showNotification('Erro ao abrir PDF: ' + error.message, 'error');
        }
    }
}

/**
 * Archive/delete a document from step 2
 * @param {number} documentId - ID do documento a ser arquivado
 * @param {string} fileName - Nome do arquivo (para confirmação)
 */
function archiveDocument(documentId, fileName) {
    if (!documentId) {
        if (typeof showNotification === 'function') {
            showNotification('ID do documento não encontrado', 'error');
        }
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
        if (typeof showNotification === 'function') {
            showNotification(data.message || 'Documento arquivado com sucesso', 'success');
        }
        // Refresh the table
        if (typeof imagerWorklistTable !== 'undefined' && imagerWorklistTable) {
            imagerWorklistTable.ajax.reload();
        }
        // Refresh stats
        if (typeof loadImagerStats === 'function') {
            loadImagerStats();
        }
    })
    .catch(error => {
        console.error('Error archiving document:', error);
        if (typeof showNotification === 'function') {
            showNotification('Erro ao arquivar documento: ' + error.message, 'error');
        }
    });
}

// ========================================
// SELECTION HANDLING
// ========================================

/**
 * Handle individual document selection (Step 2)
 * @param {Event} e - Event object from checkbox change
 */
function handleDocumentSelection(e) {
    const checkbox = $(e.target);
    const documentId = checkbox.data('document-id');

    if (checkbox.is(':checked')) {
        selectedDocumentIds.add(documentId);
    } else {
        selectedDocumentIds.delete(documentId);
        // Uncheck select all if any item is unchecked
        $('#select-all-documents').prop('checked', false);
    }

    updateManualMatchButtonVisibility();
    updateSelectionCount();
}

/**
 * Handle select all checkbox (Step 2)
 * @param {Event} e - Event object from checkbox change
 */
function handleSelectAll(e) {
    const isChecked = $(e.target).is(':checked');

    if (isChecked) {
        // Select all visible checkboxes
        $('.document-select-checkbox:visible').each(function() {
            const checkbox = $(this);
            const documentId = checkbox.data('document-id');
            selectedDocumentIds.add(documentId);
            checkbox.prop('checked', true);
        });
    } else {
        // Deselect all
        selectedDocumentIds.clear();
        $('.document-select-checkbox').prop('checked', false);
    }

    updateManualMatchButtonVisibility();
    updateSelectionCount();
}

// ========================================
// UI UPDATE FUNCTIONS
// ========================================

/**
 * Update manual match button visibility (Step 2)
 * Shows button only if documents selected, in step2, AND exam filter selected
 */
function updateManualMatchButtonVisibility() {
    if (!manualMatchButton) return;

    const currentStep = typeof window.currentStep !== 'undefined' ? window.currentStep : null;
    const currentExam = typeof window.currentExam !== 'undefined' ? window.currentExam : null;

    console.log('UpdateManualMatchButtonVisibility called:', {
        selectedCount: selectedDocumentIds.size,
        currentStep: currentStep,
        currentExam: currentExam
    });

    // Check if we have both selected documents, are in step2, AND have an exam filter selected
    if (selectedDocumentIds.size > 0 && currentStep === 'step2' && currentExam) {
        // Show button
        manualMatchButton.css('display', 'block');

        // Update button text with count
        const text = selectedDocumentIds.size === 1
            ? 'Vincular Manualmente (1 arquivo)'
            : `Vincular Manualmente (${selectedDocumentIds.size} arquivos)`;

        manualMatchButton.html(`<i class="bi bi-link-45deg"></i> ${text}`);

        // Check for max documents
        if (selectedDocumentIds.size > 50) {
            manualMatchButton.prop('disabled', true)
                  .removeClass('btn-primary')
                  .addClass('btn-secondary')
                  .attr('title', 'Máximo de 50 documentos por vinculação');
        } else {
            manualMatchButton.prop('disabled', false)
                  .removeClass('btn-secondary')
                  .addClass('btn-primary')
                  .attr('title', 'Vincular documentos selecionados manualmente');
        }
    } else {
        // Hide button
        manualMatchButton.css('display', 'none');
    }
}

/**
 * Update selection count display (Step 2)
 */
function updateSelectionCount() {
    const countElement = $('#selection-count');
    if (countElement.length) {
        if (selectedDocumentIds.size > 0) {
            countElement.text(`${selectedDocumentIds.size} arquivo(s) selecionado(s)`).show();
        } else {
            countElement.hide();
        }
    }
}

/**
 * Clear manual matching selections (Step 2)
 * Resets all selection state and UI
 */
function clearManualMatchingSelections() {
    selectedDocumentIds.clear();
    if (typeof window.selectedExam !== 'undefined') {
        window.selectedExam = null;
    }
    $('.document-select-checkbox').prop('checked', false);
    $('#select-all-documents').prop('checked', false);
    updateManualMatchButtonVisibility();
    updateSelectionCount();
}

// ========================================
// EXPORTS (window object)
// ========================================

// State variables (read/write by other modules)
window.selectedDocumentIds = selectedDocumentIds;
window.manualMatchButton = manualMatchButton;
window.selectedExam = selectedExam;

// File operations
window.openPdfFile = openPdfFile;
window.archiveDocument = archiveDocument;

// Selection handlers
window.handleDocumentSelection = handleDocumentSelection;
window.handleSelectAll = handleSelectAll;

// UI update functions
window.updateManualMatchButtonVisibility = updateManualMatchButtonVisibility;
window.updateSelectionCount = updateSelectionCount;
window.clearManualMatchingSelections = clearManualMatchingSelections;

// ========================================
// MODULE LOADED CONFIRMATION
// ========================================
console.log('imager-files.js loaded successfully');
