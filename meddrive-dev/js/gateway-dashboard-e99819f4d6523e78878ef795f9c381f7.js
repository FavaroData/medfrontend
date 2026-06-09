/**
 * Gateway - Dashboard JavaScript
 * Gerenciamento de ProcessingOrders
 */

let dashboardTable;
let detailsModal;
let selectedOrders = new Set();
let gatewayRefreshInterval = null;
let expandedGatewayNodes = new Set();
let gwActiveStatusFilter = '';
let gwActiveTab = 'reports';
let gwCanDeleteOrder = false;

// escapeHtml is provided globally by file-repository-profiles.js

/**
 * Inicializa o dashboard do Gateway.
 * Chamado pelo dashboard.js após o fragment HTML ser carregado.
 */
function initGatewayDashboard() {
    console.log('[Gateway] Initializing dashboard...');

    // Initialize modals
    var modalEl = document.getElementById('detailsModal');
    if (modalEl) {
        detailsModal = new bootstrap.Modal(modalEl);
    }

    // Carrega permissões do perfil para gating de ações
    loadGatewayPermissions();

    // Initialize DataTable
    initializeGatewayDataTable();

    // Reset tree-view state
    expandedGatewayNodes = new Set();

    // Reset tab state
    gwActiveTab = 'reports';
    gwPatientLoginsInitialized = false;
    gwProviderLoginsInitialized = false;

    // Load orders
    loadOrders();

    // Setup event listeners
    setupGatewayEventListeners();

    // Setup tab event listeners for lazy loading
    setupGatewayTabListeners();

    // Auto-refresh every 30 seconds (pausa quando aba não visível ou em tab de logins)
    if (gatewayRefreshInterval) {
        clearInterval(gatewayRefreshInterval);
    }
    gatewayRefreshInterval = setInterval(function() {
        if (!document.hidden && gwActiveTab === 'reports') {
            refreshOrders();
        }
    }, 30000);

    console.log('[Gateway] Dashboard initialized successfully');
}

function loadGatewayPermissions() {
    $.get('/api/auth/check')
        .done(function(data) {
            if (data && data.allowedPermissions) {
                gwCanDeleteOrder = data.allowedPermissions.indexOf('gateway.delete-orders') !== -1;
            }
            // Redesenha a tabela para refletir o botão de exclusão, se já inicializada
            if (dashboardTable) {
                dashboardTable.draw(false);
            }
        });
}

