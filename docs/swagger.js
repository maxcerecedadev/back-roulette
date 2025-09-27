import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "API de Juego",
      version: "1.0.0",
      description: "Documentación de la API",
      contact: {
        name: "Max Cereceda",
        url: "https://maxcereceda.com",
        email: "maxcerecedadev@gmail.com",
      },
    },
    servers: [
      {
        url: "https://roulette-back-h0r0.onrender.com/api/v1",
        description: "Servidor producción",
      },
      {
        url: "http://localhost:2000/api/v1",
        description: "Servidor local",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: ["./src/infrastructure/http/routes/*.js"],
};

const specs = swaggerJsdoc(options);

export { specs, swaggerUi };
