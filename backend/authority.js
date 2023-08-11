/*

Import this module in server app using:
const auth = require("./authority.js");

Call function auth.authorize(txId, fromChainId),
where:
    `txId` - transaction hash,
    `fromChainId` - chain ID where transaction was sent.
returns JSON object,
where:
if all good:
    "isSuccess" - true,
    "signature" - authority signature,
    "token" - token to receive,
    "value" - token amount || token IDs,
    "to"- receiver (user's) address,
    "chainId" - chain ID where to claim token,
    "bridge" - address of bridge on destination network.

in case of error:
    "isSuccess" - false,
    "message" - error description


Example:

    auth.authorize(txId, fromChainId, isNFT)
    .then(resp => {
        response.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
        response.end(JSON.stringify(resp));

    })
    .catch(err => {
        response.writeHead(404, {'Content-Type': 'text/html'});
        response.end(err.toString());
    })

In this example of `.env` the authority address is 0x3d40De3046a7D7E2Aa9E8097A86e49c699A0170B
*/

const log4js = require('log4js');
const Web3 = require('web3');
const keyStore = require('./.keystore.json');
require('dotenv').config(); // if use .env file for enviroment variables

const logger = log4js.getLogger();
logger.level = 'info';

const PW = process.env.PW; // Private key should be hidden

const BLOCK_CONFIRMATIONS = {
  97: 1, // BSC test net
  56: 15, // BSC main net
  1: 4, // ETH main net
  5: 1, // Goerli test net
  42: 1, // ETH KOVAN test net
  256: 3, // HECO test net
  10000: 2, // SmartBCH main net
  568: 1, // DOGE test
  2000: 3, // DOGE CHAIN main net
  84531: 1, // BaseGoerli test net
  8453: 1, // Base Mainnet
};

const BRIDGE_CONTRACTS = {
  1: '0xC30B6B57BEC9020a95e0a6CF275b43CC00C9d3f0', // ETH main net
  5: '0x2f30cf73b5e4E4f79f6aEE1A5871f5E29c1caE98', // Goerli test net
  97: '0xfa581215b134E5623830E44cE1E37Fb9830dD412', // BSC test net
  56: '0xC9AA9aa98563c2f1AA66804E1EFa0f07A807321C', // BSC main net
  256: '0xCee23c02B819e4B9b6E34753e3c0C7f21c4bC398', // HECO test net
  10000: '0x1336001CBdb94C5cf95ee93F2dC3CA99Db382Ff4', // smartBCH main net
  568: '0x290B5c5587B78C9bf3d9e5D7f1703749037CbE22', // DOGE test
  2000: '0x403bc08DdE4272b91D31155E6905575dd3c1f283', // DOGE main net
};

const BRIDGE_NFT_CONTRACTS = {
  5: '0x4b5981260f634F010210267966b2D992ea6271C7', // Goerli test net
  10000: '0x746B3078284e33Be5eBDb6f3Ac068FC2fAb91c00', // smartBCH main net
  84531: '0x746B3078284e33Be5eBDb6f3Ac068FC2fAb91c00', // BaseGoerli test net
  8453: '0xC30B6B57BEC9020a95e0a6CF275b43CC00C9d3f0', // Base Mainnet
};

const PROVIDERS = {
  97: 'https://bsctestapi.terminet.io/rpc', // BSC test net
  56: 'https://bsc-dataseed1.ninicoin.io', // BSC main net
  42: 'https://kovan.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161', // ETH KOVAN test net
  1: 'https://rpc.ankr.com/eth', // ETH main net
  5: 'https://goerli.infura.io/v3/680f44b87fb44b4d93ae840a276a4d23', // Goerli test net
  256: 'https://http-testnet.hecochain.com', // HECO test
  10000: 'https://rpc.smartbch.org', // smartBCH mainnet
  568: 'https://rpc-testnet.dogechain.dog', // DOGE test
  2000: 'https://rpc.dogechain.dog', // DOGE mainnet
  84531: 'https://goerli.base.org', // BaseGoerli test net
  8453: 'https://mainnet.base.org', // Base Mainnet
};

