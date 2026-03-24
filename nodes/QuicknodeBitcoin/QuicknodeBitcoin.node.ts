import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

// Bitcoin txids are 64 lowercase hex characters (no 0x prefix)
function isValidTxid(txid: string): boolean {
	return /^[a-fA-F0-9]{64}$/.test(txid);
}

// Bitcoin block hashes are 64 lowercase hex characters (no 0x prefix)
function isValidBlockHash(hash: string): boolean {
	return /^[a-fA-F0-9]{64}$/.test(hash);
}

// Accept legacy P2PKH (1...), P2SH (3...), bech32 (bc1...), and testnet (m/n/2.../tb1...) addresses
// Legacy/P2SH use base58 (excludes 0, O, I, l); bech32 uses lowercase alphanumeric
function isValidBitcoinAddress(address: string): boolean {
	const legacy = /^[13][1-9A-HJ-NP-Za-km-z]{24,33}$/;
	const bech32 = /^bc1[a-z0-9]{39,59}$/;
	const testnetLegacy = /^[mn2][1-9A-HJ-NP-Za-km-z]{24,33}$/;
	const testnetBech32 = /^tb1[a-z0-9]{39,59}$/;
	return legacy.test(address) || bech32.test(address) || testnetLegacy.test(address) || testnetBech32.test(address);
}

