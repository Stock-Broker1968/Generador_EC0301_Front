// sistema_central/auth.js (VERSIÓN FRONTEND)

const AUTH_API_URL = 'https://ec0301-globalskillscert-backend.onrender.com';

const auth = {
    // Verificar si hay sesión guardada
    isLoggedIn: () => {
        return !!localStorage.getItem('ec0301_token');
    },

    // Función de Login
    login: async (accessCode) => {
        try {
            const response = await fetch(`${AUTH_API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: accessCode })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Guardar sesión
                localStorage.setItem('ec0301_token', data.token || accessCode);
                if (data.user) {
                    localStorage.setItem('ec0301_user', JSON.stringify(data.user));
                }
                return { success: true };
            } else {
                return { success: false, message: data.message || 'Código incorrecto' };
            }
        } catch (error) {
            console.error('Error en auth.js:', error);
            return { success: false, message: 'Error de conexión con el servidor.' };
        }
    },

    // Cerrar sesión
    logout: () => {
        localStorage.removeItem('ec0301_token');
        localStorage.removeItem('ec0301_user');
        window.location.href = 'index.html';
    }
};

// Exponer al navegador
window.auth = auth;
