$(function() {
    let hisDestinationsTable = null;
    let currentHisType = 'TASY_HTML5';

    function loadHisType() {
        return $.get('/api/his/integration-type')
            .then(function(data) {
                currentHisType = (data && data.type) ? data.type : 'TASY_HTML5';
                $('#hisActiveType').text(currentHisType);
                applyHisTypeVisibility();
            })
            .catch(function() {
                currentHisType = 'TASY_HTML5';
                $('#hisActiveType').text('TASY_HTML5 (default)');
                applyHisTypeVisibility();
            });
    }

    function applyHisTypeVisibility() {
        const isHtml5 = currentHisType === 'TASY_HTML5';
        $('.his-html5-only').toggle(isHtml5);
        $('.his-html5-required').toggle(isHtml5);
        $('#hisUuidStorage').prop('required', isHtml5);
        $('#hisTasyStorageName').prop('required', isHtml5);
    }

    function initTable() {
        if (hisDestinationsTable) {
            hisDestinationsTable.destroy();
        }
        hisDestinationsTable = $('#hisDestinationsTable').DataTable({
            autoWidth: false,
            ajax: {
                url: '/api/imager/his-destinations',
                dataSrc: ''
            },
            columns: [
                { data: 'name', title: 'Nome', width: '30%' },
                { data: 'destinationPath', title: 'Caminho', width: '40%' },
                {
                    data: 'uuidStorage',
                    title: 'UUID Storage',
                    width: '15%',
                    visible: currentHisType === 'TASY_HTML5',
                    defaultContent: '—'
                },
                {
                    data: 'enabled',
                    title: 'Status',
                    width: '8%',
                    render: function(data, type) {
                        if (type !== 'display') return data;
                        return data
                            ? '<span class="badge bg-success">Ativo</span>'
                            : '<span class="badge bg-secondary">Inativo</span>';
                    }
                },
                {
                    data: 'id',
                    title: 'Ações',
                    width: '7%',
                    orderable: false,
                    render: function(id) {
                        return '<button type="button" class="btn-icon-only" title="Editar" data-action="edit" data-id="' + id + '">' +
                               '<i class="fas fa-edit"></i></button>' +
                               '<button type="button" class="btn-icon-only text-danger" title="Excluir" data-action="delete" data-id="' + id + '">' +
                               '<i class="fas fa-trash-alt"></i></button>';
                    }
                }
            ],
            language: { url: '//cdn.datatables.net/plug-ins/1.13.4/i18n/pt-BR.json' }
        });
    }

    function openModalForCreate() {
        $('#hisDestinationModalLabel').text('Novo Destino HIS');
        $('#hisDestinationForm')[0].reset();
        $('#hisDestinationId').val('');
        $('#hisEnabled').prop('checked', true);
        applyHisTypeVisibility();
        new bootstrap.Modal(document.getElementById('hisDestinationModal')).show();
    }

    function openModalForEdit(id) {
        $.get('/api/imager/his-destinations/' + id).done(function(d) {
            $('#hisDestinationModalLabel').text('Editar Destino HIS');
            $('#hisDestinationId').val(d.id);
            $('#hisName').val(d.name);
            $('#hisDescription').val(d.description || '');
            $('#hisDestinationPath').val(d.destinationPath);
            $('#hisUuidStorage').val(d.uuidStorage || '');
            $('#hisTasyStorageName').val(d.tasyStorageName || '');
            $('#hisEnabled').prop('checked', d.enabled !== false);
            applyHisTypeVisibility();
            new bootstrap.Modal(document.getElementById('hisDestinationModal')).show();
        });
    }

    function saveHisDestination() {
        const id = $('#hisDestinationId').val();
        const payload = {
            name: $('#hisName').val(),
            description: $('#hisDescription').val(),
            destinationPath: $('#hisDestinationPath').val(),
            uuidStorage: $('#hisUuidStorage').val() || null,
            tasyStorageName: $('#hisTasyStorageName').val() || null,
            enabled: $('#hisEnabled').is(':checked')
        };

        const url = id ? '/api/imager/his-destinations/' + id : '/api/imager/his-destinations';
        const method = id ? 'PUT' : 'POST';

        $.ajax({
            url: url,
            method: method,
            contentType: 'application/json',
            data: JSON.stringify(payload)
        }).done(function() {
            if (typeof showAlert === 'function') {
                showAlert('Destino salvo com sucesso.', 'success');
            }
            bootstrap.Modal.getInstance(document.getElementById('hisDestinationModal')).hide();
            hisDestinationsTable.ajax.reload(null, false);
        }).fail(function(xhr) {
            const msg = (xhr.responseJSON && xhr.responseJSON.error) || 'Erro ao salvar destino';
            if (typeof showAlert === 'function') {
                showAlert(msg, 'danger');
            }
        });
    }

    function deleteHisDestination(id) {
        if (!confirm('Deseja excluir este destino?')) return;
        $.ajax({
            url: '/api/imager/his-destinations/' + id,
            method: 'DELETE'
        }).done(function() {
            if (typeof showAlert === 'function') {
                showAlert('Destino excluído.', 'success');
            }
            hisDestinationsTable.ajax.reload(null, false);
        }).fail(function(xhr) {
            if (xhr.status === 409 && xhr.responseJSON) {
                const usage = xhr.responseJSON.usageCount;
                if (typeof showAlert === 'function') {
                    showAlert('Destino em uso por ' + usage + ' configuração(ões) — desvincule antes de excluir.', 'warning');
                }
            } else {
                if (typeof showAlert === 'function') {
                    showAlert('Erro ao excluir destino.', 'danger');
                }
            }
        });
    }

    $(document).on('click', '#btnAddHisDestination', openModalForCreate);
    $(document).on('click', '#btnSaveHisDestination', saveHisDestination);
    $(document).on('click', '#hisDestinationsTable [data-action="edit"]', function() {
        openModalForEdit($(this).data('id'));
    });
    $(document).on('click', '#hisDestinationsTable [data-action="delete"]', function() {
        deleteHisDestination($(this).data('id'));
    });

    $(document).on('shown.bs.tab', 'a[href="#his-destinations"], button[data-bs-target="#his-destinations"]', function() {
        loadHisType().always(function() {
            initTable();
        });
    });
});
