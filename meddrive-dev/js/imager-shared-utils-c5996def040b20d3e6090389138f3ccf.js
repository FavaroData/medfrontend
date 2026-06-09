// ================================================================================
// IMAGER SHARED UTILITIES
// ================================================================================
// This file contains shared utility functions used by both exam and repository
// configuration modules, including modal management, alerts, and relationship management

// ================================================================================
// HIS TYPE HELPERS
// ================================================================================

/**
 * Lê o HIS atual do data-attribute injetado pelo fragmento imager-dashboard.html.
 * O backend (ImagerViewController) injeta data-imager-his-type no root do fragmento.
 *
 * Usa querySelector porque o fragmento é renderizado dentro do #mainDashboardContent
 * externo do dashboard.html (gera dois elementos com o mesmo id) — o atributo único
 * data-imager-his-type marca o root interno especificamente.
 *
 * Retorna string em maiúsculas (TASY_JAVA / TASY_HTML5 / AMPLIMED) ou '' se não disponível.
 */
function getImagerHisType() {
    const container = document.querySelector('[data-imager-his-type]');
    const value = container && container.dataset ? container.dataset.imagerHisType : '';
    return (value || '').toString().toUpperCase();
}

/**
 * true quando o HIS atual é uma variante Tasy (TASY_JAVA ou TASY_HTML5).
 * Usado para gatear UI/ações específicas de Tasy (checkbox "Excluir do Tasy", warnings, etc.).
 */
function isImagerHisTasy() {
    return getImagerHisType().startsWith('TASY');
}

// ================================================================================
// MODAL MANAGEMENT UTILITIES
// ================================================================================

/**
 * Show a Bootstrap modal
 * @param {string} modalId - The ID of the modal element to show
 */
function showModal(modalId) {
    console.log('showModal called with:', modalId);

    try {
        const modalElement = document.getElementById(modalId);
        console.log('Modal element found:', modalElement);

        if (modalElement) {
            if (window.bootstrap && window.bootstrap.Modal) {
                console.log('Using Bootstrap 5 Modal');
                const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
                modal.show();
            } else {
                console.log('Using jQuery modal fallback');
                // Fallback to jQuery if Bootstrap 5 is not available
                $('#' + modalId).modal('show');
            }
        } else {
            console.error('Modal element not found:', modalId);
        }
    } catch (error) {
        console.error('Error showing modal:', modalId, error);
        // Fallback to jQuery
        console.log('Trying jQuery fallback');
        $('#' + modalId).modal('show');
    }
}

/**
 * Hide a Bootstrap modal
 * @param {string} modalId - The ID of the modal element to hide
 */
function hideModal(modalId) {
    try {
        const modalElement = document.getElementById(modalId);
        if (modalElement) {
            if (window.bootstrap && window.bootstrap.Modal) {
                const modal = bootstrap.Modal.getInstance(modalElement);
                if (modal) {
                    modal.hide();
                }
            } else {
                // Fallback to jQuery if Bootstrap 5 is not available
                $('#' + modalId).modal('hide');
            }
        }
    } catch (error) {
        console.error('Error hiding modal:', modalId, error);
        // Fallback to jQuery
        $('#' + modalId).modal('hide');
    }
}

// ================================================================================
// ALERT/NOTIFICATION UTILITIES
// ================================================================================
// showAlert() and showNotification() are defined in ui-utils.js (loaded before this file).
// That implementation auto-dismisses ALL alert types after 5s by default, which is
// critical for polling errors during server restart — otherwise error alerts would
// persist on the page until manual browser refresh.

// ========================================================================================
// EXAM-REPOSITORY RELATIONSHIP MANAGEMENT
// ========================================================================================

/**
 * Open modal to manage repositories for an exam configuration - with better error handling
 * @param {number} examConfigId - The exam configuration ID
 * @param {string} examName - The exam name for display
 */
function manageExamRepositories(examConfigId, examName) {
    // Wait a bit and try again if elements are not found
    const tryOpenModal = (attempts = 0) => {
        const examConfigIdEl = document.getElementById('currentExamConfigId');
        const examNameEl = document.getElementById('examRepoProcessName');
        const modalEl = document.getElementById('manageExamReposModal');

        if (!examConfigIdEl || !examNameEl || !modalEl) {
            if (attempts < 3) {
                console.log(`Exam repositories modal elements not ready, retrying... (attempt ${attempts + 1})`);
                setTimeout(() => tryOpenModal(attempts + 1), 100);
                return;
            }
            console.error('Manage repositories modal elements not found in DOM after retries');
            console.error('currentExamConfigId:', examConfigIdEl);
            console.error('examRepoProcessName:', examNameEl);
            console.error('manageExamReposModal:', modalEl);
            return;
        }

        examConfigIdEl.value = examConfigId;
        examNameEl.textContent = examName;

        // Load available and assigned repositories
        loadAvailableRepositories(examConfigId);
        loadAssignedRepositories(examConfigId);

        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    };

    tryOpenModal();
}

