import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import solc from 'solc';
import {createRequire} from 'node:module';

const here=dirname(fileURLToPath(import.meta.url));
test('patched solc >=0.8.37 compiles actual DiscoveryNFT ERC721 and OpenZeppelin imports',()=>{
  assert.match(solc.version(),/^0\.8\.37\+/,'expected patched solc 0.8.37');
  const source=readFileSync(join(here,'DiscoveryNFT.sol'),'utf8');
  const input={
    language:'Solidity',
    sources:{'DiscoveryNFT.sol':{content:source}},
    settings:{optimizer:{enabled:true,runs:200},
      outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}
  };
  const output=JSON.parse(solc.compile(JSON.stringify(input),{
    import(importPath){
      assert.match(importPath,/^@openzeppelin\/contracts\//,'unexpected Solidity import path');
      return {contents:readFileSync(join(here,'node_modules',importPath),'utf8')};
    }
  }));
  const errors=(output.errors||[]).filter(x=>x.severity==='error');
  assert.equal(errors.length,0,errors.map(x=>x.formattedMessage).join('\n'));
  const contract=output.contracts?.['DiscoveryNFT.sol']?.DiscoveryNFT;
  assert.ok(contract?.abi?.some(x=>x.type==='function'&&x.name==='mintTo'),'mintTo must exist');
  assert.match(contract?.evm?.bytecode?.object||'',/^[0-9a-f]{500,}$/i,
    'contract bytecode missing');
});

test('solc uses patched tmp transitive dependency 0.2.7',()=>{
  const req=createRequire(import.meta.url);
  const solcPkgPath=req.resolve('solc/package.json');
  const solcRequire=createRequire(solcPkgPath);
  const tmpPackage=solcRequire('tmp/package.json');
  assert.equal(tmpPackage.version,'0.2.7',
    'tmp transitive dependency must be patched (npm overrides)');
});
