// report-review-editor.js — editor de revisão (split-screen + Aprovar/Rejeitar)
(function () {
    'use strict';

    var quill = null;
    var pdfDoc = null;
    var totalPages = 0;
    var zoomLevel = 1.0;
    var orderId = null;
    var detailCache = null;
    var autosaveTimer = null;
    var autosaveInFlight = false;
    var lastSavedHtml = '';
    var initialSubmittedHtml = '';
    var renderGeneration = 0;
    var AUTOSAVE_DEBOUNCE_MS = 3000;
    var AUTOSAVE_MAX_INTERVAL_MS = 30000;
    var lastSaveAt = 0;

    window.initReportReviewEditor = function (orderIdParam) {
        orderId = orderIdParam;
        if (!orderId) {
            console.error('[ReportReview] orderId ausente');
            return;
        }
        loadDetail()
            .then(function (detail) {
                detailCache = detail;
                renderHeader(detail);
                initQuill(detail.currentDraftHtml || '');
                initialSubmittedHtml = detail.currentDraftHtml || '';
                lastSavedHtml = initialSubmittedHtml;
                loadPdf();
                bindPdfControls();
                bindActions();
                openReviewOnServer();
                updateAutosaveStatus('idle');
            })
            .catch(function (err) {
                console.error('[ReportReview] erro carregando detail:', err);
                alertMsg('danger', 'Não foi possível carregar o exame.');
            });
    };

    function loadDetail() {
        return fetch('/api/report/orders/' + encodeURIComponent(orderId))
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            });
    }

    function openReviewOnServer() {
        // PENDING_REVIEW → IN_REVIEW. Idempotente — 200 OK em IN_REVIEW.
        fetch('/api/report/reviews/' + encodeURIComponent(orderId) + '/open', { method: 'POST' })
            .then(function (r) {
                if (!r.ok && r.status !== 409) {
                    console.warn('[ReportReview] openReview retornou', r.status);
                }
            });
    }

    function renderHeader(detail) {
        $('#reportReviewHeaderPatient').text(detail.patientName || '—');
        $('#reportReviewHeaderExam').text(detail.serviceName || '—');
        $('#reportReviewHeaderAccession').text(detail.accessionNumber || '—');
        $('#reportReviewHeaderTypedBy').text(detail.typedByName || '—');
        var status = detail.reviewStatus || detail.orderStatus || '—';
        $('#reportReviewHeaderStatus').text(status).removeClass().addClass('badge ' + statusBadgeClass(status));
    }

    function statusBadgeClass(status) {
        switch (status) {
            case 'PENDING_REVIEW': return 'bg-secondary';
            case 'IN_REVIEW': return 'bg-primary';
            case 'APPROVED': return 'bg-success';
            case 'REJECTED': return 'bg-danger';
            case 'DELIVERED': return 'bg-success';
            default: return 'bg-light text-dark';
        }
    }

    function initQuill(htmlContent) {
        var container = document.getElementById('reportReviewQuillEditor');
        if (!container) {
            console.error('[ReportReview] reportReviewQuillEditor não encontrado');
            return;
        }
        quill = new Quill(container, {
            theme: 'snow',
            modules: {
                toolbar: [
                    ['bold', 'italic', 'underline'],
                    [{ list: 'ordered' }, { list: 'bullet' }],
                    [{ header: [1, 2, 3, false] }],
                    [{ align: [] }],
                    ['clean']
                ]
            },
            placeholder: 'Conteúdo do laudo…'
        });
        if (htmlContent) {
            quill.clipboard.dangerouslyPasteHTML(htmlContent);
        }
        quill.on('text-change', scheduleAutosave);
    }

    function loadPdf() {
        if (!window.pdfjsLib) {
            var pageInfo = document.getElementById('reportReviewPdfPageInfo');
            if (pageInfo) pageInfo.textContent = 'PDF.js indisponível';
            return;
        }
        var url = '/api/report/orders/' + encodeURIComponent(orderId) + '/pdf';
        pdfjsLib.getDocument(url).promise
            .then(function (doc) {
                pdfDoc = doc;
                totalPages = doc.numPages;
                renderAllPages();
                updatePageInfo();
            })
            .catch(function (err) {
                console.warn('[ReportReview] PDF indisponível:', err && err.message);
                var pageInfo = document.getElementById('reportReviewPdfPageInfo');
                if (pageInfo) pageInfo.textContent = 'PDF indisponível';
            });
    }

    function renderAllPages() {
        if (!pdfDoc) return;
        var container = document.getElementById('reportReviewPdfCanvasContainer');
        if (!container) return;
        container.replaceChildren();
        renderGeneration++;
        var gen = renderGeneration;
        for (var i = 1; i <= totalPages; i++) {
            (function (pageNum) {
                pdfDoc.getPage(pageNum).then(function (page) {
                    if (gen !== renderGeneration) return;
                    var viewport = page.getViewport({ scale: zoomLevel });
                    var canvas = document.createElement('canvas');
                    canvas.className = 'report-pdf-page';
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    container.appendChild(canvas);
                    page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport });
                });
            })(i);
        }
    }

    function updatePageInfo() {
        var pageInfo = document.getElementById('reportReviewPdfPageInfo');
        if (pageInfo) {
            pageInfo.textContent = totalPages > 0
                ? totalPages + (totalPages === 1 ? ' página' : ' páginas')
                : '—';
        }
        var zoomInfo = document.getElementById('reportReviewPdfZoomInfo');
        if (zoomInfo) zoomInfo.textContent = Math.round(zoomLevel * 100) + '%';
    }

    function bindPdfControls() {
        $('#reportReviewPdfZoomInBtn').off('click').on('click', function () {
            zoomLevel = Math.min(3.0, zoomLevel + 0.25);
            renderAllPages(); updatePageInfo();
        });
        $('#reportReviewPdfZoomOutBtn').off('click').on('click', function () {
            zoomLevel = Math.max(0.5, zoomLevel - 0.25);
            renderAllPages(); updatePageInfo();
        });
        $('#reportReviewPdfZoomResetBtn').off('click').on('click', function () {
            zoomLevel = 1.0;
            renderAllPages(); updatePageInfo();
        });
    }

    function scheduleAutosave() {
        if (autosaveTimer) clearTimeout(autosaveTimer);
        updateAutosaveStatus('typing');
        updateEditedBadge();
        autosaveTimer = setTimeout(doAutosave, AUTOSAVE_DEBOUNCE_MS);
        if (lastSaveAt > 0 && (Date.now() - lastSaveAt) > AUTOSAVE_MAX_INTERVAL_MS) {
            clearTimeout(autosaveTimer);
            doAutosave();
        }
    }

    function doAutosave() {
        if (autosaveInFlight) return;
        var html = currentHtml();
        if (html === lastSavedHtml) {
            updateAutosaveStatus('saved');
            return;
        }
        autosaveInFlight = true;
        updateAutosaveStatus('saving');
        fetch('/api/report/reviews/' + encodeURIComponent(orderId) + '/content', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contentHtml: html })
        })
            .then(function (r) {
                autosaveInFlight = false;
                if (r.ok) {
                    lastSavedHtml = html;
                    lastSaveAt = Date.now();
                    updateAutosaveStatus('saved');
                } else if (r.status === 409) {
                    updateAutosaveStatus('conflict');
                    alertMsg('warning', 'Review em estado terminal — não aceita mais edits.');
                } else {
                    updateAutosaveStatus('error');
                }
            })
            .catch(function () {
                autosaveInFlight = false;
                updateAutosaveStatus('error');
            });
    }

    function currentHtml() {
        if (!quill) return '';
        return quill.root.innerHTML;
    }

    function updateEditedBadge() {
        var badge = document.getElementById('reportReviewEditedBadge');
        if (!badge) return;
        var edited = currentHtml() !== initialSubmittedHtml;
        badge.style.display = edited ? '' : 'none';
    }

    function updateAutosaveStatus(state) {
        var el = document.getElementById('reportReviewAutosaveStatus');
        if (!el) return;
        switch (state) {
            case 'typing':  el.textContent = 'Digitando…'; el.className = 'report-autosave-status text-muted'; break;
            case 'saving':  el.textContent = 'Salvando…'; el.className = 'report-autosave-status text-info'; break;
            case 'saved':   el.textContent = 'Salvo'; el.className = 'report-autosave-status text-success'; break;
            case 'error':   el.textContent = 'Erro ao salvar'; el.className = 'report-autosave-status text-danger'; break;
            case 'conflict':el.textContent = 'Conflito (estado terminal)'; el.className = 'report-autosave-status text-warning'; break;
            case 'idle':
            default:        el.textContent = '—'; el.className = 'report-autosave-status text-muted'; break;
        }
    }

    function bindActions() {
        $('#reportReviewBackBtn').off('click').on('click', function () {
            // Salva pendente antes de sair
            if (autosaveTimer) { clearTimeout(autosaveTimer); doAutosave(); }
            closeModalAndRefreshList();
        });

        $('#reportReviewApproveBtn').off('click').on('click', function () {
            // Garante que último edit foi salvo antes de aprovar
            if (autosaveTimer) { clearTimeout(autosaveTimer); doAutosave(); }
            bootstrap.Modal.getOrCreateInstance(document.getElementById('reportReviewApproveModal')).show();
        });

        $('#reportReviewApproveConfirmBtn').off('click').on('click', function () {
            performApprove();
        });

        $('#reportReviewRejectBtn').off('click').on('click', function () {
            $('#reportReviewRejectReason').val('');
            bootstrap.Modal.getOrCreateInstance(document.getElementById('reportReviewRejectModal')).show();
        });

        $('#reportReviewRejectConfirmBtn').off('click').on('click', function () {
            performReject();
        });
    }

    function performApprove() {
        var btn = document.getElementById('reportReviewApproveConfirmBtn');
        if (btn) btn.disabled = true;
        fetch('/api/report/reviews/' + encodeURIComponent(orderId) + '/approve', { method: 'POST' })
            .then(function (r) {
                if (btn) btn.disabled = false;
                if (r.ok) {
                    alertMsg('success', 'Laudo aprovado. Pipeline pós-aprovação iniciado.');
                    bootstrap.Modal.getInstance(document.getElementById('reportReviewApproveModal')).hide();
                    closeModalAndRefreshList();
                } else if (r.status === 409) {
                    alertMsg('warning', 'Review em estado terminal — não pode aprovar.');
                } else if (r.status === 404) {
                    alertMsg('danger', 'Review não encontrada.');
                } else {
                    alertMsg('danger', 'Erro ao aprovar (HTTP ' + r.status + ').');
                }
            })
            .catch(function () {
                if (btn) btn.disabled = false;
                alertMsg('danger', 'Falha de rede ao aprovar.');
            });
    }

    function performReject() {
        var reason = ($('#reportReviewRejectReason').val() || '').trim();
        if (!reason) {
            alertMsg('warning', 'Motivo da rejeição é obrigatório.');
            return;
        }
        var btn = document.getElementById('reportReviewRejectConfirmBtn');
        if (btn) btn.disabled = true;
        fetch('/api/report/reviews/' + encodeURIComponent(orderId) + '/reject', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: reason })
        })
            .then(function (r) {
                if (btn) btn.disabled = false;
                if (r.ok) {
                    alertMsg('success', 'Laudo rejeitado.');
                    bootstrap.Modal.getInstance(document.getElementById('reportReviewRejectModal')).hide();
                    closeModalAndRefreshList();
                } else if (r.status === 400) {
                    alertMsg('warning', 'Motivo da rejeição é obrigatório.');
                } else if (r.status === 409) {
                    alertMsg('warning', 'Review em estado terminal — não pode rejeitar.');
                } else if (r.status === 404) {
                    alertMsg('danger', 'Review não encontrada.');
                } else {
                    alertMsg('danger', 'Erro ao rejeitar (HTTP ' + r.status + ').');
                }
            })
            .catch(function () {
                if (btn) btn.disabled = false;
                alertMsg('danger', 'Falha de rede ao rejeitar.');
            });
    }

    function closeModalAndRefreshList() {
        if (typeof closeReportEditorModal === 'function') {
            closeReportEditorModal();
        }
        // Tenta atualizar a fila se estiver aberta
        if (typeof initReportReviewList === 'function') {
            setTimeout(initReportReviewList, 200);
        }
    }

    function alertMsg(type, msg) {
        if (typeof showAlert === 'function') {
            showAlert(msg, type);
            return;
        }
        var container = $('#alertsContainer');
        if (!container.length) {
            console.log('[ReportReview]', type, msg);
            return;
        }
        var el = $('<div>').addClass('alert alert-dismissible fade show alert-' + type).attr('role', 'alert');
        el.append(document.createTextNode(msg));
        el.append($('<button>').addClass('btn-close').attr({
            type: 'button', 'data-bs-dismiss': 'alert', 'aria-label': 'Fechar'
        }));
        container.append(el);
        setTimeout(function () { el.alert('close'); }, 5000);
    }

    /**
     * Abre o editor de revisão no modal-fullscreen `reportEditorModal` (mesmo modal do local-editor).
     * Exportado para report-review-list.js / report-dashboard.js chamarem.
     */
    window.openReportReviewEditor = function (orderIdParam) {
        var modalEl = document.getElementById('reportEditorModal');
        var bodyEl = document.getElementById('reportEditorModalBody');
        if (!modalEl || !bodyEl) {
            console.error('[ReportReview] reportEditorModal não encontrado no DOM');
            return;
        }
        fetch('/report/review/' + encodeURIComponent(orderIdParam))
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.text();
            })
            .then(function (html) {
                $(bodyEl).html(html); // eslint-disable-line no-jquery/no-html
                var onShown = function () {
                    modalEl.removeEventListener('shown.bs.modal', onShown);
                    initReportReviewEditor(orderIdParam);
                };
                modalEl.addEventListener('shown.bs.modal', onShown);
                if (typeof bootstrap !== 'undefined') {
                    bootstrap.Modal.getOrCreateInstance(modalEl).show();
                } else {
                    $(modalEl).modal('show');
                }
            })
            .catch(function (err) {
                console.error('[ReportReview] erro ao abrir editor de revisão:', err);
                alertMsg('danger', 'Falha ao abrir o editor de revisão.');
            });
    };
})();
