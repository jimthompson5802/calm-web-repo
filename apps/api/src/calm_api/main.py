from fastapi import FastAPI

app = FastAPI(title="calm-api")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
