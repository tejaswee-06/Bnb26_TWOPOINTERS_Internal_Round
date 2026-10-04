"""Small reproducible HTTP load harness; metrics are measured, never fabricated.
Usage: python benchmarks/load_test.py --url http://127.0.0.1:8000 --requests 1000 --workers 50
"""
import argparse, concurrent.futures, statistics, time
import httpx


def one(url, event, i):
    started = time.perf_counter()
    try:
        r = httpx.post(f"{url}/allocation", json={"event_id": event, "user_id": f"load-{i}", "idempotency_key": f"load-{i}"}, timeout=10)
        ok = r.status_code < 500
        return (time.perf_counter()-started)*1000, ok, r.status_code
    except Exception:
        return (time.perf_counter()-started)*1000, False, 599


def main():
    p=argparse.ArgumentParser(); p.add_argument('--url',default='http://127.0.0.1:8000'); p.add_argument('--event',default='benchmark'); p.add_argument('--requests',type=int,default=1000); p.add_argument('--workers',type=int,default=50); args=p.parse_args()
    start=time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        results=list(pool.map(lambda i: one(args.url.rstrip('/'),args.event,i), range(args.requests)))
    elapsed=time.perf_counter()-start; lat=[x[0] for x in results]; success=sum(x[1] for x in results)
    print({'requests':args.requests,'workers':args.workers,'elapsed_s':round(elapsed,3),'rps':round(args.requests/elapsed,2),'success_or_non5xx':success,'errors':args.requests-success,'p50_ms':round(statistics.median(lat),2),'p95_ms':round(sorted(lat)[int(.95*len(lat))-1],2),'p99_ms':round(sorted(lat)[int(.99*len(lat))-1],2)})

if __name__=='__main__': main()
