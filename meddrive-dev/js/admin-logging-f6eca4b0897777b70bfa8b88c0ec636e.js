/**
 * Admin Logging Management
 *
 * Gerencia níveis de log em runtime via /admin/api/loggers.
 * Alterações são efêmeras (perdem-se ao reiniciar a aplicação).
 */
var AdminLogging = (function () {
    var supportedLevels = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'OFF'];

    // Atalhos por módulo. Setar DEBUG aqui afeta TODAS as classes do pacote
    // (e subpacotes) — uma classe filha só permanece em outro nível se tiver
    // configuredLevel próprio. Para granularidade por classe, use o bloco
    // "Adicionar logger customizado" abaixo.
    var quickToggles = [
        {
            name: 'com.meddrive.imager',
            label: 'Imager',
            description: 'Processamento de PDFs/imagens, matching, Step 1–4, repositórios'
        },
        {
            name: 'com.meddrive.gateway',
            label: 'Gateway',
            description: 'Sincronização de logins/providers com Tasy'
        },
        {
            name: 'com.meddrive.dicomserver',
            label: 'DICOM Server',
            description: 'SCP DICOM, recepção e armazenamento'
        },
        {
            name: 'com.meddrive.dicomworklist',
            label: 'DICOM Worklist v1',
            description: 'Worklist legado (será descontinuado)'
        },
        {
            name: 'com.meddrive.dicomworklistv2',
            label: 'DICOM Worklist v2',
            description: 'Multi-SCP configurável, persistência H2'
        },
        {
            name: 'com.meddrive.dicomprint',
            label: 'DICOM Print',
            description: 'Print SCP, compositor Java2D, renderização'
        },
        {
            name: 'com.meddrive.config',
            label: 'Configuração / Admin',
            description: 'app_configurations, autenticação, admin UI'
        },
        {
            name: 'com.meddrive.logs',
            label: 'Logs / CloudWatch',
            description: 'Integração com CloudWatch, métricas'
        }
    ];

    function init() {
        loadLoggers();
        renderQuickToggles();
        bindEvents();
    }

    function loadLoggers() {
        $.get('/admin/api/loggers')
            .done(function (data) {
                if (data && Array.isArray(data.supportedLevels) && data.supportedLevels.length) {
                    supportedLevels = data.supportedLevels;
                }
                renderLoggersTable(data.loggers || []);
                refreshQuickTogglesState(data.loggers || []);
            })
            .fail(function (xhr) {
                showAlert('danger', 'Falha ao carregar loggers: '
                    + (xhr.responseJSON && xhr.responseJSON.error ? xhr.responseJSON.error : xhr.statusText));
            });
    }

    // Botões de atalho exibidos por linha. DEBUG é a ação principal (destaque),
    // INFO e WARN são alternativas frequentes. TRACE/ERROR/OFF ficam no select da
    // tabela completa abaixo. Resetar restaura o nível do logback-spring.xml.
    var QUICK_BUTTONS = [
        { level: 'DEBUG', className: 'btn-primary',         label: 'DEBUG' },
        { level: 'INFO',  className: 'btn-outline-success', label: 'INFO'  },
        { level: 'WARN',  className: 'btn-outline-warning', label: 'WARN'  }
    ];

    function renderQuickToggles() {
        var container = $('#loggingQuickToggles');
        container.empty();
        quickToggles.forEach(function (qt) {
            var row = $('<div class="list-group-item d-flex justify-content-between align-items-center"></div>');
            var left = $('<div class="me-3"></div>');
            left.append($('<div class="fw-semibold"></div>').text(qt.label));
            if (qt.description) {
                left.append($('<small class="text-muted d-block"></small>').text(qt.description));
            }
            left.append($('<small class="text-muted font-monospace d-block"></small>').text(qt.name));

            var right = $('<div class="text-end text-nowrap"></div>');
            right.append($('<span class="badge bg-secondary me-2" data-quick-effective="' + qt.name + '">—</span>'));

            QUICK_BUTTONS.forEach(function (btn) {
                right.append($('<button type="button" class="btn btn-sm me-1"></button>')
                    .addClass(btn.className)
                    .text(btn.label)
                    .on('click', function () { setLevel(qt.name, btn.level); }));
            });

            right.append($('<button type="button" class="btn btn-sm btn-outline-secondary">Resetar</button>')
                .on('click', function () { resetLogger(qt.name); }));

            row.append(left).append(right);
            container.append(row);
        });
    }

    function refreshQuickTogglesState(loggers) {
        var byName = {};
        loggers.forEach(function (l) { byName[l.name] = l; });
        quickToggles.forEach(function (qt) {
            var badge = $('[data-quick-effective="' + qt.name + '"]');
            if (!badge.length) return;
            var info = byName[qt.name];
            if (info) {
                badge.text(info.effectiveLevel || '—');
                badge.attr('class', 'badge me-2 ' + levelClass(info.effectiveLevel));
            } else {
                // Logger ainda não inicializado pelo Spring; ainda aceitável aplicar SET
                badge.text('not loaded').attr('class', 'badge bg-light text-dark me-2');
            }
        });
    }

    function renderLoggersTable(loggers) {
        var tbody = $('#loggersTableBody');
        tbody.empty();
        if (!loggers.length) {
            tbody.append('<tr><td colspan="4" class="text-center text-muted">Nenhum logger encontrado.</td></tr>');
            return;
        }
        loggers.forEach(function (l) {
            var tr = $('<tr></tr>');
            tr.append($('<td class="font-monospace small"></td>').text(l.name));
            var configured = l.configuredLevel || '—';
            var effective = l.effectiveLevel || '—';
            tr.append($('<td></td>').append(
                l.configuredLevel
                    ? $('<span></span>').addClass('badge ' + levelClass(l.configuredLevel)).text(configured)
                    : $('<span class="text-muted small"></span>').text('herdado')
            ));
            tr.append($('<td></td>').append(
                $('<span></span>').addClass('badge ' + levelClass(effective)).text(effective)
            ));

            var actions = $('<td class="text-end"></td>');
            var select = $('<select class="form-select form-select-sm d-inline-block me-1" style="width:auto;"></select>');
            supportedLevels.forEach(function (lvl) {
                var opt = $('<option></option>').val(lvl).text(lvl);
                if (l.configuredLevel === lvl) opt.attr('selected', 'selected');
                select.append(opt);
            });
            var applyBtn = $('<button type="button" class="btn btn-sm btn-primary me-1">Aplicar</button>')
                .on('click', function () { setLevel(l.name, select.val()); });
            var resetBtn = $('<button type="button" class="btn btn-sm btn-outline-secondary">Reset</button>')
                .on('click', function () { resetLogger(l.name); });
            actions.append(select).append(applyBtn).append(resetBtn);
            tr.append(actions);

            tbody.append(tr);
        });
    }

    function levelClass(level) {
        switch (level) {
            case 'TRACE': return 'bg-info text-dark';
            case 'DEBUG': return 'bg-primary';
            case 'INFO': return 'bg-success';
            case 'WARN': return 'bg-warning text-dark';
            case 'ERROR': return 'bg-danger';
            case 'OFF': return 'bg-dark';
            default: return 'bg-secondary';
        }
    }

    function setLevel(name, level) {
        $.ajax({
            url: '/admin/api/loggers/' + encodeURIComponent(name),
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ level: level })
        }).done(function () {
            showAlert('success', 'Logger ' + name + ' alterado para ' + level + '.');
            loadLoggers();
        }).fail(function (xhr) {
            showAlert('danger', 'Falha ao alterar logger ' + name + ': '
                + (xhr.responseJSON && xhr.responseJSON.error ? xhr.responseJSON.error : xhr.statusText));
        });
    }

    function resetLogger(name) {
        $.ajax({
            url: '/admin/api/loggers/' + encodeURIComponent(name) + '/reset',
            method: 'POST'
        }).done(function () {
            showAlert('success', 'Logger ' + name + ' resetado (herda do pai).');
            loadLoggers();
        }).fail(function (xhr) {
            showAlert('danger', 'Falha ao resetar logger ' + name + ': '
                + (xhr.responseJSON && xhr.responseJSON.error ? xhr.responseJSON.error : xhr.statusText));
        });
    }

    function bindEvents() {
        $('#reloadLoggersBtn').off('click').on('click', loadLoggers);
        $('#applyCustomLoggerBtn').off('click').on('click', function () {
            var name = ($('#customLoggerName').val() || '').trim();
            var level = $('#customLoggerLevel').val();
            if (!name) {
                showAlert('warning', 'Informe o nome do logger.');
                return;
            }
            setLevel(name, level);
            $('#customLoggerName').val('');
        });
    }

    function showAlert(type, message) {
        if (typeof window.showAlert === 'function') {
            window.showAlert(type, message);
            return;
        }
        var container = $('#alertsContainer');
        if (!container.length) return;
        var alert = $('<div class="alert alert-' + type + ' alert-dismissible fade show" role="alert"></div>')
            .text(message)
            .append('<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>');
        container.append(alert);
        setTimeout(function () { alert.alert('close'); }, 5000);
    }

    return { init: init };
})();