function initializeGatewayDataTable() {
    dashboardTable = $('#gatewayDashboardTable').DataTable({
        autoWidth: false,
        columns: [
            {
                data: null,
                title: '',
                width: '3%',
                orderable: false,
                render: function(data, type, row) {
                    return '<input type="checkbox" class="order-checkbox" value="' + row.id + '">';
                }
            },
            {
                data: 'id',
                title: 'ID',
                width: '5%',
                render: function(data) {
                    return '<span class="badge bg-secondary">' + data + '</span>';
                }
            },
            {
                data: null,
                title: 'Paciente',
                width: '22%',
                render: function(data, type, row) {
                    var name = escapeHtml(row.patientName || '-');
                    var secondLine = [];
                    if (row.patientCpf) {
                        secondLine.push('CPF: ' + escapeHtml(row.patientCpf));
                    }
                    if (row.patientBirthDate) {
                        secondLine.push('Nasc: ' + escapeHtml(row.patientBirthDate));
                    }
                    var info = secondLine.length > 0
                        ? '<br><small class="text-muted">' + secondLine.join(' | ') + '</small>'
                        : '';
                    return '<div><span class="font-weight-bold">' + name + '</span>' + info + '</div>';
                }
            },
            {
                data: 'serviceName',
                title: 'Procedimento',
                width: '22%',
                render: function(data) {
                    return data ? escapeHtml(data) : '<em class="text-muted">-</em>';
                }
            },
            {
                data: 'reportApprovalDate',
                title: 'Data Liberação',
                width: '11%',
                render: function(data) {
                    return data ? formatDateTime(data) : '<em class="text-muted">-</em>';
                }
            },
            {
                data: 'scheduledSendDate',
                title: 'Envio Previsto',
                width: '11%',
                render: function(data, type, row) {
                    if (!data) return '<em class="text-muted">-</em>';

                    var now = new Date();
                    var scheduled = new Date(data);
                    var isPast = scheduled <= now;
                    var formatted = formatDateTime(data);

                    if (row.manualSendRequested) {
                        return '<span class="badge bg-warning">MANUAL</span><br><small>' + formatted + '</small>';
                    } else if (isPast && row.orderStatus === 'PENDING') {
                        return '<span class="badge bg-success">PRONTO</span><br><small>' + formatted + '</small>';
                    } else {
                        return formatted;
                    }
                }
            },
            {
                data: 'orderStatus',
                title: 'Status',
                width: '12%',
                render: function(data) {
                    var statusMap = {
                        'PENDING': '<span class="badge bg-warning"><i class="fas fa-clock"></i> Pendente</span>',
                        'READY': '<span class="badge bg-info"><i class="fas fa-check"></i> Pronto</span>',
                        'DELIVERED': '<span class="badge bg-success"><i class="fas fa-check-circle"></i> Enviado</span>',
                        'RETRY_EXHAUSTED': '<span class="badge bg-danger"><i class="fas fa-exclamation-triangle"></i> Retry Esgotado</span>',
                        'CANCELLED': '<span class="badge bg-secondary"><i class="fas fa-ban"></i> Cancelado</span>',
                        'PORTAL_DELETED': '<span class="badge bg-dark"><i class="fas fa-trash-alt"></i> Excluído do Portal</span>'
                    };
                    return statusMap[data] || '<span class="badge bg-secondary">' + escapeHtml(data) + '</span>';
                }
            },
            {
                data: null,
                title: 'Ações',
                width: '12%',
                orderable: false,
                render: function(data, type, row) {
                    var eid = escapeHtml(row.id);
                    var actions = '<div class="btn-group" role="group">';

                    actions +=
                        '<span class="tree-toggle" onclick="gw_toggleTreeNode(\'' + eid + '\')">' +
                            '<i class="fas fa-chevron-right" id="gw-toggle-' + eid + '"></i>' +
                        '</span>' +
                        '<button class="btn-icon-only" onclick="viewDetails(\'' + eid + '\')" title="Ver Detalhes">' +
                            '<i class="fas fa-eye"></i>' +
                        '</button>';

                    if (row.orderStatus === 'RETRY_EXHAUSTED' || row.orderStatus === 'PENDING') {
                        actions +=
                        '<button class="btn-icon-only" onclick="manualSend(\'' + eid + '\')" title="Enviar Agora">' +
                            '<i class="fas fa-paper-plane"></i>' +
                        '</button>';
                    }

                    // Regerar: disponível para DELIVERED, RETRY_EXHAUSTED, PORTAL_DELETED, CANCELLED
                    if (row.orderStatus === 'DELIVERED' || row.orderStatus === 'RETRY_EXHAUSTED' || row.orderStatus === 'PORTAL_DELETED' || row.orderStatus === 'CANCELLED') {
                        actions +=
                        '<button class="btn-icon-only" onclick="regenerateOrder(\'' + eid + '\')" title="Regerar">' +
                            '<i class="fas fa-redo"></i>' +
                        '</button>';
                    }

                    // Excluir do Portal: disponível para DELIVERED, desabilitado para PORTAL_DELETED
                    if (row.orderStatus === 'DELIVERED') {
                        actions +=
                        '<button class="btn-icon-only" onclick="deleteFromPortal(\'' + eid + '\')" title="Excluir do Portal">' +
                            '<i class="fas fa-cloud-upload-alt"></i>' +
                        '</button>';
                    } else if (row.orderStatus === 'PORTAL_DELETED') {
                        actions +=
                        '<button class="btn-icon-only" disabled title="Já excluído do Portal">' +
                            '<i class="fas fa-cloud-upload-alt"></i>' +
                        '</button>';
                    }

                    if (row.orderStatus === 'DELIVERED') {
                        actions +=
                        '<button class="btn-icon-only" onclick="openGwOrderPdf(\'' + eid + '\')" title="Visualizar PDF">' +
                            '<i class="fas fa-file-pdf"></i>' +
                        '</button>';
                    }

                    if (row.orderStatus !== 'DELIVERED' && row.orderStatus !== 'CANCELLED' && row.orderStatus !== 'PORTAL_DELETED') {
                        actions +=
                        '<button class="btn-icon-only" onclick="cancelOrder(\'' + eid + '\')" title="Cancelar">' +
                            '<i class="fas fa-ban"></i>' +
                        '</button>';
                    }

                    if (gwCanDeleteOrder) {
                        actions +=
                        '<button class="btn-icon-only" onclick="deleteOrder(\'' + eid + '\')" title="Excluir Exame">' +
                            '<i class="fas fa-trash"></i>' +
                        '</button>';
                    }

                    actions += '</div>';
                    return actions;
                }
            }
        ],
        dom: 'rtip', // Remove default length and filter controls (using custom toolbar)
        language: {
            url: '/i18n/pt-BR.json'
        },
        order: [[1, 'desc']],
        pageLength: parseInt(localStorage.getItem('gatewayDashboardPageSize')) || 25
    });

    // Page size change handler (matches table-toolbar component IDs)
    $('#gatewayDashboardItemsPerPageSelect').off('change').on('change', function() {
        var pageSize = parseInt($(this).val());
        dashboardTable.page.len(pageSize).draw();
        localStorage.setItem('gatewayDashboardPageSize', pageSize);
    });

    // Search handler (matches table-toolbar component IDs)
    $('#gatewayDashboardSearchInput').off('keyup').on('keyup', function() {
        dashboardTable.search($(this).val()).draw();
    });

    // Clear search button
    $('#gatewayDashboardClearSearchBtn').off('click').on('click', function() {
        $('#gatewayDashboardSearchInput').val('');
        dashboardTable.search('').draw();
        $(this).hide();
    });

    // Show/hide clear button based on search input
    $('#gatewayDashboardSearchInput').off('input').on('input', function() {
        var val = $(this).val();
        $('#gatewayDashboardClearSearchBtn').toggle(val.length > 0);
    });
}

