/**
 * DICOM Worklist Dashboard JavaScript
 * Handles worklist table initialization, filtering, and UI interactions
 */

const DicomWorklist = {
    worklistTable: null,
    searchDebounceTimer: null,

    /**
     * Initialize the DICOM Worklist dashboard
     * Called when the worklist fragment is loaded
     */
    init: function() {
        // Small delay to ensure DOM is fully ready
        setTimeout(() => {
            this.initWorklistTable();
            this.initEventHandlers();
        }, 100);
    },

    /**
     * Initialize DataTable for worklist with AJAX
     */
    initWorklistTable: function() {
        // Destroy existing DataTable if present
        if ($.fn.DataTable.isDataTable('#worklistTable')) {
            $('#worklistTable').DataTable().destroy();
        }

        this.worklistTable = $('#worklistTable').DataTable({
            "ajax": {
                "url": "/api/worklist",
                "type": "POST",
                "contentType": "application/json",
                "data": function(d) {
                    // Get filter values
                    const estudo = $('#estudoFilter').val() || '';
                    const modalidade = $('#modalidadeFilter').val() || '';
                    const paciente = $('#pacienteFilter').val() || '';

                    // Return data in the format expected by backend
                    return JSON.stringify({
                        draw: d.draw,
                        start: d.start,
                        length: d.length,
                        estudo: estudo,
                        modalidade: modalidade,
                        paciente: paciente
                    });
                },
                "error": function(xhr, error, code) {
                    console.error('AJAX error loading worklist:', error);
                    DicomWorklist.showAlert('Erro ao carregar dados: ' + error, 'danger');
                }
            },
            "serverSide": true,
            "processing": true,
            "searching": false, // Using external filters
            "ordering": true,
            "autoWidth": false,
            "pageLength": 25,
            "lengthMenu": [[10, 25, 50, 100], [10, 25, 50, 100]],
            "dom": 'rtip', // Remove default search and length controls (using custom ones)
            "columns": [
                {
                    "data": "studyDateTime",
                    "width": "12%",
                    "className": "text-nowrap",
                    "render": function(data, type) {
                        if (!data) return '';

                        if (type === 'sort' || type === 'type') {
                            // Return sortable value
                            if (Array.isArray(data) && data.length >= 5) {
                                return `${data[0]}-${String(data[1]).padStart(2,'0')}-${String(data[2]).padStart(2,'0')}T${String(data[3]).padStart(2,'0')}:${String(data[4]).padStart(2,'0')}`;
                            }
                            return data;
                        }

                        // Handle LocalDateTime array: [year, month, day, hour, minute, second]
                        if (Array.isArray(data) && data.length >= 5) {
                            const day = String(data[2]).padStart(2, '0');
                            const month = String(data[1]).padStart(2, '0');
                            const year = String(data[0]).substring(2); // Get last 2 digits
                            const hour = String(data[3]).padStart(2, '0');
                            const minute = String(data[4]).padStart(2, '0');
                            return `${day}/${month}/${year} ${hour}:${minute}`;
                        }

                        // Handle ISO string format: "2025-11-04T14:41:51"
                        if (typeof data === 'string' && data.includes('T')) {
                            const date = new Date(data);
                            const day = String(date.getDate()).padStart(2, '0');
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const year = String(date.getFullYear()).substring(2);
                            const hour = String(date.getHours()).padStart(2, '0');
                            const minute = String(date.getMinutes()).padStart(2, '0');
                            return `${day}/${month}/${year} ${hour}:${minute}`;
                        }

                        return data;
                    }
                },
                {
                    "data": "accessionNumber",
                    "width": "8%",
                    "className": "text-nowrap",
                    "render": function(data) {
                        return '<span class="font-weight-bold">' + (data || '') + '</span>';
                    }
                },
                {
                    "data": "patientName",
                    "width": "25%",
                    "render": function(data, type, row) {
                        return '<div><span class="font-weight-bold">' + (data || '') + '</span></div>';
                    }
                },
                {
                    "data": "modality",
                    "width": "10%",
                    "className": "text-nowrap text-center",
                    "render": function(data) {
                        return data || '';
                    }
                },
                {
                    "data": "studyDescription",
                    "width": "45%"
                }
            ],
            "order": [[0, "desc"]],
            "language": {
                url: '/i18n/pt-BR.json'
            }
        });
    },

    /**
     * Initialize event handlers for filters and buttons
     */
    initEventHandlers: function() {
        const self = this;

        // Toolbar - Items per page selector
        $('#worklistItemsPerPageSelect').off('change').on('change', function() {
            if (self.worklistTable) {
                self.worklistTable.page.len(parseInt($(this).val())).draw();
            }
        });

        // Toolbar - Search input (client-side filter on loaded data)
        $('#worklistSearchInput').off('keyup').on('keyup', function() {
            var searchValue = $(this).val().trim();

            if (searchValue.length > 0) {
                $('#worklistClearSearchBtn').show();
            } else {
                $('#worklistClearSearchBtn').hide();
            }

            // Debounce
            if (self.searchDebounceTimer) {
                clearTimeout(self.searchDebounceTimer);
            }

            self.searchDebounceTimer = setTimeout(function() {
                if (self.worklistTable) {
                    self.worklistTable.search(searchValue).draw();
                }
            }, 400);
        });

        // Toolbar - Clear search button
        $('#worklistClearSearchBtn').off('click').on('click', function() {
            $('#worklistSearchInput').val('');
            $(this).hide();
            if (self.worklistTable) {
                self.worklistTable.search('').draw();
            }
        });

        // Filter button
        $('#filterBtn').off('click').on('click', function() {
            if (self.worklistTable) {
                self.worklistTable.ajax.reload();
            }
        });

        // Clear filter button
        $('#clearFilterBtn').off('click').on('click', function() {
            $('.filter').val('');
            if (self.worklistTable) {
                self.worklistTable.ajax.reload();
            }
        });

        // Trigger filter on Enter key in filter inputs
        $('#estudoFilter, #modalidadeFilter, #pacienteFilter').off('keypress').on('keypress', function(e) {
            if (e.which === 13) { // Enter key
                e.preventDefault();
                if (self.worklistTable) {
                    self.worklistTable.ajax.reload();
                }
            }
        });
    },

    /**
     * Show alert message
     */
    showAlert: function(message, type) {
        const alertContainer = $('#alertsContainer');
        const iconMap = {
            'success': 'check-circle',
            'danger': 'exclamation-triangle',
            'warning': 'exclamation-triangle',
            'info': 'info-circle'
        };

        const icon = iconMap[type] || 'info-circle';

        const alertHtml = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                <i class="fas fa-${icon} me-2"></i>
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>`;

        alertContainer.html(alertHtml);

        // Auto-hide after 5 seconds
        setTimeout(function() {
            alertContainer.find('.alert').alert('close');
        }, 5000);
    },

    /**
     * Cleanup function - called when navigating away from worklist
     */
    cleanup: function() {
        if (this.worklistTable) {
            this.worklistTable.destroy();
            this.worklistTable = null;
        }

        // Remove event handlers
        $('#clearFilterBtn').off('click');
        $('#filterBtn').off('click');
        $('#estudoFilter, #modalidadeFilter, #pacienteFilter').off('keypress');
        $('#worklistItemsPerPageSelect').off('change');
        $('#worklistSearchInput').off('keyup');
        $('#worklistClearSearchBtn').off('click');
    }
};

// Auto-initialize when document is ready and table exists
$(document).ready(function() {
    if ($('#worklistTable').length) {
        DicomWorklist.init();
    }
});

// Export for global access
window.DicomWorklist = DicomWorklist;
