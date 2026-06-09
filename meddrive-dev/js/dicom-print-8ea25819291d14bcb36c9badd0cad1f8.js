/**
 * DICOM Print Module - Dashboard JS
 * Depends on: jQuery, DataTables, Bootstrap 5, ui-utils (showAlert)
 */
(function (window) {
    'use strict';

    const API = '/api/dicom-print';
    let dataTable = null;

    const dicomPrintDashboard = {
        init: function () {
            this.bindEvents();
            this.loadStatus();
            this.loadStatistics();
            this.loadSessions();
        },

        bindEvents: function () {
            $('#printRefreshBtn').off('click').on('click', () => {
                this.loadStatus();
                this.loadStatistics();
                this.loadSessions();
            });

            $('#printStartScpBtn').off('click').on('click', () => {
                this.controlScp('start');
            });

            $('#printStopScpBtn').off('click').on('click', () => {
                if (!confirm('Parar o DICOM Print SCP? Clientes não conseguirão imprimir enquanto estiver parado.')) return;
                this.controlScp('stop');
            });

            $('#printStatusFilter, #printAeFilter, #printSearchFilter')
                .off('input change')
                .on('input change', () => {
                    if (dataTable) dataTable.draw();
                });
        },

        loadStatus: function () {
            $.getJSON(`${API}/status`)
                .done((data) => {
                    const text = data.running
                        ? `<span class="badge bg-success">ONLINE</span> ${data.aeTitle} @ ${data.port}`
                        : `<span class="badge bg-danger">OFFLINE</span> (${data.aeTitle} @ ${data.port})`;
                    $('#dicom-print-status-text').html(text);
                })
                .fail(() => {
                    $('#dicom-print-status-text').html('<span class="badge bg-secondary">Indisponível</span>');
                });
        },

        loadStatistics: function () {
            $.getJSON(`${API}/statistics`)
                .done((data) => {
                    $('#printStatsTotal7Days').text(data.totalSessionsLast7Days ?? 0);
                    $('#printStatsPrinted').text(data.totalSessionsPrinted ?? 0);
                    $('#printStatsForwarded').text(data.totalJobsImagerForwarded7Days ?? 0);
                    $('#printStatsErrors').text(data.totalSessionsError ?? 0);
                });
        },

        loadSessions: function () {
            const self = this;
            if (dataTable) {
                dataTable.ajax.reload(null, false);
                return;
            }

            dataTable = $('#print-sessions-table').DataTable({
                autoWidth: false,
                order: [[0, 'desc']],
                pageLength: 25,
                ajax: {
                    url: `${API}/sessions?page=0&size=500`,
                    dataSrc: (json) => self.applyClientFilters(json)
                },
                columns: [
                    { data: 'receivedAt', title: 'Recebido', width: '14%',
                        render: (d) => self.formatDate(d) },
                    { data: 'filmSessionLabel', title: 'Label', width: '14%',
                        render: (d) => d || '<span class="text-muted">—</span>' },
                    { data: 'callingAETitle', title: 'AE Origem', width: '10%',
                        render: (d) => d || '<span class="text-muted">—</span>' },
                    { data: 'accessionNumber', title: 'Accession', width: '12%',
                        render: (d) => d || '<span class="text-muted">—</span>' },
                    { data: 'filmBoxes', title: 'Film Boxes', width: '8%',
                        render: (fb) => Array.isArray(fb) ? fb.length : 0 },
                    { data: 'printPriority', title: 'Prioridade', width: '9%',
                        render: (d) => d || '<span class="text-muted">—</span>' },
                    { data: 'numberOfCopies', title: 'Cópias', width: '6%',
                        render: (d) => d ?? 1 },
                    { data: 'status', title: 'Status', width: '10%',
                        render: (d) => self.renderStatusBadge(d) },
                    { data: null, title: 'Ações', width: '12%', orderable: false,
                        render: (row) => self.renderActions(row) }
                ],
                language: { url: '//cdn.datatables.net/plug-ins/1.13.4/i18n/pt-BR.json' }
            });

            // Event delegation
            $('#print-sessions-table').off('click', '.print-action-details')
                .on('click', '.print-action-details', function () {
                    const uid = $(this).data('uid');
                    self.openDetailsModal(uid);
                });
            $('#print-sessions-table').off('click', '.print-action-delete')
                .on('click', '.print-action-delete', function () {
                    const uid = $(this).data('uid');
                    self.deleteSession(uid);
                });
            $('#print-sessions-table').off('click', '.print-action-rerender')
                .on('click', '.print-action-rerender', function () {
                    const uid = $(this).data('uid');
                    self.rerenderSession(uid);
                });
        },

        applyClientFilters: function (data) {
            const status = ($('#printStatusFilter').val() || '').trim();
            const ae = ($('#printAeFilter').val() || '').trim().toUpperCase();
            const search = ($('#printSearchFilter').val() || '').trim().toUpperCase();

            return data.filter((s) => {
                if (status && s.status !== status) return false;
                if (ae && (s.callingAETitle || '').toUpperCase().indexOf(ae) === -1) return false;
                if (search) {
                    const hay = [s.sessionUid, s.accessionNumber, s.filmSessionLabel]
                        .map(v => (v || '').toUpperCase()).join(' ');
                    if (hay.indexOf(search) === -1) return false;
                }
                return true;
            });
        },

        renderStatusBadge: function (status) {
            const map = {
                OPEN: 'bg-info', PRINTING: 'bg-warning text-dark',
                PRINTED: 'bg-success', CLOSED: 'bg-secondary', ERROR: 'bg-danger'
            };
            const cls = map[status] || 'bg-secondary';
            return `<span class="badge ${cls}">${status || '—'}</span>`;
        },

        renderActions: function (row) {
            return `
                <button class="btn-icon-only print-action-details" data-uid="${row.sessionUid}" title="Detalhes">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn-icon-only print-action-rerender" data-uid="${row.sessionUid}" title="Re-renderizar sessão">
                    <i class="fas fa-redo"></i>
                </button>
                <button class="btn-icon-only print-action-delete text-danger" data-uid="${row.sessionUid}" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        },

        openDetailsModal: function (sessionUid) {
            const self = this;
            $.getJSON(`${API}/sessions/${encodeURIComponent(sessionUid)}`)
                .done((session) => {
                    $('#printDetailsSessionUid').text(session.sessionUid);
                    $('#printDetailsCallingAe').text(session.callingAETitle || '—');
                    $('#printDetailsStatus').html(self.renderStatusBadge(session.status));

                    const tbody = $('#printFilmBoxesTable tbody').empty();
                    (session.filmBoxes || []).forEach((fb) => {
                        const renderedActions = `
                            <a class="btn btn-sm btn-outline-primary" target="_blank"
                               href="${API}/film-boxes/${encodeURIComponent(fb.filmBoxUid)}/png">
                                <i class="fas fa-image me-1"></i> PNG
                            </a>
                            <a class="btn btn-sm btn-outline-danger" target="_blank"
                               href="${API}/film-boxes/${encodeURIComponent(fb.filmBoxUid)}/pdf">
                                <i class="fas fa-file-pdf me-1"></i> PDF
                            </a>
                        `;
                        const rerenderBtn = `
                            <button class="btn btn-sm btn-outline-warning fb-rerender-btn"
                                    data-uid="${fb.filmBoxUid}" title="Re-renderizar a partir do raw">
                                <i class="fas fa-redo me-1"></i> Re-render
                            </button>
                        `;
                        const actions = (fb.status === 'RENDERED' ? renderedActions : '') + rerenderBtn;

                        tbody.append(`
                            <tr>
                                <td>${fb.imageDisplayFormat || '—'}</td>
                                <td>${fb.filmSizeId || '—'}</td>
                                <td>${fb.imageBoxCount ?? 0}</td>
                                <td>${fb.colorPrint ? 'Sim' : 'Não'}</td>
                                <td>${self.renderStatusBadge(fb.status)}</td>
                                <td>${self.formatDate(fb.renderedAt)}</td>
                                <td>${actions}</td>
                            </tr>
                        `);
                    });

                    $('#printFilmBoxesTable').off('click', '.fb-rerender-btn')
                        .on('click', '.fb-rerender-btn', function () {
                            const fbUid = $(this).data('uid');
                            self.rerenderFilmBox(fbUid, sessionUid);
                        });

                    const modal = new bootstrap.Modal(document.getElementById('printSessionDetailsModal'));
                    modal.show();
                })
                .fail(() => {
                    if (typeof showAlert === 'function') {
                        showAlert('danger', 'Falha ao carregar detalhes da sessão');
                    }
                });
        },

        rerenderFilmBox: function (filmBoxUid, sessionUid) {
            $.post(`${API}/film-boxes/${encodeURIComponent(filmBoxUid)}/rerender`)
                .done((msg) => {
                    if (sessionUid) this.openDetailsModal(sessionUid);
                })
                .fail((xhr) => {
                    const msg = xhr.responseText || 'Falha no re-render do Film Box';
                    if (typeof showAlert === 'function') showAlert('danger', msg);
                });
        },

        rerenderSession: function (sessionUid) {
            if (!confirm('Re-renderizar PNG/PDF de todos os Film Boxes desta sessão a partir dos PixelData salvos?')) return;
            $.post(`${API}/sessions/${encodeURIComponent(sessionUid)}/rerender`)
                .done((msg) => {
                    dataTable && dataTable.ajax.reload(null, false);
                })
                .fail((xhr) => {
                    const msg = xhr.responseText || 'Falha no re-render';
                    if (typeof showAlert === 'function') showAlert('danger', msg);
                });
        },

        deleteSession: function (sessionUid) {
            if (!confirm('Excluir esta Film Session e todos os arquivos associados?')) return;
            $.ajax({
                url: `${API}/sessions/${encodeURIComponent(sessionUid)}`,
                method: 'DELETE'
            }).done(() => {
                dataTable && dataTable.ajax.reload(null, false);
                this.loadStatistics();
            }).fail(() => {
                if (typeof showAlert === 'function') showAlert('danger', 'Falha ao excluir sessão');
            });
        },

        controlScp: function (action) {
            $.post(`${API}/${action}`)
                .done((msg) => {
                    setTimeout(() => this.loadStatus(), 500);
                })
                .fail((xhr) => {
                    const msg = xhr.responseText || `Falha ao ${action}`;
                    if (typeof showAlert === 'function') showAlert('danger', msg);
                });
        },

        formatDate: function (iso) {
            if (!iso) return '<span class="text-muted">—</span>';
            try {
                const d = new Date(iso);
                return d.toLocaleString('pt-BR');
            } catch (e) {
                return iso;
            }
        }
    };

    // Expose globally for dashboard.js loader
    window.dicomPrintDashboard = dicomPrintDashboard;
})(window);
