import { ethers } from 'ethers';
import lodash from 'lodash';
import fs from 'fs';
import { configDotenv } from 'dotenv';
configDotenv({ path: './data.env' });
import { getNativeTokenBalance, makeAmount, chainIDList, waitDelay, backTokenToNative, abi } from './supportFunc.mjs'
const rpcList = process.env.allRpc.split(',');

async function start() {
    const iteractionAmount = 9000; //Transaction amount
    let privateKeyList = [];
    const fPKL = fs.readFileSync('./auxiliaryFiles/walletsForWork.txt', 'utf-8')
                                            .split('\n')
    fPKL.forEach((value) => {
        // console.log(value.split(','))
        if (value.split(',').length == 2) {
            if (value.split(',')[1].length >= 64) {
                if (privateKeyList.includes(value.split(',')[1])) {
                    console.log('Duplicate!');
                } else {
                    privateKeyList.push(value.split(',')[1])
                }
            }
        } else if (value.split(',').length == 1) {
            if (value.split(',')[0].length >= 64) {
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

        const walletStatData = fs.readFileSync('./auxiliaryFiles/walletsStatus.txt', 'utf-8')
                                                .split('\n')
                                                .map(value => value.split(':'))
        const walletsInWork = walletStatData.map(value => value[0]);
        let checkWalletStatus = 0;
        if (walletsInWork.includes(wallet.address)) {
            for (let i = 0; i<walletsInWork.length; i++) {
                if (walletStatData[i][0] == wallet.address) {
                    if (Number(walletStatData[i][4]) == 1) {
                        checkWalletStatus = 1;
                        break;
                    }
                }
            }
        }
        if (checkWalletStatus == 1) {
            console.log(`Wallet ${wallet.address} also ready!`);
            continue;
        }
        let unplannedTx = 0;
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
            if (nativeTokenBalance <= 0.0012683*10**18) {
                await backTokenToNative('blast', provider, wallet);
                unplannedTx=1;
            }   else if (balance < tokenAmount) {
                    i--;
                    console.log('Influence balance | Iterection skipped');
                    continue;
            }  else if ((await tokenContract.getAddress()) == ethers.ZeroAddress) {
                    if (nativeTokenBalance-Number(tokenAmount)<=0.00047608*10**18) {
                        console.log('Native token limit reached | Iterection skipped');
                    i--;
                    continue;
                    }
            }
        }

        const amountOfSwaps = 5;
        
        let counter = unplannedTx;
        let revCounter = unplannedTx;
        let backToNative = 0;
        let walletStatus = 0;
        let data = '';
        let backRes = 0;
        if (walletsInWork.includes(wallet.address)) {
            for (let i = 0;i<walletStatData.length;i++) {
                if (walletStatData[i][0] == wallet.address) {
                    if (Number(walletStatData[i][4]) == 1) {
                        console.log('Wallet ready!');
                        continue;
                    } else if (Number(walletStatData[i][2]) == 1) {
                        backRes = await backTokenToNative(chain, provider, wallet);
                        if (backRes == 3) {
                            walletStatus = 1;
                        }
                        console.log('Backing done!');
                        backToNative=1
                    } else if (Number(walletStatData[i][1]) == 0) {
                        await waitDelay(timeDelay, swapParametrs, wallet, provider);
                        console.log('Swap done!');
                        counter++;
                    } else if (Number(walletStatData[i][1])%amountOfSwaps == 0) {
                        backToNative = 1;
                    } else {
                        await waitDelay(timeDelay, swapParametrs, wallet, provider);
                        console.log('Swap done!');
                        counter=Number(walletStatData[i][1])+1;
                    }
                } else {
                    continue;
                }
            }
            data = `${wallet.address}:${counter}:${backToNative}:${revCounter}:${walletStatus}`;
        } else {
            await waitDelay(timeDelay, swapParametrs, wallet, provider);
            data = `${wallet.address}:${1}:${backToNative}:${revCounter}:${walletStatus}`;
        }

        let dataToWrite = ''
        let solidWalletsStatusList = fs.readFileSync('./auxiliaryFiles/walletsStatus.txt', 'utf-8').split('\n');
        if (solidWalletsStatusList.length == 0) {
            dataToWrite = data;
        } else {
            let lineNum = -1;
            for (let i = 0; i < solidWalletsStatusList.length; i++) {
                if (solidWalletsStatusList[i].includes(wallet.address)) {
                    lineNum = i;
                    break;
                }
            }
            if (lineNum !== -1) {
                solidWalletsStatusList[lineNum] = data;
            } else {
                solidWalletsStatusList.push(data)
            }
            dataToWrite = solidWalletsStatusList.join('\n');
        }
        
        fs.writeFileSync('./auxiliaryFiles/walletsStatus.txt', dataToWrite, 'utf-8')
    }
};

//start();