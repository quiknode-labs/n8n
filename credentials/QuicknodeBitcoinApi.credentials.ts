import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class QuicknodeBitcoinApi implements ICredentialType {
	name = 'quicknodeBitcoinApi';
	displayName = 'Quicknode Bitcoin API';
	documentationUrl = 'https://www.quicknode.com/docs/bitcoin';

	properties: INodeProperties[] = [
		{
			displayName: 'RPC Endpoint URL',
			name: 'rpcEndpoint',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			placeholder: 'https://your-endpoint.btc.quiknode.pro/your-token/',
			description: 'Your Quicknode Bitcoin RPC endpoint URL (includes authentication token)',
			required: true,
		},
		{
			displayName: 'Network',
			name: 'network',
			type: 'options',
			default: 'bitcoin-mainnet',
			description: 'The Bitcoin network this endpoint connects to',
			options: [
				{ name: 'Bitcoin Mainnet', value: 'bitcoin-mainnet' },
				{ name: 'Bitcoin Testnet', value: 'bitcoin-testnet' },
			],
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {},
	};

	test: ICredentialTestRequest = {
		request: {
			method: 'POST',
			url: '={{$credentials.rpcEndpoint}}',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'getblockchaininfo',
				params: [],
				id: 1,
			}),
		},
	};
}
