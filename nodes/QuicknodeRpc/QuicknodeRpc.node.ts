import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

// Helper function to validate Ethereum address
function isValidAddress(address: string): boolean {
	return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Helper function to validate transaction hash
function isValidTxHash(hash: string): boolean {
	return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

// Convert block number to hex if needed
function toBlockTag(block: string): string {
	if (['latest', 'earliest', 'pending', 'safe', 'finalized'].includes(block)) {
		return block;
	}
	if (/^\d+$/.test(block)) {
		return '0x' + parseInt(block, 10).toString(16);
	}
	return block;
}

export class QuicknodeRpc implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Quicknode RPC',
		name: 'quicknodeRpc',
		icon: 'file:quicknode.png',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Interact with blockchain via Quicknode RPC',
		defaults: {
			name: 'Quicknode RPC',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'quicknodeApi',
				required: true,
			},
		],
		properties: [
			// Operation selector
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Get Balance',
						value: 'getBalance',
						description: 'Get the balance of an address',
						action: 'Get the balance of an address',
					},
					{
						name: 'Get Block Number',
						value: 'getBlockNumber',
						description: 'Get the current block number',
						action: 'Get the current block number',
					},
					{
						name: 'Get Block',
						value: 'getBlock',
						description: 'Get block information by number or hash',
						action: 'Get block information',
					},
					{
						name: 'Get Transaction',
						value: 'getTransaction',
						description: 'Get transaction details by hash',
						action: 'Get transaction details',
					},
					{
						name: 'Get Transaction Receipt',
						value: 'getTransactionReceipt',
						description: 'Get transaction receipt by hash',
						action: 'Get transaction receipt',
					},
					{
						name: 'Get Transaction Count',
						value: 'getTransactionCount',
						description: 'Get the number of transactions sent from an address',
						action: 'Get transaction count for address',
					},
					{
						name: 'Get Code',
						value: 'getCode',
						description: 'Get the code at a specific address (for smart contracts)',
						action: 'Get code at address',
					},
					{
						name: 'Get Gas Price',
						value: 'getGasPrice',
						description: 'Get the current gas price',
						action: 'Get current gas price',
					},
					{
						name: 'Estimate Gas',
						value: 'estimateGas',
						description: 'Estimate gas for a transaction',
						action: 'Estimate gas for transaction',
					},
					{
						name: 'Call',
						value: 'call',
						description: 'Execute a call without creating a transaction',
						action: 'Execute read-only call',
					},
					{
						name: 'Custom RPC',
						value: 'customRpc',
						description: 'Execute a custom RPC method',
						action: 'Execute custom RPC method',
					},
				],
				default: 'getBalance',
			},

			// Address input (for operations that need it)
			{
				displayName: 'Address',
				name: 'address',
				type: 'string',
				default: '',
				placeholder: '0x...',
				description: 'The Ethereum address (42 characters starting with 0x)',
				required: true,
				displayOptions: {
					show: {
						operation: ['getBalance', 'getTransactionCount', 'getCode'],
					},
				},
			},

			// Block parameter
			{
				displayName: 'Block',
				name: 'block',
				type: 'string',
				default: 'latest',
				placeholder: 'latest, earliest, pending, or block number',
				description: 'Block number (decimal or hex) or tag: latest, earliest, pending, safe, finalized',
				displayOptions: {
					show: {
						operation: ['getBalance', 'getTransactionCount', 'getCode', 'call'],
					},
				},
			},

			// Block identifier for getBlock
			{
				displayName: 'Block Identifier',
				name: 'blockIdentifier',
				type: 'string',
				default: 'latest',
				placeholder: 'Block number, hash, or tag',
				description: 'Block number (decimal or hex), block hash, or tag (latest, earliest, pending)',
				required: true,
				displayOptions: {
					show: {
						operation: ['getBlock'],
					},
				},
			},

			// Include transactions in block
			{
				displayName: 'Include Full Transactions',
				name: 'fullTransactions',
				type: 'boolean',
				default: false,
				description: 'Whether to return full transaction objects or just hashes',
				displayOptions: {
					show: {
						operation: ['getBlock'],
					},
				},
			},

			// Transaction hash
			{
				displayName: 'Transaction Hash',
				name: 'txHash',
				type: 'string',
				default: '',
				placeholder: '0x...',
				description: 'The transaction hash (66 characters starting with 0x)',
				required: true,
				displayOptions: {
					show: {
						operation: ['getTransaction', 'getTransactionReceipt'],
					},
				},
			},

			// Estimate Gas / Call parameters
			{
				displayName: 'From Address',
				name: 'from',
				type: 'string',
				default: '',
				placeholder: '0x...',
				description: 'The address the transaction is sent from',
				displayOptions: {
					show: {
						operation: ['estimateGas', 'call'],
					},
				},
			},
			{
				displayName: 'To Address',
				name: 'to',
				type: 'string',
				default: '',
				placeholder: '0x...',
				description: 'The address the transaction is directed to',
				required: true,
				displayOptions: {
					show: {
						operation: ['estimateGas', 'call'],
					},
				},
			},
			{
				displayName: 'Data',
				name: 'data',
				type: 'string',
				default: '',
				placeholder: '0x...',
				description: 'The encoded function call data',
				displayOptions: {
					show: {
						operation: ['estimateGas', 'call'],
					},
				},
			},
			{
				displayName: 'Value (Wei)',
				name: 'value',
				type: 'string',
				default: '0',
				placeholder: '0',
				description: 'The value to send in Wei (as decimal or hex)',
				displayOptions: {
					show: {
						operation: ['estimateGas'],
					},
				},
			},

			// Custom RPC fields
			{
				displayName: 'RPC Method',
				name: 'rpcMethod',
				type: 'string',
				default: '',
				placeholder: 'eth_getBalance',
				description: 'The JSON-RPC method name',
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
				placeholder: '["0x...", "latest"]',
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

		const credentials = await this.getCredentials('quicknodeApi');
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
						const block = this.getNodeParameter('block', i, 'latest') as string;

						if (!isValidAddress(address)) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid Ethereum address: ${address}. Must be 42 characters starting with 0x`,
								{ itemIndex: i }
							);
						}

						method = 'eth_getBalance';
						params = [address, toBlockTag(block)];
						break;
					}

					case 'getBlockNumber': {
						method = 'eth_blockNumber';
						params = [];
						break;
					}

					case 'getBlock': {
						const blockIdentifier = this.getNodeParameter('blockIdentifier', i) as string;
						const fullTransactions = this.getNodeParameter('fullTransactions', i) as boolean;

						// Check if it's a block hash (66 chars) or block number/tag
						if (/^0x[a-fA-F0-9]{64}$/.test(blockIdentifier)) {
							method = 'eth_getBlockByHash';
							params = [blockIdentifier, fullTransactions];
						} else {
							method = 'eth_getBlockByNumber';
							params = [toBlockTag(blockIdentifier), fullTransactions];
						}
						break;
					}

					case 'getTransaction': {
						const txHash = this.getNodeParameter('txHash', i) as string;

						if (!isValidTxHash(txHash)) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid transaction hash: ${txHash}. Must be 66 characters starting with 0x`,
								{ itemIndex: i }
							);
						}

						method = 'eth_getTransactionByHash';
						params = [txHash];
						break;
					}

					case 'getTransactionReceipt': {
						const txHash = this.getNodeParameter('txHash', i) as string;

						if (!isValidTxHash(txHash)) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid transaction hash: ${txHash}. Must be 66 characters starting with 0x`,
								{ itemIndex: i }
							);
						}

						method = 'eth_getTransactionReceipt';
						params = [txHash];
						break;
					}

					case 'getTransactionCount': {
						const address = this.getNodeParameter('address', i) as string;
						const block = this.getNodeParameter('block', i, 'latest') as string;

						if (!isValidAddress(address)) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid Ethereum address: ${address}. Must be 42 characters starting with 0x`,
								{ itemIndex: i }
							);
						}

						method = 'eth_getTransactionCount';
						params = [address, toBlockTag(block)];
						break;
					}

					case 'getCode': {
						const address = this.getNodeParameter('address', i) as string;
						const block = this.getNodeParameter('block', i, 'latest') as string;

						if (!isValidAddress(address)) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid Ethereum address: ${address}. Must be 42 characters starting with 0x`,
								{ itemIndex: i }
							);
						}

						method = 'eth_getCode';
						params = [address, toBlockTag(block)];
						break;
					}

					case 'getGasPrice': {
						method = 'eth_gasPrice';
						params = [];
						break;
					}

					case 'estimateGas': {
						const to = this.getNodeParameter('to', i) as string;
						const from = this.getNodeParameter('from', i, '') as string;
						const data = this.getNodeParameter('data', i, '') as string;
						const value = this.getNodeParameter('value', i, '0') as string;

						if (!isValidAddress(to)) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid 'to' address: ${to}. Must be 42 characters starting with 0x`,
								{ itemIndex: i }
							);
						}

						if (from && !isValidAddress(from)) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid 'from' address: ${from}. Must be 42 characters starting with 0x`,
								{ itemIndex: i }
							);
						}

						const txObject: IDataObject = { to };
						if (from) txObject.from = from;
						if (data) txObject.data = data;
						if (value && value !== '0') {
							txObject.value = /^0x/.test(value) ? value : '0x' + parseInt(value, 10).toString(16);
						}

						method = 'eth_estimateGas';
						params = [txObject];
						break;
					}

					case 'call': {
						const to = this.getNodeParameter('to', i) as string;
						const from = this.getNodeParameter('from', i, '') as string;
						const data = this.getNodeParameter('data', i, '') as string;
						const block = this.getNodeParameter('block', i, 'latest') as string;

						if (!isValidAddress(to)) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid 'to' address: ${to}. Must be 42 characters starting with 0x`,
								{ itemIndex: i }
							);
						}

						if (from && !isValidAddress(from)) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid 'from' address: ${from}. Must be 42 characters starting with 0x`,
								{ itemIndex: i }
							);
						}

						const txObject: IDataObject = { to };
						if (from) txObject.from = from;
						if (data) txObject.data = data;

						method = 'eth_call';
						params = [txObject, toBlockTag(block)];
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
								{ itemIndex: i }
							);
						}
						break;
					}

					default:
						throw new NodeOperationError(
							this.getNode(),
							`Unknown operation: ${operation}`,
							{ itemIndex: i }
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
					throw new NodeApiError(this.getNode(), {
						message: response.error.message || 'RPC Error',
						description: `RPC method ${method} failed: ${response.error.message}`,
						code: response.error.code,
					}, { itemIndex: i });
				}

				// Add helpful metadata to the result
				const resultData: IDataObject = {
					result: response.result,
					method,
					network: credentials.network,
				};

				// Add human-readable conversions for common hex values
				if (operation === 'getBalance' && response.result) {
					const weiValue = BigInt(response.result);
					resultData.balanceWei = weiValue.toString();
					resultData.balanceEth = (Number(weiValue) / 1e18).toFixed(18);
				}

				if (operation === 'getBlockNumber' && response.result) {
					resultData.blockNumberDecimal = parseInt(response.result, 16);
				}

				if (operation === 'getGasPrice' && response.result) {
					const gasPriceWei = BigInt(response.result);
					resultData.gasPriceWei = gasPriceWei.toString();
					resultData.gasPriceGwei = (Number(gasPriceWei) / 1e9).toFixed(9);
				}

				if (operation === 'getTransactionCount' && response.result) {
					resultData.transactionCountDecimal = parseInt(response.result, 16);
				}

				if ((operation === 'estimateGas') && response.result) {
					resultData.gasEstimateDecimal = parseInt(response.result, 16);
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
