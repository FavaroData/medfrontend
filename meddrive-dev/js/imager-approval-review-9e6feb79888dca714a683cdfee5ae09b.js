/**
 * Imager Approval Review Modal (Step 3 - PDF Review)
 *
 * Responsabilidades:
 * - Modal fullscreen de revisão de PDFs
 * - Navegação entre arquivos de um grupo de paciente
 * - Marcação de arquivos para aprovação em lote
 * - Zoom e visualização de PDF com PDF.js
 * - Real-time updates via SSE
 * - Confirmação e execução de aprovação em lote
 *
 * Convenção: Funções específicas do modal, sem prefixo step3_
 *
 * Dependencies:
 * - jQuery
 * - Bootstrap 5
 * - PDF.js (loaded dynamically)
 * - imager.js (for showNotification and imagerWorklistTable)
 */

// ========================================
// STATE (Step 3 PDF Review Modal - Private)
// ========================================

/**
 * State management for PDF review modal
 * @type {Object}
 * @private
 */
let pdfReviewState = {
    currentIndex: 0,
    files: [],
    markedForApproval: new Set(),
    parentInfo: {},
    pdfDoc: null,
    currentPage: 1,
    zoomLevel: 0.75,  // Default 75%, range 0.5 (50%) to 3.0 (300%)
    eventSource: null,  // SSE connection for real-time file updates
    abortController: null,  // AbortController for canceling pending requests
    panDragController: null,  // Pan/drag controller for updating cursor
    ignoreNextClick: false  // Flag to prevent click events immediately after drag
};

/**
 * PDF cache for loaded documents (improves performance and reliability)
 * Key: itemId, Value: PDFDocumentProxy
 * @type {Map<number, PDFDocumentProxy>}
 * @private
 */
const pdfCache = new Map();

// ========================================
// MODAL LIFECYCLE
// ========================================

/**
 * Open approval review modal for a parent group
 * @param {Object} groupData - The parent group data from the tree view
 */
function openApprovalReviewModal(groupData) {
    console.log('Opening approval review modal for group:', groupData);

    // Reset state
    pdfReviewState = {
        currentIndex: 0,
        files: groupData.files || [],
        markedForApproval: new Set(),
        parentInfo: {
            nmPaciente: groupData.nmPaciente,
            nrPrescricao: groupData.nrPrescricao,
            nrSeqPrescricao: groupData.nrSeqPrescricao,
            dsProcesso: groupData.dsProcesso,
            configId: groupData.configId
        },
        pdfDoc: null,
        currentPage: 1,
        zoomLevel: 0.75,
        abortController: null,
        ignoreNextClick: false
    };

    // Check if there are files to review
    if (pdfReviewState.files.length === 0) {
        showNotification('Nenhum arquivo encontrado para revisão', 'warning');
        return;
    }

    // Update modal title with patient name, prescription, and exam name
    const patientName = groupData.nmPaciente || 'Paciente desconhecido';
    const prescription = `${groupData.nrPrescricao || '?'}/${groupData.nrSeqPrescricao || '?'}`;
    const examName = groupData.dsProcesso || 'Exame não especificado';
    $('#reviewPatientName').text(`${patientName} - Prescrição: ${prescription} - Exame: ${examName}`);
    $('#reviewFileCount').text(pdfReviewState.files.length);
    $('#totalFilesCount').text(pdfReviewState.files.length);
    updateZoomDisplay();

    // Populate file list sidebar
    populateReviewFileList();

    // Load first PDF
    loadPdfAtIndex(0);

    // Setup event handlers
    setupReviewModalHandlers();

    // Subscribe to SSE for real-time file updates
    subscribeToFileUpdates();

    // Enable pan/drag functionality
    pdfReviewState.panDragController = enablePanDrag();

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('pdfReviewModal'));
    modal.show();
}

/**
 * Populate the file list sidebar with draggable cards
 */
function populateReviewFileList() {
    const fileList = $('#reviewFileList');
    fileList.empty();

    pdfReviewState.files.forEach((file, index) => {
        const isMarked = pdfReviewState.markedForApproval.has(file.id);
        const isActive = index === pdfReviewState.currentIndex;

        const fileCard = $(`
            <div class="file-card ${isActive ? 'active' : ''}"
                 data-file-index="${index}"
                 data-item-id="${file.id}">
                <div class="file-card-content">
                    <div class="drag-handle" title="Arrastar para reordenar">
                        <i class="fas fa-grip-vertical"></i>
                    </div>
                    <div class="file-info" title="${file.nmArquivo}">
                        <div class="file-name">${file.nmArquivo}</div>
                        <div class="file-meta">
                            <small class="text-muted">Arquivo ${index + 1}</small>
                        </div>
                    </div>
                    <div class="approval-indicator">
                        ${isMarked ? '<i class="fas fa-check-circle text-success" title="Marcado para aprovação"></i>' : ''}
                    </div>
                    <button type="button" class="btn-icon-only file-delete-btn" title="Excluir arquivo">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `);

        // Click handler for viewing file (use data-file-index instead of closure to handle reordering)
        fileCard.on('click', function(e) {
            // Don't trigger if dragging
            if ($(this).hasClass('sortable-chosen') || $(this).hasClass('sortable-drag')) {
                return;
            }

            // Ignore clicks immediately after drag end
            if (pdfReviewState.ignoreNextClick) {
                pdfReviewState.ignoreNextClick = false;
                return;
            }

            // Get current index from data attribute (updated after drag)
            const currentIndex = parseInt($(this).attr('data-file-index'));
            loadPdfAtIndex(currentIndex);
        });

        // Click handler for the delete button (stopPropagation: não abre o PDF)
        fileCard.find('.file-delete-btn').on('click', function(e) {
            e.stopPropagation();
            showDeleteReviewFileModal(file);
        });

        fileList.append(fileCard);
    });

    // Initialize drag-and-drop (function handles availability check internally)
    initializeFileDragDrop();
}

