// ================================================================================
// MEDDRIVE UI UTILITIES
// ================================================================================
// Shared UI utility functions for alerts, notifications, and common UI patterns
// Used across all modules to ensure consistent user experience

// ================================================================================
// ALERT/NOTIFICATION UTILITIES
// ================================================================================

/**
 * Show an alert message with intelligent positioning
 *
 * @param {string} message - The message to display
 * @param {string} type - The alert type: 'success', 'danger', 'warning', 'info' (default: 'info')
 * @param {Object} options - Optional configuration
 * @param {string} options.containerId - Specific container ID to use (overrides auto-detection)
 * @param {number} options.duration - Auto-dismiss duration in ms (0 = no auto-dismiss, default: 5000)
 * @param {boolean} options.removeExisting - Remove existing alerts before showing new one (default: true)
 *
 * @example
 * // Simple usage
 * showAlert('Operação realizada com sucesso!', 'success');
 *
 * @example
 * // With specific container
 * showAlert('Erro ao processar', 'danger', { containerId: 'myAlertContainer' });
 *
 * @example
 * // Persistent alert (no auto-dismiss)
 * showAlert('Atenção: leia com cuidado', 'warning', { duration: 0 });
 */
function showAlert(message, type = 'info', options = {}) {
    const {
        containerId = null,
        duration = 5000,
        removeExisting = true
    } = options;

    // Remove existing alerts if requested
    if (removeExisting) {
        $('.alert').remove();
    }

    // Determine icon based on type
    const iconMap = {
        'success': 'fa-check-circle',
        'danger': 'fa-exclamation-triangle',
        'warning': 'fa-exclamation-circle',
        'info': 'fa-info-circle'
    };
    const iconClass = iconMap[type] || 'fa-info-circle';

    // Build alert HTML
    const alertHtml = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert" style="z-index: 9999;">
            <i class="fas ${iconClass} me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Fechar"></button>
        </div>
    `;

    // Determine where to insert the alert
    if (containerId) {
        // Use specified container
        const container = $('#' + containerId);
        if (container.length > 0) {
            container.html(alertHtml);
        } else {
            console.warn(`Alert container #${containerId} not found, falling back to body`);
            $('body').prepend(alertHtml);
        }
    } else {
        // Intelligent auto-detection
        const openModal = document.querySelector('.modal.show');

        if (openModal) {
            // Insert alert into the open modal's body
            const modalBody = openModal.querySelector('.modal-body');
            if (modalBody) {
                $(modalBody).prepend(alertHtml);
            } else {
                // Fallback: insert into modal content
                $(openModal).find('.modal-content').prepend(alertHtml);
            }
        } else {
            // No modal open - show alert at the top of the page
            $('body').prepend(alertHtml);
        }
    }

    // Auto-dismiss if duration is set
    if (duration > 0) {
        setTimeout(() => {
            $('.alert').fadeOut(400, function() {
                $(this).remove();
            });
        }, duration);
    }
}

/**
 * Show a notification (alias for showAlert with type mapping)
 * Maps common notification types to Bootstrap alert classes
 *
 * @param {string} message - The message to display
 * @param {string} type - Notification type: 'error', 'warning', 'success', 'info'
 * @param {Object} options - Optional configuration (same as showAlert)
 */
function showNotification(message, type = 'info', options = {}) {
    // Map notification types to Bootstrap alert types
    const typeMap = {
        'error': 'danger',
        'warning': 'warning',
        'success': 'success',
        'info': 'info'
    };

    const bootstrapType = typeMap[type] || 'info';
    showAlert(message, bootstrapType, options);
}

// ================================================================================
// MODAL CLEANUP - Clear alerts when modals close
// ================================================================================

$(document).ready(function() {
    // Remove alerts inside modals when modal is closed
    // Prevents alerts from previous modal appearing in newly opened modals
    $(document).on('hidden.bs.modal', '.modal', function () {
        $(this).find('.alert').remove();
    });
});