function setupGatewayEventListeners() {
    // Date filter change
    $('#gwDateFilter').on('change', function() {
        loadOrders();
    });

    // Status filter change
    $('#gwStatusFilter').on('change', function() {
        gwActiveStatusFilter = $(this).val();
        gwApplyStatusFilter();
    });

    // Select all checkbox
    $('#selectAll').on('change', function() {
        var isChecked = $(this).is(':checked');
        $('.order-checkbox').prop('checked', isChecked);
        updateSelectedOrders();
    });

    // Individual checkboxes
    $(document).on('change', '.order-checkbox', function() {
        updateSelectedOrders();
    });
}

/**
 * Setup tab event listeners for lazy loading of login tabs.
 */
function setupGatewayTabListeners() {
    $('#gwTabPatientLoginsLink').on('shown.bs.tab', function() {
        gwActiveTab = 'patientLogins';
        gwLoadPatientLoginsTab();
    });

    $('#gwTabProviderLoginsLink').on('shown.bs.tab', function() {
        gwActiveTab = 'providerLogins';
        gwLoadProviderLoginsTab();
    });

    // When returning to Reports tab, resume auto-refresh
    $('#gwTabReportsBtn').on('shown.bs.tab', function() {
        gwActiveTab = 'reports';
    });
}

/**
 * Carrega o fragment de patient logins via AJAX (lazy loading no primeiro clique).
 */
function gwLoadPatientLoginsTab() {
    if (gwPatientLoginsInitialized) return;

    $.ajax({
        url: '/api/gateway/fragments/patient-logins',
        method: 'GET',
        success: function(html) {
            $('#gwTabPatientLogins').html(html);
            initGatewayPatientLogins();
        },
        error: function(xhr) {
            $('#gwTabPatientLogins').html(
                '<div class="alert alert-danger">Erro ao carregar aba de logins de pacientes</div>'
            );
        }
    });
}

/**
 * Carrega o fragment de provider logins via AJAX (lazy loading no primeiro clique).
 */
