// sistema_central/auth.js
// Gestión de autenticación con el Backend

const API_URL = 'https://ec0301-globalskillscert-backend.onrender.com';

const auth = {
    // Verificar si hay sesión activa
    isLoggedIn: () => {
        return !!localStorage.getItem('ec0301_token');
    },

    // Login contra el backend
    login: async (accessCode) => {
        try {
            const response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: accessCode })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                localStorage.setItem('ec0301_token', data.token || accessCode);
                return { success: true };
            } else {
                return { success: false, message: data.message || 'Código inválido' };
            }
        } catch (error) {
            console.error('Auth Error:', error);
            return { success: false, message: 'Error de conexión con el servidor.' };
        }
    },

    // Cerrar sesión
    logout: () => {
        localStorage.removeItem('ec0301_token');
        window.location.href = 'index.html';
    }
};

window.auth = auth;
