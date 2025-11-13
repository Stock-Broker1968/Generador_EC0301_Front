/**
 * EC0301 Data Manager - v2.0
 * Maneja el guardado y carga de datos del proyecto EC0301
 * en el LocalStorage del navegador.
 */
const EC0301Manager = (function() {
    'use strict';
    
    const DATA_KEY = 'EC0301_ProyectoData';
    let projectData = {};
    
    /**
     * Carga los datos del proyecto desde LocalStorage a la memoria.
     */
    function loadDataFromStorage() {
        try {
            const storedData = localStorage.getItem(DATA_KEY);
            if (storedData) {
                projectData = JSON.parse(storedData);
                console.log('[DataManager] Datos cargados desde LocalStorage.');
            } else {
                projectData = {};
                console.log('[DataManager] No hay datos previos. Proyecto vacío.');
            }
        } catch (e) {
            console.error('[DataManager] Error al cargar datos:', e);
            projectData = {};
        }
    }
    
    /**
     * Guarda los datos de la memoria en LocalStorage.
     */
    function saveDataToStorage() {
        try {
            localStorage.setItem(DATA_KEY, JSON.stringify(projectData));
            console.log('[DataManager] Datos guardados en LocalStorage.');
        } catch (e) {
            console.error('[DataManager] Error al guardar datos:', e);
            // Si hay error por límite de almacenamiento
            if (e.name === 'QuotaExceededError') {
                console.error('[DataManager] Límite de almacenamiento excedido.');
                alert('El almacenamiento local está lleno. Por favor, elimine datos antiguos.');
            }
        }
    }
    
    /**
     * Obtiene una copia de todos los datos del proyecto (la Carta Descriptiva principal).
     * @returns {object}
     */
    function getData() {
        // Devuelve una copia profunda para evitar mutaciones accidentales
        return JSON.parse(JSON.stringify(projectData));
    }
    
    /**
     * Guarda los datos de la Carta Descriptiva (el objeto principal).
     * @param {object} data - El objeto completo de la carta descriptiva.
     * @returns {boolean} - True si se guardó correctamente.
     */
    function saveData(data) {
        try {
            projectData = data;
            saveDataToStorage();
            console.log('[DataManager] Carta Descriptiva guardada correctamente.');
            return true;
        } catch (e) { 
            console.error('[DataManager] Error en saveData:', e);
            return false; 
        }
    }
    
    /**
     * Actualiza un campo específico de la Carta Descriptiva.
     * @param {string} fieldName - Nombre del campo a actualizar.
     * @param {any} value - Valor a asignar.
     * @returns {boolean}
     */
    function updateField(fieldName, value) {
        try {
            projectData[fieldName] = value;
            saveDataToStorage();
            console.log(`[DataManager] Campo "${fieldName}" actualizado.`);
            return true;
        } catch (e) {
            console.error(`[DataManager] Error al actualizar campo "${fieldName}":`, e);
            return false;
        }
    }
    
    /**
     * Guarda un "producto" específico (evaluaciones, manuales, etc.).
     * @param {string} productName - El nombre clave del producto (ej: 'evaluacion-sumativa').
     * @param {any} data - Los datos a guardar.
     * @returns {boolean}
     */
    function saveProduct(productName, data) {
        try {
            if (!projectData.productos) {
                projectData.productos = {};
            }
            projectData.productos[productName] = data;
            saveDataToStorage();
            console.log(`[DataManager] Producto "${productName}" guardado correctamente.`);
            return true;
        } catch (e) { 
            console.error(`[DataManager] Error en saveProduct (${productName}):`, e);
            return false; 
        }
    }
    
    /**
     * Carga un "producto" específico.
     * @param {string} productName - El nombre clave del producto.
     * @returns {any|null}
     */
    function loadProduct(productName) {
        try {
            if (projectData.productos && projectData.productos[productName]) {
                console.log(`[DataManager] Producto "${productName}" cargado.`);
                // Devuelve una copia profunda
                return JSON.parse(JSON.stringify(projectData.productos[productName]));
            }
            console.log(`[DataManager] Producto "${productName}" no encontrado.`);
            return null;
        } catch (e) { 
            console.error(`[DataManager] Error en loadProduct (${productName}):`, e);
            return null; 
        }
    }
    
    /**
     * Elimina un producto específico.
     * @param {string} productName - El nombre del producto a eliminar.
     * @returns {boolean}
     */
    function deleteProduct(productName) {
        try {
            if (projectData.productos && projectData.productos[productName]) {
                delete projectData.productos[productName];
                saveDataToStorage();
                console.log(`[DataManager] Producto "${productName}" eliminado.`);
                return true;
            }
            console.warn(`[DataManager] Producto "${productName}" no existe.`);
            return false;
        } catch (e) {
            console.error(`[DataManager] Error al eliminar producto "${productName}":`, e);
            return false;
        }
    }
    
    /**
     * Lista todos los productos guardados.
     * @returns {Array<string>}
     */
    function listProducts() {
        try {
            if (projectData.productos) {
                return Object.keys(projectData.productos);
            }
            return [];
        } catch (e) {
            console.error('[DataManager] Error al listar productos:', e);
            return [];
        }
    }
    
    /**
     * Limpia todos los datos del proyecto (usado en logout).
     */
    function clearData() {
        projectData = {};
        localStorage.removeItem(DATA_KEY);
        console.log('[DataManager] Todos los datos han sido borrados.');
    }
    
    /**
     * Exporta todos los datos a un archivo JSON.
     * @param {string} filename - Nombre del archivo (opcional).
     */
    function exportToJSON(filename = 'ec0301-proyecto.json') {
        try {
            const dataStr = JSON.stringify(projectData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
            console.log('[DataManager] Datos exportados correctamente.');
        } catch (e) {
            console.error('[DataManager] Error al exportar datos:', e);
        }
    }
    
    /**
     * Importa datos desde un archivo JSON.
     * @param {File} file - Archivo JSON a importar.
     * @returns {Promise<boolean>}
     */
    function importFromJSON(file) {
        return new Promise((resolve, reject) => {
            try {
                const reader = new FileReader();
                reader.onload = function(e) {
                    try {
                        const importedData = JSON.parse(e.target.result);
                        projectData = importedData;
                        saveDataToStorage();
                        console.log('[DataManager] Datos importados correctamente.');
                        resolve(true);
                    } catch (parseError) {
                        console.error('[DataManager] Error al parsear JSON:', parseError);
                        reject(parseError);
                    }
                };
                reader.onerror = function(error) {
                    console.error('[DataManager] Error al leer archivo:', error);
                    reject(error);
                };
                reader.readAsText(file);
            } catch (e) {
                console.error('[DataManager] Error en importFromJSON:', e);
                reject(e);
            }
        });
    }
    
    /**
     * Obtiene el tamaño actual del almacenamiento en bytes.
     * @returns {number}
     */
    function getStorageSize() {
        try {
            const dataStr = JSON.stringify(projectData);
            return new Blob([dataStr]).size;
        } catch (e) {
            console.error('[DataManager] Error al calcular tamaño:', e);
            return 0;
        }
    }
    
    /**
     * Verifica si hay datos guardados.
     * @returns {boolean}
     */
    function hasData() {
        return Object.keys(projectData).length > 0;
    }
    
    // Carga inicial al momento de que el script es leído
    loadDataFromStorage();
    
    // Exponer la API pública
    return {
        getData,
        saveData,
        updateField,
        loadProduct,
        saveProduct,
        deleteProduct,
        listProducts,
        clearData,
        exportToJSON,
        importFromJSON,
        getStorageSize,
        hasData
    };
})();

// Exportar para uso global
window.EC0301Manager = EC0301Manager;
