FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

# Copy manifests first — npm ci layer is cached until package-lock.json changes
COPY package*.json ./

# HUSKY=0 skips the prepare script (git hooks make no sense inside a container)
RUN HUSKY=0 npm ci

COPY . .

# Fail the image build immediately if TypeScript doesn't compile
RUN npm run typecheck

CMD ["npm", "run", "test:ci"]
