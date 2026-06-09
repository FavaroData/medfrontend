/**
 * ================================================================================
 * Meddrive - DataTables Column Renderers
 * ================================================================================
 *
 * MANDATORY: Use these renderers for consistent column rendering
 *
 * Purpose:
 * - Ensure visual consistency across all tables
 * - Standardize common column types (actions, status, boolean)
 * - Reduce code duplication
 * - Simplify maintenance
 *
 * Usage:
 * 1. Include this file AFTER datatables-config.js
 * 2. Use in columnDefs: { render: window.MeddriveRenderers.actions(...) }
 *
 * ================================================================================
 */

(function(window) {
    'use strict';

    // ================================================================================
    // ACTION BUTTONS RENDERERS
    // ================================================================================

    /**
     * Render action buttons column
     * @param {Array} buttons - Array of button objects: { icon, title, onClick, color }
     * @returns {Function} DataTables render function
     *
     * Example:
     * {
     *   targets: -1,
     *   orderable: false,
     *   width: "150px",
     *   render: window.MeddriveRenderers.actions([
     *     { icon: 'fa-edit', title: 'Editar', onClick: 'editItem', color: 'secondary' },
     *     { icon: 'fa-trash', title: 'Excluir', onClick: 'deleteItem', color: 'danger' }
     *   ])
     * }
     */
    function renderActions(buttons) {
        return function(data, type, row) {
            if (type !== 'display') return data;

            return buttons.map(btn => {
                const onClick = typeof btn.onClick === 'function'
                    ? `(${btn.onClick})(${row.id || row[0]})`
                    : `${btn.onClick}(${row.id || row[0]})`;

                return `
                    <button class="btn-icon-only"
                            onclick="${onClick}"
                            title="${btn.title}">
                        <i class="fas ${btn.icon}"></i>
                    </button>
                `;
            }).join('');
        };
    }

    /**
     * Render standard CRUD action buttons (Edit + Delete)
     * @param {Object} options - { editFn, deleteFn, toggleFn, additionalButtons }
     */
    function renderStandardActions(options = {}) {
        const buttons = [];

        // Edit button (always first)
        if (options.editFn) {
            buttons.push({
                icon: 'fa-edit',
                title: 'Editar',
                onClick: options.editFn
            });
        }

        // Toggle button (second if present)
        if (options.toggleFn) {
            buttons.push({
                icon: 'fa-power-off',
                title: 'Ativar/Desativar',
                onClick: options.toggleFn
            });
        }

        // Additional custom buttons (middle)
        if (options.additionalButtons) {
            buttons.push(...options.additionalButtons);
        }

        // Delete button (always last)
        if (options.deleteFn) {
            buttons.push({
                icon: 'fa-trash',
                title: 'Excluir',
                onClick: options.deleteFn
            });
        }

        return renderActions(buttons);
    }

    // ================================================================================
    // STATUS RENDERERS
    // ================================================================================

    /**
     * Render boolean status as Ativo/Inativo
     */
    function renderStatus(data, type, row) {
        if (type !== 'display') return data;
        return data ? 'Ativo' : 'Inativo';
    }

    /**
     * Render status badge with color
     * @param {Object} statusMap - Map of status values to display text and color
     *
     * Example:
     * renderStatusBadge({
     *   'PENDING': { text: 'Pendente', class: 'status-pending' },
     *   'COMPLETED': { text: 'Concluído', class: 'status-completed' }
     * })
     */
    function renderStatusBadge(statusMap) {
        return function(data, type, row) {
            if (type !== 'display') return data;

            const status = statusMap[data] || { text: data, class: 'status-badge' };
            return `<span class="${status.class}">${status.text}</span>`;
        };
    }

    /**
     * Render boolean as badge
     */
    function renderBooleanBadge(trueText = 'Sim', falseText = 'Não') {
        return function(data, type, row) {
            if (type !== 'display') return data;

            const isTrue = data === true || data === 'true' || data === 1;
            const badgeClass = isTrue ? 'badge bg-success' : 'badge bg-secondary';
            const text = isTrue ? trueText : falseText;

            return `<span class="${badgeClass}">${text}</span>`;
        };
    }

    // ================================================================================
    // TEXT RENDERERS
    // ================================================================================

    /**
     * Render text with optional subtitle
     * @param {String} titleField - Main field name
     * @param {String} subtitleField - Optional subtitle field name
     */
    function renderTitleSubtitle(titleField, subtitleField) {
        return function(data, type, row) {
            if (type !== 'display') return row[titleField];

            const title = escapeHtml(row[titleField] || '');
            const subtitle = row[subtitleField] ? escapeHtml(row[subtitleField]) : null;

            if (subtitle) {
                return `
                    <strong>${title}</strong>
                    <br><small class="text-muted">${subtitle}</small>
                `;
            }
            return `<strong>${title}</strong>`;
        };
    }

    /**
     * Render code/monospace text
     */
    function renderCode(data, type, row) {
        if (type !== 'display') return data;
        return `<code>${escapeHtml(data || '')}</code>`;
    }

    /**
     * Render code with optional exclusion pattern
     * Use for: Wildcard columns with inclusion/exclusion patterns
     */
    function renderCodeWithExclusion(inclusionField, exclusionField) {
        return function(data, type, row) {
            if (type !== 'display') return row[inclusionField];

            const inclusion = escapeHtml(row[inclusionField] || '*.pdf');
            const exclusion = row[exclusionField] ? escapeHtml(row[exclusionField]) : null;

            if (exclusion) {
                return `
                    <code>${inclusion}</code>
                    <br><small class="text-muted">Excluir: <code>${exclusion}</code></small>
                `;
            }
            return `<code>${inclusion}</code>`;
        };
    }

    /**
     * Render truncated text with tooltip
     * @param {Number} maxLength - Maximum characters before truncation
     */
    function renderTruncated(maxLength = 50) {
        return function(data, type, row) {
            if (type !== 'display') return data;
            if (!data) return '';

            const text = String(data);
            if (text.length <= maxLength) {
                return escapeHtml(text);
            }

            const truncated = escapeHtml(text.substring(0, maxLength)) + '...';
            const full = escapeHtml(text);

            return `<span title="${full}">${truncated}</span>`;
        };
    }

    // ================================================================================
    // NUMERIC RENDERERS
    // ================================================================================

    /**
     * Render centered numeric value
     */
    function renderCentered(data, type, row) {
        if (type !== 'display') return data;
        return `<div class="text-center">${data !== null && data !== undefined ? data : '-'}</div>`;
    }

    /**
     * Render file size in KB/MB
     */
    function renderFileSize(data, type, row) {
        if (type !== 'display' || !data) return data;

        const bytes = parseInt(data);
        if (bytes < 1024) {
            return `${bytes} bytes`;
        } else if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(2)} KB`;
        } else {
            return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        }
    }

    /**
     * Render percentage
     */
    function renderPercentage(decimals = 2) {
        return function(data, type, row) {
            if (type !== 'display' || data === null || data === undefined) return data;
            return `${(data * 100).toFixed(decimals)}%`;
        };
    }

    // ================================================================================
    // DATE/TIME RENDERERS
    // ================================================================================

    /**
     * Render date in Brazilian format (DD/MM/YYYY HH:mm:ss)
     */
    function renderDateTime(data, type, row) {
        if (type !== 'display' || !data) return data;

        try {
            const date = new Date(data);
            if (isNaN(date.getTime())) return data;

            return date.toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch (e) {
            return data;
        }
    }

    /**
     * Render date only (DD/MM/YYYY)
     */
    function renderDate(data, type, row) {
        if (type !== 'display' || !data) return data;

        try {
            const date = new Date(data);
            if (isNaN(date.getTime())) return data;

            return date.toLocaleDateString('pt-BR');
        } catch (e) {
            return data;
        }
    }

    /**
     * Render relative time (e.g., "2 horas atrás")
     */
    function renderRelativeTime(data, type, row) {
        if (type !== 'display' || !data) return data;

        try {
            const date = new Date(data);
            if (isNaN(date.getTime())) return data;

            const now = new Date();
            const diff = now - date;
            const seconds = Math.floor(diff / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);

            if (days > 0) return `${days} dia${days > 1 ? 's' : ''} atrás`;
            if (hours > 0) return `${hours} hora${hours > 1 ? 's' : ''} atrás`;
            if (minutes > 0) return `${minutes} minuto${minutes > 1 ? 's' : ''} atrás`;
            return `${seconds} segundo${seconds !== 1 ? 's' : ''} atrás`;
        } catch (e) {
            return data;
        }
    }

    // ================================================================================
    // UTILITY FUNCTIONS
    // ================================================================================

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(text) {
        if (!text) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    }

    // ================================================================================
    // COLUMN DEFINITION HELPERS
    // ================================================================================

    /**
     * Create a standard actions column definition
     * @param {Object} options - { editFn, deleteFn, toggleFn, width }
     */
    function actionsColumn(options = {}) {
        return {
            targets: options.target || -1,
            orderable: false,
            width: options.width || '150px',
            render: renderStandardActions(options),
            className: 'text-end'
        };
    }

    /**
     * Create a standard status column definition
     */
    function statusColumn(target) {
        return {
            targets: target,
            width: '100px',
            className: 'text-center',
            render: renderStatus
        };
    }

    /**
     * Create a standard ID column definition
     */
    function idColumn(target = 0) {
        return {
            targets: target,
            width: '80px',
            className: 'text-center'
        };
    }

    // ================================================================================
    // EXPORT TO WINDOW (Global API)
    // ================================================================================

    window.MeddriveRenderers = {
        // Action renderers
        actions: renderActions,
        standardActions: renderStandardActions,

        // Status renderers
        status: renderStatus,
        statusBadge: renderStatusBadge,
        booleanBadge: renderBooleanBadge,

        // Text renderers
        titleSubtitle: renderTitleSubtitle,
        code: renderCode,
        codeWithExclusion: renderCodeWithExclusion,
        truncated: renderTruncated,

        // Numeric renderers
        centered: renderCentered,
        fileSize: renderFileSize,
        percentage: renderPercentage,

        // Date/Time renderers
        dateTime: renderDateTime,
        date: renderDate,
        relativeTime: renderRelativeTime,

        // Utility
        escapeHtml: escapeHtml,

        // Column definition helpers
        columns: {
            actions: actionsColumn,
            status: statusColumn,
            id: idColumn
        }
    };

})(window);
