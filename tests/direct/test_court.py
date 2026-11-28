import hashlib
import json
import sys
from datetime import datetime,timezone
from pathlib import Path
from types import SimpleNamespace
import pytest
from eth_account import Account

T=2000000000
REGISTRY='0x'+'12'*20
ESCROW='0x'+'e5'*20
SELLER=Account.from_key(bytes.fromhex('11'*32))
BUYER=Account.from_key(bytes.fromhex('22'*32))
ENDPOINT='https://refund-court.example/api/weather/broken'
PAYMENT='0x'+'aa'*32
PAYOUT='0x'+'bb'*32

def warp(vm,t):
    vm.warp(datetime.fromtimestamp(t,timezone.utc).isoformat())
    sdk=sys.modules.get('genlayer.gl')
    if sdk is not None and getattr(sdk,'message_raw',None) is not None:sdk.message_raw['datetime']=vm._datetime

def selfcall(vm,fn,*args):
    old=vm.sender;vm.sender=vm._contract_address
    fn(*args);vm.sender=old

def topic(address):return '0x'+address[2:].lower().zfill(64)

@pytest.fixture
def env(direct_vm,direct_deploy,monkeypatch):
    vm=direct_vm;vm._chain_id=61999;vm.sender=bytes.fromhex(BUYER.address[2:]);warp(vm,T)
    c=direct_deploy('contracts/refund_court.py',REGISTRY,ESCROW)
    from genlayer import gl,Address
    old=gl.message
    gl.message=gl.MessageType(contract_address=Address(vm._contract_address),sender_address=old.sender_address,origin_address=old.origin_address,value=old.value,chain_id=old.chain_id)
    gl.message_raw['contract_address']=Address(vm._contract_address)
    service={'id':'service-1','seller':SELLER.address.lower(),'endpoint':ENDPOINT,'status':'FROZEN','hash':'frozen','refund_units':'1000','price_units':'1000','criteria':['The report uses Celsius.','The city matches the request.']}
    # Same seller and endpoint, different frozen terms: evidence sold under service-1 must not file here.
    other={**service,'id':'service-2','hash':'other-terms','criteria':['The report uses Fahrenheit.']}
    class Proxy:
        def view(self):return self
        def get_service(self,key):return json.dumps({'service-1':service,'service-2':other}.get(key,{}))
        def emit(self,**kwargs):return self
    monkeypatch.setattr(gl,'get_contract_at',lambda addr:Proxy())
    scope={}
    exec(compile(Path('contracts/refund_court.py').read_text().split('\nclass RefundCourt')[0],'<helpers>','exec'),scope)
    return vm,c,service,scope

def evidence(payment=PAYMENT,body=None,buyer=None,service_id='service-1',promise_hash='frozen',nonce='test-nonce-123'):
    req=json.dumps({'buyer':(buyer or BUYER.address).lower(),'city':'Lagos','endpoint':ENDPOINT,'delivered_at':T,'nonce':nonce,'service_id':service_id,'promise_hash':promise_hash})
    body=body or '{"city":"Lagos","temperature":86.2,"unit":"F","observed_at":1999992800,"source":"Open-Meteo"}'
    digest=hashlib.sha256((req+body+payment).encode()).digest()
    sig=SELLER.unsafe_sign_hash(digest).signature.hex()
    return payment,req,body,'0x'+sig.removeprefix('0x')

UNMINED='unmined'

def base(monkeypatch,h,receipts,height=0x64):
    """A fake Base Sepolia node. receipts: tx hash -> list of logs, None for a failed tx, or
    UNMINED for a transaction the node has not mined yet (null receipt)."""
    import genlayer.gl as gl
    def post(url,**kw):
        q=json.loads(kw['body']);method=q['method']
        if method=='eth_chainId':result='0x14a34'
        elif method=='eth_blockNumber':result=hex(height)
        elif method=='eth_getBlockByNumber':result={'hash':'0x'+'cc'*32}
        else:
            tx=q['params'][0];logs=receipts.get(tx)
            if logs==UNMINED:return SimpleNamespace(status=200,body=json.dumps({'result':None}).encode())
            result={'status':'0x1' if logs is not None else '0x0','transactionHash':tx,'blockNumber':'0x60','blockHash':'0x'+'cc'*32,'logs':logs or []}
        return SimpleNamespace(status=200,body=json.dumps({'result':result}).encode())
    monkeypatch.setattr(gl.nondet.web,'post',post)