// ========================================
// DRAG & DROP FILE REORDERING
// ========================================

/**
 * Initialize Sortable.js for drag-and-drop file reordering
 */
let sortableInstance = null;

function initializeFileDragDrop() {
    // Check if Sortable is available
    if (typeof Sortable === 'undefined') {
        console.error('Sortable.js not loaded, drag-and-drop disabled');
        return;
    }

    const fileList = document.getElementById('reviewFileList');
    if (!fileList) {
        console.error('File list element (#reviewFileList) not found');
        return;
    }

    // Destroy existing instance if any
    if (sortableInstance) {
        try {
            sortableInstance.destroy();
        } catch (e) {
            console.warn('Error destroying previous Sortable instance:', e);
        }
        sortableInstance = null;
    }

    // Create new Sortable instance
    try {
        sortableInstance = Sortable.create(fileList, {
            animation: 150,
            handle: '.drag-handle',  // Only the grip icon is draggable
            draggable: '.file-card',
            ghostClass: 'sortable-ghost',
            dragClass: 'sortable-drag',
            chosenClass: 'sortable-chosen',
            forceFallback: false,
            fallbackOnBody: true,
            swapThreshold: 0.65,

            onEnd: function(evt) {
                // Only process if position actually changed
                if (evt.oldIndex === evt.newIndex) {
                    return;
                }

                // Set flag to ignore the click event that Sortable.js triggers after drag
                pdfReviewState.ignoreNextClick = true;

                // Clear flag after a short delay
                setTimeout(() => {
                    pdfReviewState.ignoreNextClick = false;
                }, 100);

                // Update internal state array
                const movedFile = pdfReviewState.files.splice(evt.oldIndex, 1)[0];
                pdfReviewState.files.splice(evt.newIndex, 0, movedFile);

                // Update currentIndex if affected
                if (pdfReviewState.currentIndex === evt.oldIndex) {
                    pdfReviewState.currentIndex = evt.newIndex;
                } else if (pdfReviewState.currentIndex > evt.oldIndex && pdfReviewState.currentIndex <= evt.newIndex) {
                    pdfReviewState.currentIndex--;
                } else if (pdfReviewState.currentIndex < evt.oldIndex && pdfReviewState.currentIndex >= evt.newIndex) {
                    pdfReviewState.currentIndex++;
                }

                // Update data-file-index attributes
                updateFileIndexes();

                // Save new order to backend (auto-save)
                saveFileOrder();
            }
        });
    } catch (e) {
        console.error('Error initializing Sortable:', e);
    }
}

/**
 * Update data-file-index attributes after reordering
 */
function updateFileIndexes() {
    $('#reviewFileList .file-card').each(function(index) {
        $(this).attr('data-file-index', index);

        // Update file counter in metadata
        $(this).find('.file-meta small').text(`Arquivo ${index + 1}`);
    });

    // Update current file indicator in header
    $('#currentFileIndex').text(pdfReviewState.currentIndex + 1);
}

/**
 * Save file order to backend via API
 */
function saveFileOrder() {
    // Build array of {itemId, displayOrder} objects
    const itemOrders = pdfReviewState.files.map((file, index) => ({
        itemId: file.id,
        displayOrder: index + 1  // 1-based ordering
    }));

    // Show loading indicator in file list
    const fileList = $('#reviewFileList');
    const originalOpacity = fileList.css('opacity');
    fileList.css('opacity', '0.6');

    // Call API
    $.ajax({
        url: '/api/imager/processing-exams/items/reorder',
        type: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify(itemOrders),
        success: function(response) {
            console.log('File order saved successfully:', response);
            fileList.css('opacity', originalOpacity);
        },
        error: function(xhr, status, error) {
            console.error('Error saving file order:', error);
            fileList.css('opacity', originalOpacity);

            showAlert('Erro ao salvar ordem dos arquivos: ' +
                     (xhr.responseJSON?.message || error), 'danger');
        }
    });
}

// ========================================
// PDF LOADING & RENDERING
// ========================================

/**
 * Load PDF at specific index
 * @param {number} index - Index of file in files array
 */
