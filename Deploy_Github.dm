# 🚀 Guía de Despliegue en GitHub - SkillsCert EC0301

## 📋 Checklist Pre-Despliegue

Antes de subir el código a GitHub, verifica:

- [ ] Archivo `.env` NO está incluido (solo `.env.example`)
- [ ] `.gitignore` está configurado correctamente
- [ ] Credenciales de Stripe/WhatsApp removidas del código
- [ ] Todos los archivos JavaScript están en `/sistema_central/`
- [ ] README.md está actualizado con tu información
- [ ] LICENSE incluido (MIT recomendado)

---

## 🔧 PASO 1: Preparar el Repositorio Local

### 1.1 Estructura Final del Proyecto

```bash
skillscert-ec0301/
├── index.html
├── sistema_central/
│   ├── ec0301-data-manager.js
│   ├── auth.js
│   └── payment.js
├── .env.example
├── .gitignore
├── README.md
├── package.json
└── DEPLOY_GITHUB.md (este archivo)
```

### 1.2 Inicializar Git

```bash
# Si no tienes Git instalado:
# Windows: https://git-scm.com/download/win
# Mac: brew install git
# Linux: sudo apt-get install git

# Navegar a tu carpeta del proyecto
cd ruta/a/skillscert-ec0301

# Inicializar repositorio
git init

# Verificar que .gitignore existe
cat .gitignore
```

### 1.3 Verificar que .env NO se subirá

```bash
# Este comando NO debe mostrar .env
git status

# Si aparece .env, agrégalo a .gitignore:
echo ".env" >> .gitignore
```

---

## 🌐 PASO 2: Crear Repositorio en GitHub

### 2.1 Crear Nuevo Repositorio

