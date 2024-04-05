import { ethers } from 'ethers';
import { configDotenv } from 'dotenv';
configDotenv({ path: './data.env' });
import lodash from 'lodash';
import axios from 'axios';
import { round } from 'mathjs';
import fs from 'fs';
import { getNativeTokenBalance, makeAmount } from './supportFunc.mjs'
const rpcList = process.env.allRpc.split(',');

const RFQ_PARAM_TYPES = {
    Aggregate: [
        {name: "expiry", type: "uint256"},
        {name: "taker_address", type: "address"},
        {name: "maker_addresses", type: "address[]"},
        {name: "maker_nonces", type: "uint256[]"},
        {name: "taker_tokens", type: "address[][]"},
        {name: "maker_tokens", type: "address[][]"},
        {name: "taker_amounts", type: "uint256[][]"},
        {name: "maker_amounts", type: "uint256[][]"},
        {name: "receiver", type: "address"},
        {name: "commands", type: "bytes"}
    ]
}

export const chainIDList = {
    'polygon': {
        'id': 137,
        'tokens': {
            'USDT': '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
            //'USDC': '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
            'USDCe': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
            'MATIC': '0x0000000000000000000000000000000000000000',
            'WMATIC': '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
            //'UNI': '0xb33EaAd8d922B1083446DC23f610c2567fB5180f',
            //'FRAX': '0x45c32fA6DF82ead1e2EF74d17b76547EDdFaFF89',
        },
        'native': {
            'symbol': 'MATIC',
            'address': '0x0000000000000000000000000000000000000000',
        },
        'wrapped': '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
        'bebop': {
            'native':'0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        },
    },
    /*'arbitrum': {
        'id': 42161,
        'tokens': {},
    },
    'bsc': {
        'id': 56,
        'tokens': {},
    },*/
    'avalanche': {
        'id': 43114,
        'tokens': {
            'AVAX': '0x0000000000000000000000000000000000000000',
            'USDC': '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
            'USDCe': '0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664',
            'USDTe': '0xc7198437980c041c805A1EDcbA50c1Ce5db95118',
        },
        'native': {
            'symbol': 'AVAX',
            'address': '0x0000000000000000000000000000000000000000',
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

async function writeError(errorStack) {
    fs.appendFile('./error.log', errorStack+'\n', (err) => {
        if (err) {
            console.error('Failed to write error to file');
        } else {
            console.log('Error successfuly write to file');
        }
    })
}

async function waitForConfirm(hash, provider) {
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

async function checkForAllowance(wallet, tokenAddress, approvalAddress, amount, provider) {
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

async function backTokenToNative(chain, provider, wallet) {
    console.log('Backing..')
    const timeDelay = lodash.random(60000, 120000);

    const fromChain = chainIDList[chain].id;
    const toChain = fromChain;

    const fromTokensList = Object.keys(chainIDList[chain].tokens).filter(item => item != chainIDList[chain].native.symbol);

    const toToken = chainIDList[chain].native.address;

    let initialfromTokenValue;
    let finalFromTokenValue;
    let initialtokenContract;
    let finalTokenContract;
    let tokenAmount;
    let maxAmount = BigInt(0);
    for (let tokenKey of fromTokensList) {
        initialfromTokenValue = chainIDList[chain].tokens[tokenKey];
        initialtokenContract = new ethers.Contract(initialfromTokenValue, abi, provider);
        tokenAmount = await initialtokenContract.balanceOf(wallet.address);
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
    await waitDelayBebop(timeDelay, swapParametrs, wallet, provider, true);
    console.log('Native token successfully recharge!\n');
}

async function bebopSwap(tokenAmount, chain, fromToken, toToken, contract, wallet, provider, back) {
    const rfqApprovalAddress = '0xBeB09000fa59627dc02Bb55448AC1893EAa501A5';
    const jamApprovalAddress = '0xfE96910cF84318d1B8a5e2a6962774711467C0be'

    const RFQ_PARAM_DOMAIN = {
        name: "BebopSettlement",
        version: "1",
        chainId: chainIDList[chain].id,
        verifyingContract: rfqApprovalAddress,
    }

    const JAM_PARAM_DOMAIN = {
        name: "JamSettlement",
        version: "1",
        chainId: chainIDList[chain].id,
        verifyingContract: jamApprovalAddress,
    };

    console.log('Bebop Swap Started..')
    try {
        const wrappedAddress = chainIDList[chain].wrapped;
        const abiWrap = [
            'function deposit() public payable',
            'function withdraw(uint) public',
            'function balanceOf(address) view returns (uint)',
        ];
        const wrappedContract = new ethers.Contract(wrappedAddress, abiWrap, wallet);

        if (fromToken == ethers.ZeroAddress) {
            if (toToken == wrappedAddress) {
                let tx = await wrappedContract.deposit({value: tokenAmount});
                console.log('Tx:', tx, '\тHash:', tx.hash, '\nWait for confirmations..');
                let confirmRes = await waitForConfirm(tx.hash, provider);
                console.log('Done!');
                return 1;
            }
            
        } else if (fromToken == wrappedAddress) {
            if (toToken == ethers.ZeroAddress) {
                let tx = await wrappedContract.withdraw(tokenAmount);
                console.log('Wait for confirmations..');
                console.log('Hash:', tx.hash, '\nWait for confirmations..');
                let confirmRes = await waitForConfirm(tx.hash, provider);
                console.log('Done!');
                return 1;
            }
        }
        if (fromToken == ethers.ZeroAddress) {
            if (await wrappedContract.balanceOf(wallet.address) >= tokenAmount) {
                console.log('Wrap is unnecessary');
            } else {
                console.log('Wrap started..');
                let tx = await wrappedContract.deposit({value: tokenAmount});
                console.log('Hash:', tx.hash, '\nWait for confirmations..');
                let confirmRes = await waitForConfirm(tx.hash, provider);
                console.log('Wrap end!');
            }
            fromToken = wrappedAddress;
        } else if (toToken == ethers.ZeroAddress) {
            toToken = chainIDList[chain].bebop.native;
        }

        console.log('Checking Approve..');
        let allowanceResult = await checkForAllowance(wallet, fromToken, rfqApprovalAddress, tokenAmount, provider);
        if (allowanceResult == 0) {
            console.log('Approve failed');
            return 0;
        } else if (allowanceResult == 2) {
            return 2;
        }

        console.log('Getting quote..');
        
        let rfqQuote = (await axios.get(`https://api.bebop.xyz/${chain}/v2/quote`, {
                params: {
                    buy_tokens: String(toToken),
                    sell_tokens: String(fromToken),
                    sell_amounts: String(tokenAmount),
                    taker_address: wallet.address,
                }
            })).data;

        if (rfqQuote.hasOwnProperty('error')) {
            await writeError(rfqQuote.error.errorCode+'\n'+rfqQuote.error.message);
            return 2
        } else if (rfqQuote.hasOwnProperty('toSign')) {
            console.log('All good');
        }

        console.log('Tx signning..');
        let signature = await wallet.signTypedData(RFQ_PARAM_DOMAIN, RFQ_PARAM_TYPES, rfqQuote.toSign);
        console.log('Tx sign success!');
        let response = (await axios.post(`https://api.bebop.xyz/${chain}/v2/order`, {
            signature: signature,
            quote_id: rfqQuote.quoteId,
            }, {
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                },
                withCredentials: true
            })).data
        if (response.hasOwnProperty('error')) {
            await writeError(response.error.errorCode+'\n'+response.error.message);
            return 2;
        }
        console.log('Response done, waiting for confirmation')
        console.log(response);

        if (toToken == wrappedAddress) {
            let txUnwrap = await wrappedContract.withdraw(tokenAmount);
            let confirmRes = await waitForConfirm(txUnwrap.hash, provider);
        };
        console.log('Done!');
        return 1;
    } catch(error) {
        console.log('FAIL\n', error);
        return 0;
    }
}

async function lifiSwap(tokenAmount, fromChain, toChain, fromToken, toToken, tokenContract, wallet, provider) {
    console.log('Swapping..');

    const slippage = 0.01 //equal 1%

    const fromAmount = tokenAmount;
          
    console.log('Getting quote..');
    const getQuote = async (fromChain, toChain, fromToken, toToken, fromAmount, fromAddress, slippage) => {
        const result = await axios.get('https://li.quest/v1/quote', {
            params: {
                fromChain,
                toChain,
                fromToken,
                toToken,
                fromAmount,
                fromAddress,
                slippage,
            }
        });
        return result.data;
    }

    const approvalAddress = '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE';

    const quote = await getQuote(fromChain, toChain, fromToken, toToken, fromAmount, wallet.address, slippage);
    if (fromToken != ethers.ZeroAddress) {
        console.log('Checking allowance..');
        await checkForAllowance(wallet, quote.action.fromToken.address, quote.estimate.approvalAddress, fromAmount, provider);
        console.log('Allowance done!');
    }

    console.log('Sending tx..\nGas Limit:', ethers.toNumber(quote.transactionRequest.gasLimit), 'gwei', '\nGas Price:', ethers.toNumber(quote.transactionRequest.gasPrice)/10**9);
    
    try {
        const tx = await wallet.sendTransaction(quote.transactionRequest);
        console.log(tx.hash)
        await tx.wait(3);
    } catch (error) {
        await writeError(error.stack);
    }

    //console.log('Getting status..')
    /*const getStatus = async (bridge, fromChain, toChain, txHash) => {
        const result = await axios.get('https://li.quest/v1/status', {
            params: {
                bridge,
                fromChain,
                toChain,
                txHash,
            }
        });
        return result.data;
    }
    const status = await getStatus(quote.tool, fromChain, toChain, tx.hash);*/
    console.log('DONE');
}

async function start() {
    const iteractionAmount = 50; //Transaction amount
    let txCounter = 0;
    for (let i = 0; i != iteractionAmount; i++) {
        const chain = lodash.sample(rpcList);
        const rpc = process.env[chain];
        const provider = new ethers.JsonRpcProvider(rpc);
        let privateKeyList = [];
        const fPKL = fs.readFileSync('./walletsForWork.env', 'utf-8')
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

        const tokenAmount = await makeAmount(Number(balance));

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
            toToken: toTokenValue,
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
        }

        await waitDelayBebop(timeDelay, swapParametrs, wallet, provider, false).then(() => {
            console.log('NEXT');
            txCounter++;
        });
    }
    console.log(txCounter);;
};

async function waitDelayLiFi(ms, parametrs, wallet) {
    console.log(`-${parametrs.fromChain}-|Swap started|------`,`\nFrom: ${parametrs.fromToken}\nTo: ${parametrs.toToken}`);
    console.log('Waiting for time delay..', round(ms/1000), 'second');
    return new Promise(resolve => {
        setTimeout(async () => {
            await (
                lifiSwap(parametrs.amount, parametrs.fromChain.chaidId, parametrs.toChain.chaidId,
                    parametrs.fromToken, parametrs.toToken, parametrs.tokenContract, wallet, provider)
            );
            resolve();
        }, ms);
    }).then(() => {
        console.log('------|Swap finished!|------');
    });
}

async function waitDelayBebop(ms, parametrs, wallet, provider, backingData) {
    console.log(`------|Swap started|------`,`\nFrom: ${parametrs.fromToken}\nTo: ${parametrs.toToken}`);
    console.log('Waiting for time delay..', round(ms/1000), 'second');
    return new Promise(resolve => {
        setTimeout(async () => {
            await (
                bebopSwap(parametrs.amount, parametrs.fromChain.chainName,
                    parametrs.fromToken, parametrs.toToken, parametrs.tokenContract, wallet, provider, backingData)
            );
            resolve();
        }, ms);
    }).then(() => {
        console.log('------|Swap finished!|------');
    });
}

await start();