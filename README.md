# quicknode-n8n

This is an n8n community node for interacting with blockchain networks via [Quicknode](https://www.quicknode.com/) RPC endpoints.

## Features

- **10 Built-in RPC Operations**:
  - Get Balance - Check ETH/token balance of any address
  - Get Block Number - Get the latest block number
  - Get Block - Retrieve block details by number or hash
  - Get Transaction - Fetch transaction details
  - Get Transaction Receipt - Get transaction receipt with logs
  - Get Transaction Count - Get nonce for an address
  - Get Code - Check if an address is a contract
  - Get Gas Price - Current network gas price
  - Estimate Gas - Estimate gas for a transaction
  - Call - Execute read-only smart contract calls

- **Custom RPC Support** - Call any JSON-RPC method not listed above
- **Multi-network Support** - Works with any EVM-compatible chain
- **Human-readable Results** - Automatic conversion of hex values to decimal/ETH

## Installation

### Community Nodes (Recommended)

1. Go to **Settings > Community Nodes**
2. Select **Install**
3. Enter `quicknode-n8n` and confirm

### Manual Installation

```bash
cd ~/.n8n/nodes
npm install quicknode-n8n
```

## Prerequisites

1. Create a [Quicknode account](https://www.quicknode.com/)
2. Create an endpoint for your desired network (Ethereum, Polygon, etc.)
3. Copy your endpoint URL (it includes authentication)

## Configuration

### Credentials

1. In n8n, go to **Credentials > New**
2. Search for "Quicknode API"
3. Enter your Quicknode endpoint URL
4. Select your network (for reference only)

Your endpoint URL should look like:
```
https://your-endpoint-name.quiknode.pro/your-token-here/
```

## Local Development

### Setup

```bash
# Clone the repository
git clone https://github.com/quiknode-labs/n8n.git
cd n8n

# Install dependencies
npm install

# Build the node
npm run build

# Link for local testing
npm link
```

### Testing with n8n

```bash
# In your n8n installation directory
cd ~/.n8n
npm link quicknode-n8n

# Start n8n
n8n start
```

Or use Docker:

```bash
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  -v $(pwd):/home/node/.n8n/nodes/quicknode-n8n \
  n8nio/n8n
```

### Development Commands

```bash
npm run dev      # Watch mode for TypeScript
npm run build    # Full production build
npm run lint     # Run ESLint
npm run format   # Format with Prettier
```

## Usage Examples

### Get ETH Balance

1. Add the **Quicknode RPC** node
2. Select **Get Balance** operation
3. Enter an Ethereum address
4. Execute to get balance in Wei and ETH

### Read Smart Contract

1. Add the **Quicknode RPC** node
2. Select **Call** operation
3. Enter the contract address in "To Address"
4. Enter the encoded function call in "Data"
5. Execute to get the result

### Custom RPC Method

1. Add the **Quicknode RPC** node
2. Select **Custom RPC** operation
3. Enter the RPC method (e.g., `eth_getLogs`)
4. Enter parameters as JSON array
5. Execute

## Supported Networks

Any Quicknode-supported EVM network:
- Ethereum (Mainnet, Sepolia, Goerli)
- Polygon (Mainnet, Mumbai)
- Arbitrum One
- Optimism
- Base
- BSC
- Avalanche C-Chain
- And more...

## Error Handling

The node includes:
- Address validation (0x + 40 hex chars)
- Transaction hash validation (0x + 64 hex chars)
- Block tag validation
- Proper RPC error propagation
- Continue on fail support

## License

MIT

## Resources

- [Quicknode Documentation](https://www.quicknode.com/docs)
