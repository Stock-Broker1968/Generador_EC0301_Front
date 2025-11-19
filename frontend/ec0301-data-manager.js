// Interfaz/ec0301-data-manager.js
// Gestor de datos del proyecto EC0301 basado en localStorage

const EC0301Manager = (function () {
  'use strict';

  const DATA_KEY = 'EC0301_ProyectoData';
  let projectData = {};

  function loadDataFromStorage() {
    try {
      const stored = localStorage.getItem(DATA_KEY);
      projectData = stored ? JSON.parse(stored) : {};
      if (typeof projectData !== 'object' || projectData === null) {
        projectData = {};
      }
      console.log('[DataManager] Datos cargados.');
    } catch (e) {
      console.error('[DataManager] Error al cargar datos:', e);
      projectData = {};
    }
  }

  function saveDataToStorage() {
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(projectData));
      // console.log('[DataManager] Datos guardados.');
    } catch (e) {
      console.error('[DataManager] Error al guardar datos:', e);
    }
  }

  function getData() {
    return JSON.parse(JSON.stringify(projectData));
  }

  function saveData(data) {
    try {
      projectData = data || {};
      saveDataToStorage();
      return true;
    } catch (e) {
      console.error('[DataManager] Error en saveData:', e);
      return false;
    }
  }

  // --- API antigua "productos" (compatibilidad) ---

  function ensureProductos() {
    if (!projectData.productos) projectData.productos = {};
  }

  function saveProduct(productName, data) {
    try {
      ensureProductos();
      projectData.productos[productName] = data;
      saveDataToStorage();
      return true;
    } catch (e) {
      console.error('[DataManager] Error al guardar producto:', e);
      return false;
    }
  }

  function loadProduct(productName) {
    try {
      ensureProductos();
      const prod = projectData.productos[productName];
      return prod ? JSON.parse(JSON.stringify(prod)) : null;
    } catch (e) {
      console.error('[DataManager] Error al cargar producto:', e);
      return null;
    }
  }

  // --- API nueva "módulos" (para control de avance y candados) ---

  function ensureModulos() {
    if (!projectData.modulos) projectData.modulos = {};
  }

  function setModuleData(moduleKey, data) {
    try {
      ensureModulos();
      const current = projectData.modulos[moduleKey] || {};
      projectData.modulos[moduleKey] = {
        ...current,
        ...data,
        lastUpdate: new Date().toISOString()
      };
      saveDataToStorage();
      return true;
    } catch (e) {
      console.error('[DataManager] Error al guardar módulo', moduleKey, e);
      return false;
    }
  }

  function getModuleData(moduleKey) {
    try {
      ensureModulos();
      const mod = projectData.modulos[moduleKey];
      return mod ? JSON.parse(JSON.stringify(mod)) : null;
    } catch (e) {
      console.error('[DataManager] Error al obtener módulo', moduleKey, e);
      return null;
    }
  }

  function clearData() {
    projectData = {};
    localStorage.removeItem(DATA_KEY);
    console.log('[DataManager] Datos borrados.');
  }

  loadDataFromStorage();

  return {
    getData,
    saveData,
    saveProduct,
    loadProduct,
    clearData,
    // Nueva API
    setModuleData,
    getModuleData
  };
})();

window.EC0301Manager = EC0301Manager;