def payment_logs(h,amount=1000,payer=None):
    return [{'address':h['TOKEN'],'topics':[h['TRANSFER'],topic(payer or BUYER.address),topic(SELLER.address)],'data':hex(amount)}]

def payout_logs(h,case_key,amount=1000,buyer=None,escrow=ESCROW):
    buyer=buyer or BUYER.address
    return [
        {'address':h['TOKEN'],'topics':[h['TRANSFER'],topic(escrow),topic(buyer)],'data':hex(amount)},
        {'address':escrow,'topics':[h['REFUNDED'],case_key,'0x'+'01'*32,topic(buyer)],'data':'0x'+format(amount,'064x')+'dd'*32},
    ]

def filed(env):
    vm,c,s,h=env
    c.file_claim('service-1',*evidence())
    return json.loads(c.get_case('case-1'))

# --- signatures and filing ----------------------------------------------------------------

def test_signature_vectors_and_tampering(env):
    *_,h=env
    for i in range(4):
        digest=hashlib.sha256(str(i).encode()).digest();sig=SELLER.unsafe_sign_hash(digest).signature.hex()
        assert h['recover'](digest,'0x'+sig.removeprefix('0x'))==SELLER.address.lower()
        assert h['recover'](hashlib.sha256(b'other').digest(),'0x'+sig.removeprefix('0x'))!=SELLER.address.lower()
    with pytest.raises(Exception):h['recover'](digest,'0x'+'00'*65)

def test_forgery_and_replay_are_code_rejections(env):
    vm,c,*_=env
    args=evidence()
    forged=args[:2]+(args[2]+' ',args[3])
    with vm.expect_revert('signature does not recover'):c.file_claim('service-1',*forged)
    c.file_claim('service-1',*args)
    with vm.expect_revert('already used'):c.file_claim('service-1',*args)

def test_only_the_paying_buyer_can_file(env):
    vm,c,*_=env
    with vm.expect_revert('buyer or endpoint mismatch'):c.file_claim('service-1',*evidence(buyer=SELLER.address))

def test_late_claims_and_unfrozen_promises_are_rejected(env):
    vm,c,*_=env
    with vm.expect_revert('frozen promise'):c.file_claim('service-9',*evidence())
    warp(vm,T+86401)
    with vm.expect_revert('within 24 hours'):c.file_claim('service-1',*evidence())

def test_filing_records_the_terms_and_a_case_key(env):
    vm,c,s,h=env
    case=filed(env)
    assert case['status']=='FILED' and case['refund_units']=='1000' and case['criteria']==s['criteria']
    assert case['service_id']=='service-1' and case['promise_hash']=='frozen' and case['attempts']==0
    from genlayer import Address
    court=Address(vm._contract_address).as_hex.lower()
    assert case['case_key']==h['keccak_hex'](court+'/case-1')

# --- judgment -----------------------------------------------------------------------------

@pytest.mark.parametrize('verdict,outcome',[('MET','DELIVERED'),('NOT_MET','REFUND'),('UNCLEAR','VOID')])
def test_judgment(env,monkeypatch,verdict,outcome):
    vm,c,s,h=env;filed(env)
    base(monkeypatch,h,{PAYMENT:payment_logs(h)})
    vm.mock_llm(r'.*Judge exactly ONE.*',json.dumps({'verdict':verdict,'quote':'"unit":"F"'}))
    c.judge_claim('case-1')
    assert vm.run_validator()
    assert vm.run_validator(leader_result={'verdict':verdict,'quote':'Lagos'})
    assert not vm.run_validator(leader_result={'verdict':verdict,'quote':'Invented quotation'})
    case=json.loads(c.get_case('case-1'))
    assert case['status']==outcome and case['outcome']==outcome and case['payment']['status']=='PAID'
    with vm.expect_revert('filed case required'):c.judge_claim('case-1')

