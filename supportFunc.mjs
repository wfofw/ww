import { ethers } from 'ethers';
import lodash from 'lodash';
import { round } from 'mathjs';

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