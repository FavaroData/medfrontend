// report-templates.js — CRUD de templates de laudo
(function () {
    'use strict';

    var templatesTable = null;
    var templateQuill = null;
    var deletingTemplateId = null;

    // ================================================================================
    // ENTRY POINT
    // ================================================================================

    window.initReportTemplates = function () {
        initTemplatesTable();
        bindActions();
        initQuillOnModalOpen();
    };

    // ================================================================================
    // DATATABLE
    // ================================================================================

    function initTemplatesTable() {
        if (templatesTable) {
            try {
                templatesTable.destroy();
                templatesTable = null;
            } catch (e) {
                console.warn('[ReportTemplates] erro ao destruir tabela anterior:', e);
            }
        }

        var tableConfig = {
            ajax: { url: '/api/report/templates', dataSrc: '' },
            columns: [
                {
                    data: 'name',
                    title: 'Nome',
                    width: '25%'
                },
                {
                    data: 'procedureCode',
                    title: 'Procedimento',
                    width: '12%',
                    render: function (v) { return v ? v : '<span class="text-muted">—</span>'; }
                },
                {
                    data: 'providerId',
                    title: 'Médico',
                    width: '12%',
                    render: function (v) { return v ? v : '<span class="text-muted">—</span>'; }
                },
                {
                    data: 'updatedAt',
                    title: 'Atualizado em',
                    width: '14%',
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
                    data: 'active',
                    title: 'Ativo',
                    width: '8%',
                    render: function (v) {
                        return v
                            ? '<span class="badge bg-success">Ativo</span>'
                            : '<span class="badge bg-secondary">Inativo</span>';
                    }
                },
                {
                    data: 'syncStatus',
                    title: 'Sincronização',
                    width: '14%',
                    orderable: false,
                    render: function (_v, _type, row) {
                        if (!row.syncEnabled) {
                            return '<span class="badge bg-secondary" ' +
                                   'title="Sincronização com meddrive-web desativada">Desativado</span>';
                        }
                        var map = {
                            SUCCESS:         { cls: 'bg-success',  txt: 'Sincronizado' },
                            PENDING:         { cls: 'bg-primary',  txt: 'Pendente' },
                            API_ERROR:       { cls: 'bg-warning text-dark', txt: 'Reenviando' },
                            RETRY_EXHAUSTED: { cls: 'bg-danger',   txt: 'Falhou' }
                        };
                        var m = map[row.syncStatus];
                        if (!m) {
                            return '<span class="badge bg-secondary" ' +
                                   'title="Ainda não sincronizado">Não sincronizado</span>';
                        }
                        var tip = [];
                        if (row.lastAttemptAt) {
                            try {
                                var d = new Date(row.lastAttemptAt);
                                tip.push('Última tentativa: ' + d.toLocaleDateString('pt-BR') + ' ' +
                                         d.toLocaleTimeString('pt-BR').substring(0, 5));
                            } catch (e) { /* ignore */ }
                        }
                        if (row.lastError) tip.push('Erro: ' + row.lastError);
                        var titleAttr = tip.length ? ' title="' + tip.join(' — ').replace(/"/g, '&quot;') + '"' : '';
                        return '<span class="badge ' + m.cls + '"' + titleAttr + '>' + m.txt + '</span>';
                    }
                },
                {
                    data: null,
                    title: 'Ações',
                    width: '15%',
                    orderable: false,
                    className: 'text-end',
                    render: function (_data, _type, row) {
                        var resyncBtn = '';
                        if (row.syncEnabled &&
                            (row.syncStatus === 'API_ERROR' || row.syncStatus === 'RETRY_EXHAUSTED')) {
                            resyncBtn = '<button type="button" class="btn-icon-only me-1 report-tpl-resync" ' +
                                        'data-id="' + row.id + '" title="Reenviar sincronização">' +
                                        '<i class="fas fa-sync"></i></button>';
                        }
                        return resyncBtn +
                               '<button type="button" class="btn-icon-only me-1 report-tpl-edit" ' +
                               'data-id="' + row.id + '" title="Editar">' +
                               '<i class="fas fa-edit"></i></button>' +
                               '<button type="button" class="btn-icon-only text-danger report-tpl-delete" ' +
                               'data-id="' + row.id + '" title="Excluir">' +
                               '<i class="fas fa-trash"></i></button>';
                    }
                }
            ]
        };

        var fullConfig = window.MeddriveDataTables
            ? window.MeddriveDataTables.configs.standard(tableConfig)
            : Object.assign({ autoWidth: false }, tableConfig);

        templatesTable = window.MeddriveDataTables
            ? window.MeddriveDataTables.init('#reportTemplatesTable', fullConfig)
            : $('#reportTemplatesTable').DataTable(fullConfig);

        // Delegated click handlers on the table
        $('#reportTemplatesTable')
            .off('click', '.report-tpl-edit')
            .on('click', '.report-tpl-edit', function (e) {
                e.preventDefault();
                openEditModal($(this).data('id'));
            });

        $('#reportTemplatesTable')
            .off('click', '.report-tpl-delete')
            .on('click', '.report-tpl-delete', function (e) {
                e.preventDefault();
                openDeleteModal($(this).data('id'));
            });

        $('#reportTemplatesTable')
            .off('click', '.report-tpl-resync')
            .on('click', '.report-tpl-resync', function (e) {
                e.preventDefault();
                resyncTemplate($(this).data('id'));
            });
    }

    function reloadTable() {
        if (templatesTable) {
            templatesTable.ajax.reload(null, false);
        }
    }

    function resyncTemplate(id) {
        fetch('/api/report/templates/' + encodeURIComponent(id) + '/resync', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
            .then(function (r) {
                if (!r.ok) {
                    return r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); });
                }
                reloadTable();
                if (typeof showAlert === 'function') {
                    showAlert('Reenvio de sincronização agendado.', 'success');
                }
            })
            .catch(function (err) {
                console.error('[ReportTemplates] erro ao reenviar sync:', err);
                if (typeof showAlert === 'function') {
                    showAlert('Falha ao reenviar a sincronização. ' + (err.message || ''), 'danger');
                }
            });
    }

    // ================================================================================
    // QUILL — singleton, inicializado 1x no primeiro shown.bs.modal
    // ================================================================================

    function initQuillOnModalOpen() {
        var modalEl = document.getElementById('reportTemplateFormModal');
        if (!modalEl) return;

        modalEl.addEventListener('shown.bs.modal', function () {
            if (templateQuill) return; // já inicializado

            var editorEl = document.getElementById('reportTemplateContentEditor');
            if (!editorEl) {
                console.error('[ReportTemplates] #reportTemplateContentEditor não encontrado');
                return;
            }
            if (typeof Quill === 'undefined') {
                console.error('[ReportTemplates] Quill não carregado');
                return;
            }

            templateQuill = new Quill(editorEl, {
                theme: 'snow',
                modules: {
                    toolbar: [
                        ['bold', 'italic', 'underline'],
                        [{ header: [1, 2, 3, false] }],
                        [{ list: 'ordered' }, { list: 'bullet' }],
                        [{ align: [] }],
                        ['blockquote'],
                        ['clean']
                    ]
                }
            });
        });
    }

    function clearQuill() {
        if (templateQuill) {
            templateQuill.setContents([]);
        }
    }

    function setQuillContent(html) {
        if (!templateQuill) return;
        if (!html) {
            templateQuill.setContents([]);
            return;
        }
        try {
            var delta = templateQuill.clipboard.convert({ html: html });
            templateQuill.setContents(delta, 'silent');
        } catch (e) {
            // Fallback Quill 1.x
            try {
                var deltaV1 = templateQuill.clipboard.convert(html);
                templateQuill.setContents(deltaV1, 'silent');
            } catch (e2) {
                console.error('[ReportTemplates] erro ao carregar conteúdo no Quill:', e2);
            }
        }
    }

    function getEditorHtml() {
        if (!templateQuill) return '';
        if (typeof templateQuill.getSemanticHTML === 'function') {
            return templateQuill.getSemanticHTML();
        }
        return templateQuill.root.innerHTML;
    }

    // ================================================================================
    // MODALS — open / close helpers
    // ================================================================================

    function openModal(id) {
        var el = document.getElementById(id);
        if (!el) return;
        if (typeof bootstrap !== 'undefined') {
            bootstrap.Modal.getOrCreateInstance(el).show();
        } else if (typeof $ !== 'undefined') {
            $(el).modal('show');
        }
    }

    function closeModal(id) {
        var el = document.getElementById(id);
        if (!el) return;
        if (typeof bootstrap !== 'undefined') {
            var inst = bootstrap.Modal.getInstance(el);
            if (inst) inst.hide();
        } else if (typeof $ !== 'undefined') {
            $(el).modal('hide');
        }
    }

    function openNewModal() {
        // Limpa o formulário
        var editingId = document.getElementById('reportTemplateEditingId');
        if (editingId) editingId.value = '';

        var nameEl = document.getElementById('reportTemplateName');
        if (nameEl) nameEl.value = '';

        var procEl = document.getElementById('reportTemplateProcedureCode');
        if (procEl) procEl.value = '';

        var provEl = document.getElementById('reportTemplateProviderId');
        if (provEl) provEl.value = '';

        var activeEl = document.getElementById('reportTemplateActive');
        if (activeEl) activeEl.checked = true;

        clearQuill();

        var titleEl = document.getElementById('reportTemplateModalTitle');
        if (titleEl) titleEl.textContent = 'Novo template';

        openModal('reportTemplateFormModal');
    }

    function openEditModal(id) {
        fetch('/api/report/templates/' + encodeURIComponent(id), {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (tpl) {
                var editingId = document.getElementById('reportTemplateEditingId');
                if (editingId) editingId.value = tpl.id;

                var nameEl = document.getElementById('reportTemplateName');
                if (nameEl) nameEl.value = tpl.name || '';

                var procEl = document.getElementById('reportTemplateProcedureCode');
                if (procEl) procEl.value = tpl.procedureCode || '';

                var provEl = document.getElementById('reportTemplateProviderId');
                if (provEl) provEl.value = tpl.providerId || '';

                var activeEl = document.getElementById('reportTemplateActive');
                if (activeEl) activeEl.checked = !!tpl.active;

                var titleEl = document.getElementById('reportTemplateModalTitle');
                if (titleEl) titleEl.textContent = 'Editar template';

                // O Quill pode não estar inicializado ainda (modal ainda fechado);
                // salvamos o HTML e preenchemos no evento shown.bs.modal ou imediatamente
                // se o Quill já existir.
                var pendingHtml = tpl.contentHtml || '';

                openModal('reportTemplateFormModal');

                // Se o Quill já foi inicializado (modal aberto antes), preenche agora;
                // caso contrário, o shown.bs.modal vai inicializar e aí preenchemos.
                var modalEl = document.getElementById('reportTemplateFormModal');
                if (templateQuill) {
                    setQuillContent(pendingHtml);
                } else if (modalEl) {
                    var onShown = function () {
                        modalEl.removeEventListener('shown.bs.modal', onShown);
                        setQuillContent(pendingHtml);
                    };
                    modalEl.addEventListener('shown.bs.modal', onShown);
                }
            })
            .catch(function (err) {
                console.error('[ReportTemplates] erro ao carregar template:', err);
                if (typeof showAlert === 'function') {
                    showAlert('Falha ao carregar o template. Tente novamente.', 'danger');
                }
            });
    }

    function openDeleteModal(id) {
        deletingTemplateId = id;
        openModal('reportTemplateDeleteModal');
    }

    // ================================================================================
    // SAVE (POST / PUT)
    // ================================================================================

    function saveTemplate() {
        var editingIdEl = document.getElementById('reportTemplateEditingId');
        var editingId = editingIdEl ? editingIdEl.value.trim() : '';

        var nameEl = document.getElementById('reportTemplateName');
        var name = nameEl ? nameEl.value.trim() : '';
        if (!name) {
            if (nameEl) nameEl.focus();
            if (typeof showAlert === 'function') {
                showAlert('O campo Nome é obrigatório.', 'warning');
            }
            return;
        }

        var procEl = document.getElementById('reportTemplateProcedureCode');
        var provEl = document.getElementById('reportTemplateProviderId');
        var activeEl = document.getElementById('reportTemplateActive');

        var payload = {
            name: name,
            procedureCode: procEl && procEl.value.trim() ? procEl.value.trim() : null,
            providerId: provEl && provEl.value.trim() ? provEl.value.trim() : null,
            contentHtml: getEditorHtml(),
            active: activeEl ? activeEl.checked : true
        };

        var saveBtn = document.getElementById('reportTemplateSaveBtn');
        if (saveBtn) saveBtn.disabled = true;

        var url, method;
        if (editingId) {
            url = '/api/report/templates/' + encodeURIComponent(editingId);
            method = 'PUT';
        } else {
            url = '/api/report/templates';
            method = 'POST';
        }

        fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(payload)
        })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function () {
                closeModal('reportTemplateFormModal');
                reloadTable();
                if (typeof showAlert === 'function') {
                    showAlert('Template salvo com sucesso.', 'success');
                }
                // Reset hidden id
                if (editingIdEl) editingIdEl.value = '';
            })
            .catch(function (err) {
                console.error('[ReportTemplates] erro ao salvar template:', err);
                if (typeof showAlert === 'function') {
                    showAlert('Falha ao salvar o template. Tente novamente.', 'danger');
                }
            })
            .finally(function () {
                if (saveBtn) saveBtn.disabled = false;
            });
    }

    // ================================================================================
    // DELETE
    // ================================================================================

    function confirmDelete() {
        if (!deletingTemplateId) return;

        var confirmBtn = document.getElementById('reportTemplateDeleteConfirmBtn');
        if (confirmBtn) confirmBtn.disabled = true;

        fetch('/api/report/templates/' + encodeURIComponent(deletingTemplateId), {
            method: 'DELETE',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
            .then(function (r) {
                if (!r.ok && r.status !== 204) throw new Error('HTTP ' + r.status);
                closeModal('reportTemplateDeleteModal');
                deletingTemplateId = null;
                reloadTable();
                if (typeof showAlert === 'function') {
                    showAlert('Template desativado com sucesso.', 'success');
                }
            })
            .catch(function (err) {
                console.error('[ReportTemplates] erro ao excluir template:', err);
                if (typeof showAlert === 'function') {
                    showAlert('Falha ao excluir o template. Tente novamente.', 'danger');
                }
            })
            .finally(function () {
                if (confirmBtn) confirmBtn.disabled = false;
            });
    }

    // ================================================================================
    // BACK TO DASHBOARD
    // ================================================================================

    function goBackToDashboard() {
        var container = document.getElementById('mainDashboardContent');
        if (!container) return;

        fetch('/report/fragments/dashboard')
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.text();
            })
            .then(function (html) {
                $(container).html(html);
                if (typeof window.initReportDashboard === 'function') {
                    window.initReportDashboard();
                }
            })
            .catch(function (err) {
                console.error('[ReportTemplates] erro ao voltar ao dashboard:', err);
                if (typeof showAlert === 'function') {
                    showAlert('Falha ao carregar o dashboard.', 'danger');
                }
            });
    }

    // ================================================================================
    // BIND ACTIONS
    // ================================================================================

    function bindActions() {
        var newBtn = document.getElementById('reportTemplatesNewBtn');
        if (newBtn) {
            newBtn.addEventListener('click', function () {
                openNewModal();
            });
        }

        var saveBtn = document.getElementById('reportTemplateSaveBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', function () {
                saveTemplate();
            });
        }

        var deleteConfirmBtn = document.getElementById('reportTemplateDeleteConfirmBtn');
        if (deleteConfirmBtn) {
            deleteConfirmBtn.addEventListener('click', function () {
                confirmDelete();
            });
        }

        var backBtn = document.getElementById('reportTemplatesBackBtn');
        if (backBtn) {
            backBtn.addEventListener('click', function () {
                goBackToDashboard();
            });
        }
    }

})();
