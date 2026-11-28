"""Resumable GenLayer stages for the v2 live demo. Never invents a payment or payout receipt.

  python scripts/release.py deploy           # ServicePromise, then RefundCourt(registry, escrow)
  python scripts/release.py compile          # four promises: one subjective, three observable
  python scripts/release.py file <mode>      # file the paid evidence and judge it (honest|broken|injection)
  python scripts/release.py judge <mode>     # retry a judgment the court left FILED (payment pending or Base RPC down)
  python scripts/release.py payout <mode>    # record the Base refund for a REFUND case
  python scripts/release.py terms            # before filing broken: its real evidence under other frozen terms, rejected
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
# A second, laxer frozen promise on the broken endpoint. Never bonded, never sold under: it exists so the
# live demo can show that evidence sold under PROMISE cannot be filed under these other terms.
# (A first, three-hour variant was refused at compile time: the compiler treats freshness as one hour.)
OTHER_TERMS='Returns live weather for the requested city, temperature in Fahrenheit, with observed_at no older than one hour before delivered_at.'
OTHER_TERMS_3H='Returns live weather for the requested city, temperature in Fahrenheit, with observed_at no older than three hours before delivered_at.'

def sold_under(mode):
    """The frozen, bonded promise this endpoint sells under (the terms the seller signs)."""
    bonds=p.get('base',{}).get('bonds',{})
    return next(s for s in p['services'] if s['endpoint'].endswith('/'+mode) and s['status']=='FROZEN' and s['id'] in bonds)

def judge(mode,label):
    cid=p['caseIds'][mode]
    tx(p,label,address('RefundCourt'),'judge_claim',[cid],index=1)
    case=read(address('RefundCourt'),'get_case',[cid])
    if case['status']=='FILED':
        print(cid,'kept FILED:',case.get('reason'),'| retry: python scripts/release.py judge',mode,flush=True)
    else:
        # The transaction that produced the verdict; the Base refund names it.
        p.setdefault('verdictTx',{})[mode]=p['transactions'][label];save(p)
        print(cid,case.get('outcome',case['status']),flush=True)

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
    for mode,promise in [('subjective','Returns the most beautiful and delightful weather report in the world.'),('honest',PROMISE),('broken',PROMISE),('injection',PROMISE),('other-terms',OTHER_TERMS_3H),('other-terms-fahrenheit',OTHER_TERMS)]:
        target={'subjective':'honest','other-terms':'broken','other-terms-fahrenheit':'broken'}.get(mode,mode)
        tx(p,'compile-'+mode,address('ServicePromise'),'register',[base+'/api/weather/'+target,promise,1000,1000])
    print('Compilation finalized. Run record, then: npx tsx scripts/base.ts bond',flush=True)
elif stage=='file':
    mode=sys.argv[2]
    artifact=json.loads((ROOT/'deploy/payments'/(mode+'.json')).read_text())
    service=sold_under(mode)
    signed=json.loads(artifact['request'])
    if (signed.get('service_id'),signed.get('promise_hash'))!=(service['id'],service['hash']):
        raise RuntimeError('Evidence was signed under other terms than the frozen promise; not filing')
    args=[service['id'],artifact['payment_hash'],artifact['request'],artifact['response'],artifact['signature']]
    tx(p,'file-'+mode,address('RefundCourt'),'file_claim',args,index=1)
    ids=read(address('RefundCourt'),'get_ids',[0,50])
    cid=next(k for k in ids if read(address('RefundCourt'),'get_case',[k])['payment_hash']==artifact['payment_hash'])
    p.setdefault('caseIds',{})[mode]=cid;p.setdefault('caseModes',{})[cid]=mode;save(p)
    judge(mode,'judge-'+mode)
elif stage=='judge':
    mode=sys.argv[2]
    n=sum(1 for k in p['transactions'] if k.startswith('judge-'+mode+'-retry-') and '-child-' not in k)
    judge(mode,'judge-'+mode+'-retry-'+str(n+1))
elif stage=='payout':
    mode=sys.argv[2];cid=p['caseIds'][mode]
    payout=p.get('base',{}).get('payouts',{}).get(cid,{}).get('tx')
    if not payout:raise RuntimeError('Pay the refund on Base first: npx tsx scripts/base.ts refund '+cid)
    tx(p,'payout-'+mode,address('RefundCourt'),'record_payout',[cid,payout],index=1)
elif stage=='reject':
    a=json.loads((ROOT/'deploy/payments/broken.json').read_text())
    service=sold_under('broken')
    args=[service['id'],a['payment_hash'],a['request'],a['response'],a['signature']]
    r=tx(p,'reject-replay',address('RefundCourt'),'file_claim',args,index=1,allow_error=True)
    if not r or r.get('txExecutionResultName')=='SUCCESS':raise RuntimeError('Replay unexpectedly succeeded')
    forged=[service['id'],'0x'+'dd'*32,a['request'],a['response']+' ',a['signature']]
    tx(p,'reject-forgery',address('RefundCourt'),'file_claim',forged,index=1,allow_error=True)
elif stage=='terms':
    # The real, unfiled broken evidence (real payment, real seller signature, same seller and endpoint)
    # filed under the other frozen promise. Only the signed-terms check can reject it.
    if 'file-broken' in p['transactions']:raise RuntimeError('Run before filing broken, so the payment is still unused')
    a=json.loads((ROOT/'deploy/payments/broken.json').read_text())
    other=next(s for s in p['services'] if s['promise']==OTHER_TERMS and s['status']=='FROZEN')
    moved=[other['id'],a['payment_hash'],a['request'],a['response'],a['signature']]
    r=tx(p,'reject-terms',address('RefundCourt'),'file_claim',moved,index=1,allow_error=True)
    if not r or r.get('txExecutionResultName')=='SUCCESS':raise RuntimeError('Other-terms filing unexpectedly succeeded')
elif stage!='record':raise SystemExit('Unknown stage')

if p.get('contracts') and len(p['contracts'])==2:
    p['services']=[read(address('ServicePromise'),'get_service',[key]) for key in read(address('ServicePromise'),'get_ids',[0,50])]
    p['claimCases']=[read(address('RefundCourt'),'get_case',[key]) for key in read(address('RefundCourt'),'get_ids',[0,50])]
    p['demoWallets']=[a.address.lower() for a in accounts()]
    p['recordedAt']=datetime.now(timezone.utc).isoformat()
    save(p)
