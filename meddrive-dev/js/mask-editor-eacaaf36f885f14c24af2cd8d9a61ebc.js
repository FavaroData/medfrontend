/**
 * Mask Editor for OCR Region Configuration
 * Allows users to draw rectangular regions on a PDF sample to define OCR whitelist masks
 */

// ==================== Global State ====================
var currentMasks = []; // Array of mask objects: [{x, y, width, height}, ...]
var currentProfileId = null; // ID of the profile being edited
var maskEditorRepositoryId = null; // ID of the repository (for reloading after save)
var pdfDoc = null; // PDF.js document object
var pdfPage = null; // Current PDF page
var pdfCanvas = null; // Canvas for PDF rendering
var maskCanvas = null; // Canvas overlay for mask drawing
var isDrawing = false; // Drawing state flag
var startX = 0, startY = 0; // Drawing start coordinates
var canvasScale = 1; // Scale factor for canvas rendering
var canvasInitialized = false; // Flag to prevent duplicate event listeners

// Resize state
var isResizing = false; // Resizing state flag
var resizingMaskIndex = -1; // Index of mask being resized
var resizeEdge = null; // Which edge is being resized: 'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'
var resizeStartMask = null; // Original mask state before resize
var RESIZE_HANDLE_SIZE = 8; // Size of resize handle detection area (pixels)

// ==================== Modal Control ====================

/**
 * Open mask editor modal for editing profile
 */
function openMaskEditorForProfile() {
    // Get current profile ID and repository ID from profile modal
    currentProfileId = $('#profileModal').data('profile-id');

    // Try to get repository ID from profile data or from global scope
    const profile = $('#profileModal').data('profile');
    if (profile && profile.repositoryId) {
        maskEditorRepositoryId = profile.repositoryId;
    } else if (window.currentRepositoryId) {
        maskEditorRepositoryId = window.currentRepositoryId;
    }

    // Load existing masks if any
    if (profile && profile.ocrMasks) {
        try {
            currentMasks = JSON.parse(profile.ocrMasks);
        } catch (e) {
            console.error('Failed to parse existing masks:', e);
            currentMasks = [];
        }
    } else {
        currentMasks = [];
    }

    resetMaskEditor();
    updateMaskList();
    $('#maskEditorModal').modal('show');
}

/**
 * Reset mask editor to initial state
 */
function resetMaskEditor() {
    // Clear PDF
    pdfDoc = null;
    pdfPage = null;

    // Reset canvases (only if they exist)
    pdfCanvas = document.getElementById('pdfCanvas');
    maskCanvas = document.getElementById('maskCanvas');

    if (pdfCanvas && maskCanvas) {
        const pdfCtx = pdfCanvas.getContext('2d');
        const maskCtx = maskCanvas.getContext('2d');
        pdfCtx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
        maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    }

    // Hide/show elements (with null checks)
    const pdfContainer = document.getElementById('pdfCanvasContainer');
    const drawingControls = document.getElementById('drawingControls');
    const pdfInstructions = document.getElementById('pdfInstructions');
    const pdfFileInput = document.getElementById('pdfFileInput');

    if (pdfContainer) pdfContainer.classList.add('d-none');
    if (drawingControls) drawingControls.classList.add('d-none');
    if (pdfInstructions) pdfInstructions.classList.remove('d-none');
    if (pdfFileInput) pdfFileInput.value = '';

    // Reset drawing state
    isDrawing = false;
    startX = 0;
    startY = 0;

    // Update UI
    updateMaskList();
}

/**
 * Cancel mask editing and close modal
 */
function cancelMaskEditing() {
    if (currentMasks.length > 0) {
        if (!confirm('Descartar alterações nas máscaras?')) {
            return false;
        }
    }
    resetMaskEditor();
    currentMasks = [];
    maskEditorRepositoryId = null;
    return true;
}

// ==================== PDF Loading and Rendering ====================

/**
 * Load PDF file from file input
 */
