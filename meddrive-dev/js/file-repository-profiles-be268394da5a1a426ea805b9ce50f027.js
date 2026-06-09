/**
 * File Repository Profiles - OCR Configuration per Wildcard
 * Manages FileRepositoryProfile entities for different filename patterns within a repository
 *
 * USES: Meddrive DataTables Componentization System
 * - datatables-config.js for consistent configuration
 * - datatables-renderers.js for consistent column rendering
 */

let currentRepositoryId = null;
let currentEditingProfileId = null;
let profilesTable = null;
let availableOcrMasks = []; // Cache of available OCR masks

/**
 * Load and display profiles for a repository
 */
function loadRepositoryProfiles(repositoryId) {
    currentRepositoryId = repositoryId;

    fetch(`/api/imager/repositories/${repositoryId}/profiles`)
        .then(response => response.json())
        .then(profiles => {
            initializeProfilesTable(profiles);
        })
        .catch(error => {
            console.error('Error loading profiles:', error);
            showProfileAlert('Erro ao carregar perfis: ' + error.message, 'danger');
        });
}

/**
 * Initialize DataTable for profiles
 */
function initializeProfilesTable(profiles) {
    // Destroy existing table if present
    if (profilesTable) {
        try {
            profilesTable.destroy();
        } catch (e) {
            console.warn('Error destroying profiles table:', e);
        }
        profilesTable = null;
    }

    // Use compact configuration from datatables-config.js
    const config = window.MeddriveDataTables.configs.compact({
        data: profiles,
        columns: [
            {
                data: null,
                title: 'Nome / Descrição',
                width: '25%',
                render: window.MeddriveRenderers.titleSubtitle('name', 'description')
            },
            {
                data: null,
                title: 'Wildcards',
                width: '25%',
                render: window.MeddriveRenderers.codeWithExclusion('inclusionWildcard', 'exclusionWildcard')
            },
            {
                data: 'priority',
                title: 'Prioridade',
                width: '15%',
                className: 'text-center'
            },
            {
                data: 'enabled',
                title: 'Status',
                width: '15%',
                className: 'text-center',
                render: window.MeddriveRenderers.status
            },
            {
                data: null,
                title: 'Ações',
                width: '20%',
                orderable: false,
                className: 'text-end',
                render: window.MeddriveRenderers.standardActions({
                    editFn: 'editProfile',
                    toggleFn: 'toggleProfileStatus',
                    deleteFn: 'deleteProfile'
                })
            }
        ],
        order: [[2, 'asc']], // Order by priority
        language: {
            emptyTable: '<i class="fas fa-info-circle me-2"></i>Nenhum perfil configurado. As configurações padrão do repositório serão usadas para todos os arquivos.'
        }
    });

    // Initialize table using helper from datatables-config.js
    profilesTable = window.MeddriveDataTables.init('#ocrProfilesTable', config);
}

/**
 * Load available OCR masks and populate select
 */