function gwLoadProviderLoginsTab() {
    if (gwProviderLoginsInitialized) return;

    $.ajax({
        url: '/api/gateway/fragments/provider-logins',
        method: 'GET',
        success: function(html) {
            $('#gwTabProviderLogins').html(html);
            initGatewayProviderLogins();
        },
        error: function(xhr) {
            $('#gwTabProviderLogins').html(
                '<div class="alert alert-danger">Erro ao carregar aba de logins de prestadores</div>'
            );
        }
    });
}

function updateSelectedOrders() {
    selectedOrders.clear();
    $('.order-checkbox:checked').each(function() {
        selectedOrders.add($(this).val());
    });

    // Update button state
    $('#processSelectedBtn').prop('disabled', selectedOrders.size === 0);

    // Update select all checkbox state
    var totalCheckboxes = $('.order-checkbox').length;
    var checkedCheckboxes = $('.order-checkbox:checked').length;
    $('#selectAll').prop('checked', totalCheckboxes > 0 && totalCheckboxes === checkedCheckboxes);
}

function getDateFilter() {
    var el = document.getElementById('gwDateFilter');
    return el ? el.value : '7';
}

function loadOrders() {
    var dateFilter = getDateFilter();
    var params = dateFilter ? { dateFilter: dateFilter } : {};

    $.ajax({
        url: '/api/gateway/orders',
        method: 'GET',
        data: params,
        success: function(data) {
            dashboardTable.clear();
            dashboardTable.rows.add(data);
            dashboardTable.draw();
            updateStatistics(data);
            updateSelectedOrders();
            // Re-apply status filter after data reload
            if (gwActiveStatusFilter) {
                gwApplyStatusFilter();
            }
        },
        error: function(xhr) {
            console.error('Erro ao carregar orders:', xhr);
            showAlert('Erro ao carregar orders', 'danger');
        }
    });
}

function updateStatistics(orders) {
    $('#gwTotalReports').text(orders.length);

    var pendingCount = orders.filter(function(o) { return o.orderStatus === 'PENDING' || o.orderStatus === 'READY'; }).length;
    var successCount = orders.filter(function(o) { return o.orderStatus === 'DELIVERED'; }).length;
    var failedCount = orders.filter(function(o) { return o.orderStatus === 'RETRY_EXHAUSTED'; }).length;

    $('#gwPendingReports').text(pendingCount);
    $('#gwSuccessReports').text(successCount);
    $('#gwFailedReports').text(failedCount);
}

function processSelected() {
    if (selectedOrders.size === 0) {
        showAlert('Nenhum order selecionado', 'warning');
        return;
    }

    if (!confirm('Enviar ' + selectedOrders.size + ' order(s) selecionado(s)?')) {
        return;
    }

    var orderIds = Array.from(selectedOrders);

    $.ajax({
        url: '/api/gateway/orders/manual-send',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ orderIds: orderIds }),
        success: function(response) {
            if (response.success) {
                showAlert(escapeHtml(response.message), 'success');
                selectedOrders.clear();
                loadOrders();
            } else {
                showAlert(escapeHtml(response.message), 'danger');
            }
        },
        error: function(xhr) {
            console.error('Erro ao enviar orders:', xhr);
            showAlert('Erro ao enviar orders', 'danger');
        }
    });
}

function manualSend(id) {
    if (!confirm('Enviar este order agora?')) return;

    $.ajax({
        url: '/api/gateway/orders/' + id + '/manual-send',
        method: 'POST',
        success: function(response) {
            if (response.success) {
                showAlert(escapeHtml(response.message), 'success');
                loadOrders();
            } else {
                showAlert(escapeHtml(response.message), 'danger');
            }
        },
        error: function(xhr) {
            showAlert('Erro ao solicitar envio manual', 'danger');
        }
    });
}

function cancelOrder(id) {
    if (!confirm('Cancelar este order? Esta ação não pode ser desfeita.')) return;

    $.ajax({
        url: '/api/gateway/orders/' + id + '/cancel',
        method: 'POST',
        success: function(response) {
            if (response.success) {
                showAlert(escapeHtml(response.message), 'success');
                loadOrders();
            } else {
                showAlert(escapeHtml(response.message), 'danger');
            }
        },
        error: function(xhr) {
            showAlert('Erro ao cancelar order', 'danger');
        }
    });
}