export class QuicknodeBitcoin implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Quicknode Bitcoin RPC',
		name: 'quicknodeBitcoin',
		icon: 'file:quicknode.png',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Interact with Bitcoin via Quicknode RPC',
		defaults: {
			name: 'Quicknode Bitcoin RPC',
		},
		inputs: ['main'],
		outputs: ['main'],
		usableAsTool: true,
		credentials: [
			{
				name: 'quicknodeBitcoinApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Get Blockchain Info',
						value: 'getBlockchainInfo',
						description: 'Get general info about the blockchain (chain, blocks, sync status)',
						action: 'Get blockchain info',
					},
					{
						name: 'Get Block Count',
						value: 'getBlockCount',
						description: 'Get the current block height',
						action: 'Get current block height',
					},
					{
						name: 'Get Block Hash',
						value: 'getBlockHash',
						description: 'Get the block hash at a given height',
						action: 'Get block hash at height',
					},
					{
						name: 'Get Block',
						value: 'getBlock',
						description: 'Get block data by hash',
						action: 'Get block by hash',
					},
					{
						name: 'Get Raw Transaction',
						value: 'getRawTransaction',
						description: 'Get transaction details by txid',
						action: 'Get transaction by txid',
					},
					{
						name: 'Get UTXO',
						value: 'getTxOut',
						description: 'Get details of an unspent transaction output',
						action: 'Get unspent transaction output',
					},
					{
						name: 'Get Mempool Info',
						value: 'getMempoolInfo',
						description: 'Get current mempool statistics',
						action: 'Get mempool info',
					},
					{
						name: 'Estimate Smart Fee',
						value: 'estimateSmartFee',
						description: 'Estimate the fee rate for a transaction to confirm within N blocks',
						action: 'Estimate smart fee',
					},
					{
						name: 'Send Raw Transaction',
						value: 'sendRawTransaction',
						description: 'Broadcast a signed raw transaction to the network',
						action: 'Broadcast raw transaction',
					},
					{
						name: 'Custom RPC',
						value: 'customRpc',
						description: 'Execute any Bitcoin JSON-RPC method',
						action: 'Execute custom RPC method',
					},
				],
				default: 'getBlockchainInfo',
			},

			// ── Block height (getBlockHash) ──
			{
				displayName: 'Block Height',
				name: 'blockHeight',
				type: 'number',
				default: 0,
				description: 'The block height (zero-based index)',
				required: true,
				displayOptions: {
					show: {
						operation: ['getBlockHash'],
					},
				},
			},

			// ── Block hash (getBlock) ──
			{
				displayName: 'Block Hash',
				name: 'blockHash',
				type: 'string',
				default: '',
				placeholder: 'e.g. 000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
				description: 'The block hash (64 hex characters)',
				required: true,
				displayOptions: {
					show: {
						operation: ['getBlock'],
					},
				},
			},
			{
				displayName: 'Verbosity',
				name: 'verbosity',
				type: 'options',
				options: [
					{ name: 'Hash List (0)', value: 0 },
					{ name: 'Block + Tx Summaries (1)', value: 1 },
					{ name: 'Block + Full Transactions (2)', value: 2 },
				],
				default: 1,
				description: 'Level of detail to return for the block',
				displayOptions: {
					show: {
						operation: ['getBlock'],
					},
				},
			},

			// ── Txid (getRawTransaction, getTxOut) ──
			{
				displayName: 'Transaction ID (txid)',
				name: 'txid',
				type: 'string',
				default: '',
				placeholder: 'e.g. a1075db55d416d3ca199f55b6084e2115b9345e16c5cf302fc80e9d5fbf5d48d',
				description: 'The transaction ID (64 hex characters)',
				required: true,
				displayOptions: {
					show: {
						operation: ['getRawTransaction', 'getTxOut'],
					},
				},
			},

			// ── getRawTransaction: verbose ──
			{
				displayName: 'Verbose',
				name: 'verbose',
				type: 'boolean',
				default: true,
				description: 'Whether to return a decoded JSON object instead of raw hex',
				displayOptions: {
					show: {
						operation: ['getRawTransaction'],
					},
				},
			},

			// ── getTxOut: output index ──
			{
				displayName: 'Output Index (vout)',
				name: 'vout',
				type: 'number',
				default: 0,
				description: 'The index of the output within the transaction',
				required: true,
				displayOptions: {
					show: {
						operation: ['getTxOut'],
					},
				},
			},
			{
				displayName: 'Include Mempool',
				name: 'includeMempool',
				type: 'boolean',
				default: true,
				description: 'Whether to include outputs currently in the mempool',
				displayOptions: {
					show: {
						operation: ['getTxOut'],
					},
				},
			},

			// ── estimateSmartFee ──
			{
				displayName: 'Confirmation Target (blocks)',
				name: 'confTarget',
				type: 'number',
				default: 6,
				description: 'Target number of blocks for confirmation (1–1008)',
				required: true,
				displayOptions: {
					show: {
						operation: ['estimateSmartFee'],
					},
				},
			},
			{
				displayName: 'Estimate Mode',
				name: 'estimateMode',
				type: 'options',
				options: [
					{ name: 'Conservative', value: 'CONSERVATIVE' },
					{ name: 'Economical', value: 'ECONOMICAL' },
				],
				default: 'CONSERVATIVE',
				description: 'Fee estimation mode',
				displayOptions: {
					show: {
						operation: ['estimateSmartFee'],
					},
				},
			},

			// ── sendRawTransaction ──
			{
				displayName: 'Raw Transaction Hex',
				name: 'rawTx',
				type: 'string',
				default: '',
				placeholder: 'Signed raw transaction as a hex string',
				description: 'The signed raw transaction encoded as a hex string',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendRawTransaction'],
					},
				},
			},

			// ── Custom RPC ──
			{
				displayName: 'RPC Method',
				name: 'rpcMethod',
				type: 'string',
				default: '',
				placeholder: 'e.g. getnetworkinfo',
				description: 'The Bitcoin JSON-RPC method name',
				required: true,
				displayOptions: {
					show: {
						operation: ['customRpc'],
					},
				},
			},
			{
				displayName: 'Parameters',
				name: 'rpcParams',
				type: 'json',
				default: '[]',
				placeholder: '["000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f", 1]',
				description: 'The parameters as a JSON array',
				displayOptions: {
					show: {
						operation: ['customRpc'],
					},
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const credentials = await this.getCredentials('quicknodeBitcoinApi');
		const rpcEndpoint = credentials.rpcEndpoint as string;

		if (!rpcEndpoint) {
			throw new NodeOperationError(this.getNode(), 'RPC endpoint is required in credentials');
		}

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;
				let method: string;
				let params: unknown[] = [];

				switch (operation) {
					case 'getBlockchainInfo': {
						method = 'getblockchaininfo';
						params = [];
						break;
					}

					case 'getBlockCount': {
						method = 'getblockcount';
						params = [];
						break;
					}

					case 'getBlockHash': {
						const blockHeight = this.getNodeParameter('blockHeight', i) as number;

						if (!Number.isInteger(blockHeight) || blockHeight < 0) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid block height: ${blockHeight}. Must be a non-negative integer.`,
								{ itemIndex: i },
							);
						}

						method = 'getblockhash';
						params = [blockHeight];
						break;
					}

					case 'getBlock': {
						const blockHash = this.getNodeParameter('blockHash', i) as string;
						const verbosity = this.getNodeParameter('verbosity', i, 1) as number;

						if (!isValidBlockHash(blockHash)) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid block hash: ${blockHash}. Must be 64 hex characters.`,
								{ itemIndex: i },
							);
						}

						method = 'getblock';
						params = [blockHash, verbosity];
						break;
					}

					case 'getRawTransaction': {
						const txid = this.getNodeParameter('txid', i) as string;
						const verbose = this.getNodeParameter('verbose', i, true) as boolean;

						if (!isValidTxid(txid)) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid txid: ${txid}. Must be 64 hex characters.`,
								{ itemIndex: i },
							);
						}

						method = 'getrawtransaction';
						params = [txid, verbose];
						break;
					}

					case 'getTxOut': {
						const txid = this.getNodeParameter('txid', i) as string;
						const vout = this.getNodeParameter('vout', i, 0) as number;
						const includeMempool = this.getNodeParameter('includeMempool', i, true) as boolean;

						if (!isValidTxid(txid)) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid txid: ${txid}. Must be 64 hex characters.`,
								{ itemIndex: i },
							);
						}

						if (!Number.isInteger(vout) || vout < 0) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid output index: ${vout}. Must be a non-negative integer.`,
								{ itemIndex: i },
							);
						}

						method = 'gettxout';
						params = [txid, vout, includeMempool];
						break;
					}

					case 'getMempoolInfo': {
						method = 'getmempoolinfo';
						params = [];
						break;
					}

					case 'estimateSmartFee': {
						const confTarget = this.getNodeParameter('confTarget', i, 6) as number;
						const estimateMode = this.getNodeParameter('estimateMode', i, 'CONSERVATIVE') as string;

						if (!Number.isInteger(confTarget) || confTarget < 1 || confTarget > 1008) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid confirmation target: ${confTarget}. Must be an integer between 1 and 1008.`,
								{ itemIndex: i },
							);
						}

						method = 'estimatesmartfee';
						params = [confTarget, estimateMode];
						break;
					}

					case 'sendRawTransaction': {
						const rawTx = this.getNodeParameter('rawTx', i) as string;

						if (!/^[a-fA-F0-9]+$/.test(rawTx) || rawTx.length % 2 !== 0) {
							throw new NodeOperationError(
								this.getNode(),
								'Invalid raw transaction: must be a valid hex string with an even number of characters.',
								{ itemIndex: i },
							);
						}

						method = 'sendrawtransaction';
						params = [rawTx];
						break;
					}

					case 'customRpc': {
						method = this.getNodeParameter('rpcMethod', i) as string;
						const paramsJson = this.getNodeParameter('rpcParams', i, '[]') as string;

						try {
							params = JSON.parse(paramsJson);
							if (!Array.isArray(params)) {
								throw new Error('Parameters must be a JSON array');
							}
						} catch (parseError) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid JSON parameters: ${(parseError as Error).message}`,
								{ itemIndex: i },
							);
						}
						break;
					}

					default:
						throw new NodeOperationError(
							this.getNode(),
							`Unknown operation: ${operation}`,
							{ itemIndex: i },
						);
				}

				// Make the RPC request
				const response = await this.helpers.httpRequest({
					method: 'POST',
					url: rpcEndpoint,
					headers: {
						'Content-Type': 'application/json',
					},
					body: {
						jsonrpc: '2.0',
						method,
						params,
						id: i + 1,
					},
					json: true,
				});

				// Handle RPC errors
				if (response.error) {
					throw new NodeApiError(
						this.getNode(),
						{
							message: response.error.message || 'RPC Error',
							description: `RPC method ${method} failed: ${response.error.message}`,
							code: response.error.code,
						},
						{ itemIndex: i },
					);
				}

				const resultData: IDataObject = {
					result: response.result,
					method,
					network: credentials.network,
				};

				// Add human-readable fee conversion for estimateSmartFee
				if (operation === 'estimateSmartFee' && response.result?.feerate !== undefined) {
					// feerate is in BTC/kB
					const feerateBtcPerKb = response.result.feerate as number;
					resultData.feerateBtcPerKb = feerateBtcPerKb;
					resultData.feerateSatPerByte = Math.round(feerateBtcPerKb * 1e8 / 1000);
				}

				returnData.push({
					json: resultData,
					pairedItem: { item: i },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
						},
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
