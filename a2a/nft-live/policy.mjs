// Deliberately dependency-free input/safety policy; imported by tests and CLI.
export const BASE_CHAIN_ID = 8453;
export function assert(condition, reason) { if (!condition) throw new Error(reason); }
export function cleanId(value) {
  assert(typeof value === 'string' && /^[a-z][a-z0-9_-]{5,65}$/i.test(value), 'id must be 6-66 safe characters');
  return value;
}
export function validAddress(value) { return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value); }
export function validIpfs(value) {
  return typeof value === 'string' && /^ipfs:\/\/(bafy[a-z2-7]{20,100}|Qm[1-9A-HJ-NP-Za-km-z]{44})(\/[a-z0-9_.-]+)?$/i.test(value);
}
export function validateAsset(m) {
  assert(m && typeof m === 'object' && !Array.isArray(m), 'asset manifest required');
  cleanId(m.id);
  assert(typeof m.name === 'string' && m.name.trim().length >= 3 && m.name.length <= 100, 'name required');
  assert(validIpfs(m.tokenUri), 'pin JSON metadata and supply IPFS URI');
  assert(['original-owned', 'licensed-for-commercial-NFT'].includes(m.rightsBasis), 'invalid commercial rights basis');
  assert(typeof m.rightsEvidence === 'string' && m.rightsEvidence.length >= 30, 'rights evidence required');
  assert(m.rightsConfirmedByOwner === true, 'human owner must attest rights');
  return { id: m.id, name: m.name.trim(), tokenUri: m.tokenUri, rightsBasis: m.rightsBasis };
}
export function validateCollection(m) {
  assert(m && typeof m === 'object', 'collection spec required');
  cleanId(m.id);
  assert(typeof m.name === 'string' && m.name.length >= 3 && m.name.length <= 100, 'collection name required');
  assert(typeof m.symbol === 'string' && /^[A-Z0-9]{2,10}$/.test(m.symbol), 'symbol must be 2-10 capital letters/digits');
  assert(m.rightsConfirmedByOwner === true, 'owner must confirm collection rights');
  return { id:m.id, name:m.name, symbol:m.symbol };
}
export function validatePrice(value) {
  assert(typeof value === 'string' && /^(0|[1-9]\d{0,5})(\.\d{1,8})?$/.test(value) && Number(value) > 0, 'positive decimal ETH price required');
  assert(Number(value) <= 100, 'price exceeds supported cap; manually review');
  return Number(value);
}
export function executionAuthorized(env, confirmation, id) {
  cleanId(id);
  assert(env.NFT_ENABLE_EXECUTION === 'I_AUTHORIZE_NFT_TRANSACTIONS', 'execution disabled; explicit operator authorization required');
  assert(confirmation === id, 'must confirm matching id per transaction');
  assert(env.NFT_BASE_RPC_URL && /^https:\/\//.test(env.NFT_BASE_RPC_URL), 'Base RPC HTTPS URL required');
  assert(env.NFT_MAX_GAS_ETH && /^(0|[1-9]\d*)(\.\d{1,9})?$/.test(env.NFT_MAX_GAS_ETH) && Number(env.NFT_MAX_GAS_ETH)>0, 'positive max gas budget required');
  assert(env.NFT_SIGNER_PRIVATE_KEY && /^0x[0-9a-fA-F]{64}$/.test(env.NFT_SIGNER_PRIVATE_KEY), 'dedicated signer required in private operator session');
}
export function maxGasWithinBudget({gas, maxFeePerGas, gasBudgetWei}) {
  assert(typeof gas === 'bigint' && gas > 0n && typeof maxFeePerGas === 'bigint' &&
     maxFeePerGas > 0n && typeof gasBudgetWei === 'bigint' && gasBudgetWei > 0n,
     'invalid gas estimate');
  // 20% estimation safety margin. All spending is operator-confirmed; never model-triggered.
  const limit = (gas * 12n + 9n) / 10n;
  assert(limit * maxFeePerGas <= gasBudgetWei, 'estimated maximum gas exceeds operator cap');
  return limit;
}