async function loadPdfForMasking(event) {
    const file = event.target.files[0];
    if (!file || file.type !== 'application/pdf') {
        alert('Por favor, selecione um arquivo PDF válido.');
        return;
    }

    try {
        // Get elements with null checks
        const drawingStatus = document.getElementById('drawingStatus');
        const pdfCanvasContainer = document.getElementById('pdfCanvasContainer');
        const drawingControls = document.getElementById('drawingControls');
        const pdfInstructions = document.getElementById('pdfInstructions');

        // Show loading indicator
        if (drawingStatus) {
            drawingStatus.textContent = 'Carregando PDF...';
            drawingStatus.className = 'badge bg-warning';
        }

        // Read file as array buffer
        const arrayBuffer = await file.arrayBuffer();

        // Load PDF with PDF.js
        const loadingTask = pdfjsLib.getDocument({data: arrayBuffer});
        pdfDoc = await loadingTask.promise;

        // Get canvas elements (must be done before rendering)
        pdfCanvas = document.getElementById('pdfCanvas');
        maskCanvas = document.getElementById('maskCanvas');

        if (!pdfCanvas || !maskCanvas) {
            throw new Error('Canvas elements not found');
        }

        // Render first page
        pdfPage = await pdfDoc.getPage(1);
        renderPdfPage();

        // Show canvas and controls
        if (pdfCanvasContainer) pdfCanvasContainer.classList.remove('d-none');
        if (drawingControls) drawingControls.classList.remove('d-none');
        if (pdfInstructions) pdfInstructions.classList.add('d-none');
        if (drawingStatus) {
            drawingStatus.textContent = 'PDF carregado - Clique e arraste para desenhar';
            drawingStatus.className = 'badge bg-success';
        }

        // Initialize canvas drawing (must be done after canvas is visible)
        // Reset the flag to allow re-initialization with new canvas
        canvasInitialized = false;
        initializeCanvasDrawing();

        // Redraw existing masks
        redrawAllMasks();

    } catch (error) {
        console.error('Error loading PDF:', error);
        alert('Erro ao carregar PDF: ' + error.message);
        const drawingStatus = document.getElementById('drawingStatus');
        if (drawingStatus) {
            drawingStatus.textContent = 'Erro ao carregar';
            drawingStatus.className = 'badge bg-danger';
        }
    }
}

/**
 * Render PDF page to canvas
 */
function renderPdfPage() {
    // Get container and clear any inline styles that might affect width calculation
    const container = document.getElementById('pdfCanvasContainer');

    // Clear canvas dimensions first
    const pdfCtx = pdfCanvas.getContext('2d');
    const maskCtx = maskCanvas.getContext('2d');
    pdfCtx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

    // Reset canvas dimensions
    pdfCanvas.width = 0;
    pdfCanvas.height = 0;
    maskCanvas.width = 0;
    maskCanvas.height = 0;

    // Calculate available width for PDF rendering (responsive)
    // Get the actual column width - works for all responsive classes
    // (col-12 col-md-8 col-lg-9)
    const pdfColumn = container.closest('[class*="col-"]');
    const actualColumnWidth = pdfColumn ? pdfColumn.clientWidth : 800;

    // Subtract padding (container has p-2 = 0.5rem = ~8px, border, etc)
    // Leave some breathing room for comfortable viewing
    const availableWidth = actualColumnWidth - 50; // Subtract padding, border, margins

    // Get page dimensions at scale 1
    const viewport1 = pdfPage.getViewport({scale: 1});

    // Calculate scale to fit available width
    // Limit scale: min 0.3 (for very large PDFs), max 1.0 (to avoid upscaling and blur)
    let scale = Math.min(availableWidth / viewport1.width, 1.0);
    scale = Math.max(scale, 0.3); // Min scale 0.3 for very large PDFs

    console.log(`[PDF Render] Column width: ${actualColumnWidth}px, Available: ${availableWidth}px, PDF width: ${viewport1.width}px, Scale: ${scale.toFixed(2)}`);


    const viewport = pdfPage.getViewport({scale: scale});

    pdfCanvas.width = viewport.width;
    pdfCanvas.height = viewport.height;
    maskCanvas.width = viewport.width;
    maskCanvas.height = viewport.height;

    canvasScale = viewport.scale;

    const renderContext = {
        canvasContext: pdfCtx,
        viewport: viewport
    };

    pdfPage.render(renderContext);
}

// ==================== Mask Drawing ====================

/**
 * Check if mouse is near an edge or corner of a mask
 * Returns: { maskIndex, edge } or null
 */
