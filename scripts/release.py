"""Resumable GenLayer stages for the v2 live demo. Never invents a payment or payout receipt.

  python scripts/release.py deploy           # ServicePromise, then RefundCourt(registry, escrow)
  python scripts/release.py compile          # four promises: one subjective, three observable
  python scripts/release.py file <mode>      # file the paid evidence and judge it (honest|broken|injection)
  python scripts/release.py payout <mode>    # record the Base refund for a REFUND case
  python scripts/release.py reject           # replay and forgery attempts, both rejected by code
  python scripts/release.py record           # re-read every service and case
"""
import hashlib
import json
import sys
from datetime import datetime,timezone
from chain import ROOT,load,save,tx,read,accounts

p=load()
stage=sys.argv[1] if len(sys.argv)>1 else 'record'
def address(name):return p['contracts'][name]['address']
PROMISE='Returns live weather for the requested city, temperature in Celsius, with observed_at no older than one hour before delivered_at.'

if stage=='deploy':
    escrow=p.get('base',{}).get('escrow',{}).get('address')
    if not escrow:raise RuntimeError('Deploy RefundEscrow on Base first: npx tsx scripts/base.ts deploy')
    for name,filename in [('ServicePromise','service_promise.py'),('RefundCourt','refund_court.py')]:
        source=(ROOT/'contracts'/filename).read_text()
        digest=hashlib.sha256(source.encode()).hexdigest()
        if name in p['contracts']:
            if p['contracts'][name]['sha256']!=digest:raise RuntimeError('Source changed since deployment; use a new release manifest')
            continue
        r=tx(p,'deploy-'+name,code=source,args=[] if name=='ServicePromise' else [address('ServicePromise'),escrow])
        p['contracts'][name]={'address':r.get('recipient',r.get('to_address')),'source':filename,'sha256':digest}
        save(p)
elif stage=='compile':
    base=p['website'].rstrip('/')
    for mode,promise in [('subjective','Returns the most beautiful and delightful weather report in the world.'),('honest',PROMISE),('broken',PROMISE),('injection',PROMISE)]:
        tx(p,'compile-'+mode,address('ServicePromise'),'register',[base+'/api/weather/'+('honest' if mode=='subjective' else mode),promise,1000,1000])
    print('Compilation finalized. Run record, then: npx tsx scripts/base.ts bond',flush=True)
elif stage=='file':
    mode=sys.argv[2]
    artifact=json.loads((ROOT/'deploy/payments'/(mode+'.json')).read_text())
    service=next(s for s in p['services'] if s['endpoint'].endswith('/'+mode) and s['status']=='FROZEN')
    args=[service['id'],artifact['payment_hash'],artifact['request'],artifact['response'],artifact['signature']]
    tx(p,'file-'+mode,address('RefundCourt'),'file_claim',args,index=1)
    ids=read(address('RefundCourt'),'get_ids',[0,50])
    cid=next(k for k in ids if read(address('RefundCourt'),'get_case',[k])['payment_hash']==artifact['payment_hash'])
    p.setdefault('caseIds',{})[mode]=cid;p.setdefault('caseModes',{})[cid]=mode;save(p)
    tx(p,'judge-'+mode,address('RefundCourt'),'judge_claim',[cid],index=1)
elif stage=='payout':
    mode=sys.argv[2];cid=p['caseIds'][mode]
    payout=p.get('base',{}).get('payouts',{}).get(cid,{}).get('tx')
    if not payout:raise RuntimeError('Pay the refund on Base first: npx tsx scripts/base.ts refund '+cid)
    tx(p,'payout-'+mode,address('RefundCourt'),'record_payout',[cid,payout],index=1)
elif stage=='reject':
    a=json.loads((ROOT/'deploy/payments/broken.json').read_text())
    service=next(s for s in p['services'] if s['endpoint'].endswith('/broken') and s['status']=='FROZEN')
    args=[service['id'],a['payment_hash'],a['request'],a['response'],a['signature']]
    r=tx(p,'reject-replay',address('RefundCourt'),'file_claim',args,index=1,allow_error=True)
    if not r or r.get('txExecutionResultName')=='SUCCESS':raise RuntimeError('Replay unexpectedly succeeded')
    forged=[service['id'],'0x'+'dd'*32,a['request'],a['response']+' ',a['signature']]
    tx(p,'reject-forgery',address('RefundCourt'),'file_claim',forged,index=1,allow_error=True)
elif stage!='record':raise SystemExit('Unknown stage')

if p.get('contracts') and len(p['contracts'])==2:
    p['services']=[read(address('ServicePromise'),'get_service',[key]) for key in read(address('ServicePromise'),'get_ids',[0,50])]
    p['claimCases']=[read(address('RefundCourt'),'get_case',[key]) for key in read(address('RefundCourt'),'get_ids',[0,50])]
    p['demoWallets']=[a.address.lower() for a in accounts()]
    p['recordedAt']=datetime.now(timezone.utc).isoformat()
    save(p)
