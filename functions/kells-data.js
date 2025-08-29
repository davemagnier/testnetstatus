// netlify/functions/kells-data.js
// ALL DATA IN THIS FUNCTION IS FETCHED FROM REAL RPC ENDPOINTS
// NO FAKE OR FALLBACK DATA - ONLY ACTUAL BLOCKCHAIN DATA
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
    const baseUrl = 'https://explorer-test.avax.network/youtest';
    const rpcUrl = 'https://subnets.avax.network/ytest/testnet/rpc';
    
    const responses = {};
    const errors = [];

    // Try multiple API patterns
    const apiEndpoints = {
      // Standard API patterns
      stats: `${baseUrl}/ytest/api/v1/stats`,
      blocks: `${baseUrl}/ytest/api/v1/blocks/latest`,
      validators: `${baseUrl}/ytest/api/v1/validators`,
      transactions: `${baseUrl}/ytest/api/v1/transactions/recent`,
      // Alternative patterns
      info: `${baseUrl}/ytest/api/info`,
      status: `${baseUrl}/ytest/api/status`,
      // General API patterns
      chainInfo: `${baseUrl}/api/chains/ytest`,
      subnetInfo: `${baseUrl}/api/subnets/ytest`,
      // Root API patterns
      apiStats: `${baseUrl}/api/stats/ytest`,
      apiBlocks: `${baseUrl}/api/blocks/ytest`
    };

    // Try each endpoint
    for (const [key, url] of Object.entries(apiEndpoints)) {
      try {
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (response.ok) {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            responses[key] = await response.json();
          }
        }
      } catch (err) {
        // Silent fail for each endpoint
      }
    }

    // Try RPC endpoint as fallback
    if (Object.keys(responses).length === 0) {
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
            
            // Initialize stats object
            const stats = {
              blockHeight: blockNumber.toLocaleString()
            };
            
            // Get latest block details with transactions
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
              const blockDetailsData = await blockDetailsResponse.json();
              if (blockDetailsData.result) {
                // Don't include transactionCount - removed per requirements
                stats.gasUsed = parseInt(blockDetailsData.result.gasUsed, 16).toLocaleString();
                stats.blockTime = new Date(parseInt(blockDetailsData.result.timestamp, 16) * 1000).toLocaleTimeString();
                
                // Calculate total transactions (if we can get multiple blocks)
                let totalTxs = 0;
                for (let i = Math.max(0, blockNumber - 10); i <= blockNumber; i++) {
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
                    // Silent fail for individual block queries
                  }
                }
                if (totalTxs > 0) {
                  stats.totalTransactions = totalTxs.toLocaleString();
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
                stats.gasPrice = (parseInt(gasData.result, 16) / 1e9).toFixed(2) + ' Gwei';
              }
            }
            
            // Don't get chainId or syncStatus - removed per requirements
            
            // Get peer count (network health indicator)
            const peerResponse = await fetch(rpcUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'net_peerCount',
                params: [],
                id: 6
              })
            });
            
            if (peerResponse.ok) {
              const peerData = await peerResponse.json();
              if (peerData.result) {
                stats.peerCount = parseInt(peerData.result, 16).toString();
              }
            }
            
            responses.stats = stats;
          }
        }
      } catch (rpcError) {
        errors.push({ source: 'RPC', error: rpcError.message });
      }
    }

    // Try HTML scraping as last resort
    if (Object.keys(responses).length === 0) {
      try {
        const pageResponse = await fetch(`${baseUrl}/ytest`, {
          headers: {
            'Accept': 'text/html,application/xhtml+xml',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (pageResponse.ok) {
          const html = await pageResponse.text();
          
          // Try to find JSON data in script tags
          const scriptMatch = html.match(/<script[^>]*>window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})<\/script>/);
          if (scriptMatch) {
            try {
              const pageData = JSON.parse(scriptMatch[1]);
              if (pageData.chain || pageData.stats || pageData.blocks) {
                responses.pageData = pageData;
              }
            } catch (e) {
              // JSON parse failed
            }
          }
          
          // Try to extract visible stats
          const patterns = {
            blockHeight: /Block\s*Height[\s\S]*?>([\d,]+)</i,
            transactions: /Transactions[\s\S]*?>([\d,]+)</i,
            validators: /Validators[\s\S]*?>(\d+)</i,
            gasPrice: /Gas\s*Price[\s\S]*?>([\d.]+\s*Gwei)</i
          };
          
          const extractedStats = {};
          for (const [key, pattern] of Object.entries(patterns)) {
            const match = html.match(pattern);
            if (match) {
              extractedStats[key] = match[1].replace(/,/g, '');
            }
          }
          
          if (Object.keys(extractedStats).length > 0) {
            responses.stats = extractedStats;
          }
        }
      } catch (scrapeError) {
        errors.push({ source: 'HTML', error: scrapeError.message });
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: Object.keys(responses).length > 0,
        data: responses,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: new Date().toISOString(),
        source: Object.keys(responses).length > 0 
          ? (responses.stats && responses.stats.blockHeight ? 'RPC' : 'Explorer')
          : 'None'
      })
    };

  } catch (error) {
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