function getResizeHandle(mouseX, mouseY) {
    const threshold = RESIZE_HANDLE_SIZE;

    // Check masks in reverse order (top to bottom) to prioritize top masks
    for (let i = currentMasks.length - 1; i >= 0; i--) {
        const mask = currentMasks[i];

        // Convert percentage to pixels
        const x = (mask.x / 100) * maskCanvas.width;
        const y = (mask.y / 100) * maskCanvas.height;
        const width = (mask.width / 100) * maskCanvas.width;
        const height = (mask.height / 100) * maskCanvas.height;

        const right = x + width;
        const bottom = y + height;

        // Check if mouse is inside the mask bounding box (with threshold)
        if (mouseX >= x - threshold && mouseX <= right + threshold &&
            mouseY >= y - threshold && mouseY <= bottom + threshold) {

            // Check corners first (priority)
            const nearLeft = Math.abs(mouseX - x) <= threshold;
            const nearRight = Math.abs(mouseX - right) <= threshold;
            const nearTop = Math.abs(mouseY - y) <= threshold;
            const nearBottom = Math.abs(mouseY - bottom) <= threshold;

            // Corners
            if (nearTop && nearLeft) return { maskIndex: i, edge: 'nw' };
            if (nearTop && nearRight) return { maskIndex: i, edge: 'ne' };
            if (nearBottom && nearLeft) return { maskIndex: i, edge: 'sw' };
            if (nearBottom && nearRight) return { maskIndex: i, edge: 'se' };

            // Edges
            if (nearTop) return { maskIndex: i, edge: 'n' };
            if (nearBottom) return { maskIndex: i, edge: 's' };
            if (nearLeft) return { maskIndex: i, edge: 'w' };
            if (nearRight) return { maskIndex: i, edge: 'e' };
        }
    }

    return null;
}

/**
 * Get cursor style for resize edge
 */
function getCursorForEdge(edge) {
    const cursors = {
        'n': 'ns-resize',
        's': 'ns-resize',
        'e': 'ew-resize',
        'w': 'ew-resize',
        'ne': 'nesw-resize',
        'nw': 'nwse-resize',
        'se': 'nwse-resize',
        'sw': 'nesw-resize'
    };
    return cursors[edge] || 'default';
}

/**
 * Initialize canvas event listeners for drawing
 */
function initializeCanvasDrawing() {
    // Get canvas elements
    pdfCanvas = document.getElementById('pdfCanvas');
    maskCanvas = document.getElementById('maskCanvas');

    if (!maskCanvas) {
        console.error('maskCanvas not found');
        return;
    }

    // Avoid adding duplicate event listeners
    if (canvasInitialized) {
        console.log('Canvas already initialized, skipping');
        return;
    }

    // Remove any existing event listeners before adding new ones
    maskCanvas.removeEventListener('mousedown', startDrawing);
    maskCanvas.removeEventListener('mousemove', draw);
    maskCanvas.removeEventListener('mouseup', stopDrawing);
    maskCanvas.removeEventListener('mouseleave', stopDrawing);

    // Add event listeners
    maskCanvas.addEventListener('mousedown', startDrawing);
    maskCanvas.addEventListener('mousemove', draw);
    maskCanvas.addEventListener('mouseup', stopDrawing);
    maskCanvas.addEventListener('mouseleave', stopDrawing);

    canvasInitialized = true;
    console.log('Canvas drawing initialized successfully');
}

/**
 * Start drawing a new mask rectangle or resizing existing one
 */
function startDrawing(e) {
    if (!pdfDoc) return;

    // Get actual PDF canvas position (it's centered)
    const rect = pdfCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Check if mouse is over a resize handle
    const resizeHandle = getResizeHandle(mouseX, mouseY);

    if (resizeHandle) {
        // Start resizing
        isResizing = true;
        resizingMaskIndex = resizeHandle.maskIndex;
        resizeEdge = resizeHandle.edge;
        resizeStartMask = { ...currentMasks[resizingMaskIndex] }; // Clone mask
        startX = mouseX;
        startY = mouseY;
    } else {
        // Start drawing new mask
        isDrawing = true;
        startX = mouseX;
        startY = mouseY;
    }
}

/**
 * Draw mask rectangle while mouse moves (create new or resize existing)
 */
