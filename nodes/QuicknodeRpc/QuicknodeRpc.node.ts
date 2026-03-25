import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

// ── EVM helpers ──────────────────────────────────────────────────────────────
function isValidEvmAddress(address: string): boolean {
	return /^0x[a-fA-F0-9]{40}$/.test(address);
}
function isValidEvmTxHash(hash: string): boolean {
	return /^0x[a-fA-F0-9]{64}$/.test(hash);
}
function toBlockTag(block: string): string {
	if (['latest', 'earliest', 'pending', 'safe', 'finalized'].includes(block)) return block;
	if (/^\d+$/.test(block)) return '0x' + parseInt(block, 10).toString(16);
	if (/^0x[a-fA-F0-9]+$/.test(block)) return block;
	throw new Error(`Invalid block identifier: "${block}". Must be a named tag (latest, earliest, pending, safe, finalized), a decimal block number, or a 0x-prefixed hex string.`);
}

// ── Solana helpers ────────────────────────────────────────────────────────────
function isValidSolanaAddress(address: string): boolean {
	return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}
function isValidSolanaSignature(sig: string): boolean {
	return /^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(sig);
}

// ── Bitcoin helpers ───────────────────────────────────────────────────────────
function isValid64CharHex(value: string): boolean {
	return /^[a-fA-F0-9]{64}$/.test(value);
}
const isValidBitcoinTxid = isValid64CharHex;
const isValidBitcoinBlockHash = isValid64CharHex;

