import { ethers } from 'ethers';
import lodash from 'lodash';
import { round } from 'mathjs';
import fs from 'fs';
import { configDotenv } from 'dotenv';
import { chainIDList, backTokenToNative } from './main.mjs';
configDotenv({ path: './data.env' });
const rpcList = process.env.allRpc.split(',');

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

export async function makeAmount(balance, contract) {
    let finalAmount;
    const tokenAddress = await contract.getAddress();
    console.log(tokenAddress)
    const percentage = round(lodash.random(0.02, 0.99), 2);
    const balcWithPrcnt = BigInt(lodash.floor(balance*percentage));
    if (tokenAddress == ethers.ZeroAddress || tokenAddress == '0x4300000000000000000000000000000000000004') {
        finalAmount = Number(balcWithPrcnt)/10**18;
        if (finalAmount < 0.0075) {
            return 0;
        } else {
            return balcWithPrcnt;
        }
    } else {
        const decimals = await contract.decimals();
        if (tokenAddress == '0x4300000000000000000000000000000000000003') {
            finalAmount = Number(balcWithPrcnt)/10**Number(decimals);
            if (finalAmount < 24.2718446602) {
                return 0;
            } else {
                return balcWithPrcnt;
            }
        }
    }
}

async function backAllTokenToNative() {
    let privateKeyList = [];
    const fPKL = fs.readFileSync('./walletsForWork.txt', 'utf-8')
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
    fs.readFileSync('./readyWallets.txt', 'utf-8').split('\n')
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
            fs.writeFileSync('./readyWallets.txt', data);
            /*walletsAndReturnsNew.forEach((pairSolid) => {
                fs.writeFileSync('./readyWallets.txt', pairSolid+'\n', {flag:'a'});
            });*/
            walletsAndReturnsOld = [];
            walletsAndReturnsNew = [];
            fs.readFileSync('./readyWallets.txt', 'utf-8').split('\n')
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
        let backingRes = await backTokenToNative('polygon', provider, wallet);
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

await backAllTokenToNative();