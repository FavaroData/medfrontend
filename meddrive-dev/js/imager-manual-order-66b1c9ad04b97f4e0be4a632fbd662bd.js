// imager-manual-order.js — Modal para adicionar pacientes manualmente no worklist
// do Imager (apenas habilitado quando his.integration.type=AMPLIMED).
(function () {
    'use strict';

    var configsCache = null;

    /**
     * Init: bind handlers do botão e form. Idempotente — pode ser chamado várias
     * vezes (cada call remove handlers anteriores antes de re-bind).
     */
    window.initImagerManualOrder = function () {
        var btn = document.getElementById('imagerManualOrderBtn');
        if (!btn) return; // gated pelo hisType=AMPLIMED, pode não existir

        // Remove previous binding if any
        $(btn).off('click.manualOrder').on('click.manualOrder', openModal);

        var form = document.getElementById('imagerManualOrderForm');
        if (form) {
            $(form).off('submit.manualOrder').on('submit.manualOrder', function (e) {
                e.preventDefault();
                submitManualOrder();
            });
        }
    };

    function openModal() {
        clearAlerts();
        resetForm();
        loadExamConfigs();
        var modalEl = document.getElementById('imagerManualOrderModal');
        if (!modalEl) return;
        if (typeof bootstrap !== 'undefined') {
            bootstrap.Modal.getOrCreateInstance(modalEl).show();
        } else if (typeof $ !== 'undefined') {
            $(modalEl).modal('show');
        }
    }

    function closeModal() {
        var modalEl = document.getElementById('imagerManualOrderModal');
        if (!modalEl) return;
        if (typeof bootstrap !== 'undefined') {
            var inst = bootstrap.Modal.getInstance(modalEl);
            if (inst) inst.hide();
        } else if (typeof $ !== 'undefined') {
            $(modalEl).modal('hide');
        }
    }

    function resetForm() {
        var form = document.getElementById('imagerManualOrderForm');
        if (form) form.reset();
        // Default datetime = now (local)
        var dt = document.getElementById('manualOrderDateTime');
        if (dt) {
            var now = new Date();
            var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
            dt.value = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
                     + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
        }
    }

    function loadExamConfigs() {
        var select = document.getElementById('manualExamConfigSelect');
        if (!select) return;

        if (configsCache) {
            populateSelect(select, configsCache);
            return;
        }

        $.get('/api/imager/exams')
            .done(function (configs) {
                configsCache = configs || [];
                populateSelect(select, configsCache);
            })
            .fail(function (xhr) {
                console.error('[ImagerManualOrder] erro ao carregar configs:', xhr);
                select.replaceChildren();
                var opt = document.createElement('option');
                opt.value = '';
                opt.textContent = 'Falha ao carregar procedimentos';
                select.appendChild(opt);
            });
    }

    function populateSelect(select, configs) {
        select.replaceChildren();

        var placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Selecione um procedimento...';
        select.appendChild(placeholder);

        if (!configs || configs.length === 0) {
            placeholder.textContent = 'Nenhum procedimento configurado';
            return;
        }

        configs.forEach(function (cfg) {
            var opt = document.createElement('option');
            // configId vem como 'id'; nome do exame como 'exameName' ou 'dsProcesso'
            opt.value = String(cfg.id);
            var label = cfg.exameName || cfg.dsProcesso || ('Config #' + cfg.id);
            if (cfg.exameCode) label += ' (' + cfg.exameCode + ')';
            opt.textContent = label;
            opt.setAttribute('data-exam-code', cfg.exameCode || '');
            opt.setAttribute('data-exam-name', cfg.exameName || cfg.dsProcesso || '');
            opt.setAttribute('data-ds-processo', cfg.dsProcesso || '');
            select.appendChild(opt);
        });
    }

    function submitManualOrder() {
        clearAlerts();

        var name = val('manualPatientName');
        var cpf = val('manualPatientNationalId');
        var birth = val('manualPatientBirthDate'); // yyyy-MM-dd
        var sex = val('manualPatientSex');
        var rg = val('manualPatientIdentityCard');
        var configSel = document.getElementById('manualExamConfigSelect');
        var configId = configSel ? configSel.value : '';
        var dt = val('manualOrderDateTime'); // yyyy-MM-ddTHH:mm
        var refPhysician = val('manualReferringPhysician');

        if (!name || !cpf || !birth || !configId) {
            showAlertInModal('Preencha todos os campos obrigatórios (nome, CPF, data de nascimento, procedimento).', 'danger');
            return;
        }

        var opt = configSel.options[configSel.selectedIndex];
        var examCode = opt.getAttribute('data-exam-code') || '';
        var examName = opt.getAttribute('data-exam-name') || '';

        // ISO datetime
        var orderDt = dt ? dt + ':00' : new Date().toISOString().slice(0, 19);

        var ts = Date.now();
        var manualId = 'MAN-' + ts;

        var payload = {
            // Chave composta
            placerOrderNumber: manualId,
            fillerOrderNumber: '0',
            configId: parseInt(configId, 10),

            // Paciente — patientId e otherPatientId são not-null no banco; usar CPF como chave
            patientId: cpf,
            otherPatientId: cpf,
            patientName: name,
            patientFirstName: '',       // campo not-null no banco; nome completo já está em patientName
            patientNationalId: cpf,
            patientBirthDate: birth,    // backend deserializa LocalDate a partir de yyyy-MM-dd
            patientSex: sex || null,
            patientIdentityCard: rg || null,

            // Procedimento
            universalServiceId: examCode || ('MAN-' + manualId),
            procedureDescription: examName || 'Manual',
            procedureCodeInternal: examCode || manualId,
            procedureDescInternal: examName || 'Manual',

            // Metadados do pedido
            orderDateTime: orderDt,
            accessionNumber: manualId,
            orderStatus: 'PENDING',

            // Opcionais
            referringPhysicianName: refPhysician || null,
            visitNumber: null,
            modality: null,
            studyDescription: examName || null
        };

        var saveBtn = document.getElementById('imagerManualOrderSaveBtn');
        if (saveBtn) saveBtn.disabled = true;

        $.ajax({
            url: '/api/imager/exam-orders',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(payload),
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
            .done(function () {
                closeModal();
                if (typeof showAlert === 'function') {
                    showAlert('Paciente adicionado ao worklist com sucesso.', 'success');
                }
                // Reload da DataTable principal de orders do Imager
                if (window.imagerWorklistTable && typeof window.imagerWorklistTable.ajax === 'object') {
                    window.imagerWorklistTable.ajax.reload(null, false);
                } else if (typeof $.fn.DataTable.isDataTable === 'function' &&
                           $.fn.DataTable.isDataTable('#imagerWorklistTable')) {
                    $('#imagerWorklistTable').DataTable().ajax.reload(null, false);
                }
            })
            .fail(function (xhr) {
                console.error('[ImagerManualOrder] erro no POST:', xhr);
                var msg = 'Falha ao adicionar paciente.';
                if (xhr && xhr.responseJSON && xhr.responseJSON.message) {
                    msg += ' ' + xhr.responseJSON.message;
                } else if (xhr && xhr.status) {
                    msg += ' (HTTP ' + xhr.status + ')';
                }
                showAlertInModal(msg, 'danger');
            })
            .always(function () {
                if (saveBtn) saveBtn.disabled = false;
            });
    }

    function val(id) {
        var el = document.getElementById(id);
        return el ? (el.value || '').trim() : '';
    }

    function clearAlerts() {
        var container = document.getElementById('imagerManualOrderAlerts');
        if (container) container.replaceChildren();
    }

    function showAlertInModal(msg, type) {
        var container = document.getElementById('imagerManualOrderAlerts');
        if (!container) return;
        container.replaceChildren();
        var div = document.createElement('div');
        div.className = 'alert alert-' + (type || 'info') + ' alert-dismissible fade show py-2 small';
        div.setAttribute('role', 'alert');
        div.textContent = msg;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-close';
        btn.setAttribute('data-bs-dismiss', 'alert');
        btn.setAttribute('aria-label', 'Fechar');
        div.appendChild(btn);
        container.appendChild(div);
    }
})();
