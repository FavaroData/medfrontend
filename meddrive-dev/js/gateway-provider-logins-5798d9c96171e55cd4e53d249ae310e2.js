/**
 * Gateway - Provider Logins Dashboard Tab
 * Gerenciamento de sincronização de logins de prestadores (médicos)
 */

let gwProviderLoginsTable;
let gwProviderLoginsInitialized = false;
let gwProviderLoginsActiveStatusFilter = '';

/**
 * Inicializa a aba de logins de prestadores.
 * Chamado após o fragment HTML ser carregado via AJAX.
 */
function initGatewayProviderLogins() {
    if (gwProviderLoginsInitialized) return;

    console.log('[Gateway] Initializing provider logins tab...');

    gwInitProviderLoginsDataTable();
    gwSetupProviderLoginsEventListeners();
    gwLoadProviderLogins();

    gwProviderLoginsInitialized = true;
    console.log('[Gateway] Provider logins tab initialized');
}

function gwInitProviderLoginsDataTable() {
    gwProviderLoginsTable = $('#gwProviderLoginsTable').DataTable({
        autoWidth: false,
        columns: [
            {
                data: 'providerId',
                title: 'ID',
                width: '7%',
                render: function(data) {
                    return '<span class="badge bg-secondary">' + escapeHtml(data) + '</span>';
                }
            },
            {
                data: 'providerName',
                title: 'Nome',
                width: '20%',
                render: function(data) {
                    return data ? escapeHtml(data) : '<em class="text-muted">-</em>';
                }
            },
            {
                data: 'providerAccessCode',
                title: 'Cód. Acesso',
                width: '10%',
                render: function(data) {
                    return data ? escapeHtml(data) : '<em class="text-muted">-</em>';
                }
            },
            {
                data: 'providerLicenseNumber',
                title: 'CRM',
                width: '8%',
                render: function(data) {
                    return data ? escapeHtml(data) : '<em class="text-muted">-</em>';
                }
            },
            {
                data: 'providerEmail',
                title: 'Email',
                width: '15%',
                render: function(data) {
                    return data ? escapeHtml(data) : '<em class="text-muted">-</em>';
                }
            },
            {
                data: 'syncStatus',
                title: 'Status',
                width: '10%',
                render: function(data) {
                    return gwRenderSyncStatusBadge(data);
                }
            },
            {
                data: 'oracleConfirmed',
                title: 'Oracle',
                width: '6%',
                render: function(data) {
                    return data
                        ? '<span class="badge bg-success"><i class="fas fa-check"></i></span>'
                        : '<span class="badge bg-secondary"><i class="fas fa-times"></i></span>';
                }
            },
            {
                data: 'lastSyncedAt',
                title: 'Última Sync',
                width: '12%',
                render: function(data) {
                    return data ? formatDateTime(data) : '<em class="text-muted">-</em>';
                }
            },
            {
                data: null,
                title: 'Ações',
                width: '8%',
                orderable: false,
                render: function(data, type, row) {
                    if (row.syncStatus === 'API_ERROR' || row.syncStatus === 'ORACLE_ERROR' || row.syncStatus === 'RETRY_EXHAUSTED') {
                        var html = '<div class="d-flex gap-1" style="white-space:nowrap;">' +
                            '<button class="btn-icon-only" onclick="gwRetryProviderLogin(\'' + escapeHtml(row.providerId) + '\')" title="Retry">' +
                                '<i class="fas fa-redo"></i>' +
                            '</button>';
                        if (row.providerAccessCode) {
                            html += '<button class="btn-icon-only" onclick="gwMigrateProviderId(\'' +
                                escapeHtml(row.providerId) + '\', \'' + escapeHtml(row.providerAccessCode) + '\')" ' +
                                'title="Atualizar ID — migrar provider existente (mesmo código de acesso) para este ID">' +
                                '<i class="fas fa-id-card"></i>' +
                            '</button>';
                        }
                        return html + '</div>';
                    }
                    return '';
                }
            }
        ],
        dom: 'rtip',
        language: {
            url: '/i18n/pt-BR.json'
        },
        order: [[7, 'desc']],
        pageLength: parseInt(localStorage.getItem('gwProviderLoginsPageSize')) || 25
    });

    // Page size change handler
    $('#gwProviderLoginsItemsPerPageSelect').off('change').on('change', function() {
        var pageSize = parseInt($(this).val());
        gwProviderLoginsTable.page.len(pageSize).draw();
        localStorage.setItem('gwProviderLoginsPageSize', pageSize);
    });

    // Search handler
    $('#gwProviderLoginsSearchInput').off('keyup').on('keyup', function() {
        gwProviderLoginsTable.search($(this).val()).draw();
    });

    // Clear search button
    $('#gwProviderLoginsClearSearchBtn').off('click').on('click', function() {
        $('#gwProviderLoginsSearchInput').val('');
        gwProviderLoginsTable.search('').draw();
        $(this).hide();
    });

    // Show/hide clear button
    $('#gwProviderLoginsSearchInput').off('input').on('input', function() {
        $('#gwProviderLoginsClearSearchBtn').toggle($(this).val().length > 0);
    });
}

function gwSetupProviderLoginsEventListeners() {
    $('#gwProviderLoginsDateFilter').on('change', function() {
        gwLoadProviderLogins();
    });

    $('#gwProviderLoginsStatusFilter').on('change', function() {
        gwFilterProviderLoginsByStatus($(this).val());
    });
}

