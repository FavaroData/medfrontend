// report-review-list.js — lista da fila de revisão (PENDING_REVIEW + IN_REVIEW)
(function () {
    'use strict';

    var table = null;

    window.initReportReviewList = function () {
        bindEvents();
        loadList();
    };

    function bindEvents() {
        $('#reportReviewListRefreshBtn').off('click').on('click', function () {
            loadList();
        });
        $('#reportReviewBackBtn').off('click').on('click', function () {
            if (typeof loadContent === 'function') {
                loadContent('report');
            } else {
                window.location.hash = '#report';
            }
        });
    }

    function loadList() {
        if (table) {
            table.ajax.reload(null, false);
            return;
        }
        table = $('#reportReviewListTable').DataTable({
            autoWidth: false,
            language: { url: '//cdn.datatables.net/plug-ins/1.13.4/i18n/pt-BR.json' },
            order: [[7, 'asc']],
            ajax: {
                url: '/api/report/reviews/queue',
                dataSrc: ''
            },
            columns: [
                {
                    data: 'reviewStatus',
                    width: '10%',
                    render: function (s) {
                        if (s === 'PENDING_REVIEW') return '<span class="badge bg-secondary">Pendente</span>';
                        if (s === 'IN_REVIEW') return '<span class="badge bg-primary">Em revisão</span>';
                        return '<span class="badge bg-light text-dark">' + (s || '—') + '</span>';
                    }
                },
                { data: 'source', width: '8%', render: function (s) { return s || '—'; } },
                { data: 'accessionNumber', width: '10%', render: function (s) { return s || '—'; } },
                { data: 'patientName', width: '15%' },
                { data: 'serviceName', width: '15%' },
                { data: 'performingPhysicianName', width: '12%' },
                { data: 'typedByName', width: '10%' },
                {
                    data: 'typedAt',
                    width: '10%',
                    render: function (v) {
                        if (!v) return '—';
                        try {
                            var d = new Date(v);
                            return isNaN(d.getTime()) ? v : d.toLocaleString('pt-BR');
                        } catch (e) { return v; }
                    }
                },
                {
                    data: 'reviewerEdited',
                    width: '5%',
                    className: 'text-center',
                    render: function (v) {
                        return v ? '<i class="fas fa-pen text-warning" title="Revisor editou"></i>' : '';
                    }
                },
                {
                    data: null,
                    width: '5%',
                    className: 'text-end',
                    orderable: false,
                    render: function (row) {
                        return '<button class="btn btn-sm btn-primary btn-open-review" data-order-id="' +
                            row.orderId + '" title="Abrir revisão"><i class="fas fa-eye me-1"></i>Abrir</button>';
                    }
                }
            ]
        });

        $('#reportReviewListTable').off('click', '.btn-open-review').on('click', '.btn-open-review', function () {
            var oid = $(this).data('order-id');
            if (typeof openReportReviewEditor === 'function') {
                openReportReviewEditor(oid);
            } else {
                console.error('[ReportReview] openReportReviewEditor não disponível');
            }
        });
    }
})();
