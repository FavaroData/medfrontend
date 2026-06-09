// Imager Exam Groups CRUD
let examGroupsTableInstance = null;

function initExamGroupsTab() {
    if (examGroupsTableInstance) {
        examGroupsTableInstance.ajax.reload();
        return;
    }
    examGroupsTableInstance = $('#examGroupsTable').DataTable({
        autoWidth: false,
        ajax: {
            url: '/api/imager/exam-groups',
            dataSrc: ''
        },
        columns: [
            { data: 'name', title: 'Nome', width: '28%' },
            { data: 'description', title: 'Descrição', width: '45%',
              render: d => d ? $('<div>').text(d).html() : '<span class="text-muted">—</span>' },
            { data: 'id', title: 'Exames Vinculados', width: '15%',
              render: (id, type, row) => `<span class="badge bg-secondary" data-group-linked-count="${id}">…</span>` },
            { data: 'id', title: 'Ações', width: '12%', orderable: false,
              render: id => `
                <button class="btn-icon-only" data-action="edit-group" data-id="${id}" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon-only" data-action="delete-group" data-id="${id}" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>` }
        ],
        order: [[0, 'asc']],
        language: { url: '//cdn.datatables.net/plug-ins/1.13.4/i18n/pt-BR.json' },
        drawCallback: function() { loadLinkedCounts(); }
    });

    setupExamGroupsEvents();
}

function loadLinkedCounts() {
    $('[data-group-linked-count]').each(function() {
        const id = $(this).attr('data-group-linked-count');
        const $badge = $(this);
        fetch(`/api/imager/exam-groups/${id}/configs`)
            .then(r => r.json())
            .then(data => {
                const count = (data.configs || []).length;
                $badge.text(count);
            })
            .catch(() => $badge.text('?'));
    });
}

function setupExamGroupsEvents() {
    $('#btnAddExamGroup').on('click', () => openExamGroupModal());

    $('#examGroupsTable').on('click', '[data-action="edit-group"]', function() {
        const id = $(this).data('id');
        fetch(`/api/imager/exam-groups/${id}`)
            .then(r => r.json())
            .then(g => openExamGroupModal(g));
    });

    $('#examGroupsTable').on('click', '[data-action="delete-group"]', function() {
        const id = $(this).data('id');
        const row = examGroupsTableInstance.row($(this).closest('tr')).data();
        if (!confirm(`Confirma a exclusão do grupo "${row.name}"?`)) return;
        deleteExamGroup(id, row.name);
    });

    $('#examGroupForm').on('submit', function(ev) {
        ev.preventDefault();
        saveExamGroup();
    });
}

function openExamGroupModal(group) {
    if (group) {
        $('#examGroupModalLabel').text('Editar Grupo de Exames');
        $('#examGroupId').val(group.id);
        $('#examGroupName').val(group.name);
        $('#examGroupDescription').val(group.description || '');
    } else {
        $('#examGroupModalLabel').text('Adicionar Grupo de Exames');
        $('#examGroupForm')[0].reset();
        $('#examGroupId').val('');
    }
    $('#examGroupName').removeClass('is-invalid');
    new bootstrap.Modal(document.getElementById('examGroupModal')).show();
}

function saveExamGroup() {
    const id = $('#examGroupId').val();
    const payload = {
        name: $('#examGroupName').val().trim(),
        description: $('#examGroupDescription').val().trim() || null
    };
    if (!payload.name) {
        $('#examGroupName').addClass('is-invalid');
        return;
    }
    const url = id ? `/api/imager/exam-groups/${id}` : '/api/imager/exam-groups';
    const method = id ? 'PUT' : 'POST';
    fetch(url, {
        method,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    }).then(async r => {
        if (r.ok) {
            bootstrap.Modal.getInstance(document.getElementById('examGroupModal')).hide();
            examGroupsTableInstance.ajax.reload();
            showAlert(id ? 'Grupo atualizado com sucesso.' : 'Grupo criado com sucesso.', 'success',
                      '#examGroupsAlertsContainer');
        } else {
            const err = await r.json().catch(() => ({message: 'Erro desconhecido'}));
            showAlert(err.message || 'Falha ao salvar o grupo.', 'danger', '#examGroupsAlertsContainer');
        }
    });
}

function deleteExamGroup(id, name) {
    fetch(`/api/imager/exam-groups/${id}`, {method: 'DELETE'})
        .then(async r => {
            if (r.status === 204) {
                examGroupsTableInstance.ajax.reload();
                showAlert(`Grupo "${name}" excluído.`, 'success', '#examGroupsAlertsContainer');
            } else if (r.status === 409) {
                const err = await r.json();
                showBlockedDeleteModal(name, err);
            } else {
                showAlert('Falha ao excluir o grupo.', 'danger', '#examGroupsAlertsContainer');
            }
        });
}

function showBlockedDeleteModal(groupName, err) {
    $('#blockedGroupName').text(groupName);
    $('#blockedLinkedCount').text(err.linkedConfigsCount);
    const $list = $('#blockedLinkedConfigs').empty();
    (err.linkedConfigsSample || []).forEach(c => {
        $list.append(`<li class="list-group-item">
            <strong>${c.dsProcesso}</strong> — ${c.exameName}
        </li>`);
    });
    new bootstrap.Modal(document.getElementById('examGroupBlockedDeleteModal')).show();
}

// Inicializar quando a tab for ativada
$(document).on('shown.bs.tab', 'button[data-bs-target="#exam-groups"]', initExamGroupsTab);