function gwGetProviderLoginsDateFilter() {
    var el = document.getElementById('gwProviderLoginsDateFilter');
    return el ? el.value : '7';
}

function gwLoadProviderLogins() {
    var dateFilter = gwGetProviderLoginsDateFilter();
    var params = dateFilter ? { dateFilter: dateFilter } : {};

    $.ajax({
        url: '/api/gateway/provider-logins',
        method: 'GET',
        data: params,
        success: function(data) {
            gwProviderLoginsTable.clear();
            gwProviderLoginsTable.rows.add(data);
            gwProviderLoginsTable.draw();
            gwUpdateProviderLoginsStats(data);
            if (gwProviderLoginsActiveStatusFilter) {
                gwApplyProviderLoginsStatusFilter();
            }
        },
        error: function(xhr) {
            console.error('Erro ao carregar logins de prestadores:', xhr);
            showAlert('Erro ao carregar logins de prestadores', 'danger');
        }
    });
}

function gwUpdateProviderLoginsStats(data) {
    var total = data.length;
    var synced = data.filter(function(d) { return d.syncStatus === 'SYNCED'; }).length;
    var errors = data.filter(function(d) {
        return d.syncStatus === 'API_ERROR' || d.syncStatus === 'ORACLE_ERROR' || d.syncStatus === 'RETRY_EXHAUSTED';
    }).length;
    var pending = data.filter(function(d) { return d.syncStatus === 'PENDING'; }).length;

    $('#gwProviderLoginsTotal').text(total);
    $('#gwProviderLoginsSynced').text(synced);
    $('#gwProviderLoginsErrors').text(errors);
    $('#gwProviderLoginsPending').text(pending);
}

function gwRefreshProviderLogins() {
    gwLoadProviderLogins();
}

function gwTriggerProviderSync() {
    if (!confirm('Sincronizar logins de prestadores agora?')) return;

    showAlert('Iniciando sincronização de logins de prestadores...', 'info');

    $.ajax({
        url: '/api/gateway/provider-logins/sync-now',
        method: 'POST',
        success: function(response) {
            if (response.success) {
                showAlert(escapeHtml(response.message), 'success');
                gwLoadProviderLogins();
            } else {
                showAlert(escapeHtml(response.message), 'danger');
            }
        },
        error: function(xhr) {
            showAlert('Erro ao sincronizar logins de prestadores', 'danger');
        }
    });
}

// ========== Status Filter ==========

function gwFilterProviderLoginsByStatus(status) {
    gwProviderLoginsActiveStatusFilter = status;

    // Sync the dropdown: ERROR_GROUP is a virtual group
    if (status === 'ERROR_GROUP') {
        $('#gwProviderLoginsStatusFilter').val('API_ERROR');
    } else {
        $('#gwProviderLoginsStatusFilter').val(status);
    }

    gwApplyProviderLoginsStatusFilter();
}

function gwApplyProviderLoginsStatusFilter() {
    if (!gwProviderLoginsTable) return;

    var statusColumn = gwProviderLoginsTable.column(5); // syncStatus column index

    if (!gwProviderLoginsActiveStatusFilter) {
        statusColumn.search('').draw();
    } else if (gwProviderLoginsActiveStatusFilter === 'ERROR_GROUP') {
        // "Erros" card groups API_ERROR + ORACLE_ERROR + RETRY_EXHAUSTED
        statusColumn.search('Erro API|Erro Oracle|Retry Esgotado', true, false).draw();
    } else {
        var labelMap = {
            'PENDING': 'Pendente',
            'SYNCED': 'Sincronizado',
            'API_ERROR': 'Erro API',
            'ORACLE_ERROR': 'Erro Oracle',
            'RETRY_EXHAUSTED': 'Retry Esgotado'
        };
        var label = labelMap[gwProviderLoginsActiveStatusFilter] || gwProviderLoginsActiveStatusFilter;
        statusColumn.search(label, true, false).draw();
    }
}

function gwRetryProviderLogin(providerId) {
    if (!confirm('Marcar login do prestador ' + providerId + ' para retry?')) return;

    $.ajax({
        url: '/api/gateway/provider-logins/' + encodeURIComponent(providerId) + '/retry',
        method: 'POST',
        success: function(response) {
            if (response.success) {
                showAlert(escapeHtml(response.message), 'success');
                gwLoadProviderLogins();
            } else {
                showAlert(escapeHtml(response.message), 'danger');
            }
        },
        error: function(xhr) {
            showAlert('Erro ao solicitar retry', 'danger');
        }
    });
}

function gwMigrateProviderId(providerId, accessCode) {
    var msg = 'Atualizar o ID do prestador com código de acesso ' + accessCode + ' para ' + providerId + '?\n\n' +
        'A API Meddrive irá localizar o prestador existente pelo código de acesso e reassociar todos os ' +
        'laudos para o novo ID. Use quando o prestador já existe no portal com ID antigo.';
    if (!confirm(msg)) return;

    $.ajax({
        url: '/api/gateway/provider-logins/' + encodeURIComponent(providerId) + '/migrate-provider-id',
        method: 'POST',
        success: function(response) {
            showAlert(escapeHtml(response.message), response.success ? 'success' : 'danger');
            if (response.success) gwLoadProviderLogins();
        },
        error: function(xhr) {
            showAlert('Erro ao migrar providerId', 'danger');
        }
    });
}