function loadOcrMasksIntoSelect(selectedMaskId = null) {
    fetch('/api/imager/masks')
        .then(response => response.json())
        .then(masks => {
            availableOcrMasks = masks;
            const select = document.getElementById('profileOcrMask');
            if (!select) return;

            // Clear existing options except first
            select.innerHTML = '<option value="">Nenhuma máscara</option>';

            // Add mask options
            masks.forEach(mask => {
                const option = document.createElement('option');
                option.value = mask.id;

                // Parse masks to get region count
                let regionCount = 0;
                try {
                    const regions = JSON.parse(mask.masks || '[]');
                    regionCount = regions.length;
                } catch (e) {
                    regionCount = 0;
                }

                option.textContent = `${mask.name} (${regionCount} ${regionCount !== 1 ? 'regiões' : 'região'})`;

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
 * Open add profile modal
 */
function openAddProfileModal() {
    if (!currentRepositoryId) {
        showProfileAlert('Selecione um repositório primeiro', 'warning');
        return;
    }

    currentEditingProfileId = null;
    document.getElementById('profileModalTitle').textContent = 'Adicionar Perfil OCR';
    document.getElementById('profileForm').reset();

    // Set defaults
    document.getElementById('profileUseIntelligentExtraction').checked = true;
    document.getElementById('profileOcrDpi').value = 300;
    document.getElementById('profileOcrPageSegMode').value = 3;
    document.getElementById('profileOcrEngineMode').value = 1;
    document.getElementById('profileTextExtractionMinChars').value = 10;
    document.getElementById('profileOcrTextordMinLinesize').value = 2.5;
    document.getElementById('profileVerticalTextThreshold').value = 0.05;
    document.getElementById('profileOcrDisableInvert').checked = true;

    // Advanced preprocessing defaults
    document.getElementById('profileUnsharpMaskEnabled').checked = false;
    document.getElementById('profileUnsharpMaskSigma').value = 2.0;
    document.getElementById('profileUnsharpMaskAmount').value = 1.5;
    document.getElementById('profileContrastStretchingEnabled').checked = true;
    document.getElementById('profileContrastBlackThreshold').value = 110;
    document.getElementById('profileContrastWhiteThreshold').value = '';

    // Load available OCR masks
    loadOcrMasksIntoSelect();

    // Use Bootstrap's modal API directly without creating new instance
    const profileModalElement = document.getElementById('profileModal');
    const modal = bootstrap.Modal.getOrCreateInstance(profileModalElement);
    modal.show();
}

/**
 * Edit existing profile
 */
function editProfile(profileId) {
    fetch(`/api/imager/profiles/${profileId}`)
        .then(response => response.json())
        .then(profile => {
            currentEditingProfileId = profileId;
            document.getElementById('profileModalTitle').textContent = 'Editar Perfil OCR';

            // Populate form
            document.getElementById('profileName').value = profile.name || '';
            document.getElementById('profileDescription').value = profile.description || '';
            document.getElementById('profileInclusionWildcard').value = profile.inclusionWildcard || '';
            document.getElementById('profileExclusionWildcard').value = profile.exclusionWildcard || '';
            document.getElementById('profileEnabled').checked = profile.enabled;

            // OCR settings
            document.getElementById('profileOcrEnabled').checked = profile.ocrEnabled;
            document.getElementById('profileOcrDpi').value = profile.ocrDpi || 300;
            document.getElementById('profileExtractFirstPageOnly').checked = profile.extractFirstPageOnly;
            document.getElementById('profileOcrPageSegMode').value = profile.ocrPageSegMode || 3;
            document.getElementById('profileOcrEngineMode').value = profile.ocrEngineMode || 1;
            document.getElementById('profileOcrCharWhitelist').value = profile.ocrCharWhitelist || '';
            document.getElementById('profileOcrCharBlacklist').value = profile.ocrCharBlacklist || '';
            document.getElementById('profileOcrOptimizedForNumbers').checked = profile.ocrOptimizedForNumbers;
            document.getElementById('profileOcrSkipImagePreprocessing').checked = profile.ocrSkipImagePreprocessing;
            document.getElementById('profileOcrTextordMinLinesize').value = profile.ocrTextordMinLinesize || 2.5;
            document.getElementById('profileOcrDisableInvert').checked = profile.ocrDisableInvert !== false;
            document.getElementById('profileOcrDebugSaveImages').checked = profile.ocrDebugSaveImages;
            document.getElementById('profileDenoiseStrength').value = profile.denoiseStrength || 0;

            // Advanced preprocessing
            document.getElementById('profileUnsharpMaskEnabled').checked = profile.unsharpMaskEnabled === true;
            document.getElementById('profileUnsharpMaskSigma').value = profile.unsharpMaskSigma !== null && profile.unsharpMaskSigma !== undefined ? profile.unsharpMaskSigma : 2.0;
            document.getElementById('profileUnsharpMaskAmount').value = profile.unsharpMaskAmount !== null && profile.unsharpMaskAmount !== undefined ? profile.unsharpMaskAmount : 1.5;
            document.getElementById('profileContrastStretchingEnabled').checked = profile.contrastStretchingEnabled !== false; // Default true
            document.getElementById('profileContrastBlackThreshold').value = profile.contrastBlackThreshold !== null && profile.contrastBlackThreshold !== undefined ? profile.contrastBlackThreshold : 110;
            document.getElementById('profileContrastWhiteThreshold').value = profile.contrastWhiteThreshold !== null && profile.contrastWhiteThreshold !== undefined ? profile.contrastWhiteThreshold : '';

            document.getElementById('profileUseIntelligentExtraction').checked = profile.useIntelligentExtraction !== false;
            document.getElementById('profileTextExtractionMinChars').value = profile.textExtractionMinChars || 10;
            document.getElementById('profileAutoCorrectPdfRotation').checked = profile.autoCorrectPdfRotation;
            document.getElementById('profileVerticalTextThreshold').value = profile.verticalTextThreshold || 0.05;
            document.getElementById('profilePdfMinSizeKb').value = profile.pdfMinSizeKb || 0;

            // Load OCR masks into select and set current value
            loadOcrMasksIntoSelect(profile.ocrMaskId);

            // Use Bootstrap's modal API directly without creating new instance
            const profileModalElement = document.getElementById('profileModal');
            const modal = bootstrap.Modal.getOrCreateInstance(profileModalElement);
            modal.show();
        })
        .catch(error => {
            console.error('Error loading profile:', error);
            showProfileAlert('Erro ao carregar perfil: ' + error.message, 'danger');
        });
}

/**
 * Save profile (create or update)
 */
function saveProfile() {
    const formData = new FormData(document.getElementById('profileForm'));

    const profileData = {
        name: formData.get('name'),
        description: formData.get('description'),
        inclusionWildcard: formData.get('inclusionWildcard'),
        exclusionWildcard: formData.get('exclusionWildcard'),
        enabled: formData.get('enabled') === 'on',

        // OCR Configuration
        ocrEnabled: formData.get('ocrEnabled') === 'on',
        ocrDpi: parseInt(formData.get('ocrDpi')) || 300,
        extractFirstPageOnly: formData.get('extractFirstPageOnly') === 'on',
        ocrPageSegMode: parseInt(formData.get('ocrPageSegMode')) || 3,
        ocrEngineMode: parseInt(formData.get('ocrEngineMode')) || 1,
        ocrCharWhitelist: formData.get('ocrCharWhitelist') || null,
        ocrCharBlacklist: formData.get('ocrCharBlacklist') || null,
        ocrOptimizedForNumbers: formData.get('ocrOptimizedForNumbers') === 'on',
        ocrSkipImagePreprocessing: formData.get('ocrSkipImagePreprocessing') === 'on',
        ocrTextordMinLinesize: parseFloat(formData.get('ocrTextordMinLinesize')) || 2.5,
        ocrDisableInvert: formData.get('ocrDisableInvert') === 'on',
        ocrDebugSaveImages: formData.get('ocrDebugSaveImages') === 'on',
        denoiseStrength: parseInt(formData.get('denoiseStrength')) || 0,

        // OCR Mask reference
        ocrMaskId: formData.get('ocrMaskId') ? parseInt(formData.get('ocrMaskId')) : null,

        // Advanced preprocessing
        unsharpMaskEnabled: formData.get('unsharpMaskEnabled') === 'on',
        unsharpMaskSigma: parseFloat(formData.get('unsharpMaskSigma')) || 2.0,
        unsharpMaskAmount: parseFloat(formData.get('unsharpMaskAmount')) || 1.5,
        contrastStretchingEnabled: formData.get('contrastStretchingEnabled') === 'on',
        contrastBlackThreshold: parseInt(formData.get('contrastBlackThreshold')) || 110,
        contrastWhiteThreshold: formData.get('contrastWhiteThreshold') ? parseInt(formData.get('contrastWhiteThreshold')) : null,

        useIntelligentExtraction: formData.get('useIntelligentExtraction') === 'on',
        textExtractionMinChars: parseInt(formData.get('textExtractionMinChars')) || 10,
        autoCorrectPdfRotation: formData.get('autoCorrectPdfRotation') === 'on',
        verticalTextThreshold: parseFloat(formData.get('verticalTextThreshold')) || 0.05,
        pdfMinSizeKb: parseInt(formData.get('pdfMinSizeKb')) || 0
    };

    // Validate
    if (!profileData.name) {
        showProfileAlert('Nome do perfil é obrigatório', 'warning');
        return;
    }

    if (!profileData.inclusionWildcard) {
        showProfileAlert('Wildcard de inclusão é obrigatório para perfis', 'warning');
        return;
    }

    const url = currentEditingProfileId
        ? `/api/imager/profiles/${currentEditingProfileId}`
        : `/api/imager/repositories/${currentRepositoryId}/profiles`;

    const method = currentEditingProfileId ? 'PUT' : 'POST';

    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw new Error(err.error || 'Erro ao salvar perfil'); });
        }
        return response.json();
    })
    .then(() => {
        const modal = bootstrap.Modal.getInstance(document.getElementById('profileModal'));
        modal.hide();

        showProfileAlert(currentEditingProfileId ? 'Perfil atualizado com sucesso!' : 'Perfil criado com sucesso!', 'success');
        loadRepositoryProfiles(currentRepositoryId);
    })
    .catch(error => {
        console.error('Error saving profile:', error);
        showProfileAlert(error.message, 'danger');
    });
}

