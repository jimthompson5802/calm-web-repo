.PHONY: start-webserver-noauth start-webserver-authonly start-webserver-authcerts stop-webserver bootstrap test-api typecheck-web _prepare-rendered-static

_prepare-rendered-static:
	@test -n "$(STATIC_SOURCE)"
	rm -rf infra/nginx/rendered-static
	mkdir -p infra/nginx/rendered-static
	cp -R "$(STATIC_SOURCE)"/. infra/nginx/rendered-static


# start the nginx server without auth using the noauth static tree
start-webserver-noauth:
	@host="$$(python3 ./scripts/detect_public_host.py)"; \
		export CALM_PUBLIC_HOST="$$host"; \
		echo "Using local stack host: $$host"; \
		$(MAKE) STATIC_SOURCE=static_noauth _prepare-rendered-static; \
		CALM_NGINX_CONF_PATH=./infra/nginx/nginx.noauth.conf CALM_NGINX_PORT_MAP=8080:8080 docker-compose up -d --no-deps nginx


# start the full auth stack using the authonly static tree
start-webserver-authonly:
	@host="$$(python3 ./scripts/detect_public_host.py)"; \
		export CALM_PUBLIC_HOST="$$host"; \
		echo "Using local stack host: $$host"; \
		./scripts/generate-local-certs.sh; \
		./scripts/render-keycloak-realm.py; \
		./scripts/render-direct-url-auth-config.py; \
		$(MAKE) STATIC_SOURCE=static_authonly _prepare-rendered-static; \
		docker-compose up -d keycloak oauth2-proxy nginx


# start the full auth stack using the authcerts static tree
start-webserver-authcerts:
	@host="$$(python3 ./scripts/detect_public_host.py)"; \
		export CALM_PUBLIC_HOST="$$host"; \
		echo "Using local stack host: $$host"; \
		./scripts/generate-local-certs.sh; \
		./scripts/render-keycloak-realm.py; \
		./scripts/render-direct-url-auth-config.py; \
		$(MAKE) STATIC_SOURCE=static_authcerts _prepare-rendered-static; \
		docker-compose up -d keycloak oauth2-proxy nginx


# stop the nginx server and remove compose resources
stop-webserver:
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