@pytest.mark.parametrize('logs,status',[
    (lambda h:payment_logs(h,amount=999),'INVALID'),
    (lambda h:payment_logs(h,payer=SELLER.address),'INVALID'),
    (lambda h:None,'INVALID'),
])
def test_a_payment_that_does_not_match_voids_without_judging(env,monkeypatch,logs,status):
    vm,c,s,h=env;filed(env)
    base(monkeypatch,h,{PAYMENT:logs(h)})
    c.judge_claim('case-1')
    case=json.loads(c.get_case('case-1'))
    assert case['outcome']=='VOID' and case['verdicts']==[] and case['payment']['status']==status

# --- temporary verification failures keep the claim, and the retry recovers ----------------

def judge_after_recovery(vm,c,h,monkeypatch):
    base(monkeypatch,h,{PAYMENT:payment_logs(h)})
    vm.mock_llm(r'.*Judge exactly ONE.*',json.dumps({'verdict':'NOT_MET','quote':'"unit":"F"'}))
    c.judge_claim('case-1')
    return json.loads(c.get_case('case-1'))

@pytest.mark.parametrize('state',['unmined','unconfirmed','rpc_down'])
def test_a_temporary_verification_failure_keeps_the_claim_filed_and_a_retry_recovers(env,monkeypatch,state):
    vm,c,s,h=env;filed(env)
    if state=='unmined':base(monkeypatch,h,{PAYMENT:UNMINED})
    elif state=='unconfirmed':base(monkeypatch,h,{PAYMENT:payment_logs(h)},height=0x61)
    else:
        import genlayer.gl as gl
        def fail(*args,**kw):raise RuntimeError('RPC unavailable')
        monkeypatch.setattr(gl.nondet.web,'post',fail)
    c.judge_claim('case-1')
    waiting=json.loads(c.get_case('case-1'))
    expected='UNAVAILABLE' if state=='rpc_down' else 'PENDING'
    assert waiting['status']=='FILED' and 'outcome' not in waiting and waiting['verdicts']==[]
    assert waiting['attempts']==1 and waiting['checks'][-1]['status']==expected and waiting['payment']['status']==expected
    # Replay protection holds while the claim waits: the payment stays reserved for case-1.
    with vm.expect_revert('already used'):c.file_claim('service-1',*evidence(nonce='another-nonce-456'))
    # The same claim is judged once Base confirms the payment.
    case=judge_after_recovery(vm,c,h,monkeypatch)
    assert case['status']=='REFUND' and case['attempts']==2 and case['payment']['status']=='PAID'
    assert [x['status'] for x in case['checks']]==[expected]

def test_retries_are_bounded_in_storage(env,monkeypatch):
    vm,c,s,h=env;filed(env)
    base(monkeypatch,h,{PAYMENT:UNMINED})
    for _ in range(25):c.judge_claim('case-1')
    case=json.loads(c.get_case('case-1'))
    assert case['status']=='FILED' and case['attempts']==25 and len(case['checks'])==20

def test_a_mined_but_failed_payment_is_final(env,monkeypatch):
    vm,c,s,h=env;filed(env)
    base(monkeypatch,h,{PAYMENT:None})
    c.judge_claim('case-1')
    case=json.loads(c.get_case('case-1'))
    assert case['status']=='VOID' and case['payment']['status']=='INVALID'
    with vm.expect_revert('filed case required'):c.judge_claim('case-1')

# --- evidence is bound to the agreed frozen terms -------------------------------------------