function loadPdfAtIndex(index) {
    if (index < 0 || index >= pdfReviewState.files.length) {
        return;
    }

    pdfReviewState.currentIndex = index;
    const file = pdfReviewState.files[index];

    // Update UI
    $('#currentFileIndex').text(index + 1);
    updateMarkedCount();
    updateApprovalButtonState();
    updateNavigationButtons();

    // Update file list active state
    $('#reviewFileList .file-card').removeClass('active');
    $(`#reviewFileList .file-card[data-file-index="${index}"]`).addClass('active');

    // Load PDF
    loadPdfInViewer(file.id);
}

/**
 * Ensure PDF.js is loaded
 */
function ensurePdfJsLoaded() {
    return new Promise((resolve, reject) => {
        // Check if already loaded
        if (typeof pdfjsLib !== 'undefined') {
            resolve();
            return;
        }

        // Load PDF.js dynamically from local vendor folder
        const script = document.createElement('script');
        script.src = '/vendor/pdfjs/pdf.min.js';
        script.onload = () => {
            // Configure worker (local)
            pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js';
            resolve();
        };
        script.onerror = () => reject(new Error('Falha ao carregar PDF.js local'));
        document.head.appendChild(script);
    });
}

/**
 * Load PDF in viewer using PDF.js with retry logic, timeout, and caching
 * @param {number} itemId - The item ID to load
 * @param {number} retries - Number of retry attempts (default: 3)
 */
function loadPdfInViewer(itemId, retries = 3) {
    const canvas = document.getElementById('pdfCanvas');
    const container = $('#pdfViewerContainer');

    // Show loading indicator
    container.html('<div class="text-center"><i class="fas fa-spinner fa-spin fa-3x mb-3"></i><p class="mt-3">Carregando PDF...</p></div>');

    // Cancel any pending request
    if (pdfReviewState.abortController) {
        pdfReviewState.abortController.abort();
        console.log('Cancelled previous PDF request');
    }

    // Check cache first
    if (pdfCache.has(itemId)) {
        console.log('Using cached PDF for item:', itemId);
        const cachedPdf = pdfCache.get(itemId);
        pdfReviewState.pdfDoc = cachedPdf;
        pdfReviewState.currentPage = 1;

        // Clear container
        container.html('');

        // Render all pages from cache
        renderAllPdfPages();
        return;
    }

    // Create new AbortController for this request
    pdfReviewState.abortController = new AbortController();
    const signal = pdfReviewState.abortController.signal;

    // Fetch PDF via API endpoint
    const pdfUrl = `/api/imager/processing-exams/items/${itemId}/view`;
    const timeout = 30000; // 30 seconds timeout

    // Ensure PDF.js is loaded first
    ensurePdfJsLoaded()
        .then(() => {
            // Fetch with timeout
            return Promise.race([
                fetch(pdfUrl, { signal }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout: servidor demorou muito para responder')), timeout)
                )
            ]);
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.arrayBuffer();
        })
        .then(arrayBuffer => {
            // Load PDF using PDF.js
            return pdfjsLib.getDocument({data: arrayBuffer}).promise;
        })
        .then(pdfDoc => {
            // Add to cache
            pdfCache.set(itemId, pdfDoc);
            console.log('PDF cached for item:', itemId);

            pdfReviewState.pdfDoc = pdfDoc;
            pdfReviewState.currentPage = 1;

            // Clear container
            container.html('');

            // Render all pages
            return renderAllPdfPages();
        })
        .catch(error => {
            console.error('Error loading PDF:', error);

            // Don't retry if request was aborted
            if (error.name === 'AbortError') {
                console.log('Request was aborted');
                return;
            }

            // Retry logic
            if (retries > 0) {
                console.log(`Retrying... (${retries} attempts left)`);
                container.html(`<div class="text-center"><i class="fas fa-spinner fa-spin fa-3x mb-3"></i><p class="mt-3">Tentando novamente... (${retries} tentativa(s) restante(s))</p></div>`);
                setTimeout(() => loadPdfInViewer(itemId, retries - 1), 1500);
            } else {
                // Show user-friendly error with retry button
                container.html(`
                    <div class="text-center">
                        <i class="fas fa-exclamation-triangle fa-3x mb-3 text-warning"></i>
                        <p class="mb-2 fs-5">Erro ao carregar PDF</p>
                        <p class="small text-muted">${error.message}</p>
                        <button class="btn btn-primary btn-sm mt-3" onclick="loadPdfInViewer(${itemId})">
                            <i class="fas fa-redo"></i> Tentar Novamente
                        </button>
                    </div>
                `);
            }
        });
}

/**
 * Render specific page of PDF with canvas validation
 */
function renderPdfPage(pageNumber) {
    const canvas = document.getElementById('pdfCanvas');

    // Critical validation: ensure canvas exists and is valid
    if (!canvas) {
        console.error('Canvas element not found');
        return Promise.reject(new Error('Canvas element não encontrado'));
    }

    // Validate canvas context
    const context = canvas.getContext('2d');
    if (!context) {
        console.error('Failed to get canvas 2D context');
        return Promise.reject(new Error('Erro ao obter contexto do canvas'));
    }

    // Validate PDF document
    if (!pdfReviewState.pdfDoc) {
        console.error('PDF document not loaded');
        return Promise.reject(new Error('Documento PDF não carregado'));
    }

    return pdfReviewState.pdfDoc.getPage(pageNumber).then(page => {
        // Calculate scale to fit viewer
        const container = $('#pdfViewerContainer');
        const containerWidth = container.width() - 40; // 20px padding on each side
        const viewport = page.getViewport({scale: 1.0});
        const baseScale = containerWidth / viewport.width;

        // Apply zoom level
        const finalScale = baseScale * pdfReviewState.zoomLevel;
        const scaledViewport = page.getViewport({scale: finalScale});

        // Set canvas dimensions
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        // Render PDF page
        const renderContext = {
            canvasContext: context,
            viewport: scaledViewport
        };

        return page.render(renderContext).promise;
    }).catch(error => {
        console.error('Error rendering PDF page:', error);
        throw error;
    });
}