function regenerateOrder(id) {
    if (!confirm('Regerar este laudo? O order voltará para a fila de processamento.')) return;

    $.ajax({
        url: '/api/gateway/orders/' + id + '/regenerate',
        method: 'POST',
        success: function(response) {
            if (response.success) {
                showAlert(escapeHtml(response.message), 'success');
                loadOrders();
            } else {
                showAlert(escapeHtml(response.message), 'danger');
            }
        },
        error: function(xhr) {
            showAlert('Erro ao regerar order', 'danger');
        }
    });
}

function deleteFromPortal(id) {
    if (!confirm('Excluir este laudo do portal? O laudo será removido do acesso online.')) return;

    $.ajax({
        url: '/api/gateway/orders/' + id + '/portal',
        method: 'DELETE',
        success: function(response) {
            if (response.success) {
                showAlert(escapeHtml(response.message), 'success');
                loadOrders();
            } else {
                showAlert(escapeHtml(response.message), 'danger');
            }
        },
        error: function(xhr) {
            showAlert('Erro ao excluir laudo do portal', 'danger');
        }
    });
}

function deleteOrder(id) {
    if (!confirm('Excluir permanentemente este exame do Gateway?\n\n' +
        'O registro local será removido. Se o exame ainda existir na origem (view Oracle), ' +
        'ele poderá reaparecer como PENDENTE no próximo scan e ser reenviado.')) return;

    $.ajax({ url: '/api/gateway/orders/' + encodeURIComponent(id), method: 'DELETE' })
        .done(function(resp) {
            showAlert((resp && resp.message) ? escapeHtml(resp.message) : 'Falha ao excluir exame',
                resp && resp.success ? 'success' : 'danger');
            if (resp && resp.success) {
                loadOrders();
            }
        })
        .fail(function(xhr) {
            showAlert(xhr.status === 403
                ? 'Sem permissão para excluir exames do Gateway'
                : 'Erro ao excluir exame', 'danger');
        });
}

function openGwPdf(reportId) {
    if (!reportId) {
        showAlert('ID do report não encontrado', 'danger');
        return;
    }
    var pdfUrl = '/api/gateway/reports/' + reportId + '/pdf';
    var newWindow = window.open(pdfUrl, '_blank');
    if (!newWindow) {
        showAlert('Pop-ups bloqueados. Permita pop-ups para este site e tente novamente.', 'warning');
    }
}

function openGwOrderPdf(orderId) {
    var pdfUrl = '/api/gateway/orders/' + orderId + '/pdf';
    var newWindow = window.open(pdfUrl, '_blank');
    if (!newWindow) {
        showAlert('Pop-ups bloqueados. Permita pop-ups para este site e tente novamente.', 'warning');
    }
}

function triggerPopulation() {
    if (!confirm('Buscar novos laudos da view Oracle?')) return;

    showAlert('Iniciando busca de novos laudos...', 'info');

    $.ajax({
        url: '/api/gateway/orders/populate',
        method: 'POST',
        success: function(response) {
            if (response.success) {
                showAlert(escapeHtml(response.message), 'success');
                setTimeout(refreshOrders, 2000);
            } else {
                showAlert(escapeHtml(response.message), 'danger');
            }
        },
        error: function(xhr) {
            showAlert('Erro ao buscar novos laudos', 'danger');
        }
    });
}

function triggerProcessing() {
    if (!confirm('Processar todos os orders pendentes prontos para envio?')) return;

    showAlert('Iniciando processamento...', 'info');

    $.ajax({
        url: '/api/gateway/orders/process',
        method: 'POST',
        success: function(response) {
            if (response.success) {
                showAlert(escapeHtml(response.message), 'success');
                setTimeout(refreshOrders, 2000);
            } else {
                showAlert(escapeHtml(response.message), 'danger');
            }
        },
        error: function(xhr) {
            showAlert('Erro ao processar orders', 'danger');
        }
    });
}

