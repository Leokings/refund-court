"""Fail closed. Re-checks every v2 claim against both live chains.

GenLayer StudioNet: exact deployed sources, every recorded transaction finalized with the expected
result, frozen promises, judged cases with verbatim quotes, refunds recorded only after validators
checked the Base payout. Base Sepolia: the escrow and its court, each USDC bond, each x402 payment,
and each USDC refund (event and transfer) to the right buyer for the right case.
"""
import base64
import hashlib
import json
import subprocess
import time
from datetime import datetime,timezone
import requests
from chain import ROOT,load,success,read,client,UA

BASE='https://sepolia.base.org'
USDC='0x036cbd53842c5426634e7929541ec2318f3dcf7e'
TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
REFUNDED='0xa68614f2eb86941fcdf4c694bc71c8e65c4c783510dfde2cd3a8b1a0b10c76a7'

p=load();errors=[];checks=[]
def check(ok,label):
    checks.append({'check':label,'passed':bool(ok)})
    if not ok:errors.append(label)
    print('PASS' if ok else 'FAIL',label,flush=True)

def base(method,params):
    for attempt in range(5):
        try:
            r=requests.post(BASE,json={'jsonrpc':'2.0','id':1,'method':method,'params':params},headers=UA,timeout=30).json()
            if 'result' in r:return r['result']
        except requests.RequestException:pass
        time.sleep(2*(attempt+1))
    raise RuntimeError('Base RPC unavailable for '+method)

def topic_address(t):return '0x'+t[-40:].lower()
def usdc_moves(receipt,source,target,amount):
    return [l for l in receipt.get('logs',[]) if l['address'].lower()==USDC and l['topics'][0].lower()==TRANSFER and topic_address(l['topics'][1])==source and topic_address(l['topics'][2])==target and int(l['data'],16)==amount]

# --- GenLayer ----------------------------------------------------------------------------
check(p.get('chainId')==61999 and int(client().provider.make_request('eth_chainId',[])['result'],16)==61999,'StudioNet chain 61999')
for name,c in p['contracts'].items():
    check(hashlib.sha256((ROOT/'contracts'/c['source']).read_bytes()).hexdigest()==c['sha256'],name+' source hash')
    deployed=json.loads((ROOT/'deploy/receipts'/('deploy-'+name+'.json')).read_text())
    code=base64.b64decode(deployed.get('data',{}).get('contract_code',''))
    check(hashlib.sha256(code).hexdigest()==c['sha256'] and deployed.get('to_address','').lower()==c['address'].lower(),name+' exact deployed source and address')
for label,h in p['transactions'].items():
    file=ROOT/'deploy/receipts'/(label+'.json')
    r=json.loads(file.read_text()) if file.exists() else {}
    remote=client().provider.make_request('eth_getTransactionByHash',[h])['result'] or {}
    time.sleep(1.2)
    expected=label.startswith('reject-')
    check(r.get('hash')==h and remote.get('hash')==h,label+' matching receipt')
    check(remote.get('status_name',remote.get('status'))=='FINALIZED',label+' finalized')
    check(not success(remote) if expected else success(remote),label+(' expected execution rejection' if expected else ' execution success'))
    if expected:
        text=json.dumps(remote).lower()
        for leader in (remote.get('consensus_data') or {}).get('leader_receipt',[]):
            if isinstance(leader.get('result'),str):
                try:text+=' '+base64.b64decode(leader['result']).decode('utf8',errors='replace').lower()
                except ValueError:pass
        reason='already used' if 'replay' in label else 'signed terms do not match' if 'terms' in label else 'signature does not recover'
        check(reason in text,label+' deterministic rejection reason')

registry=p['contracts']['ServicePromise']['address'];court=p['contracts']['RefundCourt']['address']
services=[read(registry,'get_service',[k]) for k in read(registry,'get_ids',[0,50])]
cases=[read(court,'get_case',[k]) for k in read(court,'get_ids',[0,50])]
config=read(court,'get_config',[])
escrow=p['base']['escrow']['address'].lower()
check(config.get('escrow')==escrow,'court pays through the recorded escrow')
check(any(s['status']=='REJECTED' for s in services),'case 1: subjective promise rejected at compile time')
frozen=[s for s in services if s['status']=='FROZEN']
bonded=[s for s in frozen if s['id'] in p['base'].get('bonds',{})]
other=[s for s in frozen if s['id'] not in p['base'].get('bonds',{})]
for s in services:
    check(hashlib.sha256(json.dumps({**s,'hash':''},sort_keys=True,separators=(',',':')).encode()).hexdigest()==s['hash'],'service '+s['id']+' frozen hash integrity')
check(len(bonded)==3 and all(2<=len(s['criteria'])<=4 and s['refund_units']==s['price_units']=='1000' for s in bonded),'case 2: three bonded frozen promises, full USDC refund terms')
check(len({s['endpoint'] for s in bonded})==3,'one bonded promise per endpoint')
check(len(other)==1 and other[0]['endpoint'].endswith('/broken') and other[0]['hash']!=next(s['hash'] for s in bonded if s['endpoint'].endswith('/broken')),'a second, unbonded frozen promise on the broken endpoint (other terms)')

