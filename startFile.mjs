import { ethers } from 'ethers';
import lodash from 'lodash';
import fs from 'fs';
import { configDotenv } from 'dotenv';
configDotenv({ path: './data.env' });
import { getNativeTokenBalance, makeAmount, chainIDList, waitDelay, backTokenToNative } from './supportFunc.mjs'
const rpcList = process.env.allRpc.split(',');

export const abi = [
    'function balanceOf(address) view returns (uint)',
    'function decimals() view returns (uint)',
    'function symbol() view returns (string)',
    'function approve(address, uint256) returns (bool)',
    'function allowance(address, address) view returns (uint)',
]

async function start() {
    const iteractionAmount = 50; //Transaction amount
    let privateKeyList = [];
    const fPKL = fs.readFileSync('./auxiliaryFiles/walletsForWork.txt', 'utf-8')
                                            .split('\n')
    fPKL.forEach((value) => {
        // console.log(value.split(','))
        if (value.split(',').length == 2) {
            if (value.split(',')[1].length == 66) {
                if (privateKeyList.includes(value.split(',')[1])) {
                    console.log('Duplicate!');
                } else {
                    privateKeyList.push(value.split(',')[1])
                }
            }
        } else if (value.split(',').length == 1) {
            if (value.split(',')[0].length == 66) {
                if (privateKeyList.includes(value.split(',')[0])) {
                    console.log('Duplicate!');
                } else {
                    privateKeyList.push(value.split(',')[0])
                }
            }
        }
    })
    for (let i = 0; i != iteractionAmount; i++) {
        const chain = lodash.sample(rpcList);
        const rpc = process.env[chain];
        const provider = new ethers.JsonRpcProvider(rpc);
        const wallet = new ethers.Wallet(lodash.sample(privateKeyList), provider);
        let timeDelay = lodash.random(60000, 120000);
        const fromChain = chainIDList[chain].id;
        const toChain = fromChain;
        const fromTokensList = Object.keys(chainIDList[chain].tokens);
        const fromTokenKey = lodash.sample(fromTokensList);
        const fromTokenValue = chainIDList[chain].tokens[fromTokenKey];

        const toTokensList = fromTokensList.filter(item => item != fromTokenKey);
        const toTokenKey = lodash.sample(toTokensList);
        const toTokenValue = chainIDList[chain].tokens[toTokenKey];

        const tokenContract = new ethers.Contract(fromTokenValue, abi, provider);
        console.log('Chain:', chain);
        console.log('Wallet:', wallet.address)
        const balance = await getNativeTokenBalance(tokenContract, fromTokenValue, provider, wallet);
        const tokenAmount = await makeAmount(Number(balance), tokenContract);
        if (fromChain == chainIDList.blast.id) {
            if (tokenAmount == 0) {
                i--;
                console.log('Amount less then 25$ | Iterection skipped');
                continue;
            }
        }
        const swapParametrs = {
            amount: tokenAmount,
            fromChain: {
                'chaidId': fromChain,
                'chainName': chain,
            },
            toChain: {
                'chaidId': toChain,
                'chainName': chain,
            },
            fromToken: fromTokenValue,
            //fromTokenSymbol: chainIDList['optimism'].native.symbol,
            toToken: toTokenValue,
            //toTokenSymbol: chainIDList['blast'].native.symbol,
            tokenContract: tokenContract
        };

        const nativeTokenBalance = Number(await provider.getBalance(wallet.address));
        console.log('Amount:', tokenAmount, '\nNative:', nativeTokenBalance/10**18);
        if (tokenAmount == BigInt(0)) {
            i--;
            console.log('Token amount must be more than 0 | Iterection skipped');
            continue;
        }
        if (fromChain == chainIDList.polygon.id) {
            if (nativeTokenBalance <= 4*10**18) {
                await backTokenToNative('polygon', provider, wallet);
                i--;
                continue;
            }
            if (balance < tokenAmount) {
                i--;
                console.log('Influence balance | Iterection skipped');
                continue;
            } else if ((await tokenContract.getAddress()) == ethers.ZeroAddress) {
                if (nativeTokenBalance-Number(tokenAmount)<=4) {
                    console.log('Native token limit reached | Iterection skipped');
                i--;
                continue;
                }
            }
        } else if (fromChain == chainIDList.avalanche.id) {
            if (nativeTokenBalance <= 0.085*10**18) {
                await backTokenToNative('avalanche', provider, wallet);
                i--;
                continue;
            }   else if (balance < tokenAmount) {
                    i--;
                    console.log('Influence balance | Iterection skipped');
                    continue;
            }  else if ((await tokenContract.getAddress()) == ethers.ZeroAddress) {
                    if (nativeTokenBalance-Number(tokenAmount)<=0.085*10**18) {
                        console.log('Native token limit reached | Iterection skipped');
                    i--;
                    continue;
                    }
            }
        } else if (fromChain == chainIDList.blast.id) {
            if (nativeTokenBalance <= 0.001071*10**18) {
                await backTokenToNative('blast', provider, wallet);
                i--;
                continue;
            }   else if (balance < tokenAmount) {
                    i--;
                    console.log('Influence balance | Iterection skipped');
                    continue;
            }  else if ((await tokenContract.getAddress()) == ethers.ZeroAddress) {
                    if (nativeTokenBalance-Number(tokenAmount)<=0.001071*10**18) {
                        console.log('Native token limit reached | Iterection skipped');
                    i--;
                    continue;
                    }
            }
        }
        
        await waitDelay(timeDelay, swapParametrs, wallet, provider).then(() => {
            console.log('NEXT');
        });
    }
};

start()