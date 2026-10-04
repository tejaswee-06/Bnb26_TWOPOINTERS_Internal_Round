"""Run a real local Person-1 judge flow against an already migrated API."""
import argparse, json, httpx


def main():
    p=argparse.ArgumentParser(); p.add_argument('--url',default='http://127.0.0.1:8000'); p.add_argument('--seats',type=int,default=20); args=p.parse_args(); base=args.url.rstrip('/')
    with httpx.Client(timeout=10) as c:
        event='person1-demo'
        c.post(f'{base}/events',json={'event_id':event,'name':'Person 1 Judge Demo','admission_limit':min(5,args.seats)})
        c.post(f'{base}/inventory/seed',params={'event_id':event,'count':args.seats})
        print('INVENTORY', c.get(f'{base}/inventory/stats/{event}').json())

        joined=c.post(f'{base}/events/{event}/join',json={'user_id':'demo-user'}); joined.raise_for_status(); j=joined.json()
        sid,credential=j['session_id'],j['credential']
        print('SESSION', {'session_id':sid,'credential_issued':bool(credential)})
        headers={'X-Session-Credential':credential}
        print('QUEUE', c.get(f'{base}/queue/{sid}',headers=headers).json())
        admitted=c.post(f'{base}/queue/{sid}/admit',headers=headers); admitted.raise_for_status(); a=admitted.json()
        print('ADMISSION', {k:a.get(k) for k in ['status','position','admission_expires_at']})
        payload={'event_id':event,'user_id':'demo-user','session_id':sid,'session_credential':credential,'admission_token':a['token'],'idempotency_key':'demo-idem'}
        r=c.post(f'{base}/allocation',json=payload); r.raise_for_status(); allocation=r.json()
        print('ALLOCATION',json.dumps(allocation,indent=2))
        replay=c.post(f'{base}/allocation',json=payload); replay.raise_for_status(); print('IDEMPOTENT REPLAY',json.dumps(replay.json(),indent=2))
        if allocation.get('allocation_id'):
            print('VERIFICATION',json.dumps(c.get(f'{base}/verify/{allocation["allocation_id"]}').json(),indent=2))
        print('METRICS',json.dumps(c.get(f'{base}/metrics').json(),indent=2))

if __name__=='__main__': main()