export class QuicknodeRpc implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Quicknode RPC',
		name: 'quicknodeRpc',
		icon: 'file:quicknode.png',
		group: ['transform'],
		version: [1, 2],
		defaultVersion: 2,
		subtitle: '={{$parameter["chain"] === "evm" ? $parameter["operation"] : ($parameter["chain"] === "solana" ? $parameter["solanaOperation"] : $parameter["bitcoinOperation"])}}',
		description: 'Interact with EVM, Solana, and Bitcoin blockchains via Quicknode RPC',
		defaults: {
			name: 'Quicknode RPC',
		},
		inputs: ['main'],
		outputs: ['main'],
		usableAsTool: true,
		credentials: [
			{
				name: 'quicknodeApi',
				required: true,
				displayOptions: { show: { chain: ['evm'] } },
			},
			{
				name: 'quicknodeSolanaApi',
				required: true,
				displayOptions: { show: { chain: ['solana'] } },
			},
			{
				name: 'quicknodeBitcoinApi',
				required: true,
				displayOptions: { show: { chain: ['bitcoin'] } },
			},
		],
		properties: [

			// ─────────────────────────────────────────────────────────────────
			// Chain selector
			// ─────────────────────────────────────────────────────────────────
			{
				displayName: 'Chain',
				name: 'chain',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'EVM (Ethereum, Polygon, etc.)', value: 'evm' },
					{ name: 'Solana', value: 'solana' },
					{ name: 'Bitcoin', value: 'bitcoin' },
				],
				default: 'evm',
				description: 'The blockchain to interact with',
			},

			// ─────────────────────────────────────────────────────────────────
			// EVM: operation + parameters
			// ─────────────────────────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { chain: ['evm'] } },
				options: [
					{ name: 'Call', value: 'call', description: 'Execute a read-only call', action: 'Execute read-only call' },
					{ name: 'Custom RPC', value: 'customRpc', description: 'Execute a custom RPC method', action: 'Execute custom RPC method' },
					{ name: 'Estimate Gas', value: 'estimateGas', description: 'Estimate gas for a transaction', action: 'Estimate gas for transaction' },
					{ name: 'Get Balance', value: 'getBalance', description: 'Get the balance of an address', action: 'Get the balance of an address' },
					{ name: 'Get Block', value: 'getBlock', description: 'Get block information by number or hash', action: 'Get block information' },
					{ name: 'Get Block Number', value: 'getBlockNumber', description: 'Get the current block number', action: 'Get the current block number' },
					{ name: 'Get Code', value: 'getCode', description: 'Get the code at a specific address (for smart contracts)', action: 'Get code at address' },
					{ name: 'Get Gas Price', value: 'getGasPrice', description: 'Get the current gas price', action: 'Get current gas price' },
					{ name: 'Get Transaction', value: 'getTransaction', description: 'Get transaction details by hash', action: 'Get transaction details' },
					{ name: 'Get Transaction Count', value: 'getTransactionCount', description: 'Get the number of transactions sent from an address', action: 'Get transaction count for address' },
					{ name: 'Get Transaction Receipt', value: 'getTransactionReceipt', description: 'Get transaction receipt by hash', action: 'Get transaction receipt' },
				],
				default: 'getBalance',
			},
			{
				displayName: 'Address',
				name: 'address',
				type: 'string',
				default: '',
				placeholder: '0x...',
				description: 'The Ethereum address (42 characters starting with 0x)',
				required: true,
				displayOptions: { show: { chain: ['evm'], operation: ['getBalance', 'getTransactionCount', 'getCode'] } },
			},
			{
				displayName: 'Block',
				name: 'block',
				type: 'string',
				default: 'latest',
				placeholder: 'latest, earliest, pending, or block number',
				description: 'Block number (decimal or hex) or tag: latest, earliest, pending, safe, finalized',
				displayOptions: { show: { chain: ['evm'], operation: ['getBalance', 'getTransactionCount', 'getCode', 'call'] } },
			},
			{
				displayName: 'Block Identifier',
				name: 'blockIdentifier',
				type: 'string',
				default: 'latest',
				placeholder: 'Block number, hash, or tag',
				description: 'Block number (decimal or hex), block hash, or tag (latest, earliest, pending)',
				required: true,
				displayOptions: { show: { chain: ['evm'], operation: ['getBlock'] } },
			},
			{
				displayName: 'Include Full Transactions',
				name: 'fullTransactions',
				type: 'boolean',
				default: false,
				description: 'Whether to return full transaction objects or just hashes',
				displayOptions: { show: { chain: ['evm'], operation: ['getBlock'] } },
			},
			{
				displayName: 'Transaction Hash',
				name: 'txHash',
				type: 'string',
				default: '',
				placeholder: '0x...',
				description: 'The transaction hash (66 characters starting with 0x)',
				required: true,
				displayOptions: { show: { chain: ['evm'], operation: ['getTransaction', 'getTransactionReceipt'] } },
			},
			{
				displayName: 'From Address',
				name: 'from',
				type: 'string',
				default: '',
				placeholder: '0x...',
				description: 'The address the transaction is sent from',
				displayOptions: { show: { chain: ['evm'], operation: ['estimateGas', 'call'] } },
			},
			{
				displayName: 'To Address',
				name: 'to',
				type: 'string',
				default: '',
				placeholder: '0x...',
				description: 'The address the transaction is directed to',
				required: true,
				displayOptions: { show: { chain: ['evm'], operation: ['estimateGas', 'call'] } },
			},
			{
				displayName: 'Data',
				name: 'data',
				type: 'string',
				default: '',
				placeholder: '0x...',
				description: 'The encoded function call data',
				displayOptions: { show: { chain: ['evm'], operation: ['estimateGas', 'call'] } },
			},
			{
				displayName: 'Value (Wei)',
				name: 'value',
				type: 'string',
				default: '0',
				description: 'The value to send in Wei (as decimal or hex)',
				displayOptions: { show: { chain: ['evm'], operation: ['estimateGas'] } },
			},
			{
				displayName: 'RPC Method',
				name: 'rpcMethod',
				type: 'string',
				default: '',
				placeholder: 'eth_getBalance',
				description: 'The JSON-RPC method name',
				required: true,
				displayOptions: { show: { chain: ['evm'], operation: ['customRpc'] } },
			},
			{
				displayName: 'Parameters',
				name: 'rpcParams',
				type: 'json',
				default: '[]',
				placeholder: '["0x...", "latest"]',
				description: 'The parameters as a JSON array',
				displayOptions: { show: { chain: ['evm'], operation: ['customRpc'] } },
			},

			// ─────────────────────────────────────────────────────────────────
			// Solana: operation + parameters
			// ─────────────────────────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'solanaOperation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { chain: ['solana'] } },
				options: [
					{ name: 'Custom RPC', value: 'customRpc', description: 'Execute any Solana JSON-RPC method', action: 'Execute custom RPC method' },
					{ name: 'Get Account Info', value: 'getAccountInfo', description: 'Get all information associated with an account', action: 'Get account info' },
					{ name: 'Get Balance', value: 'getBalance', description: 'Get the SOL balance of a wallet address', action: 'Get SOL balance of an address' },
					{ name: 'Get Block', value: 'getBlock', description: 'Get block information by slot number', action: 'Get block by slot number' },
					{ name: 'Get Health', value: 'getHealth', description: 'Check if the node is healthy', action: 'Check node health' },
					{ name: 'Get Slot', value: 'getSlot', description: 'Get the current slot number', action: 'Get current slot number' },
					{ name: 'Get Token Accounts By Owner', value: 'getTokenAccountsByOwner', description: 'Get all SPL token accounts for a wallet address', action: 'Get token accounts by owner' },
					{ name: 'Get Transaction', value: 'getTransaction', description: 'Get transaction details by signature', action: 'Get transaction details' },
					{ name: 'Get Version', value: 'getVersion', description: 'Get the current Solana version running on the node', action: 'Get node version' },
					{ name: 'Send Transaction', value: 'sendTransaction', description: 'Submit a signed transaction to the network', action: 'Send a signed transaction' },
				],
				default: 'getBalance',
			},
			{
				displayName: 'Wallet Address',
				name: 'solanaAddress',
				type: 'string',
				default: '',
				placeholder: 'e.g. 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
				description: 'The Solana public key (base58-encoded)',
				required: true,
				displayOptions: { show: { chain: ['solana'], solanaOperation: ['getBalance', 'getAccountInfo', 'getTokenAccountsByOwner'] } },
			},
			{
				displayName: 'Commitment',
				name: 'solanaCommitment',
				type: 'options',
				options: [
					{ name: 'Finalized', value: 'finalized' },
					{ name: 'Confirmed', value: 'confirmed' },
					{ name: 'Processed', value: 'processed' },
				],
				default: 'finalized',
				description: 'The commitment level for the query',
				displayOptions: { show: { chain: ['solana'], solanaOperation: ['getBalance', 'getAccountInfo', 'getSlot'] } },
			},
			{
				displayName: 'Commitment',
				name: 'solanaBlockTxCommitment',
				type: 'options',
				options: [
					{ name: 'Finalized', value: 'finalized' },
					{ name: 'Confirmed', value: 'confirmed' },
				],
				default: 'finalized',
				description: 'The commitment level. Solana does not support "processed" for getBlock or getTransaction',
				displayOptions: { show: { chain: ['solana'], solanaOperation: ['getBlock', 'getTransaction'] } },
			},
			{
				displayName: 'Encoding',
				name: 'solanaEncoding',
				type: 'options',
				options: [
					{ name: 'Base64', value: 'base64' },
					{ name: 'Base58', value: 'base58' },
					{ name: 'JSON Parsed', value: 'jsonParsed' },
				],
				default: 'base64',
				description: 'Encoding format for the account data',
				displayOptions: { show: { chain: ['solana'], solanaOperation: ['getAccountInfo'] } },
			},
			{
				displayName: 'Transaction Signature',
				name: 'solanaSignature',
				type: 'string',
				default: '',
				placeholder: 'e.g. 5UmDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtA...',
				description: 'The transaction signature (base58-encoded)',
				required: true,
				displayOptions: { show: { chain: ['solana'], solanaOperation: ['getTransaction'] } },
			},
			{
				displayName: 'Slot',
				name: 'solanaSlot',
				type: 'number',
				default: 0,
				description: 'The slot number to retrieve the block for',
				required: true,
				displayOptions: { show: { chain: ['solana'], solanaOperation: ['getBlock'] } },
			},
			{
				displayName: 'Transaction Details',
				name: 'solanaTransactionDetails',
				type: 'options',
				options: [
					{ name: 'Full', value: 'full' },
					{ name: 'Signatures Only', value: 'signatures' },
					{ name: 'None', value: 'none' },
				],
				default: 'signatures',
				description: 'Level of transaction detail to return in the block',
				displayOptions: { show: { chain: ['solana'], solanaOperation: ['getBlock'] } },
			},
			{
				displayName: 'Filter By',
				name: 'solanaTokenFilter',
				type: 'options',
				options: [
					{ name: 'Mint Address', value: 'mint' },
					{ name: 'Token Program ID', value: 'programId' },
				],
				default: 'mint',
				description: 'Filter token accounts by a specific mint or token program',
				displayOptions: { show: { chain: ['solana'], solanaOperation: ['getTokenAccountsByOwner'] } },
			},
			{
				displayName: 'Mint / Program ID',
				name: 'solanaTokenFilterValue',
				type: 'string',
				default: '',
				placeholder: 'e.g. EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
				description: 'The mint address or token program ID to filter by',
				required: true,
				displayOptions: { show: { chain: ['solana'], solanaOperation: ['getTokenAccountsByOwner'] } },
			},
			{
				displayName: 'Signed Transaction',
				name: 'solanaSignedTransaction',
				type: 'string',
				default: '',
				placeholder: 'Base64-encoded signed transaction',
				description: 'The fully signed transaction, encoded as a base64 string',
				required: true,
				displayOptions: { show: { chain: ['solana'], solanaOperation: ['sendTransaction'] } },
			},
			{
				displayName: 'Skip Preflight',
				name: 'solanaSkipPreflight',
				type: 'boolean',
				default: false,
				description: 'Whether to skip the preflight transaction checks',
				displayOptions: { show: { chain: ['solana'], solanaOperation: ['sendTransaction'] } },
			},
			{
				displayName: 'RPC Method',
				name: 'solanaRpcMethod',
				type: 'string',
				default: '',
				placeholder: 'e.g. getBlockHeight',
				description: 'The Solana JSON-RPC method name',
				required: true,
				displayOptions: { show: { chain: ['solana'], solanaOperation: ['customRpc'] } },
			},
			{
				displayName: 'Parameters',
				name: 'solanaRpcParams',
				type: 'json',
				default: '[]',
				placeholder: '["9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"]',
				description: 'The parameters as a JSON array',
				displayOptions: { show: { chain: ['solana'], solanaOperation: ['customRpc'] } },
			},

			// ─────────────────────────────────────────────────────────────────
			// Bitcoin: operation + parameters
			// ─────────────────────────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'bitcoinOperation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { chain: ['bitcoin'] } },
				options: [
					{ name: 'Custom RPC', value: 'customRpc', description: 'Execute any Bitcoin JSON-RPC method', action: 'Execute custom RPC method' },
					{ name: 'Estimate Smart Fee', value: 'estimateSmartFee', description: 'Estimate the fee rate for a transaction to confirm within N blocks', action: 'Estimate smart fee' },
					{ name: 'Get Block', value: 'getBlock', description: 'Get block data by hash', action: 'Get block by hash' },
					{ name: 'Get Block Count', value: 'getBlockCount', description: 'Get the current block height', action: 'Get current block height' },
					{ name: 'Get Block Hash', value: 'getBlockHash', description: 'Get the block hash at a given height', action: 'Get block hash at height' },
					{ name: 'Get Blockchain Info', value: 'getBlockchainInfo', description: 'Get general info about the blockchain (chain, blocks, sync status)', action: 'Get blockchain info' },
					{ name: 'Get Mempool Info', value: 'getMempoolInfo', description: 'Get current mempool statistics', action: 'Get mempool info' },
					{ name: 'Get Raw Transaction', value: 'getRawTransaction', description: 'Get transaction details by txid', action: 'Get transaction by txid' },
					{ name: 'Get UTXO', value: 'getTxOut', description: 'Get details of an unspent transaction output', action: 'Get unspent transaction output' },
					{ name: 'Send Raw Transaction', value: 'sendRawTransaction', description: 'Broadcast a signed raw transaction to the network', action: 'Broadcast raw transaction' },
				],
				default: 'getBlockchainInfo',
			},
			{
				displayName: 'Block Height',
				name: 'btcBlockHeight',
				type: 'number',
				default: 0,
				description: 'The block height (zero-based index)',
				required: true,
				displayOptions: { show: { chain: ['bitcoin'], bitcoinOperation: ['getBlockHash'] } },
			},
			{
				displayName: 'Block Hash',
				name: 'btcBlockHash',
				type: 'string',
				default: '',
				placeholder: 'e.g. 000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
				description: 'The block hash (64 hex characters)',
				required: true,
				displayOptions: { show: { chain: ['bitcoin'], bitcoinOperation: ['getBlock'] } },
			},
			{
				displayName: 'Verbosity',
				name: 'btcVerbosity',
				type: 'options',
				options: [
					{ name: 'Hash List (0)', value: 0 },
					{ name: 'Block + Tx Summaries (1)', value: 1 },
					{ name: 'Block + Full Transactions (2)', value: 2 },
				],
				default: 1,
				description: 'Level of detail to return for the block',
				displayOptions: { show: { chain: ['bitcoin'], bitcoinOperation: ['getBlock'] } },
			},
			{
				displayName: 'Transaction ID (txid)',
				name: 'btcTxid',
				type: 'string',
				default: '',
				placeholder: 'e.g. a1075db55d416d3ca199f55b6084e2115b9345e16c5cf302fc80e9d5fbf5d48d',
				description: 'The transaction ID (64 hex characters)',
				required: true,
				displayOptions: { show: { chain: ['bitcoin'], bitcoinOperation: ['getRawTransaction', 'getTxOut'] } },
			},
			{
				displayName: 'Verbose',
				name: 'btcVerbose',
				type: 'boolean',
				default: true,
				description: 'Whether to return a decoded JSON object instead of raw hex',
				displayOptions: { show: { chain: ['bitcoin'], bitcoinOperation: ['getRawTransaction'] } },
			},
			{
				displayName: 'Output Index (vout)',
				name: 'btcVout',
				type: 'number',
				default: 0,
				description: 'The index of the output within the transaction',
				required: true,
				displayOptions: { show: { chain: ['bitcoin'], bitcoinOperation: ['getTxOut'] } },
			},
			{
				displayName: 'Include Mempool',
				name: 'btcIncludeMempool',
				type: 'boolean',
				default: true,
				description: 'Whether to include outputs currently in the mempool',
				displayOptions: { show: { chain: ['bitcoin'], bitcoinOperation: ['getTxOut'] } },
			},
			{
				displayName: 'Confirmation Target (blocks)',
				name: 'btcConfTarget',
				type: 'number',
				default: 6,
				description: 'Target number of blocks for confirmation (1–1008)',
				required: true,
				displayOptions: { show: { chain: ['bitcoin'], bitcoinOperation: ['estimateSmartFee'] } },
			},
			{
				displayName: 'Estimate Mode',
				name: 'btcEstimateMode',
				type: 'options',
				options: [
					{ name: 'Conservative', value: 'CONSERVATIVE' },
					{ name: 'Economical', value: 'ECONOMICAL' },
				],
				default: 'CONSERVATIVE',
				description: 'Fee estimation mode',
				displayOptions: { show: { chain: ['bitcoin'], bitcoinOperation: ['estimateSmartFee'] } },
			},
			{
				displayName: 'Raw Transaction Hex',
				name: 'btcRawTx',
				type: 'string',
				default: '',
				placeholder: 'Signed raw transaction as a hex string',
				description: 'The signed raw transaction encoded as a hex string',
				required: true,
				displayOptions: { show: { chain: ['bitcoin'], bitcoinOperation: ['sendRawTransaction'] } },
			},
			{
				displayName: 'RPC Method',
				name: 'btcRpcMethod',
				type: 'string',
				default: '',
				placeholder: 'e.g. getnetworkinfo',
				description: 'The Bitcoin JSON-RPC method name',
				required: true,
				displayOptions: { show: { chain: ['bitcoin'], bitcoinOperation: ['customRpc'] } },
			},
			{
				displayName: 'Parameters',
				name: 'btcRpcParams',
				type: 'json',
				default: '[]',
				placeholder: '["000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f", 1]',
				description: 'The parameters as a JSON array',
				displayOptions: { show: { chain: ['bitcoin'], bitcoinOperation: ['customRpc'] } },
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const chain = this.getNodeParameter('chain', i, 'evm') as string;

				// ── EVM ──────────────────────────────────────────────────────
				if (chain === 'evm') {
					const credentials = await this.getCredentials('quicknodeApi');
					const rpcEndpoint = credentials.rpcEndpoint as string;
					if (!rpcEndpoint) throw new NodeOperationError(this.getNode(), 'RPC endpoint is required in credentials');

					const operation = this.getNodeParameter('operation', i) as string;
					let method: string;
					let params: unknown[] = [];

					switch (operation) {
						case 'getBalance': {
							const address = this.getNodeParameter('address', i) as string;
							const block = this.getNodeParameter('block', i, 'latest') as string;
							if (!isValidEvmAddress(address)) throw new NodeOperationError(this.getNode(), `Invalid Ethereum address: ${address}. Must be 42 characters starting with 0x`, { itemIndex: i });
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
							if (!isValidEvmTxHash(txHash)) throw new NodeOperationError(this.getNode(), `Invalid transaction hash: ${txHash}. Must be 66 characters starting with 0x`, { itemIndex: i });
							method = 'eth_getTransactionByHash';
							params = [txHash];
							break;
						}
						case 'getTransactionReceipt': {
							const txHash = this.getNodeParameter('txHash', i) as string;
							if (!isValidEvmTxHash(txHash)) throw new NodeOperationError(this.getNode(), `Invalid transaction hash: ${txHash}. Must be 66 characters starting with 0x`, { itemIndex: i });
							method = 'eth_getTransactionReceipt';
							params = [txHash];
							break;
						}
						case 'getTransactionCount': {
							const address = this.getNodeParameter('address', i) as string;
							const block = this.getNodeParameter('block', i, 'latest') as string;
							if (!isValidEvmAddress(address)) throw new NodeOperationError(this.getNode(), `Invalid Ethereum address: ${address}. Must be 42 characters starting with 0x`, { itemIndex: i });
							method = 'eth_getTransactionCount';
							params = [address, toBlockTag(block)];
							break;
						}
						case 'getCode': {
							const address = this.getNodeParameter('address', i) as string;
							const block = this.getNodeParameter('block', i, 'latest') as string;
							if (!isValidEvmAddress(address)) throw new NodeOperationError(this.getNode(), `Invalid Ethereum address: ${address}. Must be 42 characters starting with 0x`, { itemIndex: i });
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
							if (!isValidEvmAddress(to)) throw new NodeOperationError(this.getNode(), `Invalid 'to' address: ${to}. Must be 42 characters starting with 0x`, { itemIndex: i });
							if (from && !isValidEvmAddress(from)) throw new NodeOperationError(this.getNode(), `Invalid 'from' address: ${from}. Must be 42 characters starting with 0x`, { itemIndex: i });
							if (data && !/^0x[a-fA-F0-9]*$/.test(data)) throw new NodeOperationError(this.getNode(), 'Invalid data: must be a 0x-prefixed hex string', { itemIndex: i });
							const txObject: IDataObject = { to };
							if (from) txObject.from = from;
							if (data) txObject.data = data;
							if (value && value !== '0') txObject.value = /^0x/.test(value) ? value : '0x' + parseInt(value, 10).toString(16);
							method = 'eth_estimateGas';
							params = [txObject];
							break;
						}
						case 'call': {
							const to = this.getNodeParameter('to', i) as string;
							const from = this.getNodeParameter('from', i, '') as string;
							const data = this.getNodeParameter('data', i, '') as string;
							const block = this.getNodeParameter('block', i, 'latest') as string;
							if (!isValidEvmAddress(to)) throw new NodeOperationError(this.getNode(), `Invalid 'to' address: ${to}. Must be 42 characters starting with 0x`, { itemIndex: i });
							if (from && !isValidEvmAddress(from)) throw new NodeOperationError(this.getNode(), `Invalid 'from' address: ${from}. Must be 42 characters starting with 0x`, { itemIndex: i });
							if (data && !/^0x[a-fA-F0-9]*$/.test(data)) throw new NodeOperationError(this.getNode(), 'Invalid data: must be a 0x-prefixed hex string', { itemIndex: i });
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
								if (!Array.isArray(params)) throw new Error('Parameters must be a JSON array');
							} catch (parseError) {
								throw new NodeOperationError(this.getNode(), `Invalid JSON parameters: ${(parseError as Error).message}`, { itemIndex: i });
							}
							break;
						}
						default:
							throw new NodeOperationError(this.getNode(), `Unknown EVM operation: ${operation}`, { itemIndex: i });
					}

					const response = await this.helpers.httpRequest({
						method: 'POST',
						url: rpcEndpoint,
						headers: { 'Content-Type': 'application/json' },
						body: { jsonrpc: '2.0', method, params, id: i + 1 },
						json: true,
					});

					if (response.error) {
						throw new NodeApiError(this.getNode(), { message: response.error.message || 'RPC Error', description: `RPC method ${method} failed: ${response.error.message}`, code: response.error.code }, { itemIndex: i });
					}

					const resultData: IDataObject = { result: response.result, method, network: credentials.network, chain: 'evm' };

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
					if (operation === 'estimateGas' && response.result) {
						resultData.gasEstimateDecimal = parseInt(response.result, 16);
					}

					returnData.push({ json: resultData, pairedItem: { item: i } });

				// ── Solana ───────────────────────────────────────────────────
				} else if (chain === 'solana') {
					const credentials = await this.getCredentials('quicknodeSolanaApi');
					const rpcEndpoint = credentials.rpcEndpoint as string;
					if (!rpcEndpoint) throw new NodeOperationError(this.getNode(), 'RPC endpoint is required in credentials');

					const operation = this.getNodeParameter('solanaOperation', i) as string;
					let method: string;
					let params: unknown[] = [];

					switch (operation) {
						case 'getBalance': {
							const address = this.getNodeParameter('solanaAddress', i) as string;
							const commitment = this.getNodeParameter('solanaCommitment', i, 'finalized') as string;
							if (!isValidSolanaAddress(address)) throw new NodeOperationError(this.getNode(), `Invalid Solana address: ${address}. Must be a base58-encoded public key (32–44 characters).`, { itemIndex: i });
							method = 'getBalance';
							params = [address, { commitment }];
							break;
						}
						case 'getAccountInfo': {
							const address = this.getNodeParameter('solanaAddress', i) as string;
							const commitment = this.getNodeParameter('solanaCommitment', i, 'finalized') as string;
							const encoding = this.getNodeParameter('solanaEncoding', i, 'base64') as string;
							if (!isValidSolanaAddress(address)) throw new NodeOperationError(this.getNode(), `Invalid Solana address: ${address}. Must be a base58-encoded public key (32–44 characters).`, { itemIndex: i });
							method = 'getAccountInfo';
							params = [address, { commitment, encoding }];
							break;
						}
						case 'getTransaction': {
							const signature = this.getNodeParameter('solanaSignature', i) as string;
							const commitment = this.getNodeParameter('solanaBlockTxCommitment', i, 'finalized') as string;
							if (!isValidSolanaSignature(signature)) throw new NodeOperationError(this.getNode(), `Invalid transaction signature: ${signature}. Must be a base58-encoded signature (~88 characters).`, { itemIndex: i });
							method = 'getTransaction';
							params = [signature, { commitment, encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }];
							break;
						}
						case 'getSlot': {
							const commitment = this.getNodeParameter('solanaCommitment', i, 'finalized') as string;
							method = 'getSlot';
							params = [{ commitment }];
							break;
						}
						case 'getBlock': {
							const slot = this.getNodeParameter('solanaSlot', i) as number;
							const commitment = this.getNodeParameter('solanaBlockTxCommitment', i, 'finalized') as string;
							const transactionDetails = this.getNodeParameter('solanaTransactionDetails', i, 'signatures') as string;
							if (!Number.isInteger(slot) || slot < 0) throw new NodeOperationError(this.getNode(), `Invalid slot: ${slot}. Must be a non-negative integer.`, { itemIndex: i });
							method = 'getBlock';
							params = [slot, { commitment, transactionDetails, maxSupportedTransactionVersion: 0 }];
							break;
						}
						case 'getTokenAccountsByOwner': {
							const address = this.getNodeParameter('solanaAddress', i) as string;
							const tokenFilter = this.getNodeParameter('solanaTokenFilter', i, 'mint') as string;
							const tokenFilterValue = this.getNodeParameter('solanaTokenFilterValue', i) as string;
							if (!isValidSolanaAddress(address)) throw new NodeOperationError(this.getNode(), `Invalid Solana address: ${address}. Must be a base58-encoded public key (32–44 characters).`, { itemIndex: i });
							if (!isValidSolanaAddress(tokenFilterValue)) throw new NodeOperationError(this.getNode(), `Invalid ${tokenFilter === 'mint' ? 'mint' : 'program'} address: ${tokenFilterValue}. Must be a base58-encoded public key.`, { itemIndex: i });
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
							const signedTransaction = this.getNodeParameter('solanaSignedTransaction', i) as string;
							const skipPreflight = this.getNodeParameter('solanaSkipPreflight', i, false) as boolean;
							method = 'sendTransaction';
							params = [signedTransaction, { encoding: 'base64', skipPreflight }];
							break;
						}
						case 'customRpc': {
							method = this.getNodeParameter('solanaRpcMethod', i) as string;
							const paramsJson = this.getNodeParameter('solanaRpcParams', i, '[]') as string;
							try {
								params = JSON.parse(paramsJson);
								if (!Array.isArray(params)) throw new Error('Parameters must be a JSON array');
							} catch (parseError) {
								throw new NodeOperationError(this.getNode(), `Invalid JSON parameters: ${(parseError as Error).message}`, { itemIndex: i });
							}
							break;
						}
						default:
							throw new NodeOperationError(this.getNode(), `Unknown Solana operation: ${operation}`, { itemIndex: i });
					}

					const response = await this.helpers.httpRequest({
						method: 'POST',
						url: rpcEndpoint,
						headers: { 'Content-Type': 'application/json' },
						body: { jsonrpc: '2.0', method, params, id: i + 1 },
						json: true,
					});

					if (response.error) {
						throw new NodeApiError(this.getNode(), { message: response.error.message || 'RPC Error', description: `RPC method ${method} failed: ${response.error.message}`, code: response.error.code }, { itemIndex: i });
					}

					const resultData: IDataObject = { result: response.result, method, network: credentials.network, chain: 'solana' };

					if (operation === 'getBalance' && response.result !== null && response.result !== undefined) {
						const lamports = (response.result as IDataObject).value as number;
						resultData.balanceLamports = lamports;
						resultData.balanceSol = (lamports / 1e9).toFixed(9);
					}
					if (operation === 'getSlot' && response.result !== null && response.result !== undefined) {
						resultData.slot = response.result;
					}

					returnData.push({ json: resultData, pairedItem: { item: i } });

				// ── Bitcoin ──────────────────────────────────────────────────
				} else if (chain === 'bitcoin') {
					const credentials = await this.getCredentials('quicknodeBitcoinApi');
					const rpcEndpoint = credentials.rpcEndpoint as string;
					if (!rpcEndpoint) throw new NodeOperationError(this.getNode(), 'RPC endpoint is required in credentials');

					const operation = this.getNodeParameter('bitcoinOperation', i) as string;
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
							const blockHeight = this.getNodeParameter('btcBlockHeight', i) as number;
							if (!Number.isInteger(blockHeight) || blockHeight < 0) throw new NodeOperationError(this.getNode(), `Invalid block height: ${blockHeight}. Must be a non-negative integer.`, { itemIndex: i });
							method = 'getblockhash';
							params = [blockHeight];
							break;
						}
						case 'getBlock': {
							const blockHash = this.getNodeParameter('btcBlockHash', i) as string;
							const verbosity = this.getNodeParameter('btcVerbosity', i, 1) as number;
							if (!isValidBitcoinBlockHash(blockHash)) throw new NodeOperationError(this.getNode(), `Invalid block hash: ${blockHash}. Must be 64 hex characters.`, { itemIndex: i });
							method = 'getblock';
							params = [blockHash, verbosity];
							break;
						}
						case 'getRawTransaction': {
							const txid = this.getNodeParameter('btcTxid', i) as string;
							const verbose = this.getNodeParameter('btcVerbose', i, true) as boolean;
							if (!isValidBitcoinTxid(txid)) throw new NodeOperationError(this.getNode(), `Invalid txid: ${txid}. Must be 64 hex characters.`, { itemIndex: i });
							method = 'getrawtransaction';
							params = [txid, verbose];
							break;
						}
						case 'getTxOut': {
							const txid = this.getNodeParameter('btcTxid', i) as string;
							const vout = this.getNodeParameter('btcVout', i, 0) as number;
							const includeMempool = this.getNodeParameter('btcIncludeMempool', i, true) as boolean;
							if (!isValidBitcoinTxid(txid)) throw new NodeOperationError(this.getNode(), `Invalid txid: ${txid}. Must be 64 hex characters.`, { itemIndex: i });
							if (!Number.isInteger(vout) || vout < 0) throw new NodeOperationError(this.getNode(), `Invalid output index: ${vout}. Must be a non-negative integer.`, { itemIndex: i });
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
							const confTarget = this.getNodeParameter('btcConfTarget', i, 6) as number;
							const estimateMode = this.getNodeParameter('btcEstimateMode', i, 'CONSERVATIVE') as string;
							if (!Number.isInteger(confTarget) || confTarget < 1 || confTarget > 1008) throw new NodeOperationError(this.getNode(), `Invalid confirmation target: ${confTarget}. Must be an integer between 1 and 1008.`, { itemIndex: i });
							method = 'estimatesmartfee';
							params = [confTarget, estimateMode];
							break;
						}
						case 'sendRawTransaction': {
							const rawTx = this.getNodeParameter('btcRawTx', i) as string;
							if (!/^[a-fA-F0-9]+$/.test(rawTx) || rawTx.length % 2 !== 0) throw new NodeOperationError(this.getNode(), 'Invalid raw transaction: must be a valid hex string with an even number of characters.', { itemIndex: i });
							method = 'sendrawtransaction';
							params = [rawTx];
							break;
						}
						case 'customRpc': {
							method = this.getNodeParameter('btcRpcMethod', i) as string;
							const paramsJson = this.getNodeParameter('btcRpcParams', i, '[]') as string;
							try {
								params = JSON.parse(paramsJson);
								if (!Array.isArray(params)) throw new Error('Parameters must be a JSON array');
							} catch (parseError) {
								throw new NodeOperationError(this.getNode(), `Invalid JSON parameters: ${(parseError as Error).message}`, { itemIndex: i });
							}
							break;
						}
						default:
							throw new NodeOperationError(this.getNode(), `Unknown Bitcoin operation: ${operation}`, { itemIndex: i });
					}

					const response = await this.helpers.httpRequest({
						method: 'POST',
						url: rpcEndpoint,
						headers: { 'Content-Type': 'application/json' },
						body: { jsonrpc: '2.0', method, params, id: i + 1 },
						json: true,
					});

					if (response.error) {
						throw new NodeApiError(this.getNode(), { message: response.error.message || 'RPC Error', description: `RPC method ${method} failed: ${response.error.message}`, code: response.error.code }, { itemIndex: i });
					}

					const resultData: IDataObject = { result: response.result, method, network: credentials.network, chain: 'bitcoin' };

					if (operation === 'estimateSmartFee' && response.result?.feerate !== undefined) {
						const feerateBtcPerKb = response.result.feerate as number;
						resultData.feerateBtcPerKb = feerateBtcPerKb;
						resultData.feerateSatPerByte = Math.round(feerateBtcPerKb * 1e8 / 1000);
					}

					returnData.push({ json: resultData, pairedItem: { item: i } });

				} else {
					throw new NodeOperationError(this.getNode(), `Unknown chain: ${chain}`, { itemIndex: i });
				}

			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