/**
 * Render all pages of PDF vertically
 */
function renderAllPdfPages() {
    // Validate PDF document
    if (!pdfReviewState.pdfDoc) {
        console.error('PDF document not loaded');
        return Promise.reject(new Error('Documento PDF não carregado'));
    }

    const container = $('#pdfViewerContainer');
    const numPages = pdfReviewState.pdfDoc.numPages;

    console.log(`Rendering ${numPages} page(s)`);

    // Clear container
    container.html('');

    // Create a wrapper div for all canvases
    // Note: Using width: 100% to fill container. Each canvas is wrapped in its own centering div.
    // This allows proper horizontal scrolling when canvas is larger than container (zoom > 100%)
    const pagesWrapper = $('<div class="pdf-pages-wrapper" style="display: flex; flex-direction: column; gap: 20px; width: 100%;"></div>');
    container.append(pagesWrapper);

    // Render each page sequentially
    const renderPromises = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const promise = pdfReviewState.pdfDoc.getPage(pageNum).then(page => {
            // Create canvas for this page
            const canvas = document.createElement('canvas');
            canvas.id = `pdfCanvas-page-${pageNum}`;
            canvas.className = 'pdf-page-canvas';

            const context = canvas.getContext('2d');
            if (!context) {
                console.error(`Failed to get canvas context for page ${pageNum}`);
                return;
            }

            // Calculate scale to fit viewer
            const containerWidth = container.width() - 40; // 20px padding on each side
            const viewport = page.getViewport({scale: 1.0});
            const baseScale = containerWidth / viewport.width;

            // Apply zoom level
            const finalScale = baseScale * pdfReviewState.zoomLevel;
            const scaledViewport = page.getViewport({scale: finalScale});

            // Set canvas dimensions
            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;

            // Add canvas to wrapper
            // Canvas will be centered via margin: 0 auto when smaller than container
            // When larger, it starts from left edge allowing proper horizontal scroll
            const canvasWrapper = $('<div style="width: fit-content; margin: 0 auto;"></div>');
            canvasWrapper.append(canvas);
            pagesWrapper.append(canvasWrapper);

            // Render PDF page
            const renderContext = {
                canvasContext: context,
                viewport: scaledViewport
            };

            return page.render(renderContext).promise;
        }).catch(error => {
            console.error(`Error rendering page ${pageNum}:`, error);
        });

        renderPromises.push(promise);
    }

    // Wait for all pages to render
    return Promise.all(renderPromises).then(() => {
        console.log('All pages rendered successfully');

        // Update pan/drag cursor based on scrollability
        if (pdfReviewState.panDragController && pdfReviewState.panDragController.updateCursor) {
            pdfReviewState.panDragController.updateCursor();
        }
    });
}

// ========================================
// ZOOM CONTROLS
// ========================================

/**
 * Zoom in (increase zoom by 25%)
 */
function zoomIn() {
    const container = document.getElementById('pdfViewerContainer');
    const oldZoom = pdfReviewState.zoomLevel;
    const newZoom = Math.min(pdfReviewState.zoomLevel + 0.25, 3.0); // Max 300%

    pdfReviewState.zoomLevel = newZoom;
    updateZoomDisplay();
    renderAllPdfPages().then(() => {
        maintainZoomCenter(container, oldZoom, newZoom);
    });
}

/**
 * Zoom out (decrease zoom by 25%)
 */
function zoomOut() {
    const container = document.getElementById('pdfViewerContainer');
    const oldZoom = pdfReviewState.zoomLevel;
    const newZoom = Math.max(pdfReviewState.zoomLevel - 0.25, 0.5); // Min 50%

    pdfReviewState.zoomLevel = newZoom;
    updateZoomDisplay();
    renderAllPdfPages().then(() => {
        maintainZoomCenter(container, oldZoom, newZoom);
    });
}

/**
 * Reset zoom to 100%
 */
function zoomReset() {
    const container = document.getElementById('pdfViewerContainer');
    const oldZoom = pdfReviewState.zoomLevel;
    const newZoom = 1.0;

    pdfReviewState.zoomLevel = newZoom;
    updateZoomDisplay();
    renderAllPdfPages().then(() => {
        maintainZoomCenter(container, oldZoom, newZoom);
    });
}

/**
 * Maintain center position when zooming
 * @param {HTMLElement} container - The scroll container
 * @param {number} oldZoom - Previous zoom level
 * @param {number} newZoom - New zoom level
 */
