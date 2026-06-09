/**
 * DICOM Dashboard JavaScript
 * Gerencia a interface do dashboard do servidor DICOM
 */

let dicomDashboard = {
    // Configuration
    config: {
        refreshInterval: 30000, // 30 seconds
        maxActivityItems: 50,
        apiBaseUrl: '/api/dicom'
    },

    // State
    state: {
        serverRunning: false,
        refreshTimer: null,
        searchDebounceTimer: null,
        currentSearchQuery: '',
        currentDateFilter: '7',
        activeImagerStatusFilter: '',
        expandedNodes: new Set(),
        canEditAccessionNumber: false,
        canBulkDelete: false,
        selectedExamIds: new Set()
    },

    /**
     * Initialize dashboard
     */
    init: function() {
        console.log('Initializing DICOM Dashboard...');

        this.bindEvents();

        // Load permissions then data
        this.loadPermissions(() => {
            this.initBulkDeleteButton();
            this.loadServerStatus();
            this.initDataTable();
            this.loadDicomStats();
            this.loadDicomModalities();
            this.startAutoRefresh();
            console.log('DICOM Dashboard initialized successfully');
        });
    },

    /**
     * Fetch period-scoped stats and update the cards.
     * Stats are intentionally NOT scoped by status/modality/search filters —
     * cards keep showing the period panorama, like Imager.
     */
    loadDicomStats: function() {
        const params = this.state.currentDateFilter ? { dateFilter: this.state.currentDateFilter } : {};
        $.ajax({
            url: `${this.config.apiBaseUrl}/exams/dashboard-stats`,
            method: 'GET',
            data: params,
            success: (stats) => {
                stats = stats || {};
                $('#dicomTotalExams').text(this.formatNumber(stats.total || 0));
                $('#dicomMatchedExams').text(this.formatNumber(stats.matched || 0));
                $('#dicomPendingExams').text(this.formatNumber(stats.pending || 0));
                $('#dicomErrorExams').text(this.formatNumber(stats.error || 0));
            },
            error: (xhr, status, error) => {
                console.error('Error loading dashboard stats:', xhr, status, error);
            }
        });
    },

    /**
     * Fetch distinct modalities for the current period and populate the dropdown.
     */
    loadDicomModalities: function() {
        const params = this.state.currentDateFilter ? { dateFilter: this.state.currentDateFilter } : {};
        const select = $('#dicomModalityFilter');
        const currentVal = select.val();

        $.ajax({
            url: `${this.config.apiBaseUrl}/exams/dashboard-modalities`,
            method: 'GET',
            data: params,
            success: (modalities) => {
                modalities = modalities || [];
                select.find('option:not(:first)').remove();
                modalities.forEach((m) => {
                    select.append('<option value="' + m + '">' + m + '</option>');
                });
                if (currentVal && modalities.indexOf(currentVal) !== -1) {
                    select.val(currentVal);
                }
            },
            error: (xhr, status, error) => {
                console.error('Error loading modalities:', xhr, status, error);
            }
        });
    },

    /**
     * Reload table data via DataTables ajax.reload (preserves pagination/order)
     * and refresh stats. Used after any filter/state change or post-action.
     */
    refreshDashboard: function(resetPaging) {
        if ($.fn.DataTable.isDataTable('#recent-exams-table')) {
            $('#recent-exams-table').DataTable().ajax.reload(null, !!resetPaging);
        }
        this.loadDicomStats();
    },

    /**
     * Load user permissions from session
     */
    loadPermissions: function(callback) {
        $.get('/api/auth/check')
            .done((data) => {
                if (data.allowedPermissions) {
                    this.state.canEditAccessionNumber =
                        data.allowedPermissions.indexOf('dicom-server.edit-accession-number') !== -1;
                    this.state.canBulkDelete =
                        data.allowedPermissions.indexOf('dicom-server.bulk-delete') !== -1;
                }
                if (callback) callback();
            })
            .fail(() => {
                if (callback) callback();
            });
    },

    /**
     * Bind UI events
     */
    /**
     * Initialize bulk delete button (only if permission granted)
     */
    initBulkDeleteButton: function() {
        if (!this.state.canBulkDelete) return;

        // Insert bulk delete button next to the refresh button
        const btn = $('<button class="btn btn-danger" id="bulkDeleteBtn" style="display: none;" title="Excluir selecionados">' +
            '<i class="fas fa-trash me-1"></i> Excluir (<span class="bulk-delete-count">0</span>)' +
            '</button>');
        btn.on('click', () => this.bulkDeleteExams());
        $('#refreshRecentExams').before(btn);
    },

    bindEvents: function() {
        // Refresh button
        $('#refreshRecentExams').on('click', () => {
            this.refreshDashboard(false);
        });

        // Period change reloads stats and modality options because both depend
        // on the period window. Table reload happens via refreshDashboard.
        $('#dicomDateFilter').on('change', () => {
            this.state.currentDateFilter = $('#dicomDateFilter').val();
            this.loadDicomModalities();
            this.refreshDashboard(true);
        });

        $('#dicomImagerStatusFilter').on('change', () => {
            this.state.activeImagerStatusFilter = $('#dicomImagerStatusFilter').val();
            if ($.fn.DataTable.isDataTable('#recent-exams-table')) {
                $('#recent-exams-table').DataTable().ajax.reload(null, true);
            }
        });

        $('#dicomModalityFilter').on('change', () => {
            if ($.fn.DataTable.isDataTable('#recent-exams-table')) {
                $('#recent-exams-table').DataTable().ajax.reload(null, true);
            }
        });

        // Custom DataTable controls
        this.bindDataTableControls();

        // Window events
        $(window).on('beforeunload', () => this.cleanup());
    },

    /**
     * Bind custom DataTable controls (search input, page-size selector).
     * Search delegates to DataTables' built-in search, which triggers ajax
     * automatically in serverSide mode.
     */
    bindDataTableControls: function() {
        const self = this;

        $('#dicomItemsPerPageSelect').off('change').on('change', function() {
            if ($.fn.DataTable.isDataTable('#recent-exams-table')) {
                $('#recent-exams-table').DataTable().page.len(parseInt($(this).val())).draw();
            }
        });

        $('#dicomSearchInput').off('keyup').on('keyup', function() {
            const searchValue = $(this).val();
            $('#dicomClearSearchBtn').toggle(searchValue.trim().length > 0);

            if (self.state.searchDebounceTimer) clearTimeout(self.state.searchDebounceTimer);
            self.state.searchDebounceTimer = setTimeout(function() {
                if ($.fn.DataTable.isDataTable('#recent-exams-table')) {
                    $('#recent-exams-table').DataTable().search(searchValue).draw();
                }
            }, 400);
        });

        $('#dicomClearSearchBtn').off('click').on('click', function() {
            $('#dicomSearchInput').val('');
            $(this).hide();
            if ($.fn.DataTable.isDataTable('#recent-exams-table')) {
                $('#recent-exams-table').DataTable().search('').draw();
            }
        });
    },

    /**
     * Load server status
     */
    loadServerStatus: function() {
        $.ajax({
            url: `${this.config.apiBaseUrl}/server/status`,
            method: 'GET',
            success: (status) => {
                this.updateServerStatus(status);
            },
            error: (xhr, status, error) => {
                console.error('Error loading server status:', xhr, status, error);
                this.updateServerStatus({
                    running: false,
                    status: 'ERROR',
                    errorMessage: 'Erro ao carregar status'
                });
            }
        });
    },

    /**
     * Update server status in navbar header
     */
    updateServerStatus: function(status) {
        const statusText = $('#dicom-server-status-text');
        this.state.serverRunning = status.running;

        if (status.running) {
            let text = `Online - AE: ${status.aeTitle || 'N/A'}, Porta: ${status.port || 'N/A'}`;
            statusText.html(`<span class="badge bg-success me-2">Online</span> AE: ${status.aeTitle || 'N/A'}, Porta: ${status.port || 'N/A'}`);
        } else if (status.status === 'STARTING') {
            statusText.html('<span class="badge bg-warning me-2">Iniciando</span>');
        } else {
            statusText.html('<span class="badge bg-danger me-2">Offline</span>');
        }
    },

    /**
     * Initialize the DataTable with serverSide pagination/filtering/sorting.
     * Filters are sent as flat params; controller maps them to JPA Specifications.
     */
    initDataTable: function() {
        if ($.fn.DataTable.isDataTable('#recent-exams-table')) {
            $('#recent-exams-table').DataTable().destroy();
        }
        $('#recent-exams-table thead tr').empty();
        $('#recent-exams-tbody').empty();

        const orderColIdx = this.state.canBulkDelete ? 8 : 7; // 'Recebido' column (createdAt)

        $('#recent-exams-table').DataTable({
            autoWidth: false,
            serverSide: true,
            processing: true,
            order: [[orderColIdx, 'desc']],
            pageLength: 25,
            lengthMenu: [[10, 25, 50, 100], [10, 25, 50, 100]],
            dom: 'rtip',
            language: { url: '/i18n/pt-BR.json' },
            ajax: {
                url: `${this.config.apiBaseUrl}/exams/dashboard`,
                type: 'GET',
                dataSrc: 'data',
                data: function(d) {
                    const payload = {
                        draw: d.draw,
                        start: d.start,
                        length: d.length,
                        search: d.search ? d.search.value : '',
                        dateFilter: dicomDashboard.state.currentDateFilter || '',
                        imagerStatusGroup: dicomDashboard.state.activeImagerStatusFilter || '',
                        modality: $('#dicomModalityFilter').val() || ''
                    };
                    if (d.order && d.order.length > 0) {
                        const col = d.columns[d.order[0].column];
                        if (col && col.data && col.orderable !== false) {
                            payload.sortField = col.data;
                            payload.sortDir = d.order[0].dir;
                        }
                    }
                    return payload;
                },
                error: (xhr, errType, error) => {
                    console.error('Error loading dashboard exams:', xhr, errType, error);
                }
            },
            columns: [
                ...(this.state.canBulkDelete ? [{
                    data: null,
                    title: '<input type="checkbox" id="selectAllExams" title="Selecionar todos">',
                    width: '3%',
                    orderable: false,
                    searchable: false,
                    render: (data, type, row) => {
                        var checked = this.state.selectedExamIds.has(row.id) ? ' checked' : '';
                        return '<input type="checkbox" class="exam-select-cb" data-exam-id="' + row.id + '"' + checked + '>';
                    }
                }] : []),
                {
                    data: 'studyDate',
                    title: 'Data Estudo',
                    width: '8%',
                    render: (data, type, row) => this.formatDate(data)
                },
                {
                    data: 'accessionNumber',
                    title: 'Nº Acesso',
                    width: '9%',
                    render: (data, type, row) => {
                        var display = '<span class="font-weight-bold">' + (data || 'N/A') + '</span>';
                        if (this.state.canEditAccessionNumber) {
                            display += ' <button class="btn-icon-only btn-xs edit-accession-btn" data-exam-id="' + row.id + '" data-current="' + (data || '') + '" title="Editar Nº Acesso"><i class="fas fa-pencil-alt" style="font-size: 0.75rem;"></i></button>';
                        }
                        return display;
                    }
                },
                {
                    data: 'patientName',
                    title: 'Paciente',
                    width: '24%',
                    render: function(data, type, row) {
                        return `
                            <div>
                                <span class="font-weight-bold">${row.patientName || ''}</span>
                                <br>
                                <small class="text-muted">ID: ${row.patientId || ''}</small>
                            </div>
                        `;
                    }
                },
                {
                    data: 'modality',
                    title: 'Modalidade',
                    width: '7%',
                    render: function(data) {
                        return data || '-';
                    }
                },
                {
                    data: 'sendingAETitle',
                    title: 'AE Origem',
                    width: '8%',
                    render: function(data) {
                        return `<small>${data || 'N/A'}</small>`;
                    }
                },
                {
                    data: 'instanceCount',
                    title: 'Instâncias',
                    width: '6%',
                    render: function(data) {
                        var count = data || 1;
                        var badgeClass = count > 1 ? 'bg-info' : 'bg-secondary';
                        return '<span class="badge ' + badgeClass + '">' + count + '</span>';
                    }
                },
                {
                    data: 'imagerMatchStatus',
                    title: 'Imager',
                    width: '8%',
                    render: (data, type, row) => {
                        const matchStatusText = this.getMatchStatusText(data);
                        const badgeClass = this.getMatchStatusBadgeClass(data);
                        return `<span class="badge ${badgeClass}" title="${row.imagerMatchMessage || ''}">${matchStatusText}</span>`;
                    }
                },
                {
                    data: 'createdAt',
                    title: 'Recebido',
                    width: '14%',
                    render: (data, type, row) => {
                        if (type === 'sort' || type === 'type') {
                            return data || '';
                        }
                        return `<small class="text-muted">${this.formatDateTime(data)}</small>`;
                    }
                },
                {
                    data: null,
                    title: 'Ações',
                    width: '12%',
                    orderable: false,
                    render: (data, type, row) => {
                        var instanceCount = row.instanceCount || 1;
                        var downloadTitle = instanceCount > 1 ? 'Baixar ZIP (' + instanceCount + ' arquivos)' : 'Baixar DICOM';
                        var downloadIcon = instanceCount > 1 ? 'fa-file-archive' : 'fa-download';
                        return `
                            <div class="btn-group" role="group">
                                <span class="tree-toggle" onclick="dicomDashboard.toggleTreeNode(${row.id})">
                                    <i class="fas fa-chevron-right" id="dicom-toggle-${row.id}"></i>
                                </span>
                                <button class="btn-icon-only view-attachments-btn" data-exam-id="${row.id}" title="Ver Conteúdo">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button class="btn-icon-only download-dicom-btn" data-exam-id="${row.id}" data-instance-count="${instanceCount}" title="${downloadTitle}">
                                    <i class="fas ${downloadIcon}"></i>
                                </button>
                                <button class="btn-icon-only retry-match-btn" data-exam-id="${row.id}" title="Retentar Match com Imager">
                                    <i class="fas fa-sync"></i>
                                </button>
                                <button class="btn-icon-only delete-exam-btn" data-exam-id="${row.id}" title="Excluir Estudo">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        `;
                    }
                }
            ],
            drawCallback: () => {
                this.state.selectedExamIds.clear();
                this.updateBulkDeleteButton();
                this.bindExamRowEvents();
                this.bindDataTableControls();
            }
        });
    },

    /**
     * Bind exam row click events
     */
    bindExamRowEvents: function() {
        // Handle view attachments button clicks
        $('.view-attachments-btn').off('click').on('click', (e) => {
            e.stopPropagation();
            const examId = $(e.currentTarget).data('exam-id');
            this.showAttachmentsModal(examId);
        });

        // Handle download DICOM button clicks
        $('.download-dicom-btn').off('click').on('click', (e) => {
            e.stopPropagation();
            const examId = $(e.currentTarget).data('exam-id');
            const instanceCount = $(e.currentTarget).data('instance-count') || 1;
            if (instanceCount > 1) {
                this.downloadDicomZip(examId);
            } else {
                this.downloadDicomFile(examId);
            }
        });

        // Handle retry match button clicks
        $('.retry-match-btn').off('click').on('click', (e) => {
            e.stopPropagation();
            const examId = $(e.currentTarget).data('exam-id');
            this.retryMatchToImager(examId);
        });

        // Handle delete exam button clicks
        $('.delete-exam-btn').off('click').on('click', (e) => {
            e.stopPropagation();
            const examId = $(e.currentTarget).data('exam-id');
            this.deleteExam(examId);
        });

        // Handle edit accession number button clicks
        $('.edit-accession-btn').off('click').on('click', (e) => {
            e.stopPropagation();
            const examId = $(e.currentTarget).data('exam-id');
            const current = $(e.currentTarget).data('current') || '';
            this.showEditAccessionModal(examId, current);
        });

        // Handle bulk delete checkboxes
        if (this.state.canBulkDelete) {
            $('.exam-select-cb').off('change').on('change', (e) => {
                const examId = parseInt($(e.currentTarget).data('exam-id'));
                if (e.currentTarget.checked) {
                    this.state.selectedExamIds.add(examId);
                } else {
                    this.state.selectedExamIds.delete(examId);
                }
                this.updateBulkDeleteButton();
                this.updateSelectAllCheckbox();
            });

            $('#selectAllExams').off('change').on('change', (e) => {
                const checked = e.currentTarget.checked;
                $('.exam-select-cb').each((i, cb) => {
                    cb.checked = checked;
                    const examId = parseInt($(cb).data('exam-id'));
                    if (checked) {
                        this.state.selectedExamIds.add(examId);
                    } else {
                        this.state.selectedExamIds.delete(examId);
                    }
                });
                this.updateBulkDeleteButton();
            });
        }
    },

    /**
     * Show edit accession number modal
     */
    showEditAccessionModal: function(examId, currentValue) {
        $('#editAccessionExamId').val(examId);
        $('#editAccessionInput').val(currentValue);
        var modal = new bootstrap.Modal(document.getElementById('editAccessionModal'));
        modal.show();

        // Focus input after modal is shown
        $('#editAccessionModal').off('shown.bs.modal').on('shown.bs.modal', function() {
            $('#editAccessionInput').focus().select();
        });

        // Bind save button
        $('#saveAccessionBtn').off('click').on('click', () => {
            this.saveAccessionNumber();
        });

        // Allow Enter key to save
        $('#editAccessionInput').off('keypress').on('keypress', (e) => {
            if (e.which === 13) {
                this.saveAccessionNumber();
            }
        });
    },

    /**
     * Save accession number via API
     */
    saveAccessionNumber: function() {
        var examId = $('#editAccessionExamId').val();
        var newValue = $('#editAccessionInput').val().trim();

        $('#saveAccessionBtn').prop('disabled', true).html('<i class="fas fa-spinner fa-spin me-1"></i>Salvando...');

        $.ajax({
            url: this.config.apiBaseUrl + '/exams/' + examId + '/accession-number',
            method: 'PATCH',
            contentType: 'application/json',
            data: JSON.stringify({ accessionNumber: newValue })
        })
        .done((data) => {
            if (data.success) {
                // Close modal and reload table
                var modalEl = document.getElementById('editAccessionModal');
                var modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
                this.refreshDashboard(false);
                if (typeof showAlert === 'function') {
                    showAlert('Nº Acesso atualizado com sucesso', 'success');
                }
            } else {
                if (typeof showAlert === 'function') {
                    showAlert(data.message || 'Erro ao atualizar', 'danger');
                }
            }
        })
        .fail((xhr) => {
            var msg = 'Erro ao atualizar número de acesso';
            if (xhr.responseJSON && xhr.responseJSON.message) {
                msg = xhr.responseJSON.message;
            }
            if (typeof showAlert === 'function') {
                showAlert(msg, 'danger');
            }
        })
        .always(() => {
            $('#saveAccessionBtn').prop('disabled', false).html('<i class="fas fa-save me-1"></i>Salvar');
        });
    },

    /**
     * Show attachments modal
     */
    showAttachmentsModal: function(examId) {
        console.log('Loading attachments for exam ID:', examId);

        // Create modal if it doesn't exist
        let modal = document.getElementById('attachmentsModal');
        if (!modal) {
            this.createAttachmentsModal();
            modal = document.getElementById('attachmentsModal');
        }

        // Show loading state
        $('#attachments-modal-body').html(`
            <div class="text-center py-4">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Carregando...</span>
                </div>
                <p class="mt-2 text-muted">Carregando conteúdo...</p>
            </div>
        `);

        // Show modal
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();

        // Load attachments
        $.ajax({
            url: `${this.config.apiBaseUrl}/exams/${examId}/attachments`,
            method: 'GET',
            success: (response) => {
                this.displayAttachmentsInModal(examId, response.attachments);
            },
            error: (xhr, status, error) => {
                console.error('Error loading attachments:', xhr, status, error);
                $('#attachments-modal-body').html(`
                    <div class="alert alert-danger" role="alert">
                        <i class="fas fa-exclamation-triangle me-2"></i>
                        Erro ao carregar conteúdo: ${error}
                    </div>
                `);
            }
        });
    },

    /**
     * Create attachments modal
     */
    createAttachmentsModal: function() {
        const modalHtml = `
            <div class="modal fade" id="attachmentsModal" tabindex="-1" aria-labelledby="attachmentsModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="attachmentsModalLabel">
                                <i class="fas fa-file-medical me-2"></i>
                                Arquivos Extraídos
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body" id="attachments-modal-body" style="max-height: 80vh; overflow-y: auto;">
                            <!-- Content will be loaded here -->
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        $('body').append(modalHtml);
    },

    /**
     * Display attachments in modal
     */
    displayAttachmentsInModal: function(examId, attachments) {
        const modalBody = $('#attachments-modal-body');

        if (!attachments || attachments.length === 0) {
            modalBody.html(`
                <div class="text-center py-4">
                    <i class="fas fa-inbox fa-3x text-muted mb-3"></i>
                    <p class="text-muted">Nenhum conteúdo extraído deste arquivo DICOM.</p>
                    <small class="text-muted">Este arquivo pode conter apenas dados brutos sem imagens/PDFs encapsulados.</small>
                </div>
            `);
            return;
        }

        let html = '';

        attachments.forEach((attachment, index) => {
            var actionUrl = `${this.config.apiBaseUrl}/exams/${examId}/attachments/${attachment.index}/file`;

            if (attachment.type === 'image') {
                html += `
                    <div class="mb-4">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="mb-0">
                                <i class="fas fa-image text-primary me-2"></i>
                                ${attachment.name}
                            </h6>
                            <a href="${actionUrl}" target="_blank" class="btn btn-sm btn-primary">
                                <i class="fas fa-external-link-alt me-1"></i>
                                Abrir em Nova Aba
                            </a>
                        </div>
                        ${attachment.rows ? `<small class="text-muted">Dimensões: ${attachment.columns}x${attachment.rows}px</small>` : ''}
                        <div class="text-center mt-2" style="max-height: 500px; overflow: auto; background: #f8f9fa; border-radius: 8px; padding: 15px;">
                            <img src="${actionUrl}" alt="${attachment.name}" style="max-width: 100%; height: auto; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        </div>
                    </div>
                `;
            } else if (attachment.type === 'pdf') {
                html += `
                    <div class="mb-4">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="mb-0">
                                <i class="fas fa-file-pdf text-danger me-2"></i>
                                ${attachment.name}
                            </h6>
                            <a href="${actionUrl}" target="_blank" class="btn btn-sm btn-danger">
                                <i class="fas fa-external-link-alt me-1"></i>
                                Abrir PDF
                            </a>
                        </div>
                        <div style="height: 600px; border: 1px solid #dee2e6; border-radius: 8px;">
                            <iframe src="${actionUrl}" style="width: 100%; height: 100%; border: none; border-radius: 8px;"></iframe>
                        </div>
                    </div>
                `;
            }
        });

        if (html === '') {
            html = `
                <div class="text-center py-4">
                    <i class="fas fa-exclamation-circle fa-3x text-warning mb-3"></i>
                    <p class="text-muted">Formato de arquivo não suportado para visualização.</p>
                </div>
            `;
        }

        modalBody.html(html);
    },

    /**
     * Download DICOM file
     */
    downloadDicomFile: function(examId) {
        console.log('Downloading DICOM file for exam ID:', examId);
        window.open(`${this.config.apiBaseUrl}/exams/${examId}/file`, '_blank');
    },

    downloadDicomZip: function(examId) {
        console.log('Downloading DICOM ZIP for exam ID:', examId);
        window.open(`${this.config.apiBaseUrl}/exams/${examId}/download-zip`, '_blank');
    },

    downloadInstanceFile: function(instanceId) {
        window.open(`${this.config.apiBaseUrl}/instances/${instanceId}/file`, '_blank');
    },

    /**
     * Toggle tree node expand/collapse
     */
    toggleTreeNode: function(examId) {
        var toggleIcon = $('#dicom-toggle-' + examId);
        var isExpanded = toggleIcon.hasClass('fa-chevron-down');

        if (isExpanded) {
            this.collapseTreeNode(examId);
            toggleIcon.removeClass('fa-chevron-down').addClass('fa-chevron-right');
            this.state.expandedNodes.delete(examId);
        } else {
            this.expandTreeNode(examId);
            toggleIcon.removeClass('fa-chevron-right').addClass('fa-chevron-down');
            this.state.expandedNodes.add(examId);
        }
    },

    /**
     * Expand tree node - load instances via AJAX
     */
    expandTreeNode: function(examId) {
        var groupRow = $('#dicom-toggle-' + examId).closest('tr');
        if (groupRow.length === 0) return;

        // Show loading
        var loadingRow = '<tr class="tree-child" data-group-key="dicom-' + examId + '">' +
            '<td colspan="9" style="padding: 8px 20px; border-left: 3px solid #007bff;">' +
                '<i class="fas fa-spinner fa-spin me-2"></i>Carregando instâncias...' +
            '</td></tr>';
        groupRow.after(loadingRow);

        var self = this;
        $.ajax({
            url: this.config.apiBaseUrl + '/exams/' + examId + '/instances',
            method: 'GET',
            success: function(data) {
                $('.tree-child[data-group-key="dicom-' + examId + '"]').remove();

                if (!data.success) return;

                var instances = data.instances || [];
                var childHtml;

                if (instances.length === 0) {
                    childHtml = '<tr class="tree-child" data-group-key="dicom-' + examId + '">' +
                        '<td colspan="9" style="padding: 6px 20px; border-left: 3px solid #007bff;">' +
                            '<em class="text-muted"><i class="fas fa-info-circle me-1"></i>Nenhuma instância registrada (exame anterior à migração)</em>' +
                        '</td></tr>';
                } else {
                    var instanceRows = instances.map(function(inst, idx) {
                        var sopShort = inst.sopInstanceUID || '-';
                        if (sopShort.length > 30) {
                            sopShort = '...' + sopShort.substring(sopShort.length - 25);
                        }

                        var seriesShort = inst.seriesInstanceUID || '-';
                        if (seriesShort.length > 25) {
                            seriesShort = '...' + seriesShort.substring(seriesShort.length - 20);
                        }

                        var sizeMB = inst.fileSizeMB ? parseFloat(inst.fileSizeMB).toFixed(2) + ' MB' : '-';
                        var extractBadge = inst.hasExtractedFiles
                            ? '<span class="badge bg-success">Sim</span>'
                            : '<span class="badge bg-secondary">Não</span>';
                        var createdAt = inst.createdAt ? self.formatDateTime(inst.createdAt) : '-';

                        return '<tr>' +
                            '<td class="text-center">' + (idx + 1) + '</td>' +
                            '<td><small title="' + (inst.sopInstanceUID || '') + '">' + sopShort + '</small></td>' +
                            '<td><small title="' + (inst.seriesInstanceUID || '') + '">' + seriesShort + '</small></td>' +
                            '<td>' + sizeMB + '</td>' +
                            '<td>' + extractBadge + '</td>' +
                            '<td><small>' + createdAt + '</small></td>' +
                            '<td>' +
                                '<button class="btn-icon-only" onclick="dicomDashboard.downloadInstanceFile(' + inst.id + ')" title="Baixar DICOM">' +
                                    '<i class="fas fa-download"></i>' +
                                '</button>' +
                            '</td>' +
                        '</tr>';
                    }).join('');

                    childHtml = '<tr class="tree-child" data-group-key="dicom-' + examId + '">' +
                        '<td colspan="9" style="padding: 6px 20px; border-left: 3px solid #007bff;">' +
                            '<strong style="font-size: 0.85rem;"><i class="fas fa-images me-1"></i>Instâncias (' + instances.length + ')</strong>' +
                            '<table class="table table-sm table-bordered table-tree-child mt-1 mb-0">' +
                                '<thead class="table-light">' +
                                    '<tr>' +
                                        '<th style="width: 30px;">#</th>' +
                                        '<th>SOP Instance UID</th>' +
                                        '<th>Série</th>' +
                                        '<th>Tamanho</th>' +
                                        '<th>Extrações</th>' +
                                        '<th>Recebido</th>' +
                                        '<th>Ações</th>' +
                                    '</tr>' +
                                '</thead>' +
                                '<tbody>' + instanceRows + '</tbody>' +
                            '</table>' +
                        '</td></tr>';
                }

                groupRow.after(childHtml);
            },
            error: function() {
                $('.tree-child[data-group-key="dicom-' + examId + '"]').remove();
            }
        });
    },

    /**
     * Collapse tree node
     */
    collapseTreeNode: function(examId) {
        $('.tree-child[data-group-key="dicom-' + examId + '"]').remove();
    },

    /**
     * Add activity item
     */
    addActivity: function(message, type = 'info') {
        const feedElement = $('#activity-feed');
        const feedRow = $('#activity-feed-row');

        // Show activity feed if hidden
        feedRow.show();

        const typeIcon = {
            'success': 'fas fa-check-circle text-success',
            'error': 'fas fa-exclamation-circle text-danger',
            'warning': 'fas fa-exclamation-triangle text-warning',
            'info': 'fas fa-info-circle text-info'
        };

        const activity = `
            <div class="activity-item">
                <div class="d-flex align-items-center">
                    <i class="${typeIcon[type] || typeIcon['info']} me-2"></i>
                    <div class="flex-grow-1">
                        <span>${message}</span>
                        <div class="activity-time">${new Date().toLocaleTimeString('pt-BR')}</div>
                    </div>
                </div>
            </div>
        `;

        feedElement.prepend(activity);

        // Remove old activities (keep max items)
        const items = feedElement.children('.activity-item');
        if (items.length > this.config.maxActivityItems) {
            items.slice(this.config.maxActivityItems).remove();
        }
    },

    /**
     * Start auto-refresh
     */
    startAutoRefresh: function() {
        if (this.state.refreshTimer) {
            clearInterval(this.state.refreshTimer);
        }

        this.state.refreshTimer = setInterval(() => {
            this.loadServerStatus();

            // Only refresh recent exams if server is running
            if (this.state.serverRunning) {
                this.refreshDashboard(false);
            }
        }, this.config.refreshInterval);

        console.log(`Auto-refresh started with ${this.config.refreshInterval/1000}s interval`);
    },

    /**
     * Stop auto-refresh
     */
    stopAutoRefresh: function() {
        if (this.state.refreshTimer) {
            clearInterval(this.state.refreshTimer);
            this.state.refreshTimer = null;
            console.log('Auto-refresh stopped');
        }
    },

    /**
     * Cleanup resources
     */
    cleanup: function() {
        this.stopAutoRefresh();
    },

    // Utility functions
    formatNumber: function(num) {
        return new Intl.NumberFormat('pt-BR').format(num);
    },

    formatDate: function(dateStr) {
        if (!dateStr) return 'N/A';

        // Parse date in local timezone to avoid timezone offset issues
        // Backend sends dates as "yyyy-MM-dd" which JavaScript interprets as UTC
        // We need to parse it as local date
        if (dateStr.includes('T') || dateStr.includes(' ')) {
            // Already has time component
            const date = new Date(dateStr);
            return date.toLocaleDateString('pt-BR');
        } else {
            // Date only (yyyy-MM-dd) - parse as local date
            const parts = dateStr.split('-');
            const date = new Date(parts[0], parts[1] - 1, parts[2]); // month is 0-indexed
            return date.toLocaleDateString('pt-BR');
        }
    },

    formatDateTime: function(dateTimeStr) {
        if (!dateTimeStr) return 'N/A';
        const date = new Date(dateTimeStr);
        return date.toLocaleString('pt-BR');
    },

    getStatusBadgeClass: function(status) {
        const classes = {
            'RECEIVED': 'bg-primary',
            'VALIDATING': 'bg-warning',
            'STORED': 'bg-success',
            'ERROR': 'bg-danger',
            'ARCHIVED': 'bg-secondary'
        };
        return classes[status] || 'bg-secondary';
    },

    getStatusText: function(status) {
        const texts = {
            'RECEIVED': 'Recebido',
            'VALIDATING': 'Validando',
            'STORED': 'Armazenado',
            'ERROR': 'Erro',
            'ARCHIVED': 'Arquivado'
        };
        return texts[status] || status;
    },

    getMatchStatusBadgeClass: function(status) {
        const classes = {
            'NOT_ATTEMPTED': 'bg-secondary',
            'NOT_APPLICABLE': 'bg-dark',
            'PENDING': 'bg-warning',
            'MATCHED': 'bg-success',
            'NO_ORDER': 'bg-info',
            'CONFIG_DISABLED': 'bg-secondary',
            'DISABLED': 'bg-secondary',
            'ERROR': 'bg-danger'
        };
        return classes[status] || 'bg-secondary';
    },

    getMatchStatusText: function(status) {
        const texts = {
            'NOT_ATTEMPTED': 'Não tentado',
            'NOT_APPLICABLE': 'N/A',
            'PENDING': 'Pendente',
            'MATCHED': 'Integrado',
            'NO_ORDER': 'Sem ordem',
            'CONFIG_DISABLED': 'Config desab.',
            'DISABLED': 'Desabilitado',
            'ERROR': 'Erro'
        };
        return texts[status] || status || 'N/A';
    },

    showSuccess: function(message) {
        // Implementation depends on notification system
        console.log('SUCCESS:', message);
        this.showNotification(message, 'success');
    },

    showError: function(message) {
        // Implementation depends on notification system
        console.error('ERROR:', message);
        this.showNotification(message, 'error');
    },

    showInfo: function(message) {
        // Implementation depends on notification system
        console.log('INFO:', message);
        this.showNotification(message, 'info');
    },

    showLoading: function(message) {
        // Implementation depends on notification system
        console.log('LOADING:', message);
    },

    showNotification: function(message, type) {
        // Basic toast notification - can be enhanced
        let bgClass = 'bg-danger'; // default
        if (type === 'success') bgClass = 'bg-success';
        else if (type === 'info') bgClass = 'bg-info';
        else if (type === 'warning') bgClass = 'bg-warning';

        const toastHtml = `
            <div class="toast align-items-center text-white ${bgClass}" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="d-flex">
                    <div class="toast-body">
                        ${message}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
                </div>
            </div>
        `;

        // Add to toast container (assuming it exists)
        const toastContainer = $('.toast-container');
        if (toastContainer.length) {
            toastContainer.append(toastHtml);
            const toast = new bootstrap.Toast(toastContainer.children().last()[0]);
            toast.show();
        }
    },

    /**
     * Delete exam with confirmation
     */
    deleteExam: function(examId) {
        if (!confirm('Tem certeza que deseja excluir este estudo DICOM? Esta ação não pode ser desfeita.')) {
            return;
        }

        $.ajax({
            url: `${this.config.apiBaseUrl}/exams/${examId}`,
            method: 'DELETE',
            success: () => {
                alert('Estudo excluído com sucesso!');
                this.refreshDashboard(false);
            },
            error: (xhr, status, error) => {
                console.error('Error deleting exam:', xhr, status, error);
                let errorMessage = 'Erro ao excluir estudo';
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMessage = xhr.responseJSON.message;
                } else if (xhr.responseText) {
                    errorMessage = xhr.responseText;
                }
                alert(errorMessage);
            }
        });
    },

    /**
     * Update bulk delete button visibility and count
     */
    updateBulkDeleteButton: function() {
        const count = this.state.selectedExamIds.size;
        const btn = $('#bulkDeleteBtn');
        if (count > 0) {
            btn.show().find('.bulk-delete-count').text(count);
        } else {
            btn.hide();
        }
    },

    /**
     * Update select-all checkbox state based on individual checkboxes
     */
    updateSelectAllCheckbox: function() {
        const total = $('.exam-select-cb').length;
        const checked = $('.exam-select-cb:checked').length;
        const selectAll = $('#selectAllExams')[0];
        if (selectAll) {
            selectAll.checked = total > 0 && checked === total;
            selectAll.indeterminate = checked > 0 && checked < total;
        }
    },

    /**
     * Bulk delete selected exams
     */
    bulkDeleteExams: function() {
        const ids = Array.from(this.state.selectedExamIds);
        if (ids.length === 0) return;

        if (!confirm(`Tem certeza que deseja excluir ${ids.length} estudo(s) DICOM? Esta ação não pode ser desfeita.`)) {
            return;
        }

        $.ajax({
            url: `${this.config.apiBaseUrl}/exams/bulk`,
            method: 'DELETE',
            contentType: 'application/json',
            data: JSON.stringify(ids),
            success: (response) => {
                alert(response.message);
                this.state.selectedExamIds.clear();
                this.updateBulkDeleteButton();
                this.refreshDashboard(false);
            },
            error: (xhr) => {
                let errorMessage = 'Erro ao excluir exames';
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMessage = xhr.responseJSON.message;
                }
                alert(errorMessage);
            }
        });
    },

    /**
     * Retry match to imager
     */
    retryMatchToImager: function(examId) {
        this.showLoading('Tentando reenviar PDF para o Imager...');

        // Disable the button to prevent multiple clicks
        $(`.retry-match-btn[data-exam-id="${examId}"]`)
            .prop('disabled', true)
            .html('<i class="fas fa-spinner fa-spin"></i>');

        $.ajax({
            url: `${this.config.apiBaseUrl}/exams/${examId}/retry-match`,
            method: 'POST',
            success: (response) => {
                if (response.alreadyExists) {
                    // PDF already registered - show info message
                    this.showInfo(response.message || 'PDF já está registrado e aguardando aprovação');
                    this.addActivity(`Exame ID ${examId}: ${response.message}`, 'info');
                } else if (response.success) {
                    this.showSuccess(response.message || 'PDF reenviado para processamento no Imager com sucesso!');
                    this.addActivity(`Retentar match para exame ID ${examId} concluído`, 'success');
                } else {
                    this.showError(response.message || 'Falha ao reenviar PDF para o Imager');
                    this.addActivity(`Falha ao retentar match para exame ID ${examId}: ${response.message}`, 'error');
                }

                // Re-enable and restore button
                $(`.retry-match-btn[data-exam-id="${examId}"]`)
                    .prop('disabled', false)
                    .html('<i class="fas fa-sync"></i>');

                // Reload the table
                this.refreshDashboard(false);
            },
            error: (xhr, status, error) => {
                console.error('Error retrying match:', xhr, status, error);
                let errorMessage = 'Erro ao reenviar PDF para o Imager';

                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMessage = xhr.responseJSON.message;
                } else if (xhr.responseText) {
                    try {
                        const errorResponse = JSON.parse(xhr.responseText);
                        errorMessage = errorResponse.message || errorMessage;
                    } catch(e) {
                        errorMessage = xhr.responseText;
                    }
                }

                this.showError(errorMessage);
                this.addActivity(`Erro ao retentar match para exame ID ${examId}: ${errorMessage}`, 'error');

                // Re-enable and restore button
                $(`.retry-match-btn[data-exam-id="${examId}"]`)
                    .prop('disabled', false)
                    .html('<i class="fas fa-sync"></i>');
            }
        });
    }
};

/**
 * Global function called by stats card onClick to filter by Imager status.
 * Follows the same pattern as gwFilterByStatus() in Gateway.
 */
function dicomFilterByImagerStatus(status) {
    dicomDashboard.state.activeImagerStatusFilter = status;
    $('#dicomImagerStatusFilter').val(status);
    if ($.fn.DataTable.isDataTable('#recent-exams-table')) {
        $('#recent-exams-table').DataTable().ajax.reload(null, true);
    }
}

// Initialize when document is ready
$(document).ready(function() {
    // Only initialize if we're on the DICOM dashboard page
    if ($('#dicom-dashboard').length > 0 || $('.dicom-dashboard').length > 0) {
        dicomDashboard.init();
    }
});
