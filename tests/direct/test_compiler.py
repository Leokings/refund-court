import json
import pytest
from test_court import selfcall

@pytest.mark.parametrize('accepted',[True,False])
def test_compile_requires_independent_acceptance(direct_vm,direct_deploy,direct_owner,monkeypatch,accepted):
    vm=direct_vm;vm.sender=direct_owner
    c=direct_deploy('contracts/service_promise.py')
    from genlayer import gl,Address
    old=gl.message
    gl.message=gl.MessageType(contract_address=Address(vm._contract_address),sender_address=old.sender_address,origin_address=old.origin_address,value=old.value,chain_id=old.chain_id)
    gl.message_raw['contract_address']=Address(vm._contract_address)
    class Proxy:
        def emit(self,**kwargs):return self
        def finalize_register(self,*args):pass
    monkeypatch.setattr(gl,'get_contract_at',lambda address:Proxy())
    criteria=['Temperature is in Celsius.','Requested city matches.'] if accepted else []
    vm.mock_llm(r'.*Compile one seller.*',json.dumps({'accepted':accepted,'criteria':criteria,'reason':'Observable criteria' if accepted else 'Subjective promise'}))
    vm.mock_llm(r'.*Review the two.*',json.dumps({'equivalent':True}))
    c.register('https://refund-court.example/api/weather/honest','Returns weather for the requested city with Celsius units.',1000,1000)
    assert vm.run_validator()
    assert not vm.run_validator(leader_result={'accepted':not accepted,'criteria':criteria,'reason':'different'})
    record=json.loads(c.get_service('service-1'))
    assert record['status']==('FROZEN' if accepted else 'REJECTED') and len(record['hash'])==64


def test_terms_must_be_a_full_usdc_refund(direct_vm,direct_deploy,direct_owner):
    direct_vm.sender=direct_owner
    c=direct_deploy('contracts/service_promise.py')
    with direct_vm.expect_revert('full 0.001 USDC refund'):
        c.register('https://refund-court.example/api/weather/honest','Returns weather for the requested city with Celsius units.',1000,5)