/**
 * Toggle profile status
 */
function toggleProfileStatus(profileId) {
    fetch(`/api/imager/profiles/${profileId}/toggle`, { method: 'POST' })
        .then(response => response.json())
        .then(() => {
            showProfileAlert('Status do perfil alterado!', 'success');
            loadRepositoryProfiles(currentRepositoryId);
        })
        .catch(error => {
            console.error('Error toggling profile:', error);
            showProfileAlert('Erro ao alterar status: ' + error.message, 'danger');
        });
}

/**
 * Delete profile
 */
function deleteProfile(profileId) {
    if (!confirm('Tem certeza que deseja excluir este perfil? Esta ação não pode ser desfeita.')) {
        return;
    }

    fetch(`/api/imager/profiles/${profileId}`, { method: 'DELETE' })
        .then(response => response.json())
        .then(() => {
            showProfileAlert('Perfil excluído com sucesso!', 'success');
            loadRepositoryProfiles(currentRepositoryId);
        })
        .catch(error => {
            console.error('Error deleting profile:', error);
            showProfileAlert('Erro ao excluir perfil: ' + error.message, 'danger');
        });
}

/**
 * Utility: Escape HTML (from datatables-renderers.js)
 */
const escapeHtml = window.MeddriveRenderers?.escapeHtml || function(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
};

