FROM node:20-alpine AS build
WORKDIR /app

# Render traduce automáticamente las Environment Variables del dashboard a
# --build-arg, PERO Docker las ignora si no hay un ARG declarado aquí que las
# reciba. Sin esto, Vite compila con los valores de fallback (placeholder) y
# el frontend en producción no puede hablar con Supabase ni con el backend.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/package*.json ./
RUN cd server && npm ci --omit=dev && cd ..
EXPOSE 3002
CMD ["node", "server/index.js"]
