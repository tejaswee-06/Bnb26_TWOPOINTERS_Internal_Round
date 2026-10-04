# Person 2 ML service (development integration boundary)
Separate FastAPI process; the Next.js app reaches it only through `lib/ml/client.ts` (`NEXT_PUBLIC_ML_API_URL`, default http://127.0.0.1:8001).
`main.py` is Person 2's file, unmodified; it reads `../fairdrop_ml_output.json` (repo root). Other package files live in `docs/ml/`.

    cd ml_api && pip install -r requirements.txt && python -m uvicorn main:app --port 8001

ML output is advisory: it never touches queue, inventory or allocation. If the service is down the admin pages show "ML SERVICE OFFLINE".