function viewDetails(id) {
    $.ajax({
        url: '/api/gateway/orders/' + id,
        method: 'GET',
        success: function(data) {
            if (!data.success) {
                showAlert(escapeHtml(data.message), 'danger');
                return;
            }

            var order = data.order;
            var reports = data.reports || [];

            var reportsHtml = '';
            if (reports.length > 0) {
                var reportRows = reports.map(function(r) {
                    return '<tr>' +
                        '<td>' + r.id + '</td>' +
                        '<td><span class="badge bg-' + (r.deliveryStatus === 'SUCCESS' ? 'success' : r.deliveryStatus === 'FAILED' ? 'danger' : 'warning') + '">' + escapeHtml(r.deliveryStatus) + '</span></td>' +
                        '<td>' + renderStepBadge(r.statusS3Upload) + '</td>' +
                        '<td>' + renderStepBadge(r.statusApiCall) + '</td>' +
                        '<td>' + escapeHtml(r.deliveryEnvelopeId || '-') + '</td>' +
                        '<td>' + (r.processedAt ? formatDateTime(r.processedAt) : '-') + '</td>' +
                        '<td class="text-danger">' + escapeHtml(r.errorMessage || '-') + '</td>' +
                    '</tr>';
                }).join('');

                reportsHtml =
                    '<h6 class="mt-3"><i class="fas fa-history"></i> Histórico de Tentativas (' + reports.length + ')</h6>' +
                    '<table class="table table-sm table-bordered">' +
                        '<thead class="table-light">' +
                            '<tr>' +
                                '<th>ID</th><th>Status</th><th>S3</th><th>API</th><th>Envelope</th><th>Data</th><th>Erro</th>' +
                            '</tr>' +
                        '</thead>' +
                        '<tbody>' + reportRows + '</tbody>' +
                    '</table>';
            }

            var lastErrorRow = order.lastErrorMessage
                ? '<tr><th>Último Erro:</th><td class="text-danger">' + escapeHtml(order.lastErrorMessage) + '</td></tr>'
                : '';

            var detailsHtml =
                '<div class="row">' +
                    '<div class="col-md-6">' +
                        '<h6><i class="fas fa-user"></i> Dados do Paciente</h6>' +
                        '<table class="table table-sm">' +
                            '<tr><th>Nome:</th><td>' + escapeHtml(order.patientName || '-') + '</td></tr>' +
                            '<tr><th>CPF:</th><td>' + escapeHtml(order.patientCpf || '-') + '</td></tr>' +
                            '<tr><th>Data Nascimento:</th><td>' + escapeHtml(order.patientBirthDate || '-') + '</td></tr>' +
                            '<tr><th>Telefone:</th><td>' + escapeHtml(order.patientPhoneNumber || '-') + '</td></tr>' +
                        '</table>' +
                    '</div>' +
                    '<div class="col-md-6">' +
                        '<h6><i class="fas fa-hospital"></i> Dados do Exame</h6>' +
                        '<table class="table table-sm">' +
                            '<tr><th>Atendimento:</th><td>' + escapeHtml(order.visitNumber || '-') + '</td></tr>' +
                            '<tr><th>Acesso DICOM:</th><td>' + escapeHtml(order.accessionNumber || '-') + '</td></tr>' +
                            '<tr><th>Procedimento:</th><td>' + escapeHtml(order.serviceName || '-') + '</td></tr>' +
                        '</table>' +
                    '</div>' +
                '</div>' +
                '<div class="row mt-3">' +
                    '<div class="col-md-6">' +
                        '<h6><i class="fas fa-user-md"></i> Médicos</h6>' +
                        '<table class="table table-sm">' +
                            '<tr><th>Solicitante:</th><td>' + escapeHtml(order.orderingProviderName || '-') + '</td></tr>' +
                            '<tr><th>Executor:</th><td>' + escapeHtml(order.performingPhysicianName || '-') + '</td></tr>' +
                        '</table>' +
                    '</div>' +
                    '<div class="col-md-6">' +
                        '<h6><i class="fas fa-clock"></i> Controle de Envio</h6>' +
                        '<table class="table table-sm">' +
                            '<tr><th>Status:</th><td>' + escapeHtml(order.orderStatus) + '</td></tr>' +
                            '<tr><th>Data Liberação:</th><td>' + formatDateTime(order.reportApprovalDate) + '</td></tr>' +
                            '<tr><th>Envio Previsto:</th><td>' + formatDateTime(order.scheduledSendDate) + '</td></tr>' +
                            '<tr><th>Envio Manual:</th><td>' + (order.manualSendRequested ? 'Sim' : 'Não') + '</td></tr>' +
                            lastErrorRow +
                        '</table>' +
                    '</div>' +
                '</div>' +
                reportsHtml;

            $('#detailsContent').html(detailsHtml);
            detailsModal.show();
        },
        error: function(xhr) {
            showAlert('Erro ao buscar detalhes do order', 'danger');
        }
    });
}

