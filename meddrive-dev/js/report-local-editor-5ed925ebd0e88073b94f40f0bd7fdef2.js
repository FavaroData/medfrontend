// report-local-editor.js — split-screen (PDF.js + Quill 2.x)
(function () {
    'use strict';

    var quill = null;
    var pdfDoc = null;
    var totalPages = 0;
    var zoomLevel = 1.0;
    var orderId = null;
    var detailCache = null;  // ReportOrderDetailDTO carregado no init — usado pra resolver macros
    var autosaveTimer = null;
    var autosaveInFlight = false;
    var pendingAutosave = false;
    var canEdit = true;

    var AUTOSAVE_DEBOUNCE_MS = 3000;
    var AUTOSAVE_MAX_INTERVAL_MS = 30000;
    var lastSaveAt = 0;

    // ── Macros do laudo ─────────────────────────────────────────────────
    // Resolução 100% client-side a partir do ReportOrderDetailDTO carregado.
    // Tokens são case-insensitive. Macro desconhecida fica como está no texto.
    var MACROS = [
        { token: 'paciente',            label: 'Nome do paciente',        resolve: function (d) { return d.patientName || ''; } },
        { token: 'cpf',                 label: 'CPF',                     resolve: function (d) { return formatCpf(d.patientCpf); } },
        { token: 'nascimento',          label: 'Data de nascimento',      resolve: function (d) { return formatDate(d.patientBirthDate); } },
        { token: 'idade',               label: 'Idade',                   resolve: function (d) { return calculateAge(d.patientBirthDate); } },
        { token: 'procedimento',        label: 'Procedimento',            resolve: function (d) { return d.serviceName || ''; } },
        { token: 'codigo_procedimento', label: 'Código do procedimento',  resolve: function (d) { return d.serviceCode || ''; } },
        { token: 'medico_solicitante',  label: 'Médico solicitante',      resolve: function (d) { return d.orderingProviderName || ''; } },
        { token: 'medico_executor',     label: 'Médico executor',         resolve: function (d) { return d.performingPhysicianName || ''; } },
        { token: 'data_exame',          label: 'Data do exame',           resolve: function (d) { return formatDateTime(d.orderDatetime); } },
        { token: 'numero_exame',        label: 'Número do exame',         resolve: function (d) { return d.accessionNumber || ''; } },
        { token: 'hoje',                label: 'Data de hoje',            resolve: function ()  { return formatDate(new Date().toISOString().substring(0, 10)); } }
    ];

    window.initReportLocalEditor = function (orderIdParam) {
        orderId = orderIdParam || extractOrderIdFromScript();
        if (!orderId) {
            console.error('[Report] orderId não encontrado para o editor');
            return;
        }
        loadDetail()
            .then(function (detail) {
                detailCache = detail;  // usado por resolveMacros + dropdowns
                renderHeader(detail);
                canEdit = detail.canEditLocally;
                initQuill(detail.currentDraftHtml);
                bindCancel();
                bindDelete();
                bindTemplatesDropdown(detail);
                bindMacrosDropdown(detail);
                bindResolveMacrosBtn();
                loadPdf();
                bindControls();
                bindFinalize();
                updateAutosaveStatus(canEdit ? 'idle' : 'readonly');
            })
            .catch(function (err) {
                console.error('[Report] erro ao carregar order:', err);
                showEditorError('Não foi possível carregar o exame.');
            });
    };

    function extractOrderIdFromScript() {
        // Tenta encontrar o script com data-order-id que foi carregado com esse módulo
        var scripts = document.querySelectorAll('script[data-order-id]');
        if (scripts.length > 0) {
            return scripts[scripts.length - 1].getAttribute('data-order-id');
        }
        return null;
    }

    function loadDetail() {
        return fetch('/api/report/orders/' + encodeURIComponent(orderId))
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            });
    }

    function renderHeader(d) {
        var patientEl = document.getElementById('reportHeaderPatient');
        if (patientEl) patientEl.textContent = d.patientName || '—';
        var examEl = document.getElementById('reportHeaderExam');
        if (examEl) examEl.textContent = d.serviceName || '—';
        var accEl = document.getElementById('reportHeaderAccession');
        if (accEl) accEl.textContent = d.accessionNumber || '—';
        var statusEl = document.getElementById('reportHeaderStatus');
        if (statusEl) {
            statusEl.textContent = d.orderStatus || '—';
            statusEl.className = 'badge badge-order-status-' + (d.orderStatus || '').toLowerCase();
        }
    }

    function initQuill(initialHtml) {
        var editorEl = document.getElementById('reportQuillEditor');
        if (!editorEl) {
            console.error('[Report] elemento #reportQuillEditor não encontrado');
            return;
        }
        if (typeof Quill === 'undefined') {
            console.error('[Report] Quill não carregado');
            return;
        }

        quill = new Quill(editorEl, {
            theme: 'snow',
            readOnly: !canEdit,
            modules: {
                toolbar: canEdit ? [
                    ['bold', 'italic', 'underline'],
                    [{ header: [1, 2, 3, false] }],
                    [{ list: 'ordered' }, { list: 'bullet' }],
                    [{ align: [] }],
                    ['blockquote'],
                    ['clean']
                ] : false
            }
        });

        // Conteúdo inicial: o backend devolve HTML JÁ SANITIZADO (OWASP server-side).
        // Carregado via clipboard.convert + setContents — Quill 2.x converte para Delta
        // internamente sem manipular innerHTML do editor diretamente.
        // NÃO usar dangerouslyPasteHTML nem atribuir a .innerHTML do editor.
        if (initialHtml && initialHtml.length > 0) {
            try {
                var delta = quill.clipboard.convert({ html: initialHtml });
                quill.setContents(delta, 'silent');
            } catch (e) {
                console.warn('[Report] fallback Quill 1.x para clipboard.convert:', e);
                // Fallback para Quill 1.x (clipboard.convert aceita string simples)
                try {
                    var deltaV1 = quill.clipboard.convert(initialHtml);
                    quill.setContents(deltaV1, 'silent');
                } catch (e2) {
                    console.error('[Report] erro ao carregar conteúdo no Quill:', e2);
                }
            }
        }

        if (canEdit) {
            quill.on('text-change', scheduleAutosave);
        }

        var finalizeBtn = document.getElementById('reportFinalizeBtn');
        if (finalizeBtn) finalizeBtn.disabled = !canEdit;
    }

    /**
     * Geração de render. Incrementa a cada `renderAllPages()` para que renders
     * antigos (ex: usuario clica zoom 2x rápido) sejam descartados ao terminarem.
     */
    var renderGeneration = 0;

    function loadPdf() {
        if (!window.pdfjsLib) {
            console.warn('[Report] pdfjsLib não carregada — painel PDF ficará vazio');
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
                console.error('[Report] erro ao abrir PDF:', err);
                // Não bloqueia o editor — PDF ausente é tolerável
                var pageInfo = document.getElementById('reportPdfPageInfo');
                if (pageInfo) pageInfo.textContent = 'PDF indisponível';
            });
    }

    /**
     * Renderiza TODAS as páginas, empilhadas verticalmente no
     * #reportPdfCanvasContainer. O `.report-editor-pdf-canvas-wrap` tem
     * `overflow: auto` (em report.css), então o usuário rola pra navegar.
     * Zoom dispara re-render completo.
     */
    function renderAllPages() {
        if (!pdfDoc) return;
        var container = document.getElementById('reportPdfCanvasContainer');
        if (!container) return;
        container.replaceChildren();
        renderGeneration++;
        var gen = renderGeneration;

        for (var i = 1; i <= totalPages; i++) {
            (function (pageNum) {
                pdfDoc.getPage(pageNum).then(function (page) {
                    // Render obsoleto (zoom rápido, modal fechado, etc.): descarta
                    if (gen !== renderGeneration) return;
                    var viewport = page.getViewport({ scale: zoomLevel });
                    var canvas = document.createElement('canvas');
                    canvas.className = 'report-pdf-page';
                    canvas.setAttribute('data-page-num', String(pageNum));
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    container.appendChild(canvas);
                    page.render({
                        canvasContext: canvas.getContext('2d'),
                        viewport: viewport
                    });
                });
            })(i);
        }
    }

    function updatePageInfo() {
        var pageInfo = document.getElementById('reportPdfPageInfo');
        if (pageInfo) {
            pageInfo.textContent = totalPages > 0
                ? totalPages + (totalPages === 1 ? ' página' : ' páginas')
                : '—';
        }
        var zoomInfo = document.getElementById('reportPdfZoomInfo');
        if (zoomInfo) zoomInfo.textContent = Math.round(zoomLevel * 100) + '%';
    }

    function bindControls() {
        var zoomInBtn = document.getElementById('reportPdfZoomInBtn');
        if (zoomInBtn) zoomInBtn.addEventListener('click', function () {
            zoomLevel = Math.min(3.0, zoomLevel + 0.25);
            renderAllPages();
            updatePageInfo();
        });

        var zoomOutBtn = document.getElementById('reportPdfZoomOutBtn');
        if (zoomOutBtn) zoomOutBtn.addEventListener('click', function () {
            zoomLevel = Math.max(0.5, zoomLevel - 0.25);
            renderAllPages();
            updatePageInfo();
        });

        var zoomResetBtn = document.getElementById('reportPdfZoomResetBtn');
        if (zoomResetBtn) zoomResetBtn.addEventListener('click', function () {
            zoomLevel = 1.0;
            renderAllPages();
            updatePageInfo();
        });
    }

    function scheduleAutosave() {
        if (!canEdit) return;
        if (autosaveTimer) clearTimeout(autosaveTimer);
        updateAutosaveStatus('typing');
        autosaveTimer = setTimeout(doAutosave, AUTOSAVE_DEBOUNCE_MS);
        // Garante que não passa mais de 30s sem salvar enquanto o usuário está digitando
        if (lastSaveAt > 0 && (Date.now() - lastSaveAt) > AUTOSAVE_MAX_INTERVAL_MS) {
            clearTimeout(autosaveTimer);
            doAutosave();
        }
    }

    /**
     * Lê o HTML do editor de forma segura.
     * Quill 2.x: usa getSemanticHTML() (operação de leitura — sem escrita no DOM).
     * Quill 1.x fallback: lê root.innerHTML (também operação de leitura).
     * O HTML resultante será re-sanitizado no backend pelo HtmlSanitizerService (OWASP)
     * antes de qualquer persistência.
     */
    function getEditorHtml() {
        if (!quill) return '';
        if (typeof quill.getSemanticHTML === 'function') {
            return quill.getSemanticHTML();
        }
        // Fallback Quill <2.0: leitura via root.innerHTML (read-only, não escrita)
        return quill.root.innerHTML;
    }

    function doAutosave() {
        if (!canEdit) return;
        if (autosaveInFlight) {
            pendingAutosave = true;
            return;
        }
        var html = getEditorHtml();
        autosaveInFlight = true;
        updateAutosaveStatus('saving');

        fetch('/api/report/orders/' + encodeURIComponent(orderId) + '/draft', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ contentHtml: html })
        })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                lastSaveAt = Date.now();
                updateAutosaveStatus('saved');
            })
            .catch(function (err) {
                console.error('[Report] erro no autosave:', err);
                updateAutosaveStatus('error');
            })
            .finally(function () {
                autosaveInFlight = false;
                if (pendingAutosave) {
                    pendingAutosave = false;
                    setTimeout(doAutosave, 500);
                }
            });
    }

    function updateAutosaveStatus(state) {
        var el = document.getElementById('reportAutosaveStatus');
        if (!el) return;
        el.classList.remove('saving', 'saved', 'error');
        if (state === 'idle') {
            el.textContent = 'Pronto';
        } else if (state === 'readonly') {
            el.textContent = 'Modo somente leitura';
        } else if (state === 'typing') {
            el.textContent = 'Digitando…';
        } else if (state === 'saving') {
            el.textContent = 'Salvando…';
            el.classList.add('saving');
        } else if (state === 'saved') {
            var t = new Date();
            el.textContent = 'Salvo às ' + t.toLocaleTimeString('pt-BR').substring(0, 5);
            el.classList.add('saved');
        } else if (state === 'error') {
            el.textContent = 'Erro ao salvar — tentando novamente';
            el.classList.add('error');
        }
    }

    function bindFinalize() {
        var btn = document.getElementById('reportFinalizeBtn');
        if (!btn) return;

        btn.addEventListener('click', function () {
            if (!canEdit) return;
            openModal('reportFinalizeModal');
        });

        var confirmBtn = document.getElementById('reportFinalizeConfirmBtn');
        if (!confirmBtn) return;

        confirmBtn.addEventListener('click', function () {
            var html = getEditorHtml();
            confirmBtn.disabled = true;

            fetch('/api/report/orders/' + encodeURIComponent(orderId) + '/finalize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({ contentHtml: html })
            })
                .then(function (r) {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    closeModal('reportFinalizeModal');
                    if (typeof showAlert === 'function') {
                        showAlert('Laudo finalizado para revisão.', 'success');
                    }
                    setTimeout(function () { closeEditorAndRefresh(true); }, 600);
                })
                .catch(function (err) {
                    console.error('[Report] erro no finalize:', err);
                    if (typeof showAlert === 'function') {
                        showAlert('Falha ao finalizar o laudo. Tente novamente.', 'danger');
                    }
                    confirmBtn.disabled = false;
                });
        });
    }

    function bindCancel() {
        var btn = document.getElementById('reportBackBtn');
        if (!btn) return;
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            closeEditorAndRefresh(false);
        });
    }

    /**
     * Liga o dropdown "Inserir template" acima do Quill.
     * Lazy: carrega a lista 1x ao primeiro `show.bs.dropdown`.
     * Filtra por serviceCode + performingPhysicianId do exame atual
     * (servidor já ordena por especificidade).
     * Click em item → fetch template completo → insere HTML no cursor via
     * Delta (clipboard.convert + updateContents) — padrão seguro.
     */
    function bindTemplatesDropdown(detail) {
        var dropdownBtn = document.getElementById('reportTemplatesDropdownBtn');
        var menuEl = document.getElementById('reportTemplatesDropdownMenu');
        if (!dropdownBtn || !menuEl) return;

        if (!canEdit) {
            dropdownBtn.disabled = true;
            replaceMenuWithText(menuEl, 'Modo somente leitura', 'text-muted');
            return;
        }

        var loaded = false;
        dropdownBtn.addEventListener('show.bs.dropdown', function () {
            if (loaded) return;
            loaded = true;
            loadApplicableTemplates(detail, menuEl);
        });

        menuEl.addEventListener('click', function (e) {
            var target = e.target.closest('.report-template-item');
            if (!target) return;
            e.preventDefault();
            var templateId = target.getAttribute('data-template-id');
            if (!templateId) return;
            insertTemplateAtCursor(templateId);
        });
    }

    function loadApplicableTemplates(detail, menuEl) {
        var qs = [];
        if (detail && detail.serviceCode) {
            qs.push('procedureCode=' + encodeURIComponent(detail.serviceCode));
        }
        if (detail && detail.performingPhysicianId) {
            qs.push('providerId=' + encodeURIComponent(detail.performingPhysicianId));
        }
        var url = '/api/report/templates/applicable' + (qs.length ? '?' + qs.join('&') : '');

        fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (items) {
                renderTemplatesMenu(menuEl, items);
            })
            .catch(function (err) {
                console.error('[Report] erro ao carregar templates aplicáveis:', err);
                replaceMenuWithText(menuEl, 'Falha ao carregar templates', 'text-danger');
            });
    }

    /** Helper: limpa o menu e coloca uma mensagem de status (sem innerHTML). */
    function replaceMenuWithText(menuEl, msg, klass) {
        menuEl.replaceChildren();
        var li = document.createElement('li');
        var span = document.createElement('span');
        span.className = 'dropdown-item-text small ' + (klass || '');
        span.textContent = msg;
        li.appendChild(span);
        menuEl.appendChild(li);
    }

    function renderTemplatesMenu(menuEl, items) {
        menuEl.replaceChildren();
        if (!items || items.length === 0) {
            replaceMenuWithText(menuEl, 'Nenhum template aplicável', 'text-muted');
            return;
        }
        items.forEach(function (item) {
            var li = document.createElement('li');
            var a = document.createElement('a');
            a.className = 'dropdown-item report-template-item';
            a.href = '#';
            a.setAttribute('data-template-id', item.id);
            a.title = scopeLabel(item.scope);
            // textContent para nome (server retorna texto puro do campo `name`)
            a.textContent = item.name;
            var badge = document.createElement('span');
            badge.className = 'badge bg-secondary ms-2';
            badge.style.fontSize = '0.65rem';
            badge.textContent = scopeShort(item.scope);
            a.appendChild(badge);
            li.appendChild(a);
            menuEl.appendChild(li);
        });
    }

    function scopeLabel(scope) {
        switch (scope) {
            case 'provider_procedure': return 'Específico: médico + procedimento';
            case 'provider': return 'Específico: médico';
            case 'procedure': return 'Específico: procedimento';
            case 'global': return 'Global (qualquer médico/procedimento)';
            default: return '';
        }
    }

    function scopeShort(scope) {
        switch (scope) {
            case 'provider_procedure': return 'Méd+Proc';
            case 'provider': return 'Médico';
            case 'procedure': return 'Procedim.';
            case 'global': return 'Global';
            default: return '';
        }
    }

    function insertTemplateAtCursor(templateId) {
        if (!quill) return;
        fetch('/api/report/templates/' + encodeURIComponent(templateId), {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (tpl) {
                if (!tpl || !tpl.contentHtml) return;
                // Resolve macros (@paciente, @cpf, etc.) ANTES de inserir.
                // Macros desconhecidas ficam como estão; nulls viram string vazia.
                console.log('[Report] template original HTML:', tpl.contentHtml);
                console.log('[Report] detailCache no momento da inserção:', detailCache);
                var html = resolveMacros(tpl.contentHtml, detailCache);
                console.log('[Report] template HTML após resolução de macros:', html);
                if (html === tpl.contentHtml) {
                    console.warn('[Report] nenhuma macro foi substituída — verifique se o template contém tokens @xxx e se detailCache está populado');
                }
                var range = quill.getSelection(true);
                var insertIndex = range ? range.index : quill.getLength();
                try {
                    // Quill 2.x: clipboard.convert retorna um Delta com inserts
                    var delta = quill.clipboard.convert({ html: html });
                    var Delta = Quill.import('delta');
                    var ops = new Delta()
                        .retain(insertIndex)
                        .concat(delta);
                    quill.updateContents(ops, 'user');
                    // posiciona cursor após o conteúdo inserido
                    var inserted = delta.length();
                    quill.setSelection(insertIndex + inserted, 0, 'user');
                } catch (e) {
                    console.warn('[Report] fallback dangerouslyPasteHTML:', e);
                    // Fallback: Quill aplica seu próprio sanitizer interno
                    quill.clipboard.dangerouslyPasteHTML(insertIndex, html, 'user');
                }
                if (typeof showAlert === 'function') {
                    showAlert('Template "' + tpl.name + '" inserido.', 'success');
                }
            })
            .catch(function (err) {
                console.error('[Report] erro ao inserir template:', err);
                if (typeof showAlert === 'function') {
                    showAlert('Falha ao inserir o template.', 'danger');
                }
            });
    }

    /**
     * Substitui tokens @xxx no texto/HTML pelos valores resolvidos do
     * ReportOrderDetailDTO (detailCache). Tokens desconhecidos são preservados.
     * Case-insensitive. Não escapa HTML (assume que value é texto seguro vindo
     * do server — patient name, CPF, datas formatadas, etc.; sem `<`/`>`).
     */
    function resolveMacros(text, detail) {
        if (!text) return '';
        var safeDetail = detail || {};
        // Normaliza encodings comuns do '@' antes do regex.
        // Quill/OWASP em algumas combinações pode salvar `&#64;`, `&commat;`,
        // ou outras representações. Convertendo tudo para `@` literal,
        // a regex casa uniformemente.
        var normalized = text
            .replace(/&#64;/g, '@')
            .replace(/&#x40;/gi, '@')
            .replace(/&commat;/g, '@')
            .replace(/&#0*64;/g, '@');
        // Regex: @ + letra inicial + letras/dígitos/underscore
        return normalized.replace(/@([a-zA-Z][a-zA-Z0-9_]*)/g, function (match, key) {
            var token = key.toLowerCase();
            var macro = MACROS.find(function (m) { return m.token === token; });
            if (!macro) {
                console.debug('[Report] macro desconhecida ignorada:', '@' + key);
                return match;
            }
            try {
                var value = macro.resolve(safeDetail);
                if (value == null || value === '') {
                    console.debug('[Report] macro @' + key + ' resolveu para string vazia');
                }
                return value || '';
            } catch (e) {
                console.warn('[Report] erro resolvendo macro @' + key + ':', e);
                return match;
            }
        });
    }

    /**
     * Substitui macros em TODO o conteúdo atual do editor (não só em template
     * recém-inserido). Útil como fallback se a substituição automática no
     * insert do template falhar por qualquer motivo (timing, encoding, etc.).
     */
    function bindResolveMacrosBtn() {
        var btn = document.getElementById('reportResolveMacrosBtn');
        if (!btn) return;
        if (!canEdit) {
            btn.disabled = true;
            return;
        }
        btn.addEventListener('click', function () {
            if (!quill) return;
            var currentHtml = getEditorHtml();
            var resolved = resolveMacros(currentHtml, detailCache);
            if (resolved === currentHtml) {
                if (typeof showAlert === 'function') {
                    showAlert('Nenhum token @xxx encontrado no laudo (ou tokens desconhecidos foram preservados).', 'info');
                }
                console.log('[Report] resolveMacros button: HTML inalterado. Atual:', currentHtml);
                return;
            }
            try {
                var delta = quill.clipboard.convert({ html: resolved });
                quill.setContents(delta, 'user');
                if (typeof showAlert === 'function') {
                    showAlert('Macros substituídas no laudo.', 'success');
                }
                console.log('[Report] resolveMacros button: substituição aplicada');
            } catch (e) {
                console.error('[Report] erro ao aplicar substituição:', e);
                if (typeof showAlert === 'function') {
                    showAlert('Falha ao substituir macros.', 'danger');
                }
            }
        });
    }

    function bindMacrosDropdown(detail) {
        var btn = document.getElementById('reportMacrosDropdownBtn');
        var menuEl = document.getElementById('reportMacrosDropdownMenu');
        if (!btn || !menuEl) return;

        if (!canEdit) {
            btn.disabled = true;
            replaceMenuWithText(menuEl, 'Modo somente leitura', 'text-muted');
            return;
        }

        // Populate sync — todos os valores estão em `detail`, sem call ao servidor
        menuEl.replaceChildren();
        MACROS.forEach(function (macro) {
            var preview = '';
            try { preview = macro.resolve(detail); } catch (e) {}
            var li = document.createElement('li');
            var a = document.createElement('a');
            a.className = 'dropdown-item report-macro-item';
            a.href = '#';
            a.setAttribute('data-macro-token', macro.token);

            var nameRow = document.createElement('div');
            nameRow.className = 'd-flex justify-content-between align-items-center';
            var name = document.createElement('span');
            name.className = 'small fw-bold';
            name.textContent = macro.label;
            var token = document.createElement('code');
            token.className = 'small text-muted';
            token.textContent = '@' + macro.token;
            nameRow.appendChild(name);
            nameRow.appendChild(token);

            var previewDiv = document.createElement('div');
            previewDiv.className = 'small text-muted text-truncate';
            previewDiv.style.maxWidth = '320px';
            previewDiv.textContent = preview ? preview : '(sem valor)';
            if (!preview) previewDiv.classList.add('fst-italic');

            a.appendChild(nameRow);
            a.appendChild(previewDiv);
            li.appendChild(a);
            menuEl.appendChild(li);
        });

        menuEl.addEventListener('click', function (e) {
            var target = e.target.closest('.report-macro-item');
            if (!target) return;
            e.preventDefault();
            var token = target.getAttribute('data-macro-token');
            var macro = MACROS.find(function (m) { return m.token === token; });
            if (!macro) return;
            var value;
            try { value = macro.resolve(detailCache); } catch (e) { value = ''; }
            if (!value) {
                if (typeof showAlert === 'function') {
                    showAlert('Sem valor disponível para ' + macro.label + '.', 'warning');
                }
                return;
            }
            insertTextAtCursor(value);
        });
    }

    function insertTextAtCursor(text) {
        if (!quill || !text) return;
        var range = quill.getSelection(true);
        var insertIndex = range ? range.index : quill.getLength();
        quill.insertText(insertIndex, text, 'user');
        quill.setSelection(insertIndex + text.length, 0, 'user');
    }

    // ── Formatters usados pelos MACROS ──────────────────────────────────

    function formatCpf(raw) {
        if (!raw) return '';
        var digits = String(raw).replace(/\D/g, '');
        if (digits.length !== 11) return String(raw);
        return digits.substring(0, 3) + '.' + digits.substring(3, 6) + '.' +
               digits.substring(6, 9) + '-' + digits.substring(9);
    }

    function formatDate(iso) {
        if (!iso) return '';
        try {
            var part = String(iso).substring(0, 10).split('-');
            if (part.length !== 3) return String(iso);
            return part[2] + '/' + part[1] + '/' + part[0];
        } catch (e) { return String(iso); }
    }

    function formatDateTime(iso) {
        if (!iso) return '';
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return String(iso);
            var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
            return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() +
                   ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        } catch (e) { return String(iso); }
    }

    function calculateAge(iso) {
        if (!iso) return '';
        try {
            var part = String(iso).substring(0, 10).split('-');
            if (part.length !== 3) return '';
            var birth = new Date(parseInt(part[0], 10),
                                 parseInt(part[1], 10) - 1,
                                 parseInt(part[2], 10));
            if (isNaN(birth.getTime())) return '';
            var today = new Date();
            var age = today.getFullYear() - birth.getFullYear();
            var m = today.getMonth() - birth.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
            if (age < 0 || age > 150) return '';
            return age === 1 ? '1 ano' : age + ' anos';
        } catch (e) { return ''; }
    }

    function bindDelete() {
        var btn = document.getElementById('reportDeleteBtn');
        if (!btn) return;
        btn.addEventListener('click', function () {
            openModal('reportDeleteModal');
        });

        var confirmBtn = document.getElementById('reportDeleteConfirmBtn');
        if (!confirmBtn) return;
        confirmBtn.addEventListener('click', function () {
            var reasonInput = document.getElementById('reportDeleteReason');
            var reason = reasonInput ? reasonInput.value.trim() : '';
            confirmBtn.disabled = true;
            var url = '/api/report/orders/' + encodeURIComponent(orderId) + '/review';
            if (reason) {
                url += '?reason=' + encodeURIComponent(reason);
            }
            fetch(url, {
                method: 'DELETE',
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            })
                .then(function (r) {
                    if (!r.ok && r.status !== 204) throw new Error('HTTP ' + r.status);
                    closeModal('reportDeleteModal');
                    if (typeof showAlert === 'function') {
                        showAlert('Laudo excluído. Exame voltou para a lista de digitação.', 'success');
                    }
                    setTimeout(function () { closeEditorAndRefresh(true); }, 400);
                })
                .catch(function (err) {
                    console.error('[Report] erro ao excluir:', err);
                    if (typeof showAlert === 'function') {
                        showAlert('Falha ao excluir o laudo. Tente novamente.', 'danger');
                    }
                    confirmBtn.disabled = false;
                });
        });
    }

    function openModal(id) {
        var el = document.getElementById(id);
        if (!el) return;
        if (typeof bootstrap !== 'undefined') {
            new bootstrap.Modal(el).show();
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

    /**
     * Fecha o modal do editor. Quando `shouldRefresh=true`, dispara reload
     * da tabela e stats do dashboard (necessário após Finalize ou Excluir
     * que mudaram o estado do order ou da review).
     */
    function closeEditorAndRefresh(shouldRefresh) {
        if (typeof window.closeReportEditorModal === 'function') {
            window.closeReportEditorModal();
        }
        if (shouldRefresh && typeof window.reportRefreshAwaitingTable === 'function') {
            // Pequeno delay pra deixar o modal terminar a animação de fechar
            setTimeout(window.reportRefreshAwaitingTable, 250);
        }
    }

    function showEditorError(msg) {
        if (typeof showAlert === 'function') {
            showAlert(msg, 'danger');
        } else {
            console.error('[Report]', msg);
        }
    }

})();
