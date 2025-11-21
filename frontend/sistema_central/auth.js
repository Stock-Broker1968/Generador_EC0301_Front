// sistema_central/auth.js

const API_URL = 'https://ec0301-globalskillscert-backend.onrender.com'; // Tu backend en Render

const auth = {
    // Verificar si el usuario está logueado
    isLoggedIn: () => {
        return !!localStorage.getItem('ec0301_token');
    },

    // Iniciar sesión con el código de acceso
    login: async (accessCode) => {
        try {
            const response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: accessCode })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                localStorage.setItem('ec0301_token', data.token || accessCode); // Guardar token
                localStorage.setItem('ec0301_user', JSON.stringify(data.user || {})); // Guardar datos usuario
                return { success: true };
            } else {
                return { success: false, message: data.message || 'Código inválido' };
            }
        } catch (error) {
            console.error('Error en login:', error);
            return { success: false, message: 'Error de conexión con el servidor' };
        }
    },

    // Cerrar sesión
    logout: () => {
        localStorage.removeItem('ec0301_token');
        localStorage.removeItem('ec0301_user');
        window.location.href = 'index.html';
    },

    // Obtener datos del usuario actual
    getUser: () => {
        const user = localStorage.getItem('ec0301_user');
        return user ? JSON.parse(user) : null;
    }
};

// Exponer globalmente para que los HTML lo vean
window.auth = auth;

// Botón de cerrar sesión (si existe en la página)
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.querySelector('#logout-btn, .btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            auth.logout();
        });
    }
});