function renderStepBadge(status) {
    var map = {
        'SUCCESS': '<span class="badge bg-success">OK</span>',
        'FAILED': '<span class="badge bg-danger">FALHA</span>',
        'SKIPPED': '<span class="badge bg-secondary">SKIP</span>',
        'PENDING': '<span class="badge bg-warning">PEND</span>'
    };
    return map[status] || '-';
}

function gwFilterByStatus(status) {
    gwActiveStatusFilter = status;

    // Sync the dropdown: PENDING_GROUP is a virtual group, not a single select value
    if (status === 'PENDING_GROUP') {
        $('#gwStatusFilter').val('PENDING');
    } else {
        $('#gwStatusFilter').val(status);
    }

    gwApplyStatusFilter();
}

function gwApplyStatusFilter() {
    if (!dashboardTable) return;

    var statusColumn = dashboardTable.column(6); // Status column index

    if (!gwActiveStatusFilter) {
        // Show all
        statusColumn.search('').draw();
    } else if (gwActiveStatusFilter === 'PENDING_GROUP') {
        // "Aguardando Envio" card groups PENDING + READY
        statusColumn.search('Pendente|Pronto', true, false).draw();
    } else {
        // Map enum values to the rendered badge text for DataTable search
        // DataTable strips HTML but may leave whitespace from icon elements
        var labelMap = {
            'PENDING': 'Pendente',
            'READY': 'Pronto',
            'DELIVERED': 'Enviado',
            'RETRY_EXHAUSTED': 'Retry Esgotado',
            'CANCELLED': 'Cancelado',
            'PORTAL_DELETED': 'Excluído do Portal'
        };
        var label = labelMap[gwActiveStatusFilter] || gwActiveStatusFilter;
        statusColumn.search(label, true, false).draw();
    }
}

function refreshOrders() {
    if (expandedGatewayNodes.size > 0) return;
    loadOrders();
}

// ========== Tree-View (Orders → Reports) ==========

function gw_toggleTreeNode(orderId) {
    var toggleIcon = $('#gw-toggle-' + orderId);
    var isExpanded = toggleIcon.hasClass('fa-chevron-down');

    if (isExpanded) {
        gw_collapseTreeNode(orderId);
        toggleIcon.removeClass('fa-chevron-down').addClass('fa-chevron-right');
        expandedGatewayNodes.delete(orderId);
    } else {
        gw_expandTreeNode(orderId);
        toggleIcon.removeClass('fa-chevron-right').addClass('fa-chevron-down');
        expandedGatewayNodes.add(orderId);
    }
}

