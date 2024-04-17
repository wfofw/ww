import { ethers } from 'ethers';
import lodash from 'lodash';
import { round } from 'mathjs';
import fs from 'fs';
import { configDotenv } from 'dotenv';
configDotenv({ path: './data.env' });
import { bebopSwap } from './exchanges/bebop/bebopMain.mjs';
import { relaySwap } from './exchanges/relay/relayMain.mjs';
import { lifiSwap } from './exchanges/lifi/lifiMain.mjs';

const rpcList = process.env.allRpc.split(',');

export const chainIDList = {
    polygon: {
        id: 137,
        tokens: {
            USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
            //USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
            USDCe: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
            MATIC: ethers.ZeroAddress,
            WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
            //UNI: '0xb33EaAd8d922B1083446DC23f610c2567fB5180f',
            //FRAX: '0x45c32fA6DF82ead1e2EF74d17b76547EDdFaFF89',
        },
        native: {
            symbol: 'MATIC',
            address: ethers.ZeroAddress,
        },
        wrapped: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
        bebop: {
            native:'0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        },
    },
    optimism: {
        id: 10,
        tokens: {
            ETH: ethers.ZeroAddress,
        },
        native: {
            symbol: 'ETH',
            address: ethers.ZeroAddress,
        },
        wrapped: '0x4200000000000000000000000000000000000006'
    },
    blast: {
        id: 81457,
        tokens: {
            USDB: '0x4300000000000000000000000000000000000003',
            ETH: ethers.ZeroAddress,
            WETH: '0x4300000000000000000000000000000000000004'
        },
        native: {
            symbol: 'ETH',
            address: ethers.ZeroAddress,
        },
        wrapped: '0x4300000000000000000000000000000000000004',
    },
    avalanche: {
        id: 43114,
        tokens: {
            AVAX: ethers.ZeroAddress,
            USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
            USDCe: '0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664',
            USDTe: '0xc7198437980c041c805A1EDcbA50c1Ce5db95118',
        },
        native: {
            symbol: 'AVAX',
            address: ethers.ZeroAddress,
        }
    },
}

export const abi = [
    'function balanceOf(address) view returns (uint)',
    'function decimals() view returns (uint)',
    'function symbol() view returns (string)',
    'function approve(address, uint256) returns (bool)',
    'function allowance(address, address) view returns (uint)',
]

export async function writeError(errorStack) {
    fs.appendFile('./auxiliaryFiles/error.log', errorStack+'\n', (err) => {
        if (err) {
            console.error('Failed to write error to file');
        } else {
            console.log('Error successfuly write to file');
        }
    })
}

export async function waitForConfirm(hash, provider) {
    const currentBlockNum = await provider.getBlockNumber();
    let waitForCreation = true;
    let waitForInclude = true;
    let waitForConfirmation = true;
    try {
        while(waitForCreation) {
        let blockNum = await provider.getBlockNumber();
        console.log('Start:', currentBlockNum, '----blockNum:', blockNum);
        if ((blockNum-currentBlockNum)>=100) {
            console.log('to much blocks without tx')
            return 0;
        }
        let res = await provider.getTransaction(hash);
        if (res != null) {
            waitForCreation = false;
        }
        console.log('Tx data:', res);
        };

        while(waitForInclude) {
            let receipt = await provider.getTransactionReceipt(hash);
            console.log('waitForInclude', receipt);
            if (receipt != null) {
                while(waitForConfirmation) {
                    let receipt = await provider.getTransactionReceipt(hash);
                    if (receipt == null) {
                        continue;
                    }
                    let confirmations = await receipt.confirmations();
                    console.log(confirmations);
                    if (confirmations >= 23) {
                        waitForConfirmation = false;
                        waitForInclude = false;
                        return 1;
                    }
                }
            }
        }
    } catch(error) {
        await writeError(error.stack);
    }
}

export async function checkForAllowance(wallet, tokenAddress, approvalAddress, amount, provider) {
    const contract = new ethers.Contract(tokenAddress, abi, wallet);
    const allowance = await contract.allowance(await wallet.getAddress(), approvalAddress);

    if (Number(allowance) < Number(amount)) {
        console.log('Making approve...');
        try {
            console.log('Address for approve:', approvalAddress, '\nToken address:', tokenAddress, '\nAmount to approve:', BigInt(amount), '\nGas price:', Number((await provider.getFeeData()).maxFeePerGas)/10**9)
            const approveTx = await contract.approve(approvalAddress, BigInt(amount), {gasPrice: BigInt(lodash.floor(Number((await provider.getFeeData()).maxFeePerGas)*1.1))});
            console.log(`Waiting for approve...\n${await approveTx.hash}`);
            let confirmRes = await waitForConfirm(approveTx.hash, provider);
            if (confirmRes == 0) {
                console.log('Tx doesn`t exist');
                return 0;
            } else if (confirmRes == 1) {
                console.log('Tx done!');
            } else {
                console.log('Unexpected error');
                return 2;
            }
            console.log('Approve Done!');
        } catch(error) {
            writeError(error.stack);
        }
    } else {
        console.log('Approve unnecessary');
    }
}

export async function getNativeTokenBalance(tokenContract, tokenAddress, provider, address) {
    if (tokenAddress == ethers.ZeroAddress) {
        const balance = await provider.getBalance(address);
        //console.log(balance);
        return BigInt(balance);
    } else {
        const balance = await tokenContract.balanceOf(address);
        //console.log(tokenAddress,' has ', balance);
        return BigInt(balance);
    }
}

export async function waitDelay(ms, parametrs, wallet, provider) {
    console.log(`------|Swap started|------`,`\nFrom: ${parametrs.fromToken}\nTo: ${parametrs.toToken}`);
    console.log('Waiting for time delay..', round(ms/1000), 'second');
    return new Promise(resolve => {
        setTimeout(async () => {
            const swapRes = await bebopSwap(parametrs, wallet, provider);
            console.log('------|Swap finished!|------');
            resolve(swapRes);
        }, ms);
    });
}

export function addParametrs(path, parametrs) {
    if (Object.keys(parametrs).length > 0) {
        const queryParams = new URLSearchParams(parametrs);
        path = path+'?'+queryParams;
    };
    return path;
}

export async function backTokenToNative(chain, provider, wallet) {
    console.log('Backing..')
    const timeDelay = lodash.random(60000, 120000);

    const fromChain = chainIDList[chain].id;
    const toChain = fromChain;

    const fromTokensList = Object.keys(chainIDList[chain].tokens).filter(item => item != /*'USDB'*/chainIDList[chain].native.symbol);

    const toToken = chainIDList[chain].native.symbol/*tokens['USDB']*/;

    let initialfromTokenValue;
    let finalFromTokenValue;
    let initialtokenContract;
    let finalTokenContract;
    let tokenAmount;
    let maxAmount = BigInt(0);
    for (let tokenKey of fromTokensList) {
        initialfromTokenValue = chainIDList[chain].tokens[tokenKey];
        initialtokenContract = new ethers.Contract(initialfromTokenValue, abi, provider);
        if (await initialtokenContract.getAddress() == ethers.ZeroAddress) {
            tokenAmount = BigInt(Number(await provider.getBalance(wallet.address)) - 0.00096342*10**18);
        } else {
            tokenAmount = await initialtokenContract.balanceOf(wallet.address);
        }
        if (tokenAmount > maxAmount) {
            maxAmount = tokenAmount;
            finalTokenContract = initialtokenContract;
            finalFromTokenValue = initialfromTokenValue;
        }
    }
    const amount = maxAmount;
    const swapParametrs = {
        amount: amount,
        fromChain: {
            'chainId': fromChain,
            'chainName': chain,
        },
        toChain: {
            'chainId': toChain,
            'chainName': chain,
        },
        fromToken: finalFromTokenValue,
        toToken: toToken,
        tokenContract: finalTokenContract
    };
    if (swapParametrs.fromToken == undefined) {
        console.log('All token transfered to native!');
        return 3;
    }
    await waitDelay(timeDelay, swapParametrs, wallet, provider);
    console.log('Native token successfully refueled!\n');
    return 1;
}

export async function makeAmount(balance, contract) {
    let finalAmount;
    const tokenAddress = await contract.getAddress();
    const percentage = round(lodash.random(0.02, 0.99), 2);
    const balcWithPrcnt = BigInt(lodash.floor(balance*percentage));
    if (tokenAddress == ethers.ZeroAddress || tokenAddress == '0x4300000000000000000000000000000000000004') {
        finalAmount = Number(balcWithPrcnt)/10**18;
        if (balance < 0.0094885*10**18) {
            return 0;
        }
        if (finalAmount < 0.0094885) {
            return makeAmount(balance, contract);
        } else {
            return balcWithPrcnt;
        }
    } else {
        const decimals = await contract.decimals();
        if (tokenAddress == '0x4300000000000000000000000000000000000003') {
            if (balance < 24.2718446602*10**Number(decimals)) {
                return 0
            }
            finalAmount = Number(balcWithPrcnt)/10**Number(decimals);
            if (finalAmount < 24.2718446602) {
                return makeAmount(balance, contract);
            } else {
                return balcWithPrcnt;
            }
        }
    }
}

async function backAllTokenToNative() {
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
    const chain = lodash.sample(rpcList);
    const rpc = process.env[chain];
    const provider = new ethers.JsonRpcProvider(rpc);
    let walletsAndReturnsOld = [];
    let walletsAndReturnsNew = [];
    fs.readFileSync('./auxiliaryFiles/readyWallets.txt', 'utf-8').split('\n')
                                                .forEach((pair) => {
                                                    walletsAndReturnsOld.push(pair.split(':'))
                                                });
    let walletsList = walletsAndReturnsOld.map(pairList => pairList[0]);
    let counter = 0-privateKeyList.length;
    let readyWalletsCounter = 0;
    for (let i = 0; i < privateKeyList.length*(Object.keys(chainIDList[chain].tokens).length-1); i++) {
        if (readyWalletsCounter == privateKeyList.length) {
            console.log('All wallets ready!');
            break;
        }
        if (i%(privateKeyList.length) == 0) {
            counter += privateKeyList.length;
            //fs.writeFileSync('./readyWallets.txt', '');
            let data = walletsAndReturnsNew.join('\n');
            fs.writeFileSync('./auxiliaryFiles/readyWallets.txt', data);
            /*walletsAndReturnsNew.forEach((pairSolid) => {
                fs.writeFileSync('./readyWallets.txt', pairSolid+'\n', {flag:'a'});
            });*/
            walletsAndReturnsOld = [];
            walletsAndReturnsNew = [];
            fs.readFileSync('./auxiliaryFiles/readyWallets.txt', 'utf-8').split('\n')
                                                .forEach((pair) => {
                                                    walletsAndReturnsOld.push(pair.split(':'))
                                                });
            walletsList = walletsAndReturnsOld.map(pairList => pairList[0]);
        }
        const wallet = new ethers.Wallet(privateKeyList[i-counter], provider);
        console.log('-------------------------------------------------------');
        console.log('Wallet:', wallet.address);
        let iterSkip = 0;
        walletsAndReturnsOld.forEach((pair) => {
            if (pair[0] == wallet.address) {
                if (pair[1] == 'allDone') {
                    console.log('Wallet also ready');
                    readyWalletsCounter++;
                    iterSkip = 1;
                }
            }
        })
        if (iterSkip == 1) {
            continue;
        }
        readyWalletsCounter = 0
        let backingRes = await backTokenToNative('blast', provider, wallet);
        // let backingRes = 1;
        if (backingRes == 1) {
            // console.log(walletsList);process.exit()
            if (walletsList.includes(wallet.address)) {
                walletsAndReturnsOld.forEach((pair) => {
                    if (pair[0] == wallet.address) {
                        if (Number(pair[1]) < (Object.keys(chainIDList[chain].tokens)).length-1) {
                            walletsAndReturnsNew.push(`${wallet.address}:${Number(pair[1])+1}`);
                        } else if (Number(pair[1])+1 >= (Object.keys(chainIDList[chain].tokens)).length-1) {
                            walletsAndReturnsNew.push(`${wallet.address}:allDone`);
                        } else {
                            console.log(`All token returned to native!\nWallet ready:${wallet.address}`);
                        }
                    }
                })
            } else {
                walletsAndReturnsNew.push(`${wallet.address}:${1}`);
            }
        } else if (backingRes == 3) {
                walletsAndReturnsNew.push(`${wallet.address}:allDone`);
                console.log('All token returned to native!\nWallet ready!');
        }
    }
}

backAllTokenToNative();