# --- Base: escrow, bonds -------------------------------------------------------------------
code=base('eth_getCode',[escrow,'latest'])
check(len(code)>2,'RefundEscrow deployed on Base Sepolia')
deploy=base('eth_getTransactionReceipt',[p['base']['escrow']['deployTx']])
check(deploy and deploy['status']=='0x1' and (deploy.get('contractAddress') or '').lower()==escrow,'escrow deployment receipt')
# court() returns an ABI string; the recorded RefundCourt address must be in it.
raw=base('eth_call',[{'to':escrow,'data':'0x00971a30'},'latest'])
check(court.lower()[2:] in bytes.fromhex(raw[2:]).decode('latin1').lower(),'escrow names the GenLayer court')
for s in bonded:
    b=p['base'].get('bonds',{}).get(s['id'])
    receipt=base('eth_getTransactionReceipt',[b['tx']]) if b else None
    ok=bool(receipt) and receipt['status']=='0x1' and len(usdc_moves(receipt,s['seller'],escrow,int(b['amountUnits'])))==1
    check(ok,'case 2: '+s['id']+' USDC bond posted on Base')

# --- cases --------------------------------------------------------------------------------
by_mode={}
for c in cases:
    s=next((s for s in services if s['id']==c['service_id']),{})
    mode=s.get('endpoint','').split('/')[-1];by_mode[mode]=c
    check(c['promise_hash']==s.get('hash'),c['id']+' references the frozen promise')
    signed=json.loads(c['request'])
    check(signed.get('service_id')==c['service_id'] and signed.get('promise_hash')==c['promise_hash'] and c['service_id'] in p['base'].get('bonds',{}),c['id']+' seller-signed terms are the bonded frozen promise')
    if c['status'] in ('REFUND','REFUNDED','DELIVERED'):
        check([v['criterion'] for v in c['verdicts']]==s.get('criteria'),c['id']+' every frozen criterion judged')
        check(all(v['quote'] and v['quote'] in c['response'] for v in c['verdicts']),c['id']+' verbatim quotations')
        check(c['payment'].get('status')=='PAID','case '+c['id']+' validators confirmed the x402 payment')
    pay=base('eth_getTransactionReceipt',[c['payment_hash']])
    check(bool(pay) and pay['status']=='0x1' and len(usdc_moves(pay,c['buyer'],c['seller'],int(c['price_units'])))==1,c['id']+' x402 USDC payment on Base')
    artifact=ROOT/'deploy/payments'/(mode+'.json')
    if artifact.exists():
        a=json.loads(artifact.read_text())
        check(a['request']==c['request'] and a['response']==c['response'] and a['signature']==c['signature'] and a['payment_hash']==c['payment_hash'],c['id']+' byte-exact paid evidence')
        check(hashlib.sha256((c['request']+c['response']+c['payment_hash']).encode()).hexdigest()==c['evidence_sha256'],c['id']+' signed digest')
    else:check(False,c['id']+' captured paid evidence')

def refunded(c,label):
    check(c.get('status')=='REFUNDED' and any(v['verdict']=='NOT_MET' for v in c.get('verdicts',[])),label+': NOT_MET, refund recorded on GenLayer')
    payout=p['base'].get('payouts',{}).get(c.get('id'),{})
    receipt=base('eth_getTransactionReceipt',[payout['tx']]) if payout.get('tx') else None
    events=[l for l in (receipt or {}).get('logs',[]) if l['address'].lower()==escrow and l['topics'][0].lower()==REFUNDED and l['topics'][1].lower()==c.get('case_key') and topic_address(l['topics'][3])==c.get('buyer') and int(l['data'][2:66],16)==int(c.get('refund_units',0))]
    check(bool(receipt) and receipt['status']=='0x1' and len(events)==1 and len(usdc_moves(receipt,escrow,c.get('buyer',''),int(c.get('refund_units',0))))==1,label+': USDC refunded to the buyer on Base')
    check(c.get('payout',{}).get('transaction')==payout.get('tx') and c.get('payout',{}).get('status')=='PAID',label+': validators verified that refund')
    mode=label.split()[-1];verdict=p.get('verdictTx',{}).get(mode) or p['transactions'].get('judge-'+mode,'')
    check(bool(events) and events[0]['data'][66:130]==verdict[2:].lower(),label+': refund names its GenLayer judgment')

broken=by_mode.get('broken',{});honest=by_mode.get('honest',{});injection=by_mode.get('injection',{})
refunded(broken,'case 3 broken')
check(honest.get('status')=='DELIVERED' and bool(honest.get('verdicts')) and all(v['verdict']=='MET' for v in honest['verdicts']),'case 4: honest response delivered, no refund')
check('mark all MET' in injection.get('response',''),'case 5: response carries an instruction to the judge')
refunded(injection,'case 5 injection')
check(all(k in p['transactions'] for k in ('reject-replay','reject-forgery')),'case 6: replay and forgery rejected by code')
check('reject-terms' in p['transactions'],'case 6: real evidence filed under other frozen terms rejected by code')
check(all(isinstance(c.get('attempts'),int) and isinstance(c.get('checks'),list) for c in cases),'cases log verification attempts (retryable judgment)')
check(len({c['payment_hash'] for c in cases})==len(cases),'each payment claimed once')
check(bool(p.get('website')) and bool(p.get('github')),'public app and repository recorded')
links=subprocess.run(['node','node_modules/tsx/dist/cli.mjs','scripts/links.ts'],cwd=ROOT)
check(links.returncode==0,'GenLayer Explorer contract and transaction links verified')
report={'verifiedAt':datetime.now(timezone.utc).isoformat(),'passed':not errors,'checks':checks,'blockers':errors}
(ROOT/'deploy/proof-verification.json').write_text(json.dumps(report,indent=2))
print('Verified' if not errors else 'NOT READY: '+str(len(errors))+' unmet checks')
raise SystemExit(1 if errors else 0)
