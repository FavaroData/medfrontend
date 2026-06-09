/**
 * DICOM Print Configuration page JS
 * Loads dicom.print.* configs from /admin/api/configurations and saves changes.
 */
(function (window) {
    'use strict';

    const ADMIN_API = '/admin/api/configurations';
    let loadedConfigs = {}; // key → AppConfiguration

    const dicomPrintConfig = {
        init: function () {
            this.bindEvents();
            this.loadConfigs();
        },

        bindEvents: function () {
            $('#printConfigForm').off('submit').on('submit', (e) => {
                e.preventDefault();
                this.saveConfigs();
            });
            $('#printConfigReloadBtn').off('click').on('click', () => this.loadConfigs());
        },

        loadConfigs: function () {
            $.ajax({ url: ADMIN_API, method: 'GET' })
                .done((data) => {
                    loadedConfigs = {};
                    (data || []).forEach((c) => {
                        if (c.configKey && c.configKey.indexOf('dicom.print.') === 0) {
                            loadedConfigs[c.configKey] = c;
                        }
                    });
                    this.populateForm();
                })
                .fail(() => {
                    if (typeof showAlert === 'function') {
                        showAlert('danger', 'Falha ao carregar configurações. Verifique autenticação admin.');
                    }
                });
        },

        populateForm: function () {
            $('#printConfigForm [data-cfg-key]').each(function () {
                const key = $(this).data('cfg-key');
                const cfg = loadedConfigs[key];
                if (cfg && cfg.configValue != null) {
                    $(this).val(cfg.configValue);
                }
            });
        },

        saveConfigs: function () {
            const updates = [];
            $('#printConfigForm [data-cfg-key]').each(function () {
                const key = $(this).data('cfg-key');
                const val = ($(this).val() ?? '').toString();
                const existing = loadedConfigs[key];
                if (!existing) return;
                if ((existing.configValue ?? '').toString() !== val) {
                    updates.push(Object.assign({}, existing, { configValue: val }));
                }
            });

            if (updates.length === 0) {
                if (typeof showAlert === 'function') showAlert('info', 'Nada para salvar');
                return;
            }

            const promises = updates.map((cfg) => $.ajax({
                url: ADMIN_API,
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(cfg)
            }));

            Promise.all(promises).then(() => {
                this.loadConfigs();
            }).catch(() => {
                if (typeof showAlert === 'function') {
                    showAlert('danger', 'Falha ao salvar uma ou mais configurações');
                }
            });
        }
    };

    window.dicomPrintConfig = dicomPrintConfig;
})(window);
