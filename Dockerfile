# Compass Bank research prototype: repository-root build context.
# The Node.js server serves sibling frontend folders and loads Python ML scripts.
FROM node:24-trixie-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN if [ -f backend/package-lock.json ]; then \
      npm --prefix backend ci --omit=dev; \
    else \
      npm --prefix backend install --omit=dev; \
    fi

RUN python3 -m venv /opt/compass-venv \
    && /opt/compass-venv/bin/pip install --no-cache-dir --upgrade pip \
    && if [ -f ml-models/requirements.txt ]; then \
         /opt/compass-venv/bin/pip install --no-cache-dir -r ml-models/requirements.txt; \
       elif [ -f backend/requirements.txt ]; then \
         /opt/compass-venv/bin/pip install --no-cache-dir -r backend/requirements.txt; \
       else \
         echo 'WARNING: No Python requirements found; ML and dataset processing require dependency verification.'; \
       fi

# Separate runtime for reconciled classification and regression
RUN python3 -m venv /opt/compass-reconciled-venv \
    && /opt/compass-reconciled-venv/bin/pip install --no-cache-dir -r backend/requirements-inference.txt
# The existing demo anti-abuse guard writes process-local security state here.
# This state is ephemeral in Railway and not a substitute for durable rate limiting.
RUN mkdir -p /app/backend/.compass-security \
    && chown -R node:node /app/backend/.compass-security

ENV NODE_ENV=production \
    PYTHONUNBUFFERED=1 \
    COMPASS_PYTHON=/opt/compass-venv/bin/python \
    COMPASS_PYTHON_INFERENCE=/opt/compass-reconciled-venv/bin/python

USER node
EXPOSE 3000
CMD ["npm", "--prefix", "backend", "start"]
