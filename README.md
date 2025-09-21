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

---

```
backend
├─ classes
│  ├─ BetLimits.js
│  ├─ BetPayoutCalculator.js
│  ├─ BetValidator.js
│  ├─ Player.js
│  ├─ RouletteEngine.js
│  ├─ SinglePlayerRoom.js
│  └─ TournamentRoom.js
├─ constants
│  └─ errorMessages.js
├─ Diagram.md
├─ eslint.config.js
├─ handlers
│  ├─ singlePlayerHandler.js
│  └─ tournamentHandler.js
├─ jsconfig.json
├─ middleware
│  └─ adminAuth.js
├─ package-lock.json
├─ package.json
├─ prisma
│  ├─ index.js
│  ├─ migrations
│  │  ├─ 20250915055429_init
│  │  │  └─ migration.sql
│  │  ├─ 20250916000932_add_failed_transaction_table
│  │  │  └─ migration.sql
│  │  ├─ 20250919030444_create_tournament_tables
│  │  │  └─ migration.sql
│  │  └─ migration_lock.toml
│  └─ schema.prisma
├─ README.md
├─ routes
│  └─ gameRoutes.js
├─ server.js
├─ services
│  ├─ casinoApiService.js
│  └─ gameManager.js
├─ test
│  ├─ BetPayoutCalculator.test.js
│  ├─ full-combination.test.js
│  └─ processPayout.test.js
└─ utils
   ├─ errorHandler.js
   └─ timezone.js

```
