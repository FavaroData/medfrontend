// CRUD de ReportConfig (elegibilidade de laudo web por médico+exame).
// Reusa showAlert de ui-utils.js. Widths de coluna em JS (autoWidth:false), CSS proibido para isso.
(function () {
    var dt = null;
    var physBuffer = []; // [{performingPhysicianId, performingPhysicianName}]

    function loadReportConfigs() {
        fetch('/admin/api/report/config')
            .then(function (r) { return r.json(); })
            .then(function (rows) { renderTable(rows); })
            .catch(function (e) { showAlert('Erro ao carregar configurações: ' + e, 'danger'); });
    }

    function renderTable(rows) {
        if (dt) {
            dt.destroy();
            $('#reportConfigTable tbody').empty();
        }
        dt = $('#reportConfigTable').DataTable({
            autoWidth: false,
            data: rows,
            columns: [
                {
                    data: 'serviceCode',
                    title: 'Exame(s)',
                    width: '20%',
                    render: function (data) { return data || ''; }
                },
                {
                    data: 'serviceName',
                    title: 'Nome',
                    width: '30%',
                    render: function (data) { return data || ''; }
                },
                {
                    data: null,
                    title: 'Médicos',
                    width: '20%',
                    render: function (r) {
                        var codes = (r.physicians || []).map(function (p) { return p.performingPhysicianId; });
                        return codes.length > 0 ? codes.join(', ') : '<span class="text-muted">—</span>';
                    }
                },
                {
                    data: 'enabled',
                    title: 'Status',
                    width: '10%',
                    render: function (v) {
                        return v
                            ? '<span class="badge bg-success">Ativa</span>'
                            : '<span class="badge bg-secondary">Inativa</span>';
                    }
                },
                {
                    data: null,
                    title: 'Ações',
                    width: '20%',
                    orderable: false,
                    render: function (r) {
                        return '<button class="btn btn-icon-only" onclick="window.reportConfigEdit(' + r.id + ')" title="Editar"><i class="fas fa-edit"></i></button>' +
                               '<button class="btn btn-icon-only text-danger" onclick="window.reportConfigDelete(' + r.id + ')" title="Remover"><i class="fas fa-trash"></i></button>';
                    }
                }
            ],
            language: { url: '//cdn.datatables.net/plug-ins/1.13.4/i18n/pt-BR.json' }
        });
    }

    function renderPhysList() {
        var ul = $('#reportPhysList').empty();
        physBuffer.forEach(function (p, i) {
            ul.append(
                '<li class="list-group-item d-flex justify-content-between align-items-center">' +
                '<span>' + escapeHtml(p.performingPhysicianId) + (p.performingPhysicianName ? ' — ' + escapeHtml(p.performingPhysicianName) : '') + '</span>' +
                '<button class="btn btn-icon-only text-danger" onclick="window.reportPhysRemove(' + i + ')" title="Remover"><i class="fas fa-times"></i></button>' +
                '</li>'
            );
        });
    }

    function openModal(config) {
        physBuffer = config
            ? (config.physicians || []).map(function (p) {
                return { performingPhysicianId: p.performingPhysicianId, performingPhysicianName: p.performingPhysicianName || '' };
            })
            : [];
        $('#reportConfigId').val(config ? config.id : '');
        $('#reportConfigExameCode').val(config ? config.serviceCode : '');
        $('#reportConfigExameName').val(config ? config.serviceName : '');
        $('#reportConfigEnabled').prop('checked', config ? config.enabled !== false : true);
        $('#reportConfigModalTitle').text(config ? 'Editar configuração' : 'Nova configuração');
        $('#reportPhysCode').val('');
        $('#reportPhysName').val('');
        renderPhysList();
        bootstrap.Modal.getOrCreateInstance(document.getElementById('reportConfigModal')).show();
    }

    function save() {
        var id = $('#reportConfigId').val();
        var payload = {
            serviceCode: ($('#reportConfigExameCode').val() || '').trim(),
            serviceName: ($('#reportConfigExameName').val() || '').trim(),
            enabled: $('#reportConfigEnabled').is(':checked'),
            physicians: physBuffer
        };
        var url = id ? '/admin/api/report/config/' + encodeURIComponent(id) : '/admin/api/report/config';
        var method = id ? 'PUT' : 'POST';
        fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (res.success) {
                    showAlert(res.message, 'success');
                    bootstrap.Modal.getInstance(document.getElementById('reportConfigModal')).hide();
                    loadReportConfigs();
                } else {
                    showAlert(res.message || 'Erro ao salvar', 'danger');
                }
            })
            .catch(function (e) { showAlert('Erro: ' + e, 'danger'); });
    }

    window.reportConfigEdit = function (id) {
        fetch('/admin/api/report/config/' + encodeURIComponent(id))
            .then(function (r) { return r.json(); })
            .then(function (c) { openModal(c); })
            .catch(function (e) { showAlert('Erro ao carregar configuração: ' + e, 'danger'); });
    };

    window.reportConfigDelete = function (id) {
        if (!confirm('Remover esta configuração de laudo web?')) return;
        fetch('/admin/api/report/config/' + encodeURIComponent(id), { method: 'DELETE' })
            .then(function (r) { return r.json(); })
            .then(function (res) {
                showAlert(res.message, res.success ? 'success' : 'danger');
                if (res.success) loadReportConfigs();
            })
            .catch(function (e) { showAlert('Erro ao remover: ' + e, 'danger'); });
    };

    window.reportPhysRemove = function (i) {
        physBuffer.splice(i, 1);
        renderPhysList();
    };

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    $(document).on('click', '#btnAddReportConfig', function () { openModal(null); });
    $(document).on('click', '#btnSaveReportConfig', save);
    $(document).on('click', '#btnAddReportPhys', function () {
        var code = ($('#reportPhysCode').val() || '').trim();
        if (!code) {
            showAlert('O código do médico é obrigatório.', 'warning');
            return;
        }
        physBuffer.push({ performingPhysicianId: code, performingPhysicianName: ($('#reportPhysName').val() || '').trim() });
        $('#reportPhysCode').val('');
        $('#reportPhysName').val('');
        renderPhysList();
    });

    // Expõe função de inicialização para o dashboard.js acionar ao abrir a aba
    window.ReportConfig = {
        init: function () {
            if (document.getElementById('reportConfigTable')) {
                loadReportConfigs();
            }
        }
    };
})();
