/**
 * dev-override.js v4
 * Intercepta fetch e $.ajax para que o dashboard funcione
 * sem o backend Spring Boot rodando.
 * Serve todos os fragments de todas as abas.
 */
(function () {
    'use strict';

    const _fetch = window.fetch.bind(window);

    // ── Dados estáticos worklist ───────────────────────────────────────────
    const WORKLIST_DATA = [
        { orderDateTime: "2026-06-09T08:19:00", nmPaciente: "Joseane Aparecida Lopes", dtNascimento: "1968-04-16", cpf: "74019597987", procedimento: "Angiofluoresceinografia - Monocular", visitNumber: "181781", nrPrescricao: "324121", nrSeqPrescricao: "1", accessionNumber: "3241211", nmMedico: "Aramis de Castro Bach", stepStatus: "step1", processingStatus: "PENDING", dsStatus: "Pendente" },
        { orderDateTime: "2026-06-09T08:19:00", nmPaciente: "Alvisio Ribeiro da Silva", dtNascimento: "1942-03-11", cpf: "03311090934", procedimento: "Retinografia - Monocular", visitNumber: "181780", nrPrescricao: "324120", nrSeqPrescricao: "2", accessionNumber: "3241202", nmMedico: "Aramis de Castro Bach", stepStatus: "step1", processingStatus: "PENDING", dsStatus: "Pendente" },
        { orderDateTime: "2026-06-09T08:19:00", nmPaciente: "Alvisio Ribeiro da Silva", dtNascimento: "1942-03-11", cpf: "03311090934", procedimento: "Tomografia De Coerencia Optica Monocular", visitNumber: "181780", nrPrescricao: "324120", nrSeqPrescricao: "1", accessionNumber: "3241201", nmMedico: "Aramis de Castro Bach", stepStatus: "step1", processingStatus: "PENDING", dsStatus: "Pendente" },
        { orderDateTime: "2026-06-09T08:06:00", nmPaciente: "Marlene da Silva Santana", dtNascimento: "1950-10-13", cpf: "01608226964", procedimento: "Tomografia De Coerencia Optica Monocular", visitNumber: "181779", nrPrescricao: "324119", nrSeqPrescricao: "1", accessionNumber: "3241191", nmMedico: "Aramis de Castro Bach", stepStatus: "step1", processingStatus: "PENDING", dsStatus: "Pendente" },
        { orderDateTime: "2026-06-09T07:53:00", nmPaciente: "Samuel Evangelista de Carvalho", dtNascimento: "1956-04-06", cpf: "33383502953", procedimento: "Estéreo-Foto De Papila - Monocular", visitNumber: "181778", nrPrescricao: "324117", nrSeqPrescricao: "3", accessionNumber: "3241173", nmMedico: "Aramis de Castro Bach", stepStatus: "step1", processingStatus: "PENDING", dsStatus: "Pendente" },
        { orderDateTime: "2026-06-09T07:53:00", nmPaciente: "Samuel Evangelista de Carvalho", dtNascimento: "1956-04-06", cpf: "33383502953", procedimento: "Retinografia - Monocular", visitNumber: "181778", nrPrescricao: "324117", nrSeqPrescricao: "1", accessionNumber: "3241171", nmMedico: "Aramis de Castro Bach", stepStatus: "step1", processingStatus: "PENDING", dsStatus: "Pendente" },
        { orderDateTime: "2026-06-09T07:41:00", nmPaciente: "Pergentina Vanusia de Andrade", dtNascimento: "1955-08-11", cpf: "01172266883", procedimento: "Angiofluoresceinografia - Monocular", visitNumber: "181775", nrPrescricao: "324115", nrSeqPrescricao: "2", accessionNumber: "3241152", nmMedico: "Aramis de Castro Bach", stepStatus: "step1", processingStatus: "PENDING", dsStatus: "Pendente" },
        { orderDateTime: "2026-06-09T07:28:00", nmPaciente: "Rosineia Bordinhao", dtNascimento: "1972-07-11", cpf: "84234580910", procedimento: "Retinografia", visitNumber: "181774", nrPrescricao: "324112", nrSeqPrescricao: "3", accessionNumber: "3241123", nmMedico: "Aramis de Castro Bach", stepStatus: "step1", processingStatus: "PENDING", dsStatus: "Pendente" },
        { orderDateTime: "2026-06-09T07:28:00", nmPaciente: "Rosineia Bordinhao", dtNascimento: "1972-07-11", cpf: "84234580910", procedimento: "Tomografia de Coerência Óptica - OCT", visitNumber: "181774", nrPrescricao: "324112", nrSeqPrescricao: "1", accessionNumber: "3241121", nmMedico: "Aramis de Castro Bach", stepStatus: "step1", processingStatus: "PENDING", dsStatus: "Pendente" },
        { orderDateTime: "2026-06-09T07:26:00", nmPaciente: "Sergio Roberto Biss", dtNascimento: "1958-10-14", cpf: "25332902972", procedimento: "Retinografia - Monocular", visitNumber: "181773", nrPrescricao: "324111", nrSeqPrescricao: "6", accessionNumber: "3241116", nmMedico: "Aramis de Castro Bach", stepStatus: "step1", processingStatus: "PENDING", dsStatus: "Pendente" },
        { orderDateTime: "2026-06-09T07:26:00", nmPaciente: "Sergio Roberto Biss", dtNascimento: "1958-10-14", cpf: "25332902972", procedimento: "Microscopia Especular De Córnea - Monocular", visitNumber: "181773", nrPrescricao: "324111", nrSeqPrescricao: "2", accessionNumber: "3241112", nmMedico: "Sandra Zandavalli Avila", stepStatus: "step3", processingStatus: "WAITING_APPROVAL", dsStatus: "Pendente Aprovação" },
        { orderDateTime: "2026-06-09T07:26:00", nmPaciente: "Sergio Roberto Biss", dtNascimento: "1958-10-14", cpf: "25332902972", procedimento: "Biometria Ultra-Sônica - Monocular", visitNumber: "181773", nrPrescricao: "324111", nrSeqPrescricao: "1", accessionNumber: "3241111", nmMedico: "Sandra Zandavalli Avila", stepStatus: "step3", processingStatus: "WAITING_APPROVAL", dsStatus: "Pendente Aprovação" },
        { orderDateTime: "2026-06-08T08:59:00", nmPaciente: "Cleonice Antonia Zanlorenzi", dtNascimento: "1948-06-13", cpf: "18568467920", procedimento: "Microscopia Especular De Córnea - Monocular", visitNumber: "181673", nrPrescricao: "323996", nrSeqPrescricao: "2", accessionNumber: "3239962", nmMedico: "Virginia Santos de Paula Soares Pilati", stepStatus: "step3", processingStatus: "WAITING_APPROVAL", dsStatus: "Pendente Aprovação" },
        { orderDateTime: "2026-06-08T07:52:00", nmPaciente: "Paulo Eduardo Guimaraes Stroparo", dtNascimento: "1971-08-04", cpf: "86450263920", procedimento: "Ceratoscopia Computadorizada - Monocular", visitNumber: "181659", nrPrescricao: "323987", nrSeqPrescricao: "3", accessionNumber: "3239873", nmMedico: "Virginia Santos de Paula Soares Pilati", stepStatus: "step1", processingStatus: "PENDING", dsStatus: "Pendente" },
        { orderDateTime: "2026-06-08T07:31:00", nmPaciente: "Neusa Marli Vieira Godoy", dtNascimento: "1954-01-09", cpf: "17195055949", procedimento: "Angiofluoresceinografia - Monocular", visitNumber: "181654", nrPrescricao: "323984", nrSeqPrescricao: "1", accessionNumber: "3239841", nmMedico: "Alex Treiger Grupenmacher", stepStatus: "step1", processingStatus: "PENDING", dsStatus: "Pendente" },
        { orderDateTime: "2026-05-27T07:42:00", nmPaciente: "Pedro Luiz Bastian Vidal", dtNascimento: "1983-02-25", cpf: "03812312913", procedimento: "Paquimetria Ultra-Sônica - Monocular", visitNumber: "180910", nrPrescricao: "323213", nrSeqPrescricao: "2", accessionNumber: "3232132", nmMedico: "Sandra Zandavalli Avila", stepStatus: "step1", processingStatus: "PENDING", dsStatus: "Pendente" },
        { orderDateTime: "2026-05-20T13:01:00", nmPaciente: "Lais do Rocio Anachewski", dtNascimento: "1954-09-25", cpf: "23233397968", procedimento: "Paquimetria Ultra-Sônica - Monocular", visitNumber: "180283", nrPrescricao: "322563", nrSeqPrescricao: "4", accessionNumber: "3225634", nmMedico: "Virginia Santos de Paula Soares Pilati", stepStatus: "step1", processingStatus: "PENDING", dsStatus: "Pendente" }
    ];

    // ── Mocks de API ───────────────────────────────────────────────────────
    const JSON_MOCKS = {
        '/api/imager/exam-groups': [],
        '/api/imager/exams': [
            { name: "Angiofluoresceinografia", id: 126 },
            { name: "Angiografia OCT", id: 125 },
            { name: "Biometria Ultra-Sônica - Monocular", id: 87 },
            { name: "Campimetria Computadorizada 10-2", id: 83 },
            { name: "Campimetria Computadorizada 24-2", id: 82 },
            { name: "Campimetria Computadorizada 30-2", id: 84 },
            { name: "Ceratoscopia Atlas", id: 85 },
            { name: "Estereofoto", id: 124 },
            { name: "Microscopia Especular De Córnea", id: 88 },
            { name: "Paquimetria Ultra-Sônica - Monocular", id: 81 },
            { name: "Retinografia", id: 123 },
            { name: "Tomografia De Coerência Óptica Macula", id: 89 },
            { name: "Tomografia De Coerência Óptica Papila", id: 127 },
            { name: "Tomografia de Córnea - Galilei", id: 80 },
            { name: "Ultra-Sonografia", id: 86 }
        ],
        '/api/imager/failure-count': { count: 0 },
        '/api/imager/exam-documents/ui/stats': { total: 6, pending: 6 },
        '/api/imager/exam-orders/ui/stats': { total: 84, pending: 84 },
        '/api/imager/processing-exams/ui/stats': { total: 4, pending: 4 },
        '/api/imager/processing-exams/ui/step4/stats': { total: 14747 },
        '/api/gateway/failure-count': { count: 0 },
        '/api/gateway/fragments/config': {},
        '/api/dicom/failure-count': { count: 0 },
    };

    // ── Mapeamento fragment URL → arquivo local ────────────────────────────
    const FRAGMENT_MAP = {
        '/fragments/home-dashboard': 'fragments/home.html',
        '/dicom/fragments/dashboard-data': 'fragments/dicom-server.html',
        '/dicom-worklist/fragments/dashboard-data': 'fragments/dicom-worklist.html',
        '/imager/fragments/dashboard-data': 'fragments/imager.html',
        '/api/gateway/fragments/dashboard': 'fragments/gateway.html',
        '/report/fragments/dashboard': 'fragments/report.html',
        '/admin/configurations-fragment': 'fragments/admin.html',
        '/imager/config/dashboard': 'fragments/imager-config.html',
    };

    // ── Prefixos silenciosos ───────────────────────────────────────────────
    const SILENT_PREFIXES = [
        '/api/auth',
        '/i18n/',
        '/report/fragments/review-list',
        '/configurations',
    ];

    // ── Helpers ────────────────────────────────────────────────────────────
    function jsonResp(obj) {
        return new Response(JSON.stringify(obj), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    function htmlResp(body) {
        return new Response(body, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
    }

    function matchFragment(url) {
        for (const [pattern, file] of Object.entries(FRAGMENT_MAP)) {
            if (url.includes(pattern)) return file;
        }
        return null;
    }

    function matchMock(url) {
        for (const [pattern, data] of Object.entries(JSON_MOCKS)) {
            if (url.includes(pattern)) return data;
        }
        return null;
    }

    function isSilent(url) {
        return SILENT_PREFIXES.some(p => url.includes(p));
    }

    function isDataTable(url) {
        return url.includes('/api/imager/') && url.includes('datatable');
    }

    function buildDatatableData(urlStr) {
        const u = new URL(urlStr, 'http://localhost');
        const draw = parseInt(u.searchParams.get('draw') || '1');
        const start = parseInt(u.searchParams.get('start') || '0');
        const length = parseInt(u.searchParams.get('length') || '25');
        const search = (u.searchParams.get('search') || '').toLowerCase();
        const step = u.searchParams.get('stepFilter') || 'step1';

        let filtered = WORKLIST_DATA.filter(r => r.stepStatus === step);
        if (search) {
            filtered = filtered.filter(r =>
                r.nmPaciente.toLowerCase().includes(search) ||
                r.procedimento.toLowerCase().includes(search) ||
                r.nmMedico.toLowerCase().includes(search)
            );
        }

        const total = filtered.length;
        return { draw, recordsTotal: total, recordsFiltered: total, data: filtered.slice(start, start + length) };
    }

    function buildDatatableResponse(urlStr) {
        return jsonResp(buildDatatableData(urlStr));
    }

    // ── Intercepta fetch ───────────────────────────────────────────────────
    window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : input.url;

        // Fragment local
        const fragmentFile = matchFragment(url);
        if (fragmentFile) {
            console.log('[dev-override] fragment fetch:', url, '->', fragmentFile);
            return _fetch(fragmentFile).catch(() =>
                htmlResp('<p class="text-muted m-4">Fragment não encontrado: ' + fragmentFile + '</p>')
            );
        }

        // DataTable
        if (isDataTable(url)) {
            return Promise.resolve(buildDatatableResponse(url));
        }

        // Mock JSON
        const mock = matchMock(url);
        if (mock !== null) {
            return Promise.resolve(jsonResp(mock));
        }

        // Silencioso
        if (isSilent(url)) {
            return Promise.resolve(jsonResp({}));
        }

        return _fetch(input, init);
    };

    // ── Intercepta jQuery $.ajax ───────────────────────────────────────────
    if (typeof jQuery !== 'undefined') {
        const _ajax = jQuery.ajax;
        jQuery.ajax = function (url, options) {
            const opts = (typeof url === 'object') ? url : (options || {});
            const reqUrl = (typeof url === 'string') ? url : (opts.url || '');

            if (isDataTable(reqUrl)) {
                console.log('[dev-override] DataTable ajax interceptado:', reqUrl, 'data:', opts.data, 'success?', typeof opts.success);
                const d = jQuery.Deferred();
                const dataParams = opts.data || {};
                const queryStr = typeof dataParams === 'string' ? dataParams
                    : Object.entries(dataParams).map(([k, v]) => k + '=' + encodeURIComponent(v ?? '')).join('&');
                const sep = reqUrl.includes('?') ? '&' : '?';
                const fullUrl = queryStr ? reqUrl + sep + queryStr : reqUrl;
                const data = buildDatatableData(fullUrl);
                console.log('[dev-override] DataTable mock data:', data.recordsTotal, 'rows, stepFilter=', new URL(fullUrl, 'http://localhost').searchParams.get('stepFilter'));
                setTimeout(function () {
                    console.log('[dev-override] DataTable setTimeout disparado, chamando success...');
                    if (typeof opts.success === 'function') opts.success(data);
                    d.resolve(data);
                }, 0);
                return d.promise();
            }

            const mock = matchMock(reqUrl);
            if (mock !== null) {
                const d = jQuery.Deferred();
                setTimeout(() => d.resolve(mock), 0);
                return d.promise();
            }

            if (isSilent(reqUrl)) {
                const d = jQuery.Deferred();
                setTimeout(() => d.resolve({}), 0);
                return d.promise();
            }

            return _ajax.apply(this, arguments);
        };
    }

    // ── Garante que cleanupImagerDashboard seja sempre seguro ─────────────
    // imager-952.js sobrescreve window.cleanupImagerDashboard na carga do módulo
    // (após dev-override.js). defineProperty intercepta essa atribuição e mantém
    // o wrapper de try-catch ativo para que erros no destroy() não bloqueiem
    // o loadContent do dashboard.js.
    let _imagerCleanup = null;
    Object.defineProperty(window, 'cleanupImagerDashboard', {
        configurable: true,
        enumerable: true,
        get() {
            return function safeCleanup() {
                console.log('[dev-override] cleanupImagerDashboard chamado, _imagerCleanup:', typeof _imagerCleanup);
                try {
                    if (typeof _imagerCleanup === 'function') _imagerCleanup();
                    console.log('[dev-override] cleanup OK');
                } catch (e) {
                    console.warn('[dev-override] cleanupImagerDashboard silenciado:', e.message);
                }
            };
        },
        set(fn) {
            console.log('[dev-override] cleanupImagerDashboard definido:', typeof fn);
            _imagerCleanup = fn;
        }
    });

    console.log('[dev-override] v4 ativo — diagnóstico ligado');
})();