/**
 * Load available repositories for assignment
 * @param {number} examConfigId - The exam configuration ID
 */
function loadAvailableRepositories(examConfigId) {
    Promise.all([
        fetch('/api/imager/repositories').then(r => r.json()),
        fetch(`/api/imager/exam-config/${examConfigId}/repositories`).then(r => r.json())
    ])
    .then(([allRepos, assignedRepos]) => {
        const assignedRepoIds = assignedRepos.map(ar => ar.fileRepository.id);
        const availableRepos = allRepos.filter(repo => !assignedRepoIds.includes(repo.id) && repo.enabled);

        const select = document.getElementById('availableRepositorySelect');
        select.innerHTML = '<option value="">Selecione um repositório...</option>';

        availableRepos.forEach(repo => {
            const option = document.createElement('option');
            option.value = repo.id;
            option.textContent = `${repo.name} (${repo.sourcePath})`;
            select.appendChild(option);
        });
    })
    .catch(error => {
        console.error('Error loading available repositories:', error);
        showNotification('Erro ao carregar repositórios disponíveis', 'error');
    });
}

/**
 * Load assigned repositories for an exam
 * @param {number} examConfigId - The exam configuration ID
 */
function loadAssignedRepositories(examConfigId) {
    fetch(`/api/imager/exam-config/${examConfigId}/repositories`)
        .then(response => response.json())
        .then(assignments => {
            const tbody = document.querySelector('#assignedReposTable tbody');
            const noReposMsg = document.getElementById('noReposMessage');

            tbody.innerHTML = '';

            if (assignments.length === 0) {
                noReposMsg.style.display = 'block';
                document.querySelector('#assignedReposTable').style.display = 'none';
            } else {
                noReposMsg.style.display = 'none';
                document.querySelector('#assignedReposTable').style.display = 'table';

                assignments.forEach(assignment => {
                    const repo = assignment.fileRepository;
                    const row = `
                        <tr>
                            <td class="text-center">
                                ${assignment.displayOrder || 0}
                            </td>
                            <td>${repo.name}</td>
                            <td><small class="text-muted">${repo.sourcePath}</small></td>
                            <td>
                                ${assignment.enabled ? 'Ativo' : 'Inativo'}
                            </td>
                            <td>
                                <button class="btn-icon-only"
                                        onclick="unassignRepositoryFromExam(${examConfigId}, ${repo.id})"
                                        title="Remover">
                                    <i class="fas fa-times"></i>
                                </button>
                            </td>
                        </tr>
                    `;
                    tbody.innerHTML += row;
                });
            }
        })
        .catch(error => {
            console.error('Error loading assigned repositories:', error);
            showNotification('Erro ao carregar repositórios associados', 'error');
        });
}

/**
 * Assign repository to exam configuration
 */
function assignRepositoryToExam() {
    const examConfigId = document.getElementById('currentExamConfigId').value;
    const repoId = document.getElementById('availableRepositorySelect').value;

    if (!repoId) {
        showNotification('Selecione um repositório', 'warning');
        return;
    }

    fetch(`/api/imager/config/${examConfigId}/repositories/${repoId}`, {
        method: 'POST'
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => Promise.reject(err));
        }
        return response.json();
    })
    .then(() => {
        loadAvailableRepositories(examConfigId);
        loadAssignedRepositories(examConfigId);
        showNotification('Repositório associado com sucesso', 'success');
    })
    .catch(error => {
        console.error('Error assigning repository:', error);
        showNotification(error.error || 'Erro ao associar repositório', 'error');
    });
}

/**
 * Unassign repository from exam configuration
 * @param {number} examConfigId - The exam configuration ID
 * @param {number} repoId - The repository ID to unassign
 */
function unassignRepositoryFromExam(examConfigId, repoId) {
    if (!confirm('Tem certeza que deseja remover este repositório desta configuração de exame?')) {
        return;
    }

    fetch(`/api/imager/config/${examConfigId}/repositories/${repoId}`, {
        method: 'DELETE'
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => Promise.reject(err));
        }
        return response.json();
    })
    .then(() => {
        loadAvailableRepositories(examConfigId);
        loadAssignedRepositories(examConfigId);
        showNotification('Repositório removido com sucesso', 'success');
    })
    .catch(error => {
        console.error('Error unassigning repository:', error);
        showNotification(error.error || 'Erro ao remover repositório', 'error');
    });
}

// ================================================================================
// EXPORT FUNCTIONS FOR GLOBAL ACCESS
// ================================================================================

window.showModal = showModal;
window.hideModal = hideModal;
window.showAlert = showAlert;
window.showNotification = showNotification;
window.manageExamRepositories = manageExamRepositories;
window.loadAvailableRepositories = loadAvailableRepositories;
window.loadAssignedRepositories = loadAssignedRepositories;
window.assignRepositoryToExam = assignRepositoryToExam;
window.unassignRepositoryFromExam = unassignRepositoryFromExam;