function maintainZoomCenter(container, oldZoom, newZoom) {
    if (!container) return;

    // Calculate zoom ratio
    const zoomRatio = newZoom / oldZoom;

    // Get current scroll position (center of viewport)
    const scrollLeft = container.scrollLeft + container.clientWidth / 2;
    const scrollTop = container.scrollTop + container.clientHeight / 2;

    // Apply zoom ratio to scroll position
    const newScrollLeft = scrollLeft * zoomRatio - container.clientWidth / 2;
    const newScrollTop = scrollTop * zoomRatio - container.clientHeight / 2;

    // Set new scroll position (centered)
    container.scrollLeft = newScrollLeft;
    container.scrollTop = newScrollTop;
}

/**
 * Update zoom percentage display
 */
function updateZoomDisplay() {
    const percentage = Math.round(pdfReviewState.zoomLevel * 100);
    $('#zoomPercentage').text(percentage + '%');
}

// ========================================
// PDF ROTATION
// ========================================

/**
 * Rotate current PDF 90° clockwise and save to disk immediately.
 * Calls backend endpoint that modifies the original file using PDFBox.
 */
function rotatePdf() {
    const currentFile = pdfReviewState.files[pdfReviewState.currentIndex];
    if (!currentFile || !currentFile.id) {
        showNotification('Nenhum arquivo selecionado para rotacionar', 'warning');
        return;
    }

    const itemId = currentFile.id;
    const btn = $('#btnRotatePdf');

    // Disable button and show spinner during rotation
    btn.prop('disabled', true);
    btn.html('<i class="fas fa-spinner fa-spin fa-lg"></i>');

    fetch(`/api/imager/processing-exams/items/${itemId}/rotate`, {
        method: 'POST'
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.message || 'Erro ao rotacionar PDF');
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // Clear cache for this item so it reloads the rotated version
            pdfCache.delete(itemId);

            // Reload the PDF to show the rotated version
            loadPdfInViewer(itemId);
        } else {
            showNotification(data.message || 'Erro ao rotacionar PDF', 'danger');
        }
    })
    .catch(error => {
        console.error('Error rotating PDF:', error);
        showNotification('Erro ao rotacionar PDF: ' + error.message, 'danger');
    })
    .finally(() => {
        // Restore button
        btn.prop('disabled', false);
        btn.html('<i class="fas fa-redo fa-lg"></i>');
    });
}

// ========================================
// PAN/DRAG FUNCTIONALITY
// ========================================

/**
 * Enable pan/drag functionality for PDF viewer
 * Allows users to drag the document with mouse
 */
function enablePanDrag() {
    const container = document.getElementById('pdfViewerContainer');
    if (!container) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;

    // Set initial cursor
    container.style.cursor = 'grab';

    // Mouse down - start dragging
    container.addEventListener('mousedown', function(e) {
        // Only drag with left mouse button
        if (e.button !== 0) return;

        // Don't interfere with text selection or other interactions
        // Only enable dragging when content overflows (is scrollable)
        const isScrollable = container.scrollWidth > container.clientWidth ||
                           container.scrollHeight > container.clientHeight;

        if (!isScrollable) return;

        isDragging = true;
        startX = e.pageX - container.offsetLeft;
        startY = e.pageY - container.offsetTop;
        scrollLeft = container.scrollLeft;
        scrollTop = container.scrollTop;

        container.style.cursor = 'grabbing';
        container.style.userSelect = 'none'; // Prevent text selection while dragging

        e.preventDefault();
    });

    // Mouse move - perform drag
    container.addEventListener('mousemove', function(e) {
        if (!isDragging) return;

        e.preventDefault();

        const x = e.pageX - container.offsetLeft;
        const y = e.pageY - container.offsetTop;

        const walkX = (x - startX) * 1.5; // Multiply for faster scroll (adjust sensitivity)
        const walkY = (y - startY) * 1.5;

        container.scrollLeft = scrollLeft - walkX;
        container.scrollTop = scrollTop - walkY;
    });

    // Mouse up - stop dragging
    const stopDragging = function() {
        if (isDragging) {
            isDragging = false;
            container.style.cursor = 'grab';
            container.style.userSelect = ''; // Re-enable text selection
        }
    };

    container.addEventListener('mouseup', stopDragging);
    container.addEventListener('mouseleave', stopDragging);

    // Update cursor based on scrollability when content changes
    const updateCursor = function() {
        const isScrollable = container.scrollWidth > container.clientWidth ||
                           container.scrollHeight > container.clientHeight;
        container.style.cursor = isScrollable ? 'grab' : 'default';
    };

    // Return cleanup function and update function
    return { updateCursor };
}

// ========================================
// APPROVAL MARKING
// ========================================

/**
 * Mark/unmark current file for approval
 */
function toggleFileApproval() {
    const currentFile = pdfReviewState.files[pdfReviewState.currentIndex];
    if (!currentFile) {
        return;
    }

    if (pdfReviewState.markedForApproval.has(currentFile.id)) {
        // Unmark
        pdfReviewState.markedForApproval.delete(currentFile.id);
    } else {
        // Mark
        pdfReviewState.markedForApproval.add(currentFile.id);
    }

    // Update UI
    updateMarkedCount();
    updateApprovalButtonState();
    populateReviewFileList();
}

