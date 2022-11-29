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
    "value" - tokens amount,
    "to"- receiver (user's) address,
    "chainId" - chain ID where to claim token,
    "bridge" - address of bridge on destination network.

in case of error:
    "isSuccess" - false,
    "message" - error description


Example:

    auth.authorize(txId, fromChainId)
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

const blockConfirmations = {
  97: 1, // BSC test net
  56: 15, // BSC main net
  42: 1, // ETH KOVAN test net
  1: 4, // ETH main net
  256: 3,// HECO test net
  10000: 2,// SmartBCH main net
  568: 1, //DOGE test
  2000: 3,//DOGE CHAIN main net
};

const bridgeContracts = {
  1: '0xC30B6B57BEC9020a95e0a6CF275b43CC00C9d3f0',// ETH main net
  5: '0x2f30cf73b5e4E4f79f6aEE1A5871f5E29c1caE98',// Goerli test net
  97: '0xfa581215b134E5623830E44cE1E37Fb9830dD412', // BSC test net
  56: '0xC9AA9aa98563c2f1AA66804E1EFa0f07A807321C', // BSC main net
  256: '0xCee23c02B819e4B9b6E34753e3c0C7f21c4bC398', // HECO test net
  10000: '0x1336001CBdb94C5cf95ee93F2dC3CA99Db382Ff4',// smartBCH main net
  568: '0x290B5c5587B78C9bf3d9e5D7f1703749037CbE22',//DOGE test
  2000: '0x403bc08DdE4272b91D31155E6905575dd3c1f283',//DOGE main net
};

const providers = {
  97: 'https://bsctestapi.terminet.io/rpc', // BSC test net
  56: 'https://bsc-dataseed1.ninicoin.io', // BSC main net
  42: 'https://kovan.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161', // ETH KOVAN test net
  1: 'https://rpc.ankr.com/eth', // ETH main net
  5: 'https://goerli.infura.io/v3/680f44b87fb44b4d93ae840a276a4d23', // Goerli test net
  256: 'https://http-testnet.hecochain.com', //HECO test
  //10000: 'https://smartbch.fountainhead.cash/mainnet', //smartBCH mainnet
  10000: 'https://global.uat.cash', //smartBCH mainnet
  568: 'https://rpc-testnet.dogechain.dog',//DOGE test
  2000: 'https://rpc.dogechain.dog',//DOGE mainnet
};

const deposit_event_abi = [
  { type: 'address', name: 'token', internalType: 'address', indexed: true },
  { type: 'address', name: 'sender', internalType: 'address', indexed: true },
  { type: 'uint256', name: 'value', internalType: 'uint256', indexed: false },
  { type: 'uint256', name: 'toChainId', internalType: 'uint256', indexed: false },
  { type: 'address', name: 'toToken', internalType: 'address', indexed: false }
];

// call this function to get authorization signature
// params: txId = deposit transaction hash, fromChainId = chain ID where transaction was sent.
// returns: on success {isSuccess: true, message: sig.signature};
// on error: {isSuccess: false, message: error_message};
async function authorize(txId, fromChainId) {
  const provider = providers[fromChainId];
  const bridgeContract = bridgeContracts[fromChainId];
  if (!bridgeContract) {
    const msg = `No bridgeContract for chain ID: ${fromChainId}`;
    logger.error(msg);
    return { isSuccess: false, message: msg };
  }
  if (!provider) {
    const msg = `No provider for chain ID: ${fromChainId}`;
    logger.error(msg);
    return { isSuccess: false, message: msg };
  }
  const web3 = new Web3(provider);
  const lastBlock = await web3.eth.getBlockNumber();

  return web3.eth
    .getTransactionReceipt(txId)
    .then(receipt => {
      if (receipt && receipt.status) {
        if (lastBlock - receipt.blockNumber < blockConfirmations[fromChainId]) {
          const msg = `Confirming: ${lastBlock - receipt.blockNumber} of ${blockConfirmations[fromChainId]}`;
          return { isSuccess: false, message: msg };
        }

        for (let i = 0; i < receipt.logs.length; i++) {
          const element = receipt.logs[i];
          if (
            element.topics[0] == '0xf5dd9317b9e63ac316ce44acc85f670b54b339cfa3e9076e1dd55065b922314b' &&
            element.address == bridgeContract &&
            element.transactionHash == txId
          ) {
            element.topics.shift(); // remove
            const p = web3.eth.abi.decodeLog(deposit_event_abi, element.data, element.topics);
            const messageHash = web3.utils.soliditySha3(p.toToken, p.sender, p.value, txId, fromChainId, p.toChainId);
            sig = web3.eth.accounts.sign(messageHash, web3.eth.accounts.decrypt(keyStore, PW).privateKey);
            const ret = {
              isSuccess: true,
              signature: sig.signature,
              token: p.toToken,
              value: p.value,
              to: p.sender,
              chainId: p.toChainId,
              bridge: bridgeContracts[p.toChainId]
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