/**
 * Show alert message - Uses the shared alert system from imager-shared-utils.js
 */
function showProfileAlert(message, type = 'info') {
    // Use shared alert system directly - showAlert(message, type) from imager-shared-utils.js
    if (typeof window.showAlert === 'function') {
        window.showAlert(message, type);
    } else {
        // Fallback: simple alert
        alert(message);
    }
}

// Export functions to window for use by other modules (like mask-editor.js)
window.loadRepositoryProfiles = loadRepositoryProfiles;

// ==================== Nested Modal Management ====================

/**
 * Track modal stack for proper nested modal handling
 * Supports: Repository -> Profile -> Mask Editor (3 levels)
 */
const modalStack = [];

/**
 * Initialize event listeners for nested modal behavior
 * Prevents parent modals from closing when child modals open
 */
document.addEventListener('DOMContentLoaded', function() {
    const editRepositoryModal = document.getElementById('editRepositoryModal');
    const profileModal = document.getElementById('profileModal');
    const maskEditorModal = document.getElementById('maskEditorModal');

    // Helper function to manage modal z-indices
    function updateModalZIndices() {
        const baseZIndex = 1050;
        const zIndexStep = 10;

        modalStack.forEach((modal, index) => {
            const modalElement = document.getElementById(modal);
            if (modalElement) {
                modalElement.style.zIndex = baseZIndex + (index * zIndexStep);
            }
        });

        // Update backdrops
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach((backdrop, index) => {
            backdrop.style.zIndex = (baseZIndex - 5) + (index * zIndexStep);
        });
    }

    // Listen to modal show events
    [editRepositoryModal, profileModal, maskEditorModal].forEach(modal => {
        if (modal) {
            modal.addEventListener('show.bs.modal', function() {
                const modalId = this.id;
                if (!modalStack.includes(modalId)) {
                    modalStack.push(modalId);
                    console.log('[Nested Modals] Opening:', modalId, 'Stack:', modalStack);
                }
            });

            modal.addEventListener('shown.bs.modal', function() {
                updateModalZIndices();
            });

            modal.addEventListener('hidden.bs.modal', function() {
                const modalId = this.id;
                const index = modalStack.indexOf(modalId);
                if (index > -1) {
                    modalStack.splice(index, 1);
                    console.log('[Nested Modals] Closed:', modalId, 'Stack:', modalStack);
                }
                updateModalZIndices();
            });

            // Prevent parent modals from closing when child modals are open
            modal.addEventListener('hide.bs.modal', function(event) {
                const modalId = this.id;
                const index = modalStack.indexOf(modalId);

                // If this modal has child modals open (modals after it in the stack), prevent closing
                if (index > -1 && index < modalStack.length - 1) {
                    console.log('[Nested Modals] Preventing close of', modalId, 'because children are open');
                    event.preventDefault();
                    event.stopPropagation();
                }
            });
        }
    });
});