function gw_expandTreeNode(orderId) {
    var groupRow = $('#gw-toggle-' + orderId).closest('tr');
    if (groupRow.length === 0) return;

    // Show loading indicator
    var loadingRow = '<tr class="tree-child" data-group-key="gw-' + orderId + '">' +
        '<td colspan="8" style="padding: 8px 20px; border-left: 3px solid #007bff;">' +
            '<i class="fas fa-spinner fa-spin me-2"></i>Carregando tentativas...' +
        '</td></tr>';
    groupRow.after(loadingRow);

    $.ajax({
        url: '/api/gateway/orders/' + orderId,
        method: 'GET',
        success: function(data) {
            // Remove loading row
            $('.tree-child[data-group-key="gw-' + orderId + '"]').remove();

            if (!data.success) return;

            var reports = data.reports || [];
            var childHtml;

            if (reports.length === 0) {
                childHtml = '<tr class="tree-child" data-group-key="gw-' + orderId + '">' +
                    '<td colspan="8" style="padding: 6px 20px; border-left: 3px solid #007bff;">' +
                        '<em class="text-muted"><i class="fas fa-info-circle me-1"></i>Nenhuma tentativa registrada</em>' +
                    '</td></tr>';
            } else {
                var reportRows = reports.map(function(r, idx) {
                    var statusBadge = '';
                    if (r.deliveryStatus === 'SUCCESS') {
                        statusBadge = '<span class="badge bg-success"><i class="fas fa-check-circle me-1"></i>Sucesso</span>';
                    } else if (r.deliveryStatus === 'FAILED') {
                        statusBadge = '<span class="badge bg-danger"><i class="fas fa-times-circle me-1"></i>Falha</span>';
                    } else if (r.deliveryStatus === 'PROCESSING') {
                        statusBadge = '<span class="badge bg-info"><i class="fas fa-spinner fa-spin me-1"></i>Processando</span>';
                    } else if (r.deliveryStatus === 'PENDING') {
                        statusBadge = '<span class="badge bg-warning"><i class="fas fa-clock me-1"></i>Pendente</span>';
                    } else if (r.deliveryStatus === 'SUPERSEDED') {
                        statusBadge = '<span class="badge bg-secondary"><i class="fas fa-history me-1"></i>Substituído</span>';
                    } else {
                        statusBadge = '<span class="badge bg-warning"><i class="fas fa-clock me-1"></i>' + escapeHtml(r.deliveryStatus) + '</span>';
                    }

                    return '<tr>' +
                        '<td class="text-center">' + (idx + 1) + '</td>' +
                        '<td>' + statusBadge + '</td>' +
                        '<td>' + renderStepBadge(r.statusRtfExtraction) + '</td>' +
                        '<td>' + renderStepBadge(r.statusPdfConversion) + '</td>' +
                        '<td>' + renderStepBadge(r.statusTemplateAddition) + '</td>' +
                        '<td>' + renderStepBadge(r.statusPdfMerge) + '</td>' +
                        '<td>' + renderStepBadge(r.statusS3Upload) + '</td>' +
                        '<td>' + renderStepBadge(r.statusApiCall) + '</td>' +
                        '<td>' + escapeHtml(r.deliveryEnvelopeId || '-') + '</td>' +
                        '<td>' + (r.processedAt ? formatDateTime(r.processedAt) : '-') + '</td>' +
                        '<td class="text-danger" style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="' +
                            escapeHtml(r.errorMessage || '') + '">' +
                            escapeHtml(r.errorMessage || '-') +
                        '</td>' +
                    '</tr>';
                }).join('');

                childHtml = '<tr class="tree-child" data-group-key="gw-' + orderId + '">' +
                    '<td colspan="8" style="padding: 6px 20px; border-left: 3px solid #007bff;">' +
                        '<strong style="font-size: 0.85rem;"><i class="fas fa-history me-1"></i>Tentativas (' + reports.length + ')</strong>' +
                        '<table class="table table-sm table-bordered table-tree-child mt-1 mb-0">' +
                            '<thead class="table-light">' +
                                '<tr>' +
                                    '<th style="width: 30px;">#</th>' +
                                    '<th>Status</th>' +
                                    '<th>Extração</th>' +
                                    '<th>PDF</th>' +
                                    '<th>Timbrado</th>' +
                                    '<th>Merge</th>' +
                                    '<th>S3</th>' +
                                    '<th>API</th>' +
                                    '<th>Envelope</th>' +
                                    '<th>Data</th>' +
                                    '<th>Erro</th>' +
                                '</tr>' +
                            '</thead>' +
                            '<tbody>' + reportRows + '</tbody>' +
                        '</table>' +
                    '</td></tr>';
            }

            groupRow.after(childHtml);
        },
        error: function() {
            $('.tree-child[data-group-key="gw-' + orderId + '"]').remove();
        }
    });
}

function gw_collapseTreeNode(orderId) {
    $('.tree-child[data-group-key="gw-' + orderId + '"]').remove();
}

function formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return '-';

    var date = new Date(dateTimeStr);
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Note: showAlert is provided by ui-utils.js (loaded globally)
