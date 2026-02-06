import type {
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class QuicknodeApi implements ICredentialType {
	name = 'quicknodeApi';
	displayName = 'Quicknode API';
	documentationUrl = 'https://www.quicknode.com/docs';

	properties: INodeProperties[] = [
		{
			displayName: 'RPC Endpoint URL',
			name: 'rpcEndpoint',
			type: 'string',
			default: '',
			placeholder: 'https://your-endpoint.quiknode.pro/your-token/',
			description: 'Your Quicknode RPC endpoint URL (includes authentication token)',
			required: true,
		},
		{
			displayName: 'Network',
			name: 'network',
			type: 'options',
			default: 'ethereum-mainnet',
			description: 'The blockchain network this endpoint connects to',
			options: [
				{ name: 'Ethereum Mainnet', value: 'ethereum-mainnet' },
				{ name: 'Ethereum Sepolia', value: 'ethereum-sepolia' },
				{ name: 'Ethereum Goerli', value: 'ethereum-goerli' },
				{ name: 'Polygon Mainnet', value: 'polygon-mainnet' },
				{ name: 'Polygon Mumbai', value: 'polygon-mumbai' },
				{ name: 'Arbitrum One', value: 'arbitrum-one' },
				{ name: 'Optimism', value: 'optimism' },
				{ name: 'Base', value: 'base' },
				{ name: 'BSC Mainnet', value: 'bsc-mainnet' },
				{ name: 'Avalanche C-Chain', value: 'avalanche-mainnet' },
				{ name: 'Other', value: 'other' },
			],
		},
	];

	// Test the credentials by calling a simple RPC method
	test: ICredentialTestRequest = {
		request: {
			method: 'POST',
			url: '={{$credentials.rpcEndpoint}}',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'web3_clientVersion',
				params: [],
				id: 1,
			}),
		},
	};
}
