# Imagen del backend propio. Se construye desde la raíz del repo (necesita contract/ para los tipos):
#   docker build -f server/Dockerfile -t gestor-gastos-api .
FROM node:22-alpine

WORKDIR /app/server
ENV NODE_ENV=production

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY contract /app/contract
COPY server/src ./src
COPY server/db ./db
COPY server/tsconfig.json ./

USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:8787/health || exit 1
CMD ["npm", "start"]