// ================================================================================
// SESSION EXPIRATION HANDLING
// ================================================================================
// Detects 401 responses (lost session, typically after server restart) and redirects
// the browser to the login page. Without this, polling intervals (DataTables, stats,
// dashboard badges) would keep failing and showing error alerts indefinitely until
// the user manually refreshes the browser.

(function() {
    'use strict';

    var SESSION_EXPIRED_REDIRECT_DELAY_MS = 5000;
    var redirectingToLogin = false;

    function handleSessionExpired() {
        if (redirectingToLogin) return;
        redirectingToLogin = true;

        // Persistent informational banner so the user understands what's happening
        // during the grace period before the automatic redirect.
        var seconds = Math.round(SESSION_EXPIRED_REDIRECT_DELAY_MS / 1000);
        var bannerId = 'sessionExpiredBanner';
        var bannerHtml =
            '<div id="' + bannerId + '" class="alert alert-warning fade show py-2 px-3 small" role="alert" ' +
                 'style="position: fixed; top: 1rem; left: 50%; transform: translateX(-50%); z-index: 10000; min-width: 260px; max-width: 420px;">' +
                '<i class="fas fa-exclamation-triangle me-2"></i>' +
                'Sessão expirada. Redirecionando em <span id="' + bannerId + '-count">' + seconds + '</span>s...' +
            '</div>';
        // Remove any existing alerts to avoid stacking; this banner is the priority.
        if (typeof $ !== 'undefined') {
            $('.alert').remove();
            $('body').prepend(bannerHtml);
        }

        // Live countdown so the user sees something is happening.
        var countEl = document.getElementById(bannerId + '-count');
        var remaining = seconds;
        var tick = setInterval(function() {
            remaining -= 1;
            if (countEl) countEl.textContent = remaining;
            if (remaining <= 0) clearInterval(tick);
        }, 1000);

        setTimeout(function() {
            window.location.href = '/';
        }, SESSION_EXPIRED_REDIRECT_DELAY_MS);
    }

    // jQuery global 401 handler (covers $.ajax, $.get, $.post, DataTables AJAX)
    if (typeof $ !== 'undefined') {
        $(document).ajaxError(function(event, jqXHR) {
            if (jqXHR.status === 401) {
                handleSessionExpired();
            }
        });
    }

    // Wrap fetch() so that:
    //  1. Accept header includes application/json — required for AuthenticationInterceptor
    //     to return 401 JSON instead of 302 redirect (which fetch would silently follow,
    //     yielding HTML that breaks response.json() with "Unexpected token <").
    //  2. 401 responses trigger a single redirect to the login page.
    //  3. Defensive fallback: if the response was redirected to "/" (interceptor's
    //     non-AJAX path), treat it as session expired — otherwise the calling code
    //     would inject the login HTML into the dashboard content area.
    if (typeof window.fetch === 'function') {
        var originalFetch = window.fetch.bind(window);
        window.fetch = function(input, init) {
            init = init || {};
            var headers = new Headers(init.headers || {});
            if (!headers.has('Accept')) {
                headers.set('Accept', 'application/json, */*;q=0.9');
            }
            if (!headers.has('X-Requested-With')) {
                headers.set('X-Requested-With', 'XMLHttpRequest');
            }
            init.headers = headers;
            return originalFetch(input, init).then(function(response) {
                if (response.status === 401) {
                    handleSessionExpired();
                    return Promise.reject(new Error('Sessão expirada'));
                }
                if (response.redirected) {
                    try {
                        var redirectedPath = new URL(response.url).pathname;
                        if (redirectedPath === '/' || redirectedPath === '/index') {
                            handleSessionExpired();
                            return Promise.reject(new Error('Sessão expirada'));
                        }
                    } catch (e) {
                        // URL parsing failed — ignore and let the response through
                    }
                }
                return response;
            });
        };
    }
})();

// ================================================================================
// EXPORT FUNCTIONS FOR GLOBAL ACCESS
// ================================================================================

window.showAlert = showAlert;
window.showNotification = showNotification;
