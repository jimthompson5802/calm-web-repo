bootstrap:
	@echo "Python: cd apps/api && uv sync"
	@echo "TypeScript: cd apps/web && npm install"

serve-static:
	docker-compose up nginx

test-api:
	cd apps/api && uv run pytest

typecheck-web:
	cd apps/web && npm run typecheck
