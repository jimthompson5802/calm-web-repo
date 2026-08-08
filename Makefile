# start up the nginx server to serve CALM content
start-web-server:
	docker-compose up -d nginx


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