1. Ve a [github.com](https://github.com)
2. Click en **"New repository"** (botón verde)
3. Configurar:
   - **Repository name**: `skillscert-ec0301`
   - **Description**: Sistema Integral EC0301 para Diseño de Cursos
   - **Visibility**: 🔒 Private (recomendado) o 🌍 Public
   - ❌ **NO marcar** "Add README" (ya lo tienes)
   - ❌ **NO marcar** "Add .gitignore" (ya lo tienes)
4. Click **"Create repository"**

### 2.2 Copiar URL del Repositorio

GitHub mostrará algo como:
```
https://github.com/TU-USUARIO/skillscert-ec0301.git
```

**¡GUARDA ESTA URL!**

---

## 📤 PASO 3: Subir Código a GitHub

### 3.1 Configurar Git (Primera Vez)

```bash
# Configurar tu nombre
git config --global user.name "Tu Nombre"

# Configurar tu email (el de GitHub)
git config --global user.email "tu-email@ejemplo.com"
```

### 3.2 Preparar Archivos

```bash
# Ver estado actual
git status

# Agregar TODOS los archivos
git add .

# O agregar selectivamente:
git add index.html
git add sistema_central/
git add .gitignore
git add README.md
git add package.json
git add .env.example
```

### 3.3 Hacer el Primer Commit

```bash
git commit -m "Initial commit: SkillsCert EC0301 v2.0.0

- Sistema completo de diseño de cursos EC0301
- Integración con Stripe para pagos
- Autenticación con códigos de WhatsApp
- 6 módulos: Carta, Logística, Evaluaciones, Manuales, Resultados, Auditoría
- Sistema de auto-guardado y exportación"
```

### 3.4 Conectar con GitHub

```bash
# Conectar al repositorio remoto (usa TU URL)
git remote add origin https://github.com/TU-USUARIO/skillscert-ec0301.git

# Verificar conexión
git remote -v
```

### 3.5 Subir el Código

```bash
# Primera subida (main branch)
git branch -M main
git push -u origin main

# Se te pedirá usuario y contraseña de GitHub
# O puedes usar un Personal Access Token (recomendado)
```

---

## 🔑 PASO 4: Configurar Personal Access Token (PAT)

Si GitHub pide contraseña y falla:

### 4.1 Crear Token

1. GitHub → Settings (tu perfil)
2. Developer settings → Personal access tokens → Tokens (classic)
3. **"Generate new token"** → **"Generate new token (classic)"**
4. Configurar:
   - **Note**: `SkillsCert EC0301 Deploy`
   - **Expiration**: 90 days (o más)
   - **Scopes**: Marcar ✅ `repo` completo
5. **Generate token**
6. **COPIA EL TOKEN** (no lo volverás a ver)

### 4.2 Usar Token en Git

```bash
# Cuando te pida contraseña, pega el TOKEN (no tu contraseña)
Username: tu-usuario-github
Password: ghp_XXXXXXXXXXXXXXXXXXXX (tu token)

# O configura credenciales:
git config --global credential.helper cache
git push
```

---

## ✅ PASO 5: Verificar Despliegue

### 5.1 Ver en GitHub

1. Recarga tu repositorio: `https://github.com/TU-USUARIO/skillscert-ec0301`
2. Deberías ver:
   - ✅ index.html
   - ✅ /sistema_central/ (carpeta)
   - ✅ README.md renderizado
   - ✅ .gitignore
   - ❌ .env (NO debe aparecer)

### 5.2 Verificar .gitignore

```bash
# Estos archivos NO deben estar en GitHub:
# - .env
# - node_modules/
# - *.log
# - .DS_Store
```

---

## 🌐 PASO 6: Configurar GitHub Pages (Opcional)

Si quieres hosting gratuito en GitHub:

### 6.1 Activar GitHub Pages

1. Tu Repositorio → **Settings**
2. Scroll a **"Pages"**
3. Source: **Deploy from a branch**
4. Branch: **main** / **/ (root)**
5. **Save**

### 6.2 Esperar Despliegue

- Demora 2-5 minutos
- URL será: `https://TU-USUARIO.github.io/skillscert-ec0301/`

### ⚠️ IMPORTANTE para GitHub Pages

**GitHub Pages NO soporta backend**, solo archivos estáticos.

**Necesitas:**
1. Backend separado (Render, Railway, Heroku)
2. Actualizar `BACKEND_URL` en tu frontend

---

## 🔄 PASO 7: Actualizaciones Futuras

### 7.1 Hacer Cambios

```bash
# 1. Edita tus archivos
nano sistema_central/auth.js

# 2. Ver cambios
git status
git diff

# 3. Agregar cambios
git add sistema_central/auth.js

# 4. Commit descriptivo
git commit -m "fix: Corregir validación de códigos de acceso"

# 5. Subir a GitHub
git push origin main
```

### 7.2 Commits Semánticos (Recomendado)

```bash
git commit -m "feat: Agregar módulo de estadísticas"
git commit -m "fix: Corregir error en exportación PDF"
git commit -m "docs: Actualizar README con ejemplos"
git commit -m "style: Mejorar diseño responsive"
git commit -m "refactor: Optimizar carga de datos"
```

---

## 🔒 PASO 8: Seguridad en GitHub

### 8.1 Proteger Rama Main

1. Settings → Branches
2. **Add rule**
3. Branch name pattern: `main`
4. Marcar:
   - ✅ Require pull request reviews
   - ✅ Require status checks

### 8.2 Configurar Secrets (Variables de Entorno)

Para GitHub Actions o Pages:

1. Settings → Secrets and variables → Actions
2. **New repository secret**
3. Agregar:
   - `STRIPE_PUBLIC_KEY`
   - `BACKEND_URL`
   - etc.

### 8.3 Habilitar Dependabot

1. Settings → Code security and analysis
2. **Enable** Dependabot alerts
3. **Enable** Dependabot security updates

---

## 📊 PASO 9: Configurar README Badges (Opcional)

Agrega badges al inicio de tu README:

```markdown
![Build](https://img.shields.io/github/workflow/status/TU-USUARIO/skillscert-ec0301/CI)
![Version](https://img.shields.io/github/package-json/v/TU-USUARIO/skillscert-ec0301)
![License](https://img.shields.io/github/license/TU-USUARIO/skillscert-ec0301)
![Stars](https://img.shields.io/github/stars/TU-USUARIO/skillscert-ec0301)
```

---

## 🐛 SOLUCIÓN DE PROBLEMAS

### Problema 1: Git no reconoce cambios

```bash
git status
# Si dice "nothing to commit", verifica:
ls -la  # Ver archivos ocultos
git add . -f  # Forzar agregar
```

### Problema 2: Error "remote origin already exists"

```bash
git remote remove origin
git remote add origin https://github.com/TU-USUARIO/skillscert-ec0301.git
```

### Problema 3: Archivo .env se subió por error

```bash
# URGENTE: Remover del historial
git rm --cached .env
git commit -m "Remove .env from repository"
git push

# Luego:
# 1. Rotar TODAS las credenciales en Stripe/Twilio
# 2. Generar nuevos secrets
# 3. Actualizar .env local
```

### Problema 4: Push rechazado

```bash
# Primero bajar cambios remotos
git pull origin main --rebase

# Resolver conflictos si hay
# Luego push
git push origin main
```

---

## ✨ COMANDOS ÚTILES

### Ver Historial

```bash
git log --oneline --graph --all
```

### Crear Nueva Rama

```bash
git checkout -b feature/nueva-funcionalidad
# Hacer cambios
git add .
git commit -m "feat: Nueva funcionalidad"
git push origin feature/nueva-funcionalidad
```

### Volver a Versión Anterior

```bash
# Ver commits
git log --oneline

# Volver a commit específico
git checkout abc1234

# Crear rama desde ahí
git checkout -b fix/rollback
```

### Limpiar Archivos No Rastreados

```bash
# Ver qué se eliminará
git clean -n

# Eliminar (CUIDADO)
git clean -fd
```

---

## 📞 SOPORTE

Si tienes problemas:

1. 📖 [GitHub Docs](https://docs.github.com)
2. 💬 [GitHub Community](https://github.community)
3. ✉️ Contacto: soporte@skillscert.com

---

## ✅ CHECKLIST FINAL

Después del despliegue, verifica:

- [ ] Código visible en GitHub
- [ ] README se ve correctamente
- [ ] .env NO está en el repositorio
- [ ] Links en README funcionan
- [ ] GitHub Pages activo (si lo usas)
- [ ] Secrets configurados
- [ ] Colaboradores agregados (si aplica)
- [ ] Descripción del repo completa
- [ ] Topics agregados (ec0301, elearning, etc.)

---

## 🎉 ¡Listo!

Tu proyecto **SkillsCert EC0301** está ahora en GitHub.

**Próximos pasos:**
1. ⭐ Poner estrella a tu propio repo (para probarlo)
2. 📢 Compartir el link
3. 🚀 Comenzar a desarrollar nuevas features

```bash
# Para clonar en otra máquina:
git clone https://github.com/TU-USUARIO/skillscert-ec0301.git
cd skillscert-ec0301
cp .env.example .env
# Editar .env con credenciales
# ¡A trabajar!
```

---

**¿Dudas?** Abre un [Issue](https://github.com/TU-USUARIO/skillscert-ec0301/issues)
