# 🎓 SkillsCert EC0301 - Sistema Integral de Diseño de Cursos

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.0.0-green.svg)](package.json)
[![Status](https://img.shields.io/badge/status-production-success.svg)]()

Sistema profesional para el diseño completo de cursos de capacitación bajo el estándar **EC0301 del CONOCER**, especializado en **teleformación en línea**.

---

## 📋 Tabla de Contenidos

- [Características](#-características)
- [Requisitos](#-requisitos)
- [Instalación](#-instalación)
- [Configuración](#-configuración)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Uso](#-uso)
- [Módulos del Sistema](#-módulos-del-sistema)
- [API y Endpoints](#-api-y-endpoints)
- [Seguridad](#-seguridad)
- [Despliegue](#-despliegue)
- [Contribuir](#-contribuir)
- [Licencia](#-licencia)
- [Soporte](#-soporte)

---

## ✨ Características

### 🎯 Cumplimiento EC0301
- ✅ Validación automática de criterios del estándar CONOCER
- ✅ Generación de portafolio de evidencias completo
- ✅ Auditoría integrada para certificación

### 🤖 Inteligencia Artificial
- Generación automática de contenido educativo
- Creación de instrumentos de evaluación
- Manuales del participante e instructor por IA

### 📊 Sistema Modular
1. **Carta Descriptiva** - Documento maestro del curso
2. **Logística** - Gestión operativa y administrativa
3. **Evaluaciones** - Diagnóstica, formativa, sumativa y satisfacción
4. **Manuales** - Material didáctico completo
5. **Resultados** - Captura de calificaciones y reportes
6. **Auditoría** - Validación final y exportación

### 💳 Sistema de Pagos
- Integración con Stripe
- Pago único de **$500 MXN**
- Códigos de acceso por WhatsApp
- Transacciones seguras PCI-DSS

### 💾 Gestión de Datos
- Persistencia local (LocalStorage)
- Auto-guardado cada 30 segundos
- Exportación/importación de proyectos
- Backups automáticos

---

## 🔧 Requisitos

### Navegadores Soportados
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Tecnologías Core
- HTML5
- CSS3 (Variables, Grid, Flexbox)
- JavaScript ES6+ (Módulos, Async/Await)

### Dependencias CDN
```html
<!-- Font Awesome 6.5.1 -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">

<!-- SweetAlert2 -->
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>

<!-- Stripe.js -->
<script src="https://js.stripe.com/v3/"></script>
```

---

## 📦 Instalación

### Opción 1: Clonar Repositorio

```bash
# Clonar el repositorio
git clone https://github.com/tu-usuario/skillscert-ec0301.git

# Entrar al directorio
cd skillscert-ec0301

# Copiar variables de entorno
cp .env.example .env

# Editar .env con tus credenciales
nano .env
```

### Opción 2: Descarga Directa

1. Descarga el ZIP del repositorio
2. Extrae los archivos
3. Copia `.env.example` a `.env`
4. Configura las variables de entorno

---

## ⚙️ Configuración

### 1. Variables de Entorno

Edita el archivo `.env`:

```bash
# Stripe
STRIPE_PUBLIC_KEY=pk_test_YOUR_KEY
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET

# Backend
BACKEND_URL=https://tu-backend.com

# WhatsApp
WHATSAPP_API_URL=https://api.twilio.com/...
WHATSAPP_AUTH_TOKEN=your_token

# JWT
JWT_SECRET=your_secure_secret_min_32_chars
```

### 2. Configurar Stripe

1. Crear cuenta en [stripe.com](https://stripe.com)
2. Obtener claves API (Dashboard → Developers → API Keys)
3. Configurar webhooks:
   - Endpoint: `https://tu-backend.com/webhook/stripe`
   - Eventos: `checkout.session.completed`, `payment_intent.succeeded`

### 3. Configurar WhatsApp (Twilio)

```bash
# Obtener credenciales en twilio.com
WHATSAPP_ACCOUNT_SID=ACXXXXXXXXXXXXXXXX
WHATSAPP_AUTH_TOKEN=your_auth_token
WHATSAPP_FROM_NUMBER=whatsapp:+14155238886
```

---

## 📁 Estructura del Proyecto

```
skillscert-ec0301/
├── index.html                    # Página principal
├── sistema_central/              # Core del sistema
│   ├── ec0301-data-manager.js    # Gestor de datos
│   ├── auth.js                   # Autenticación
│   └── payment.js                # Sistema de pagos
├── modulos/                      # Páginas de módulos
│   ├── carta-descriptiva.html
│   ├── logistica.html
│   ├── evaluaciones.html
│   ├── manuales.html
│   ├── resultados.html
│   └── auditoria.html
├── assets/                       # Recursos estáticos
│   ├── css/
│   ├── js/
│   └── images/
├── .env.example                  # Variables de entorno (template)
├── .gitignore                    # Archivos ignorados
├── README.md                     # Este archivo
└── LICENSE                       # Licencia MIT
```

---

## 🚀 Uso

### Modo Desarrollo Local

```bash
# Opción 1: Servidor Python
python -m http.server 8000

# Opción 2: Servidor Node.js
npx http-server -p 8000

# Opción 3: Live Server (VS Code)
# Instalar extensión "Live Server" y hacer clic derecho → Open with Live Server
```

Acceder a: `http://localhost:8000`

### Flujo de Usuario

1. **Acceso Inicial**
   - Usuario ingresa al sistema
   - Se muestra opción de pago ($500 MXN)

2. **Proceso de Pago**
   - Click en "Pagar Acceso"
   - Redirección a Stripe Checkout
   - Pago con tarjeta

3. **Recepción de Código**
   - Código de 6 dígitos enviado por WhatsApp
   - Válido por 48 horas

4. **Login**
   - Ingreso de código
   - Acceso al sistema completo

5. **Creación de Proyecto**
   - Completar módulos secuencialmente
   - Auto-guardado continuo
   - Exportación final

---

## 📚 Módulos del Sistema

### 1. Carta Descriptiva (40%)
**Función**: Documento maestro del curso

**Contenido**:
- Datos generales del curso
- Objetivo general
- Perfil de egreso
- Temario detallado
- Metodología didáctica
- Sistema de evaluación

**Salida**: Documento PDF estructurado

---

### 2. Logística (15%)
**Función**: Gestión operativa

**Contenido**:
- Lista de asistencia
- Contrato de aprendizaje
- Requerimientos técnicos
- Cronograma de sesiones

**Salida**: Pack de documentos administrativos

---

### 3. Evaluaciones (20%)
**Función**: Instrumentos de medición

**Contenido**:
- Evaluación diagnóstica
- Evaluación formativa
- Evaluación sumativa
- Encuesta de satisfacción
- Rúbricas de evaluación

**Salida**: Suite completa de evaluaciones

---

### 4. Manuales (15%)
**Función**: Material didáctico generado por IA

**Contenido**:
- Manual del Participante
- Manual del Instructor
- Presentaciones por tema
- Material de apoyo

**Salida**: Manuales en formato PDF/DOCX

---

### 5. Resultados (5%)
**Función**: Gestión de calificaciones

**Contenido**:
- Captura de calificaciones
- Reportes individuales
- Estadísticas grupales
- Constancias de participación

**Salida**: Certificados y reportes

---

### 6. Auditoría (5%)
**Función**: Validación y exportación

**Contenido**:
- Checklist EC0301
- Validación de cumplimiento
- Generación de portafolio (ZIP)
- Reporte de auditoría

**Salida**: Portafolio completo de evidencias

---

## 🔌 API y Endpoints

### Autenticación

```javascript
// Verificar código de acceso
POST /api/auth/verify-code
Body: { code: "123456" }
Response: { token, user: { email, userId } }

// Refrescar token
POST /api/auth/refresh
Headers: { Authorization: Bearer TOKEN }
Response: { token }

// Logout
POST /api/auth/logout
Headers: { Authorization: Bearer TOKEN }
```

### Pagos

```javascript
// Crear sesión de Stripe
POST /create-checkout-session
Response: { id: "cs_test_..." }

// Verificar pago
POST /api/payment/verify
Body: { sessionId }
Response: { success, accessCode, email }
```

### Datos del Proyecto

```javascript
// Los datos se manejan localmente (LocalStorage)
// Ver: sistema_central/ec0301-data-manager.js

EC0301Manager.getData()
EC0301Manager.setData(section, data)
EC0301Manager.exportProject()
```

---

## 🔒 Seguridad

### Implementado

✅ **HTTPS Obligatorio** en producción  
✅ **JWT** para autenticación  
✅ **Rate Limiting** en endpoints críticos  
✅ **CORS** configurado  
✅ **Input Validation** en todos los formularios  
✅ **XSS Protection** mediante sanitización  
✅ **CSRF Tokens** en formularios  

### Recomendaciones

⚠️ **Nunca** expongas claves en el código fuente  
⚠️ **Rota** tokens y secretos regularmente  
⚠️ **Usa** variables de entorno en hosting  
⚠️ **Implementa** 2FA para administradores  
⚠️ **Monitorea** logs de seguridad  

---

## 🌐 Despliegue

### Vercel (Recomendado)

```bash
# Instalar Vercel CLI
npm i -g vercel

# Deploy
vercel

# Configurar variables de entorno en:
# Vercel Dashboard → Settings → Environment Variables
```

### Netlify

```bash
# Instalar Netlify CLI
npm i -g netlify-cli

# Deploy
netlify deploy --prod

# Variables en: Site settings → Environment
```

### GitHub Pages

```bash
# Activar GitHub Pages en Settings → Pages
# Branch: main
# Folder: / (root)

# NOTA: GitHub Pages solo soporta sitios estáticos
# El backend debe estar en otro servidor
```

---

## 🤝 Contribuir

### Proceso

1. Fork el proyecto
2. Crea una rama: `git checkout -b feature/nueva-funcionalidad`
3. Commit: `git commit -m 'Agrega nueva funcionalidad'`
4. Push: `git push origin feature/nueva-funcionalidad`
5. Abre un Pull Request

### Estándares de Código

- **ES6+** para JavaScript
- **BEM** para nomenclatura CSS
- **JSDoc** para documentación
- **Prettier** para formato
- **ESLint** para linting

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver [LICENSE](LICENSE)

```
Copyright (c) 2024 SkillsCert EC0301

Permission is hereby granted, free of charge, to any person obtaining a copy...
```

---

## 💬 Soporte

### Documentación

📖 [Wiki del Proyecto](https://github.com/tu-usuario/skillscert-ec0301/wiki)  
📚 [Guías y Tutoriales](https://skillscert.com/docs)  

### Contacto

✉️ Email: soporte@skillscert.com  
💬 WhatsApp: +52 XXX XXX XXXX  
🐦 Twitter: [@SkillsCertMX](https://twitter.com/skillscertmx)  

### Reportar Problemas

🐛 [Issues en GitHub](https://github.com/tu-usuario/skillscert-ec0301/issues)

---

## 🙏 Créditos

Desarrollado con ❤️ por el equipo de **SkillsCert**

### Tecnologías Utilizadas

- [Stripe](https://stripe.com) - Procesamiento de pagos
- [Twilio](https://twilio.com) - Mensajería WhatsApp
- [Font Awesome](https://fontawesome.com) - Iconografía
- [SweetAlert2](https://sweetalert2.github.io) - Modales elegantes
- [Claude AI](https://anthropic.com) - Asistencia en desarrollo

---

## 📊 Roadmap

### v2.1.0 (Q1 2025)
- [ ] Integración con Zoom para clases en vivo
- [ ] Generador de contenido SCORM
- [ ] App móvil (React Native)

### v2.2.0 (Q2 2025)
- [ ] Panel de administración multi-usuario
- [ ] Plantillas de cursos predefinidas
- [ ] Análisis con Machine Learning

### v3.0.0 (Q3 2025)
- [ ] Marketplace de cursos
- [ ] Certificación blockchain
- [ ] API pública para integraciones

---

**⭐ Si este proyecto te fue útil, considera darle una estrella en GitHub**

```bash
git clone https://github.com/tu-usuario/skillscert-ec0301.git
cd skillscert-ec0301
# ¡A crear cursos increíbles! 🚀
```