function draw(e) {
    // Get actual PDF canvas position (it's centered)
    const rect = pdfCanvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    // Update cursor based on hover state
    if (!isDrawing && !isResizing && pdfDoc) {
        const resizeHandle = getResizeHandle(currentX, currentY);
        maskCanvas.style.cursor = resizeHandle ? getCursorForEdge(resizeHandle.edge) : 'crosshair';
    }

    // Handle resizing
    if (isResizing && pdfDoc) {
        const deltaX = currentX - startX;
        const deltaY = currentY - startY;

        // Convert delta pixels to percentage
        const deltaXPercent = (deltaX / maskCanvas.width) * 100;
        const deltaYPercent = (deltaY / maskCanvas.height) * 100;

        // Get original mask
        const mask = currentMasks[resizingMaskIndex];
        const original = resizeStartMask;

        // Apply resize based on edge
        switch (resizeEdge) {
            case 'n': // Top edge
                mask.y = Math.max(0, Math.min(original.y + original.height - 0.1, original.y + deltaYPercent));
                mask.height = original.y + original.height - mask.y;
                break;
            case 's': // Bottom edge
                mask.height = Math.max(0.1, Math.min(100 - original.y, original.height + deltaYPercent));
                break;
            case 'e': // Right edge
                mask.width = Math.max(0.1, Math.min(100 - original.x, original.width + deltaXPercent));
                break;
            case 'w': // Left edge
                mask.x = Math.max(0, Math.min(original.x + original.width - 0.1, original.x + deltaXPercent));
                mask.width = original.x + original.width - mask.x;
                break;
            case 'ne': // Top-right corner
                mask.y = Math.max(0, Math.min(original.y + original.height - 0.1, original.y + deltaYPercent));
                mask.height = original.y + original.height - mask.y;
                mask.width = Math.max(0.1, Math.min(100 - original.x, original.width + deltaXPercent));
                break;
            case 'nw': // Top-left corner
                mask.y = Math.max(0, Math.min(original.y + original.height - 0.1, original.y + deltaYPercent));
                mask.height = original.y + original.height - mask.y;
                mask.x = Math.max(0, Math.min(original.x + original.width - 0.1, original.x + deltaXPercent));
                mask.width = original.x + original.width - mask.x;
                break;
            case 'se': // Bottom-right corner
                mask.height = Math.max(0.1, Math.min(100 - original.y, original.height + deltaYPercent));
                mask.width = Math.max(0.1, Math.min(100 - original.x, original.width + deltaXPercent));
                break;
            case 'sw': // Bottom-left corner
                mask.height = Math.max(0.1, Math.min(100 - original.y, original.height + deltaYPercent));
                mask.x = Math.max(0, Math.min(original.x + original.width - 0.1, original.x + deltaXPercent));
                mask.width = original.x + original.width - mask.x;
                break;
        }

        // Ensure values are within bounds
        mask.x = Math.max(0, Math.min(99.99, mask.x));
        mask.y = Math.max(0, Math.min(99.99, mask.y));
        mask.width = Math.max(0.01, Math.min(100 - mask.x, mask.width));
        mask.height = Math.max(0.01, Math.min(100 - mask.y, mask.height));

        updateMaskList();
        redrawAllMasks();
        return;
    }

    // Handle new mask drawing
    if (isDrawing && pdfDoc) {
        // Clear canvas and redraw all existing masks
        redrawAllMasks();

        // Draw current rectangle being created
        const ctx = maskCanvas.getContext('2d');
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
        ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
        ctx.lineWidth = 2;
        ctx.strokeRect(startX, startY, currentX - startX, currentY - startY);
        ctx.fillRect(startX, startY, currentX - startX, currentY - startY);
    }
}

/**
 * Stop drawing/resizing and save the mask
 */
function stopDrawing(e) {
    // Handle resize completion
    if (isResizing) {
        isResizing = false;
        resizingMaskIndex = -1;
        resizeEdge = null;
        resizeStartMask = null;
        maskCanvas.style.cursor = 'crosshair';
        return;
    }

    // Handle drawing completion
    if (!isDrawing || !pdfDoc) return;

    // Get actual PDF canvas position (it's centered)
    const rect = pdfCanvas.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    // Calculate dimensions
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    // Only save if rectangle has meaningful size (at least 10x10 pixels)
    if (width > 10 && height > 10) {
        // Convert pixel coordinates to percentages with decimal precision
        // Round to 2 decimal places for sub-pixel accuracy
        let maskPercent = {
            x: Math.round((x / maskCanvas.width) * 10000) / 100,
            y: Math.round((y / maskCanvas.height) * 10000) / 100,
            width: Math.round((width / maskCanvas.width) * 10000) / 100,
            height: Math.round((height / maskCanvas.height) * 10000) / 100
        };

        // Validate and clamp values to ensure they don't exceed 100%
        maskPercent.x = Math.max(0, Math.min(99.99, maskPercent.x));
        maskPercent.y = Math.max(0, Math.min(99.99, maskPercent.y));
        maskPercent.width = Math.max(0.01, Math.min(100 - maskPercent.x, maskPercent.width));
        maskPercent.height = Math.max(0.01, Math.min(100 - maskPercent.y, maskPercent.height));

        // Final validation: ensure x+width and y+height don't exceed 100%
        if (maskPercent.x + maskPercent.width > 100) {
            maskPercent.width = 100 - maskPercent.x;
        }
        if (maskPercent.y + maskPercent.height > 100) {
            maskPercent.height = 100 - maskPercent.y;
        }

        // Add to masks array
        currentMasks.push(maskPercent);
        updateMaskList();
        redrawAllMasks();
    }

    isDrawing = false;
    maskCanvas.style.cursor = 'crosshair';
}