def test_evidence_cannot_be_filed_under_different_terms(env):
    vm,c,*_=env
    # Signed for service-1, filed under another frozen promise of the same seller and endpoint.
    with vm.expect_revert('signed terms do not match'):c.file_claim('service-2',*evidence())
    # Signed with a promise hash that is not the frozen one.
    with vm.expect_revert('signed terms do not match'):c.file_claim('service-1',*evidence(promise_hash='stale-hash'))
    # Signed for service-2's terms, filed under service-1.
    with vm.expect_revert('signed terms do not match'):c.file_claim('service-1',*evidence(service_id='service-2',promise_hash='other-terms'))
    # Editing the terms after signing breaks the seller's signature.
    p,req,body,sig=evidence()
    with vm.expect_revert('signature does not recover'):c.file_claim('service-2',p,req.replace('service-1','service-2').replace('"frozen"','"other-terms"'),body,sig)
    # The payment is still unused, so the correct filing succeeds.
    c.file_claim('service-1',*evidence())

def test_evidence_without_signed_terms_is_rejected(env):
    vm,c,*_=env
    req=json.dumps({'buyer':BUYER.address.lower(),'city':'Lagos','endpoint':ENDPOINT,'delivered_at':T,'nonce':'test-nonce-123'})
    body='{"unit":"F"}';digest=hashlib.sha256((req+body+PAYMENT).encode()).digest()
    sig='0x'+SELLER.unsafe_sign_hash(digest).signature.hex().removeprefix('0x')
    with vm.expect_revert('strict request schema'):c.file_claim('service-1',PAYMENT,req,body,sig)

# --- refund payout on Base ----------------------------------------------------------------

def refunded(env,monkeypatch):
    vm,c,s,h=env;case=filed(env)
    base(monkeypatch,h,{PAYMENT:payment_logs(h)})
    vm.mock_llm(r'.*Judge exactly ONE.*',json.dumps({'verdict':'NOT_MET','quote':'"unit":"F"'}))
    c.judge_claim('case-1')
    return vm,c,s,h,case

def test_a_verified_payout_closes_the_case(env,monkeypatch):
    vm,c,s,h,case=refunded(env,monkeypatch)
    base(monkeypatch,h,{PAYMENT:payment_logs(h),PAYOUT:payout_logs(h,case['case_key'])})
    c.record_payout('case-1',PAYOUT)
    closed=json.loads(c.get_case('case-1'))
    assert closed['status']=='REFUNDED' and closed['payout']['status']=='PAID' and closed['payout']['transaction']==PAYOUT
    with vm.expect_revert('refund verdict required'):c.record_payout('case-1',PAYOUT)

@pytest.mark.parametrize('broken',['amount','buyer','case','escrow','failed'])
def test_a_payout_that_does_not_match_the_case_is_rejected(env,monkeypatch,broken):
    vm,c,s,h,case=refunded(env,monkeypatch)
    if broken=='amount':logs=payout_logs(h,case['case_key'],amount=999)
    elif broken=='buyer':logs=payout_logs(h,case['case_key'],buyer=SELLER.address)
    elif broken=='case':logs=payout_logs(h,'0x'+'99'*32)
    elif broken=='escrow':logs=payout_logs(h,case['case_key'],escrow='0x'+'66'*20)
    else:logs=None
    base(monkeypatch,h,{PAYMENT:payment_logs(h),PAYOUT:logs})
    with vm.expect_revert('does not match this case'):c.record_payout('case-1',PAYOUT)
    assert json.loads(c.get_case('case-1'))['status']=='REFUND'

def test_an_unconfirmed_payout_can_be_retried(env,monkeypatch):
    vm,c,s,h,case=refunded(env,monkeypatch)
    base(monkeypatch,h,{PAYOUT:payout_logs(h,case['case_key'])},height=0x61)
    with vm.expect_revert('not yet confirmed'):c.record_payout('case-1',PAYOUT)
    base(monkeypatch,h,{PAYOUT:payout_logs(h,case['case_key'])})
    c.record_payout('case-1',PAYOUT)
    assert json.loads(c.get_case('case-1'))['status']=='REFUNDED'

def test_only_refund_cases_take_a_payout(env,monkeypatch):
    vm,c,s,h=env;filed(env)
    with vm.expect_revert('refund verdict required'):c.record_payout('case-1',PAYOUT)

def test_config(env):
    vm,c,*_=env
    cfg=c.get_config()
    assert cfg['escrow']==ESCROW and cfg['confirmations']==3
