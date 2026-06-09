/**
 * Admin Users Management
 * Manages app users CRUD in the admin configurations area.
 */
var AdminUsers = (function() {
    var allProfiles = [];

    function init() {
        loadProfiles(function() {
            loadUsers();
        });
        bindEvents();
    }

    function loadProfiles(callback) {
        $.get('/admin/api/profiles')
            .done(function(data) {
                allProfiles = data;
                renderProfileCheckboxes();
                if (callback) callback();
            });
    }

    function renderProfileCheckboxes() {
        var container = $('#userProfileCheckboxes');
        container.empty();
        allProfiles.forEach(function(profile) {
            container.append(
                '<div class="form-check">' +
                '<input class="form-check-input user-profile-check" type="checkbox" value="' + profile.id + '" id="uprof_' + profile.id + '">' +
                '<label class="form-check-label" for="uprof_' + profile.id + '">' +
                '<i class="fas ' + (profile.icon || 'fa-user') + ' me-1"></i>' + profile.name +
                (profile.requiresPassword ? ' <small class="text-muted">(requer senha)</small>' : '') +
                '</label>' +
                '</div>'
            );
        });
    }

    function loadUsers() {
        $.get('/admin/api/users')
            .done(function(data) {
                renderUsersTable(data);
            })
            .fail(function() {
                showAlert('Erro ao carregar usuários', 'danger');
            });
    }

    function renderUsersTable(users) {
        var tbody = $('#usersTableBody');
        tbody.empty();

        if (users.length === 0) {
            tbody.append('<tr><td colspan="5" class="text-center text-muted">Nenhum usuário cadastrado</td></tr>');
            return;
        }

        users.forEach(function(user) {
            var profileBadges = '';
            if (user.profileIds) {
                user.profileIds.forEach(function(pid) {
                    var profile = allProfiles.find(function(p) { return p.id === pid; });
                    if (profile) {
                        profileBadges += '<span class="badge bg-info me-1">' + profile.name + '</span>';
                    }
                });
            }

            var statusBadge = user.enabled
                ? '<span class="badge bg-success">Ativo</span>'
                : '<span class="badge bg-secondary">Inativo</span>';

            tbody.append(
                '<tr>' +
                '<td>' + user.username + '</td>' +
                '<td>' + (user.displayName || '-') + '</td>' +
                '<td>' + (profileBadges || '<span class="text-muted">Nenhum</span>') + '</td>' +
                '<td>' + statusBadge + '</td>' +
                '<td class="text-end">' +
                '<button class="btn-icon-only btn-sm edit-user-btn" data-id="' + user.id + '" title="Editar"><i class="fas fa-edit"></i></button>' +
                '<button class="btn-icon-only btn-sm change-pwd-btn" data-id="' + user.id + '" data-username="' + user.username + '" title="Alterar Senha"><i class="fas fa-key"></i></button>' +
                '<button class="btn-icon-only btn-sm delete-user-btn" data-id="' + user.id + '" title="Excluir"><i class="fas fa-trash"></i></button>' +
                '</td>' +
                '</tr>'
            );
        });
    }

    function bindEvents() {
        // Add user
        $(document).on('click', '#addUserBtn', function() {
            $('#userModalTitle').text('Adicionar Usuário');
            $('#userForm')[0].reset();
            $('#userId').val('');
            $('#userPasswordGroup').show();
            $('.user-profile-check').prop('checked', false);
            $('#userModal').modal('show');
        });

        // Save user
        $(document).on('click', '#saveUserBtn', function() {
            saveUser();
        });

        // Edit user
        $(document).on('click', '.edit-user-btn', function() {
            var id = $(this).data('id');
            loadUserForEdit(id);
        });

        // Change password
        $(document).on('click', '.change-pwd-btn', function() {
            var id = $(this).data('id');
            var username = $(this).data('username');
            $('#changePwdUserId').val(id);
            $('#changePwdUsername').text(username);
            $('#newUserPassword').val('');
            $('#confirmUserPassword').val('');
            $('#changeUserPasswordModal').modal('show');
        });

        // Save password change
        $(document).on('click', '#saveUserPasswordBtn', function() {
            changeUserPassword();
        });

        // Delete user
        $(document).on('click', '.delete-user-btn', function() {
            var id = $(this).data('id');
            if (confirm('Tem certeza que deseja excluir este usuário?')) {
                deleteUser(id);
            }
        });
    }

    function loadUserForEdit(id) {
        $.get('/admin/api/users/' + id)
            .done(function(user) {
                $('#userModalTitle').text('Editar Usuário');
                $('#userId').val(user.id);
                $('#userUsername').val(user.username);
                $('#userDisplayName').val(user.displayName);
                $('#userEnabled').prop('checked', user.enabled);
                $('#userPasswordGroup').hide(); // Don't show password on edit

                // Set profile checkboxes
                $('.user-profile-check').prop('checked', false);
                if (user.profileIds) {
                    user.profileIds.forEach(function(pid) {
                        $('#uprof_' + pid).prop('checked', true);
                    });
                }

                $('#userModal').modal('show');
            })
            .fail(function() {
                showAlert('Erro ao carregar usuário', 'danger');
            });
    }

    function saveUser() {
        var id = $('#userId').val();
        var profileIds = [];
        $('.user-profile-check:checked').each(function() {
            profileIds.push(parseInt($(this).val()));
        });

        var data = {
            username: $('#userUsername').val(),
            displayName: $('#userDisplayName').val(),
            enabled: $('#userEnabled').is(':checked'),
            profileIds: profileIds
        };

        if (!data.username) {
            showAlert('Username é obrigatório', 'warning');
            return;
        }

        // Include password only for new users
        if (!id) {
            data.password = $('#userPassword').val();
        }

        var url = id ? '/admin/api/users/' + id : '/admin/api/users';
        var method = id ? 'PUT' : 'POST';

        $.ajax({
            url: url,
            method: method,
            contentType: 'application/json',
            data: JSON.stringify(data)
        })
        .done(function() {
            $('#userModal').modal('hide');
            loadUsers();
            showAlert('Usuário ' + (id ? 'atualizado' : 'criado') + ' com sucesso', 'success');
        })
        .fail(function(xhr) {
            var msg = xhr.responseText || 'Erro ao salvar usuário';
            showAlert(msg, 'danger');
        });
    }

    function changeUserPassword() {
        var id = $('#changePwdUserId').val();
        var newPassword = $('#newUserPassword').val();
        var confirmPassword = $('#confirmUserPassword').val();

        if (newPassword !== confirmPassword) {
            showAlert('As senhas não coincidem', 'warning');
            return;
        }

        if (newPassword.length < 6) {
            showAlert('Senha deve ter no mínimo 6 caracteres', 'warning');
            return;
        }

        $.ajax({
            url: '/admin/api/users/' + id + '/change-password',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ newPassword: newPassword })
        })
        .done(function() {
            $('#changeUserPasswordModal').modal('hide');
            showAlert('Senha alterada com sucesso', 'success');
        })
        .fail(function(xhr) {
            var msg = xhr.responseText || 'Erro ao alterar senha';
            showAlert(msg, 'danger');
        });
    }

    function deleteUser(id) {
        $.ajax({
            url: '/admin/api/users/' + id,
            method: 'DELETE'
        })
        .done(function() {
            loadUsers();
            showAlert('Usuário excluído com sucesso', 'success');
        })
        .fail(function(xhr) {
            var msg = xhr.responseText || 'Erro ao excluir usuário';
            showAlert(msg, 'danger');
        });
    }

    function showAlert(message, type) {
        var alertContainer = $('#alertsContainer');
        if (alertContainer.length === 0) return;
        alertContainer.html(
            '<div class="alert alert-' + type + ' alert-dismissible fade show" role="alert">' +
            '<i class="fas fa-' + (type === 'success' ? 'check-circle' : 'exclamation-triangle') + ' me-2"></i>' +
            message +
            '<button type="button" class="btn-close" data-bs-dismiss="alert"></button>' +
            '</div>'
        );
        setTimeout(function() { alertContainer.find('.alert').alert('close'); }, 5000);
    }

    return { init: init, refresh: loadUsers };
})();
