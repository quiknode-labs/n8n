import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class QuicknodeSolanaApi implements ICredentialType {
	name = 'quicknodeSolanaApi';
	displayName = 'Quicknode Solana API';
	documentationUrl = 'https://www.quicknode.com/docs/solana';

	properties: INodeProperties[] = [
		{
			displayName: 'RPC Endpoint URL',
			name: 'rpcEndpoint',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			placeholder: 'https://your-endpoint.solana-mainnet.quiknode.pro/your-token/',
			description: 'Your Quicknode Solana RPC endpoint URL (includes authentication token)',
			required: true,
		},
		{
			displayName: 'Network',
			name: 'network',
			type: 'options',
			default: 'solana-mainnet',
			description: 'The Solana network this endpoint connects to',
			options: [
				{ name: 'Solana Mainnet', value: 'solana-mainnet' },
				{ name: 'Solana Devnet', value: 'solana-devnet' },
				{ name: 'Solana Testnet', value: 'solana-testnet' },
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
				method: 'getHealth',
				params: [],
				id: 1,
			}),
		},
	};
}