/**
 * Redraw all existing masks on canvas with resize handles
 */
function redrawAllMasks() {
    if (!maskCanvas) return;

    const ctx = maskCanvas.getContext('2d');
    ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

    currentMasks.forEach((mask, index) => {
        const x = (mask.x / 100) * maskCanvas.width;
        const y = (mask.y / 100) * maskCanvas.height;
        const width = (mask.width / 100) * maskCanvas.width;
        const height = (mask.height / 100) * maskCanvas.height;

        // Highlight the mask being resized
        const isBeingResized = isResizing && resizingMaskIndex === index;

        ctx.strokeStyle = isBeingResized ? 'rgba(0, 200, 255, 1)' : 'rgba(0, 255, 0, 0.8)';
        ctx.fillStyle = isBeingResized ? 'rgba(0, 200, 255, 0.3)' : 'rgba(0, 255, 0, 0.2)';
        ctx.lineWidth = isBeingResized ? 3 : 2;
        ctx.strokeRect(x, y, width, height);
        ctx.fillRect(x, y, width, height);

        // Draw mask number
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x, y, 30, 20);
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.fillText(`#${index + 1}`, x + 5, y + 14);

        // Draw resize handles (small squares at corners and edges)
        if (!isDrawing) {
            drawResizeHandles(ctx, x, y, width, height, isBeingResized);
        }
    });
}

/**
 * Draw resize handles on a mask rectangle
 */
function drawResizeHandles(ctx, x, y, width, height, highlight) {
    const handleSize = 6;
    const handleColor = highlight ? 'rgba(0, 200, 255, 1)' : 'rgba(255, 255, 255, 0.9)';
    const handleBorder = highlight ? 'rgba(0, 100, 200, 1)' : 'rgba(0, 150, 0, 0.9)';

    const handles = [
        { x: x, y: y },                           // nw
        { x: x + width / 2, y: y },               // n
        { x: x + width, y: y },                   // ne
        { x: x + width, y: y + height / 2 },      // e
        { x: x + width, y: y + height },          // se
        { x: x + width / 2, y: y + height },      // s
        { x: x, y: y + height },                  // sw
        { x: x, y: y + height / 2 }               // w
    ];

    handles.forEach(handle => {
        // Draw handle background
        ctx.fillStyle = handleColor;
        ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);

        // Draw handle border
        ctx.strokeStyle = handleBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
    });
}

/**
 * Add new mask button click handler
 */
function addNewMask() {
    document.getElementById('drawingStatus').textContent = 'Clique e arraste para desenhar uma região';
    document.getElementById('drawingStatus').className = 'badge bg-info';
}

/**
 * Clear all masks
 */
function clearAllMasks() {
    if (currentMasks.length === 0) {
        return;
    }

    if (confirm(`Remover todas as ${currentMasks.length} máscaras?`)) {
        currentMasks = [];
        updateMaskList();
        redrawAllMasks();
    }
}

// ==================== Mask List Management ====================

/**
 * Update the mask list display
 */
