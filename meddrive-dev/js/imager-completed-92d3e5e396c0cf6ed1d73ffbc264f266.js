/**
 * Imager Completed Dashboard (Step 4) JavaScript
 *
 * Responsabilidades:
 * - Configuração de colunas DataTable para Step 4
 * - Tree view de exames processados agrupados por paciente
 * - Funções de desaprovação (unapprove) de exames
 * - Visualização de resultados finalizados
 *
 * Convenção: Prefixo step4_ para funções públicas de tree
 */

// ========================================
// DATATABLE COLUMN CONFIGURATION
// ========================================

/**
 * Step 4 Column Configuration
 * Defines the DataTable columns for completed/processed exams
 */
const step4ColumnConfig = {
    title: 'Etapa 4 - Processados (Concluídos)',
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
            width: '22%',
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
            width: '18%',
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
        { data: 'nmMedico', title: 'Médico', defaultContent: '-', width: '11%', className: 'text-start' },
        {
            data: 'parentStatus',
            title: 'Status',
            defaultContent: '-',
            width: '11%',
            className: 'text-start',
            render: function(data, type, row) {
                if (type === 'display' && data) {
                    let statusText = 'Concluído';
                    let badgeClass = 'bg-success';

                    // Step 4 should only show completed items, but handle edge cases
                    switch(data) {
                        case 'COMPLETED':
                            statusText = 'Concluído';
                            badgeClass = 'bg-success';
                            break;
                        default:
                            statusText = data;
                            badgeClass = 'bg-secondary';
                    }

                    let badge = `<span class="badge ${badgeClass}">${statusText}</span>`;

                    // Add file count on second line
                    let fileCountFormatted = '';
                    if (row.actualFileCount !== undefined && row.expectedFileCount !== undefined) {
                        fileCountFormatted = `<br><small class="text-muted">Arquivos: ${row.actualFileCount}/${row.expectedFileCount}</small>`;
                    }

                    return `${badge}${fileCountFormatted}`;
                }
                return '-';
            }
        },
        {
            data: 'approvedAt',
            title: 'Aprovado',
            defaultContent: '-',
            width: '14%',
            className: 'text-start',
            render: function(data, type, row) {
                // For sorting/typing, return ISO string as-is (sorts by approval date/time)
                if (type === 'sort' || type === 'type') {
                    return data || '';
                }
                if (type !== 'display') {
                    return data || '';
                }

                // Line 1: approval date/time
                let dateFormatted = '-';
                if (data) {
                    try {
                        const date = new Date(data);
                        const day = String(date.getDate()).padStart(2, '0');
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const year = String(date.getFullYear()).slice(-2);
                        const hours = String(date.getHours()).padStart(2, '0');
                        const minutes = String(date.getMinutes()).padStart(2, '0');
                        dateFormatted = `${day}/${month}/${year} ${hours}:${minutes}`;
                    } catch (error) {
                        console.warn('Error formatting approvedAt:', data, error);
                    }
                }

                // Line 2: approved by (muted, secondary)
                const approvedByText = (row && row.approvedBy && String(row.approvedBy).trim())
                    ? row.approvedBy : '-';

                return `${dateFormatted}<br><small class="text-muted">${approvedByText}</small>`;
            }
        },
        {
            data: null,
            title: 'Ações',
            defaultContent: '',
            width: '14%',
            className: 'text-start',
            orderable: false,
            render: function(data, type, row) {
                if (type === 'display') {
                    const groupKey = row.groupKey || `${row.nrPrescricao}_${row.nrSeqPrescricao}_${row.dsProcesso}`;

                    let actionsHtml = `
                        <span class="tree-toggle" onclick="step4_toggleTreeNode('${groupKey}')">
                            <i class="fas fa-chevron-right" id="toggle-${groupKey}"></i>
                        </span>
                    `;

                    // Add view final file button for completed items, only if a consolidated file exists
                    if (row.step4ConsolidatedTasyFilePath) {
                        const filePathId = 'file-path-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                        actionsHtml += `
                            <button type="button" class="btn-icon-only ms-2 consolidated-file-btn"
                                   data-file-path-id="${filePathId}"
                                   title="Ver Arquivo Final Consolidado">
                                <i class="fas fa-eye"></i>
                            </button>
                        `;
                        // Store the file path separately to avoid escaping issues
                        window.consolidatedFilePaths = window.consolidatedFilePaths || {};
                        window.consolidatedFilePaths[filePathId] = row.step4ConsolidatedTasyFilePath;
                    }

                    // Add unapprove/delete button for the entire group
                    actionsHtml += `
                        <button type="button" class="btn-icon-only ms-2"
                               onclick="showUnapproveOrDeleteModal('${row.nrPrescricao}', '${row.nrSeqPrescricao}', '${row.dsProcesso}', ${row.configId || 'null'})"
                               title="Desaprovar ou Excluir">
                            <i class="fas fa-undo"></i>
                        </button>
                    `;

                    return actionsHtml;
                }
                return '-';
            }
        }
    ],
    endpoint: '/api/imager/processing-exams/ui/parent/completed',
    defaultOrder: [[0, 'desc']]  // Sort by orderDateTime desc (most recent prescription first)
};

// ========================================
// UNAPPROVE & DELETE OPERATIONS
// ========================================

/**
 * Show modal with options to Unapprove or Delete Completely
 * @param {string} nrPrescricao - Prescription number (placer)
 * @param {string} nrSeqPrescricao - Prescription sequence (filler)
 * @param {string} dsProcesso - Process name
 * @param {number} configId - Configuration ID
 */
function showUnapproveOrDeleteModal(nrPrescricao, nrSeqPrescricao, dsProcesso, configId) {
    // Textos e warnings sobre Tasy só aparecem quando HIS atual é Tasy.
    // Para AMPLIMED (não-Tasy) as ações afetam apenas dados locais — backend já gateia a procedure.
    const hisIsTasy = typeof isImagerHisTasy === 'function' ? isImagerHisTasy() : true;

    const unapproveDesc = hisIsTasy
        ? 'Volta status para aprovação pendente (WAITING),<br>verifica se todas as imagens existem e exclui do Tasy.<br><em>Arquivos locais são mantidos em /processing/</em>'
        : 'Volta status para aprovação pendente (WAITING).<br><em>Arquivos locais são mantidos em /processing/</em>';

    const deleteDesc = hisIsTasy
        ? 'Remove TUDO: banco de dados local, arquivos e Tasy.<br><em class="text-danger">Esta ação não pode ser desfeita!</em>'
        : 'Remove banco de dados local e arquivos.<br><em class="text-danger">Esta ação não pode ser desfeita!</em>';

    const tasyWarningHtml = hisIsTasy ? `
                        <div class="alert alert-warning">
                            <i class="fas fa-exclamation-triangle"></i>
                            <strong>Atenção:</strong> Em ambos os casos, os dados serão excluídos do Tasy!
                        </div>` : '';

    const modalHtml = `
        <div class="modal fade" id="unapproveOrDeleteModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-undo text-warning"></i>
                            Desaprovar ou Excluir Exame
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-info">
                            <strong>Dados do Exame:</strong><br>
                            <strong>Prescrição:</strong> ${nrPrescricao}<br>
                            <strong>Seq. Prescrição:</strong> ${nrSeqPrescricao}<br>
                            <strong>Processo:</strong> ${dsProcesso}
                        </div>

                        <div class="mb-3">
                            <div class="form-check mb-3">
                                <input class="form-check-input" type="radio" name="actionType"
                                       id="actionUnapprove" value="unapprove" checked>
                                <label class="form-check-label" for="actionUnapprove">
                                    <strong>🔄 Desfazer Aprovação</strong><br>
                                    <small class="text-muted">
                                        ${unapproveDesc}
                                    </small>
                                </label>
                            </div>

                            <div class="form-check">
                                <input class="form-check-input" type="radio" name="actionType"
                                       id="actionDelete" value="delete">
                                <label class="form-check-label" for="actionDelete">
                                    <strong>🗑️ Excluir Completamente</strong><br>
                                    <small class="text-muted">
                                        ${deleteDesc}
                                    </small>
                                </label>
                            </div>
                        </div>

                        ${tasyWarningHtml}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-primary" onclick="executeUnapproveOrDelete('${nrPrescricao}', '${nrSeqPrescricao}', ${configId})">
                            Confirmar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Remove modal antigo se existir
    $('#unapproveOrDeleteModal').remove();

    // Adiciona novo modal
    $('body').append(modalHtml);

    // Mostra modal
    const modal = new bootstrap.Modal(document.getElementById('unapproveOrDeleteModal'));
    modal.show();
}

/**
 * Execute the chosen action (Unapprove or Delete)
 * @param {string} nrPrescricao - Prescription number (placer)
 * @param {string} nrSeqPrescricao - Prescription sequence (filler)
 * @param {number} configId - Configuration ID
 */
function executeUnapproveOrDelete(nrPrescricao, nrSeqPrescricao, configId) {
    const actionType = $('input[name="actionType"]:checked').val();

    // Fecha modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('unapproveOrDeleteModal'));
    modal.hide();

    if (actionType === 'unapprove') {
        unapprovePatientGroup(nrPrescricao, nrSeqPrescricao, configId);
    } else {
        // Chama função global deletePatientGroup (está em imager.js)
        // Passa deleteTasyData = true para excluir do Tasy
        deletePatientGroup(nrPrescricao, nrSeqPrescricao, '', configId);
    }
}

/**
 * Unapprove exam group - calls /unapprove endpoint
 * Reverts status to WAITING_APPROVAL and removes from Tasy
 * @param {string} nrPrescricao - Prescription number (placer)
 * @param {string} nrSeqPrescricao - Prescription sequence (filler)
 * @param {number} configId - Configuration ID
 */
function unapprovePatientGroup(nrPrescricao, nrSeqPrescricao, configId) {
    const params = new URLSearchParams({
        nrPrescricao: nrPrescricao,
        nrSeqPrescricao: nrSeqPrescricao,
        configId: configId
    });

    fetch(`/api/imager/processing-exams/unapprove?${params}`, { method: 'PUT' })
        .then(response => {
            if (response.ok) {
                return response.json();
            } else {
                return response.json().then(data => {
                    throw new Error(data.message || 'Erro ao desfazer aprovação');
                });
            }
        })
        .then(data => {
            if (data.success) {
                showNotification(`${data.message} - ${data.itemsAffected} item(s) afetado(s).`, 'success');
                if (imagerWorklistTable) {
                    imagerWorklistTable.ajax.reload(null, false);
                }
                loadImagerStats();
            } else {
                showNotification('Erro ao desfazer aprovação: ' + data.message, 'error');
            }
        })
        .catch(error => {
            console.error('Error unapproving patient group:', error);
            showNotification('Erro ao desfazer aprovação: ' + error.message, 'error');
        });
}

// ========================================
// TREE VIEW OPERATIONS
// ========================================

/**
 * Toggle tree node expansion (Step 4 specific)
 * @param {string} groupKey - Unique identifier for the patient group
 */
function step4_toggleTreeNode(groupKey) {
    const toggleIcon = $(`#toggle-${groupKey}`);
    const isExpanded = toggleIcon.hasClass('fa-chevron-down');

    if (isExpanded) {
        // Collapse: remove child rows
        step4_collapseTreeNode(groupKey);
        toggleIcon.removeClass('fa-chevron-down').addClass('fa-chevron-right');
        if (typeof expandedTreeNodes !== 'undefined') {
            expandedTreeNodes.delete(groupKey);
        }
    } else {
        // Expand: add child rows
        step4_expandTreeNode(groupKey);
        toggleIcon.removeClass('fa-chevron-right').addClass('fa-chevron-down');
        if (typeof expandedTreeNodes !== 'undefined') {
            expandedTreeNodes.add(groupKey);
        }
    }
}

/**
 * Expand tree node to show child files (Step 4 specific)
 * @param {string} groupKey - Unique identifier for the patient group
 */
function step4_expandTreeNode(groupKey) {
    // Find the group data in the current table data
    if (typeof imagerWorklistTable === 'undefined') return;

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

    // Add child rows after the group row (Step 4 only - completed items)
    groupData.files.forEach((file, index) => {
        const isApproved = file.status === 'APPROVED';

        // For completed items, show the final file in patient path only if parent has no consolidated file
        let viewButton = '';
        if (!groupData.step4ConsolidatedTasyFilePath) {
            viewButton = `
                <button type="button" class="btn-icon-only"
                       onclick="openFinalProcessedFile(${file.id})"
                       title="Visualizar Arquivo Final">
                    <i class="fas fa-eye"></i>
                </button>
            `;
        }

        const childRowHtml = `
            <tr class="tree-child" data-group-key="${groupKey}" data-file-index="${index}" data-file-id="${file.id}">
                <td colspan="9" style="padding: 8px 20px; border-left: 3px solid #007bff;">
                    <div class="d-flex align-items-center w-100">
                        <div class="d-flex align-items-center me-auto">
                            <div class="me-3" style="width: 16px;"></div>
                            <i class="fas fa-file-pdf text-primary me-3"></i>
                            <div class="d-flex flex-column me-3">
                                <span class="fw-medium text-dark" style="word-break: break-all;">${file.nmArquivo || 'Arquivo sem nome'}</span>
                                <small class="text-muted">
                                    ${file.step4ErrorMessage ?
                                        `<i class="fas fa-exclamation-triangle text-danger me-1"></i>${file.step4ErrorMessage}` :
                                        'Arquivo processado'
                                    }
                                </small>
                            </div>
                        </div>
                        <div class="d-flex align-items-center gap-2 flex-shrink-0" style="margin-right: 150px;">
                            <span>
                                ${typeof getFileStatusText === 'function' ? getFileStatusText(file.step4Status) : file.step4Status}
                            </span>
                            ${isApproved ?
                                '<span>Aprovado</span>' :
                                ''
                            }
                            ${viewButton}
                            <button type="button" class="btn-icon-only"
                                   onclick="viewMatchQueryConditions(${file.id})"
                                   title="Ver Condições de Match">
                                <i class="fas fa-search"></i>
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
 * Collapse tree node to hide child files (Step 4 specific)
 * @param {string} groupKey - Unique identifier for the patient group
 */
function step4_collapseTreeNode(groupKey) {
    $(`.tree-child[data-group-key="${groupKey}"]`).remove();
}

// ========================================
// EXPORTS (window object)
// ========================================

// DataTable configuration
window.step4ColumnConfig = step4ColumnConfig;

// Unapprove & delete operations
window.showUnapproveOrDeleteModal = showUnapproveOrDeleteModal;
window.executeUnapproveOrDelete = executeUnapproveOrDelete;
window.unapprovePatientGroup = unapprovePatientGroup;

// Tree view operations
window.step4_toggleTreeNode = step4_toggleTreeNode;
window.step4_expandTreeNode = step4_expandTreeNode;
window.step4_collapseTreeNode = step4_collapseTreeNode;

// ========================================
// MODULE LOADED CONFIRMATION
// ========================================
console.log('imager-completed.js loaded successfully');
