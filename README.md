# Sistema de Adquisiciones - Facultad de Ingeniería UACH 🎓

Sistema web para la gestión de requisiciones de compras internas en la Facultad de Ingeniería (UACH).

## 🚀 Tecnologías Utilizadas
- Backend: Django + Django REST Framework + PostgreSQL
- Frontend: React + Vite + Tailwind CSS
- Base de datos: PostgreSQL
- Autenticación: JWT Tokens + Emails (SMTP)
- Despliegue: Cloud VPS / Docker (opcional)

---

## 📂 Estructura del Proyecto

sistema-adquisiciones/
│
├── backend/ # Django API (core, users, requisitions)
│ ├── core/ # Configuración principal de Django
│ ├── users/ # Módulo de usuarios y autenticación
│ ├── requisitions/ # Módulo de requisiciones e ítems
│ ├── media/ # Archivos subidos (media root)
│ ├── staticfiles/ # Archivos estáticos generados
│ ├── logs/ # Logs de la aplicación
│ ├── manage.py
│ └── requirements.txt
│
├── frontend/ # React Frontend (Vite + Tailwind)
│ ├── src/
│ ├── public/
│ └── package.json
│
├── .gitignore
├── README.md
└── .env.example


---

## 🛠️ Instalación y Configuración

### 1️⃣ Clonar el repositorio
```bash
git clone https://github.com/tu-usuario/sistema-adquisiciones.git
cd sistema-adquisiciones

2️⃣ Backend - Django (Python)

cd backend
python -m venv venv
venv\Scripts\activate  # En Windows
pip install -r requirements.txt

3️⃣ Configurar entorno (.env)
Copia .env.example como .env y completa las variables:

DEBUG=True
SECRET_KEY=tu-clave-secreta
DB_NAME=sistema_adquisiciones
DB_USER=postgres
DB_PASSWORD=tu-password
DB_HOST=localhost
DB_PORT=5432
EMAIL_HOST_USER=tu-correo@gmail.com
EMAIL_HOST_PASSWORD=clave-de-aplicación

4️⃣ Aplicar migraciones y crear superusuario

python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser

5️⃣ Ejecutar servidor de desarrollo

python manage.py runserver

6️⃣ Frontend - React (Opcional si ya tienes preparado)

cd ../frontend
npm install
npm run dev

🗂️ Flujo de Ramas (Git Flow)
main → Rama de producción

dev → Rama de desarrollo principal

feature/xxx → Funcionalidades nuevas

bugfix/xxx → Correcciones de errores

hotfix/xxx → Fix urgente en producción

release/vX.X.X → Preparación de nueva versión estable

git checkout -b feature/nueva-funcionalidad
git commit -m "Agrega módulo de autorizaciones"
git push origin feature/nueva-funcionalidad

# Merge a dev (Pull Request en GitHub)
# Luego merge dev → main para producción

🗄️ Despliegue a Producción (Pasos)
Revisar rama main actualizada

Subir migraciones a la base de datos:

python manage.py migrate --settings=core.settings.production

Recolectar archivos estáticos:

python manage.py collectstatic --noinput

Reiniciar servicio (gunicorn / docker-compose)

Validar el sitio en producción

📝 To-Do List (Fases del Proyecto)
 Configuración inicial Django + PostgreSQL

 Autenticación con JWT y correo SMTP

 CRUD de usuarios y roles

 CRUD de requisiciones e ítems

 Generación de PDF institucional (sin almacenamiento)

 Dashboard de seguimiento por usuario (autorizaciones)

 Despliegue en servidor de producción

 Manual de usuario y documentación API

📧 Contacto
Luis Fernando Casas Borja
Email: luisfernandocasasborja@gmail.com