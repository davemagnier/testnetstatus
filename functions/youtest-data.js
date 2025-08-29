// netlify/functions/youtest-data.js
// Fetches live data from YouTest testnet RPC endpoints
exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Updated for YouTest testnet
    const rpcUrl = 'https://subnets.avax.network/youtest/testnet/rpc';
    const explorerBase = 'https://explorer-test.avax.network/youtest';
    
    const stats = {};

    try {
      // Get block number
      const blockResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1
        })
      });
      
      if (blockResponse.ok) {
        const blockData = await blockResponse.json();
        if (blockData.result) {
          const blockNumber = parseInt(blockData.result, 16);
          stats.blockHeight = blockNumber.toLocaleString();
          
          // Get latest block details
          const blockDetailsResponse = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_getBlockByNumber',
              params: ['latest', true],
              id: 2
            })
          });
          
          if (blockDetailsResponse.ok) {
            const blockDetails = await blockDetailsResponse.json();
            if (blockDetails.result) {
              stats.gasUsed = parseInt(blockDetails.result.gasUsed, 16).toLocaleString();
              stats.blockTime = new Date(parseInt(blockDetails.result.timestamp, 16) * 1000).toLocaleTimeString();
              
              // Count transactions in recent blocks
              let totalTxs = 0;
              const blocksToCheck = Math.min(10, blockNumber);
              
              for (let i = blockNumber - blocksToCheck + 1; i <= blockNumber; i++) {
                try {
                  const txCountResponse = await fetch(rpcUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      jsonrpc: '2.0',
                      method: 'eth_getBlockTransactionCountByNumber',
                      params: [`0x${i.toString(16)}`],
                      id: 100 + i
                    })
                  });
                  
                  if (txCountResponse.ok) {
                    const txCountData = await txCountResponse.json();
                    if (txCountData.result) {
                      totalTxs += parseInt(txCountData.result, 16);
                    }
                  }
                } catch (e) {
                  // Continue on error
                }
              }
              
              if (totalTxs > 0) {
                // Estimate total based on sample
                const estimatedTotal = Math.floor((totalTxs / blocksToCheck) * blockNumber);
                stats.totalTransactions = estimatedTotal.toLocaleString();
              }
            }
          }
          
          // Get gas price
          const gasResponse = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_gasPrice',
              params: [],
              id: 3
            })
          });
          
          if (gasResponse.ok) {
            const gasData = await gasResponse.json();
            if (gasData.result) {
              const gasPriceGwei = (parseInt(gasData.result, 16) / 1e9).toFixed(2);
              stats.gasPrice = `${gasPriceGwei} Gwei`;
            }
          }
          
          // Get peer count
          const peerResponse = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'net_peerCount',
              params: [],
              id: 4
            })
          });
          
          if (peerResponse.ok) {
            const peerData = await peerResponse.json();
            if (peerData.result) {
              stats.peerCount = parseInt(peerData.result, 16).toString();
            }
          }
        }
      }
    } catch (rpcError) {
      console.error('RPC Error:', rpcError);
      // Continue to return partial data if available
    }

    // Return whatever data we collected
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: Object.keys(stats).length > 0,
        data: { stats },
        timestamp: new Date().toISOString(),
        source: Object.keys(stats).length > 0 ? 'RPC' : 'None'
      })
    };

  } catch (error) {
    console.error('Handler Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to fetch data',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};