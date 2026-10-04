# NEXT_PUBLIC_* values are compiled into the client bundle, so pass them as build args.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_FAIRDROP_LIVE=1
ARG NEXT_PUBLIC_ML_API_URL=http://localhost:8001
ENV NEXT_PUBLIC_FAIRDROP_LIVE=$NEXT_PUBLIC_FAIRDROP_LIVE NEXT_PUBLIC_ML_API_URL=$NEXT_PUBLIC_ML_API_URL
RUN npx next build
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