/**
 * Update marked for approval count badge
 */
function updateMarkedCount() {
    $('#markedForApprovalCount').text(pdfReviewState.markedForApproval.size + ' marcados');
}

/**
 * Update approval button state (show mark or unmark)
 */
function updateApprovalButtonState() {
    const currentFile = pdfReviewState.files[pdfReviewState.currentIndex];
    if (!currentFile) {
        $('#btnMarkForApproval').addClass('d-none');
        $('#btnUnmarkForApproval').addClass('d-none');
        return;
    }
    const isMarked = pdfReviewState.markedForApproval.has(currentFile.id);

    if (isMarked) {
        $('#btnMarkForApproval').addClass('d-none');
        $('#btnUnmarkForApproval').removeClass('d-none');
    } else {
        $('#btnMarkForApproval').removeClass('d-none');
        $('#btnUnmarkForApproval').addClass('d-none');
    }
}

/**
 * Update navigation button states
 */
function updateNavigationButtons() {
    $('#btnPreviousFile').prop('disabled', pdfReviewState.currentIndex === 0);
    $('#btnNextFile').prop('disabled', pdfReviewState.currentIndex === pdfReviewState.files.length - 1);
}

// ========================================
// NAVIGATION
// ========================================

/**
 * Navigate to previous file
 */
function navigateToPreviousFile() {
    if (pdfReviewState.currentIndex > 0) {
        loadPdfAtIndex(pdfReviewState.currentIndex - 1);
    }
}

/**
 * Navigate to next file
 */
function navigateToNextFile() {
    if (pdfReviewState.currentIndex < pdfReviewState.files.length - 1) {
        loadPdfAtIndex(pdfReviewState.currentIndex + 1);
    }
}

/**
 * Finish review and show confirmation modal
 */
function finishReview() {
    if (pdfReviewState.markedForApproval.size === 0) {
        showNotification('Nenhum arquivo marcado para aprovação', 'warning');
        return;
    }

    // Build confirmation list
    const confirmList = $('#confirmApprovalList');
    confirmList.empty();

    pdfReviewState.files.forEach(file => {
        if (pdfReviewState.markedForApproval.has(file.id)) {
            confirmList.append(`<li><i class="fas fa-check-circle text-success me-2"></i>${file.nmArquivo}</li>`);
        }
    });

    $('#confirmApprovalCount').text(pdfReviewState.markedForApproval.size);

    // Show confirmation modal
    const confirmModal = new bootstrap.Modal(document.getElementById('approvalConfirmationModal'));
    confirmModal.show();
}

/**
 * Subscribe to SSE for real-time file updates
 */
function subscribeToFileUpdates() {
    const { configId, nrPrescricao, nrSeqPrescricao } = pdfReviewState.parentInfo;

    // Build SSE endpoint URL
    const sseUrl = `/api/imager/review-events/subscribe?nrPrescricao=${encodeURIComponent(nrPrescricao)}&nrSeqPrescricao=${encodeURIComponent(nrSeqPrescricao)}&configId=${configId}`;

    console.log('Subscribing to SSE for file updates:', sseUrl);

    try {
        // Create EventSource connection
        const eventSource = new EventSource(sseUrl);

        // Connection established
        eventSource.addEventListener('connected', function(event) {
            console.log('SSE connected:', event.data);
        });

        // New file added event
        eventSource.addEventListener('fileAdded', function(event) {
            console.log('SSE: New file added event received:', event.data);
            const newFile = JSON.parse(event.data);
            handleNewFileAdded(newFile);
        });

        // Error handling
        eventSource.onerror = function(error) {
            console.error('SSE connection error:', error);
            // EventSource will automatically try to reconnect
        };

        // Store reference for cleanup
        pdfReviewState.eventSource = eventSource;

    } catch (error) {
        console.error('Failed to establish SSE connection:', error);
    }
}

/**
 * Show a notification in the modal alerts container
 * Matches the styling of the main showNotification() function
 * @param {string} message - The message to display
 */
