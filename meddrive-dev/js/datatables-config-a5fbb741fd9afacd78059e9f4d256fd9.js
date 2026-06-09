/**
 * ================================================================================
 * Meddrive - DataTables Componentization System
 * ================================================================================
 *
 * MANDATORY: All modules MUST use these standardized configurations
 *
 * Purpose:
 * - Ensure visual consistency across all modules
 * - Centralize DataTable configuration (Single Source of Truth)
 * - Reduce code duplication
 * - Simplify maintenance
 *
 * Usage:
 * 1. Include this file in your HTML: <script src="/js/datatables-config.js"></script>
 * 2. Use predefined configs: window.MeddriveDataTables.configs.standard()
 * 3. Customize when needed: window.MeddriveDataTables.configs.standard({ pageLength: 50 })
 *
 * ================================================================================
 */

(function(window) {
    'use strict';

    // ================================================================================
    // BASE CONFIGURATION (Single Source of Truth)
    // ================================================================================

    const BASE_CONFIG = {
        "scrollX": true,
        "scrollY": "calc(100vh - 400px)",
        "scrollCollapse": true,
        "paging": true,
        "lengthChange": true,
        "pageLength": 25,
        "lengthMenu": [[10, 25, 50, 100, -1], [10, 25, 50, 100, "Todos"]],
        "searching": true,
        "ordering": true,
        "info": true,
        "autoWidth": false,  // CRITICAL: Always false - column widths defined in JS only
        "responsive": true,
        "dom": '<"row"<"col-sm-6"l><"col-sm-6"f>>rt<"bottom"ip><"clear">',
        "language": {
            url: '/i18n/pt-BR.json'
        }
    };

    // ================================================================================
    // CONFIGURATION PRESETS
    // ================================================================================

    const CONFIGS = {
        /**
         * Standard configuration for most tables
         * Use for: Dashboard tables, list views
         */
        standard: function(customConfig = {}) {
            return mergeConfig(BASE_CONFIG, customConfig);
        },

        /**
         * Configuration with external filtering
         * Use for: DICOM Server, Gateway, Worklist (tables with custom filter forms)
         */
        withExternalFiltering: function(customConfig = {}) {
            return mergeConfig(BASE_CONFIG, {
                "searching": false  // Disable built-in search
            }, customConfig);
        },

        /**
         * Simple configuration for smaller tables
         * Use for: Configuration pages, settings tables
         */
        simple: function(customConfig = {}) {
            return mergeConfig(BASE_CONFIG, {
                "scrollY": false,
                "scrollCollapse": false,
                "pageLength": 10,
                "lengthMenu": [[10, 25, 50], [10, 25, 50]],
                "dom": '<"row"<"col-sm-6"l><"col-sm-6"f>>rt<"bottom"ip><"clear">'
            }, customConfig);
        },

        /**
         * Configuration for tree-view tables
         * Use for: Imager worklist (hierarchical data)
         */
        treeView: function(customConfig = {}) {
            return mergeConfig(BASE_CONFIG, {
                "searching": false,
                "ordering": false,
                "dom": 'rt<"bottom"ip><"clear">'
            }, customConfig);
        },

        /**
         * Compact configuration for embedded tables
         * Use for: Modals, sidebar tables, profile tables
         */
        compact: function(customConfig = {}) {
            return mergeConfig(BASE_CONFIG, {
                "scrollY": false,
                "scrollCollapse": false,
                "pageLength": 10,
                "lengthMenu": [[5, 10, 25], [5, 10, 25]],
                "searching": false,
                "lengthChange": false,
                "dom": 'rt<"bottom"p><"clear">'
            }, customConfig);
        },

        /**
         * No-pagination configuration
         * Use for: Small datasets that fit on one page
         */
        noPagination: function(customConfig = {}) {
            return mergeConfig(BASE_CONFIG, {
                "paging": false,
                "scrollY": "400px",
                "dom": '<"row"<"col-sm-12"f>>rt<"clear">'
            }, customConfig);
        }
    };

    // ================================================================================
    // HELPER FUNCTIONS
    // ================================================================================

    /**
     * Deep merge multiple configuration objects
     * Later objects override earlier ones
     */
    function mergeConfig(...configs) {
        return $.extend(true, {}, ...configs);
    }

    /**
     * Initialize DataTable with automatic cleanup
     * Prevents common initialization errors
     */
    function initDataTable(selector, config) {
        const $table = $(selector);

        // Check if table exists
        if ($table.length === 0) {
            console.error(`DataTable initialization failed: Element '${selector}' not found`);
            return null;
        }

        // Destroy existing DataTable if present
        if ($.fn.DataTable.isDataTable(selector)) {
            try {
                $table.DataTable().clear().destroy();
                $table.empty();
            } catch (e) {
                console.warn('Error destroying DataTable:', e);
                // Force cleanup
                $table.removeClass('dataTable');
                $(selector + '_wrapper').remove();
            }
        }

        // Initialize new DataTable
        try {
            return $table.DataTable(config);
        } catch (e) {
            console.error('DataTable initialization error:', e);
            return null;
        }
    }

    /**
     * Reload DataTable data without losing current page/state
     */
    function reloadDataTable(tableInstance, resetPaging = false) {
        if (tableInstance && $.fn.DataTable.isDataTable(tableInstance.table().node())) {
            tableInstance.ajax.reload(null, resetPaging);
        }
    }

    // ================================================================================
    // EXPORT TO WINDOW (Global API)
    // ================================================================================

    window.MeddriveDataTables = {
        configs: CONFIGS,
        init: initDataTable,
        reload: reloadDataTable,
        merge: mergeConfig
    };

    // Backward compatibility
    window.standardDataTablesConfig = BASE_CONFIG;
    window.createDataTablesConfig = CONFIGS.standard;
    window.dataTablesConfigs = CONFIGS;

})(window);