const DEPOSIT_EVENT_ABI = [
  { type: 'address', name: 'token', internalType: 'address', indexed: true },
  { type: 'address', name: 'sender', internalType: 'address', indexed: true },
  { type: 'uint256', name: 'value', internalType: 'uint256', indexed: false },
  { type: 'uint256', name: 'toChainId', internalType: 'uint256', indexed: false },
  { type: 'address', name: 'toToken', internalType: 'address', indexed: false },
];
const DEPOSIT_EVENT_TOPIC = '0xf5dd9317b9e63ac316ce44acc85f670b54b339cfa3e9076e1dd55065b922314b';

const DEPOSIT_NFT_EVENT_ABI = [
  { indexed: true, internalType: 'address', name: 'token', type: 'address' },
  { indexed: true, internalType: 'address', name: 'sender', type: 'address' },
  { indexed: false, internalType: 'uint256[]', name: 'tokens', type: 'uint256[]' },
  { indexed: false, internalType: 'uint256', name: 'toChainId', type: 'uint256' },
  { indexed: false, internalType: 'address', name: 'toToken', type: 'address' },
];
const DEPOSIT_NFT_EVENT_TOPIC = '0x01a1b3d39327ab854916744d7d48fd8cdf760307cbf31e381a0bbe813efaff00';

// call this function to get authorization signature
// params: txId = deposit transaction hash
//         fromChainId = chain ID where transaction was sent
//         isNFT: "true" for NFT bridge, "false" for token bridge
// returns: on success {isSuccess: true, message: sig.signature};
// on error: {isSuccess: false, message: error_message};
async function authorize(txId, fromChainId, isNFT = false) {
  const provider = PROVIDERS[fromChainId];
  if (!provider) {
    const msg = `No provider for chain ID: ${fromChainId}`;
    logger.error(msg);
    return { isSuccess: false, message: msg };
  }
  const bridgeContract = isNFT ? BRIDGE_NFT_CONTRACTS[fromChainId] : BRIDGE_CONTRACTS[fromChainId];
  if (!bridgeContract) {
    const msg = `No bridgeContract for chain ID: ${fromChainId}`;
    logger.error(msg);
    return { isSuccess: false, message: msg };
  }
  const eventTopic = isNFT ? DEPOSIT_NFT_EVENT_TOPIC : DEPOSIT_EVENT_TOPIC;
  const eventAbi = isNFT ? DEPOSIT_NFT_EVENT_ABI : DEPOSIT_EVENT_ABI;

  const web3 = new Web3(provider);
  const lastBlock = await web3.eth.getBlockNumber();

  return web3.eth
    .getTransactionReceipt(txId)
    .then(receipt => {
      if (receipt && receipt.status) {
        if (lastBlock - receipt.blockNumber < BLOCK_CONFIRMATIONS[fromChainId]) {
          const msg = `Confirming: ${lastBlock - receipt.blockNumber} of ${BLOCK_CONFIRMATIONS[fromChainId]}`;
          return { isSuccess: false, message: msg };
        }

        for (let i = 0; i < receipt.logs.length; i++) {
          const element = receipt.logs[i];
          if (
            element.topics[0] === eventTopic &&
            element.address === bridgeContract &&
            element.transactionHash === txId
          ) {
            element.topics.shift(); // remove
            const p = web3.eth.abi.decodeLog(eventAbi, element.data, element.topics);
            const messageHash = isNFT
              ? web3.utils.soliditySha3(
                  { type: 'address', value: p.toToken },
                  { type: 'address', value: p.sender },
                  { type: 'uint256[]', value: p.tokens },
                  { type: 'bytes32', value: txId },
                  { type: 'uint256', value: fromChainId },
                  { type: 'uint256', value: p.toChainId }
                )
              : web3.utils.soliditySha3(p.toToken, p.sender, p.value, txId, fromChainId, p.toChainId);
            sig = web3.eth.accounts.sign(messageHash, web3.eth.accounts.decrypt(keyStore, PW).privateKey);
            const ret = {
              isSuccess: true,
              signature: sig.signature,
              token: p.toToken,
              value: isNFT ? p.tokens : p.value,
              to: p.sender,
              chainId: p.toChainId,
              bridge: isNFT ? BRIDGE_NFT_CONTRACTS[p.toChainId] : BRIDGE_CONTRACTS[p.toChainId],
            };
            return ret;
          }
        }
      }
      const msg = `Wrong transaction hash: ${txId}`;
      logger.error(msg);
      return { isSuccess: false, message: msg };
    })
    .catch(err => {
      logger.error(err);
      return { isSuccess: false, message: err.toString() };
    });
}

module.exports.authorize = authorize;
