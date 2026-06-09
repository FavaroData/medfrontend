/**
 * Gateway - Patient Logins Dashboard Tab
 * Gerenciamento de sincronização de logins de pacientes
 */

let gwPatientLoginsTable;
let gwPatientLoginsInitialized = false;
let gwPatientLoginsActiveStatusFilter = '';

/**
 * Inicializa a aba de logins de pacientes.
 * Chamado após o fragment HTML ser carregado via AJAX.
 */
function initGatewayPatientLogins() {
    if (gwPatientLoginsInitialized) return;

    console.log('[Gateway] Initializing patient logins tab...');

    gwInitPatientLoginsDataTable();
    gwSetupPatientLoginsEventListeners();
    gwLoadPatientLogins();

    gwPatientLoginsInitialized = true;
    console.log('[Gateway] Patient logins tab initialized');
}

function gwInitPatientLoginsDataTable() {
    gwPatientLoginsTable = $('#gwPatientLoginsTable').DataTable({
        autoWidth: false,
        columns: [
            {
                data: 'pid',
                title: 'PID',
                width: '8%',
                render: function(data) {
                    return '<span class="badge bg-secondary">' + escapeHtml(data) + '</span>';
                }
            },
            {
                data: 'patientName',
                title: 'Nome Paciente',
                width: '20%',
                render: function(data) {
                    return data ? escapeHtml(data) : '<em class="text-muted">-</em>';
                }
            },
            {
                data: 'patientAccessCode',
                title: 'Cód. Acesso',
                width: '12%',
                render: function(data) {
                    return data ? escapeHtml(data) : '<em class="text-muted">-</em>';
                }
            },
            {
                data: 'syncStatus',
                title: 'Status',
                width: '12%',
                render: function(data) {
                    return gwRenderSyncStatusBadge(data);
                }
            },
            {
                data: 'syncAction',
                title: 'Ação',
                width: '10%',
                render: function(data) {
                    if (!data) return '<em class="text-muted">-</em>';
                    var badge = data === 'CREATED'
                        ? '<span class="badge bg-info">Criado</span>'
                        : '<span class="badge bg-primary">Atualizado</span>';
                    return badge;
                }
            },
            {
                data: 'oracleConfirmed',
                title: 'Oracle',
                width: '8%',
                render: function(data) {
                    return data
                        ? '<span class="badge bg-success"><i class="fas fa-check"></i></span>'
                        : '<span class="badge bg-secondary"><i class="fas fa-times"></i></span>';
                }
            },
            {
                data: 'lastSyncedAt',
                title: 'Última Sync',
                width: '13%',
                render: function(data) {
                    return data ? formatDateTime(data) : '<em class="text-muted">-</em>';
                }
            },
            {
                data: 'lastErrorMessage',
                title: 'Erro',
                width: '12%',
                render: function(data) {
                    if (!data) return '<em class="text-muted">-</em>';
                    var truncated = data.length > 50 ? data.substring(0, 50) + '...' : data;
                    return '<span class="text-danger" title="' + escapeHtml(data) + '">' +
                        escapeHtml(truncated) + '</span>';
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
                            '<button class="btn-icon-only" onclick="gwRetryPatientLogin(\'' + escapeHtml(row.pid) + '\')" title="Retry">' +
                                '<i class="fas fa-redo"></i>' +
                            '</button>';
                        if (row.patientAccessCode) {
                            html += '<button class="btn-icon-only" onclick="gwMigratePatientPid(\'' +
                                escapeHtml(row.pid) + '\', \'' + escapeHtml(row.patientAccessCode) + '\')" ' +
                                'title="Atualizar PID — migrar paciente existente (mesmo CPF) para este PID">' +
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
        order: [[6, 'desc']],
        pageLength: parseInt(localStorage.getItem('gwPatientLoginsPageSize')) || 25
    });

    // Page size change handler
    $('#gwPatientLoginsItemsPerPageSelect').off('change').on('change', function() {
        var pageSize = parseInt($(this).val());
        gwPatientLoginsTable.page.len(pageSize).draw();
        localStorage.setItem('gwPatientLoginsPageSize', pageSize);
    });

    // Search handler
    $('#gwPatientLoginsSearchInput').off('keyup').on('keyup', function() {
        gwPatientLoginsTable.search($(this).val()).draw();
    });

    // Clear search button
    $('#gwPatientLoginsClearSearchBtn').off('click').on('click', function() {
        $('#gwPatientLoginsSearchInput').val('');
        gwPatientLoginsTable.search('').draw();
        $(this).hide();
    });

    // Show/hide clear button
    $('#gwPatientLoginsSearchInput').off('input').on('input', function() {
        $('#gwPatientLoginsClearSearchBtn').toggle($(this).val().length > 0);
    });
}

function gwSetupPatientLoginsEventListeners() {
    $('#gwPatientLoginsDateFilter').on('change', function() {
        gwLoadPatientLogins();
    });

    $('#gwPatientLoginsStatusFilter').on('change', function() {
        gwFilterPatientLoginsByStatus($(this).val());
    });
}

function gwGetPatientLoginsDateFilter() {
    var el = document.getElementById('gwPatientLoginsDateFilter');
    return el ? el.value : '7';
}

function gwLoadPatientLogins() {
    var dateFilter = gwGetPatientLoginsDateFilter();
    var params = dateFilter ? { dateFilter: dateFilter } : {};

    $.ajax({
        url: '/api/gateway/patient-logins',
        method: 'GET',
        data: params,
        success: function(data) {
            gwPatientLoginsTable.clear();
            gwPatientLoginsTable.rows.add(data);
            gwPatientLoginsTable.draw();
            gwUpdatePatientLoginsStats(data);
            if (gwPatientLoginsActiveStatusFilter) {
                gwApplyPatientLoginsStatusFilter();
            }
        },
        error: function(xhr) {
            console.error('Erro ao carregar logins de pacientes:', xhr);
            showAlert('Erro ao carregar logins de pacientes', 'danger');
        }
    });
}

function gwUpdatePatientLoginsStats(data) {
    var total = data.length;
    var synced = data.filter(function(d) { return d.syncStatus === 'SYNCED'; }).length;
    var errors = data.filter(function(d) {
        return d.syncStatus === 'API_ERROR' || d.syncStatus === 'ORACLE_ERROR' || d.syncStatus === 'RETRY_EXHAUSTED';
    }).length;
    var pending = data.filter(function(d) { return d.syncStatus === 'PENDING'; }).length;

    $('#gwPatientLoginsTotal').text(total);
    $('#gwPatientLoginsSynced').text(synced);
    $('#gwPatientLoginsErrors').text(errors);
    $('#gwPatientLoginsPending').text(pending);
}

function gwRefreshPatientLogins() {
    gwLoadPatientLogins();
}

function gwTriggerPatientSync() {
    if (!confirm('Sincronizar logins de pacientes agora?')) return;

    showAlert('Iniciando sincronização de logins de pacientes...', 'info');

    $.ajax({
        url: '/api/gateway/patient-logins/sync-now',
        method: 'POST',
        success: function(response) {
            if (response.success) {
                showAlert(escapeHtml(response.message), 'success');
                gwLoadPatientLogins();
            } else {
                showAlert(escapeHtml(response.message), 'danger');
            }
        },
        error: function(xhr) {
            showAlert('Erro ao sincronizar logins de pacientes', 'danger');
        }
    });
}

function gwRetryPatientLogin(pid) {
    if (!confirm('Marcar login do paciente ' + pid + ' para retry?')) return;

    $.ajax({
        url: '/api/gateway/patient-logins/' + encodeURIComponent(pid) + '/retry',
        method: 'POST',
        success: function(response) {
            if (response.success) {
                showAlert(escapeHtml(response.message), 'success');
                gwLoadPatientLogins();
            } else {
                showAlert(escapeHtml(response.message), 'danger');
            }
        },
        error: function(xhr) {
            showAlert('Erro ao solicitar retry', 'danger');
        }
    });
}

function gwMigratePatientPid(pid, accessCode) {
    var msg = 'Atualizar o PID do paciente com CPF ' + accessCode + ' para ' + pid + '?\n\n' +
        'A API Meddrive irá localizar o paciente existente pelo CPF e reassociar todos os ' +
        'laudos para o novo PID. Use quando o paciente já existe no portal com PID antigo.';
    if (!confirm(msg)) return;

    $.ajax({
        url: '/api/gateway/patient-logins/' + encodeURIComponent(pid) + '/migrate-pid',
        method: 'POST',
        success: function(response) {
            showAlert(escapeHtml(response.message), response.success ? 'success' : 'danger');
            if (response.success) gwLoadPatientLogins();
        },
        error: function(xhr) {
            showAlert('Erro ao migrar PID', 'danger');
        }
    });
}

// ========== Status Filter ==========

function gwFilterPatientLoginsByStatus(status) {
    gwPatientLoginsActiveStatusFilter = status;

    // Sync the dropdown: ERROR_GROUP is a virtual group
    if (status === 'ERROR_GROUP') {
        $('#gwPatientLoginsStatusFilter').val('API_ERROR');
    } else {
        $('#gwPatientLoginsStatusFilter').val(status);
    }

    gwApplyPatientLoginsStatusFilter();
}

function gwApplyPatientLoginsStatusFilter() {
    if (!gwPatientLoginsTable) return;

    var statusColumn = gwPatientLoginsTable.column(3); // syncStatus column index

    if (!gwPatientLoginsActiveStatusFilter) {
        statusColumn.search('').draw();
    } else if (gwPatientLoginsActiveStatusFilter === 'ERROR_GROUP') {
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
        var label = labelMap[gwPatientLoginsActiveStatusFilter] || gwPatientLoginsActiveStatusFilter;
        statusColumn.search(label, true, false).draw();
    }
}

/**
 * Renderiza badge de status de sync (compartilhado entre patient e provider).
 */
function gwRenderSyncStatusBadge(status) {
    var statusMap = {
        'PENDING': '<span class="badge bg-warning"><i class="fas fa-clock"></i> Pendente</span>',
        'SYNCED': '<span class="badge bg-success"><i class="fas fa-check-circle"></i> Sincronizado</span>',
        'API_ERROR': '<span class="badge bg-danger"><i class="fas fa-exclamation-triangle"></i> Erro API</span>',
        'ORACLE_ERROR': '<span class="badge bg-warning"><i class="fas fa-database"></i> Erro Oracle</span>',
        'RETRY_EXHAUSTED': '<span class="badge bg-dark"><i class="fas fa-ban"></i> Retry Esgotado</span>'
    };
    return statusMap[status] || '<span class="badge bg-secondary">' + escapeHtml(status || '-') + '</span>';
}
