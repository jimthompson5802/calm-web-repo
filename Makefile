# start up the nginx server to serve CALM content
start-web-server:
	@host="$$(python3 ./scripts/detect_public_host.py)"; \
		export CALM_PUBLIC_HOST="$$host"; \
		echo "Using local stack host: $$host"; \
		./scripts/generate-local-certs.sh; \
		./scripts/render-keycloak-realm.py; \
		./scripts/render-static-content.py; \
		docker-compose up -d keycloak oauth2-proxy nginx


# stop the nginx server and remove compose resources
stop-web-server:
	docker-compose down


# future use
bootstrap:
	@echo "Python: cd apps/api && uv sync"
	@echo "TypeScript: cd apps/web && npm install"


# future use
test-api:
	cd apps/api && uv run pytest

# future use
typecheck-web:
	cd apps/web && npm run typecheck
