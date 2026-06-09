/**
 * Admin Profiles Management
 * Manages access profiles CRUD in the admin configurations area.
 */
var AdminProfiles = (function() {
    var profilesTable = null;
    var availableModules = {};
    var availablePermissions = {};

    function init() {
        loadAvailableModules();
        loadAvailablePermissions();
        loadProfiles();
        bindEvents();
    }

    function loadAvailableModules() {
        $.get('/admin/api/available-modules')
            .done(function(data) {
                availableModules = data;
                renderModuleCheckboxes();
            });
    }

    function loadAvailablePermissions() {
        $.get('/admin/api/available-permissions')
            .done(function(data) {
                availablePermissions = data;
                renderPermissionCheckboxes();
            });
    }

    function renderModuleCheckboxes() {
        var container = $('#profileModulesCheckboxes');
        container.empty();
        Object.keys(availableModules).forEach(function(key) {
            container.append(
                '<div class="form-check">' +
                '<input class="form-check-input module-check" type="checkbox" value="' + key + '" id="mod_' + key + '">' +
                '<label class="form-check-label" for="mod_' + key + '">' + availableModules[key] + '</label>' +
                '</div>'
            );
        });
    }

    function renderPermissionCheckboxes() {
        var container = $('#profilePermissionsCheckboxes');
        container.empty();

        // Group permissions by parent module
        var grouped = {};
        Object.keys(availablePermissions).forEach(function(key) {
            var perm = availablePermissions[key];
            if (!grouped[perm.parentModule]) {
                grouped[perm.parentModule] = [];
            }
            grouped[perm.parentModule].push({ key: key, displayName: perm.displayName });
        });

        Object.keys(grouped).forEach(function(moduleKey) {
            var moduleLabel = availableModules[moduleKey] || moduleKey;
            container.append('<small class="text-muted d-block mt-1 perm-group" data-parent-module="' + moduleKey + '">' + moduleLabel + '</small>');
            grouped[moduleKey].forEach(function(perm) {
                container.append(
                    '<div class="form-check ms-3 perm-group" data-parent-module="' + moduleKey + '">' +
                    '<input class="form-check-input permission-check" type="checkbox" value="' + perm.key + '" id="perm_' + perm.key.replace(/\./g, '_') + '">' +
                    '<label class="form-check-label" for="perm_' + perm.key.replace(/\./g, '_') + '">' + perm.displayName + '</label>' +
                    '</div>'
                );
            });
        });

        updatePermissionsVisibility();
    }

    function updatePermissionsVisibility() {
        var hasVisiblePermissions = false;
        $('.perm-group').each(function() {
            var parentModule = $(this).data('parent-module');
            var moduleChecked = $('#mod_' + parentModule).is(':checked');
            $(this).toggle(moduleChecked);
            if (moduleChecked) hasVisiblePermissions = true;
        });
        // Uncheck hidden permissions
        $('.permission-check:not(:visible)').prop('checked', false);
        // Show/hide permissions section
        $('#profilePermissionsSection').toggle(hasVisiblePermissions);
    }

    function updateTasyToggleState() {
        var requiresPassword = $('#profileRequiresPassword').is(':checked');
        var tasyToggle = $('#profileValidateViaTasy');
        tasyToggle.prop('disabled', !requiresPassword);
        if (!requiresPassword) {
            tasyToggle.prop('checked', false);
        }
        $('#profileTasyHint').toggle(tasyToggle.is(':checked'));
    }

    function loadProfiles() {
        $.get('/admin/api/profiles')
            .done(function(data) {
                renderProfilesTable(data);
            })
            .fail(function() {
                showAlert('Erro ao carregar perfis', 'danger');
            });
    }

    function renderProfilesTable(profiles) {
        var tbody = $('#profilesTableBody');
        tbody.empty();

        if (profiles.length === 0) {
            tbody.append('<tr><td colspan="6" class="text-center text-muted">Nenhum perfil cadastrado</td></tr>');
            return;
        }

        profiles.forEach(function(profile) {
            var modulesBadges = '';
            if (profile.moduleKeys) {
                profile.moduleKeys.forEach(function(key) {
                    var label = availableModules[key] || key;
                    modulesBadges += '<span class="badge bg-info me-1">' + label + '</span>';
                });
            }

            var statusBadge = profile.enabled
                ? '<span class="badge bg-success">Ativo</span>'
                : '<span class="badge bg-secondary">Inativo</span>';

            var passwordBadge = profile.requiresPassword
                ? '<span class="badge bg-warning text-dark"><i class="fas fa-lock me-1"></i>Sim</span>'
                : '<span class="badge bg-light text-dark"><i class="fas fa-unlock me-1"></i>Não</span>';

            var tasyBadge = profile.validateViaTasy
                ? ' <span class="badge bg-primary"><i class="fas fa-database me-1"></i>Tasy</span>'
                : '';

            tbody.append(
                '<tr>' +
                '<td><i class="fas ' + (profile.icon || 'fa-user') + ' me-2"></i>' + profile.name + tasyBadge + '</td>' +
                '<td>' + (profile.description || '-') + '</td>' +
                '<td>' + modulesBadges + '</td>' +
                '<td>' + passwordBadge + '</td>' +
                '<td>' + statusBadge + '</td>' +
                '<td class="text-end">' +
                '<button class="btn-icon-only btn-sm edit-profile-btn" data-id="' + profile.id + '" title="Editar"><i class="fas fa-edit"></i></button>' +
                '<button class="btn-icon-only btn-sm delete-profile-btn" data-id="' + profile.id + '" title="Excluir"><i class="fas fa-trash"></i></button>' +
                '</td>' +
                '</tr>'
            );
        });
    }

    function bindEvents() {
        // Module checkbox change -> update permissions visibility
        $(document).on('change', '.module-check', function() {
            updatePermissionsVisibility();
        });

        // "Exige Senha" controls availability of "Validar credenciais no Tasy"
        $(document).on('change', '#profileRequiresPassword', function() {
            updateTasyToggleState();
        });
        $(document).on('change', '#profileValidateViaTasy', function() {
            $('#profileTasyHint').toggle($(this).is(':checked'));
        });

        // Add profile
        $(document).on('click', '#addAccessProfileBtn', function() {
            $('#accessProfileModalTitle').text('Adicionar Perfil');
            $('#accessProfileForm')[0].reset();
            $('#profileId').val('');
            $('.module-check').prop('checked', false);
            $('.permission-check').prop('checked', false);
            updatePermissionsVisibility();
            $('#profileValidateViaTasy').prop('checked', false);
            updateTasyToggleState();
            $('#accessProfileModal').modal('show');
        });

        // Save profile
        $(document).on('click', '#saveProfileBtn', function() {
            saveProfile();
        });

        // Edit profile
        $(document).on('click', '.edit-profile-btn', function() {
            var id = $(this).data('id');
            loadProfileForEdit(id);
        });

        // Delete profile
        $(document).on('click', '.delete-profile-btn', function() {
            var id = $(this).data('id');
            if (confirm('Tem certeza que deseja excluir este perfil?')) {
                deleteProfile(id);
            }
        });
    }

    function loadProfileForEdit(id) {
        $.get('/admin/api/profiles/' + id)
            .done(function(profile) {
                $('#accessProfileModalTitle').text('Editar Perfil');
                $('#profileId').val(profile.id);
                $('#accessProfileName').val(profile.name);
                $('#accessProfileDescription').val(profile.description);
                $('#profileRequiresPassword').prop('checked', profile.requiresPassword);
                $('#profileValidateViaTasy').prop('checked', !!profile.validateViaTasy);
                updateTasyToggleState();
                $('#accessProfileEnabled').prop('checked', profile.enabled);
                $('#profileIcon').val(profile.icon || 'fa-user');
                $('#profileDisplayOrder').val(profile.displayOrder);

                // Set module checkboxes
                $('.module-check').prop('checked', false);
                if (profile.moduleKeys) {
                    profile.moduleKeys.forEach(function(key) {
                        $('#mod_' + key).prop('checked', true);
                    });
                }

                // Update permissions visibility then set permission checkboxes
                updatePermissionsVisibility();
                $('.permission-check').prop('checked', false);
                if (profile.permissionKeys) {
                    profile.permissionKeys.forEach(function(key) {
                        $('#perm_' + key.replace(/\./g, '_')).prop('checked', true);
                    });
                }

                $('#accessProfileModal').modal('show');
            })
            .fail(function() {
                showAlert('Erro ao carregar perfil', 'danger');
            });
    }

    function saveProfile() {
        var id = $('#profileId').val();
        var moduleKeys = [];
        $('.module-check:checked').each(function() {
            moduleKeys.push($(this).val());
        });
        var permissionKeys = [];
        $('.permission-check:checked:visible').each(function() {
            permissionKeys.push($(this).val());
        });

        var data = {
            name: $('#accessProfileName').val(),
            description: $('#accessProfileDescription').val(),
            requiresPassword: $('#profileRequiresPassword').is(':checked'),
            validateViaTasy: $('#profileValidateViaTasy').is(':checked'),
            enabled: $('#accessProfileEnabled').is(':checked'),
            icon: $('#profileIcon').val() || 'fa-user',
            displayOrder: $('#profileDisplayOrder').val() ? parseInt($('#profileDisplayOrder').val()) : null,
            moduleKeys: moduleKeys,
            permissionKeys: permissionKeys
        };

        if (!data.name) {
            showAlert('Nome do perfil é obrigatório', 'warning');
            return;
        }

        var url = id ? '/admin/api/profiles/' + id : '/admin/api/profiles';
        var method = id ? 'PUT' : 'POST';

        $.ajax({
            url: url,
            method: method,
            contentType: 'application/json',
            data: JSON.stringify(data)
        })
        .done(function() {
            $('#accessProfileModal').modal('hide');
            loadProfiles();
            showAlert('Perfil ' + (id ? 'atualizado' : 'criado') + ' com sucesso', 'success');
        })
        .fail(function(xhr) {
            var msg = xhr.responseText || 'Erro ao salvar perfil';
            showAlert(msg, 'danger');
        });
    }

    function deleteProfile(id) {
        $.ajax({
            url: '/admin/api/profiles/' + id,
            method: 'DELETE'
        })
        .done(function() {
            loadProfiles();
            showAlert('Perfil excluído com sucesso', 'success');
        })
        .fail(function(xhr) {
            var msg = xhr.responseText || 'Erro ao excluir perfil';
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

    return { init: init, refresh: loadProfiles };
})();
