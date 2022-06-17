require('dotenv').config(); // if use .env file for enviroment variables
const process = require('process');
const fs = require('fs');
const Web3 = require('web3');
const KEY_STORE_FILE = '.keystore.json';

const password = process.env.PW;

const web3 = new Web3();

if (!password) {
  console.log('No password set');
  process.exit(0);
}

const fileExists = fs.existsSync(KEY_STORE_FILE);
if (fileExists) {
  const keyStore = require('./.keystore.json');
  const dAccount = web3.eth.accounts.decrypt(keyStore, password);
  console.log('Key store json exists -', dAccount.address);

  process.exit(0);
}

const account = web3.eth.accounts.create();
const keyStore = web3.eth.accounts.encrypt(account.privateKey, password);
const dAccount = web3.eth.accounts.decrypt(keyStore, password);

console.log(dAccount.address);

fs.writeFileSync(KEY_STORE_FILE, JSON.stringify(keyStore));
