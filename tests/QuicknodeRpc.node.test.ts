import { QuicknodeRpc } from '../nodes/QuicknodeRpc/QuicknodeRpc.node';
import type { IExecuteFunctions } from 'n8n-workflow';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENDPOINT = 'https://test.quiknode.pro/abc123/';
const CREDENTIALS = { rpcEndpoint: ENDPOINT, network: 'ethereum-mainnet' };
const ADDR = '0x1234567890123456789012345678901234567890';
const ADDR2 = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
const TX_HASH = '0x' + 'a'.repeat(64);
const BLOCK_HASH = '0x' + 'b'.repeat(64);

function rpcOk(result: unknown) {
	return { jsonrpc: '2.0', id: 1, result };
}
function rpcErr(message: string, code = -32000) {
	return { jsonrpc: '2.0', id: 1, error: { message, code } };
}

// ── Mock builder ──────────────────────────────────────────────────────────────

function buildCtx(
	operation: string,
	params: Record<string, unknown> = {},
	httpResult: unknown = rpcOk(null),
	{ continueOnFail = false } = {},
): IExecuteFunctions {
	const httpRequest = jest.fn().mockResolvedValue(httpResult);
	return {
		getInputData: () => [{ json: {} }],
		getNodeParameter: (name: string, _i: number, fallback?: unknown) => {
			if (name === 'operation') return operation;
			if (name in params) return params[name];
			return fallback ?? '';
		},
		getCredentials: jest.fn().mockResolvedValue(CREDENTIALS),
		helpers: { httpRequest },
		getNode: () => ({ name: 'QuicknodeRpc', type: 'quicknodeRpc', typeVersion: 1 }),
		continueOnFail: () => continueOnFail,
	} as unknown as IExecuteFunctions;
}

