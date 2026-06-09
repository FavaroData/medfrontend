// report-dashboard.js — inicializador do dashboard do módulo Laudos
(function () {
    'use strict';

    let reportAwaitingTable = null;
    let currentStatusFilter = 'AWAITING_REPORT';

    // Mapeia status do enum -> {label pt-BR, bootstrap badge class, label do título}
    const STATUS_META = {
        AWAITING_REPORT:  { label: 'Aguardando',        badge: 'bg-secondary',   title: 'Aguardando digitação' },
        IN_REVIEW:        { label: 'Em revisão',         badge: 'bg-primary',     title: 'Em revisão' },
        APPROVED:         { label: 'Aprovado',           badge: 'bg-success',     title: 'Aprovados' },
        DELIVERED:        { label: 'Entregue',           badge: 'bg-success',     title: 'Entregues' },
        RETRY_EXHAUSTED:  { label: 'Falha',              badge: 'bg-danger',      title: 'Falhas (retry esgotado)' },
        CANCELLED:        { label: 'Cancelado',          badge: 'bg-light text-dark', title: 'Cancelados' },
        ALL:              { label: '—',                  badge: '',               title: 'Todos os laudos' }
    };

    window.initReportDashboard = function () {
        currentStatusFilter = 'AWAITING_REPORT';
        var filterEl = document.getElementById('reportStatusFilter');
        if (filterEl) filterEl.value = currentStatusFilter;
        loadStats();
        initAwaitingTable();
        bindActions();
        updateListTitle();
    };

    // Lê o filtro de período (em dias). Vazio → sem limite (todos os registros).
    function getDaysFilter() {
        var el = document.getElementById('reportDateFilter');
        return el ? el.value : '';
    }

    // Acrescenta o parâmetro `days` à URL quando há período selecionado.
    function withDaysParam(url) {
        var days = getDaysFilter();
        return days ? url + '&days=' + encodeURIComponent(days) : url;
    }

    function setStatValue(id, value) {
        var el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    // Carrega TODOS os orders uma vez e calcula as contagens por status no
    // cliente (mesmo padrão de gateway-dashboard.js::updateStatistics), em vez
    // de uma chamada por card.
    function loadStats() {
        fetch(withDaysParam('/api/report/orders?status=ALL'))
            .then(function (r) { return r.json(); })
            .then(function (items) {
                var counts = { AWAITING_REPORT: 0, IN_REVIEW: 0, APPROVED: 0, RETRY_EXHAUSTED: 0 };
                items.forEach(function (o) {
                    if (Object.prototype.hasOwnProperty.call(counts, o.orderStatus)) {
                        counts[o.orderStatus]++;
                    }
                });
                setStatValue('reportStatAwaitingValue', counts.AWAITING_REPORT);
                setStatValue('reportStatReviewValue', counts.IN_REVIEW);
                setStatValue('reportStatApprovedValue', counts.APPROVED);
                setStatValue('reportStatFailedValue', counts.RETRY_EXHAUSTED);
            })
            .catch(function (err) {
                console.error('[Report] erro ao carregar stats:', err);
                setStatValue('reportStatAwaitingValue', '?');
                setStatValue('reportStatReviewValue', '?');
                setStatValue('reportStatApprovedValue', '?');
                setStatValue('reportStatFailedValue', '?');
            });
    }

    /**
     * Aplica um filtro de status a partir do clique em um card de estatística.
     * Sincroniza o dropdown e recarrega a tabela — mesmo padrão dos cards
     * clicáveis de gateway/imager. Exposto no window porque o onclick é gerado
     * inline pelo componente stats-card.
     */
    window.reportFilterByStatus = function (status) {
        currentStatusFilter = status;
        var filterEl = document.getElementById('reportStatusFilter');
        if (filterEl) filterEl.value = status;
        updateListTitle();
        if (reportAwaitingTable) {
            reportAwaitingTable.ajax.url(ordersUrlForStatus(currentStatusFilter)).load();
        }
    };

    function ordersUrlForStatus(status) {
        return withDaysParam('/api/report/orders?status=' + encodeURIComponent(status || 'AWAITING_REPORT'));
    }

    function initAwaitingTable() {
        if (reportAwaitingTable) {
            try {
                reportAwaitingTable.destroy();
                reportAwaitingTable = null;
            } catch (e) {
                console.warn('[Report] erro ao destruir tabela anterior:', e);
            }
        }

        var tableConfig = {
            ajax: { url: ordersUrlForStatus(currentStatusFilter), dataSrc: '' },
            columns: [
                { data: 'accessionNumber', title: 'Accession', width: '11%' },
                { data: 'patientName', title: 'Paciente', width: '20%', render: function (v) { return v || '—'; } },
                { data: 'serviceName', title: 'Procedimento', width: '18%', render: function (v) { return v || '—'; } },
                { data: 'performingPhysicianName', title: 'Executor', width: '13%', render: function (v) { return v || '—'; } },
                {
                    data: 'orderDatetime', title: 'Data', width: '12%',
                    render: function (v) {
                        if (!v) return '—';
                        try {
                            var d = new Date(v);
                            return d.toLocaleDateString('pt-BR') + ' ' +
                                   d.toLocaleTimeString('pt-BR').substring(0, 5);
                        } catch (e) { return v; }
                    }
                },
                {
                    data: 'orderStatus', title: 'Status', width: '10%',
                    render: function (v) {
                        var meta = STATUS_META[v];
                        if (!meta) return v || '—';
                        return '<span class="badge ' + meta.badge + '">' + meta.label + '</span>';
                    }
                },
                {
                    data: 'hasDraft', title: 'Rascunho', width: '8%',
                    render: function (v) {
                        return v
                            ? '<span class="badge bg-warning text-dark">Em andamento</span>'
                            : '<span class="text-muted">—</span>';
                    }
                },
                {
                    data: null, title: 'Ações', width: '8%', orderable: false, className: 'text-end',
                    render: function (_data, _type, row) {
                        // Editar SÓ se AWAITING_REPORT ou IN_REVIEW sem typed_at (review ainda aberta).
                        // Outros status → Ver (readonly).
                        var canEdit = (row.orderStatus === 'AWAITING_REPORT') ||
                                      (row.orderStatus === 'IN_REVIEW' && !row.hasDraft);
                        if (canEdit) {
                            var label = row.hasDraft ? 'Continuar' : 'Digitar';
                            return '<a href="#" class="btn btn-sm btn-primary report-open-editor" ' +
                                   'data-order-id="' + row.id + '">' +
                                   '<i class="fas fa-pen me-1"></i>' + label + '</a>';
                        }
                        return '<a href="#" class="btn btn-sm btn-outline-secondary report-open-editor" ' +
                               'data-order-id="' + row.id + '">' +
                               '<i class="fas fa-eye me-1"></i>Ver</a>';
                    }
                }
            ]
        };

        // dom 'rtip' remove os controles nativos de length/busca — usamos a
        // table-toolbar (mesmo padrão de gateway/imager). `searching` permanece
        // ativo para que a busca livre via table.search() funcione.
        tableConfig.dom = 'rtip';
        tableConfig.pageLength = parseInt(localStorage.getItem('reportPageSize'), 10) || 25;

        var fullConfig = window.MeddriveDataTables
            ? window.MeddriveDataTables.configs.standard(tableConfig)
            : Object.assign({ autoWidth: false }, tableConfig);

        reportAwaitingTable = window.MeddriveDataTables
            ? window.MeddriveDataTables.init('#reportAwaitingTable', fullConfig)
            : $('#reportAwaitingTable').DataTable(fullConfig);

        $('#reportAwaitingTable').off('click', '.report-open-editor').on('click', '.report-open-editor', function (e) {
            e.preventDefault();
            var orderId = $(this).data('order-id');
            openEditor(orderId);
        });
    }

    /**
     * Abre o editor de laudo em modal-fullscreen (cobre sidebar e navbar do dashboard
     * para dar máximo espaço pro split-screen PDF + Quill). A inicialização do Quill
     * e do PDF.js acontece depois do evento `shown.bs.modal` para garantir que o
     * container está visível antes de medir/renderizar.
     */
    function openEditor(orderId) {
        var modalEl = document.getElementById('reportEditorModal');
        var bodyEl = document.getElementById('reportEditorModalBody');
        if (!modalEl || !bodyEl) {
            console.error('[Report] reportEditorModal não encontrado no DOM');
            return;
        }

        fetch('/report/local-editor/' + encodeURIComponent(orderId))
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.text();
            })
            .then(function (html) {
                // Server-rendered Thymeleaf fragment (trusted). Scripts inline já foram
                // movidos para top-level em dashboard.html; aqui só injetamos markup.
                $(bodyEl).html(html); // eslint-disable-line no-jquery/no-html

                // Inicializa o editor APÓS o modal ficar visível (Quill precisa do
                // container montado pra medir o tamanho da toolbar; PDF.js precisa
                // do canvas no DOM).
                var onShown = function () {
                    modalEl.removeEventListener('shown.bs.modal', onShown);
                    if (typeof initReportLocalEditor === 'function') {
                        initReportLocalEditor(orderId);
                    } else {
                        console.error('[Report] initReportLocalEditor não encontrado');
                    }
                };
                modalEl.addEventListener('shown.bs.modal', onShown);

                if (typeof bootstrap !== 'undefined') {
                    var instance = bootstrap.Modal.getOrCreateInstance(modalEl);
                    instance.show();
                } else if (typeof $ !== 'undefined') {
                    $(modalEl).modal('show');
                }
            })
            .catch(function (err) {
                console.error('[Report] erro ao abrir editor:', err);
                if (typeof showAlert === 'function') {
                    showAlert('Falha ao abrir o editor de laudo.', 'danger');
                }
            });
    }

    /**
     * Fecha o modal do editor. Exposto para report-local-editor.js chamar
     * após Cancelar / Finalizar / Excluir.
     */
    window.closeReportEditorModal = function () {
        var modalEl = document.getElementById('reportEditorModal');
        if (!modalEl) return;
        if (typeof bootstrap !== 'undefined') {
            var inst = bootstrap.Modal.getInstance(modalEl);
            if (inst) inst.hide();
        } else if (typeof $ !== 'undefined') {
            $(modalEl).modal('hide');
        }
    };

    /**
     * Recarrega a tabela e stats. Exposto para report-local-editor.js chamar
     * após mudança que afeta a lista (Finalize move pra IN_REVIEW;
     * Excluir libera o exame para nova digitação).
     */
    window.reportRefreshAwaitingTable = function () {
        loadStats();
        if (reportAwaitingTable) {
            reportAwaitingTable.ajax.reload(null, false);
        }
    };

    function updateListTitle() {
        var titleEl = document.getElementById('reportListTitle');
        if (!titleEl) return;
        var meta = STATUS_META[currentStatusFilter] || STATUS_META.ALL;
        titleEl.replaceChildren();
        var icon = document.createElement('i');
        icon.className = 'fas fa-list me-2';
        var span = document.createElement('span');
        span.textContent = meta.title;
        titleEl.appendChild(icon);
        titleEl.appendChild(span);
    }

    function bindActions() {
        var refreshBtn = document.getElementById('reportRefreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function () {
                window.reportRefreshAwaitingTable();
            });
        }

        var statusFilter = document.getElementById('reportStatusFilter');
        if (statusFilter) {
            statusFilter.addEventListener('change', function () {
                currentStatusFilter = statusFilter.value;
                updateListTitle();
                if (reportAwaitingTable) {
                    reportAwaitingTable.ajax.url(ordersUrlForStatus(currentStatusFilter)).load();
                }
            });
        }

        // Filtro de período: recarrega tabela e stats (ambos respeitam `days`).
        var dateFilter = document.getElementById('reportDateFilter');
        if (dateFilter) {
            dateFilter.addEventListener('change', function () {
                loadStats();
                if (reportAwaitingTable) {
                    reportAwaitingTable.ajax.url(ordersUrlForStatus(currentStatusFilter)).load();
                }
            });
        }

        // Toolbar: itens por página (mesmos IDs do componente table-toolbar).
        $('#reportItemsPerPageSelect').off('change').on('change', function () {
            var pageSize = parseInt($(this).val(), 10);
            if (reportAwaitingTable) reportAwaitingTable.page.len(pageSize).draw();
            localStorage.setItem('reportPageSize', pageSize);
        });

        // Toolbar: busca livre (wildcard) sobre todas as colunas carregadas.
        $('#reportSearchInput').off('keyup').on('keyup', function () {
            if (reportAwaitingTable) reportAwaitingTable.search($(this).val()).draw();
        });
        $('#reportSearchInput').off('input').on('input', function () {
            $('#reportClearSearchBtn').toggle($(this).val().length > 0);
        });
        $('#reportClearSearchBtn').off('click').on('click', function () {
            $('#reportSearchInput').val('');
            if (reportAwaitingTable) reportAwaitingTable.search('').draw();
            $(this).hide();
        });

        var templatesNavBtn = document.getElementById('reportTemplatesNavBtn');
        if (templatesNavBtn) {
            templatesNavBtn.addEventListener('click', function () {
                var container = document.getElementById('mainDashboardContent');
                if (!container) return;
                fetch('/report/fragments/templates')
                    .then(function (r) {
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        return r.text();
                    })
                    .then(function (html) {
                        $(container).html(html);
                        if (typeof window.initReportTemplates === 'function') {
                            window.initReportTemplates();
                        }
                    })
                    .catch(function (err) {
                        console.error('[Report] erro ao carregar templates:', err);
                        if (typeof showAlert === 'function') {
                            showAlert('Falha ao carregar a tela de templates.', 'danger');
                        }
                    });
            });
        }

        var reviewQueueNavBtn = document.getElementById('reportReviewQueueNavBtn');
        if (reviewQueueNavBtn) {
            reviewQueueNavBtn.addEventListener('click', function () {
                if (typeof loadContent === 'function') {
                    loadContent('report-review');
                } else {
                    window.location.hash = '#report-review';
                }
            });
        }
    }

})();