function showCompactToast(message) {
    const alertsContainer = $('#modalAlertsContainer');
    if (!alertsContainer.length) {
        console.error('Modal alerts container not found. Cannot display notification:', message);
        return;
    }

    const alertId = 'modal-notification-' + Date.now();
    const alertHtml = `
        <div id="${alertId}" class="alert alert-info alert-dismissible fade show" role="alert">
            <i class="fas fa-file-pdf me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;

    alertsContainer.append(alertHtml);

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
        const alert = $('#' + alertId);
        alert.fadeOut(300, function() {
            $(this).remove();
        });
    }, 4000);
}

/**
 * Handle new file added via SSE notification
 */
function handleNewFileAdded(newFile) {
    console.log('Handling new file:', newFile);

    // Check if file already exists (by ID)
    const existingFile = pdfReviewState.files.find(f => f.id === newFile.id);
    if (existingFile) {
        console.log('File already exists in list, skipping:', newFile.id);
        return;
    }

    // Fetch updated file list from server to get complete data
    const { configId, nrPrescricao, nrSeqPrescricao } = pdfReviewState.parentInfo;

    fetch(`/api/imager/processing-exams/groups/files?nrPrescricao=${encodeURIComponent(nrPrescricao)}&nrSeqPrescricao=${encodeURIComponent(nrSeqPrescricao)}&configId=${configId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Find new files (files not in current list)
                const currentIds = new Set(pdfReviewState.files.map(f => f.id));
                const newFiles = data.files.filter(f => !currentIds.has(f.id));

                if (newFiles.length > 0) {
                    // Append new files to end (they're already ordered by date)
                    pdfReviewState.files.push(...newFiles);

                    // Update UI
                    $('#reviewFileCount').text(pdfReviewState.files.length);
                    $('#totalFilesCount').text(pdfReviewState.files.length);

                    // Refresh file list sidebar
                    populateReviewFileList();

                    // Show compact toast notification
                    const message = newFiles.length === 1
                        ? `Novo arquivo adicionado`
                        : `${newFiles.length} novos arquivos adicionados`;
                    showCompactToast(message);

                    console.log(`Added ${newFiles.length} new file(s) to review list`);
                }
            }
        })
        .catch(error => {
            console.error('Error fetching updated file list:', error);
        });
}

// ========================================
// BATCH APPROVAL EXECUTION
// ========================================

/**
 * Confirm and execute batch approval
 */
function confirmBatchApproval() {
    const itemIds = Array.from(pdfReviewState.markedForApproval);

    // Disable button and show loading
    const confirmBtn = $('#btnConfirmApprovals');
    confirmBtn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Processando...');

    // Call API to approve items
    fetch('/api/imager/processing-exams/approve-files', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(itemIds)
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            showNotification(`${result.approvedCount} arquivo(s) aprovado(s) com sucesso!`, 'success');

            // Close modals
            bootstrap.Modal.getInstance(document.getElementById('approvalConfirmationModal')).hide();
            bootstrap.Modal.getInstance(document.getElementById('pdfReviewModal')).hide();
        } else {
            showNotification('Erro ao aprovar arquivos: ' + (result.message || 'Erro desconhecido'), 'error');
        }
    })
    .catch(error => {
        console.error('Error approving files:', error);
        showNotification('Erro ao processar aprovação: ' + error.message, 'error');
    })
    .finally(() => {
        confirmBtn.prop('disabled', false).html('<i class="fas fa-check-circle"></i> Confirmar Aprovação');
    });
}

// ========================================
// EVENT HANDLERS & SETUP
// ========================================

/**
 * Setup event handlers for review modal
 */
function setupReviewModalHandlers() {
    // Remove existing handlers to prevent duplicates
    $('#btnPreviousFile').off('click');
    $('#btnNextFile').off('click');
    $('#btnMarkForApproval').off('click');
    $('#btnUnmarkForApproval').off('click');
    $('#btnFinishReview').off('click');
    $('#btnConfirmApprovals').off('click');
    $('#btnZoomIn').off('click');
    $('#btnZoomOut').off('click');
    $('#btnZoomReset').off('click');
    $('#btnRotatePdf').off('click');

    // Navigation handlers
    $('#btnPreviousFile').on('click', navigateToPreviousFile);
    $('#btnNextFile').on('click', navigateToNextFile);

    // Zoom handlers
    $('#btnZoomIn').on('click', zoomIn);
    $('#btnZoomOut').on('click', zoomOut);
    $('#btnZoomReset').on('click', zoomReset);

    // Rotate handler
    $('#btnRotatePdf').on('click', rotatePdf);

    // Approval handlers
    $('#btnMarkForApproval').on('click', function() {
        toggleFileApproval();
        // Auto-advance to next file after marking
        setTimeout(() => {
            if (pdfReviewState.currentIndex < pdfReviewState.files.length - 1) {
                navigateToNextFile();
            }
        }, 300);
    });

    $('#btnUnmarkForApproval').on('click', toggleFileApproval);
    $('#btnFinishReview').on('click', finishReview);
    $('#btnConfirmApprovals').on('click', confirmBatchApproval);

    // Keyboard shortcuts
    $(document).off('keydown.pdfReview'); // Remove existing handler
    $(document).on('keydown.pdfReview', function(e) {
        // Only handle if modal is open
        if (!$('#pdfReviewModal').hasClass('show')) {
            return;
        }

        switch(e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                navigateToPreviousFile();
                break;
            case 'ArrowRight':
                e.preventDefault();
                navigateToNextFile();
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                toggleFileApproval();
                break;
        }
    });

    // Cleanup keyboard handler when modal is closed
    $('#pdfReviewModal').on('hidden.bs.modal', function() {
        $(document).off('keydown.pdfReview');

        // Close SSE connection
        if (pdfReviewState.eventSource) {
            console.log('Closing SSE connection');
            pdfReviewState.eventSource.close();
            pdfReviewState.eventSource = null;
        }

        // Abort any pending PDF requests
        if (pdfReviewState.abortController) {
            pdfReviewState.abortController.abort();
            pdfReviewState.abortController = null;
            console.log('Aborted pending PDF request on modal close');
        }

        // Clear PDF cache to free memory
        pdfCache.clear();
        console.log('PDF cache cleared');
    });
}