function getHttpBody(ctx: IExecuteFunctions) {
	return (ctx.helpers.httpRequest as jest.Mock).mock.calls[0][0].body;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('QuicknodeRpc', () => {

	// ── Node definition ──────────────────────────────────────────────────────

	describe('node definition', () => {
		it('has correct internal name', () => {
			expect(new QuicknodeRpc().description.name).toBe('quicknodeRpc');
		});

		it('declares quicknodeApi credential', () => {
			const creds = new QuicknodeRpc().description.credentials!;
			expect(creds).toHaveLength(1);
			expect(creds[0].name).toBe('quicknodeApi');
			expect(creds[0].required).toBe(true);
		});
	});

	// ── getBalance ───────────────────────────────────────────────────────────

	describe('getBalance', () => {
		it('sends eth_getBalance with address and block tag', async () => {
			const ctx = buildCtx('getBalance', { address: ADDR, block: 'latest' }, rpcOk('0xde0b6b3a7640000'));
			await new QuicknodeRpc().execute.call(ctx);
			expect(getHttpBody(ctx)).toMatchObject({ method: 'eth_getBalance', params: [ADDR, 'latest'] });
		});

		it('converts decimal block number to hex', async () => {
			const ctx = buildCtx('getBalance', { address: ADDR, block: '100' }, rpcOk('0x0'));
			await new QuicknodeRpc().execute.call(ctx);
			expect(getHttpBody(ctx).params[1]).toBe('0x64');
		});

		it('passes through hex block number unchanged', async () => {
			const ctx = buildCtx('getBalance', { address: ADDR, block: '0x64' }, rpcOk('0x0'));
			await new QuicknodeRpc().execute.call(ctx);
			expect(getHttpBody(ctx).params[1]).toBe('0x64');
		});

		it('converts hex result to ETH — 1 ETH = 0xde0b6b3a7640000 wei', async () => {
			const ctx = buildCtx('getBalance', { address: ADDR, block: 'latest' }, rpcOk('0xde0b6b3a7640000'));
			const result = await new QuicknodeRpc().execute.call(ctx);
			const json = result[0][0].json as Record<string, unknown>;
			expect(json.balanceWei).toBe('1000000000000000000');
			expect(json.balanceEth).toBe('1.000000000000000000');
		});

		it('rejects address without 0x prefix', async () => {
			const ctx = buildCtx('getBalance', { address: '1234567890123456789012345678901234567890', block: 'latest' });
			await expect(new QuicknodeRpc().execute.call(ctx)).rejects.toThrow(/Invalid Ethereum address/);
		});

		it('rejects address that is too short', async () => {
			const ctx = buildCtx('getBalance', { address: '0x1234', block: 'latest' });
			await expect(new QuicknodeRpc().execute.call(ctx)).rejects.toThrow(/Invalid Ethereum address/);
		});
	});

	// ── getBlockNumber ───────────────────────────────────────────────────────

	describe('getBlockNumber', () => {
		it('sends eth_blockNumber with empty params', async () => {
			const ctx = buildCtx('getBlockNumber', {}, rpcOk('0x12a05f200'));
			await new QuicknodeRpc().execute.call(ctx);
			expect(getHttpBody(ctx)).toMatchObject({ method: 'eth_blockNumber', params: [] });
		});

		it('converts hex block number to decimal integer', async () => {
			// 0x64 = 100
			const ctx = buildCtx('getBlockNumber', {}, rpcOk('0x64'));
			const result = await new QuicknodeRpc().execute.call(ctx);
			expect((result[0][0].json as Record<string, unknown>).blockNumberDecimal).toBe(100);
		});
	});

	// ── getBlock ─────────────────────────────────────────────────────────────

	describe('getBlock', () => {
		it('routes to eth_getBlockByHash when given a 66-char hex hash', async () => {
			const ctx = buildCtx('getBlock', { blockIdentifier: BLOCK_HASH, fullTransactions: false }, rpcOk({}));
			await new QuicknodeRpc().execute.call(ctx);
			expect(getHttpBody(ctx)).toMatchObject({
				method: 'eth_getBlockByHash',
				params: [BLOCK_HASH, false],
			});
		});

		it('routes to eth_getBlockByNumber when given a block tag', async () => {
			const ctx = buildCtx('getBlock', { blockIdentifier: 'latest', fullTransactions: true }, rpcOk({}));
			await new QuicknodeRpc().execute.call(ctx);
			expect(getHttpBody(ctx)).toMatchObject({
				method: 'eth_getBlockByNumber',
				params: ['latest', true],
			});
		});

		it('routes to eth_getBlockByNumber and converts decimal to hex', async () => {
			const ctx = buildCtx('getBlock', { blockIdentifier: '17000000', fullTransactions: false }, rpcOk({}));
			await new QuicknodeRpc().execute.call(ctx);
			expect(getHttpBody(ctx)).toMatchObject({
				method: 'eth_getBlockByNumber',
				params: ['0x' + (17000000).toString(16), false],
			});
		});
	});

	// ── getTransaction ───────────────────────────────────────────────────────

	describe('getTransaction', () => {
		it('sends eth_getTransactionByHash with hash', async () => {
			const ctx = buildCtx('getTransaction', { txHash: TX_HASH }, rpcOk({ hash: TX_HASH }));
			await new QuicknodeRpc().execute.call(ctx);
			expect(getHttpBody(ctx)).toMatchObject({ method: 'eth_getTransactionByHash', params: [TX_HASH] });
		});

		it('rejects a hash that is too short', async () => {
			const ctx = buildCtx('getTransaction', { txHash: '0xabc' });
			await expect(new QuicknodeRpc().execute.call(ctx)).rejects.toThrow(/Invalid transaction hash/);
		});
	});

	// ── getTransactionReceipt ────────────────────────────────────────────────

	describe('getTransactionReceipt', () => {
		it('sends eth_getTransactionReceipt — distinct from getTransaction', async () => {
			const ctx = buildCtx('getTransactionReceipt', { txHash: TX_HASH }, rpcOk({}));
			await new QuicknodeRpc().execute.call(ctx);
			expect(getHttpBody(ctx).method).toBe('eth_getTransactionReceipt');
		});
	});

	// ── getGasPrice ──────────────────────────────────────────────────────────

	describe('getGasPrice', () => {
		it('converts wei to gwei — 1 gwei = 0x3b9aca00 wei', async () => {
			const ctx = buildCtx('getGasPrice', {}, rpcOk('0x3b9aca00'));
			const result = await new QuicknodeRpc().execute.call(ctx);
			const json = result[0][0].json as Record<string, unknown>;
			expect(json.gasPriceWei).toBe('1000000000');
			expect(json.gasPriceGwei).toBe('1.000000000');
		});
	});

	// ── getTransactionCount ──────────────────────────────────────────────────

	describe('getTransactionCount', () => {
		it('converts hex nonce to decimal', async () => {
			// 0xa = 10
			const ctx = buildCtx('getTransactionCount', { address: ADDR, block: 'latest' }, rpcOk('0xa'));
			const result = await new QuicknodeRpc().execute.call(ctx);
			expect((result[0][0].json as Record<string, unknown>).transactionCountDecimal).toBe(10);
		});
	});

	// ── estimateGas ──────────────────────────────────────────────────────────

	describe('estimateGas', () => {
		it('omits from and data when empty, includes to', async () => {
			const ctx = buildCtx('estimateGas', { to: ADDR, from: '', data: '', value: '0' }, rpcOk('0x5208'));
			await new QuicknodeRpc().execute.call(ctx);
			const body = getHttpBody(ctx);
			expect(body.params[0]).toEqual({ to: ADDR });
			expect(body.params[0].from).toBeUndefined();
			expect(body.params[0].data).toBeUndefined();
		});

		it('includes optional from and data when provided', async () => {
			const ctx = buildCtx(
				'estimateGas',
				{ to: ADDR, from: ADDR2, data: '0xabcd', value: '0' },
				rpcOk('0x5208'),
			);
			await new QuicknodeRpc().execute.call(ctx);
			expect(getHttpBody(ctx).params[0]).toMatchObject({ to: ADDR, from: ADDR2, data: '0xabcd' });
		});

		it('converts decimal wei value to hex', async () => {
			const ctx = buildCtx('estimateGas', { to: ADDR, from: '', data: '', value: '1000' }, rpcOk('0x5208'));
			await new QuicknodeRpc().execute.call(ctx);
			expect(getHttpBody(ctx).params[0].value).toBe('0x3e8');
		});

		it('passes through a hex value unchanged', async () => {
			const ctx = buildCtx('estimateGas', { to: ADDR, from: '', data: '', value: '0x3e8' }, rpcOk('0x5208'));
			await new QuicknodeRpc().execute.call(ctx);
			expect(getHttpBody(ctx).params[0].value).toBe('0x3e8');
		});

		it('converts gas estimate hex to decimal', async () => {
			// 0x5208 = 21000 (standard ETH transfer)
			const ctx = buildCtx('estimateGas', { to: ADDR, from: '', data: '', value: '0' }, rpcOk('0x5208'));
			const result = await new QuicknodeRpc().execute.call(ctx);
			expect((result[0][0].json as Record<string, unknown>).gasEstimateDecimal).toBe(21000);
		});

		it('rejects invalid to address', async () => {
			const ctx = buildCtx('estimateGas', { to: 'not-an-address', from: '', data: '', value: '0' });
			await expect(new QuicknodeRpc().execute.call(ctx)).rejects.toThrow(/Invalid 'to' address/);
		});

		it('rejects invalid from address when provided', async () => {
			const ctx = buildCtx('estimateGas', { to: ADDR, from: 'bad-address', data: '', value: '0' });
			await expect(new QuicknodeRpc().execute.call(ctx)).rejects.toThrow(/Invalid 'from' address/);
		});
	});

	// ── customRpc ────────────────────────────────────────────────────────────

	describe('customRpc', () => {
		it('passes method and params through unchanged', async () => {
			const ctx = buildCtx('customRpc', { rpcMethod: 'eth_chainId', rpcParams: '[]' }, rpcOk('0x1'));
			await new QuicknodeRpc().execute.call(ctx);
			expect(getHttpBody(ctx)).toMatchObject({ method: 'eth_chainId', params: [] });
		});

		it('passes array params correctly', async () => {
			const ctx = buildCtx(
				'customRpc',
				{ rpcMethod: 'eth_getBalance', rpcParams: `["${ADDR}", "latest"]` },
				rpcOk('0x0'),
			);
			await new QuicknodeRpc().execute.call(ctx);
			expect(getHttpBody(ctx).params).toEqual([ADDR, 'latest']);
		});

		it('throws on non-array JSON params', async () => {
			const ctx = buildCtx('customRpc', { rpcMethod: 'eth_chainId', rpcParams: '{"key": "val"}' });
			await expect(new QuicknodeRpc().execute.call(ctx)).rejects.toThrow(/Invalid JSON parameters/);
		});

		it('throws on malformed JSON params', async () => {
			const ctx = buildCtx('customRpc', { rpcMethod: 'eth_chainId', rpcParams: 'not json {[' });
			await expect(new QuicknodeRpc().execute.call(ctx)).rejects.toThrow(/Invalid JSON parameters/);
		});
	});

	// ── RPC error handling ───────────────────────────────────────────────────

	describe('RPC error handling', () => {
		it('throws when RPC response contains an error', async () => {
			const ctx = buildCtx('getBlockNumber', {}, rpcErr('execution reverted'));
			await expect(new QuicknodeRpc().execute.call(ctx)).rejects.toThrow(/execution reverted/);
		});

		it('uses "RPC Error" as fallback when error message is missing', async () => {
			const ctx = buildCtx('getBlockNumber', {}, { jsonrpc: '2.0', id: 1, error: { code: -32000 } });
			await expect(new QuicknodeRpc().execute.call(ctx)).rejects.toThrow(/RPC Error/);
		});
	});

	// ── continueOnFail ───────────────────────────────────────────────────────

	describe('continueOnFail', () => {
		it('collects error into output instead of throwing when enabled', async () => {
			const ctx = buildCtx(
				'getBalance',
				{ address: 'bad-address', block: 'latest' },
				rpcOk(null),
				{ continueOnFail: true },
			);
			const result = await new QuicknodeRpc().execute.call(ctx);
			expect(result[0]).toHaveLength(1);
			expect((result[0][0].json as Record<string, unknown>).error).toMatch(/Invalid Ethereum address/);
		});
	});

	// ── Multiple items ───────────────────────────────────────────────────────

	describe('multiple input items', () => {
		it('processes each item and returns one output per input', async () => {
			const httpRequest = jest.fn()
				.mockResolvedValueOnce(rpcOk('0xde0b6b3a7640000'))
				.mockResolvedValueOnce(rpcOk('0x1bc16d674ec80000'));

			const ctx = {
				getInputData: () => [{ json: {} }, { json: {} }],
				getNodeParameter: (name: string, _i: number, fallback?: unknown) => {
					if (name === 'operation') return 'getBalance';
					if (name === 'address') return ADDR;
					if (name === 'block') return 'latest';
					return fallback ?? '';
				},
				getCredentials: jest.fn().mockResolvedValue(CREDENTIALS),
				helpers: { httpRequest },
				getNode: () => ({ name: 'QuicknodeRpc', type: 'quicknodeRpc', typeVersion: 1 }),
				continueOnFail: () => false,
			} as unknown as IExecuteFunctions;

			const result = await new QuicknodeRpc().execute.call(ctx);
			expect(result[0]).toHaveLength(2);
			expect(httpRequest).toHaveBeenCalledTimes(2);
		});
	});

});
