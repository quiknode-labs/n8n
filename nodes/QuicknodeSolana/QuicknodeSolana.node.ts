import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

// Solana public keys are base58-encoded 32-byte values (32–44 chars)
// Base58 alphabet excludes 0, O, I, l
function isValidSolanaAddress(address: string): boolean {
	return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

// Solana transaction signatures are base58-encoded 64-byte values (87–88 chars)
function isValidSolanaSignature(sig: string): boolean {
	return /^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(sig);
}

export class QuicknodeSolana implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Quicknode Solana RPC',
		name: 'quicknodeSolana',
		icon: 'file:quicknode.png',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Interact with Solana via Quicknode RPC',
		defaults: {
			name: 'Quicknode Solana RPC',
		},
		inputs: ['main'],
		outputs: ['main'],
		usableAsTool: true,
		credentials: [
			{
				name: 'quicknodeSolanaApi',
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
						name: 'Get Balance',
						value: 'getBalance',
						description: 'Get the SOL balance of a wallet address',
						action: 'Get SOL balance of an address',
					},
					{
						name: 'Get Account Info',
						value: 'getAccountInfo',
						description: 'Get all information associated with an account',
						action: 'Get account info',
					},
					{
						name: 'Get Transaction',
						value: 'getTransaction',
						description: 'Get transaction details by signature',
						action: 'Get transaction details',
					},
					{
						name: 'Get Slot',
						value: 'getSlot',
						description: 'Get the current slot number',
						action: 'Get current slot number',
					},
					{
						name: 'Get Block',
						value: 'getBlock',
						description: 'Get block information by slot number',
						action: 'Get block by slot number',
					},
					{
						name: 'Get Token Accounts By Owner',
						value: 'getTokenAccountsByOwner',
						description: 'Get all SPL token accounts for a wallet address',
						action: 'Get token accounts by owner',
					},
					{
						name: 'Get Health',
						value: 'getHealth',
						description: 'Check if the node is healthy',
						action: 'Check node health',
					},
					{
						name: 'Get Version',
						value: 'getVersion',
						description: 'Get the current Solana version running on the node',
						action: 'Get node version',
					},
					{
						name: 'Send Transaction',
						value: 'sendTransaction',
						description: 'Submit a signed transaction to the network',
						action: 'Send a signed transaction',
					},
					{
						name: 'Custom RPC',
						value: 'customRpc',
						description: 'Execute any Solana JSON-RPC method',
						action: 'Execute custom RPC method',
					},
				],
				default: 'getBalance',
			},

			// ── Address (getBalance, getAccountInfo, getTokenAccountsByOwner) ──
			{
				displayName: 'Wallet Address',
				name: 'address',
				type: 'string',
				default: '',
				placeholder: 'e.g. 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
				description: 'The Solana public key (base58-encoded)',
				required: true,
				displayOptions: {
					show: {
						operation: ['getBalance', 'getAccountInfo', 'getTokenAccountsByOwner'],
					},
				},
			},

			// ── Commitment (getBalance, getAccountInfo, getSlot, getBlock, getTransaction) ──
			{
				displayName: 'Commitment',
				name: 'commitment',
				type: 'options',
				options: [
					{ name: 'Finalized', value: 'finalized' },
					{ name: 'Confirmed', value: 'confirmed' },
					{ name: 'Processed', value: 'processed' },
				],
				default: 'finalized',
				description: 'The commitment level for the query',
				displayOptions: {
					show: {
						operation: ['getBalance', 'getAccountInfo', 'getSlot', 'getBlock', 'getTransaction'],
					},
				},
			},

			// ── Encoding for getAccountInfo ──
			{
				displayName: 'Encoding',
				name: 'encoding',
				type: 'options',
				options: [
					{ name: 'Base64', value: 'base64' },
					{ name: 'Base58', value: 'base58' },
					{ name: 'JSON Parsed', value: 'jsonParsed' },
				],
				default: 'base64',
				description: 'Encoding format for the account data',
				displayOptions: {
					show: {
						operation: ['getAccountInfo'],
					},
				},
			},

			// ── Transaction signature ──
			{
				displayName: 'Transaction Signature',
				name: 'signature',
				type: 'string',
				default: '',
				placeholder: 'e.g. 5UmDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtA...',
				description: 'The transaction signature (base58-encoded)',
				required: true,
				displayOptions: {
					show: {
						operation: ['getTransaction'],
					},
				},
			},

			// ── Slot number for getBlock ──
			{
				displayName: 'Slot',
				name: 'slot',
				type: 'number',
				default: 0,
				description: 'The slot number to retrieve the block for',
				required: true,
				displayOptions: {
					show: {
						operation: ['getBlock'],
					},
				},
			},

			// ── getBlock options ──
			{
				displayName: 'Transaction Details',
				name: 'transactionDetails',
				type: 'options',
				options: [
					{ name: 'Full', value: 'full' },
					{ name: 'Signatures Only', value: 'signatures' },
					{ name: 'None', value: 'none' },
				],
				default: 'signatures',
				description: 'Level of transaction detail to return in the block',
				displayOptions: {
					show: {
						operation: ['getBlock'],
					},
				},
			},

			// ── getTokenAccountsByOwner filter ──
			{
				displayName: 'Filter By',
				name: 'tokenFilter',
				type: 'options',
				options: [
					{ name: 'Mint Address', value: 'mint' },
					{ name: 'Token Program ID', value: 'programId' },
				],
				default: 'mint',
				description: 'Filter token accounts by a specific mint or token program',
				displayOptions: {
					show: {
						operation: ['getTokenAccountsByOwner'],
					},
				},
			},
			{
				displayName: 'Mint / Program ID',
				name: 'tokenFilterValue',
				type: 'string',
				default: '',
				placeholder: 'e.g. EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
				description: 'The mint address or token program ID to filter by',
				required: true,
				displayOptions: {
					show: {
						operation: ['getTokenAccountsByOwner'],
					},
				},
			},

			// ── sendTransaction ──
			{
				displayName: 'Signed Transaction',
				name: 'signedTransaction',
				type: 'string',
				default: '',
				placeholder: 'Base64-encoded signed transaction',
				description: 'The fully signed transaction, encoded as a base64 string',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendTransaction'],
					},
				},
			},
			{
				displayName: 'Skip Preflight',
				name: 'skipPreflight',
				type: 'boolean',
				default: false,
				description: 'Whether to skip the preflight transaction checks',
				displayOptions: {
					show: {
						operation: ['sendTransaction'],
					},
				},
			},

			// ── Custom RPC ──
			{
				displayName: 'RPC Method',
				name: 'rpcMethod',
				type: 'string',
				default: '',
				placeholder: 'e.g. getBlockHeight',
				description: 'The Solana JSON-RPC method name',
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
				placeholder: '["9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"]',
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

		const credentials = await this.getCredentials('quicknodeSolanaApi');
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
					case 'getBalance': {
						const address = this.getNodeParameter('address', i) as string;
						const commitment = this.getNodeParameter('commitment', i, 'finalized') as string;

						if (!isValidSolanaAddress(address)) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid Solana address: ${address}. Must be a base58-encoded public key (32–44 characters).`,
								{ itemIndex: i },
							);
						}

						method = 'getBalance';
						params = [address, { commitment }];
						break;
					}

					case 'getAccountInfo': {
						const address = this.getNodeParameter('address', i) as string;
						const commitment = this.getNodeParameter('commitment', i, 'finalized') as string;
						const encoding = this.getNodeParameter('encoding', i, 'base64') as string;

						if (!isValidSolanaAddress(address)) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid Solana address: ${address}. Must be a base58-encoded public key (32–44 characters).`,
								{ itemIndex: i },
							);
						}

						method = 'getAccountInfo';
						params = [address, { commitment, encoding }];
						break;
					}

					case 'getTransaction': {
						const signature = this.getNodeParameter('signature', i) as string;
						const commitment = this.getNodeParameter('commitment', i, 'finalized') as string;

						if (!isValidSolanaSignature(signature)) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid transaction signature: ${signature}. Must be a base58-encoded signature (~88 characters).`,
								{ itemIndex: i },
							);
						}

						method = 'getTransaction';
						params = [signature, { commitment, encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }];
						break;
					}

					case 'getSlot': {
						const commitment = this.getNodeParameter('commitment', i, 'finalized') as string;
						method = 'getSlot';
						params = [{ commitment }];
						break;
					}

					case 'getBlock': {
						const slot = this.getNodeParameter('slot', i) as number;
						const commitment = this.getNodeParameter('commitment', i, 'finalized') as string;
						const transactionDetails = this.getNodeParameter('transactionDetails', i, 'signatures') as string;

						if (!Number.isInteger(slot) || slot < 0) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid slot: ${slot}. Must be a non-negative integer.`,
								{ itemIndex: i },
							);
						}

						method = 'getBlock';
						params = [slot, { commitment, transactionDetails, maxSupportedTransactionVersion: 0 }];
						break;
					}

					case 'getTokenAccountsByOwner': {
						const address = this.getNodeParameter('address', i) as string;
						const tokenFilter = this.getNodeParameter('tokenFilter', i, 'mint') as string;
						const tokenFilterValue = this.getNodeParameter('tokenFilterValue', i) as string;

						if (!isValidSolanaAddress(address)) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid Solana address: ${address}. Must be a base58-encoded public key (32–44 characters).`,
								{ itemIndex: i },
							);
						}

						if (!isValidSolanaAddress(tokenFilterValue)) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid ${tokenFilter === 'mint' ? 'mint' : 'program'} address: ${tokenFilterValue}. Must be a base58-encoded public key.`,
								{ itemIndex: i },
							);
						}

						method = 'getTokenAccountsByOwner';
						params = [address, { [tokenFilter]: tokenFilterValue }, { encoding: 'jsonParsed' }];
						break;
					}

					case 'getHealth': {
						method = 'getHealth';
						params = [];
						break;
					}

					case 'getVersion': {
						method = 'getVersion';
						params = [];
						break;
					}

					case 'sendTransaction': {
						const signedTransaction = this.getNodeParameter('signedTransaction', i) as string;
						const skipPreflight = this.getNodeParameter('skipPreflight', i, false) as boolean;

						method = 'sendTransaction';
						params = [signedTransaction, { encoding: 'base64', skipPreflight }];
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

				// Add human-readable conversions
				if (operation === 'getBalance' && response.result !== null && response.result !== undefined) {
					const lamports = (response.result as IDataObject).value as number;
					resultData.balanceLamports = lamports;
					resultData.balanceSol = (lamports / 1e9).toFixed(9);
				}

				if (operation === 'getSlot' && response.result !== null && response.result !== undefined) {
					resultData.slot = response.result;
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
