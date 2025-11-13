/**
 * auth.js
 * Gestión completa de autenticación frontend con LocalStorage y JWT.
 */

const TOKEN_KEY = 'authToken';
const EMAIL_KEY = 'userEmail';
const ACCESS_CODE_KEY = 'accessCode';

const auth = (() => {
  'use strict';

  /**
   * Inicia sesión: guarda el token JWT y datos adicionales en localStorage.
   * @param {string} token
   * @param {string|null} email
   * @param {string|null} accessCode
   */
  function login(token, email = null, accessCode = null) {
    localStorage.setItem(TOKEN_KEY, token);
    if (email) localStorage.setItem(EMAIL_KEY, email);
    if (accessCode) localStorage.setItem(ACCESS_CODE_KEY, accessCode);
  }

  /**
   * Cierra la sesión eliminando todos los datos del usuario.
   */
  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(ACCESS_CODE_KEY);
    if (typeof EC0301Manager !== 'undefined' && EC0301Manager.clearData) {
      EC0301Manager.clearData();
    }
    window.location.href = 'index.html';
  }

  /**
   * Verifica si el usuario está autenticado.
   * @returns {boolean}
   */
  function isLoggedIn() {
    const token = localStorage.getItem(TOKEN_KEY);
    return !!token && !isTokenExpired(token);
  }

  /**
   * Obtiene el token JWT actual.
   * @returns {string|null}
   */
  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  /**
   * Guarda el email del usuario.
   * @param {string} email
   */
  function saveUserEmail(email) {
    localStorage.setItem(EMAIL_KEY, email);
  }

  /**
   * Obtiene el email guardado.
   * @returns {string|null}
   */
  function getUserEmail() {
    return localStorage.getItem(EMAIL_KEY);
  }

  /**
   * Obtiene el código de acceso guardado.
   * @returns {string|null}
   */
  function getAccessCode() {
    return localStorage.getItem(ACCESS_CODE_KEY);
  }

  /**
   * Verifica si el token JWT ha expirado usando su campo 'exp'.
   * @param {string} token
   * @returns {boolean}
   */
  function isTokenExpired(token) {
    if (!token) return true;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (!payload.exp) return false;
      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp < currentTime;
    } catch (e) {
      return true;
    }
  }

  /**
   * Valida la sesión y redirige si no está autenticado.
   * @param {string} redirectUrl
   */
  function validateSession(redirectUrl = 'index.html') {
    if (!isLoggedIn()) {
      logout();
      window.location.href = redirectUrl;
      return false;
    }
    return true;
  }

  // API pública
  return {
    login,
    logout,
    isLoggedIn,
    getToken,
    saveUserEmail,
    getUserEmail,
    getAccessCode,
    isTokenExpired,
    validateSession
  };
})();

// Exporta el módulo en el contexto global si es necesario.
window.auth = auth;
