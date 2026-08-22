FROM python:3.12-slim

WORKDIR /app

COPY apps/pyweb /app/apps/pyweb

RUN pip install --no-cache-dir /app/apps/pyweb

EXPOSE 8080

CMD ["pyweb", "--host", "0.0.0.0", "--port", "8080", "--static-root", "/srv/static", "--simple-auth"]
