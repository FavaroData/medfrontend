/**
 * Imager Order Dashboard (Step 1) JavaScript
 *
 * Responsabilidades:
 * - Configuração de colunas DataTable para Step 1
 * - Funções de formatação de pedidos/pacientes
 * - Lógica de exibição de dados de pedidos
 *
 * Convenção: Prefixo step1_ para funções públicas
 */

// ========================================
// DATATABLE COLUMN CONFIGURATION
// ========================================

/**
 * Step 1 Column Configuration - Exam Orders/Patients
 */
const step1ColumnConfig = {
    title: 'Etapa 1 - Pacientes',
    columns: [
        {
            data: 'orderDateTime',
            title: 'Data',
            defaultContent: '-',
            width: '10%',
            className: 'text-start',
            render: function(data, type) {
                if (!data) return '-';

                // For sorting, return ISO string as-is (sorts correctly)
                if (type === 'sort' || type === 'type') {
                    return data;
                }

                // For display, format the date
                try {
                    // Parse ISO string format (e.g., "2025-07-31T17:49:24")
                    const date = new Date(data);

                    if (isNaN(date.getTime())) {
                        return data; // Return original if invalid date
                    }

                    // Format to dd/MM/yy hh:mm
                    const day = String(date.getDate()).padStart(2, '0');
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const year = String(date.getFullYear()).slice(-2);
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');

                    return `${day}/${month}/${year} ${hours}:${minutes}`;
                } catch (error) {
                    console.warn('Error formatting date:', data, error);
                    return data || '-';
                }
            }
        },
        {
            data: 'nmPaciente',
            title: 'Paciente',
            defaultContent: '-',
            width: '30%',
            className: 'text-start',
            render: function(data, type, row) {
                if (!data) return '-';

                // Format birth date
                let birthDateFormatted = '-';
                if (row.dtNascimento) {
                    try {
                        const parts = row.dtNascimento.split('-');
                        if (parts.length === 3) {
                            const year = parseInt(parts[0]);
                            const month = parseInt(parts[1]);
                            const day = parseInt(parts[2]);

                            if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                                const dayStr = String(day).padStart(2, '0');
                                const monthStr = String(month).padStart(2, '0');
                                const yearStr = String(year);
                                birthDateFormatted = `${dayStr}/${monthStr}/${yearStr}`;
                            }
                        }
                    } catch (error) {
                        console.warn('Error formatting birth date:', row.dtNascimento, error);
                    }
                }

                // Format CPF
                let cpfFormatted = '-';
                if (row.cpf) {
                    const cpfStr = String(row.cpf);
                    const digitsOnly = cpfStr.replace(/\D/g, '');
                    if (digitsOnly.length === 11) {
                        cpfFormatted = digitsOnly.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
                    } else {
                        cpfFormatted = cpfStr;
                    }
                }

                return `${data}<br><small class="text-muted">Nasc: ${birthDateFormatted} | CPF: ${cpfFormatted}</small>`;
            }
        },
        {
            data: 'procedimento',
            title: 'Procedimento',
            defaultContent: '-',
            width: '26%',
            className: 'text-start',
            render: function(data, type, row) {
                if (!data) return '-';

                // Build second line with visit number and prescription
                let secondLineItems = [];

                // Add visit number if available
                if (row.visitNumber) {
                    secondLineItems.push(`Atend: ${row.visitNumber}`);
                }

                // Add prescription number if available
                if (row.nrPrescricao || row.nrSeqPrescricao) {
                    const placer = row.nrPrescricao || '';
                    const filler = row.nrSeqPrescricao || '';

                    if (placer && filler) {
                        secondLineItems.push(`Prescr: ${placer}-${filler}`);
                    } else if (placer) {
                        secondLineItems.push(`Prescr: ${placer}`);
                    } else if (filler) {
                        secondLineItems.push(`Seq: ${filler}`);
                    }
                }

                // Add accession number if available
                if (row.accessionNumber) {
                    secondLineItems.push(`Acc: ${row.accessionNumber}`);
                }

                const orderInfo = secondLineItems.length > 0
                    ? `<br><small class="text-muted">${secondLineItems.join(' | ')}</small>`
                    : '';

                return `${data}${orderInfo}`;
            }
        },
        { data: 'nmMedico', title: 'Médico', defaultContent: '-', width: '16%', className: 'text-start' },
        {
            data: 'processingStatus',
            title: 'Status',
            defaultContent: 'PENDING',
            width: '18%',
            className: 'text-center',
            render: function(data) {
                // Return badge with appropriate color based on status
                if (!data || data === 'PENDING') {
                    return '<span class="badge bg-warning">Pendente</span>';
                } else if (data === 'WAITING_APPROVAL') {
                    return '<span class="badge bg-info">Pendente Aprovação</span>';
                } else if (data === 'COMPLETED_ALERT') {
                    return '<span class="badge bg-success">Processado</span>';
                }
                return '<span class="badge bg-secondary">-</span>';
            }
        }
    ],
    endpoint: '/api/imager/exam-orders/ui/datatable',
    defaultOrder: [[0, 'desc']]
};

// ========================================
// FORMATTING FUNCTIONS (Step 1)
// ========================================

/**
 * Format CPF for display (Step 1 specific utility)
 * @param {string|number} cpf - CPF to format
 * @returns {string} Formatted CPF (XXX.XXX.XXX-XX)
 */
function step1_formatCPF(cpf) {
    if (!cpf) return '-';

    const cpfStr = String(cpf);
    const digitsOnly = cpfStr.replace(/\D/g, '');

    if (digitsOnly.length === 11) {
        return digitsOnly.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }

    return cpfStr;
}

/**
 * Format birth date for display (Step 1 specific utility)
 * @param {string} dateString - Date string in ISO format (YYYY-MM-DD)
 * @returns {string} Formatted date (DD/MM/YYYY)
 */
function step1_formatBirthDate(dateString) {
    if (!dateString) return '-';

    try {
        const parts = dateString.split('-');
        if (parts.length === 3) {
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]);
            const day = parseInt(parts[2]);

            if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                const dayStr = String(day).padStart(2, '0');
                const monthStr = String(month).padStart(2, '0');
                const yearStr = String(year);
                return `${dayStr}/${monthStr}/${yearStr}`;
            }
        }
    } catch (error) {
        console.warn('Error formatting birth date:', dateString, error);
    }

    return dateString;
}

/**
 * Format prescription date for display (Step 1 specific utility)
 * @param {string} data - Date string in ISO format
 * @returns {string} Formatted date (DD/MM/YY HH:MM)
 */
function step1_formatPrescriptionDate(data) {
    if (!data) return '-';

    try {
        const date = new Date(data);

        if (isNaN(date.getTime())) {
            return data;
        }

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = String(date.getFullYear()).slice(-2);
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch (error) {
        console.warn('Error formatting date:', data, error);
        return data || '-';
    }
}

// ========================================
// EXPORTS (window object)
// ========================================

// DataTable configuration
window.step1ColumnConfig = step1ColumnConfig;

// Formatting functions
window.step1_formatCPF = step1_formatCPF;
window.step1_formatBirthDate = step1_formatBirthDate;
window.step1_formatPrescriptionDate = step1_formatPrescriptionDate;

// ========================================
// MODULE LOADED CONFIRMATION
// ========================================
console.log('imager-order.js loaded successfully');