function updateMaskList() {
    const maskList = document.getElementById('maskList');
    const maskListCount = document.getElementById('maskListCount');
    const emptyMessage = document.getElementById('emptyMaskMessage');

    // Update count badge
    maskListCount.textContent = currentMasks.length;

    // Update mask count in modal buttons
    const repoMaskCount = document.getElementById('repoMaskCount');
    const editRepoMaskCount = document.getElementById('editRepoMaskCount');
    if (currentMasks.length > 0) {
        const countText = `${currentMasks.length} máscara${currentMasks.length > 1 ? 's' : ''}`;
        if (repoMaskCount) {
            repoMaskCount.textContent = countText;
            repoMaskCount.style.display = 'inline';
        }
        if (editRepoMaskCount) {
            editRepoMaskCount.textContent = countText;
            editRepoMaskCount.style.display = 'inline';
        }
    } else {
        if (repoMaskCount) repoMaskCount.style.display = 'none';
        if (editRepoMaskCount) editRepoMaskCount.style.display = 'none';
    }

    if (currentMasks.length === 0) {
        maskList.classList.add('d-none');
        emptyMessage.classList.remove('d-none');
        return;
    }

    // Show list, hide empty message
    maskList.classList.remove('d-none');
    emptyMessage.classList.add('d-none');

    // Clear list
    maskList.innerHTML = '';

    // Add each mask as a card-like item
    currentMasks.forEach((mask, index) => {
        const maskItem = document.createElement('div');
        maskItem.className = 'mask-item d-flex justify-content-between align-items-center p-2 mb-2 border rounded';
        maskItem.innerHTML = `
            <div class="flex-grow-1">
                <div class="fw-bold small">Máscara #${index + 1}</div>
                <div class="text-muted" style="font-size: 0.75rem;">
                    X: ${mask.x.toFixed(1)}%, Y: ${mask.y.toFixed(1)}%<br>
                    L: ${mask.width.toFixed(1)}%, A: ${mask.height.toFixed(1)}%
                </div>
            </div>
            <button type="button" class="btn-icon-only" onclick="removeMask(${index})" title="Remover máscara">
                <i class="fas fa-trash-alt"></i>
            </button>
        `;
        maskList.appendChild(maskItem);
    });
}

/**
 * Remove a specific mask
 */
function removeMask(index) {
    currentMasks.splice(index, 1);
    updateMaskList();
    redrawAllMasks();
}

// ==================== Save Masks ====================

/**
 * Save masks to server
 */
async function saveMasks(event) {
    if (!currentProfileId) {
        alert('Erro: ID do perfil não encontrado. Por favor, salve o perfil primeiro.');
        return;
    }

    try {
        // Show loading state
        const saveButton = event ? event.target : document.querySelector('#maskEditorModal .btn-primary');
        if (saveButton) {
            const originalText = saveButton.innerHTML;
            saveButton.disabled = true;
            saveButton.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Salvando...';

            // Store original text for restoration
            saveButton.setAttribute('data-original-text', originalText);
        }

        // Send masks to profile endpoint
        const response = await fetch(`/api/imager/profiles/${currentProfileId}/masks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(currentMasks)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erro ao salvar máscaras');
        }

        // Success
        showAlert('success', `${currentMasks.length} máscara(s) salva(s) com sucesso!`);

        // Update the profile modal data with the new masks
        const profileModal = $('#profileModal');
        if (profileModal.length) {
            const profile = profileModal.data('profile');
            if (profile) {
                profile.ocrMasks = JSON.stringify(currentMasks);
                profileModal.data('profile', profile);
            }
        }

        // Close modal
        $('#maskEditorModal').modal('hide');

        // Reload profiles table if it exists
        if (typeof loadRepositoryProfiles === 'function' && maskEditorRepositoryId) {
            loadRepositoryProfiles(maskEditorRepositoryId);
        } else if (window.profilesTable && $.fn.DataTable.isDataTable(window.profilesTable)) {
            // Fallback: just reload the DataTable
            $(window.profilesTable).DataTable().ajax.reload();
        }

    } catch (error) {
        console.error('Error saving masks:', error);
        showAlert('danger', 'Erro ao salvar máscaras: ' + error.message);

        // Restore button
        const saveButton = event ? event.target : document.querySelector('#maskEditorModal .btn-primary');
        if (saveButton) {
            const originalText = saveButton.getAttribute('data-original-text');
            saveButton.disabled = false;
            if (originalText) {
                saveButton.innerHTML = originalText;
            }
        }
    }
}

// ==================== Initialization ====================

// Initialize canvas drawing when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    const maskCanvas = document.getElementById('maskCanvas');
    if (maskCanvas) {
        initializeCanvasDrawing();
    }
});

// ==================== Global Exports ====================
// Expose functions to global scope for onclick handlers
window.openMaskEditorForProfile = openMaskEditorForProfile;
window.cancelMaskEditing = cancelMaskEditing;
window.loadPdfForMasking = loadPdfForMasking;
window.addNewMask = addNewMask;
window.clearAllMasks = clearAllMasks;
window.removeMask = removeMask;
window.saveMasks = saveMasks;
