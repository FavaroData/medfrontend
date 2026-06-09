$(document).ready(function() {
    // Sidebar toggle functionality
    $('#sidebarToggle').on('click', function() {
        // Check if we're on mobile
        if (window.innerWidth <= 768) {
            $('body').toggleClass('sidebar-mobile-expanded');
        } else {
            $('.sidebar').toggleClass('folded');
            $('body').toggleClass('sidebar-folded');
            
            // Save sidebar state to localStorage (desktop only)
            localStorage.setItem('sidebarFolded', $('.sidebar').hasClass('folded'));
        }
    });
    
    // Check if sidebar was previously folded (desktop only)
    if (window.innerWidth > 768 && localStorage.getItem('sidebarFolded') === 'true') {
        $('.sidebar').addClass('folded');
        $('body').addClass('sidebar-folded');
    }
    
    // Handle window resize events to adjust sidebar behavior
    $(window).resize(function() {
        if (window.innerWidth <= 768) {
            // On mobile, remove folded classes and use mobile-specific classes
            $('body').removeClass('sidebar-folded');
            $('body').addClass('sidebar-mobile');
        } else {
            // On desktop, check localStorage and apply appropriate state
            $('body').removeClass('sidebar-mobile-expanded sidebar-mobile');
            if (localStorage.getItem('sidebarFolded') === 'true') {
                $('.sidebar').addClass('folded');
                $('body').addClass('sidebar-folded');
            } else {
                $('.sidebar').removeClass('folded');
                $('body').removeClass('sidebar-folded');
            }
        }
    });
    
    // Trigger a resize event on load to set initial state
    $(window).trigger('resize');

    // Sidebar logout button
    $('#logoutSidebarBtn').on('click', function(e) {
        e.preventDefault();
        $.ajax({
            url: '/api/auth/logout',
            method: 'POST',
            contentType: 'application/json'
        }).always(function() {
            window.location.href = '/';
        });
    });

    // Sidebar failure badge updater (reusable for any module)
    function updateSidebarFailureBadge(badgeId, endpoint) {
        var $badge = $('#' + badgeId);
        if ($badge.length === 0) return;

        $.get(endpoint)
            .done(function(data) {
                var count = data.count || 0;
                if (count > 0) {
                    $badge.text(count > 99 ? '99+' : count).show();
                } else {
                    $badge.hide();
                }
            })
            .fail(function() {
                $badge.hide();
            });
    }

    function updateGatewayFailureBadge() {
        updateSidebarFailureBadge('gatewayFailureBadge', '/api/gateway/failure-count');
    }

    function updateDicomServerFailureBadge() {
        updateSidebarFailureBadge('dicomServerFailureBadge', '/api/dicom/failure-count');
    }

    function updateImagerFailureBadge() {
        updateSidebarFailureBadge('imagerFailureBadge', '/api/imager/failure-count');
    }

    // Initial load + refresh every 60s
    if ($('#gatewayDashboardLink').length) {
        updateGatewayFailureBadge();
        setInterval(updateGatewayFailureBadge, 60000);
    }
    if ($('#dicomServerDashboardLink').length) {
        updateDicomServerFailureBadge();
        setInterval(updateDicomServerFailureBadge, 60000);
    }
    if ($('#imagerDashboardLink').length) {
        updateImagerFailureBadge();
        setInterval(updateImagerFailureBadge, 60000);
    }

    // Function to initialize home page module cards
    window.initHomeCards = function() {
        const moduleCards = document.querySelectorAll('.module-card');

        console.log('Initializing home cards, found:', moduleCards.length);

        moduleCards.forEach(card => {
            card.addEventListener('click', function() {
                const page = this.getAttribute('data-page');
                console.log('Card clicked, navigating to:', page);

                if (page) {
                    // Trigger navigation by simulating click on corresponding nav link
                    const navLink = document.querySelector(`.nav-content-link[data-page="${page}"]`);
                    if (navLink) {
                        navLink.click();
                    } else {
                        console.error('Nav link not found for page:', page);
                    }
                }
            });
        });
    };

    // Standardized "module unavailable" message used by every catch handler below.
    // Uses textContent (not innerHTML) to keep the rendering XSS-safe even though the
    // string is static — the helper is the single source of truth for the message.
    function renderDashboardUnavailable(container) {
        const p = document.createElement('p');
        p.className = 'text-muted m-4';
        p.textContent = 'Dashboard indisponível no momento. Verifique a conexão e atualize a página.';
        container.replaceChildren(p);
    }

    // Function to load content into the main area
    function loadContent(page) {
        const mainContent = document.getElementById('mainDashboardContent');
        if (!mainContent) {
            console.error("Main content area 'mainDashboardContent' not found.");
            return;
        }
        
        // Clean up any existing dashboard state before loading new content
        if (typeof cleanupImagerDashboard === 'function') {
            cleanupImagerDashboard();
        }

        try {
            // Remove 'active' class from all nav links
            $('.nav-content-link').removeClass('active');
            // Add 'active' class to the current link
            $(`.nav-content-link[data-page="${page}"]`).addClass('active');
        } catch (e) {
            console.error("Error manipulating active classes:", e);
            // Continue execution to attempt content loading
        }

        console.log("Loading content for page:", page);

        if (page === 'home') {
            fetch('/fragments/home-dashboard')
                .then(response => {
                    if (!response.ok) throw new Error('Network response was not ok for home');
                    return response.text();
                })
                .then(html => {
                    mainContent.innerHTML = html;

                    // Initialize card navigation after DOM is inserted
                    setTimeout(function() {
                        initHomeCards();
                    }, 50);
                })
                .catch(error => {
                    console.error('Erro ao carregar dashboard inicial:', error);
                    renderDashboardUnavailable(mainContent);
                });
        } else if (page === 'dicom-worklist') {
            console.log('[Dashboard] Fetching DICOM Worklist fragment from: /dicom-worklist/fragments/dashboard-data');
            fetch('/dicom-worklist/fragments/dashboard-data')
                .then(response => {
                    console.log('[Dashboard] DICOM Worklist response status:', response.status);
                    console.log('[Dashboard] DICOM Worklist response ok:', response.ok);
                    if (!response.ok) {
                        throw new Error('Network response was not ok for dicom-worklist. Status: ' + response.status);
                    }
                    return response.text();
                })
                .then(html => {
                    console.log('[Dashboard] DICOM Worklist HTML received, length:', html.length);
                    console.log('[Dashboard] First 200 chars:', html.substring(0, 200));
                    mainContent.innerHTML = html;

                    // Initialize DICOM Worklist dashboard functionality
                    console.log('[Dashboard] DICOM Worklist fragment loaded, checking DicomWorklist...');
                    setTimeout(function() {
                        if (typeof DicomWorklist !== 'undefined' && typeof DicomWorklist.init === 'function') {
                            console.log('[Dashboard] Calling DicomWorklist.init()');
                            DicomWorklist.init();
                        } else {
                            console.error('[Dashboard] DicomWorklist is not defined or init() not found');
                            console.log('[Dashboard] typeof DicomWorklist:', typeof DicomWorklist);
                        }
                    }, 100);
                })
                .catch(error => {
                    console.error('[Dashboard] Erro ao carregar dashboard DICOM Worklist:', error);
                    console.error('[Dashboard] Detalhes:', error.message, error.stack);
                    renderDashboardUnavailable(mainContent);
                });
        } else if (page === 'gateway') {
            fetch('/api/gateway/fragments/dashboard')
                .then(response => {
                    if (!response.ok) throw new Error('Network response was not ok for gateway');
                    return response.text();
                })
                .then(html => {
                    mainContent.innerHTML = html;
                    // Initialize Gateway dashboard after DOM is ready
                    setTimeout(function() {
                        if (typeof initGatewayDashboard === 'function') {
                            initGatewayDashboard();
                        } else {
                            console.error('[Gateway] initGatewayDashboard function not found');
                        }
                    }, 100);
                })
                .catch(error => {
                    console.error('Erro ao carregar dashboard Gateway:', error);
                    renderDashboardUnavailable(mainContent);
                });
        } else if (page === 'imager') {
            fetch('/imager/fragments/dashboard-data')
                .then(response => {
                    if (!response.ok) throw new Error('Network response was not ok for imager');
                    return response.text();
                })
                .then(html => {
                    mainContent.innerHTML = html;
                    // Initialize imager dashboard functionality
                    console.log('Attempting to initialize Imager Dashboard...'); // <-- ADD THIS
                    if (typeof initImagerDashboard === 'function') {
                        initImagerDashboard();
                        console.log('Imager Dashboard initialization function called.'); // <-- ADD THIS
                    } else {
                        console.error('initImagerDashboard function not found!'); // <-- ADD THIS
                    }
                })
                .catch(error => {
                    console.error('Erro ao carregar dashboard Imager:', error);
                    renderDashboardUnavailable(mainContent);
                });
        } else if (page === 'report') {
            fetch('/report/fragments/dashboard')
                .then(response => {
                    if (!response.ok) throw new Error('Network response was not ok for report');
                    return response.text();
                })
                .then(html => {
                    mainContent.innerHTML = html;
                    console.log('Attempting to initialize Report Dashboard...');
                    if (typeof initReportDashboard === 'function') {
                        initReportDashboard();
                        console.log('Report Dashboard initialization function called.');
                    } else {
                        console.error('initReportDashboard function not found!');
                    }
                })
                .catch(error => {
                    console.error('Erro ao carregar dashboard Report:', error);
                    renderDashboardUnavailable(mainContent);
                });
        } else if (page === 'report-review') {
            fetch('/report/fragments/review-list')
                .then(response => {
                    if (!response.ok) throw new Error('Network response was not ok for report-review');
                    return response.text();
                })
                .then(html => {
                    mainContent.innerHTML = html;
                    if (typeof initReportReviewList === 'function') {
                        initReportReviewList();
                    } else {
                        console.error('initReportReviewList function not found!');
                    }
                })
                .catch(error => {
                    console.error('Erro ao carregar fila de revisão:', error);
                    renderDashboardUnavailable(mainContent);
                });
        } else if (page === 'configurations-dashboard') { // Corrected page name
            fetch('/configurations-dashboard-data') // Ensure this matches ConfigurationController @GetMapping
                .then(response => {
                    if (!response.ok) {
                        console.error('Network response error for configurations:', response);
                        throw new Error('Network response was not ok for configurations. Status: ' + response.status);
                    }
                    return response.text();
                })
                .then(html => {
                    mainContent.innerHTML = html;
                    // Initialize DataTables or other JS specific to the configurations here
                    // Check if the table exists before trying to initialize DataTable
                    if ($('#configurationsTable').length > 0) {
                        if ($.fn.DataTable.isDataTable('#configurationsTable')) {
                            // Optional: Destroy existing DataTable if re-initializing
                            // $('#configurationsTable').DataTable().destroy();
                        }
                        $('#configurationsTable').DataTable({
                            "language": {
                                url: '/i18n/pt-BR.json'
                            },
                            "retrieve": true // Added to reinitialize if already initialized
                        });
                    } else {
                        console.warn("#configurationsTable not found in the loaded HTML.");
                    }
                })
                .catch(error => {
                    console.error('Erro ao carregar dashboard de Configurações:', error);
                    renderDashboardUnavailable(mainContent);
                });
        } else if (page === 'logs') {
            const heading = document.createElement('h1');
            heading.textContent = 'Logs';
            const desc = document.createElement('p');
            desc.className = 'text-muted';
            desc.textContent = 'O conteúdo de logs será carregado aqui.';
            mainContent.replaceChildren(heading, desc);
            return;
        } else if (page === 'configurations') {
            fetch('/configurations/dashboard')
                .then(response => {
                    if (!response.ok) throw new Error('Network response was not ok for configurations');
                    return response.text();
                })
                .then(html => {
                    mainContent.innerHTML = html;
                })
                .catch(error => {
                    console.error('Erro ao carregar dashboard de Configurações:', error);
                    renderDashboardUnavailable(mainContent);
                });
        } else if (page === 'admin-configurations') {
            // Load admin configurations (authentication handled by interceptor)
            fetch('/admin/configurations-fragment')
                .then(configResponse => {
                    if (configResponse.status === 401 || configResponse.status === 403) {
                        // Session expired or no access - redirect to login
                        window.location.href = '/';
                        return;
                    }
                    if (configResponse.redirected) {
                        window.location.href = '/';
                        return;
                    }
                    if (!configResponse.ok) throw new Error('Network response was not ok for admin configurations');
                    return configResponse.text();
                })
                .then(html => {
                    if (!html) return;
                    mainContent.innerHTML = html;
                    // Initialize admin configurations functionality
                    if (typeof initAdminConfigurations === 'function') {
                        initAdminConfigurations();
                    }
                    // Setup lazy loading for Imager and Gateway config tabs
                    initAdminConfigTabs();
                })
                .catch(error => {
                    console.error('Erro ao carregar dashboard Administração:', error);
                    renderDashboardUnavailable(mainContent);
                });
        } else if (page === 'dicom-print') {
            fetch('/dicom-print/fragments/dashboard-data')
                .then(response => {
                    if (!response.ok) throw new Error('Network response was not ok for DICOM Print dashboard');
                    return response.text();
                })
                .then(html => {
                    $(mainContent).html(html);
                    setTimeout(() => {
                        if (typeof dicomPrintDashboard !== 'undefined' && typeof dicomPrintDashboard.init === 'function') {
                            dicomPrintDashboard.init();
                        } else {
                            console.warn('dicomPrintDashboard object not found');
                        }
                    }, 100);
                })
                .catch(error => {
                    console.error('Erro ao carregar dashboard DICOM Print:', error);
                    renderDashboardUnavailable(mainContent);
                });
        } else if (page === 'dicom-print-config') {
            fetch('/dicom-print/fragments/config-data')
                .then(response => response.text())
                .then(html => {
                    $(mainContent).html(html);
                    setTimeout(() => {
                        if (typeof dicomPrintConfig !== 'undefined' && typeof dicomPrintConfig.init === 'function') {
                            dicomPrintConfig.init();
                        }
                    }, 100);
                });
        } else if (page === 'dicom-server') {
            // Load DICOM Server Dashboard
            fetch('/dicom/fragments/dashboard-data')
                .then(response => {
                    if (!response.ok) throw new Error('Network response was not ok for DICOM dashboard');
                    return response.text();
                })
                .then(html => {
                    mainContent.innerHTML = html;
                    // Initialize DICOM dashboard functionality
                    setTimeout(() => {
                        if (typeof dicomDashboard !== 'undefined' && typeof dicomDashboard.init === 'function') {
                            dicomDashboard.init();
                            console.log('DICOM Dashboard initialized');
                        } else {
                            console.warn('DICOM Dashboard not initialized - dicomDashboard object not found');
                        }
                    }, 100);
                })
                .catch(error => {
                    console.error('Erro ao carregar dashboard DICOM Server:', error);
                    renderDashboardUnavailable(mainContent);
                });
        } else if (page === 'gateway-config' || page === 'imager-config') {
            // Redirect legacy hash routes to admin-configurations
            window.location.hash = '#admin-configurations';
            return;
        } else {
            const heading = document.createElement('h1');
            heading.textContent = 'Página não encontrada';
            const desc = document.createElement('p');
            desc.className = 'text-muted';
            desc.textContent = 'A página solicitada não existe.';
            mainContent.replaceChildren(heading, desc);
            return;
        }
    }

    // Function to load content with additional parameters (for filtering)
    window.loadContentWithParams = function(page, params) {
        const mainContent = document.getElementById('mainDashboardContent');
        if (!mainContent) {
            console.error("Main content area 'mainDashboardContent' not found.");
            return;
        }

        console.log("Loading content for page:", page, "with params:", params);

        if (page === 'dicom-worklist') {
            // Build URL with parameters for filtered content
            let url = '/dicom-worklist/fragments/dashboard-data';
            if (params) {
                url += '?' + params;
            }
            
            fetch(url)
                .then(response => {
                    if (!response.ok) throw new Error('Network response was not ok for dicom-worklist with params');
                    return response.text();
                })
                .then(html => {
                    mainContent.innerHTML = html;
                    console.log("Successfully loaded filtered DICOM worklist content");
                })
                .catch(error => {
                    console.error('Erro ao carregar dashboard DICOM Worklist (filtrado):', error);
                    renderDashboardUnavailable(mainContent);
                });
        } else {
            // For other pages, fall back to regular loadContent without params
            loadContent(page);
        }
    };

    // Handle initial page load based on hash
    function handleHashChange() {
        let hashPart = window.location.hash.substring(1);
        let page = hashPart;
        
        // Extract page name from hash (ignore query parameters)
        if (hashPart.includes('?')) {
            page = hashPart.split('?')[0];
        }
        
        if (!page) {
            page = 'home'; // Default page
            window.location.hash = '#home'; // Set hash for default page
        } else {
            // Ensure the sidebar reflects the active page from hash
            // Collapse other submenus if a top-level link is directly accessed via hash
            if (!$(`.nav-content-link[data-page="${page}"]`).closest('.collapse').length) {
                $('.sidebar .collapse').collapse('hide');
            }
            // If the page is part of a collapsed submenu, expand it.
            const activeLink = $(`.nav-content-link[data-page="${page}"]`);
            if (activeLink.length > 0) {
                const parentCollapse = activeLink.closest('.collapse');
                if (parentCollapse.length > 0 && !parentCollapse.hasClass('show')) {
                    new bootstrap.Collapse(parentCollapse.get(0)).show();
                }
            }
        }
        loadContent(page);
    }

    // Debounce mechanism to prevent duplicate loads
    let lastLoadedPage = null;
    let lastLoadTime = 0;
    const LOAD_DEBOUNCE_MS = 300;

    function handleHashChangeDebounced() {
        const currentTime = Date.now();
        const page = window.location.hash.substring(1).split('?')[0] || 'home';

        // Prevent duplicate loads within debounce window
        if (page === lastLoadedPage && (currentTime - lastLoadTime) < LOAD_DEBOUNCE_MS) {
            console.log('Skipping duplicate load for page:', page);
            return;
        }

        lastLoadedPage = page;
        lastLoadTime = currentTime;
        handleHashChange();
    }

    // Listen for hash changes with debounce
    window.addEventListener('hashchange', handleHashChangeDebounced);

    // Initial load
    handleHashChange(); // Load content based on current hash or default

    // Make nav links update the hash ONLY
    $(document).on('click', '.nav-content-link', function(e) {
        e.preventDefault();
        const page = $(this).data('page');
        // Just change hash - hashchange event will handle loading
        if (window.location.hash !== `#${page}`) {
            window.location.hash = page;
        }
    });

    // Admin Configuration Functions
    function initAdminLoginForm() {
        console.log('Initializing admin login form...');
        
        // Toggle password visibility
        $('#togglePassword').on('click', function() {
            const passwordField = $('#adminPassword');
            const icon = $(this).find('i');
            
            if (passwordField.attr('type') === 'password') {
                passwordField.attr('type', 'text');
                icon.removeClass('fa-eye').addClass('fa-eye-slash');
            } else {
                passwordField.attr('type', 'password');
                icon.removeClass('fa-eye-slash').addClass('fa-eye');
            }
        });
        
        // Handle login form submission
        $('#adminLoginForm').on('submit', function(e) {
            e.preventDefault();
            
            const username = $('#adminUsername').val();
            const password = $('#adminPassword').val();
            const loginBtn = $('#adminLoginBtn');
            const alertContainer = $('#adminLoginAlert');
            
            // Show loading state
            loginBtn.prop('disabled', true);
            loginBtn.html('<i class="fas fa-spinner fa-spin me-2"></i>Signing in...');
            
            // Send login request
            $.post('/admin/login', {
                username: username,
                password: password
            })
            .done(function(response) {
                // Login successful, reload admin configurations
                loadContent('admin-configurations');
            })
            .fail(function(xhr) {
                // Login failed
                let errorMessage = 'Login failed. Please check your credentials.';
                if (xhr.status === 401) {
                    errorMessage = 'Invalid username or password.';
                }
                
                alertContainer.html(`
                    <div class="alert alert-danger alert-dismissible fade show" role="alert">
                        <i class="fas fa-exclamation-triangle me-2"></i>
                        ${errorMessage}
                        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                    </div>
                `);
            })
            .always(function() {
                // Reset button state
                loginBtn.prop('disabled', false);
                loginBtn.html('<i class="fas fa-sign-in-alt me-2"></i>Sign In');
                
                // Clear password field
                $('#adminPassword').val('');
            });
        });
    }

    function initAdminConfigurations() {
    console.log('Initializing admin configurations...');
    
    // Initialize Bootstrap dropdowns
    if (typeof bootstrap !== 'undefined') {
        var dropdownElementList = [].slice.call(document.querySelectorAll('.dropdown-toggle'))
        var dropdownList = dropdownElementList.map(function (dropdownToggleEl) {
            return new bootstrap.Dropdown(dropdownToggleEl)
        });
    }
        
        // Service header toggle
        $('.service-header').on('click', function() {
            const service = $(this).data('service');
            const configsDiv = $(`.service-configs[data-service="${service}"]`);
            const icon = $(this).find('i.fa-chevron-down, i.fa-chevron-up');
            
            configsDiv.toggle();
            $(this).toggleClass('collapsed');
            
            if (icon.hasClass('fa-chevron-down')) {
                icon.removeClass('fa-chevron-down').addClass('fa-chevron-up');
            } else {
                icon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
            }
        });
        
        // Search functionality
        $('#searchConfig').on('input', function() {
            const searchTerm = $(this).val().toLowerCase();
            filterConfigurations();
        });
        
        // Filter functionality
        $('#filterService, #filterType').on('change', function() {
            filterConfigurations();
        });

        // Testar conexão Amplimed — chama POST /admin/api/amplimed/test-auth
        $('#testAmplimedAuthBtn').on('click', function() {
            const btn = $(this);
            const originalHtml = btn.html();
            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Testando...');

            fetch('/admin/api/amplimed/test-auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            })
            .then(r => r.json())
            .then(body => {
                // Loga no console também (caso usuário queira inspecionar/copiar via DevTools)
                console.log('[Amplimed test-auth]', body);
                showAmplimedTestModal(body);
            })
            .catch(err => {
                console.error('[Amplimed test-auth] erro:', err);
                showAmplimedTestModal({ error: 'Erro na chamada: ' + err.message });
            })
            .finally(() => {
                btn.prop('disabled', false).html(originalHtml);
            });
        });

        // Helper: modal copiavel com a resposta CRUA da Amplimed (sem interpretacao)
        function showAmplimedTestModal(body) {
            // Renderiza JSON formatado, exatamente como veio do backend
            const fullText = JSON.stringify(body, null, 2);

            // Remove modal anterior se existir (evita acumular)
            $('#amplimedTestModal').remove();

            const modalHtml =
                '<div class="modal fade" id="amplimedTestModal" tabindex="-1" aria-hidden="true">' +
                '  <div class="modal-dialog modal-lg modal-dialog-scrollable">' +
                '    <div class="modal-content">' +
                '      <div class="modal-header bg-primary text-white">' +
                '        <h5 class="modal-title"><i class="fas fa-plug me-2"></i>Teste de Conexão Amplimed — Resposta Bruta</h5>' +
                '        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>' +
                '      </div>' +
                '      <div class="modal-body">' +
                '        <pre id="amplimedTestOutput" style="white-space:pre-wrap; word-break:break-all; user-select:text; cursor:text; background:#f8f9fa; padding:12px; border-radius:4px; font-size:13px; max-height:60vh; overflow:auto;"></pre>' +
                '      </div>' +
                '      <div class="modal-footer">' +
                '        <button type="button" class="btn btn-outline-secondary" id="amplimedTestCopyBtn">' +
                '          <i class="fas fa-copy"></i> Copiar' +
                '        </button>' +
                '        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>' +
                '      </div>' +
                '    </div>' +
                '  </div>' +
                '</div>';
            $('body').append(modalHtml);
            $('#amplimedTestOutput').text(fullText);
            $('#amplimedTestCopyBtn').on('click', function() {
                const btnCopy = $(this);
                const originalCopyHtml = btnCopy.html();
                navigator.clipboard.writeText(fullText).then(function() {
                    btnCopy.html('<i class="fas fa-check"></i> Copiado!');
                    setTimeout(function() { btnCopy.html(originalCopyHtml); }, 1500);
                }).catch(function() {
                    // Fallback: seleciona o texto pra usuario copiar manualmente
                    const range = document.createRange();
                    range.selectNode(document.getElementById('amplimedTestOutput'));
                    window.getSelection().removeAllRanges();
                    window.getSelection().addRange(range);
                });
            });
            new bootstrap.Modal(document.getElementById('amplimedTestModal')).show();
        }
        
        // Add configuration
        $('#addConfigBtn').on('click', function() {
            $('#configModalTitle').html('<i class="fas fa-plus me-2"></i>Add Configuration');
            $('#configForm')[0].reset();
            $('#configId').val('');
            $('#configModal').modal('show');
        });
        
        // Edit configuration
        $('.edit-config-btn').on('click', function() {
            const configId = $(this).data('id');
            // Load configuration data and show modal
            loadConfigurationForEdit(configId);
        });
        
        // Delete configuration
        $('.delete-config-btn').on('click', function() {
            const configId = $(this).data('id');
            if (confirm('Are you sure you want to delete this configuration?')) {
                deleteConfiguration(configId);
            }
        });
        
        // Refresh configurations
        $('#refreshBtn').on('click', function() {
            loadContent('admin-configurations');
        });
        
        // Save configuration
        $('#saveConfigBtn').on('click', function() {
            saveConfiguration();
        });
        
        // Inline editing
        $('.editable-field[data-editable="true"]').on('click', function() {
            if ($(this).hasClass('editing')) return;
            
            const currentValue = $(this).text();
            const field = $(this).data('field');
            const configId = $(this).closest('.config-item').data('id');
            
            $(this).addClass('editing');
            $(this).html(`<input type="text" class="form-control form-control-sm" value="${currentValue}">`);
            
            const input = $(this).find('input');
            input.focus().select();
            
            input.on('blur keypress', function(e) {
                if (e.type === 'blur' || e.which === 13) {
                    const newValue = $(this).val();
                    const parent = $(this).parent();
                    
                    if (newValue !== currentValue) {
                        updateConfigurationField(configId, field, newValue, parent);
                    } else {
                        parent.removeClass('editing').text(currentValue);
                    }
                }
            });
        });
    }

    function initAdminConfigTabs() {
        var imagerConfigLoaded = false;
        var gatewayConfigLoaded = false;
        var reportConfigLoaded = false;
        var profilesLoaded = false;
        var usersLoaded = false;
        var loggingLoaded = false;

        var tabEl = document.getElementById('adminConfigTabs');
        if (!tabEl) return;

        tabEl.addEventListener('shown.bs.tab', function(event) {
            var targetId = event.target.getAttribute('data-bs-target');

            if (targetId === '#profiles-pane' && !profilesLoaded) {
                profilesLoaded = true;
                if (typeof AdminProfiles !== 'undefined') {
                    AdminProfiles.init();
                }
            }

            if (targetId === '#users-pane' && !usersLoaded) {
                usersLoaded = true;
                if (typeof AdminUsers !== 'undefined') {
                    AdminUsers.init();
                }
            }

            if (targetId === '#logging-pane' && !loggingLoaded) {
                loggingLoaded = true;
                if (typeof AdminLogging !== 'undefined') {
                    AdminLogging.init();
                }
            }

            if (targetId === '#imager-configs-pane' && !imagerConfigLoaded) {
                imagerConfigLoaded = true;
                fetch('/imager/config/dashboard')
                    .then(function(response) {
                        if (!response.ok) throw new Error('Failed to load imager config');
                        return response.text();
                    })
                    .then(function(html) {
                        var loading = document.getElementById('imager-configs-loading');
                        if (loading) loading.style.display = 'none';
                        var container = document.getElementById('imager-configs-content');
                        if (container) container.innerHTML = html;

                        if (typeof resetImagerConfig === 'function') {
                            resetImagerConfig();
                        }
                        setTimeout(function() {
                            if (typeof initializeImagerConfig === 'function') {
                                initializeImagerConfig();
                            }
                        }, 100);
                    })
                    .catch(function(error) {
                        console.error('Error loading imager config:', error);
                        var loading = document.getElementById('imager-configs-loading');
                        if (loading) loading.innerHTML = '<p class="text-danger">Erro ao carregar configurações do Imager.</p>';
                    });
            }

            if (targetId === '#report-configs-pane' && !reportConfigLoaded) {
                reportConfigLoaded = true;
                if (typeof ReportConfig !== 'undefined') {
                    ReportConfig.init();
                }
            }

            if (targetId === '#gateway-configs-pane' && !gatewayConfigLoaded) {
                gatewayConfigLoaded = true;
                fetch('/api/gateway/fragments/config')
                    .then(function(response) {
                        if (!response.ok) throw new Error('Failed to load gateway config');
                        return response.text();
                    })
                    .then(function(html) {
                        var loading = document.getElementById('gateway-configs-loading');
                        if (loading) loading.style.display = 'none';
                        var container = document.getElementById('gateway-configs-content');
                        if (container) container.innerHTML = html;

                        setTimeout(function() {
                            if (typeof initGatewayConfig === 'function') {
                                initGatewayConfig();
                            }
                        }, 100);
                    })
                    .catch(function(error) {
                        console.error('Error loading gateway config:', error);
                        var loading = document.getElementById('gateway-configs-loading');
                        if (loading) loading.innerHTML = '<p class="text-danger">Erro ao carregar configurações do Gateway.</p>';
                    });
            }
        });

        // Trigger lazy-load for the initially-active tab (Imager é default agora; Parâmetros
        // não é mais o primeiro). Sem isso, o tab Imager fica visível mas vazio até o usuário
        // clicar em outra tab e voltar.
        var initiallyActive = tabEl.querySelector('.nav-link.active');
        if (initiallyActive) {
            var initialTarget = initiallyActive.getAttribute('data-bs-target');
            if (initialTarget) {
                initiallyActive.dispatchEvent(new Event('shown.bs.tab', { bubbles: true }));
            }
        }
    }

    function filterConfigurations() {
        const searchTerm = $('#searchConfig').val().toLowerCase();
        const serviceFilter = $('#filterService').val();
        const typeFilter = $('#filterType').val();
        
        $('.service-group').each(function() {
            const serviceGroup = $(this);
            const serviceName = serviceGroup.find('.service-header').data('service');
            let visibleConfigs = 0;
            
            serviceGroup.find('.config-item').each(function() {
                const configItem = $(this);
                const configKey = configItem.find('.config-key').text().toLowerCase();
                const configValue = configItem.find('.config-value').text().toLowerCase();
                const configType = configItem.find('.config-type').text();
                
                let show = true;
                
                // Search filter
                if (searchTerm && !configKey.includes(searchTerm) && !configValue.includes(searchTerm)) {
                    show = false;
                }
                
                // Service filter
                if (serviceFilter && serviceName !== serviceFilter) {
                    show = false;
                }
                
                // Type filter
                if (typeFilter && configType !== typeFilter) {
                    show = false;
                }
                
                if (show) {
                    configItem.show();
                    visibleConfigs++;
                } else {
                    configItem.hide();
                }
            });
            
            // Hide service group if no visible configs
            if (visibleConfigs === 0) {
                serviceGroup.hide();
            } else {
                serviceGroup.show();
            }
        });
    }

    function loadConfigurationForEdit(configId) {
        $.get(`/admin/api/configurations/${configId}`)
        .done(function(config) {
            $('#configModalTitle').html('<i class="fas fa-edit me-2"></i>Edit Configuration');
            $('#configId').val(config.id);
            $('#serviceName').val(config.serviceName);
            $('#configKey').val(config.configKey);
            $('#configValue').val(config.configValue);
            $('#description').val(config.description);
            $('#valueType').val(config.valueType);
            $('#editable').prop('checked', config.editable);
            $('#configModal').modal('show');
        })
        .fail(function() {
            showAlert('Erro ao carregar configuração para edição', 'danger');
        });
    }

    function saveConfiguration() {
        const formData = {
            id: $('#configId').val(),
            serviceName: $('#serviceName').val(),
            configKey: $('#configKey').val(),
            configValue: $('#configValue').val(),
            description: $('#description').val(),
            valueType: $('#valueType').val(),
            editable: $('#editable').is(':checked')
        };
        
        const isEdit = formData.id !== '';
        const url = isEdit ? `/admin/api/configurations/${formData.id}` : '/admin/api/configurations';
        const method = isEdit ? 'PUT' : 'POST';
        
        $.ajax({
            url: url,
            method: method,
            contentType: 'application/json',
            data: JSON.stringify(formData)
        })
        .done(function() {
            $('#configModal').modal('hide');
            loadContent('admin-configurations');
            showAlert(`Configuração ${isEdit ? 'atualizada' : 'adicionada'} com sucesso`, 'success');
        })
        .fail(function(xhr) {
            let errorMessage = `Falha ao ${isEdit ? 'atualizar' : 'adicionar'} configuração`;
            if (xhr.responseJSON && xhr.responseJSON.message) {
                errorMessage = xhr.responseJSON.message;
            }
            showAlert(errorMessage, 'danger');
        });
    }

    function deleteConfiguration(configId) {
        $.ajax({
            url: `/admin/api/configurations/${configId}`,
            method: 'DELETE'
        })
        .done(function() {
            loadContent('admin-configurations');
            showAlert('Configuração excluída com sucesso', 'success');
        })
        .fail(function() {
            showAlert('Falha ao excluir configuração', 'danger');
        });
    }

    function updateConfigurationField(configId, field, newValue, element) {
        const updateData = {};
        updateData[field] = newValue;
        
        $.ajax({
            url: `/admin/api/configurations/${configId}`,
            method: 'PATCH',
            contentType: 'application/json',
            data: JSON.stringify(updateData)
        })
        .done(function() {
            element.removeClass('editing').text(newValue);
            showAlert('Configuração atualizada com sucesso', 'success');
        })
        .fail(function() {
            element.removeClass('editing').text(element.data('original-value') || '');
            showAlert('Falha ao atualizar configuração', 'danger');
        });
    }

    // Change password: agora gerenciado pela aba "Usuários" (admin-users.js)

    function showAlert(message, type) {
        const alertContainer = $('#alertsContainer');
        const alertHtml = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-triangle'} me-2"></i>
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
        alertContainer.html(alertHtml);

        // Auto-dismiss after 5 seconds
        setTimeout(function() {
            alertContainer.find('.alert').alert('close');
        }, 5000);
    }
});