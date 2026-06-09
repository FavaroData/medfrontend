/**
 * Imager Approval Dashboard (Step 3) JavaScript
 * Handles functionality for processing queue and approval
 */

/**
 * Delete entire patient group from processing queue (Step 3 specific)
 */
function step3_deletePatientGroup(nrPrescricao, nrSeqPrescricao, dsProcesso, configId) {
    // If configId is not provided, show error
    if (!configId) {
        if (typeof showNotification === 'function') {
            showNotification('Erro: ID da configuração não encontrado', 'error');
        }
        return;
    }

    // Delegate to shared confirmation dialog function
    if (typeof showDeleteConfirmationDialog === 'function') {
        showDeleteConfirmationDialog(nrPrescricao, nrSeqPrescricao, dsProcesso, configId);
    }
}

/**
 * Approve patient group for step 4 processing (Step 3 specific)
 * NOTE: This function is no longer called from the UI (button removed).
 * Approval is now done exclusively via the approval-review modal.
 * Keeping this function for potential future use or backwards compatibility.
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
 * Toggle tree node expansion (Step 3 specific)
 */
function step3_toggleTreeNode(groupKey) {
    const toggleIcon = $(`#toggle-${groupKey}`);
    const isExpanded = toggleIcon.hasClass('fa-chevron-down');

    const expandedTreeNodes = typeof window.expandedTreeNodes !== 'undefined' ? window.expandedTreeNodes : new Set();

    if (isExpanded) {
        // Collapse: remove child rows
        step3_collapseTreeNode(groupKey);
        toggleIcon.removeClass('fa-chevron-down').addClass('fa-chevron-right');
        expandedTreeNodes.delete(groupKey);
    } else {
        // Expand: add child rows
        step3_expandTreeNode(groupKey);
        toggleIcon.removeClass('fa-chevron-right').addClass('fa-chevron-down');
        expandedTreeNodes.add(groupKey);
    }
}

/**
 * Expand tree node to show child files (Step 3 specific)
 */
function step3_expandTreeNode(groupKey) {
    // Find the group data in the current table data
    if (typeof imagerWorklistTable === 'undefined' || !imagerWorklistTable) return;

    const tableData = imagerWorklistTable.data();
    let groupData = null;

    tableData.each(function(row) {
        if (row.groupKey === groupKey) {
            groupData = row;
            return false; // break
        }
    });

    if (!groupData || !groupData.files || groupData.files.length === 0) {
        return;
    }

    // Find the row in the DOM
    const groupRow = $(`#toggle-${groupKey}`).closest('tr');

    // Add child rows after the group row (Step 3 only)
    groupData.files.forEach((file, index) => {
        const isApproved = file.status === 'APPROVED';
        const isWaiting = file.status === 'WAITING';

        // For step 3, show the queue file
        const viewButton = `
            <button type="button" class="btn-icon-only"
                   onclick="openProcessingQueuePdfFile(${file.id})"
                   title="Visualizar PDF">
                <i class="fas fa-eye"></i>
            </button>
        `;

        const formatDateTime = typeof window.formatDateTime === 'function' ? window.formatDateTime : (dt) => dt;
        const getFileStatusClass = typeof window.getFileStatusClass === 'function' ? window.getFileStatusClass : () => '';
        const getFileStatusText = typeof window.getFileStatusText === 'function' ? window.getFileStatusText : (status) => status;

        const childRowHtml = `
            <tr class="tree-child" data-group-key="${groupKey}" data-file-index="${index}" data-file-id="${file.id}">
                <td colspan="8" style="padding: 8px 20px; border-left: 3px solid #007bff;">
                    <div class="d-flex align-items-center w-100">
                        <div class="d-flex align-items-center me-auto">
                            <i class="fas fa-file-pdf text-primary me-3"></i>
                            <div class="d-flex flex-column me-3">
                                <span class="fw-medium text-dark" style="word-break: break-all;">${file.nmArquivo || 'Arquivo sem nome'}</span>
                                <small class="text-muted">
                                    ${file.step4ErrorMessage ?
                                        `<i class="fas fa-exclamation-triangle text-danger me-1"></i>${file.step4ErrorMessage}` :
                                        (file.createdAt ? `Vinculado em ${formatDateTime(file.createdAt)}` : 'Arquivo PDF do exame')
                                    }
                                </small>
                            </div>
                        </div>
                        <div class="d-flex align-items-center gap-2 flex-shrink-0" style="margin-right: 150px;">
                            <span>
                                ${getFileStatusText(file.step4Status)}
                            </span>
                            ${isApproved ?
                                '<span>Aprovado</span>' :
                                isWaiting ?
                                    '<span>Aguardando</span>' :
                                    ''
                            }
                            ${viewButton}
                            <button type="button" class="btn-icon-only"
                                   onclick="viewMatchQueryConditions(${file.id})"
                                   title="Ver Condições de Match">
                                <i class="fas fa-search"></i>
                            </button>
                            <button type="button" class="btn-icon-only"
                                   onclick="showDeleteItemModal(${file.id})"
                                   title="Excluir Item">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </div>
                </td>
            </tr>
        `;

        groupRow.after(childRowHtml);
    });
}

/**
 * Collapse tree node to hide child files (Step 3 specific)
 */
function step3_collapseTreeNode(groupKey) {
    $(`.tree-child[data-group-key="${groupKey}"]`).remove();
}

// Export Step 3 specific functions to window
window.step3_deletePatientGroup = step3_deletePatientGroup;
window.step3_approvePatientGroup = step3_approvePatientGroup;
window.step3_toggleTreeNode = step3_toggleTreeNode;
window.step3_expandTreeNode = step3_expandTreeNode;
window.step3_collapseTreeNode = step3_collapseTreeNode;

console.log('imager-approval.js loaded successfully');
