# 🎲 Roulette Backend

Servidor backend para la aplicación de ruleta, construido con Node.js, Express y Socket.IO para comunicación en tiempo real.

## 🚀 Tecnologías utilizadas

- **Servidor**: Node.js + Express
- **WebSockets**: Socket.IO
- **Utilidades**: UUID, Dotenv
- **Testing**: Jest
- **Herramientas**: Nodemon, ESLint

## 📦 Instalación

1. Clona el repositorio:

   ```bash
   git clone <URL_DEL_REPO_BACKEND>
   cd roulette-back
   ```

2. Instala las dependencias:

   ```bash
   npm install
   ```

3. Crea un archivo `.env` con las variables necesarias (ejemplo):

   ```env
   PORT=3000
   ```

4. Inicia el servidor en modo desarrollo:
   ```bash
   npm run dev
   ```

## 🛠 Scripts disponibles

- `npm run dev`: Ejecuta el servidor con nodemon.
- `npm start`: Arranca el servidor en producción.
- `npm run lint`: Corre ESLint sobre el código.
- `npm test`: Corre los tests con Jest.

## 📂 Estructura del proyecto

```
roulette-back/
├── server.js        # Punto de entrada del servidor
├── routes/          # Endpoints de la API
├── sockets/         # Lógica de comunicación en tiempo real
├── tests/           # Pruebas con Jest
└── package.json
```

---
