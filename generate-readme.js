// generate-readme.js
import fs from "fs";
import path from "path";

// --- Helpers ---
function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function generateTree(dir, prefix = "") {
  const items = fs.readdirSync(dir);
  return items
    .map((item, idx) => {
      const isLast = idx === items.length - 1;
      const pointer = isLast ? "└── " : "├── ";
      const fullPath = path.join(dir, item);

      if (fs.statSync(fullPath).isDirectory()) {
        return (
          prefix +
          pointer +
          "📂 " +
          item +
          "\n" +
          generateTree(fullPath, prefix + (isLast ? "    " : "│   "))
        );
      } else {
        return prefix + pointer + "📄 " + item;
      }
    })
    .join("\n");
}

function extractHttpRoutes(routesDir) {
  if (!fs.existsSync(routesDir)) return [];
  const files = fs.readdirSync(routesDir).filter((f) => f.endsWith(".js"));
  let endpoints = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(routesDir, file), "utf-8");
    const regex = /router\.(get|post|put|delete)\(["'`](.*?)["'`]/g;
    let match;
    while ((match = regex.exec(content))) {
      endpoints.push(`\`${match[1].toUpperCase()} ${match[2]}\``);
    }
  }
  return endpoints;
}

function listHandlers(wsDir) {
  if (!fs.existsSync(wsDir)) return [];
  return fs
    .readdirSync(wsDir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => "🎧 " + f.replace(".js", ""));
}

function generateMermaid() {
  return `
\`\`\`mermaid
flowchart TD
  A[⚙️ application] --> B[🏛 domain]
  B --> C[🌐 infrastructure]
  C --> D[🛠 shared]
  D --> A
\`\`\`
`;
}

// --- Nuevo: Información de Swagger ---
function addSwaggerInfo() {
  return `
## 📚 Documentación API

- 🌐 **Swagger UI**: [http://localhost:2000/api-docs](http://localhost:2000/api-docs)
- 🏷️ **Versión API**: 1.0.0
- 📝 **Formato**: OpenAPI 3.0 (Swagger)
- 🧾 **Anotaciones**: JSDoc en rutas HTTP
- 👤 **Desarrollador**: Max Cereceda — [maxcereceda.com](https://maxcereceda.com)
`;
}

// --- Main ---
const rootDir = process.cwd();
const pkg = readJSON(path.join(rootDir, "package.json"));

const scripts = pkg.scripts || {};
const dependencies = pkg.dependencies || {};
const devDependencies = pkg.devDependencies || {};
const srcDir = path.join(rootDir, "src");
const routesDir = path.join(srcDir, "infrastructure", "http", "routes");
const wsDir = path.join(srcDir, "infrastructure", "ws");

const projectTree = generateTree(srcDir);
const endpoints = extractHttpRoutes(routesDir);
const handlers = listHandlers(wsDir);

const readme = `
# 🎰 ${pkg.name || "Backend Project"} v${pkg.version || "1.0.0"}

[![Node.js](https://img.shields.io/badge/node-%3E%3D18-green?logo=node.js)]()
[![License](https://img.shields.io/badge/license-${pkg.license || "MIT"}-blue?logo=open-source-initiative)]()
[![Prisma](https://img.shields.io/badge/ORM-Prisma-2D3748?logo=prisma)]()
[![Socket.io](https://img.shields.io/badge/realtime-socket.io-lightgrey?logo=socket.io)]()

${pkg.description || "🎲 Backend estructurado con Clean Architecture para Ruleta y Torneos de Casino. Soporta API REST, comunicación WS y persistencia con Prisma ORM."}

---

## 🚀 Scripts disponibles

${
  Object.entries(scripts)
    .map(([cmd, val]) => "- 📝 `" + cmd + "`: " + val)
    .join("\n") || "No hay scripts definidos."
}

---

## 📦 Dependencias principales

- **Runtime**:
${
  Object.entries(dependencies)
    .map(([dep, ver]) => "  - 📌 " + dep + " " + ver)
    .join("\n") || "  Ninguna"
}

- **Dev**:
${
  Object.entries(devDependencies)
    .map(([dep, ver]) => "  - 🛠 " + dep + " " + ver)
    .join("\n") || "  Ninguna"
}

---

## 🏗️ Estructura del proyecto

\`\`\`
${projectTree}
\`\`\`

${generateMermaid()}

---

## 📡 Endpoints HTTP

${endpoints.length ? endpoints.map((e) => "- 🌍 " + e).join("\n") : "⚠️ No se detectaron endpoints."}

---

## 📚 Documentación API

${addSwaggerInfo()}

---

## 🎧 Handlers WS

${handlers.length ? handlers.join("\n") : "⚠️ No se detectaron handlers."}

---

## ▶️ Cómo correr el proyecto

1. 📦 Instalar dependencias:

   \`\`\`bash
   npm install
   \`\`\`

2. 🚀 Correr en desarrollo:

   \`\`\`bash
   npm run dev
   \`\`\`

3. 🧪 Ejecutar pruebas:

   \`\`\`bash
   npm test
   \`\`\`

---

## 📖 Notas

- 🗄 **ORM**: Prisma  
- 🏗 **Arquitectura**: Clean Architecture  
- 📜 **Logs**: consola (se puede extender a Winston o Pino)  

---

## 👤 Autor

<table>
  <tr>
    <td align="center">
      <a href="https://maxcereceda.com/">
        <img src="https://avatars.githubusercontent.com/u/174754808?v=4" width="120px;" alt="Max Cereceda"/>
        <br />
        <sub><b>Max Cereceda</b></sub>
      </a>
      <br />
      🌐 <a href="https://maxcereceda.com/">maxcereceda.com</a><br />
      🐙 <a href="https://github.com/maxcerecedadev">GitHub</a><br />
      📧 <a href="mailto:maxcerecedadev@gmail.com">Email</a><br />
      📞 <a href="tel:+51967737252">WhatsApp</a>
    </td>
  </tr>
</table>
`;

fs.writeFileSync(path.join(rootDir, "README.md"), readme);
console.log("✅ README.md actualizado con documentación de Swagger y enlaces del autor");