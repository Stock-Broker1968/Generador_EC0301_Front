document.addEventListener('DOMContentLoaded', () => {
    // Verificar Auth
    if (typeof auth === 'undefined') return; // Esperar carga
    if (!auth.isLoggedIn()) {
        window.location.href = 'index.html';
        return;
    }

    const modules = [
        { key: 'carta', id: 'mod-carta' },
        { key: 'logistica', id: 'mod-logistica' },
        { key: 'evaluaciones', id: 'mod-evaluaciones' },
        { key: 'manuales', id: 'mod-manuales' },
        { key: 'respuestas', id: 'mod-respuestas' },
        { key: 'auditoria', id: 'mod-auditoria' }
    ];

    function refreshDashboard() {
        const data = EC0301Manager.getData();
        const mods = data.modulos || {};
        let prevCompleted = true; // El primero siempre está abierto

        modules.forEach((m, i) => {
            const card = document.getElementById(m.id);
            if (!card) return;

            const status = mods[m.key] || {};
            const isCompleted = status.completed;
            const isOpen = i === 0 || prevCompleted; // Abierto si es el 1ro o el anterior acabó

            // Actualizar UI
            if (isOpen) {
                card.classList.remove('card--locked');
                card.querySelector('button').disabled = false;
                card.querySelector('button').classList.remove('is-disabled');
            } else {
                card.classList.add('card--locked');
                card.querySelector('button').disabled = true;
                card.querySelector('button').classList.add('is-disabled');
            }

            // Actualizar texto de estado
            const badge = card.querySelector('.status-badge') || card.querySelector('[data-role="status"]');
            if (badge) {
                if (!isOpen) badge.textContent = 'Bloqueado';
                else if (isCompleted) {
                    badge.textContent = 'Completado';
                    badge.className = 'status-badge completed';
                } else {
                    badge.textContent = 'Disponible';
                    badge.className = 'status-badge active';
                }
            }

            // Para el siguiente ciclo
            prevCompleted = isCompleted;
        });
    }

    refreshDashboard();
    
    // Botón Cerrar Sesión
    document.getElementById('btn-logout')?.addEventListener('click', (e) => {
        e.preventDefault();
        auth.logout();
    });
});
