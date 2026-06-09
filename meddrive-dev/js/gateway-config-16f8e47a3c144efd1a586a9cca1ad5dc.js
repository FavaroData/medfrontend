/**
 * Gateway - Config Page JavaScript
 * Gerenciamento de configurações de tempo de espera por procedimento
 */

let gwConfigTable;
let gwAddConfigModal;
let gwEditConfigModal;
let gwEditDefaultTimeModal;
let gwDefaultWaitingTimeMinutes = 120;

/**
 * Sanitiza texto para prevenir XSS ao inserir em HTML.
 */
function gwEscapeHtml(text) {
    if (text == null) return '';
    var str = String(text);
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

/**
 * Inicializa a página de configuração do Gateway.
 * Chamado pelo dashboard.js após o fragment HTML ser carregado.
 */
function initGatewayConfig() {
    console.log('[Gateway] Initializing config page...');

    // Initialize modals
    var addEl = document.getElementById('addConfigModal');
    var editEl = document.getElementById('editConfigModal');
    var defaultTimeEl = document.getElementById('editDefaultTimeModal');
    if (addEl) gwAddConfigModal = new bootstrap.Modal(addEl);
    if (editEl) gwEditConfigModal = new bootstrap.Modal(editEl);
    if (defaultTimeEl) gwEditDefaultTimeModal = new bootstrap.Modal(defaultTimeEl);

    // Initialize DataTable
    initializeGatewayConfigDataTable();

    // Load default waiting time and configurations
    gwLoadDefaultWaitingTime();
    gwLoadConfigurations();

    // Setup event listeners
    setupGatewayConfigEventListeners();

    console.log('[Gateway] Config page initialized successfully');
}

function initializeGatewayConfigDataTable() {
    gwConfigTable = $('#gatewayConfigTable').DataTable({
        autoWidth: false,
        dom: 'rt<"bottom"ip><"clear">',
        columns: [
            {
                data: 'id',
                title: 'ID',
                width: '8%',
                render: function(data) {
                    return '<span class="badge bg-secondary">' + data + '</span>';
                }
            },
            {
                data: 'serviceCode',
                title: 'Código Procedimento',
                width: '20%',
                render: function(data) {
                    return '<code>' + gwEscapeHtml(data) + '</code>';
                }
            },
            {
                data: 'serviceName',
                title: 'Descrição',
                width: '30%',
                render: function(data) {
                    return data ? gwEscapeHtml(data) : '<em class="text-muted">Sem descrição</em>';
                }
            },
            {
                data: 'waitingTimeMinutes',
                title: 'Tempo Espera (min)',
                width: '15%',
                render: function(data) {
                    var hours = Math.floor(data / 60);
                    var minutes = data % 60;
                    var timeStr = data + ' min';
                    if (hours > 0) {
                        timeStr += ' (' + hours + 'h' + (minutes > 0 ? minutes + 'm' : '') + ')';
                    }
                    return '<span class="badge bg-info">' + gwEscapeHtml(timeStr) + '</span>';
                }
            },
            {
                data: 'enabled',
                title: 'Status',
                width: '12%',
                render: function(data) {
                    return data
                        ? '<span class="badge bg-success"><i class="fas fa-check-circle"></i> Ativo</span>'
                        : '<span class="badge bg-warning"><i class="fas fa-pause-circle"></i> Inativo</span>';
                }
            },
            {
                data: null,
                title: 'Ações',
                width: '15%',
                orderable: false,
                render: function(data, type, row) {
                    return '<button class="btn-icon-only" onclick="gwEditConfig(' + row.id + ')" title="Editar">' +
                            '<i class="fas fa-edit"></i>' +
                        '</button>' +
                        '<button class="btn-icon-only" onclick="gwDeleteConfig(' + row.id + ')" title="Deletar">' +
                            '<i class="fas fa-trash"></i>' +
                        '</button>';
                }
            }
        ],
        language: {
            url: '/i18n/pt-BR.json'
        },
        order: [[1, 'asc']],
        pageLength: parseInt(localStorage.getItem('gatewayConfigPageSize')) || 25
    });

    // Page size change handler
    $('#gatewayConfigPageSize').on('change', function() {
        var pageSize = parseInt($(this).val());
        gwConfigTable.page.len(pageSize).draw();
        localStorage.setItem('gatewayConfigPageSize', pageSize);
    });

    // Search handler
    $('#gatewayConfigSearch').on('keyup', function() {
        gwConfigTable.search($(this).val()).draw();
    });
}

function setupGatewayConfigEventListeners() {
    // Add button
    $('#gatewayAddConfigBtn').on('click', function() {
        $('#addConfigForm')[0].reset();
        $('#waitingTimeMinutes').val(120);
        gwAddConfigModal.show();
    });
}

function gwLoadConfigurations() {
    $.ajax({
        url: '/api/gateway/config',
        method: 'GET',
        success: function(data) {
            gwConfigTable.clear();
            gwConfigTable.rows.add(data);
            gwConfigTable.draw();
            gwUpdateStatistics(data);
        },
        error: function(xhr) {
            console.error('Erro ao carregar configurações:', xhr);
            showAlert('Erro ao carregar configurações', 'danger');
        }
    });
}

function gwUpdateStatistics(configs) {
    $('#totalConfigs').text(configs.length);

    var activeCount = configs.filter(function(c) { return c.enabled; }).length;
    var inactiveCount = configs.length - activeCount;

    $('#activeConfigs').text(activeCount);
    $('#inactiveConfigs').text(inactiveCount);
}

function gwAddConfiguration() {
    var formData = new FormData($('#addConfigForm')[0]);

    var configData = {
        serviceCode: formData.get('serviceCode'),
        serviceName: formData.get('serviceName'),
        waitingTimeMinutes: parseInt(formData.get('waitingTimeMinutes')),
        enabled: formData.get('enabled') === 'on'
    };

    $.ajax({
        url: '/api/gateway/config',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(configData),
        success: function(response) {
            if (response.success) {
                showAlert(gwEscapeHtml(response.message), 'success');
                gwAddConfigModal.hide();
                gwLoadConfigurations();
            } else {
                showAlert(gwEscapeHtml(response.message), 'danger');
            }
        },
        error: function(xhr) {
            console.error('Erro ao criar configuração:', xhr);
            var msg = 'Erro ao criar configuração';
            if (xhr.responseJSON && xhr.responseJSON.message) {
                msg = xhr.responseJSON.message;
            }
            showAlert(gwEscapeHtml(msg), 'danger');
        }
    });
}

function gwEditConfig(id) {
    $.ajax({
        url: '/api/gateway/config/' + id,
        method: 'GET',
        success: function(config) {
            $('#gatewayEditConfigId').val(config.id);
            $('#editProcedureCode').val(config.serviceCode);
            $('#editProcedureName').val(config.serviceName);
            $('#editWaitingTimeMinutes').val(config.waitingTimeMinutes);
            $('#gatewayEditEnabled').prop('checked', config.enabled);

            gwEditConfigModal.show();
        },
        error: function(xhr) {
            console.error('Erro ao buscar configuração:', xhr);
            showAlert('Erro ao buscar configuração', 'danger');
        }
    });
}

function gwUpdateConfiguration() {
    var id = $('#gatewayEditConfigId').val();

    var configData = {
        serviceName: $('#editProcedureName').val(),
        waitingTimeMinutes: parseInt($('#editWaitingTimeMinutes').val()),
        enabled: $('#gatewayEditEnabled').is(':checked')
    };

    $.ajax({
        url: '/api/gateway/config/' + id,
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify(configData),
        success: function(response) {
            if (response.success) {
                showAlert(gwEscapeHtml(response.message), 'success');
                gwEditConfigModal.hide();
                gwLoadConfigurations();
            } else {
                showAlert(gwEscapeHtml(response.message), 'danger');
            }
        },
        error: function(xhr) {
            console.error('Erro ao atualizar configuração:', xhr);
            var msg = 'Erro ao atualizar configuração';
            if (xhr.responseJSON && xhr.responseJSON.message) {
                msg = xhr.responseJSON.message;
            }
            showAlert(gwEscapeHtml(msg), 'danger');
        }
    });
}

function gwDeleteConfig(id) {
    if (!confirm('Tem certeza que deseja deletar esta configuração? Orders associados não serão afetados.')) {
        return;
    }

    $.ajax({
        url: '/api/gateway/config/' + id,
        method: 'DELETE',
        success: function(response) {
            if (response.success) {
                showAlert(gwEscapeHtml(response.message), 'success');
                gwLoadConfigurations();
            } else {
                showAlert(gwEscapeHtml(response.message), 'danger');
            }
        },
        error: function(xhr) {
            console.error('Erro ao deletar configuração:', xhr);
            showAlert('Erro ao deletar configuração', 'danger');
        }
    });
}

function gwRefreshConfigurations() {
    showAlert('Atualizando configurações...', 'info');
    gwLoadDefaultWaitingTime();
    gwLoadConfigurations();
}

// ========== REGRA GERAL (Tempo Padrão) ==========

function gwLoadDefaultWaitingTime() {
    $.ajax({
        url: '/api/gateway/config/default-waiting-time',
        method: 'GET',
        success: function(data) {
            gwDefaultWaitingTimeMinutes = data.minutes;
            $('#defaultTime').text(data.minutes + ' min');
        },
        error: function(xhr) {
            console.error('Erro ao carregar tempo padrão:', xhr);
            $('#defaultTime').text('- min');
        }
    });
}

function gwShowEditDefaultTime() {
    $('#defaultWaitingTimeMinutes').val(gwDefaultWaitingTimeMinutes);
    gwEditDefaultTimeModal.show();
}

function gwSaveDefaultWaitingTime() {
    var minutes = parseInt($('#defaultWaitingTimeMinutes').val());

    if (isNaN(minutes) || minutes < 0) {
        showAlert('Informe um valor válido (>= 0)', 'danger');
        return;
    }

    $.ajax({
        url: '/api/gateway/config/default-waiting-time',
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({ minutes: minutes }),
        success: function(response) {
            if (response.success) {
                showAlert(gwEscapeHtml(response.message), 'success');
                gwEditDefaultTimeModal.hide();
                gwDefaultWaitingTimeMinutes = minutes;
                $('#defaultTime').text(minutes + ' min');
            } else {
                showAlert(gwEscapeHtml(response.message), 'danger');
            }
        },
        error: function(xhr) {
            console.error('Erro ao atualizar tempo padrão:', xhr);
            showAlert('Erro ao atualizar tempo padrão', 'danger');
        }
    });
}

// Note: showAlert is provided by ui-utils.js (loaded globally)