// ========================================
// FILE DELETION (within review modal)
// ========================================

/**
 * Show the delete-file confirmation modal, stacked over the review modal.
 * @param {Object} file - The file object from pdfReviewState.files
 */
function showDeleteReviewFileModal(file) {
    const modalHtml = `
        <div class="modal fade" id="deleteReviewFileModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Confirmar Exclusão</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <p>Tem certeza que deseja excluir o arquivo <strong>${file.nmArquivo}</strong>?</p>
                        <div class="form-check mt-3">
                            <input class="form-check-input" type="checkbox" id="returnToQueueReviewCheckbox" checked>
                            <label class="form-check-label text-success" for="returnToQueueReviewCheckbox">
                                <strong>Retornar o arquivo para fila de processamento?</strong>
                                <br><small class="text-muted">🔄 Se marcado: o arquivo volta para a fila e NÃO será casado novamente com este exame | Se desmarcado: o arquivo será descartado (lixeira)</small>
                            </label>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-danger" onclick="confirmDeleteReviewFile(${file.id})">Excluir Arquivo</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const existing = document.getElementById('deleteReviewFileModal');
    if (existing) {
        existing.remove();
    }

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = new bootstrap.Modal(document.getElementById('deleteReviewFileModal'));
    modal.show();

    document.getElementById('deleteReviewFileModal').addEventListener('hidden.bs.modal', function () {
        this.remove();
    });
}

/**
 * Confirm deletion: read the checkbox, close the modal and run the deletion.
 * @param {number} itemId
 */
function confirmDeleteReviewFile(itemId) {
    const checkbox = document.getElementById('returnToQueueReviewCheckbox');
    const returnToQueue = checkbox ? checkbox.checked : false;
    // Marcado = devolver à fila (deleteFile=false); desmarcado = lixeira (deleteFile=true)
    const deleteFile = !returnToQueue;

    const modal = bootstrap.Modal.getInstance(document.getElementById('deleteReviewFileModal'));
    if (modal) {
        modal.hide();
    }

    deleteReviewFile(itemId, deleteFile);
}

/**
 * Delete a file from the review modal and update pdfReviewState in place.
 * @param {number} itemId
 * @param {boolean} deleteFile - true = lixeira; false = devolver à fila
 */
function deleteReviewFile(itemId, deleteFile) {
    const url = deleteFile
        ? `/api/imager/processing-exams/items/${itemId}?deleteFile=true`
        : `/api/imager/processing-exams/items/${itemId}`;

    fetch(url, { method: 'DELETE' })
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => {
                    throw new Error(data.message || 'Falha ao excluir o arquivo');
                });
            }
            return response.json();
        })
        .then(data => {
            const deletedIndex = pdfReviewState.files.findIndex(f => f.id === itemId);
            if (deletedIndex === -1) {
                return;
            }

            // Remove from state
            pdfReviewState.files.splice(deletedIndex, 1);
            pdfReviewState.markedForApproval.delete(itemId);
            pdfCache.delete(itemId);

            // Update counters
            $('#reviewFileCount').text(pdfReviewState.files.length);
            $('#totalFilesCount').text(pdfReviewState.files.length);

            if (pdfReviewState.files.length === 0) {
                // Empty state — modal stays open
                pdfReviewState.currentIndex = 0;
                $('#reviewFileList').html('<div class="text-center text-muted p-3">Nenhum arquivo</div>');
                $('#pdfViewerContainer').html('<div class="text-center text-muted p-5"><i class="fas fa-folder-open fa-3x mb-3"></i><p>Nenhum arquivo para revisar</p></div>');
                $('#currentFileIndex').text(0);
                updateMarkedCount();
                updateApprovalButtonState();
                showCompactToast(data.message || 'Arquivo excluído');
                return;
            }

            // Adjust currentIndex
            let newIndex = pdfReviewState.currentIndex;
            if (deletedIndex < pdfReviewState.currentIndex) {
                newIndex = pdfReviewState.currentIndex - 1;
            } else if (deletedIndex === pdfReviewState.currentIndex) {
                newIndex = Math.min(pdfReviewState.currentIndex, pdfReviewState.files.length - 1);
            }
            pdfReviewState.currentIndex = newIndex;

            populateReviewFileList();
            updateMarkedCount();
            loadPdfAtIndex(newIndex);
            showCompactToast(data.message || 'Arquivo excluído');
        })
        .catch(error => {
            console.error('Error deleting review file:', error);
            showNotification('Erro ao excluir arquivo: ' + error.message, 'error');
        });
}

// ========================================
// EXPORTS (window object)
// ========================================

// Modal lifecycle
window.openApprovalReviewModal = openApprovalReviewModal;

// PDF loading (used by real-time updates)
window.loadPdfInViewer = loadPdfInViewer;

// File deletion (confirmDeleteReviewFile is invoked via inline onclick)
window.confirmDeleteReviewFile = confirmDeleteReviewFile;

// ========================================
// MODULE LOADED CONFIRMATION
// ========================================
console.log('imager-approval-review.js loaded successfully');
