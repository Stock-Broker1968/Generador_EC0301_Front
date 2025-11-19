// Interfaz/js/login.js
// Lógica del dashboard de acceso (candados por módulos)

(function () {
  'use strict';

  function whenReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  whenReady(function () {
    if (typeof auth === 'undefined' || typeof EC0301Manager === 'undefined') {
      if (typeof showCriticalError === 'function') {
        showCriticalError(
          'No se pudieron cargar los módulos de sistema auth.js o ec0301-data-manager.js.'
        );
      }
      return;
    }

    // Mostrar email y estado de acceso
    const session = auth.getSession();
    const email = auth.getUserEmail() || session?.email || 'Usuario EC0301';
    const badgeEmail = document.getElementById('badge-email');
    const badgeEstado = document.getElementById('badge-estado');

    if (badgeEmail) {
      badgeEmail.textContent = email;
    }
    if (!auth.isLoggedIn() && badgeEstado) {
      badgeEstado.textContent = 'Acceso inactivo';
      badgeEstado.classList.remove('pill-success');
      badgeEstado.classList.add('pill-danger');
    }

    const moduleOrder = [
      { key: 'carta_descriptiva', id: 'mod-carta' },
      { key: 'logistica', id: 'mod-logistica' },
      { key: 'evaluaciones', id: 'mod-evaluaciones' },
      { key: 'manuales', id: 'mod-manuales' },
      { key: 'respuestas', id: 'mod-respuestas' },
      { key: 'auditoria', id: 'mod-auditoria' }
    ];

    function refreshDashboard() {
      const data = EC0301Manager.getData();
      const modStatus = (data && data.modulos) || {};

      let allPrevCompleted = true;

      moduleOrder.forEach((mod, index) => {
        const card = document.getElementById(mod.id);
        if (!card) return;

        const statusSpan = card.querySelector('[data-role="status"]');
        const btn = card.querySelector('[data-role="open-module"]');
        const moduleData = modStatus[mod.key] || {};
        const completed = !!moduleData.completado;
        const hasData =
          !!moduleData.formData ||
          !!moduleData.avance ||
          !!moduleData.objetivosParticulares;

        const isFirst = index === 0;
        const enabled = isFirst || allPrevCompleted;

        if (!enabled) {
          card.classList.add('card--locked');
        } else {
          card.classList.remove('card--locked');
        }

        if (btn) {
          if (!enabled) {
            btn.classList.add('is-disabled');
            btn.setAttribute('tabindex', '-1');
          } else {
            btn.classList.remove('is-disabled');
            btn.removeAttribute('tabindex');
          }
        }

        if (statusSpan) {
          if (!enabled) {
            statusSpan.textContent = 'Bloqueado';
          } else if (completed) {
            statusSpan.textContent = 'Completado';
          } else if (hasData) {
            statusSpan.textContent = 'En progreso';
          } else {
            statusSpan.textContent = 'Pendiente';
          }
        }

        if (!completed) {
          allPrevCompleted = false;
        }
      });
    }

    refreshDashboard();
    window.refreshDashboard = refreshDashboard;

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function (e) {
        e.preventDefault();
        auth.logout();
      });
    }
  });
})();
